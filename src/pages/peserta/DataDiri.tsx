import { IconCircleCheck, IconLock } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Field, PageHeader, dateID, useAct } from '../../components/ui'
import { getDistricts, getProvinces, getRegencies, saveProfile, useStore, type Area, type Result } from '../../lib/store'
import type { Profile } from '../../lib/types'
import { useMe } from './Peserta'

export const EDUCATION = ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2', 'Lainnya']

/** Pembayaran sudah dikonfirmasi tetapi data diri belum lengkap. */
export function useNeedsProfile() {
  const { me, regs, s } = useMe()
  const paid = regs.some((r) => r.status === 'active' || r.status === 'completed')
  const done = !!me.profileDone
  return { paid, done, needs: paid && !done, me, s }
}

export function LockedNotice() {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
      <div className="flex items-start gap-3"><IconLock className="mt-0.5 shrink-0 text-amber-700" /><div><p className="font-semibold">Ruang belajar terkunci</p><p className="text-sm text-muted">Pembayaran Anda sudah dikonfirmasi. Lengkapi data diri dulu agar jadwal, materi, dan tugas terbuka.</p></div></div>
      <Link to="/app/data-diri" className="btn-primary">Lengkapi data diri</Link>
    </div>
  )
}

/** Formulir data diri. Dipakai peserta (sebelum registrasi ulang) dan admin (kapan saja). */
export function ProfileForm({ user, profile, lockIdentity, submitLabel, onSubmit, onSaved, savedMessage }: {
  user: { name: string; phone: string; nik?: string; birthDate?: string }
  profile?: Profile
  lockIdentity: boolean
  submitLabel: string
  onSubmit: (fields: Record<string, string>) => Promise<Result>
  onSaved?: () => void
  savedMessage: string
}) {
  const act = useAct()
  const [f, setF] = useState({
    fullName: user.name, nik: profile?.nik ?? user.nik ?? '', birthPlace: profile?.birthPlace ?? '', birthDate: profile?.birthDate ?? user.birthDate ?? '', gender: profile?.gender ?? '',
    address: profile?.address ?? '', rt: profile?.rt ?? '', rw: profile?.rw ?? '', provinceId: profile?.provinceId ?? '', cityId: profile?.cityId ?? '', districtId: profile?.districtId ?? '', postalCode: profile?.postalCode ?? '',
    phone: user.phone, school: profile?.school ?? '', education: profile?.education ?? '', occupation: profile?.occupation ?? '',
  })
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value })
  const [provinces, setProvinces] = useState<Area[]>([])
  const [cities, setCities] = useState<Area[]>([])
  const [districts, setDistricts] = useState<Area[]>([])
  const [areaError, setAreaError] = useState(false)
  useEffect(() => { getProvinces().then(setProvinces).catch(() => setAreaError(true)) }, [])
  useEffect(() => { setCities([]); if (f.provinceId) getRegencies(f.provinceId).then(setCities).catch(() => setAreaError(true)) }, [f.provinceId])
  useEffect(() => { setDistricts([]); if (f.cityId) getDistricts(f.cityId).then(setDistricts).catch(() => setAreaError(true)) }, [f.cityId])
  const nikBad = f.nik !== '' && !/^\d{16}$/.test(f.nik)
  const submit = (e: FormEvent) => { e.preventDefault(); act(onSubmit(f), savedMessage, onSaved) }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">Identitas</h2>
        <div className="sm:col-span-2"><Field label="Nama lengkap sesuai KTP" hint="Nama ini dipakai di sertifikat."><input className="input" required value={f.fullName} onChange={set('fullName')} /></Field></div>
        <Field label="NIK" hint={nikBad ? 'NIK harus 16 digit angka.' : '16 digit sesuai KTP.'}><input className={`input font-mono ${nikBad ? '!border-red-500' : ''} read-only:bg-brand-50`} readOnly={lockIdentity && !!user.nik} required inputMode="numeric" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Jenis kelamin"><select className="input" required value={f.gender} onChange={set('gender')}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></Field>
        <Field label="Tempat lahir"><input className="input" required value={f.birthPlace} onChange={set('birthPlace')} /></Field>
        <Field label="Tanggal lahir"><input className="input read-only:bg-brand-50" type="date" required readOnly={lockIdentity && !!user.birthDate} value={f.birthDate} onChange={set('birthDate')} /></Field>
        <Field label="Nomor telepon aktif (WhatsApp)"><input className="input" type="tel" required value={f.phone} onChange={set('phone')} /></Field>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">Alamat</h2>
        {areaError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">Daftar wilayah gagal dimuat. Muat ulang halaman ini.</p>}
        <Field label="Provinsi">
          <select className="input" required value={f.provinceId} onChange={(e) => setF({ ...f, provinceId: e.target.value, cityId: '', districtId: '' })}>
            <option value="">{provinces.length ? 'Pilih provinsi' : 'Memuat…'}</option>
            {provinces.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Kota atau kabupaten">
          <select className="input" required disabled={!f.provinceId} value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value, districtId: '' })}>
            <option value="">{!f.provinceId ? 'Pilih provinsi dulu' : cities.length ? 'Pilih kota atau kabupaten' : 'Memuat…'}</option>
            {cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Kecamatan">
          <select className="input" required disabled={!f.cityId} value={f.districtId} onChange={set('districtId')}>
            <option value="">{!f.cityId ? 'Pilih kota atau kabupaten dulu' : districts.length ? 'Pilih kecamatan' : 'Memuat…'}</option>
            {districts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Kode pos"><input className="input" required inputMode="numeric" maxLength={5} value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value.replace(/\D/g, '') })} /></Field>
        <div className="sm:col-span-2"><Field label="Alamat jalan" hint="Nama jalan, nomor rumah, dan kelurahan atau desa."><input className="input" required maxLength={255} value={f.address} onChange={set('address')} /></Field></div>
        <Field label="RT"><input className="input" required inputMode="numeric" maxLength={3} value={f.rt} onChange={(e) => setF({ ...f, rt: e.target.value.replace(/\D/g, '') })} placeholder="001" /></Field>
        <Field label="RW"><input className="input" required inputMode="numeric" maxLength={3} value={f.rw} onChange={(e) => setF({ ...f, rw: e.target.value.replace(/\D/g, '') })} placeholder="002" /></Field>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">Pendidikan dan pekerjaan</h2>
        <Field label="Pendidikan terakhir"><select className="input" required value={f.education} onChange={set('education')}><option value="">Pilih</option>{EDUCATION.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Asal sekolah" hint="Tercantum di surat kelulusan."><input className="input" required value={f.school} onChange={set('school')} autoComplete="organization" /></Field>
        <Field label="Pekerjaan saat ini" hint="Tulis 'Belum bekerja' bila belum."><input className="input" required value={f.occupation} onChange={set('occupation')} /></Field>
      </section>

      <button className="btn-primary w-full sm:w-auto sm:px-10" disabled={nikBad}>{submitLabel}</button>
    </form>
  )
}

const L = (v?: string) => (v === 'L' ? 'Laki-laki' : v === 'P' ? 'Perempuan' : '-')

/** Tampilan baca saja setelah registrasi ulang. Perubahan hanya lewat admin. */
function LockedProfile() {
  const { me } = useMe()
  const p = useStore((s) => s.profiles.find((x) => x.userId === me.id))
  const rows: [string, string][] = [
    ['Nama lengkap', me.name], ['NIK', me.nik ?? p?.nik ?? ''], ['Tanggal lahir', me.birthDate ? dateID(me.birthDate) : ''], ['Tempat lahir', p?.birthPlace ?? ''], ['Jenis kelamin', L(p?.gender)], ['Telepon', me.phone],
    ['Pendidikan', p?.education ?? ''], ['Asal sekolah', p?.school ?? ''], ['Pekerjaan', p?.occupation ?? ''],
    ['Alamat', p ? `${p.address}, RT ${p.rt}/RW ${p.rw}` : ''], ['Kecamatan', p?.district ?? ''], ['Kota atau kabupaten', p?.city ?? ''], ['Provinsi', p?.province ?? ''], ['Kode pos', p?.postalCode ?? ''],
  ]
  return (
    <>
      <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
        <IconLock className="mt-0.5 shrink-0 text-brand-600" size={20} />
        <p><b>Data diri terkunci.</b> Setelah registrasi ulang, data diri tidak bisa diubah sendiri. Bila ada yang salah, hubungi admin pendaftaran.</p>
      </div>
      <dl className="card grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{v || '-'}</dd></div>)}
      </dl>
    </>
  )
}

export function DataDiri() {
  const { me, regs } = useMe()
  const profile = useStore((s) => s.profiles.find((p) => p.userId === me.id))
  const nav = useNavigate()
  const has = regs.some((r) => ['pending_payment', 'active', 'completed'].includes(r.status))
  const locked = regs.some((r) => r.stage === 'aktif')

  if (!has) {
    return (
      <>
        <PageHeader title="Data diri" />
        <div className="card p-6"><p className="font-semibold">Belum bisa diisi</p><p className="mt-1 text-sm text-muted">Formulir data diri terbuka setelah Anda melakukan registrasi pelatihan.</p><Link to="/daftar" className="btn-primary mt-4">Registrasi pelatihan</Link></div>
      </>
    )
  }
  if (locked) return <><PageHeader title="Data diri" /><LockedProfile /></>

  return (
    <>
      <PageHeader title="Data diri" sub={me.profileDone ? 'Data diri Anda sudah lengkap. Anda masih bisa memperbaruinya sampai registrasi ulang dikonfirmasi.' : 'Setelah lengkap, Anda diminta membayar biaya pendaftaran. Data dipakai untuk administrasi, surat kelulusan, dan sertifikat.'} />
      {me.profileDone && <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><IconCircleCheck size={18} />Data diri lengkap. <Link to="/app" className="underline">Lihat tahapan</Link></p>}
      <ProfileForm user={me} profile={profile} lockIdentity submitLabel={me.profileDone ? 'Perbarui data diri' : 'Simpan dan lanjut ke pembayaran'}
        onSubmit={saveProfile} savedMessage={me.profileDone ? 'Data diri diperbarui.' : 'Data diri tersimpan. Lanjut ke pembayaran pendaftaran.'} onSaved={() => { if (!me.profileDone) nav('/app') }} />
    </>
  )
}
