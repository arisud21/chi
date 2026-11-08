import { IconCircleCheck, IconLock } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field, PageHeader, useAct } from '../../components/ui'
import { getDistricts, getProvinces, getRegencies, saveProfile, useStore, type Area } from '../../lib/store'
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

export function DataDiri() {
  const { me, regs } = useMe()
  const profile = useStore((s) => s.profiles.find((p) => p.userId === me.id))
  const act = useAct()
  const paid = regs.some((r) => r.status === 'active' || r.status === 'completed')
  const [f, setF] = useState({
    fullName: me.name, nik: profile?.nik ?? '', birthPlace: profile?.birthPlace ?? '', birthDate: profile?.birthDate ?? '', gender: profile?.gender ?? '',
    address: profile?.address ?? '', rt: profile?.rt ?? '', rw: profile?.rw ?? '', provinceId: profile?.provinceId ?? '', cityId: profile?.cityId ?? '', districtId: profile?.districtId ?? '', postalCode: profile?.postalCode ?? '',
    phone: me.phone, education: profile?.education ?? '', occupation: profile?.occupation ?? '',
    emergencyName: profile?.emergencyName ?? '', emergencyRelation: profile?.emergencyRelation ?? '', emergencyPhone: profile?.emergencyPhone ?? '',
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [ktp, setKtp] = useState<File | null>(null)
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value })
  const [provinces, setProvinces] = useState<Area[]>([])
  const [cities, setCities] = useState<Area[]>([])
  const [districts, setDistricts] = useState<Area[]>([])
  const [areaError, setAreaError] = useState(false)
  useEffect(() => { getProvinces().then(setProvinces).catch(() => setAreaError(true)) }, [])
  useEffect(() => { setCities([]); if (f.provinceId) getRegencies(f.provinceId).then(setCities).catch(() => setAreaError(true)) }, [f.provinceId])
  useEffect(() => { setDistricts([]); if (f.cityId) getDistricts(f.cityId).then(setDistricts).catch(() => setAreaError(true)) }, [f.cityId])
  const nikBad = f.nik !== '' && !/^\d{16}$/.test(f.nik)

  if (!paid) {
    return (
      <>
        <PageHeader title="Data diri" />
        <div className="card p-6"><p className="font-semibold">Belum bisa diisi</p><p className="mt-1 text-sm text-muted">Formulir data diri terbuka setelah pembayaran Anda dikonfirmasi Admin Keuangan.</p><Link to="/app/pendaftaran" className="btn-primary mt-4">Cek status pembayaran</Link></div>
      </>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!profile?.photoFileId && !photo) return act(Promise.resolve({ ok: false, error: 'Unggah pas foto.' }), '')
    if (!profile?.ktpFileId && !ktp) return act(Promise.resolve({ ok: false, error: 'Unggah scan KTP.' }), '')
    act(saveProfile(f, photo, ktp), 'Data diri tersimpan. Ruang belajar terbuka.')
  }

  return (
    <>
      <PageHeader title="Data diri" sub={me.profileDone ? 'Data diri Anda sudah lengkap. Anda masih bisa memperbaruinya.' : 'Wajib dilengkapi sebelum kelas dimulai. Data dipakai untuk administrasi pelatihan dan sertifikat.'} />
      {me.profileDone && <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><IconCircleCheck size={18} />Data diri lengkap. <Link to="/app/belajar" className="underline">Buka ruang belajar</Link></p>}
      <form onSubmit={submit} className="space-y-5">
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">Identitas</h2>
          <div className="sm:col-span-2"><Field label="Nama lengkap sesuai KTP" hint="Nama ini dipakai di sertifikat."><input className="input" required value={f.fullName} onChange={set('fullName')} /></Field></div>
          <Field label="NIK" hint={nikBad ? 'NIK harus 16 digit angka.' : '16 digit sesuai KTP.'}><input className={`input font-mono ${nikBad ? '!border-red-500' : ''}`} required inputMode="numeric" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Jenis kelamin"><select className="input" required value={f.gender} onChange={set('gender')}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></Field>
          <Field label="Tempat lahir"><input className="input" required value={f.birthPlace} onChange={set('birthPlace')} /></Field>
          <Field label="Tanggal lahir"><input className="input" type="date" required value={f.birthDate} onChange={set('birthDate')} /></Field>
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
          <Field label="Pekerjaan saat ini" hint="Tulis 'Belum bekerja' bila belum."><input className="input" required value={f.occupation} onChange={set('occupation')} /></Field>
        </section>

        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">Kontak darurat</h2>
          <Field label="Nama"><input className="input" required value={f.emergencyName} onChange={set('emergencyName')} /></Field>
          <Field label="Hubungan"><input className="input" required value={f.emergencyRelation} onChange={set('emergencyRelation')} placeholder="Orang tua, suami/istri, saudara" /></Field>
          <Field label="Nomor telepon"><input className="input" type="tel" required value={f.emergencyPhone} onChange={set('emergencyPhone')} /></Field>
        </section>

        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">Berkas</h2>
          <Field label="Pas foto 3x4" hint={profile?.photoFileId ? 'Sudah ada. Pilih berkas baru hanya bila ingin mengganti.' : 'JPG atau PNG, maksimal 2 MB.'}><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
          <Field label="Scan KTP" hint={profile?.ktpFileId ? 'Sudah ada. Pilih berkas baru hanya bila ingin mengganti.' : 'JPG, PNG, atau PDF, maksimal 2 MB.'}><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setKtp(e.target.files?.[0] ?? null)} /></Field>
        </section>

        <button className="btn-primary w-full sm:w-auto sm:px-10" disabled={nikBad}>{me.profileDone ? 'Perbarui data diri' : 'Simpan dan buka ruang belajar'}</button>
      </form>
    </>
  )
}
