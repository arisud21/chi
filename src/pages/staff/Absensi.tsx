import { IconFileSpreadsheet, IconFileTypePdf, IconFileWord, IconLock } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { Empty, PageHeader, Table, dateTimeID, useAct, useQueryParam } from '../../components/ui'
import { beritaAcaraUrl, saveAttendance, subjectTeacher, teachesBatch, useStore, type State } from '../../lib/store'
import type { Attendance, ClassSession } from '../../lib/types'
import { buildXlsx, downloadBlob, type Cell } from '../../lib/xlsx'

const OPTIONS: Attendance['status'][] = ['hadir', 'izin', 'sakit', 'alpa']
const SHORT: Record<Attendance['status'], string> = { hadir: 'H', izin: 'I', sakit: 'S', alpa: 'A' }
const dmy = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta' })

/** Absensi per pertemuan, rekap kehadiran (bisa diekspor ke Excel), dan berita acara perkuliahan (Word dan PDF). */
export function Absensi() {
  const [tab, setTab] = useState<'isi' | 'rekap'>(useQueryParam('tab') === 'rekap' ? 'rekap' : 'isi')
  return (
    <>
      <PageHeader title="Absensi dan berita acara" sub="Absensi diisi sekali per pertemuan oleh instruktur pengampu. Setelah tersimpan, perubahan hanya oleh Akademik atau Super Admin." />
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-1" role="tablist" aria-label="Bagian absensi">
        {([['isi', 'Isi absensi'], ['rekap', 'Rekap dan berita acara']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`min-h-9 rounded-md px-4 text-sm font-semibold transition ${tab === k ? 'bg-brand-600 text-white' : 'hover:bg-brand-50'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'isi' ? <IsiAbsensi /> : <Rekap />}
    </>
  )
}

/** Angkatan yang terlihat oleh pengguna ini di menu absensi. */
function useBatches() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const batches = s.batches.filter((b) => b.status !== 'draft' && b.status !== 'cancelled' && (me.role !== 'instruktur' || teachesBatch(s, me.id, b.id)))
  return { s, me, batches }
}

/**
 * Mata pelajaran yang boleh dipilih di satu angkatan. Instruktur hanya melihat yang ia ampu menurut jadwal. Role lain melihat semuanya.
 * `value` terisi otomatis: pilihan pengguna bila masih berlaku, selain itu mata pelajaran pertama milik instruktur (bukan "semua").
 */
function useSubjectChoice(s: State, me: { id: string; role: string }, batchId: string, picked: string) {
  const all = s.batchSubjects.filter((x) => x.batchId === batchId).map((x) => ({ ...x, subject: s.subjects.find((y) => y.id === x.subjectId) }))
  const isInstr = me.role === 'instruktur'
  const mine = isInstr ? all.filter((x) => subjectTeacher(s, batchId, x.subjectId) === me.id) : all
  const options = isInstr && mine.length ? mine : all
  const forced = isInstr && mine.length > 0 // instruktur dengan mata pelajaran sendiri: selalu satu mata pelajaran, tanpa "semua"
  const value = forced ? (options.some((o) => o.subjectId === picked) ? picked : options[0].subjectId) : picked
  return { options, forced, value }
}

/** Keterangan di bawah pilihan mata pelajaran. */
const SubjectHint = ({ n, forced }: { n: number; forced: boolean }) => (forced
  ? <span className="mt-1 block text-xs text-muted">{n > 1 ? `Anda mengampu ${n} mata pelajaran di angkatan ini. Pilih mata pelajaran yang akan diisi.` : 'Terisi otomatis sesuai jadwal pembelajaran Anda.'}</span> : null)

function IsiAbsensi() {
  const { s, me, batches } = useBatches()
  const act = useAct()
  const isAdmin = me.role === 'akademik' || me.role === 'super_admin'
  const qBatch = useQueryParam('batch')
  const [batchId, setBatchId] = useState(batches.some((b) => b.id === qBatch) ? qBatch : batches[0]?.id ?? '')
  const [pickSubj, setPickSubj] = useState('')
  const subject = useSubjectChoice(s, me, batchId, pickSubj)
  // Instruktur hanya mengisi pertemuan mata pelajaran yang ia ampu, dan hanya mata pelajaran yang sedang dipilih.
  const sessions = s.sessions.filter((x) => x.batchId === batchId && (isAdmin || subjectTeacher(s, x.batchId, x.subjectId) === me.id) && (!subject.value || x.subjectId === subject.value)).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const [sid, setSid] = useState('')
  const sess = sessions.find((x) => x.id === sid) ?? sessions[0]
  const people = sess ? s.registrations.filter((r) => r.batchId === sess.batchId && r.status === 'active') : []
  const saved = sess ? s.attendances.filter((a) => a.sessionId === sess.id) : []
  const filled = saved.length > 0
  const locked = filled && !isAdmin
  const [marks, setMarks] = useState<Record<string, Attendance['status']>>({})
  useEffect(() => {
    const m = Object.fromEntries(saved.map((a) => [a.registrationId, a.status]))
    setMarks(Object.fromEntries(people.map((r) => [r.id, m[r.id] ?? 'hadir'])))
  }, [sess?.id, saved.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const subj = (x: ClassSession) => s.subjects.find((y) => y.id === x.subjectId)?.name ?? ''

  if (batches.length === 0) return <div className="card"><Empty title="Belum ada angkatan" body="Angkatan muncul setelah Akademik menugaskan Anda di jadwal pembelajaran." /></div>
  return (
    <div className="card p-5">
      <div className="grid gap-3 sm:grid-cols-[10rem_16rem_1fr]">
        <label className="block"><span className="label">Angkatan</span>
          <select className="input" value={batchId} onChange={(e) => { setBatchId(e.target.value); setPickSubj(''); setSid('') }}>{batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
        </label>
        <label className="block"><span className="label">Mata pelajaran</span>
          <select className="input" value={subject.value} onChange={(e) => { setPickSubj(e.target.value); setSid('') }}>
            {!subject.forced && <option value="">Semua mata pelajaran</option>}
            {subject.options.map((x) => <option key={x.subjectId} value={x.subjectId}>{x.subject?.name}</option>)}
          </select>
          <SubjectHint n={subject.options.length} forced={subject.forced} />
        </label>
        <label className="block"><span className="label">Pertemuan</span>
          <select className="input" value={sess?.id ?? ''} onChange={(e) => setSid(e.target.value)} disabled={!sessions.length}>
            {sessions.map((x, i) => <option key={x.id} value={x.id}>{s.attendances.some((a) => a.sessionId === x.id) ? '✓ ' : ''}{i + 1}. {subj(x)} · {x.title} · {dateTimeID(x.startAt)}</option>)}
          </select>
        </label>
      </div>
      {!sess ? <Empty title="Belum ada pertemuan" body={isAdmin ? 'Instruktur belum menambahkan pertemuan di angkatan ini.' : 'Tambahkan pertemuan mata pelajaran Anda di menu Pertemuan dan materi.'} /> : (
        <>
          {filled && (
            <p className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${locked ? 'bg-amber-50 text-amber-900' : 'bg-brand-50'}`}>
              <IconLock size={18} className="mt-0.5 shrink-0" />
              {locked ? 'Absensi pertemuan ini sudah diisi dan terkunci. Hubungi Admin Akademik bila ada yang perlu diperbaiki.' : 'Absensi pertemuan ini sudah diisi instruktur. Perubahan Anda tercatat di audit log.'}
            </p>
          )}
          {people.length === 0 ? <Empty title="Belum ada peserta aktif" body="Peserta muncul setelah registrasi ulangnya dikonfirmasi dan ditempatkan di angkatan ini." /> : (
            <ul className="mt-4 divide-y divide-line">
              {people.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span><span className="font-semibold">{s.users.find((u) => u.id === r.userId)?.name}</span>{r.nip && <span className="ml-2 font-mono text-xs text-muted">{r.nip}</span>}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label="Status kehadiran">
                    {OPTIONS.map((o) => (
                      <button key={o} role="radio" aria-checked={marks[r.id] === o} disabled={locked} onClick={() => setMarks({ ...marks, [r.id]: o })}
                        className={`btn !min-h-10 !px-3 capitalize disabled:cursor-not-allowed disabled:opacity-70 ${marks[r.id] === o ? 'bg-brand-600 text-white' : 'border border-line bg-white hover:bg-brand-50'}`}>{o}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {people.length > 0 && !locked && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-primary" onClick={() => act(saveAttendance(sess.id, marks), filled ? 'Absensi diperbarui.' : 'Absensi disimpan dan dikunci.')}>{filled ? 'Simpan perubahan' : 'Simpan absensi'}</button>
              {!filled && !isAdmin && <p className="text-sm text-muted">Periksa kembali sebelum menyimpan. Setelah disimpan, Anda tidak dapat mengubahnya.</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Hitung rekap kehadiran satu angkatan, opsional untuk satu mata pelajaran saja. */
function rekapData(s: State, batchId: string, subjectId: string) {
  const people = s.registrations.filter((r) => r.batchId === batchId && (r.status === 'active' || r.status === 'completed'))
    .map((r) => ({ r, name: s.users.find((u) => u.id === r.userId)?.name ?? '' })).sort((a, b) => a.name.localeCompare(b.name))
  const sessions = s.sessions.filter((x) => x.batchId === batchId && (!subjectId || x.subjectId === subjectId)).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const ids = new Set(sessions.map((x) => x.id))
  const rec = s.attendances.filter((a) => ids.has(a.sessionId))
  const held = sessions.filter((x) => rec.some((a) => a.sessionId === x.id)) // pertemuan yang sudah diabsen
  const rows = people.map(({ r, name }) => {
    const mine = rec.filter((a) => a.registrationId === r.id)
    const n = (st: Attendance['status']) => mine.filter((a) => a.status === st).length
    return { r, name, hadir: n('hadir'), izin: n('izin'), sakit: n('sakit'), alpa: n('alpa'), pct: held.length ? Math.round((n('hadir') / held.length) * 100) : null, mark: (sid: string) => mine.find((a) => a.sessionId === sid)?.status }
  })
  return { rows, sessions, held }
}

function Rekap() {
  const { s, me, batches } = useBatches()
  const qBatch = useQueryParam('batch')
  const [batchId, setBatchId] = useState(batches.some((b) => b.id === qBatch) ? qBatch : batches[0]?.id ?? '')
  const [pickSubj, setPickSubj] = useState('')
  const batch = s.batches.find((b) => b.id === batchId)
  const prog = s.programs.find((p) => p.id === batch?.programId)
  // Mata pelajaran terisi otomatis sesuai jadwal. Instruktur yang mengampu lebih dari satu memilih dulu mata pelajaran yang akan dilihat.
  const { options: subjects, forced, value: subjectId } = useSubjectChoice(s, me, batchId, pickSubj)
  // Berita acara mengikuti mata pelajaran terpilih (semua mata pelajaran bila tidak dipilih, hanya untuk role selain instruktur).
  const docs = subjects.filter((x) => !subjectId || x.subjectId === subjectId)
  const { rows, sessions, held } = useMemo(() => rekapData(s, batchId, subjectId), [s, batchId, subjectId])
  const min = prog?.rules.minAttendance ?? 0
  const subjName = (id?: string) => s.subjects.find((y) => y.id === id)?.name ?? ''

  const exportExcel = () => {
    if (!batch) return
    const sumRows: Cell[][] = rows.map((x, i) => [i + 1, x.r.nip ?? '', x.name, x.hadir, x.izin, x.sakit, x.alpa, held.length, x.pct])
    const detail: Cell[][] = rows.map((x, i) => [i + 1, x.r.nip ?? '', x.name, ...sessions.map((ss) => { const m = x.mark(ss.id); return m ? SHORT[m] : '' }), x.pct])
    const blob = buildXlsx([
      { name: 'Rekap', cols: [{ header: 'No', width: 5 }, { header: 'NIP', width: 14 }, { header: 'Nama', width: 32 }, { header: 'Hadir', width: 8 }, { header: 'Izin', width: 8 }, { header: 'Sakit', width: 8 }, { header: 'Alpa', width: 8 }, { header: 'Pertemuan diabsen', width: 18 }, { header: 'Kehadiran (%)', width: 14 }], rows: sumRows },
      { name: 'Per pertemuan', cols: [{ header: 'No', width: 5 }, { header: 'NIP', width: 14 }, { header: 'Nama', width: 32 }, ...sessions.map((ss, i) => ({ header: `P${i + 1} ${dmy(ss.startAt)} ${subjName(ss.subjectId)}`, width: 14 })), { header: 'Kehadiran (%)', width: 14 }], rows: detail },
    ])
    const tag = subjectId ? `-${subjName(subjectId)}` : ''
    downloadBlob(blob, `rekap-absensi-${batch.code}${tag}`.replace(/[^\w.-]+/g, '-') + '.xlsx')
  }

  if (batches.length === 0) return <div className="card"><Empty title="Belum ada angkatan" body="Rekap muncul setelah Anda ditugaskan di jadwal pembelajaran." /></div>
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-56"><span className="label">Angkatan</span>
            <select className="input" value={batchId} onChange={(e) => { setBatchId(e.target.value); setPickSubj('') }}>{batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
          </label>
          <label className="block min-w-56 flex-1"><span className="label">Mata pelajaran</span>
            <select className="input" value={subjectId} onChange={(e) => setPickSubj(e.target.value)}>
              {!forced && <option value="">Semua mata pelajaran</option>}
              {subjects.map((x) => <option key={x.subjectId} value={x.subjectId}>{x.subject?.name}</option>)}
            </select>
            <SubjectHint n={subjects.length} forced={forced} />
          </label>
          <button className="btn-primary" disabled={!rows.length} onClick={exportExcel}><IconFileSpreadsheet size={18} />Export Excel</button>
        </div>
        <p className="mt-3 text-sm text-muted">{prog?.title} · {held.length} dari {sessions.length} pertemuan sudah diabsen · minimal hadir {min}%</p>
      </section>

      {rows.length === 0 ? <div className="card"><Empty title="Belum ada peserta" body="Peserta muncul setelah registrasi ulangnya dikonfirmasi dan ditempatkan di angkatan ini." /></div> : (
        <Table head={['Peserta didik', 'NIP', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Kehadiran']}>
          {rows.map((x) => {
            const low = x.pct !== null && x.pct < min
            return (
              <tr key={x.r.id}>
                <td className="font-semibold">{x.name}</td><td className="font-mono text-xs">{x.r.nip ?? '-'}</td>
                <td className="tabular-nums">{x.hadir}</td><td className="tabular-nums">{x.izin}</td><td className="tabular-nums">{x.sakit}</td>
                <td className={`tabular-nums ${x.alpa ? 'font-semibold text-red-700' : ''}`}>{x.alpa}</td>
                <td>{x.pct === null ? <span className="text-muted">Belum ada absensi</span> : (
                  <div className="flex items-center gap-2" role="img" aria-label={`Kehadiran ${x.pct} persen${low ? ', di bawah minimal' : ''}`}>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${x.pct}%` }} /></div>
                    <span className={`text-sm font-semibold tabular-nums ${low ? 'text-red-700' : ''}`}>{x.pct}%</span>
                  </div>)}</td>
              </tr>
            )
          })}
        </Table>
      )}

      <section className="card p-5">
        <h2 className="font-bold">Berita acara perkuliahan</h2>
        <p className="text-sm text-muted">Log book pelatihan per mata pelajaran sesuai format LPK: tanggal, durasi, materi, dan jumlah kehadiran tiap pertemuan.</p>
        {docs.length === 0 ? <p className="mt-3 text-sm text-muted">Belum ada mata pelajaran di jadwal pembelajaran ini.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {docs.map((x) => {
              const n = s.sessions.filter((y) => y.batchId === batchId && y.subjectId === x.subjectId).length
              return (
                <li key={x.subjectId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm"><span className="font-semibold">{x.subject?.name}</span><span className="block text-xs text-muted">{s.users.find((u) => u.id === subjectTeacher(s, batchId, x.subjectId))?.name ?? 'Instruktur belum ditunjuk'} · {n}/{x.sessions} pertemuan</span></span>
                  <span className="flex gap-2">
                    <a className="btn-ghost !min-h-9" href={beritaAcaraUrl(batchId, x.subjectId, 'docx')}><IconFileWord size={18} />Word</a>
                    <a className="btn-ghost !min-h-9" href={beritaAcaraUrl(batchId, x.subjectId, 'pdf')} target="_blank" rel="noreferrer"><IconFileTypePdf size={18} />PDF</a>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
