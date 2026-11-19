import { IconCircleX, IconSearch, IconUserCheck } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Field, PasswordInput, dateID, rupiah, useAct, useToast } from '../../components/ui'
import { checkParticipantStatus, forgotPassword, login, register, resetPassword, useStore } from '../../lib/store'

type StatusKey = 'aktif' | 'menunggu_pelunasan' | 'lulus' | 'tidak_lulus' | 'selesai' | 'mundur' | 'proses' | 'tidak_aktif'
interface Found { found: boolean; nip?: string; name?: string; program?: string; batch?: string | null; startDate?: string | null; endDate?: string | null; status?: StatusKey; statusLabel?: string }
const STATUS_CLS: Record<StatusKey, string> = {
  aktif: 'bg-sky-50 text-sky-800 ring-sky-200', menunggu_pelunasan: 'bg-amber-50 text-amber-800 ring-amber-200', lulus: 'bg-emerald-50 text-emerald-800 ring-emerald-200', selesai: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  tidak_lulus: 'bg-zinc-100 text-zinc-700 ring-zinc-200', mundur: 'bg-zinc-100 text-zinc-700 ring-zinc-200', tidak_aktif: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  proses: 'bg-amber-50 text-amber-800 ring-amber-200',
}

/** Cek status peserta publik berdasarkan NIP (Nomor Induk Peserta). NIP dibawa di ?nip= agar NIP berisi garis miring tetap aman. */
export function CekStatus() {
  const [params] = useSearchParams()
  const nip = params.get('nip')?.trim() ?? ''
  const nav = useNavigate()
  const [q, setQ] = useState(nip)
  const [res, setRes] = useState<Found | 'loading' | { error: string } | null>(null)
  useEffect(() => {
    setQ(nip)
    if (!nip) { setRes(null); return }
    setRes('loading')
    checkParticipantStatus(nip).then((r) => setRes(r.ok ? (r.data as Found) : { error: r.error }))
  }, [nip])
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) nav(`/cek-status?nip=${encodeURIComponent(q.trim())}`) }
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Cek status peserta</h1>
      <p className="mt-2 text-sm text-muted">Masukkan NIP (Nomor Induk Peserta) untuk melihat status keikutsertaan peserta pelatihan.</p>
      <form onSubmit={submit} className="mt-6 flex gap-2">
        <input className="input font-mono tracking-wider" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Contoh: 261100001" aria-label="NIP" inputMode="text" maxLength={12} />
        <button className="btn-primary"><IconSearch size={18} />Cek</button>
      </form>
      {nip && res === 'loading' && <p className="mt-6 text-sm text-muted" role="status">Memeriksa…</p>}
      {nip && res && typeof res === 'object' && 'error' in res && <p className="mt-6 text-sm text-red-700" role="alert">{res.error}</p>}
      {nip && res && typeof res === 'object' && 'found' in res && (
        <div className="mt-6 animate-pop">
          {res.found ? (
            <div className="card p-6">
              <div className="flex items-center gap-2 font-bold"><IconUserCheck className="text-brand-600" />Peserta terdaftar</div>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="text-muted">Nama</dt><dd className="font-semibold">{res.name}</dd></div>
                <div><dt className="text-muted">NIP</dt><dd className="font-mono font-semibold">{res.nip}</dd></div>
                <div><dt className="text-muted">Program</dt><dd className="font-semibold">{res.program}</dd></div>
                {res.batch && <div><dt className="text-muted">Angkatan</dt><dd className="font-semibold">{res.batch}{res.startDate && res.endDate ? ` (${dateID(res.startDate)} sampai ${dateID(res.endDate)})` : ''}</dd></div>}
                <div><dt className="text-muted">Status</dt><dd><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_CLS[res.status!]}`}>{res.statusLabel}</span></dd></div>
              </dl>
            </div>
          ) : (
            <div className="card flex items-center gap-3 border-red-300 p-6"><IconCircleX className="shrink-0 text-red-600" /><p className="text-sm"><b>NIP tidak ditemukan.</b> Periksa kembali penulisan NIP, atau hubungi lembaga bila Anda yakin NIP benar.</p></div>
          )}
        </div>
      )}
    </div>
  )
}

/** Tombol masuk cepat hanya tampil saat pengembangan, atau di build yang dibuat dengan VITE_SHOW_DEMO=1. */
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === '1'
const DEMO = [
  ['Super Admin', 'superadmin@chi.demo'], ['Admin Pendaftaran', 'admindaf@chi.demo'], ['Admin Keuangan', 'adminkeu@chi.demo'], ['Admin Akademik', 'adminaka@chi.demo'],
  ['Instruktur RD2', 'rd2@gmail.com'],
]

export function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (em: string, p: string) => {
    setBusy(true)
    const r = await login(em, p)
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    nav((r.data as any).role === 'peserta' ? '/app' : '/admin', { replace: true })
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); go(email, pw) }} className="card space-y-4 p-6">
        <h1 className="font-display text-2xl font-bold">Masuk</h1>
        {(loc.state as any)?.from && <p className="text-sm text-muted">Masuk dulu untuk membuka halaman tersebut.</p>}
        <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password"><PasswordInput required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        <div className="flex justify-between text-sm text-muted"><span>Belum punya akun? <Link to="/daftar" className="font-semibold text-brand-600">Daftar</Link></span><Link to="/lupa-password" className="font-semibold text-brand-600">Lupa password</Link></div>
      </form>
      {SHOW_DEMO && <div>
        <h2 className="font-bold">Akun staf demo (hanya data pengembangan)</h2>
        <p className="mt-1 text-sm text-muted">Semua akun demo memakai password <code className="rounded bg-white px-1 font-mono">demo12345</code>. Klik untuk masuk. Peserta mendaftar sendiri lewat halaman Daftar.</p>
        <div className="mt-3 grid gap-2">
          {DEMO.map(([name, em]) => (
            <button key={em} disabled={busy} onClick={() => go(em, 'demo12345')} className="card flex min-h-12 items-center justify-between px-4 text-left text-sm transition hover:border-brand-200 hover:bg-brand-50">
              <span className="font-semibold">{name}</span><span className="text-muted">{em}</span>
            </button>
          ))}
        </div>
      </div>}
    </div>
  )
}

const MIN_AGE = 14
const MAX_AGE = 30
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Rentang tanggal lahir yang membuat usia penuh hari ini antara MIN_AGE dan MAX_AGE. */
const birthRange = () => { const n = new Date(); return { bdMin: ymd(new Date(n.getFullYear() - MAX_AGE - 1, n.getMonth(), n.getDate() + 1)), bdMax: ymd(new Date(n.getFullYear() - MIN_AGE, n.getMonth(), n.getDate())) } }

const TYPO: Record<string, string> = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'yahooo.com': 'yahoo.com', 'hotmial.com': 'hotmail.com' }

export function Register() {
  const nav = useNavigate()
  const toast = useToast()
  const [sp] = useSearchParams()
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const programs = s.programs.filter((p) => p.active && !p.archived)
  const pre = s.batches.find((b) => b.id === sp.get('batch'))
  const [programId, setProgramId] = useState(programs.some((p) => p.id === pre?.programId) ? pre!.programId : '')
  const [f, setF] = useState({ name: '', email: '', email2: '', nik: '', birthDate: '', password: '', consent: false, website: '' })
  const [busy, setBusy] = useState(false)
  const prog = programs.find((p) => p.id === programId)
  const { bdMin, bdMax } = birthRange()
  const dom = f.email.split('@')[1]?.toLowerCase()
  const typo = dom && TYPO[dom]
  const mismatch = f.email2 !== '' && f.email !== f.email2
  const nikBad = f.nik !== '' && !/^\d{16}$/.test(f.nik)

  if (me?.role === 'peserta') {
    return <div className="mx-auto max-w-lg px-4 py-14 text-center"><p className="font-semibold">Anda sudah punya akun.</p><p className="mt-1 text-sm text-muted">Lanjutkan tahapan penerimaan di portal peserta.</p><Link to="/app" className="btn-primary mt-4">Ke tahapan</Link></div>
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!programId) return toast('Pilih jenis pelatihan.', 'err')
    if (f.email !== f.email2) return toast('Email dan konfirmasi email belum sama.', 'err')
    if (!/^\d{16}$/.test(f.nik)) return toast('NIK harus 16 digit angka.', 'err')
    if (f.birthDate < bdMin || f.birthDate > bdMax) return toast(`Pendaftaran hanya untuk usia ${MIN_AGE} sampai ${MAX_AGE} tahun.`, 'err')
    if (f.password.length < 8) return toast('Password minimal 8 karakter.', 'err')
    setBusy(true)
    const r = await register({ ...f, programId })
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    toast('Registrasi berhasil. Lengkapi data diri Anda.')
    nav('/app/data-diri')
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div><h1 className="font-display text-2xl font-bold">Registrasi pelatihan</h1><p className="mt-1 text-sm text-muted">Pilih pelatihan dan buat akun. Berikutnya: isi data diri, bayar biaya pendaftaran, ujian online, lalu pengumuman hasil seleksi.</p></div>

        <fieldset className="space-y-3 rounded-xl bg-brand-50 p-4">
          <legend className="px-1 text-sm font-bold">1. Pilih pelatihan</legend>
          <Field label="Jenis pelatihan">
            <select className="input" required value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">Pilih jenis pelatihan</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          {prog && <p className="text-sm">Biaya pelatihan <b>{rupiah(prog.price)}</b> · {prog.durationHours} jam. Biaya pendaftaran {rupiah(s.settings.regFee ?? 200000)}, dibayar setelah data diri lengkap. Angkatan ditentukan admin setelah Anda lulus.</p>}
          {programs.length === 0 && <p className="text-sm text-muted">Belum ada jenis pelatihan yang dibuka. Cek kembali segera.</p>}
        </fieldset>

        <p className="pt-1 text-sm font-bold">2. Data akun</p>
        <Field label="Nama lengkap"><input className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Email">
          <input className="input" type="email" required value={f.email} onChange={set('email')} autoComplete="email" />
          {typo && <span className="mt-1 block text-xs font-medium text-amber-700">Maksud Anda <button type="button" className="underline" onClick={() => setF({ ...f, email: f.email.replace(dom!, typo) })}>{f.email.replace(dom!, typo)}</button>?</span>}
        </Field>
        <Field label="Ketik ulang email"><input className="input" type="email" required value={f.email2} onChange={set('email2')} onPaste={(e) => e.preventDefault()} aria-invalid={mismatch} />{mismatch && <span className="mt-1 block text-xs font-medium text-red-700">Belum sama dengan email di atas.</span>}</Field>
        <Field label="NIK" hint={nikBad ? 'NIK harus 16 digit angka.' : '16 digit sesuai KTP. Satu NIK hanya untuk satu akun.'}><input className={`input font-mono ${nikBad ? '!border-red-500' : ''}`} required inputMode="numeric" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, '') })} autoComplete="off" /></Field>
        <Field label="Tanggal lahir" hint={`Usia maksimal ${MAX_AGE} tahun.`}><input className="input" type="date" required min={bdMin} max={bdMax} value={f.birthDate} onChange={set('birthDate')} autoComplete="bday" /></Field>
        <Field label="Password" hint="Minimal 8 karakter."><PasswordInput required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <input type="text" name="cih_hp_field" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={f.consent} onChange={set('consent')} className="mt-1 size-4 accent-brand-600" />Saya setuju data saya diproses untuk keperluan pelatihan sesuai kebijakan privasi (UU PDP).</label>
        <button className="btn-primary w-full" disabled={busy || !programId}>{busy ? 'Membuat akun…' : 'Registrasi'}</button>
        <p className="text-sm text-muted">Sudah punya akun? <Link to="/masuk" className="font-semibold text-brand-600">Masuk</Link></p>
      </form>
    </div>
  )
}

export function ForgotPassword() {
  const act = useAct()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); act(forgotPassword(email), 'Jika email terdaftar, tautan dikirim.', () => setSent(true)) }}>
        <h1 className="font-display text-2xl font-bold">Lupa password</h1>
        {sent ? <p className="text-sm text-muted">Periksa email Anda. Tautan berlaku satu jam.</p> : <>
          <Field label="Email" hint="Email yang dipakai saat mendaftar."><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn-primary w-full">Kirim tautan</button></>}
      </form>
    </div>
  )
}

export function ResetPassword() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const act = useAct()
  const [pw, setPw] = useState('')
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); act(resetPassword(sp.get('token') ?? '', pw), 'Password diganti. Silakan masuk.', () => nav('/masuk')) }}>
        <h1 className="font-display text-2xl font-bold">Password baru</h1>
        <Field label="Password baru" hint="Minimal 8 karakter."><PasswordInput required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn-primary w-full">Simpan</button>
      </form>
    </div>
  )
}
