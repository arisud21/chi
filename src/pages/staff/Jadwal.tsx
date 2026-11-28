import { IconPencil, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Empty, Field, Modal, PageHeader, Table, dateID, useAct, useQueryParam } from '../../components/ui'
import { batchCurriculumId, currentCurriculum, deleteJadwal, newId, saveBatch, saveJadwal, setBatchCurriculum, subjectFitsBatch, useStore, type JadwalInput } from '../../lib/store'
import type { Batch, Subject, User } from '../../lib/types'
import { SUBJECT_KIND } from './ImporMapel'
import { ImportJadwalModal } from './JadwalImport'

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/**
 * Instruktur yang cocok untuk mata pelajaran: salah satu program yang ia ampu sama, atau (untuk kelas gabungan) instruktur kelas gabungan
 * atau program salah satu angkatan yang ikut. Yang belum memilih program tetap ditampilkan.
 */
const fits = (u: User, x: Subject | undefined, gabungan: boolean, programIds: string[]) => !x || !u.instructorPrograms?.length
  || u.instructorPrograms.includes(x.programId === '' ? 'gabungan' : x.programId)
  || (gabungan && (u.instructorPrograms.includes('gabungan') || programIds.some((p) => u.instructorPrograms!.includes(p))))

/** Akademik menyusun jadwal pembelajaran tiap angkatan satu per satu: satu jadwal untuk satu mata pelajaran dan instruktur pengampunya. */
export function Jadwal() {
  const s = useStore((x) => x)
  const act = useAct()
  const programs = s.programs.filter((p) => !p.archived)
  const qProgram = useQueryParam('program')
  const [programId, setProgramId] = useState(programs.some((p) => p.id === qProgram) ? qProgram : programs[0]?.id ?? '')
  const batches = s.batches.filter((b) => b.programId === programId && b.status !== 'cancelled' && b.status !== 'finished')
  const active = s.batches.filter((b) => b.status !== 'cancelled' && b.status !== 'finished') // semua program, untuk kelas gabungan
  const [pickedBatch, setBatchId] = useState(useQueryParam('batch'))
  const batch = batches.find((b) => b.id === pickedBatch) ?? batches[0]
  const [f, setF] = useState<JadwalInput | null>(null)
  const [gab, setGab] = useState(false) // jadwal ini kelas gabungan dengan angkatan lain (boleh lintas pelatihan)
  const [nb, setNb] = useState<Batch | null>(null)
  const [del, setDel] = useState<{ subjectId: string; name: string; group: string[] } | null>(null)
  const [imp, setImp] = useState(false)
  const instructors = s.users.filter((u) => u.role === 'instruktur' && u.active)
  const name = (id: string) => s.users.find((u) => u.id === id)?.name
  const code = (id: string) => s.batches.find((b) => b.id === id)?.code ?? ''
  // Pilihan mata pelajaran: kurikulum angkatan terpilih (atau kurikulum terbaru bila belum ada angkatan).
  const curId = batch ? batchCurriculumId(s, batch) : currentCurriculum(s, programId)?.id ?? ''
  const bank = s.subjects.filter((x) => x.active && subjectFitsBatch(s, x, { programId, curriculumId: curId })).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const curricula = s.curricula.filter((c) => c.programId === programId)
  const prog = programs.find((p) => p.id === programId)
  /** Angkatan lain di grup kelas gabungan yang sama. */
  const groupOf = (batchId: string, subjectId: string) => {
    const g = s.batchSubjects.find((x) => x.batchId === batchId && x.subjectId === subjectId)?.groupId
    return g ? s.batchSubjects.filter((x) => x.groupId === g).map((x) => x.batchId) : [batchId]
  }
  const rows = batch ? s.batchSubjects.filter((x) => x.batchId === batch.id).map((x) => ({ ...x, subject: s.subjects.find((y) => y.id === x.subjectId), used: s.sessions.filter((y) => y.batchId === batch.id && y.subjectId === x.subjectId).length }))
    .sort((a, b) => DAYS.indexOf(a.days.split(',')[0]) - DAYS.indexOf(b.days.split(',')[0]) || a.startTime.localeCompare(b.startTime)) : []
  const free = bank.filter((x) => !rows.some((r) => r.subjectId === x.id)) // mapel yang belum punya jadwal di angkatan ini
  const fSubject = f ? s.subjects.find((x) => x.id === f.subjectId) : undefined
  const groupPrograms = f ? [...new Set((f.batchIds ?? []).map((id) => s.batches.find((b) => b.id === id)?.programId ?? ''))] : []
  const options = f ? instructors.filter((u) => fits(u, fSubject, gab, groupPrograms) || u.id === f.instructorId) : []
  /** Mata pelajaran yang dipakai angkatan lain bila ikut kelas gabungan: yang bernama sama di kurikulumnya (sama dengan server). */
  const subjectIn = (batchId: string) => {
    const b = s.batches.find((x) => x.id === batchId)
    const cid = b ? batchCurriculumId(s, b) : ''
    return s.subjects.find((x) => x.active && cid && x.curriculumId === cid && x.name.trim().toLowerCase() === (fSubject?.name ?? '').trim().toLowerCase())
  }
  /** Angkatan lain yang sudah punya jadwal sendiri untuk mapel ini (bukan bagian grup ini): tidak bisa digabung dari sini. */
  const ownElsewhere = (batchId: string) => {
    if (!f || batchId === f.batchId) return false
    const sid = subjectIn(batchId)?.id ?? f.subjectId
    const own = s.batchSubjects.find((x) => x.batchId === batchId && x.subjectId === sid)
    const mine = s.batchSubjects.find((x) => x.batchId === f.batchId && x.subjectId === f.subjectId)?.groupId
    return !!own && (!own.groupId || own.groupId !== mine)
  }
  const pickSubject = (id: string, base: JadwalInput) => {
    const x = bank.find((y) => y.id === id)
    setGab(false) // kelas gabungan dipilih sendiri lewat kotak centang
    setF({ ...base, subjectId: id, instructorId: '', sessions: x ? x.meetings ?? Math.max(1, Math.ceil(x.hours / 4)) : base.sessions, batchIds: [base.batchId] })
  }
  const add = () => {
    if (!batch) return
    pickSubject(free[0]?.id ?? '', { batchId: batch.id, subjectId: '', editing: false, sessions: 1, instructorId: '', days: [], startTime: '08:00', endTime: '10:00', room: '', batchIds: [batch.id] })
  }

  return (
    <>
      <PageHeader title="Jadwal pembelajaran" sub="Tambahkan jadwal satu per satu atau impor dari Excel. Kelas gabungan: centang angkatan lain (boleh dari pelatihan lain) saat menambah atau mengubah jadwal."
        action={<div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setImp(true)}><IconUpload size={18} />Impor jadwal</button>
          {prog && <button className="btn-ghost" onClick={() => setNb({ id: newId('b'), programId, code: '', startDate: '', endDate: '', quota: 20, status: 'draft', location: '', scheduleDays: '', startTime: '', endTime: '', plannedSessions: 0, angkatan: null, curriculumId: currentCurriculum(s, programId)?.id ?? '' })}><IconPlus size={18} />Angkatan baru</button>}
        </div>} />

      <div className="mb-5 grid max-w-2xl gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Pelatihan</span>
          <select className="input" value={programId} onChange={(e) => { setProgramId(e.target.value); setBatchId('') }}>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        </label>
        <label className="block"><span className="label">Angkatan</span>
          <select className="input" value={batch?.id ?? ''} onChange={(e) => setBatchId(e.target.value)} disabled={!batches.length}>{batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
        </label>
      </div>

      {bank.length === 0 && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{curId ? 'Kurikulum angkatan ini belum punya mata pelajaran aktif.' : 'Pelatihan ini belum punya kurikulum.'} <Link to="/admin/mapel" className="font-semibold underline">Tambahkan di Bank mata pelajaran</Link> dulu.</p>}

      {!batch ? <div className="card"><Empty title="Belum ada angkatan" body="Tambahkan angkatan untuk pelatihan ini lewat tombol Angkatan baru." /></div> : (
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5">
            <div>
              <div className="flex items-center gap-2"><h2 className="font-bold">{batch.code}</h2><Badge status={batch.status} /></div>
              <p className="text-sm text-muted">{dateID(batch.startDate)} sampai {dateID(batch.endDate)} · {rows.length} jadwal · {rows.reduce((t, r) => t + r.sessions, 0)} pertemuan</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-52"><span className="label">Kurikulum angkatan</span>
                <select className="input" value={curId} disabled={!curricula.length} title="Mata pelajaran yang bisa dijadwalkan mengikuti kurikulum ini"
                  onChange={(e) => act(setBatchCurriculum(batch.id, e.target.value), 'Kurikulum angkatan diganti.')}>
                  {!curId && <option value="">Belum ada kurikulum</option>}
                  {curricula.filter((c) => c.active || c.id === curId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <button className="btn-primary" disabled={free.length === 0} title={free.length === 0 ? 'Semua mata pelajaran sudah punya jadwal' : undefined} onClick={add}><IconPlus size={18} />Tambah jadwal</button>
            </div>
          </div>
          {rows.length === 0 ? <Empty title="Belum ada jadwal" body="Klik Tambah jadwal, pilih satu mata pelajaran dan instrukturnya, lalu atur hari, jam, dan ruang kelas. Atau gunakan Impor jadwal." /> : (
            <Table bare head={['Mata pelajaran', 'Instruktur', 'Hari dan jam', 'Ruang', 'Pertemuan', '']}>
              {rows.map((r) => {
                const group = r.groupId ? groupOf(batch.id, r.subjectId) : [batch.id]
                return (
                  <tr key={r.subjectId}>
                    <td><p className="font-semibold">{r.subject?.name}</p>
                      <p className="text-xs text-muted">{group.length > 1 || r.subject?.programId === '' ? 'Kelas gabungan · ' : ''}{r.subject ? SUBJECT_KIND[r.subject.kind] : ''}</p>
                      {group.length > 1 && <p className="text-xs text-brass-600">Digabung dengan {group.filter((id) => id !== batch.id).map(code).join(', ')}</p>}
                    </td>
                    <td>{name(r.instructorId) ?? <span className="text-amber-800">Belum ditunjuk</span>}</td>
                    <td className="whitespace-nowrap">{r.days ? r.days.split(',').join(', ') : '-'}<span className="block text-xs text-muted">{r.startTime ? `${r.startTime} sampai ${r.endTime}` : 'Jam belum diisi'}</span></td>
                    <td>{r.room || '-'}</td>
                    <td className="tabular-nums">{r.used}/{r.sessions}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-ghost !min-h-9" aria-label={`Ubah jadwal ${r.subject?.name}`} onClick={() => { setGab(group.length > 1); setF({ batchId: batch.id, subjectId: r.subjectId, editing: true, sessions: r.sessions, instructorId: r.instructorId, days: r.days ? r.days.split(',') : [], startTime: r.startTime || '08:00', endTime: r.endTime || '10:00', room: r.room, batchIds: group }) }}><IconPencil size={16} />Ubah</button>
                      <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus jadwal ${r.subject?.name}`} disabled={r.used > 0} title={r.used > 0 ? 'Sudah ada pertemuan, jadwal tidak bisa dihapus' : undefined}
                        onClick={() => group.length > 1 ? setDel({ subjectId: r.subjectId, name: r.subject?.name ?? '', group }) : act(deleteJadwal(batch.id, r.subjectId), 'Jadwal dihapus.')}><IconTrash size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </section>
      )}

      <Modal open={!!f} title={f?.editing ? `Ubah jadwal ${fSubject?.name ?? ''}` : `Tambah jadwal ${batch?.code ?? ''}`} onClose={() => setF(null)}>
        {f && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveJadwal(f), f.editing ? 'Jadwal diperbarui.' : gab && (f.batchIds?.length ?? 0) > 1 ? `Jadwal kelas gabungan ditambahkan ke ${f.batchIds!.length} angkatan.` : 'Jadwal ditambahkan.', () => setF(null)) }}>
          {!f.editing && (
            <Field label="Mata pelajaran" hint="Hanya mata pelajaran yang belum punya jadwal di angkatan ini.">
              <select className="input" required value={f.subjectId} onChange={(e) => pickSubject(e.target.value, f)}>
                {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Instruktur pengampu" hint={fSubject ? `Instruktur dengan program ${gab ? 'salah satu angkatan yang digabung atau kelas gabungan' : prog?.title}.` : undefined}>
            <select className="input" required value={f.instructorId} onChange={(e) => setF({ ...f, instructorId: e.target.value })}>
              <option value="">Pilih instruktur</option>{options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {options.length === 0 && <p className="text-sm text-amber-800">Belum ada instruktur untuk program ini. Atur program instruktur di menu Pengguna.</p>}
          <fieldset><legend className="label">Hari</legend>
            <div className="flex flex-wrap gap-2">{DAYS.map((d) => (
              <label key={d} className={`flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${f.days.includes(d) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:bg-brand-50'}`}>
                <input type="checkbox" className="sr-only" checked={f.days.includes(d)} onChange={(e) => setF({ ...f, days: e.target.checked ? DAYS.filter((y) => y === d || f.days.includes(y)) : f.days.filter((y) => y !== d) })} />{d}
              </label>))}</div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jam mulai"><input className="input" type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
            <Field label="Jam selesai"><input className="input" type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Ruang / kelas"><input className="input" placeholder="mis. Aula" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
            <Field label="Jumlah pertemuan"><input className="input" type="number" min={1} max={50} required readOnly={bank.find((y) => y.id === f.subjectId)?.meetings != null} title={bank.find((y) => y.id === f.subjectId)?.meetings != null ? 'Mengikuti jumlah pertemuan di bank mata pelajaran' : undefined} value={bank.find((y) => y.id === f.subjectId)?.meetings ?? f.sessions} onChange={(e) => setF({ ...f, sessions: Math.max(1, Math.min(50, +e.target.value || 1)) })} /></Field>
          </div>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={gab} onChange={(e) => { setGab(e.target.checked); if (!e.target.checked) setF({ ...f, batchIds: [f.batchId] }) }} />
            <span><b>Jadikan kelas gabungan</b><span className="block text-xs text-muted">Angkatan lain, juga dari pelatihan lain, belajar bersama di kelas ini dengan instruktur, hari, jam, dan ruang yang sama.</span></span></label>
          {gab && (
            <fieldset className="rounded-lg border border-line p-3">
              <legend className="label px-1">Angkatan yang digabung</legend>
              <p className="mb-2 text-xs text-muted">Tiap angkatan memakai mata pelajaran bernama sama dari kurikulumnya sendiri. Bila kurikulumnya tidak memuat mata pelajaran ini, angkatan itu memakai mata pelajaran {prog?.title}.</p>
              <div className="max-h-56 space-y-3 overflow-auto">
                {programs.map((p) => {
                  const list = active.filter((b) => b.programId === p.id)
                  if (!list.length) return null
                  return (
                    <div key={p.id}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{p.title}</p>
                      <div className="flex flex-wrap gap-2">{list.map((b) => {
                        const on = f.batchIds?.includes(b.id) ?? false
                        const lockedSelf = b.id === f.batchId
                        const taken = ownElsewhere(b.id)
                        return (
                          <label key={b.id} title={taken ? 'Angkatan ini sudah punya jadwal sendiri untuk mata pelajaran ini' : undefined} className={`flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm ${taken ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${on ? 'border-brand-600 bg-brand-50 font-semibold' : 'border-line bg-white'}`}>
                            <input type="checkbox" className="size-4 accent-brand-600" disabled={lockedSelf || taken} checked={on} onChange={(e) => setF({ ...f, batchIds: e.target.checked ? [...(f.batchIds ?? []), b.id] : (f.batchIds ?? []).filter((x) => x !== b.id) })} />{b.code}
                          </label>
                        )
                      })}</div>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          )}
          <p className="text-xs text-muted">Sistem menolak bila instruktur atau ruang yang sama sudah terjadwal pada hari dan jam yang beririsan.</p>
          <button className="btn-primary w-full" disabled={!f.subjectId || !f.days.length}>{f.days.length ? 'Simpan jadwal' : 'Pilih minimal satu hari'}</button>
        </form>}
      </Modal>

      <Modal open={!!del} title={`Hapus jadwal ${del?.name ?? ''}`} onClose={() => setDel(null)}>
        {del && batch && (
          <div className="space-y-3">
            <p className="text-sm">Jadwal kelas gabungan ini juga berlaku di angkatan {del.group.filter((id) => id !== batch.id).map(code).join(', ')}.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => act(deleteJadwal(batch.id, del.subjectId), `Jadwal dihapus dari ${batch.code}.`, () => setDel(null))}>Hapus dari {batch.code} saja</button>
              <button className="btn-danger" onClick={() => act(deleteJadwal(batch.id, del.subjectId, true), 'Jadwal kelas gabungan dihapus dari semua angkatan.', () => setDel(null))}>Hapus dari semua angkatan</button>
            </div>
          </div>
        )}
      </Modal>

      <ImportJadwalModal open={imp} onClose={() => setImp(false)} />

      <Modal open={!!nb} title={`Angkatan baru ${prog?.title ?? ''}`} onClose={() => setNb(null)}>
        {nb && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveBatch(nb), 'Angkatan dibuat. Lanjutkan dengan menambah jadwalnya.', () => { setBatchId(nb.id); setNb(null) }) }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kode angkatan" hint="Contoh: FB-2026-B2"><input className="input" required maxLength={40} value={nb.code} onChange={(e) => setNb({ ...nb, code: e.target.value })} /></Field>
            <Field label="Angkatan ke-" hint="1 sampai 9, dipakai di NIP"><input className="input" type="number" min={1} max={9} value={nb.angkatan ?? ''} onChange={(e) => setNb({ ...nb, angkatan: e.target.value ? +e.target.value : null })} /></Field>
            <Field label="Mulai"><input className="input" type="date" required value={nb.startDate} onChange={(e) => setNb({ ...nb, startDate: e.target.value })} /></Field>
            <Field label="Selesai"><input className="input" type="date" required min={nb.startDate} value={nb.endDate} onChange={(e) => setNb({ ...nb, endDate: e.target.value })} /></Field>
            <Field label="Kuota"><input className="input" type="number" min={1} required value={nb.quota} onChange={(e) => setNb({ ...nb, quota: +e.target.value })} /></Field>
            <Field label="Status"><select className="input" value={nb.status} onChange={(e) => setNb({ ...nb, status: e.target.value as Batch['status'] })}><option value="draft">Draf</option><option value="open">Dibuka</option><option value="running">Berjalan</option></select></Field>
          </div>
          <Field label="Kurikulum" hint="Menentukan mata pelajaran yang bisa dijadwalkan untuk angkatan ini.">
            <select className="input" value={nb.curriculumId ?? ''} onChange={(e) => setNb({ ...nb, curriculumId: e.target.value })}>
              {!curricula.some((c) => c.active) && <option value="">Belum ada kurikulum</option>}
              {curricula.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <button className="btn-primary w-full">Buat angkatan</button>
        </form>}
      </Modal>
    </>
  )
}
