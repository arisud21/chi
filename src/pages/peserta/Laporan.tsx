import { Link } from 'react-router-dom'
import { Empty, PageHeader, Table, dateID } from '../../components/ui'
import { bobotBerlaku, hurufOf, nilaiMapel } from '../../lib/nilaiMapel'
import { finalScore, useStore } from '../../lib/store'
import { Chip } from '../staff/Penempatan'
import { LockedNotice } from './DataDiri'
import { useMe } from './Peserta'

const fmt = (n: number) => String(Math.round(n * 10) / 10)
const STATUS: Record<string, string> = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa' }

/** Laporan peserta: rekap kehadiran dan nilai akhir tiap mata pelajaran dalam bentuk tabel. */
export function Laporan() {
  const { s, me, regs } = useMe()
  const store = useStore((x) => x)
  const learning = regs.filter((r) => (r.status === 'active' || r.status === 'completed') && r.batchId)
  if (!learning.length) return <><PageHeader title="Laporan" /><div className="card"><Empty title="Laporan belum tersedia" body="Laporan terbuka setelah Anda aktif belajar di sebuah angkatan." action={<Link to="/app" className="btn-primary">Ke beranda</Link>} /></div></>
  if (!me.profileDone) return <><PageHeader title="Laporan" /><LockedNotice /></>

  return (
    <>
      <PageHeader title="Laporan" sub="Rekap kehadiran dan nilai akhir tiap mata pelajaran. Nilai tampil setelah divalidasi Akademik." />
      <div className="space-y-8">
        {learning.map((r) => {
          const b = s.batches.find((x) => x.id === r.batchId)
          const p = s.programs.find((x) => x.id === r.programId)
          const subs = s.batchSubjects.filter((x) => x.batchId === r.batchId).map((x) => ({ x, subject: s.subjects.find((y) => y.id === x.subjectId) })).filter((x) => x.subject)
            .sort((a, c) => a.subject!.name.localeCompare(c.subject!.name))
          const g = s.grades.find((x) => x.registrationId === r.id)
          const kkm = p?.rules.passingScore ?? 70

          // Rekap kehadiran per mata pelajaran.
          const hadirRows = subs.map(({ x, subject }) => {
            const sessions = s.sessions.filter((y) => y.batchId === r.batchId && y.subjectId === x.subjectId)
            const marks = sessions.map((y) => s.attendances.find((a) => a.sessionId === y.id && a.registrationId === r.id)?.status)
            const diabsen = new Set(s.attendances.filter((a) => sessions.some((y) => y.id === a.sessionId)).map((a) => a.sessionId)).size
            const n = (st: string) => marks.filter((m) => m === st).length
            const pct = diabsen ? Math.min(100, Math.round((n('hadir') / diabsen) * 100)) : null
            return { key: x.subjectId, name: subject!.name, teacher: s.users.find((u) => u.id === x.instructorId)?.name ?? '-', planned: x.sessions, made: sessions.length, diabsen, hadir: n('hadir'), izin: n('izin'), sakit: n('sakit'), alpa: n('alpa'), pct }
          })
          const tot = hadirRows.reduce((t, x) => ({ diabsen: t.diabsen + x.diabsen, hadir: t.hadir + x.hadir, izin: t.izin + x.izin, sakit: t.sakit + x.sakit, alpa: t.alpa + x.alpa }), { diabsen: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 })
          const minHadir = p?.rules.minAttendance ?? 80

          // Nilai akhir per mata pelajaran (hanya yang sudah divalidasi).
          const nilaiRows = subs.map(({ x, subject }) => {
            const ok = store.subjectGrades.some((y) => y.registrationId === r.id && y.subjectId === x.subjectId && y.status === 'validated')
            return { key: x.subjectId, name: subject!.name, ok, v: ok ? nilaiMapel(store, r.batchId!, x.subjectId, r.id) : null, w: bobotBerlaku(store, r.batchId!, x.subjectId).w }
          })

          // Nilai magang yang sudah diinput Akademik.
          const magangRows = store.placements.filter((x) => x.registrationId === r.id && x.kind === 'magang' && x.status !== 'batal')
            .map((x) => ({ ...x, company: store.companies.find((c) => c.id === x.companyId)?.name ?? '-' }))

          return (
            <section key={r.id} className="space-y-5">
              <div><h2 className="font-display text-xl font-bold">{p?.title}</h2><p className="text-sm text-muted">Angkatan {b?.code} · {me.name}</p></div>

              <div className="card overflow-hidden">
                <div className="p-5 pb-3"><h3 className="font-bold">Rekap kehadiran</h3><p className="text-sm text-muted">Dihitung dari pertemuan yang sudah diabsen. Minimal kehadiran {minHadir}%.</p></div>
                {hadirRows.length === 0 ? <Empty title="Belum ada jadwal mata pelajaran" body="Rekap muncul setelah Akademik menetapkan jadwal angkatan Anda." /> : (
                  <Table bare head={['Mata pelajaran', 'Pengampu', 'Pertemuan', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Kehadiran']}>
                    {hadirRows.map((x) => (
                      <tr key={x.key}>
                        <td className="font-semibold">{x.name}</td><td>{x.teacher}</td>
                        <td className="tabular-nums">{x.diabsen} diabsen / {x.planned}</td>
                        <td className="tabular-nums">{x.hadir}</td><td className="tabular-nums">{x.izin}</td><td className="tabular-nums">{x.sakit}</td><td className="tabular-nums">{x.alpa}</td>
                        <td>{x.pct == null ? <span className="text-muted">Belum ada absensi</span> : <b className={`tabular-nums ${x.pct < minHadir ? 'text-red-700' : 'text-emerald-700'}`}>{x.pct}%</b>}</td>
                      </tr>
                    ))}
                    <tr className="bg-canvas font-bold">
                      <td colSpan={2}>Total</td><td className="tabular-nums">{tot.diabsen} diabsen</td><td className="tabular-nums">{tot.hadir}</td><td className="tabular-nums">{tot.izin}</td><td className="tabular-nums">{tot.sakit}</td><td className="tabular-nums">{tot.alpa}</td>
                      <td className="tabular-nums">{tot.diabsen ? `${Math.min(100, Math.round((tot.hadir / tot.diabsen) * 100))}%` : '-'}</td>
                    </tr>
                  </Table>
                )}
                <p className="px-5 py-3 text-xs text-muted">Keterangan: {Object.values(STATUS).join(', ')}. Status "Hadir" dihitung sebagai kehadiran.</p>
              </div>

              <div className="card overflow-hidden">
                <div className="p-5 pb-3"><h3 className="font-bold">Nilai akhir tiap mata pelajaran</h3><p className="text-sm text-muted">Nilai terbobot dari absensi, tugas, teori, dan praktik sesuai bobot Akademik. Batas lulus {kkm}.</p></div>
                {nilaiRows.length === 0 ? <Empty title="Belum ada mata pelajaran" body="Nilai muncul setelah jadwal angkatan ditetapkan." /> : (
                  <Table bare head={['Mata pelajaran', 'Absensi', 'Tugas', 'Teori', 'Praktik', 'Nilai angka', 'Huruf']}>
                    {nilaiRows.map((x) => (
                      <tr key={x.key}>
                        <td className="font-semibold">{x.name}</td>
                        {x.v ? <>
                          <td className="tabular-nums">{x.v.absensiPct}%</td>
                          <td className="tabular-nums">{x.w.tugas && x.v.tugas != null ? fmt(x.v.tugas) : '-'}</td>
                          <td className="tabular-nums">{x.w.teori && x.v.teori != null ? fmt(x.v.teori) : '-'}</td>
                          <td className="tabular-nums">{x.w.praktik && x.v.praktik != null ? fmt(x.v.praktik) : '-'}</td>
                          <td><b className="tabular-nums">{fmt(x.v.akhir)}</b></td>
                          <td><b>{x.v.huruf}</b></td>
                        </> : <td colSpan={6} className="text-muted">Belum divalidasi Akademik</td>}
                      </tr>
                    ))}
                    {g && p && (
                      <tr className="bg-canvas font-bold">
                        <td>Nilai akhir program</td><td colSpan={4} className={g.passed && r.status === 'completed' ? 'text-emerald-700' : 'text-red-700'}>{g.passed ? (r.status === 'completed' ? 'Lulus' : `Belum lulus: menunggu ${magangRows.some((m) => m.score != null) ? 'pelunasan pembayaran' : 'nilai magang dari Akademik'}${magangRows.some((m) => m.score != null) || r.paidOff ? '' : ' dan pelunasan'}`) : 'Tidak lulus'}</td><td className="tabular-nums">{fmt(finalScore(g, p))}</td><td />
                      </tr>
                    )}
                  </Table>
                )}
              </div>
              {magangRows.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="p-5 pb-3"><h3 className="font-bold">Nilai magang</h3><p className="text-sm text-muted">Nilai magang diinput Akademik setelah magang selesai dan ikut dihitung dalam transkrip akhir pelatihan.</p></div>
                  <Table bare head={['Perusahaan', 'Posisi', 'Periode', 'Status', 'Nilai magang', 'Huruf']}>
                    {magangRows.map((m) => (
                      <tr key={m.id}>
                        <td className="font-semibold">{m.company}</td><td>{m.position || '-'}</td>
                        <td className="text-sm">{dateID(m.startDate)}{m.endDate ? ` s.d. ${dateID(m.endDate)}` : ''}</td>
                        <td><Chip status={m.status} /></td>
                        {m.score != null ? <><td><b className="tabular-nums">{fmt(m.score)}</b></td><td><b>{hurufOf(m.score, store.gradeLetters)}</b></td></> : <td colSpan={2} className="text-muted">{m.status === 'selesai' ? 'Belum dinilai Akademik' : 'Dinilai setelah magang selesai'}</td>}
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
