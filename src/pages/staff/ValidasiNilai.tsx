import { useState } from 'react'
import { Badge, Empty, Field, Modal, PageHeader, Table, useAct, useQueryParam } from '../../components/ui'
import { bobotBerlaku, nilaiMapel } from '../../lib/nilaiMapel'
import { returnGrade, returnSubject, unvalidateSubject, useStore, validateGrade, validateSubject } from '../../lib/store'
import { StatusMapel } from './NilaiMapel'

const fmt = (n: number) => String(Math.round(n * 10) / 10)

/**
 * Menu Akademik dan Super Admin: memverifikasi nilai tiap mata pelajaran yang disetor instruktur.
 * Nilai yang divalidasi masuk ke transkrip peserta. Bila semua mata pelajaran seorang peserta sudah valid,
 * hasil lulus atau tidak lulus program ditetapkan otomatis dari rekomendasi sistem (nilai akhir dan kehadiran).
 */
export function ValidasiNilai() {
  const s = useStore((x) => x)
  const act = useAct()
  const [filter, setFilter] = useState<'menunggu' | 'valid' | 'semua'>('menunggu')
  const [batchId, setBatchId] = useState(useQueryParam('batch'))
  const [dlg, setDlg] = useState<{ kind: 'return' | 'unvalidate'; batchId: string; subjectId: string; title: string } | null>(null)
  const [why, setWhy] = useState('')

  const groups = s.batchSubjects
    .filter((bs) => (!batchId || bs.batchId === batchId) && s.batches.some((b) => b.id === bs.batchId))
    .map((bs) => {
      const batch = s.batches.find((b) => b.id === bs.batchId)!
      const subject = s.subjects.find((x) => x.id === bs.subjectId)
      const people = s.registrations
        .filter((r) => r.batchId === bs.batchId && (r.status === 'active' || r.status === 'completed'))
        .map((r) => ({ r, u: s.users.find((x) => x.id === r.userId), g: s.grades.find((x) => x.registrationId === r.id), st: s.subjectGrades.find((x) => x.registrationId === r.id && x.subjectId === bs.subjectId)?.status ?? 'draft' }))
        .filter((x) => x.u && x.g)
        .sort((a, b) => a.u!.name.localeCompare(b.u!.name))
      const n = (st: string) => people.filter((x) => x.st === st).length
      return { bs, batch, subject, people, submitted: n('submitted'), validated: n('validated'), draft: n('draft'), teacher: s.users.find((u) => u.id === bs.instructorId)?.name }
    })
    .filter((x) => x.subject && x.people.length)
    .filter((x) => filter === 'semua' || (filter === 'menunggu' ? x.submitted > 0 : x.validated > 0))
    .sort((a, b) => a.batch.code.localeCompare(b.batch.code) || a.subject!.name.localeCompare(b.subject!.name))

  const batchOptions = [...new Map(s.batchSubjects.map((x) => [x.batchId, s.batches.find((b) => b.id === x.batchId)])).values()].filter(Boolean).sort((a, b) => a!.code.localeCompare(b!.code))
  const waiting = s.subjectGrades.filter((x) => x.status === 'submitted').length

  // Angkatan lama tanpa jadwal mata pelajaran: nilai program dikirim instruktur, divalidasi langsung.
  const legacy = s.grades.filter((g) => g.status === 'submitted').map((g) => {
    const r = s.registrations.find((x) => x.id === g.registrationId)
    return r && !s.batchSubjects.some((y) => y.batchId === r.batchId) ? { g, r, u: s.users.find((x) => x.id === r.userId), b: s.batches.find((x) => x.id === r.batchId), p: s.programs.find((x) => x.id === r.programId) } : null
  }).filter(Boolean) as { g: (typeof s.grades)[number]; r: (typeof s.registrations)[number]; u?: (typeof s.users)[number]; b?: (typeof s.batches)[number]; p?: (typeof s.programs)[number] }[]

  return (
    <>
      <PageHeader title="Validasi nilai" sub="Verifikasi nilai tiap mata pelajaran yang disetor instruktur. Nilai yang divalidasi masuk ke transkrip peserta. Semua nilai diinput instruktur; bila ada yang belum mengisi, Super Admin dapat masuk sebagai instruktur dari Dashboard." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block w-56"><span className="label">Angkatan</span>
          <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Semua angkatan</option>
            {batchOptions.map((b) => <option key={b!.id} value={b!.id}>{b!.code}</option>)}
          </select>
        </label>
        <label className="block w-56"><span className="label">Tampilkan</span>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="menunggu">Menunggu validasi ({waiting})</option>
            <option value="valid">Sudah tervalidasi</option>
            <option value="semua">Semua mata pelajaran</option>
          </select>
        </label>
      </div>

      {groups.length === 0 && <div className="card mb-5"><Empty title={filter === 'menunggu' ? 'Tidak ada nilai yang menunggu validasi' : 'Tidak ada data'} body="Nilai muncul di sini setelah instruktur menyetor nilai mata pelajarannya." /></div>}
      <div className="space-y-5">
        {groups.map(({ bs, batch, subject, people, submitted, validated, draft, teacher }) => {
          const { w } = bobotBerlaku(s, bs.batchId, bs.subjectId)
          const kkm = s.programs.find((p) => p.id === batch.programId)?.rules.passingScore ?? 70
          return (
            <section key={`${bs.batchId}|${bs.subjectId}`} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
                <div>
                  <h2 className="font-bold">{batch.code} · {subject!.name}</h2>
                  <p className="text-sm text-muted">Pengampu: {teacher ?? 'belum ditunjuk'} · {people.length} peserta · bobot absensi {w.absensi}%, tugas {w.tugas}%, teori {w.teori}%, praktik {w.praktik}%</p>
                  <p className="mt-1 text-xs"><b className="text-amber-800">{submitted} disetor</b> · <b className="text-emerald-800">{validated} tervalidasi</b> · <span className="text-muted">{draft} draf</span></p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {submitted > 0 && <button className="btn-primary" onClick={() => act(validateSubject(bs.batchId, bs.subjectId), `Nilai ${subject!.name} divalidasi dan masuk transkrip.`)}>Validasi ({submitted})</button>}
                  {submitted > 0 && <button className="btn-ghost" onClick={() => { setDlg({ kind: 'return', batchId: bs.batchId, subjectId: bs.subjectId, title: `Kembalikan nilai ${subject!.name} (${batch.code})` }); setWhy('') }}>Kembalikan ke instruktur</button>}
                  {validated > 0 && <button className="btn-ghost text-red-700" onClick={() => { setDlg({ kind: 'unvalidate', batchId: bs.batchId, subjectId: bs.subjectId, title: `Batalkan validasi ${subject!.name} (${batch.code})` }); setWhy('') }}>Batalkan validasi</button>}
                </div>
              </div>
              <Table bare head={['Peserta didik', 'Absensi', 'Tugas', 'Teori', 'Praktik', 'Nilai angka', 'Huruf', 'Status']}>
                {people.map(({ r, u, g, st }) => {
                  const v = nilaiMapel(s, bs.batchId, bs.subjectId, r.id)
                  return (
                    <tr key={r.id}>
                      <td><p className="font-semibold">{u!.name}</p><p className="font-mono text-xs text-muted">{r.nip ?? '-'}</p></td>
                      <td className="tabular-nums">{v.absensiPct}%</td>
                      <td className="tabular-nums">{w.tugas ? (v.tugas == null ? '-' : fmt(v.tugas)) : '-'}</td>
                      <td className="tabular-nums">{w.teori ? (v.teori == null ? '-' : fmt(v.teori)) : '-'}</td>
                      <td className="tabular-nums">{w.praktik ? (v.praktik == null ? '-' : fmt(v.praktik)) : '-'}</td>
                      <td><b className="tabular-nums">{fmt(v.akhir)}</b><span className={`block text-xs font-semibold ${v.akhir >= kkm ? 'text-emerald-700' : 'text-red-700'}`}>{v.akhir >= kkm ? 'Lulus' : 'Tidak lulus'} (KKM {kkm})</span></td>
                      <td><b>{v.huruf}</b></td>
                      <td><StatusMapel status={st} />{g!.status === 'validated' && <span className={`mt-1 block text-xs font-semibold ${g!.passed ? 'text-emerald-700' : 'text-red-700'}`}>Hasil program: {g!.passed ? 'lulus' : 'tidak lulus'}</span>}</td>
                    </tr>
                  )
                })}
              </Table>
            </section>
          )
        })}
      </div>

      {legacy.length > 0 && (
        <section className="card mt-5 overflow-hidden">
          <div className="p-5 pb-3"><h2 className="font-bold">Angkatan tanpa jadwal mata pelajaran</h2><p className="text-sm text-muted">Nilai program dikirim instruktur per peserta.</p></div>
          <Table bare head={['Peserta didik', 'Teori', 'Praktik', 'Hadir %', 'Status', '']}>
            {legacy.map(({ g, r, u, b, p }) => (
              <tr key={r.id}>
                <td><p className="font-semibold">{u?.name}</p><p className="text-xs text-muted">{p?.title} · {b?.code}</p></td>
                <td className="tabular-nums">{g.theory}</td><td className="tabular-nums">{g.practical}</td><td className="tabular-nums">{g.attendancePct}%</td>
                <td><Badge status={g.status} /></td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-primary !min-h-9" onClick={() => act(validateGrade(r.id, !!p && g.attendancePct >= p.rules.minAttendance && Math.round(((g.theory + g.practical) / 2) * 10) / 10 >= p.rules.passingScore), 'Nilai divalidasi.')}>Validasi</button>{' '}
                  <button className="btn-ghost !min-h-9" onClick={() => act(returnGrade(r.id), 'Dikembalikan ke instruktur.')}>Kembalikan</button>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}

      <Modal open={!!dlg} title={dlg?.title ?? ''} onClose={() => setDlg(null)}>
        {dlg && (
          <form className="space-y-3 text-sm" onSubmit={(e) => {
            e.preventDefault()
            act(dlg.kind === 'return' ? returnSubject(dlg.batchId, dlg.subjectId, why) : unvalidateSubject(dlg.batchId, dlg.subjectId, why),
              dlg.kind === 'return' ? 'Nilai dikembalikan ke instruktur.' : 'Validasi dibatalkan. Nilai kembali berstatus disetor.', () => setDlg(null))
          }}>
            <p className="text-muted">{dlg.kind === 'return'
              ? 'Nilai kembali berstatus draf dan instruktur diberi tahu untuk memperbaikinya, lalu menyetor ulang.'
              : 'Nilai kembali berstatus disetor. Hasil program peserta yang sudah ditetapkan dibuka kembali dan peserta menerima pemberitahuan.'}</p>
            <Field label={dlg.kind === 'return' ? 'Catatan untuk instruktur (wajib)' : 'Alasan (wajib, dicatat di audit log)'}><textarea className="input !py-2" rows={3} required maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
            <button className={dlg.kind === 'return' ? 'btn-primary w-full' : 'btn-danger w-full'}>{dlg.kind === 'return' ? 'Kembalikan' : 'Batalkan validasi'}</button>
          </form>
        )}
      </Modal>
    </>
  )
}
