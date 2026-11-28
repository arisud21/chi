import { IconCertificate, IconFileCv, IconFileText, IconPhoto, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import { useRef, useState, type FormEvent } from 'react'
import { BiodataPdf } from '../../components/BiodataPdf'
import { Field, PageHeader, ask, useAct } from '../../components/ui'
import { deleteStaffCert, saveStaffProfile, uploadStaffFile, useStore } from '../../lib/store'
import { MARITAL_LABEL, RELIGIONS, type StaffProfile } from '../../lib/types'

const MAX = 2 * 1024 * 1024
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Cek format dan ukuran di browser; server memeriksa ulang isi berkasnya. */
function checkFile(file: File, types: string[], formats: string) {
  if (!types.includes(file.type)) return `Format harus ${formats}.`
  if (file.size > MAX) return 'Ukuran berkas maksimal 2 MB.'
  return ''
}

/** Kotak unggah satu berkas dengan pratinjau sebelum disimpan. */
function FilePicker({ label, accept, types, formats, current, currentName, image = false, onSave }: {
  label: string; accept: string; types: string[]; formats: string; current: string; currentName: string; image?: boolean; onSave: (f: File) => Promise<boolean>
}) {
  const act = useAct()
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const clear = () => { if (draft) URL.revokeObjectURL(draft.url); setDraft(null); if (input.current) input.current.value = '' }
  const pick = (f?: File) => {
    if (!f) return
    const err = checkFile(f, types, formats)
    if (err) { if (input.current) input.current.value = ''; return act(Promise.resolve({ ok: false, error: err }), '') }
    if (draft) URL.revokeObjectURL(draft.url)
    setDraft({ file: f, url: URL.createObjectURL(f) })
  }
  const save = async () => { if (!draft) return; setBusy(true); const ok = await onSave(draft.file); setBusy(false); if (ok) clear() }
  const shown = draft?.url ?? (current ? `/api/files/${current}` : '')
  return (
    <div className="space-y-3">
      {image ? (
        <div className="mx-auto grid aspect-[3/4] w-40 place-items-center overflow-hidden rounded-xl border border-line bg-canvas">
          {shown ? <img src={shown} alt={draft ? 'Pratinjau pas foto baru' : 'Pas foto saat ini'} className="size-full object-cover" /> : <IconPhoto size={40} className="text-muted" aria-hidden />}
        </div>
      ) : draft ? (
        draft.file.type === 'application/pdf'
          ? <iframe src={draft.url} title={`Pratinjau ${label}`} className="h-64 w-full rounded-xl border border-line bg-white" />
          : <img src={draft.url} alt={`Pratinjau ${label}`} className="max-h-64 w-full rounded-xl border border-line object-contain" />
      ) : (
        <p className="rounded-lg bg-canvas p-3 text-sm">{current
          ? <a className="inline-flex items-center gap-1.5 font-semibold text-brand-600 underline" href={`/api/files/${current}`} target="_blank" rel="noreferrer"><IconFileText size={16} />{currentName}</a>
          : <span className="text-muted">Belum diunggah.</span>}</p>
      )}
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label={`Pilih ${label}`} accept={accept} onChange={(e) => pick(e.target.files?.[0])} />
      {draft ? (
        <div className="space-y-2">
          <p className="truncate text-xs text-muted" title={draft.file.name}>{draft.file.name} · {Math.max(1, Math.round(draft.file.size / 1024))} KB. Periksa pratinjau, lalu simpan.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary flex-1" disabled={busy} onClick={save}><IconUpload size={18} />{busy ? 'Mengunggah…' : current ? 'Ganti' : 'Simpan'}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>Pilih lain</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={clear}>Batal</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-ghost w-full" onClick={() => input.current?.click()}><IconUpload size={18} />{current ? `Ganti ${label.toLowerCase()}` : `Unggah ${label.toLowerCase()}`}</button>
      )}
      <p className="text-xs text-muted">{formats}, maksimal 2 MB.</p>
    </div>
  )
}

/** Menu Data diri instruktur. */
export function DataDiriStaf() {
  const s = useStore((x) => x)
  const act = useAct()
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const prof = s.staffProfiles.find((p) => p.userId === me.id)
  const certs = s.staffCerts.filter((c) => c.userId === me.id)
  const [f, setF] = useState({
    name: me.name, nik: me.nik ?? '', birthPlace: prof?.birthPlace ?? '', birthDate: me.birthDate ?? '', gender: prof?.gender ?? '',
    marital: prof?.marital ?? '', religion: prof?.religion ?? '', address: prof?.address ?? '', phone: me.phone ?? '', email: me.email,
  })
  const [busy, setBusy] = useState(false)
  const [cert, setCert] = useState<{ label: string; file: File | null }>({ label: '', file: null })
  const certInput = useRef<HTMLInputElement>(null)
  const [certBusy, setCertBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const emailChanged = f.email.trim().toLowerCase() !== me.email.toLowerCase()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (emailChanged && !(await ask(`Alamat e-mail juga dipakai untuk masuk. Setelah disimpan, masuk berikutnya memakai ${f.email.trim()}. Lanjutkan?`))) return
    setBusy(true)
    await act(saveStaffProfile(f), 'Data diri disimpan.')
    setBusy(false)
  }
  const addCert = async (e: FormEvent) => {
    e.preventDefault()
    if (!cert.file) return act(Promise.resolve({ ok: false, error: 'Pilih berkas sertifikat.' }), '')
    const err = checkFile(cert.file, DOC_TYPES, 'PDF, JPG, atau PNG')
    if (err) return act(Promise.resolve({ ok: false, error: err }), '')
    setCertBusy(true)
    const ok = await act(uploadStaffFile('cert', cert.file, cert.label.trim()), 'Sertifikat diunggah.')
    setCertBusy(false)
    if (ok) { setCert({ label: '', file: null }); if (certInput.current) certInput.current.value = '' }
  }

  const missing = [!f.nik && 'NIK', !prof?.birthPlace && 'tempat lahir', !prof?.gender && 'jenis kelamin', !prof?.address && 'alamat', !prof?.photoFileId && 'pas foto', !prof?.cvFileId && 'CV'].filter(Boolean)

  return (
    <>
      <PageHeader title="Data diri" sub="Lengkapi identitas, kontak, pas foto, CV, dan sertifikat pendukung. Data ini dilihat Super Admin di menu Akun pengelola. Ekspor PDF memuat biodata dan riwayat mengajar sesuai jadwal pembelajaran." action={<BiodataPdf userId={me.id} />} />
      {missing.length > 0 && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Belum lengkap: {missing.join(', ')}.</p>}
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <section className="card p-5" aria-labelledby="foto-h">
          <h2 id="foto-h" className="mb-3 flex items-center gap-2 font-bold"><IconPhoto size={18} />Pas foto</h2>
          <FilePicker label="Pas foto" image accept=".jpg,.jpeg,.png,.webp" types={IMG_TYPES} formats="JPG, PNG, atau WEBP" current={prof?.photoFileId ?? ''} currentName="Pas foto"
            onSave={(file) => act(uploadStaffFile('photo', file), 'Pas foto disimpan. Foto tampil di samping nama Anda.')} />
        </section>

        <form onSubmit={submit} className="card space-y-4 p-5" aria-labelledby="id-h">
          <h2 id="id-h" className="font-bold">Identitas dan kontak</h2>
          <Field label="Nama lengkap dan gelar" hint="Terisi dari data admin. Perbaiki bila ada kesalahan penulisan, contoh: Budi Santoso, S.Par., M.M.">
            <input className="input" required maxLength={120} value={f.name} onChange={set('name')} autoComplete="name" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="NIK (sesuai KTP)" hint="16 digit angka."><input className="input font-mono" required inputMode="numeric" pattern="\d{16}" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Jenis kelamin">
              <div className="flex min-h-11 items-center gap-5" role="radiogroup" aria-label="Jenis kelamin">
                {([['L', 'Laki-laki'], ['P', 'Perempuan']] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="gender" required className="size-4 accent-brand-600" checked={f.gender === k} onChange={() => setF({ ...f, gender: k })} />{l}</label>
                ))}
              </div>
            </Field>
            <Field label="Tempat lahir"><input className="input" required maxLength={80} value={f.birthPlace} onChange={set('birthPlace')} /></Field>
            <Field label="Tanggal lahir"><input className="input" type="date" required value={f.birthDate} onChange={set('birthDate')} /></Field>
            <Field label="Status perkawinan">
              <select className="input" required value={f.marital} onChange={set('marital')}>
                <option value="" disabled>Pilih status</option>
                {(Object.keys(MARITAL_LABEL) as Exclude<StaffProfile['marital'], ''>[]).map((k) => <option key={k} value={k}>{MARITAL_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Agama">
              <select className="input" required value={f.religion} onChange={set('religion')}>
                <option value="" disabled>Pilih agama</option>
                {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Alamat" hint="Alamat lengkap: jalan, RT/RW, kelurahan, kecamatan, kota/kabupaten."><textarea className="input min-h-24 py-2" required maxLength={500} value={f.address} onChange={set('address')} autoComplete="street-address" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomor HP" hint="Contoh: 081234567890."><input className="input" required type="tel" inputMode="tel" maxLength={20} value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
            <Field label="Alamat e-mail" hint={emailChanged ? 'E-mail berubah: masuk berikutnya memakai e-mail baru ini.' : 'Juga dipakai untuk masuk ke aplikasi.'}><input className="input" required type="email" maxLength={160} value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan data diri'}</button>
        </form>

        <section className="card p-5 lg:col-start-2" aria-labelledby="cv-h">
          <h2 id="cv-h" className="mb-3 flex items-center gap-2 font-bold"><IconFileCv size={18} />Curriculum vitae (CV)</h2>
          <FilePicker label="CV" accept=".pdf,.jpg,.jpeg,.png" types={DOC_TYPES} formats="PDF, JPG, atau PNG" current={prof?.cvFileId ?? ''} currentName="Lihat CV"
            onSave={(file) => act(uploadStaffFile('cv', file), 'CV disimpan.')} />
        </section>

        <section className="card p-5 lg:col-start-2" aria-labelledby="cert-h">
          <h2 id="cert-h" className="flex items-center gap-2 font-bold"><IconCertificate size={18} />Sertifikat pendukung <span className="text-sm font-normal text-muted">(jika ada)</span></h2>
          <p className="mt-1 text-sm text-muted">Boleh lebih dari satu, misalnya sertifikat kompetensi, pelatihan, atau keahlian. Unggah satu per satu.</p>
          {certs.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {certs.map((c, i) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <a className="min-w-0 truncate font-semibold text-brand-600 underline" href={`/api/files/${c.fileId}`} target="_blank" rel="noreferrer">{i + 1}. {c.label}</a>
                  <button type="button" className="btn-ghost !min-h-9 shrink-0 text-red-700" aria-label={`Hapus sertifikat ${c.label}`}
                    onClick={async () => (await ask(`Hapus sertifikat "${c.label}"?`)) && act(deleteStaffCert(c.id), 'Sertifikat dihapus.')}><IconTrash size={16} /></button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addCert} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Nama sertifikat"><input className="input" required maxLength={160} placeholder="Contoh: Sertifikat Kompetensi BNSP Front Office" value={cert.label} onChange={(e) => setCert({ ...cert, label: e.target.value })} /></Field>
            <Field label="Berkas" hint="PDF, JPG, atau PNG, maksimal 2 MB."><input ref={certInput} className="input !py-2" type="file" required accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setCert({ ...cert, file: e.target.files?.[0] ?? null })} /></Field>
            <button className="btn-primary sm:mb-6" disabled={certBusy}><IconPlus size={18} />{certBusy ? 'Mengunggah…' : 'Tambah'}</button>
          </form>
        </section>
      </div>
    </>
  )
}
