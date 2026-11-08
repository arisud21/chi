import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconSearch } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { Badge, Field, dateID, rupiah, useAct, useToast } from '../../components/ui'
import { forgotPassword, login, register, resetPassword, seatsTaken, useStore, verifyCertificate, verifyEmailToken } from '../../lib/store'

interface Found { found: boolean; holder?: string; program?: string; number?: string; status?: 'issued' | 'revoked'; issuedAt?: string }

export function Verify() {
  const { code } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState(code ?? '')
  const [res, setRes] = useState<Found | 'loading' | 'error' | null>(null)
  useEffect(() => {
    if (!code) { setRes(null); return }
    setRes('loading')
    verifyCertificate(code).then((r) => setRes(r.ok ? (r.data as Found) : 'error'))
  }, [code])
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) nav(`/verifikasi/${q.trim().toUpperCase()}`) }
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Cek keaslian sertifikat</h1>
      <p className="mt-2 text-sm text-muted">Masukkan kode verifikasi yang tercetak di sertifikat atau dari QR code.</p>
      <form onSubmit={submit} className="mt-6 flex gap-2">
        <input className="input font-mono uppercase tracking-wider" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Contoh: K7M2QX9TPA" aria-label="Kode verifikasi" maxLength={10} />
        <button className="btn-primary"><IconSearch size={18} />Cek</button>
      </form>
      {code && res === 'loading' && <p className="mt-6 text-sm text-muted">Memeriksa…</p>}
      {code && res === 'error' && <p className="mt-6 text-sm text-red-700">Gagal memeriksa. Coba lagi sebentar lagi.</p>}
      {code && res && typeof res === 'object' && (
        <div className="mt-6 animate-pop">
          {res.found ? (
            <div className={`card p-6 ${res.status === 'revoked' ? 'border-red-300' : 'border-emerald-300'}`}>
              <div className="flex items-center gap-2 font-bold">
                {res.status === 'issued' ? <IconCircleCheck className="text-emerald-600" /> : <IconAlertTriangle className="text-red-600" />}
                {res.status === 'issued' ? 'Sertifikat sah' : 'Sertifikat telah dicabut'}
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="text-muted">Nama</dt><dd className="font-semibold">{res.holder}</dd></div>
                <div><dt className="text-muted">Program</dt><dd className="font-semibold">{res.program}</dd></div>
                <div><dt className="text-muted">Nomor</dt><dd className="font-mono font-semibold">{res.number}</dd></div>
                <div><dt className="text-muted">Tanggal terbit</dt><dd className="font-semibold">{dateID(res.issuedAt!)}</dd></div>
                <div><dt className="text-muted">Status</dt><dd><Badge status={res.status!} /></dd></div>
              </dl>
            </div>
          ) : (
            <div className="card flex items-center gap-3 border-red-300 p-6"><IconCircleX className="shrink-0 text-red-600" /><p className="text-sm"><b>Kode tidak ditemukan.</b> Periksa kembali penulisan kode, atau hubungi lembaga bila Anda yakin kode benar.</p></div>
          )}
        </div>
      )}
    </div>
  )
}

const DEMO = [
  ['Super Admin', 'super@cih.demo'], ['Admin Pendaftaran', 'pendaftaran@cih.demo'], ['Admin Keuangan', 'keuangan@cih.demo'], ['Staf Akademik', 'akademik@cih.demo'],
  ['Instruktur Front Office', 'instruktur@cih.demo'], 
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
        <Field label="Password"><input className="input" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        <div className="flex justify-between text-sm text-muted"><span>Belum punya akun? <Link to="/daftar" className="font-semibold text-brand-600">Daftar</Link></span><Link to="/lupa-password" className="font-semibold text-brand-600">Lupa password</Link></div>
      </form>
      <div>
        <h2 className="font-bold">Akun staf demo (hanya data pengembangan)</h2>
        <p className="mt-1 text-sm text-muted">Semua akun demo memakai password <code className="rounded bg-white px-1 font-mono">demo12345</code>. Klik untuk masuk. Peserta mendaftar sendiri lewat halaman Daftar.</p>
        <div className="mt-3 grid gap-2">
          {DEMO.map(([name, em]) => (
            <button key={em} disabled={busy} onClick={() => go(em, 'demo12345')} className="card flex min-h-12 items-center justify-between px-4 text-left text-sm transition hover:border-brand-200 hover:bg-brand-50">
              <span className="font-semibold">{name}</span><span className="text-muted">{em}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const TYPO: Record<string, string> = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'yahooo.com': 'yahoo.com', 'hotmial.com': 'hotmail.com' }

export function Register() {
  const nav = useNavigate()
  const toast = useToast()
  const [sp] = useSearchParams()
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const open = s.batches.filter((b) => b.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate))
  const programs = s.programs.filter((p) => p.active && !p.archived && open.some((b) => b.programId === p.id))
  const pre = open.find((b) => b.id === sp.get('batch'))
  const [programId, setProgramId] = useState(pre?.programId ?? '')
  const [batchId, setBatchId] = useState(pre?.id ?? '')
  const [f, setF] = useState({ name: '', email: '', email2: '', phone: '', password: '', consent: false, website: '' })
  const [busy, setBusy] = useState(false)
  const batches = open.filter((b) => b.programId === programId)
  const prog = programs.find((p) => p.id === programId)
  const batch = batches.find((b) => b.id === batchId)
  const dom = f.email.split('@')[1]?.toLowerCase()
  const typo = dom && TYPO[dom]
  const mismatch = f.email2 !== '' && f.email !== f.email2

  if (me?.role === 'peserta') {
    return <div className="mx-auto max-w-lg px-4 py-14 text-center"><p className="font-semibold">Anda sudah punya akun.</p><p className="mt-1 text-sm text-muted">Pilih pelatihan tambahan lewat katalog di portal peserta.</p><Link to="/app/katalog" className="btn-primary mt-4">Ke katalog</Link></div>
  }

  const pickProgram = (id: string) => { setProgramId(id); const first = open.filter((b) => b.programId === id); setBatchId(first.length === 1 ? first[0].id : '') }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!batchId) return toast('Pilih jenis pelatihan dan angkatan.', 'err')
    if (f.email !== f.email2) return toast('Email dan konfirmasi email belum sama.', 'err')
    if (f.password.length < 8) return toast('Password minimal 8 karakter.', 'err')
    setBusy(true)
    const r = await register({ ...f, batchId })
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    toast('Akun dan tagihan dibuat. Selesaikan pembayaran untuk mengaktifkan pendaftaran.')
    nav('/app/pendaftaran')
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div><h1 className="font-display text-2xl font-bold">Daftar pelatihan</h1><p className="mt-1 text-sm text-muted">Pilih pelatihan, buat akun, lalu tagihan langsung terbit. Data diri lengkap diisi setelah pembayaran dikonfirmasi.</p></div>

        <fieldset className="space-y-3 rounded-xl bg-brand-50 p-4">
          <legend className="px-1 text-sm font-bold">1. Pilih pelatihan</legend>
          <Field label="Jenis pelatihan">
            <select className="input" required value={programId} onChange={(e) => pickProgram(e.target.value)}>
              <option value="">Pilih jenis pelatihan</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          {programId && (
            <Field label="Angkatan">
              <select className="input" required value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Pilih angkatan</option>
                {batches.map((b) => { const left = b.quota - seatsTaken(s, b.id); return <option key={b.id} value={b.id} disabled={left <= 0}>{b.code} · mulai {dateID(b.startDate)} · {left > 0 ? `sisa ${left} kursi` : 'penuh'}</option> })}
              </select>
            </Field>
          )}
          {prog && batch && <p className="text-sm">Biaya <b>{rupiah(prog.price)}</b> · {prog.durationHours} jam · batas bayar {s.settings.payDueHours ?? 48} jam setelah daftar</p>}
          {programs.length === 0 && <p className="text-sm text-muted">Belum ada angkatan yang dibuka. Cek kembali segera.</p>}
        </fieldset>

        <p className="pt-1 text-sm font-bold">2. Data akun</p>
        <Field label="Nama lengkap"><input className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Email">
          <input className="input" type="email" required value={f.email} onChange={set('email')} autoComplete="email" />
          {typo && <span className="mt-1 block text-xs font-medium text-amber-700">Maksud Anda <button type="button" className="underline" onClick={() => setF({ ...f, email: f.email.replace(dom!, typo) })}>{f.email.replace(dom!, typo)}</button>?</span>}
        </Field>
        <Field label="Ketik ulang email"><input className="input" type="email" required value={f.email2} onChange={set('email2')} onPaste={(e) => e.preventDefault()} aria-invalid={mismatch} />{mismatch && <span className="mt-1 block text-xs font-medium text-red-700">Belum sama dengan email di atas.</span>}</Field>
        <Field label="Nomor telepon"><input className="input" type="tel" required value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        <Field label="Password" hint="Minimal 8 karakter."><input className="input" type="password" required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={f.consent} onChange={set('consent')} className="mt-1 size-4 accent-brand-600" />Saya setuju data saya diproses untuk keperluan pelatihan sesuai kebijakan privasi (UU PDP).</label>
        <button className="btn-primary w-full" disabled={busy || !batchId}>{busy ? 'Membuat akun…' : 'Daftar dan terbitkan tagihan'}</button>
        <p className="text-sm text-muted">Sudah punya akun? <Link to="/masuk" className="font-semibold text-brand-600">Masuk</Link></p>
      </form>
    </div>
  )
}

export function VerifyEmailPage() {
  const [sp] = useSearchParams()
  const [state, setState] = useState<'loading' | 'ok' | string>('loading')
  useEffect(() => {
    verifyEmailToken(sp.get('token') ?? '').then((r) => setState(r.ok ? 'ok' : r.error))
  }, [sp])
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      {state === 'loading' ? <p className="text-muted">Memverifikasi…</p> : state === 'ok'
        ? <><IconCircleCheck className="mx-auto text-emerald-600" size={40} /><h1 className="mt-3 font-display text-2xl font-bold">Email terverifikasi</h1><p className="mt-2 text-sm text-muted">Sertifikat dan transkrip kini dapat dikirim ke email Anda.</p><Link to="/app" className="btn-primary mt-5">Ke dashboard</Link></>
        : <><IconCircleX className="mx-auto text-red-600" size={40} /><h1 className="mt-3 font-display text-2xl font-bold">Verifikasi gagal</h1><p className="mt-2 text-sm text-muted">{state}</p><Link to="/app" className="btn-ghost mt-5">Minta tautan baru dari dashboard</Link></>}
    </div>
  )
}

export function ForgotPassword() {
  const act = useAct()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); act(forgotPassword(email), 'Jika email terdaftar dan terverifikasi, tautan dikirim.', () => setSent(true)) }}>
        <h1 className="font-display text-2xl font-bold">Lupa password</h1>
        {sent ? <p className="text-sm text-muted">Periksa email Anda. Tautan berlaku satu jam. Bila email belum pernah diverifikasi, hubungi admin.</p> : <>
          <Field label="Email" hint="Hanya untuk email yang sudah terverifikasi."><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
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
        <Field label="Password baru" hint="Minimal 8 karakter."><input className="input" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn-primary w-full">Simpan</button>
      </form>
    </div>
  )
}
