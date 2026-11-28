import { IconCopy, IconFileImport, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Badge, Empty, Field, Modal, PageHeader, newIdLike, useAct, Table } from '../../components/ui'
import { currentCurriculum, deleteCurriculum, deleteSubject, saveCurriculum, saveSubject, useStore } from '../../lib/store'
import type { Curriculum, Subject } from '../../lib/types'
import { ImporMapel, SUBJECT_KIND } from './ImporMapel'

type CurForm = Curriculum & { copyFrom?: string }

/** Jam total = jam per pertemuan x jumlah pertemuan, bila keduanya terisi. Server memakai rumus yang sama. */
const withTotal = (x: Subject): Subject => (x.hoursPerMeeting && x.meetings ? { ...x, hours: x.hoursPerMeeting * x.meetings } : x)

/**
 * Bank mata pelajaran (Akademik): pelatihan punya satu atau beberapa kurikulum, dan tiap kurikulum berisi mata pelajarannya.
 * Angkatan memakai satu kurikulum, jadi mata pelajaran tiap angkatan bisa berbeda. Jadwal pembelajaran memilih dari sini.
 */
export function MataPelajaran() {
  const s = useStore((x) => x)
  const act = useAct()
  const programs = s.programs.filter((p) => !p.archived)
  const [programId, setProgramId] = useState(programs[0]?.id ?? '')
  const [pickedCur, setPickedCur] = useState('')
  const [f, setF] = useState<Subject | null>(null)
  const [del, setDel] = useState<Subject | null>(null)
  const [cf, setCf] = useState<CurForm | null>(null)
  const [delCur, setDelCur] = useState<Curriculum | null>(null)
  const [impor, setImpor] = useState(false)
  const prog = programs.find((p) => p.id === programId)
  const curricula = s.curricula.filter((c) => c.programId === programId).sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt))
  const cur = curricula.find((c) => c.id === pickedCur) ?? currentCurriculum(s, programId) ?? curricula[0]
  const latest = currentCurriculum(s, programId)
  const usedBy = (cid: string) => s.batches.filter((b) => (b.curriculumId || latest?.id) === cid && b.programId === programId)
  // Kelas gabungan tidak dibuat di bank: diatur di Jadwal pembelajaran dari mata pelajaran kurikulum masing-masing.
  const list = s.subjects.filter((x) => x.programId === programId && x.curriculumId === cur?.id)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const totalHours = list.filter((x) => x.active).reduce((a, x) => a + x.hours, 0)
  const usage = (id: string) => s.batchSubjects.filter((b) => b.subjectId === id).length
  const count = (cid: string) => s.subjects.filter((x) => x.curriculumId === cid).length
  const newCur = () => setCf({ id: newIdLike('cu'), programId, name: '', description: '', active: true, createdAt: '', copyFrom: cur?.id ?? '' })

  return (
    <>
      <PageHeader title="Bank mata pelajaran" sub="Pilih pelatihan dan kurikulumnya, lalu kelola mata pelajarannya. Tiap angkatan memakai satu kurikulum, jadi mata pelajaran antarangkatan bisa berbeda."
        action={<div className="flex flex-wrap gap-2"><button className="btn-ghost" disabled={programs.length === 0} onClick={() => setImpor(true)}><IconFileImport size={18} />Impor dari spreadsheet</button><button className="btn-primary" disabled={!(prog && cur)} onClick={() => setF({ id: newIdLike('sj'), programId, curriculumId: cur?.id ?? '', code: '', name: '', kind: 'teori', hours: 0, hoursPerMeeting: null, meetings: null, description: '', active: true })}><IconPlus size={18} />Mata pelajaran</button></div>} />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block min-w-64"><span className="label">Pelatihan</span>
          <select className="input" value={programId} onChange={(e) => { setProgramId(e.target.value); setPickedCur('') }}>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        </label>
        {prog && curricula.length > 0 && <label className="block min-w-64"><span className="label">Kurikulum</span>
          <select className="input" value={cur?.id ?? ''} onChange={(e) => setPickedCur(e.target.value)}>{curricula.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (nonaktif)'}</option>)}</select>
        </label>}
        {prog && <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={newCur}><IconPlus size={18} />Kurikulum baru</button>
          {cur && <button className="btn-ghost" aria-label={`Ubah kurikulum ${cur.name}`} onClick={() => setCf({ ...cur })}><IconPencil size={18} />Ubah</button>}
          {cur && <button className="btn-ghost text-red-700" aria-label={`Hapus kurikulum ${cur.name}`} onClick={() => setDelCur(cur)}><IconTrash size={18} /></button>}
        </div>}
        {prog && <p className="pb-2.5 text-sm text-muted">Kelas gabungan antarpelatihan diatur di menu Jadwal pembelajaran.</p>}
      </div>

      {prog && cur && (
        <div className="mb-4 rounded-xl bg-canvas px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2"><b>{cur.name}</b>{cur.id === latest?.id && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">Bawaan angkatan baru</span>}{!cur.active && <Badge status="draft" />}</p>
          {cur.description && <p className="text-muted">{cur.description}</p>}
          <p className="mt-1 text-muted">Dipakai angkatan: {usedBy(cur.id).length ? <b className="text-ink">{usedBy(cur.id).map((b) => b.code).join(', ')}</b> : 'belum ada'} · Durasi program <b className="text-ink">{prog.durationHours} jam</b> · jam mata pelajaran aktif <b className={totalHours === prog.durationHours ? 'text-emerald-700' : 'text-amber-700'}>{totalHours} jam</b></p>
        </div>
      )}

      {prog && !cur ? <div className="card"><Empty title="Belum ada kurikulum" body="Buat kurikulum untuk pelatihan ini dulu, lalu isi mata pelajarannya. Angkatan memilih kurikulum yang dipakai di menu Jadwal pembelajaran." /></div>
        : list.length === 0 ? <div className="card"><Empty title="Belum ada mata pelajaran" body="Tambahkan mata pelajaran untuk kurikulum ini agar bisa dipilih di jadwal pembelajaran." /></div> : (
        <Table head={["Kode", "Mata pelajaran", "Jenis", "Jam/pertemuan", "Pertemuan", "Jam total", "Dipakai", "Status", ""]}>
         {list.map((x) => (
           <tr key={x.id}>
             <td className="font-mono text-xs">{x.code || '-'}</td>
             <td><p className="font-semibold">{x.name}</p>{x.description && <p className="text-xs text-muted">{x.description}</p>}</td>
             <td>{SUBJECT_KIND[x.kind]}</td><td className="tabular-nums">{x.hoursPerMeeting ?? '-'}</td><td className="tabular-nums">{x.meetings ?? '-'}</td><td className="font-semibold tabular-nums">{x.hours}</td><td>{usage(x.id) ? `${usage(x.id)} angkatan` : '-'}</td>
             <td><Badge status={x.active ? 'open' : 'draft'} /></td>
             <td className="whitespace-nowrap text-right"><button className="btn-ghost !min-h-9" onClick={() => setF(withTotal(x))}>Ubah</button> <button className="btn-ghost !min-h-9 text-red-700" onClick={() => setDel(x)}>Hapus</button></td>
           </tr>
         ))}
        </Table>
      )}

      <Modal open={!!f} title={f && s.subjects.some((x) => x.id === f.id) ? 'Ubah mata pelajaran' : 'Mata pelajaran baru'} onClose={() => setF(null)}>
        {f && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveSubject(f), 'Mata pelajaran disimpan.', () => setF(null)) }}>
          <p className="rounded-lg bg-canvas p-3 text-sm">Pelatihan: <b>{programs.find((p) => p.id === f.programId)?.title}</b> · Kurikulum: <b>{s.curricula.find((c) => c.id === f.curriculumId)?.name}</b></p>
          <Field label="Nama mata pelajaran"><input className="input" required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Subject['kind'] })}><option value="teori">Teori</option><option value="teori_praktik">Teori dan praktik</option>{f.kind === 'praktik' && <option value="praktik">Praktik (data lama)</option>}</select></Field>
            <Field label="Kode" hint="Maksimal 12 karakter."><input className="input font-mono uppercase" maxLength={12} value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="Jam per pertemuan"><input className="input" type="number" min={1} max={24} step={1} value={f.hoursPerMeeting ?? ''} onChange={(e) => setF(withTotal({ ...f, hoursPerMeeting: e.target.value === '' ? null : +e.target.value }))} /></Field>
            <Field label="Jumlah pertemuan"><input className="input" type="number" min={1} step={1} value={f.meetings ?? ''} onChange={(e) => setF(withTotal({ ...f, meetings: e.target.value === '' ? null : +e.target.value }))} /></Field>
            {f.hoursPerMeeting && f.meetings
              ? <Field label="Jumlah jam per program" hint={`Otomatis: ${f.hoursPerMeeting} jam x ${f.meetings} pertemuan.`}><input className="input bg-canvas font-semibold tabular-nums" type="number" readOnly value={f.hours} /></Field>
              : <Field label="Jumlah jam per program" hint="Terhitung otomatis bila jam per pertemuan dan jumlah pertemuan diisi."><input className="input" type="number" min={1} step={1} required value={f.hours || ''} onChange={(e) => setF({ ...f, hours: +e.target.value })} /></Field>}
          </div>
          <Field label="Keterangan (opsional)"><input className="input" maxLength={255} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (muncul di pilihan jadwal)</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>

      <Modal open={!!cf} title={cf && s.curricula.some((c) => c.id === cf.id) ? 'Ubah kurikulum' : `Kurikulum baru ${prog?.title ?? ''}`} onClose={() => setCf(null)}>
        {cf && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveCurriculum(cf), 'Kurikulum disimpan.', () => { setPickedCur(cf.id); setCf(null) }) }}>
          <Field label="Nama kurikulum" hint="Contoh: Kurikulum 2027 atau Kurikulum Angkatan 5."><input className="input" required maxLength={120} value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} /></Field>
          <Field label="Keterangan (opsional)"><input className="input" maxLength={255} value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} /></Field>
          {!s.curricula.some((c) => c.id === cf.id) && curricula.length > 0 && (
            <Field label="Isi awal" hint="Mata pelajaran disalin sebagai data baru, jadi perubahan di kurikulum baru tidak memengaruhi angkatan yang memakai kurikulum lama.">
              <select className="input" value={cf.copyFrom ?? ''} onChange={(e) => setCf({ ...cf, copyFrom: e.target.value })}>
                <option value="">Kosong, isi sendiri atau impor</option>
                {curricula.map((c) => <option key={c.id} value={c.id}>Salin dari {c.name} ({count(c.id)} mata pelajaran)</option>)}
              </select>
            </Field>
          )}
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={cf.active} onChange={(e) => setCf({ ...cf, active: e.target.checked })} /><span>Aktif<span className="block text-xs text-muted">Kurikulum aktif terbaru menjadi bawaan angkatan baru. Kurikulum nonaktif tidak bisa dipilih untuk angkatan lain, tetapi angkatan yang sudah memakainya tetap berjalan.</span></span></label>
          <button className="btn-primary w-full">{cf.copyFrom && !s.curricula.some((c) => c.id === cf.id) ? <><IconCopy size={18} />Buat dan salin mata pelajaran</> : 'Simpan'}</button>
        </form>}
      </Modal>

      <ImporMapel open={impor} onClose={() => setImpor(false)} defaultProgramId={programId} defaultCurriculumId={cur?.id ?? ''} />
      <Modal open={!!del} title="Hapus mata pelajaran?" onClose={() => setDel(null)}>
        {del && <div className="space-y-4">
          <p className="text-sm"><b>{del.name}</b> dihapus permanen.</p>
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Hanya bisa bila belum dipakai di jadwal pembelajaran mana pun. Kalau sudah dipakai, nonaktifkan lewat Ubah.</p>
          <div className="flex gap-2"><button className="btn-danger" onClick={() => act(deleteSubject(del.id), 'Mata pelajaran dihapus.', () => setDel(null))}>Ya, hapus</button><button className="btn-ghost" onClick={() => setDel(null)}>Batal</button></div>
        </div>}
      </Modal>
      <Modal open={!!delCur} title="Hapus kurikulum?" onClose={() => setDelCur(null)}>
        {delCur && <div className="space-y-4">
          <p className="text-sm"><b>{delCur.name}</b> beserta {count(delCur.id)} mata pelajarannya dihapus permanen.</p>
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Hanya bisa bila belum dipakai angkatan mana pun. Kalau sudah dipakai, nonaktifkan lewat Ubah.</p>
          <div className="flex gap-2"><button className="btn-danger" onClick={() => act(deleteCurriculum(delCur.id), 'Kurikulum dihapus.', () => { setDelCur(null); setPickedCur('') })}>Ya, hapus</button><button className="btn-ghost" onClick={() => setDelCur(null)}>Batal</button></div>
        </div>}
      </Modal>
    </>
  )
}
