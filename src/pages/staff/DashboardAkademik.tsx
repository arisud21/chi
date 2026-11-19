import { IconAlertTriangle } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CountUp, Empty } from '../../components/ui'
import { useStore } from '../../lib/store'
import type { Batch, BatchStatus, Registration } from '../../lib/types'

/*
 * Dashboard bagian akademik: peserta didik per angkatan dan program, per mitra penempatan,
 * kehadiran dan progres pertemuan tiap angkatan, serta status nilai.
 * Semua grafik satu seri (satu warna merek); identitas dibawa label teks, bukan warna.
 */

const STATUS_LABEL: Record<BatchStatus, string> = { draft: 'Draf', open: 'Dibuka', running: 'Berjalan', finished: 'Selesai', cancelled: 'Dibatalkan' }
const isPeserta = (r: Registration) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed')

/** Satu baris grafik batang horizontal: label, batang, nilai. Seluruh baris menjadi target hover dengan tooltip. */
function BarRow({ label, sub, value, max, display, tip, track, marker, warn }: {
  label: ReactNode; sub?: ReactNode; value: number; max: number; display: ReactNode; tip: string
  track?: boolean; marker?: number; warn?: boolean
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <li className="group relative grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-canvas" title={tip}>
      <span className="min-w-0"><span className="block truncate font-semibold">{label}</span>{sub && <span className="block truncate text-xs text-muted">{sub}</span>}</span>
      <span className={`relative h-3 rounded-full ${track ? 'bg-canvas group-hover:bg-white' : ''}`} role="img" aria-label={tip}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand-500 transition-[width] group-hover:bg-brand-600" style={{ width: `${pct}%`, minWidth: value > 0 ? 4 : 0 }} />
        {marker !== undefined && <span className="absolute -inset-y-1 w-0.5 rounded bg-ink/60" style={{ left: `${marker}%` }} aria-hidden />}
      </span>
      <span className={`flex items-center gap-1 whitespace-nowrap text-right font-semibold tabular-nums ${warn ? 'text-red-700' : ''}`}>{warn && <IconAlertTriangle size={14} aria-label="Di bawah batas" />}{display}</span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/3 z-10 mb-1 hidden w-max max-w-72 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:block">{tip}</span>
    </li>
  )
}

function Card({ title, sub, action, children, className = '' }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold">{title}</h2>{sub && <p className="text-sm text-muted">{sub}</p>}</div>{action}</div>
      {children}
    </section>
  )
}

function Tile({ label, value, note, suffix = '' }: { label: string; value: number | null; note: string; suffix?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value === null ? '-' : <><CountUp to={value} />{suffix}</>}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  )
}

export function DashboardAkademik() {
  const s = useStore((x) => x)
  const [prog, setProg] = useState('all')
  const [status, setStatus] = useState<'all' | BatchStatus>('all')
  const [view, setView] = useState<'grafik' | 'tabel'>('grafik')

  const programs = s.programs.filter((p) => !p.archived || s.batches.some((b) => b.programId === p.id))
  const batches = s.batches
    .filter((b) => b.status !== 'cancelled' || status === 'cancelled')
    .filter((b) => prog === 'all' || b.programId === prog)
    .filter((b) => status === 'all' || b.status === status)
    .sort((a, b) => (s.programs.find((p) => p.id === a.programId)?.title ?? '').localeCompare(s.programs.find((p) => p.id === b.programId)?.title ?? '') || (a.angkatan ?? 0) - (b.angkatan ?? 0) || a.code.localeCompare(b.code))
  const batchIds = new Set(batches.map((b) => b.id))
  const peserta = s.registrations.filter((r) => isPeserta(r) && batchIds.has(r.batchId))
  const pesertaIds = new Set(peserta.map((r) => r.id))

  // Per angkatan: jumlah peserta, pertemuan terlaksana (sudah diabsen), kehadiran rata-rata.
  const perBatch = batches.map((b) => {
    const regs = peserta.filter((r) => r.batchId === b.id)
    const ids = new Set(regs.map((r) => r.id))
    const sess = new Set(s.sessions.filter((x) => x.batchId === b.id).map((x) => x.id))
    const rec = s.attendances.filter((a) => ids.has(a.registrationId) && sess.has(a.sessionId))
    const held = new Set(rec.map((a) => a.sessionId)).size
    const attPct = rec.length ? Math.round((rec.filter((a) => a.status === 'hadir').length / rec.length) * 100) : null
    const p = s.programs.find((x) => x.id === b.programId)
    return { b, p, n: regs.length, held, planned: b.plannedSessions || sess.size, attPct, min: p?.rules.minAttendance ?? 0 }
  })
  const maxN = Math.max(1, ...perBatch.map((x) => Math.max(x.n, x.b.quota)))

  // Per mitra: peserta (unik) dengan penempatan yang tidak batal.
  const places = s.placements.filter((pl) => pl.status !== 'batal' && pesertaIds.has(pl.registrationId))
  const perMitra = s.companies.map((c) => {
    const mine = places.filter((pl) => pl.companyId === c.id)
    return { c, n: new Set(mine.map((pl) => pl.registrationId)).size, magang: mine.filter((pl) => pl.kind === 'magang').length, kerja: mine.filter((pl) => pl.kind === 'kerja').length }
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
  const placedIds = new Set(places.map((pl) => pl.registrationId))
  const maxMitra = Math.max(1, ...perMitra.map((x) => x.n))
  const topMitra = perMitra.slice(0, 8)
  const restMitra = perMitra.slice(8)

  // Nilai: status pengisian dan hasil kelulusan peserta di angkatan terpilih.
  const grades = s.grades.filter((g) => pesertaIds.has(g.registrationId))
  const gStat = { belum: peserta.length - grades.length, draft: grades.filter((g) => g.status === 'draft').length, submitted: grades.filter((g) => g.status === 'submitted').length, validated: grades.filter((g) => g.status === 'validated').length }
  const lulus = grades.filter((g) => g.status === 'validated' && g.passed).length
  const tidakLulus = gStat.validated - lulus

  const allRec = perBatch.filter((x) => x.attPct !== null)
  const avgAtt = allRec.length ? Math.round(allRec.reduce((t, x) => t + x.attPct!, 0) / allRec.length) : null
  const running = batches.filter((b) => b.status === 'running').length
  const lowAtt = perBatch.filter((x) => x.attPct !== null && x.attPct < x.min)

  const sel = 'input !min-h-9 !w-auto'
  const subLabel = (b: Batch, prog?: string) => [prog, STATUS_LABEL[b.status]].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5 lg:col-span-3">
      <div className="flex flex-wrap items-center gap-2" aria-label="Filter dashboard akademik">
        <select className={sel} value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Filter program">
          <option value="all">Semua program</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as 'all' | BatchStatus)} aria-label="Filter status angkatan">
          <option value="all">Semua status angkatan</option>{(Object.keys(STATUS_LABEL) as BatchStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        <span className="flex-1" />
        <div role="tablist" aria-label="Tampilan" className="flex rounded-lg border border-line p-0.5 text-sm">
          {(['grafik', 'tabel'] as const).map((k) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`min-h-8 rounded-md px-3 font-semibold ${view === k ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}>{k === 'grafik' ? 'Grafik' : 'Tabel'}</button>)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Peserta didik" value={peserta.length} note={`di ${batches.length} angkatan`} />
        <Tile label="Angkatan berjalan" value={running} note="status Berjalan" />
        <Tile label="Rata-rata kehadiran" value={avgAtt} suffix="%" note={lowAtt.length ? `${lowAtt.length} angkatan di bawah minimal` : 'dari absensi yang tercatat'} />
        <Tile label="Sudah ditempatkan" value={placedIds.size} note={`di ${perMitra.length} mitra, magang atau kerja`} />
      </div>

      {view === 'tabel' ? (
        <Card title="Rekap per angkatan" sub="Data yang sama dengan grafik, dalam bentuk tabel.">
          {perBatch.length === 0 ? <Empty title="Tidak ada angkatan" body="Tidak ada angkatan yang cocok dengan filter ini." /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Angkatan</th><th className="pr-3">Program</th><th className="pr-3">Status</th><th className="pr-3 text-right">Peserta</th><th className="pr-3 text-right">Kuota</th><th className="pr-3 text-right">Pertemuan</th><th className="text-right">Kehadiran</th></tr></thead>
              <tbody>{perBatch.map(({ b, p, n, held, planned, attPct, min }) => (
                <tr key={b.id} className="border-b border-line last:border-0"><td className="py-2 pr-3 font-semibold">{b.code}{b.angkatan ? ` (Angkatan ${b.angkatan})` : ''}</td><td className="pr-3">{p?.title}</td><td className="pr-3">{STATUS_LABEL[b.status]}</td><td className="pr-3 text-right tabular-nums">{n}</td><td className="pr-3 text-right tabular-nums">{b.quota}</td><td className="pr-3 text-right tabular-nums">{held}/{planned || '-'}</td><td className={`text-right tabular-nums ${attPct !== null && attPct < min ? 'font-semibold text-red-700' : ''}`}>{attPct === null ? '-' : `${attPct}%`}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          {perMitra.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Mitra</th><th className="pr-3">Kota</th><th className="pr-3 text-right">Peserta</th><th className="pr-3 text-right">Magang</th><th className="text-right">Kerja</th></tr></thead>
            <tbody>{perMitra.map(({ c, n, magang, kerja }) => <tr key={c.id} className="border-b border-line last:border-0"><td className="py-2 pr-3 font-semibold">{c.name}</td><td className="pr-3">{c.city || '-'}</td><td className="pr-3 text-right tabular-nums">{n}</td><td className="pr-3 text-right tabular-nums">{magang}</td><td className="text-right tabular-nums">{kerja}</td></tr>)}</tbody>
          </table></div>}
        </Card>
      ) : <>
        <Card title="Peserta didik per angkatan" sub="Jumlah peserta didik aktif atau selesai dibanding kuota angkatan." action={<Link to="/admin/jadwal" className="btn-ghost !min-h-9">Jadwal</Link>}>
          {perBatch.length === 0 ? <Empty title="Tidak ada angkatan" body="Tidak ada angkatan yang cocok dengan filter ini." /> : (
            <div className="space-y-4">
              {[...new Set(perBatch.map((x) => x.b.programId))].map((pid) => {
                const rows = perBatch.filter((x) => x.b.programId === pid)
                const p = rows[0].p
                return (
                  <div key={pid}>
                    {prog === 'all' && <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{p?.title ?? 'Program'} · {rows.reduce((t, x) => t + x.n, 0)} peserta</p>}
                    <ul>{rows.map(({ b, n }) => (
                      <BarRow key={b.id} track label={b.angkatan ? `Angkatan ${b.angkatan}` : b.code} sub={subLabel(b, b.code)} value={n} max={maxN}
                        display={<>{n}<span className="font-normal text-muted">/{b.quota}</span></>}
                        tip={`${b.code} · ${p?.title}: ${n} peserta dari kuota ${b.quota}${b.startDate ? `, mulai ${b.startDate}` : ''}`} />
                    ))}</ul>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Peserta per mitra" sub="Peserta didik yang ditempatkan magang atau kerja, tidak termasuk yang batal." action={<Link to="/admin/penempatan" className="btn-ghost !min-h-9">Penempatan</Link>}>
            {perMitra.length === 0 ? <Empty title="Belum ada penempatan" body="Grafik terisi setelah peserta didik ditempatkan di mitra lewat menu Penempatan." /> : <>
              <ul>{topMitra.map(({ c, n, magang, kerja }) => (
                <BarRow key={c.id} label={c.name} sub={[c.city, `${magang} magang · ${kerja} kerja`].filter(Boolean).join(' · ')} value={n} max={maxMitra} display={n}
                  tip={`${c.name}: ${n} peserta (${magang} magang, ${kerja} kerja)`} />
              ))}</ul>
              {restMitra.length > 0 && <p className="mt-2 px-2 text-xs text-muted">Dan {restMitra.length} mitra lain dengan total {restMitra.reduce((t, x) => t + x.n, 0)} peserta. Lihat semua di tampilan Tabel.</p>}
              <p className="mt-3 px-2 text-xs text-muted">{peserta.length - placedIds.size} peserta didik belum ditempatkan.</p>
            </>}
          </Card>

          <Card title="Status nilai" sub="Pengisian nilai oleh instruktur dan validasi akademik." action={<Link to="/admin/nilai" className="btn-ghost !min-h-9">Nilai</Link>}>
            {peserta.length === 0 ? <Empty title="Belum ada peserta" body="Status nilai muncul setelah ada peserta didik di angkatan terpilih." /> : <>
              <ul>
                <BarRow label="Belum diisi" value={gStat.belum + gStat.draft} max={peserta.length} display={gStat.belum + gStat.draft} track tip={`${gStat.belum + gStat.draft} peserta belum diajukan nilainya oleh instruktur`} />
                <BarRow label="Menunggu validasi" value={gStat.submitted} max={peserta.length} display={gStat.submitted} track tip={`${gStat.submitted} nilai diajukan instruktur dan menunggu validasi akademik`} />
                <BarRow label="Tervalidasi" value={gStat.validated} max={peserta.length} display={gStat.validated} track tip={`${gStat.validated} nilai sudah divalidasi`} />
              </ul>
              <p className="mt-3 px-2 text-sm">Hasil tervalidasi: <b className="tabular-nums">{lulus}</b> lulus, <b className="tabular-nums">{tidakLulus}</b> tidak lulus{gStat.validated ? ` (${Math.round((lulus / gStat.validated) * 100)}% lulus)` : ''}.</p>
            </>}
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Kehadiran per angkatan" sub="Persentase hadir dari absensi yang tercatat. Garis tegak menandai minimal kehadiran program." action={<Link to="/admin/absensi" className="btn-ghost !min-h-9">Absensi</Link>}>
          {perBatch.every((x) => x.attPct === null) ? <Empty title="Belum ada absensi" body="Grafik terisi setelah instruktur mencatat absensi pertemuan." /> : (
            <ul>{perBatch.filter((x) => x.attPct !== null).map(({ b, p, attPct, min }) => (
              <BarRow key={b.id} track label={b.code} sub={p?.title} value={attPct!} max={100} marker={min} warn={attPct! < min}
                display={`${attPct}%`} tip={`${b.code}: kehadiran ${attPct}%, minimal ${min}%${attPct! < min ? ' (di bawah minimal)' : ''}`} />
            ))}</ul>
          )}
        </Card>

        <Card title="Progres pertemuan" sub="Pertemuan yang sudah diabsen dibanding rencana pertemuan angkatan.">
          {perBatch.filter((x) => x.b.status === 'running' || x.held > 0).length === 0 ? <Empty title="Belum ada pertemuan" body="Progres muncul setelah angkatan berjalan dan pertemuan pertama diabsen." /> : (
            <ul>{perBatch.filter((x) => x.b.status === 'running' || x.held > 0).map(({ b, p, held, planned }) => (
              <BarRow key={b.id} track label={b.code} sub={p?.title} value={held} max={Math.max(planned, held, 1)}
                display={<>{held}<span className="font-normal text-muted">/{planned || '?'}</span></>}
                tip={`${b.code}: ${held} dari ${planned || 'belum ditentukan'} pertemuan sudah terlaksana`} />
            ))}</ul>
          )}
        </Card>
        </div>
      </>}
    </div>
  )
}
