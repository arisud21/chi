import { IconBuildingStore, IconCalendarEvent, IconChartBar, IconPercentage, IconSchool, IconTable } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { BarList, DashHeader, DashSelect, Kpi, KpiRow, Panel, Progress, TrackerTable, type Datum } from '../../components/dash'
import { Empty } from '../../components/ui'
import { useStore } from '../../lib/store'
import { ROLE_LABEL, type BatchStatus, type Registration } from '../../lib/types'

/*
 * Dashboard bagian akademik: peserta didik per angkatan dan program, per mitra penempatan,
 * kehadiran dan progres pertemuan tiap angkatan, serta status nilai. Setiap angka menuju menu terkait.
 * Semua grafik satu seri (satu warna merek); identitas dibawa label teks, bukan warna.
 */

const STATUS_LABEL: Record<BatchStatus, string> = { draft: 'Draf', open: 'Dibuka', running: 'Berjalan', finished: 'Selesai', cancelled: 'Dibatalkan' }
const isPeserta = (r: Registration) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed')

export function DashboardAkademik({ todo }: { todo?: ReactNode }) {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)
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

  // Tujuan klik: peserta per angkatan, jadwal angkatan, rekap absensi angkatan, validasi nilai angkatan.
  const toPeserta = (id: string) => `/admin/peserta?batch=${id}`
  const toJadwal = (pid: string, id: string) => `/admin/jadwal?program=${pid}&batch=${id}`
  const toAbsen = (id: string) => `/admin/absensi?tab=rekap&batch=${id}`
  const oneBatch = batches.length === 1 ? batches[0].id : ''
  const toNilai = `/admin/validasi-nilai${oneBatch ? `?batch=${oneBatch}` : ''}`

  const toggle = (
    <div role="tablist" aria-label="Tampilan" className="flex rounded-lg bg-white/10 p-0.5 text-sm">
      {(['grafik', 'tabel'] as const).map((k) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`inline-flex min-h-8 items-center gap-1 rounded-md px-3 font-semibold ${view === k ? 'bg-white text-brand-700' : 'text-white hover:bg-white/10'}`}>{k === 'grafik' ? <><IconChartBar size={15} />Grafik</> : <><IconTable size={15} />Tabel</>}</button>)}
    </div>
  )

  return (
    <>
      <DashHeader title="Ringkasan akademik" sub={me ? `${me.name} · ${ROLE_LABEL[me.role]}` : undefined}>
        <DashSelect label="Filter program" value={prog} onChange={setProg}>
          <option value="all">Semua program</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </DashSelect>
        <DashSelect label="Filter status angkatan" value={status} onChange={(v) => setStatus(v as 'all' | BatchStatus)}>
          <option value="all">Semua status</option>{(Object.keys(STATUS_LABEL) as BatchStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </DashSelect>
        {toggle}
      </DashHeader>

      <KpiRow>
        <Kpi to={oneBatch ? toPeserta(oneBatch) : '/admin/peserta'} icon={IconSchool} label="Peserta didik" value={peserta.length} note={`di ${batches.length} angkatan`} />
        <Kpi to="/admin/jadwal" icon={IconCalendarEvent} label="Angkatan berjalan" value={running} note="Status Berjalan" />
        <Kpi to="/admin/absensi?tab=rekap" icon={IconPercentage} label="Rata-rata kehadiran" value={avgAtt} suffix="%" note={lowAtt.length ? `${lowAtt.length} angkatan di bawah minimal` : 'Dari absensi yang tercatat'} tone={lowAtt.length ? 'warn' : 'brand'} />
        <Kpi to="/admin/penempatan" icon={IconBuildingStore} label="Sudah ditempatkan" value={placedIds.size} note={`di ${perMitra.length} mitra, magang atau kerja`} tone="good" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-3">
        {view === 'tabel' ? <>
          <Panel title="Rekap per angkatan" sub="Klik baris untuk membuka peserta didik angkatan itu." flush className="xl:col-span-2">
            {perBatch.length === 0 ? <Empty title="Tidak ada angkatan" body="Tidak ada angkatan yang cocok dengan filter ini." /> : (
              <TrackerTable head={['Angkatan', 'Program', 'Status', 'Peserta', 'Kuota', 'Pertemuan', 'Kehadiran']} rows={perBatch.map(({ b, p, n, held, planned, attPct, min }) => ({
                key: b.id, to: toPeserta(b.id), label: `Peserta didik ${b.code}`,
                cells: [`${b.code}${b.angkatan ? ` (Angkatan ${b.angkatan})` : ''}`, p?.title ?? '-', STATUS_LABEL[b.status], n, b.quota, `${held}/${planned || '-'}`,
                  <span className={attPct !== null && attPct < min ? 'font-semibold text-red-700' : ''}>{attPct === null ? '-' : `${attPct}%`}</span>],
              }))} />
            )}
          </Panel>
          {todo}
          {perMitra.length > 0 && (
            <Panel title="Rekap per mitra" sub="Klik baris untuk membuka menu Penempatan." flush className="xl:col-span-3">
              <TrackerTable head={['Mitra', 'Kota', 'Peserta', 'Magang', 'Kerja']} rows={perMitra.map(({ c, n, magang, kerja }) => ({
                key: c.id, to: '/admin/penempatan', label: `Penempatan di ${c.name}`, cells: [c.name, c.city || '-', n, magang, kerja],
              }))} />
            </Panel>
          )}
        </> : <>
          <Panel title="Peserta didik per angkatan" sub="Peserta aktif atau selesai dibanding kuota. Klik untuk membuka daftar pesertanya." to="/admin/peserta" linkLabel="Peserta didik" className="xl:col-span-2">
            {perBatch.length === 0 ? <Empty title="Tidak ada angkatan" body="Tidak ada angkatan yang cocok dengan filter ini." /> : (
              <div className="space-y-4">
                {[...new Set(perBatch.map((x) => x.b.programId))].map((pid) => {
                  const rows = perBatch.filter((x) => x.b.programId === pid)
                  const p = rows[0].p
                  return (
                    <div key={pid}>
                      {prog === 'all' && <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{p?.title ?? 'Program'} · {rows.reduce((t, x) => t + x.n, 0)} peserta</p>}
                      <BarList max={maxN} data={rows.map(({ b, n }): Datum => ({
                        key: b.id, label: b.angkatan ? `Angkatan ${b.angkatan}` : b.code, sub: `${b.code} · ${STATUS_LABEL[b.status]}`, value: n, to: toPeserta(b.id),
                        display: <>{n}<span className="font-normal text-muted">/{b.quota}</span></>, tip: `${b.code} · ${p?.title}: ${n} peserta dari kuota ${b.quota}`,
                      }))} />
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          {todo}

          <Panel title="Peserta per mitra" sub="Ditempatkan magang atau kerja, tidak termasuk yang batal." to="/admin/penempatan" linkLabel="Penempatan">
            {perMitra.length === 0 ? <Empty title="Belum ada penempatan" body="Grafik terisi setelah peserta didik ditempatkan di mitra lewat menu Penempatan." /> : <>
              <BarList data={topMitra.map(({ c, n, magang, kerja }) => ({ key: c.id, label: c.name, sub: `${magang} magang · ${kerja} kerja`, value: n, to: '/admin/penempatan', tip: `${c.name}: ${n} peserta (${magang} magang, ${kerja} kerja)` }))} />
              {restMitra.length > 0 && <p className="mt-2 px-2 text-xs text-muted">Dan {restMitra.length} mitra lain dengan total {restMitra.reduce((t, x) => t + x.n, 0)} peserta. Lihat semua di tampilan Tabel.</p>}
              <p className="mt-3 px-2 text-xs text-muted">{peserta.length - placedIds.size} peserta didik belum ditempatkan.</p>
            </>}
          </Panel>

          <Panel title="Status nilai" sub="Pengisian nilai oleh instruktur dan validasi akademik." to={toNilai} linkLabel="Validasi nilai">
            {peserta.length === 0 ? <Empty title="Belum ada peserta" body="Status nilai muncul setelah ada peserta didik di angkatan terpilih." /> : <>
              <BarList max={peserta.length} data={[
                { key: 'belum', label: 'Belum diisi', value: gStat.belum + gStat.draft, to: toNilai, tip: `${gStat.belum + gStat.draft} peserta belum diajukan nilainya oleh instruktur` },
                { key: 'submitted', label: 'Menunggu validasi', value: gStat.submitted, to: toNilai, tip: `${gStat.submitted} nilai menunggu validasi akademik` },
                { key: 'validated', label: 'Tervalidasi', value: gStat.validated, to: toNilai, tip: `${gStat.validated} nilai sudah divalidasi` },
              ]} />
              <p className="mt-3 px-2 text-sm">Hasil tervalidasi: <b className="tabular-nums">{lulus}</b> lulus, <b className="tabular-nums">{tidakLulus}</b> tidak lulus{gStat.validated ? ` (${Math.round((lulus / gStat.validated) * 100)}% lulus)` : ''}.</p>
            </>}
          </Panel>

          <Panel title="Kehadiran per angkatan" sub="Persentase hadir. Garis tegak = minimal kehadiran program." to="/admin/absensi?tab=rekap" linkLabel="Absensi">
            {perBatch.every((x) => x.attPct === null) ? <Empty title="Belum ada absensi" body="Grafik terisi setelah instruktur mencatat absensi pertemuan." /> : (
              <BarList max={100} marker={(d) => perBatch.find((x) => x.b.id === d.key)?.min} warn={(d) => { const x = perBatch.find((y) => y.b.id === d.key); return !!x && x.attPct! < x.min }}
                data={perBatch.filter((x) => x.attPct !== null).map(({ b, p, attPct, min }) => ({
                  key: b.id, label: b.code, sub: p?.title, value: attPct!, display: `${attPct}%`, to: toAbsen(b.id),
                  tip: `${b.code}: kehadiran ${attPct}%, minimal ${min}%${attPct! < min ? ' (di bawah minimal)' : ''}`,
                }))} />
            )}
          </Panel>

          <Panel title="Progres pertemuan" sub="Pertemuan yang sudah diabsen dibanding rencana. Klik untuk membuka jadwal angkatan." to="/admin/jadwal" linkLabel="Jadwal" className="xl:col-span-3" flush>
            {perBatch.filter((x) => x.b.status === 'running' || x.held > 0).length === 0 ? <Empty title="Belum ada pertemuan" body="Progres muncul setelah angkatan berjalan dan pertemuan pertama diabsen." /> : (
              <TrackerTable head={['Angkatan', 'Program', 'Status', 'Terlaksana', 'Progres']} rows={perBatch.filter((x) => x.b.status === 'running' || x.held > 0).map(({ b, p, held, planned }) => ({
                key: b.id, to: toJadwal(b.programId, b.id), label: `Jadwal ${b.code}`,
                cells: [b.code, p?.title ?? '-', STATUS_LABEL[b.status], <span className="tabular-nums">{held}/{planned || '?'}</span>, <Progress value={held} max={Math.max(planned, held, 1)} />],
              }))} />
            )}
          </Panel>
        </>}
      </div>
    </>
  )
}
