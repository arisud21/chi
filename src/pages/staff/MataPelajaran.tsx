import { IconFileImport, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Badge, Empty, Field, Modal, PageHeader, newIdLike, useAct, Table } from '../../components/ui'
import { deleteSubject, saveSubject, useStore } from '../../lib/store'
import type { Subject } from '../../lib/types'
import { ImporMapel, SUBJECT_KIND } from './ImporMapel'

/** Bank mata pelajaran (Akademik): daftar pelajaran per pelatihan. Jadwal angkatan memilih dari sini. */
export function MataPelajaran() {
  const s = useStore((x) => x)
  const act = useAct()
  const programs = s.programs.filter((p) => !p.archived)
  const [programId, setProgramId] = useState(programs[0]?.id ?? '')
  const [f, setF] = useState<Subject | null>(null)
  const [del, setDel] = useState<Subject | null>(null)
  const [impor, setImpor] = useState(false)
  const gabungan = programId === 'gabungan' // tampilan khusus kelas gabungan, berlaku untuk semua pelatihan
  const prog = programs.find((p) => p.id === programId)
  const list = s.subjects.filter((x) => (gabungan ? x.programId === '' : x.programId === programId || x.programId === '')).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const totalHours = list.filter((x) => x.active).reduce((a, x) => a + x.hours, 0)
  const usage = (id: string) => s.batchSubjects.filter((b) => b.subjectId === id).length

  return (
    <>
      <PageHeader title="Bank mata pelajaran" sub="Pilih pelatihan dulu, lalu kelola mata pelajarannya. Saat menyusun jadwal angkatan, Akademik memilih dari daftar ini."
        action={<div className="flex flex-wrap gap-2"><button className="btn-ghost" disabled={programs.length === 0} onClick={() => setImpor(true)}><IconFileImport size={18} />Impor dari spreadsheet</button><button className="btn-primary" disabled={!prog && !gabungan} onClick={() => setF({ id: newIdLike('sj'), programId: gabungan ? '' : programId, code: '', name: '', kind: 'teori', hours: 8, hoursPerMeeting: null, meetings: null, description: '', active: true })}><IconPlus size={18} />Mata pelajaran</button></div>} />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block min-w-64"><span className="label">Pelatihan</span>
          <select className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}<option value="gabungan">Kelas gabungan (semua pelatihan)</option></select>
        </label>
        {gabungan && <p className="pb-2.5 text-sm text-muted">Kelas gabungan cukup dibuat sekali dan otomatis tersedia di jadwal semua pelatihan.</p>}
        {prog && <p className="pb-2.5 text-sm text-muted">Durasi program <b className="text-ink">{prog.durationHours} jam</b> · jam mata pelajaran aktif (termasuk kelas gabungan) <b className={totalHours === prog.durationHours ? 'text-emerald-700' : 'text-amber-700'}>{totalHours} jam</b></p>}
      </div>

      {list.length === 0 ? <div className="card"><Empty title="Belum ada mata pelajaran" body="Tambahkan mata pelajaran untuk pelatihan ini agar bisa dipilih di jadwal angkatan." /></div> : (
        <Table head={["Kode", "Mata pelajaran", "Jenis", "Jam/pertemuan", "Pertemuan", "Jam total", "Dipakai", "Status", ""]}>
         {list.map((x) => (
           <tr key={x.id}>
             <td className="font-mono text-xs">{x.code || '-'}</td>
             <td><p className="font-semibold">{x.name}</p>{x.description && <p className="text-xs text-muted">{x.description}</p>}{x.programId === '' && !gabungan && <span className="mt-0.5 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">Kelas gabungan</span>}</td>
             <td>{SUBJECT_KIND[x.kind]}</td><td className="tabular-nums">{x.hoursPerMeeting ?? '-'}</td><td className="tabular-nums">{x.meetings ?? '-'}</td><td className="font-semibold tabular-nums">{x.hours}</td><td>{usage(x.id) ? `${usage(x.id)} angkatan` : '-'}</td>
             <td><Badge status={x.active ? 'open' : 'draft'} /></td>
             <td className="whitespace-nowrap text-right"><button className="btn-ghost !min-h-9" onClick={() => setF(x)}>Ubah</button> <button className="btn-ghost !min-h-9 text-red-700" onClick={() => setDel(x)}>Hapus</button></td>
           </tr>
         ))}
        </Table>
      )}

      <Modal open={!!f} title={f && s.subjects.some((x) => x.id === f.id) ? 'Ubah mata pelajaran' : 'Mata pelajaran baru'} onClose={() => setF(null)}>
        {f && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveSubject(f), 'Mata pelajaran disimpan.', () => setF(null)) }}>
          <p className="rounded-lg bg-canvas p-3 text-sm">Pelatihan: <b>{f.programId === '' ? 'Semua pelatihan (kelas gabungan)' : programs.find((p) => p.id === f.programId)?.title}</b></p>
          <Field label="Nama mata pelajaran"><input className="input" required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Subject['kind'] })}><option value="teori">Teori</option><option value="praktik">Praktik</option><option value="teori_praktik">Teori dan praktik</option></select></Field>
            <Field label="Kode" hint="Maksimal 12 karakter."><input className="input font-mono uppercase" maxLength={12} value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="Jam per pertemuan"><input className="input" type="number" min={1} max={24} value={f.hoursPerMeeting ?? ''} onChange={(e) => setF({ ...f, hoursPerMeeting: e.target.value === '' ? null : +e.target.value })} /></Field>
            <Field label="Jumlah pertemuan"><input className="input" type="number" min={1} max={60} value={f.meetings ?? ''} onChange={(e) => setF({ ...f, meetings: e.target.value === '' ? null : +e.target.value })} /></Field>
            <Field label="Jumlah jam per program"><input className="input" type="number" min={1} max={500} required value={f.hours} onChange={(e) => setF({ ...f, hours: +e.target.value })} /></Field>
          </div>
          <Field label="Keterangan (opsional)"><input className="input" maxLength={255} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (muncul di pilihan jadwal)</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
      <ImporMapel open={impor} onClose={() => setImpor(false)} defaultProgramId={programId} />
      <Modal open={!!del} title="Hapus mata pelajaran?" onClose={() => setDel(null)}>
        {del && <div className="space-y-4">
          <p className="text-sm"><b>{del.name}</b> dihapus permanen.</p>
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Hanya bisa bila belum dipakai di jadwal angkatan mana pun. Kalau sudah dipakai, nonaktifkan lewat Ubah.</p>
          <div className="flex gap-2"><button className="btn-danger" onClick={() => act(deleteSubject(del.id), 'Mata pelajaran dihapus.', () => setDel(null))}>Ya, hapus</button><button className="btn-ghost" onClick={() => setDel(null)}>Batal</button></div>
        </div>}
      </Modal>
    </>
  )
}
