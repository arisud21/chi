import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { IconCheck, IconEye, IconEyeOff, IconX } from '@tabler/icons-react'
import { createPortal } from 'react-dom'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Result } from '../lib/store'
import type { RegStatus } from '../lib/types'

export const rupiah = (n: number) => 'Rp' + n.toLocaleString('id-ID')
export const dateID = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
export const dateTimeID = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Muncul sambil naik saat masuk viewport. Hormati prefers-reduced-motion. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px' })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 22 }}
      animate={inView || reduce ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Angka menghitung naik sekali saat terlihat. */
/** Nilai awal filter dari URL (?kunci=nilai), dipakai tautan dari dashboard. Kosong bila tidak ada. */
export function useQueryParam(key: string) {
  const [sp] = useSearchParams()
  return sp.get(key) ?? ''
}

export function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [v, setV] = useState(reduce ? to : 0)
  useEffect(() => {
    if (!inView || reduce) { setV(to); return }
    const c = animate(0, to, { duration: 1.1, ease: 'easeOut', onUpdate: (x) => setV(Math.round(x)) })
    return () => c.stop()
  }, [inView, to, reduce])
  return <span ref={ref}>{v.toLocaleString('id-ID')}</span>
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Menunggu pembayaran', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  waiting_verification: { label: 'Menunggu verifikasi', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  active: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  completed: { label: 'Selesai', cls: 'bg-brand-50 text-brand-700 ring-brand-200' },
  cancelled: { label: 'Dibatalkan', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  expired: { label: 'Kedaluwarsa', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  submitted: { label: 'Diajukan', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  verified: { label: 'Terverifikasi', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  rejected: { label: 'Ditolak', cls: 'bg-red-50 text-red-800 ring-red-200' },
  draft: { label: 'Draf', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  validated: { label: 'Tervalidasi', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  open: { label: 'Dibuka', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  running: { label: 'Berjalan', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  finished: { label: 'Selesai', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  issued: { label: 'Sah', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  revoked: { label: 'Dicabut', cls: 'bg-red-50 text-red-800 ring-red-200' },
  due: { label: 'Ada tagihan', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  confirm: { label: 'Menunggu konfirmasi', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  later: { label: 'Belum jatuh tempo', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  nopackage: { label: 'Belum pilih paket', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  partial: { label: 'Dibayar sebagian', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  short: { label: 'Pembayaran kurang', cls: 'bg-red-50 text-red-800 ring-red-200' },
  unpaid: { label: 'Belum dibayar', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  paid: { label: 'Lunas', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  data: { label: 'Isi data diri', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  bayar_daftar: { label: 'Bayar pendaftaran', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  ujian: { label: 'Ujian online', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  menunggu_hasil: { label: 'Menunggu hasil', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  registrasi_ulang: { label: 'Registrasi ulang', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  aktif: { label: 'Peserta aktif', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  tidak_lulus: { label: 'Tidak lulus', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
}
export const KIND_LABEL: Record<string, string> = { pendaftaran: 'Pendaftaran', registrasi_ulang: 'Registrasi ulang', cicilan: 'Cicilan' }
export function Badge({ status }: { status: RegStatus | string }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>{s.label}</span>
}

export function Modal({ open, title, onClose, children, size = 'lg' }: { open: boolean; title: string; onClose: () => void; children: ReactNode; size?: 'lg' | 'xl' }) {
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden' // halaman di belakang tidak ikut bergulir
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])
  /** Isian yang difokuskan digulirkan ke tengah area modal agar tidak tertutup papan ketik handphone. */
  const keepVisible = (e: React.FocusEvent) => {
    const el = e.target as HTMLElement
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
  }
  if (!open) return null
  // Dirender ke body: induk beranimasi (mis. header halaman) menjadikan elemen fixed terkurung di dalamnya.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-brand-900/40 animate-fade sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onFocus={keepVisible}
        className={`card flex max-h-[92dvh] w-full flex-col ${size === 'xl' ? 'max-w-5xl' : 'max-w-lg'} animate-pop rounded-b-none pb-[env(safe-area-inset-bottom)] sm:max-h-[90dvh] sm:rounded-b-2xl sm:pb-0`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="min-w-0 text-lg font-bold">{title}</h2>
          <button className="btn-ghost !min-h-10 !px-2" onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pb-24 p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- Dialog konfirmasi (pengganti window.confirm) ---------------- */
type AskOpts = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
type AskReq = AskOpts & { message: string; resolve: (ok: boolean) => void }
let askHandler: ((r: AskReq) => void) | null = null

/** Tampilkan dialog konfirmasi bertema aplikasi. Hasilnya true bila pengguna menyetujui. Pemakaian: `if (await ask('Hapus data ini?')) ...` */
export function ask(message: string, opts: AskOpts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!askHandler) return resolve(false)
    askHandler({ message, ...opts, resolve })
  })
}

function ConfirmHost() {
  const [req, setReq] = useState<AskReq | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { askHandler = setReq; return () => { askHandler = null } }, [])
  useEffect(() => { if (req) okRef.current?.focus() }, [req])
  if (!req) return null
  const destructive = req.danger ?? /^(hapus|batalkan|nyatakan|tolak)/i.test(req.message)
  const close = (ok: boolean) => { req.resolve(ok); setReq(null) }
  const defaultOk = /^hapus/i.test(req.message) ? 'Ya, hapus' : /^batalkan/i.test(req.message) ? 'Ya, batalkan' : 'Ya, lanjutkan'
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-brand-900/40 p-4 animate-fade" onClick={() => close(false)}
      onKeyDown={(e) => e.key === 'Escape' && close(false)}>
      <div role="alertdialog" aria-modal="true" aria-label={req.title ?? 'Konfirmasi'} className="card w-full max-w-sm animate-pop p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{req.title ?? (destructive ? 'Konfirmasi tindakan' : 'Konfirmasi')}</h2>
        <p className="mt-2 text-sm text-muted">{req.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => close(false)}>{req.cancelLabel ?? 'Batal'}</button>
          <button ref={okRef} className={destructive ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{req.confirmLabel ?? defaultOk}</button>
        </div>
      </div>
    </div>
  )
}

const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([])
  const push = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, kind }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800)
  }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <ConfirmHost />
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`pointer-events-auto flex max-w-md animate-pop items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${i.kind === 'ok' ? 'bg-brand-700' : 'bg-red-700'}`}>
            {i.kind === 'ok' ? <IconCheck size={18} /> : <IconX size={18} />}{i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** Teks angka berpemisah ribuan titik (4000000 menjadi 4.000.000). Kosong untuk nol bila zeroEmpty. */
export const fmtMoney = (n: number | string | null | undefined, zeroEmpty = false) => {
  const v = Math.round(Number(n))
  return Number.isFinite(v) && !(zeroEmpty && v === 0) ? v.toLocaleString('id-ID') : ''
}

/**
 * Isian nominal rupiah dengan pemisah ribuan otomatis. Pengguna cukup mengetik angka; titik atau koma yang diketik atau
 * ditempel (4.000.000 atau 4,000,000) diabaikan. Nilai ke luar selalu bilangan bulat.
 */
export function MoneyInput({ value, onValue, zeroEmpty = false, className = '', ...p }: { value: number | string; onValue: (n: number) => void; zeroEmpty?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'>) {
  return (
    <input {...p} type="text" inputMode="numeric" autoComplete="off" className={`input tabular-nums ${className}`} value={fmtMoney(value, zeroEmpty)}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 13); onValue(d ? Number(d) : 0) }} />
  )
}

/** Input password dengan tombol lihat/sembunyikan. */
export function PasswordInput({ className = '', ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative block">
      <input {...p} type={show ? 'text' : 'password'} className={`input pr-11 ${className}`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Sembunyikan password' : 'Lihat password'} aria-pressed={show}
        className="absolute right-0 top-0 grid size-11 cursor-pointer place-items-center rounded-lg text-muted hover:text-brand-600">
        {show ? <IconEyeOff size={20} /> : <IconEye size={20} />}
      </button>
    </span>
  )
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-rise">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src={light ? '/logo-putih.png' : '/logo.jpg'} alt="" className="h-11 w-auto" />
      <span className={`leading-tight ${light ? 'text-white' : 'text-ink'}`}>
        <span className="block whitespace-nowrap font-display text-[15px] font-bold">Cimahi Hotel Institute</span>
        <span className={`block whitespace-nowrap text-[10.5px] font-medium italic tracking-wide ${light ? 'text-brand-200' : 'text-muted'}`}>Shaping Global Hospitality</span>
      </span>
    </span>
  )
}

export const newIdLike = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`

/** Jalankan aksi async lalu tampilkan toast sukses atau pesan galat dari server. */
export function useAct() {
  const toast = useToast()
  return async (p: Promise<Result>, okMsg: string, onOk?: () => void) => {
    const r = await p
    if (r.ok) { toast(okMsg); onOk?.() } else toast(r.error, 'err')
    return r.ok
  }
}

/**
 * Tabel data. Layar lebar: tabel biasa. Layar sempit: tiap baris menjadi kartu dengan label kolom,
 * sehingga tidak perlu menggeser ke samping. Label diambil dari head, jadi halaman tidak perlu mengubah isi sel.
 */
export function Table({ head, children, foot, bare = false }: { head: string[]; children: ReactNode; foot?: ReactNode; bare?: boolean }) {
  const ref = useRef<HTMLTableElement>(null)
  useEffect(() => {
    ref.current?.querySelectorAll('tbody tr').forEach((tr) => {
      Array.from(tr.children).forEach((td, i) => { if (td instanceof HTMLElement && !td.dataset.label) td.dataset.label = head[i] ?? '' })
    })
  })
  return (
    <div className={bare ? 'overflow-hidden rounded-xl border border-line' : 'card overflow-hidden'}>
      <div className="overflow-x-auto">
        <table ref={ref} className="rtable w-full text-left text-sm">
          <thead><tr className="border-b border-line bg-brand-50 text-xs font-semibold uppercase tracking-wide text-brand-700">{head.map((h, i) => <th key={i} scope="col" className="px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
          {foot && <tfoot>{foot}</tfoot>}
        </table>
      </div>
    </div>
  )
}
