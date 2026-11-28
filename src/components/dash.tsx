import { IconArrowRight } from '@tabler/icons-react'
import { useState, type ComponentType, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CountUp } from './ui'

/*
 * Komponen dashboard bergaya laporan spreadsheet: pita judul, deretan kartu KPI, panel berjudul,
 * grafik kolom, donat, dan batang. Semua warna dari tema (brand-*), dan setiap angka bisa diklik
 * menuju menu yang berkaitan.
 */

/** Pita judul dashboard: judul, keterangan, tanggal hari ini, dan slot filter di kanan. */
export function DashHeader({ title, sub, photo, children }: { title: string; sub?: string; photo?: { src: string; alt: string; to?: string }; children?: ReactNode }) {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <header className="mb-5 overflow-hidden rounded-2xl bg-brand-700 text-white shadow-[0_6px_18px_-10px_rgba(26,42,68,0.6)] animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-4">
          {photo && (photo.to
            ? <Link to={photo.to} className="shrink-0" aria-label="Ubah foto di menu Data diri"><img src={photo.src} alt={photo.alt} className="size-16 rounded-full object-cover ring-2 ring-white/60" /></Link>
            : <img src={photo.src} alt={photo.alt} className="size-16 shrink-0 rounded-full object-cover ring-2 ring-white/60" />)}
          <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">Dashboard</p>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-brand-100">{sub}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-brand-50">{today}</span>
        </div>
      </div>
      <div aria-hidden className="h-1 bg-linear-to-r from-brand-500 via-brand-200 to-brand-500" />
    </header>
  )
}

/** Pilihan filter di dalam pita judul (latar gelap). */
export function DashSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="min-h-9 rounded-lg border border-white/20 bg-white/10 px-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-200 [&>option]:text-ink">
      {children}
    </select>
  )
}

/** Deretan kartu KPI. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">{children}</div>
}

/** Kartu KPI yang bisa diklik: ikon, label, angka besar, catatan. */
export function Kpi({ to, icon: Icon, label, value, display, suffix = '', note, tone = 'brand' }: {
  to: string; icon: ComponentType<{ size?: number; className?: string }>; label: string
  value?: number | null; display?: ReactNode; suffix?: string; note?: ReactNode; tone?: 'brand' | 'warn' | 'good'
}) {
  const accent = tone === 'warn' ? 'border-l-amber-500' : tone === 'good' ? 'border-l-emerald-600' : 'border-l-brand-600'
  const chip = tone === 'warn' ? 'bg-amber-50 text-amber-700' : tone === 'good' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-600'
  return (
    <Link to={to} className={`card card-link group flex items-start gap-3 border-l-4 p-4 ${accent}`}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${chip}`}><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="mt-0.5 block truncate text-2xl font-bold tabular-nums text-ink">
          {display ?? (value === null || value === undefined ? '-' : <><CountUp to={value} />{suffix}</>)}
        </span>
        {note && <span className="mt-0.5 block truncate text-xs text-muted">{note}</span>}
      </span>
      <IconArrowRight size={16} className="mt-1 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  )
}

/** Panel berjudul dengan pita kepala, seperti blok grafik di laporan spreadsheet. */
export function Panel({ title, sub, to, linkLabel = 'Buka', action, children, className = '', flush = false }: {
  title: string; sub?: string; to?: string; linkLabel?: string; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean
}) {
  return (
    <section className={`card flex flex-col overflow-hidden ${className}`} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50/70 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-700">{title}</h2>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {to && <Link to={to} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-600 hover:bg-white">{linkLabel}<IconArrowRight size={14} /></Link>}
        </div>
      </div>
      <div className={flush ? 'flex-1' : 'flex-1 p-4'}>{children}</div>
    </section>
  )
}

export interface Datum { key: string; label: string; value: number; to: string; tip?: string; sub?: string; display?: ReactNode }

/** Grafik kolom (batang tegak). Tiap kolom adalah tautan. */
export function ColumnChart({ data, format = (n) => String(n), height = 'h-44' }: { data: Datum[]; format?: (n: number) => string; height?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className={`flex ${height} items-end gap-2`}>
      {data.map((d, i) => (
        <li key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center">
          <Link to={d.to} title={d.tip ?? `${d.label}: ${format(d.value)}`} aria-label={d.tip ?? `${d.label}: ${format(d.value)}`}
            className="group flex w-full flex-1 flex-col items-center justify-end rounded-md px-0.5 pt-1 hover:bg-brand-50">
            <span className="mb-1 truncate text-[11px] font-semibold tabular-nums text-ink">{d.value ? format(d.value) : ''}</span>
            <span className="w-full max-w-12 origin-bottom animate-[rise_0.6s_ease-out_both] rounded-t-md bg-brand-500 transition group-hover:bg-brand-600"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0, animationDelay: `${i * 50}ms` }} />
          </Link>
          <span className="mt-1 w-full truncate text-center text-[11px] text-muted">{d.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Gradasi warna tema untuk irisan donat; identitas irisan tetap dibawa label legenda. */
const SHADES = ['#1a2a44', '#2c4568', '#395886', '#4f7dbd', '#628ecb', '#b1c9ef', '#d5deef', '#5a6b82', '#0f1a2c']

/** Donat dengan legenda. Irisan dan baris legenda bisa diklik. */
export function Donut({ data, center, centerLabel }: { data: Datum[]; center: ReactNode; centerLabel: string }) {
  const nav = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const total = data.reduce((t, d) => t + d.value, 0)
  const R = 15.915 // keliling 100
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative mx-auto size-40 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" role="img" aria-label={`${centerLabel}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          <circle cx="21" cy="21" r={R} fill="none" stroke="var(--color-canvas)" strokeWidth="6" />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * 100
            const off = acc; acc += len
            if (!d.value) return null
            return (
              <circle key={d.key} cx="21" cy="21" r={R} fill="none" stroke={SHADES[i % SHADES.length]} strokeWidth={hover === d.key ? 7.5 : 6}
                strokeDasharray={`${Math.max(0, len - 0.6)} ${100 - Math.max(0, len - 0.6)}`} strokeDashoffset={-off}
                className="cursor-pointer transition-[stroke-width]" onClick={() => nav(d.to)}
                onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}><title>{d.tip ?? `${d.label}: ${d.value}`}</title></circle>
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><p className="text-2xl font-bold tabular-nums">{center}</p><p className="text-[11px] text-muted">{centerLabel}</p></div>
        </div>
      </div>
      <ul className="min-w-48 flex-1 space-y-0.5 text-sm">
        {data.map((d, i) => (
          <li key={d.key}>
            <Link to={d.to} onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d.key)} onBlur={() => setHover(null)}
              className={`flex min-h-8 items-center gap-2 rounded-md px-2 hover:bg-brand-50 ${hover === d.key ? 'bg-brand-50' : ''}`}>
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: SHADES[i % SHADES.length] }} />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="font-semibold tabular-nums">{d.value}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Batang mendatar; tiap baris adalah tautan. `max` dipakai bersama agar baris sebanding. */
export function BarList({ data, max, marker, warn }: { data: Datum[]; max?: number; marker?: (d: Datum) => number | undefined; warn?: (d: Datum) => boolean }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-0.5">
      {data.map((d, i) => {
        const pct = top > 0 ? Math.min(100, (d.value / top) * 100) : 0
        const m = marker?.(d)
        const bad = warn?.(d)
        return (
          <li key={d.key}>
            <Link to={d.to} title={d.tip} className="group grid min-h-10 grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-brand-50">
              <span className="min-w-0"><span className="block truncate font-semibold">{d.label}</span>{d.sub && <span className="block truncate text-xs text-muted">{d.sub}</span>}</span>
              <span className="relative h-3 rounded-full bg-canvas group-hover:bg-white">
                <span className="absolute inset-y-0 left-0 origin-left animate-bar rounded-full bg-brand-500 group-hover:bg-brand-600" style={{ width: `${pct}%`, minWidth: d.value > 0 ? 4 : 0, animationDelay: `${i * 60}ms` }} />
                {m !== undefined && <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded bg-ink/60" style={{ left: `${m}%` }} />}
              </span>
              <span className={`whitespace-nowrap text-right font-semibold tabular-nums ${bad ? 'text-red-700' : ''}`}>{d.display ?? d.value}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Tabel ringkas bergaya pelacak proyek; seluruh baris bisa diklik. */
export function TrackerTable({ head, rows }: { head: string[]; rows: { key: string; to: string; label: string; cells: ReactNode[] }[] }) {
  const nav = useNavigate()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead><tr className="bg-brand-600 text-left text-[11px] uppercase tracking-wide text-white">{head.map((h, i) => <th key={i} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} onClick={() => nav(r.to)} className={`cursor-pointer border-b border-line last:border-0 hover:bg-brand-50 ${i % 2 ? 'bg-canvas/60' : ''}`}>
              {r.cells.map((c, j) => <td key={j} className="px-4 py-2.5 align-middle">{j === 0 ? <Link to={r.to} className="font-semibold text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()} aria-label={r.label}>{c}</Link> : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Batang progres kecil untuk sel tabel. */
export function Progress({ value, max, warn = false }: { value: number; max: number; warn?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-24 overflow-hidden rounded-full bg-canvas"><span className={`block h-full rounded-full ${warn ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} /></span>
      <span className="text-xs font-semibold tabular-nums">{pct}%</span>
    </span>
  )
}

/** Enam bulan terakhir (termasuk bulan ini) sebagai kunci YYYY-MM dan label singkat. */
export function lastMonths(n = 6) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('id-ID', { month: 'short' }) + (d.getMonth() === 0 || i === 0 ? ` ${String(d.getFullYear()).slice(2)}` : '') }
  })
}
export const monthOf = (iso: string) => (iso ? iso.slice(0, 7) : '')
/** Rupiah ringkas untuk label grafik: 1,2 jt, 350 rb. */
export const rupiahShort = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(n))
