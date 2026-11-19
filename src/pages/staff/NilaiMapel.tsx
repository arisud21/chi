import { IconFileSpreadsheet } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Empty, Field, Modal, Table, useAct, useToast } from '../../components/ui'
import { exportNilaiMapelXlsx } from '../../lib/exportNilaiMapel'
import { BATAS_HURUF_BAWAAN, BOBOT_KEYS, HURUF, batasHurufSah, bobotBerlaku, jumlahBobot, mapelTervalidasi, nilaiMapel, rataTugas, skalaHuruf, type BobotMapel } from '../../lib/nilaiMapel'
import { saveSubjectGrade, setDefaultGradeWeights, setGradeLetters, setSubjectWeights, submitSubjectGrades, useStore } from '../../lib/store'

/** Input nilai 0 sampai 100 yang boleh dikosongkan; disimpan ke server saat kehilangan fokus. */
function ScoreInput({ label, value, disabled, onSave }: { label: string; value: number | null; disabled: boolean; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => setV(value == null ? '' : String(value)), [value])
  return <input aria-label={label} className="input !min-h-9 !w-20 !px-2" type="number" min={0} max={100} step="0.1" disabled={disabled} value={v}
    onChange={(e) => setV(e.target.value)}
    onBlur={() => { const n = v.trim() === '' ? null : Math.max(0, Math.min(100, +v || 0)); if (n !== value) onSave(n) }} />
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)
const BOBOT_LABEL: Record<(typeof BOBOT_KEYS)[number], string> = { absensi: 'Absensi', tugas: 'Tugas', teori: 'Teori (UTS)', praktik: 'Praktik (UAS)' }

/** Empat isian bobot (persen) dengan jumlah berjalan; jumlah harus 100. `off` = komponen yang tidak ada di jenis mapel (bobot dikunci 0). */
function BobotFields({ value, onChange, off = [] }: { value: BobotMapel; onChange: (v: BobotMapel) => void; off?: string[] }) {
  const sum = jumlahBobot(value)
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BOBOT_KEYS.map((k) => (
          <Field key={k} label={`${BOBOT_LABEL[k]} (%)`}>
            <input className="input" type="number" min={0} max={100} step={1} disabled={off.includes(k)} value={value[k]}
              onChange={(e) => onChange({ ...value, [k]: Math.max(0, Math.min(100, Math.round(+e.target.value || 0))) })} />
          </Field>
        ))}
      </div>
      <p className={`mt-2 text-sm font-semibold ${sum === 100 ? 'text-emerald-700' : 'text-red-700'}`}>Jumlah {sum}%{sum === 100 ? '' : ` (kurang atau lebih ${Math.abs(100 - sum)}%, harus 100%)`}</p>
    </div>
  )
}

/** Bobot nilai satu mata pelajaran: instruktur pengampu atau Akademik dapat mengubahnya; default dari Akademik. */
export function BobotMapelPanel({ batchId, subjectId, name, kind, w, own }: { batchId: string; subjectId: string; name: string; kind: string; w: BobotMapel; own: boolean }) {
  const act = useAct()
  const canEdit = useStore((x) => x.users.find((u) => u.id === x.sessionUserId)?.role !== 'instruktur') // bobot ditentukan Akademik
  const [edit, setEdit] = useState<BobotMapel | null>(null)
  void kind
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>Bobot nilai: absensi <b>{w.absensi}%</b> · tugas <b>{w.tugas}%</b> · teori <b>{w.teori}%</b> · praktik <b>{w.praktik}%</b></span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${own ? 'bg-brass-100 text-brass-600' : 'bg-canvas text-muted'}`}>{own ? 'Diatur untuk mapel ini' : 'Default Akademik'}</span>
      {canEdit && <button className="btn-ghost !min-h-9" onClick={() => setEdit({ ...w })}>Ubah bobot</button>}
      <Modal open={!!edit} title={`Bobot nilai ${name}`} onClose={() => setEdit(null)}>
        {edit && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act(setSubjectWeights(batchId, subjectId, edit), 'Bobot nilai disimpan.', () => setEdit(null)) }}>
          <p className="text-sm text-muted">Bobot ini hanya berlaku untuk mata pelajaran ini di angkatan ini. Jumlah keempat bobot harus 100%. Bobot terkunci setelah ada nilai peserta yang dikirim ke Akademik.</p>
          <BobotFields value={edit} onChange={setEdit} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={jumlahBobot(edit) !== 100}>Simpan bobot</button>
            {own && <button type="button" className="btn-ghost" onClick={() => act(setSubjectWeights(batchId, subjectId, null, true), 'Bobot kembali ke default Akademik.', () => setEdit(null))}>Kembalikan ke default</button>}
          </div>
        </form>}
      </Modal>
    </div>
  )
}

/** Akademik: batas bawah nilai huruf A sampai D untuk seluruh mata pelajaran (E = di bawah batas D). */
export function SkalaHurufPanel() {
  const cur = useStore((x) => x.gradeLetters)
  const act = useAct()
  const [v, setV] = useState<string[] | null>(null)
  const txt = v ?? cur.map(String)
  const nums = txt.map((x) => (x.trim() === '' ? NaN : +x))
  const ok = batasHurufSah(nums)
  const changed = txt.some((x, i) => x !== String(cur[i]))
  const skala = skalaHuruf(ok ? nums : cur)
  return (
    <section className="card mb-5 p-5">
      <h2 className="font-bold">Skala nilai huruf</h2>
      <p className="mb-3 text-sm text-muted">Isi batas nilai terendah tiap huruf. Berlaku untuk semua mata pelajaran dan ekspor Excel. Huruf E otomatis untuk nilai di bawah batas D. Batas harus menurun dari A ke D.</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
        {HURUF.slice(0, 7).map((h, i) => (
          <Field key={h} label={`${h} mulai dari`}>
            <input className="input" type="number" min={1} max={100} step="0.1" value={txt[i]} onChange={(e) => setV(txt.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
      </div>
      <p className={`mt-2 text-sm ${ok ? 'text-muted' : 'font-semibold text-red-700'}`}>
        {ok ? skala.map((x) => `${x.huruf} ${x.label}`).join(' · ') : 'Batas harus berupa angka 1 sampai 100 dan menurun dari A ke D (tidak boleh sama).'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!ok || !changed} onClick={() => act(setGradeLetters(nums.map((n) => Math.round(n * 10) / 10)), 'Skala nilai huruf disimpan.', () => setV(null))}>Simpan skala</button>
        <button className="btn-ghost" onClick={() => setV(BATAS_HURUF_BAWAAN.map(String))}>Isi ulang bawaan template</button>
        {changed && <button className="btn-ghost" onClick={() => setV(null)}>Batal</button>}
      </div>
    </section>
  )
}

/** Akademik: bobot nilai default (absensi, tugas, teori, praktik) untuk semua mata pelajaran yang bobotnya belum diatur sendiri. */
export function BobotDefault() {
  const def = useStore((x) => x.gradeWeights)
  const act = useAct()
  const [v, setV] = useState<BobotMapel | null>(null)
  const cur = v ?? def
  const changed = BOBOT_KEYS.some((k) => cur[k] !== def[k])
  return (
    <section className="card mb-5 p-5">
      <h2 className="font-bold">Bobot nilai default</h2>
      <p className="mb-3 text-sm text-muted">Berlaku untuk semua mata pelajaran yang bobotnya belum diatur sendiri oleh instruktur pengampu. Bobot ini sama untuk semua jenis mata pelajaran (teori, praktik, maupun gabungan).</p>
      <BobotFields value={cur} onChange={setV} />
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" disabled={!changed || jumlahBobot(cur) !== 100} onClick={() => act(setDefaultGradeWeights(cur), 'Bobot default disimpan.', () => setV(null))}>Simpan bobot default</button>
        {changed && <button className="btn-ghost" onClick={() => setV(null)}>Batal</button>}
      </div>
    </section>
  )
}

/** Status nilai satu mata pelajaran: draf (instruktur mengisi), disetor (menunggu Akademik), atau tervalidasi (masuk transkrip). */
export function StatusMapel({ status }: { status: string }) {
  const m: Record<string, [string, string]> = { draft: ['Draf', 'bg-canvas text-muted'], submitted: ['Disetor, menunggu validasi', 'bg-amber-50 text-amber-800'], validated: ['Tervalidasi', 'bg-emerald-50 text-emerald-800'] }
  const [label, cls] = m[status] ?? m.draft
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
}

/**
 * Input nilai akhir per mata pelajaran, mengikuti "Template Nilai Akhir Mata Pelajaran - CHI".
 * Instruktur mengisi tugas, teori (UTS), dan praktik (UAS) dengan skala 0-100; absensi terisi otomatis dari rekap kehadiran.
 * Pengiriman ke Akademik dan validasi dilakukan dari tabel yang sama lewat `actions`.
 */
export function NilaiMapel({ batchId, instructorId }: { batchId: string; instructorId?: string }) {
  const act = useAct()
  const s = useStore((x) => x)
  const toast = useToast()
  const options = s.batchSubjects
    .filter((x) => (!batchId || x.batchId === batchId) && (!instructorId || x.instructorId === instructorId) && s.batches.some((b) => b.id === x.batchId))
    .map((x) => ({ key: `${x.batchId}|${x.subjectId}`, batchId: x.batchId, subjectId: x.subjectId, batch: s.batches.find((b) => b.id === x.batchId)!, subject: s.subjects.find((y) => y.id === x.subjectId) }))
    .filter((x) => x.subject)
    .filter((x) => !mapelTervalidasi(s, x.batchId, x.subjectId)) // sudah divalidasi Akademik: pindah ke Arsip nilai
    .sort((a, b) => a.batch.code.localeCompare(b.batch.code) || a.subject!.name.localeCompare(b.subject!.name))
  const [sel, setSel] = useState('')
  const cur = options.find((o) => o.key === sel) ?? options[0]

  if (options.length === 0) return <section className="card mb-5 p-5"><h2 className="font-bold">Input nilai per mata pelajaran</h2><Empty title="Belum ada mata pelajaran" body="Mata pelajaran muncul setelah Akademik menetapkan jadwal dan pengampu angkatan. Mata pelajaran yang nilainya sudah divalidasi Akademik dipindahkan ke menu Arsip nilai." /></section>

  const subject = cur.subject!
  const { w, own } = bobotBerlaku(s, cur.batchId, cur.subjectId)
  const p = s.programs.find((x) => x.id === cur.batch.programId)
  const kkm = p?.rules.passingScore ?? 70
  const people = s.registrations
    .filter((r) => r.batchId === cur.batchId && (r.status === 'active' || r.status === 'completed'))
    .map((r) => ({ r, u: s.users.find((x) => x.id === r.userId), g: s.grades.find((x) => x.registrationId === r.id), p: s.programs.find((x) => x.id === r.programId) }))
    .filter((x) => x.u && x.g && x.p)
    .sort((a, b) => a.u!.name.localeCompare(b.u!.name))
  const save = (regId: string, patch: { task?: number | null; theory?: number | null; practical?: number | null }) =>
    saveSubjectGrade(regId, cur.subjectId, patch).then((r: any) => { if (!r.ok) toast(r.error, 'err') })
  const stamp = new Date().toISOString().slice(0, 10)
  // Instruktur baru boleh mengisi nilai setelah semua pertemuan mapel dibuat dan seluruhnya sudah diabsen (sama dengan server).
  const isInstruktur = s.users.find((u) => u.id === s.sessionUserId)?.role === 'instruktur'
  const planned = s.batchSubjects.find((x) => x.batchId === cur.batchId && x.subjectId === cur.subjectId)?.sessions ?? 0
  const sess = s.sessions.filter((x) => x.batchId === cur.batchId && x.subjectId === cur.subjectId)
  const belumAbsen = sess.filter((x) => !s.attendances.some((a) => a.sessionId === x.id)).length
  const sgStatus = (regId: string) => s.subjectGrades.find((x) => x.registrationId === regId && x.subjectId === cur.subjectId)?.status ?? 'draft'
  const draftCount = people.filter((x) => x.g!.status === 'draft' && x.r.status === 'active' && sgStatus(x.r.id) === 'draft').length
  const gateMsg =!isInstruktur ? '' : sess.length < planned ? `Baru ${sess.length} dari ${planned} pertemuan dibuat.` : belumAbsen ? `${belumAbsen} pertemuan belum diisi absensinya.` : ''

  return (
    <section className="card mb-5 overflow-hidden" aria-labelledby="nm-h">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-3">
        <div>
          <h2 id="nm-h" className="font-bold">Input nilai per mata pelajaran</h2>
          <p className="text-sm text-muted">Isi nilai tugas, teori (UTS), dan praktik (UAS) dengan skala 0-100. Absensi terisi otomatis dari rekap kehadiran.</p>
          <BobotMapelPanel batchId={cur.batchId} subjectId={cur.subjectId} name={`${cur.batch.code} · ${subject.name}`} kind={subject.kind} w={w} own={own} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-72 max-w-full"><span className="label">Mata pelajaran</span>
            <select className="input" value={cur.key} onChange={(e) => setSel(e.target.value)}>
              {options.map((o) => <option key={o.key} value={o.key}>{o.batch.code} · {o.subject!.name}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={people.length === 0} onClick={() => {
            exportNilaiMapelXlsx(s, [{ batchId: cur.batchId, subjectId: cur.subjectId }], `nilai-akhir-${cur.batch.code}-${subject.name}-${stamp}.xlsx`.replace(/[\\/:*?"<>|\s]+/g, '-'))
            toast(`Excel diunduh: ${subject.name} ${cur.batch.code}.`, 'ok')
          }}><IconFileSpreadsheet size={18} />Ekspor mapel ini</button>
          <button className="btn-ghost" disabled={!!gateMsg || people.every((x) => x.g!.status !== 'draft')} onClick={async () => {
            let n = 0
            for (const { r, g } of people) { const rt = rataTugas(s, cur.batchId, cur.subjectId, r.id); if (rt != null && g!.status === 'draft' && w.tugas) { await save(r.id, { task: rt }); n++ } }
            toast(`Nilai tugas ${n} peserta diisi dari rata-rata tugas.`, 'ok')
          }}>Isi semua nilai tugas dari rata-rata</button>
          <button className="btn-primary" disabled={!!gateMsg || draftCount === 0} title={gateMsg || (draftCount === 0 ? 'Semua nilai mata pelajaran ini sudah disetor atau divalidasi' : undefined)} onClick={() => act(submitSubjectGrades(cur.batchId, cur.subjectId), `Nilai ${subject.name} disetor ke Akademik untuk divalidasi.`)}>Setor ke Akademik ({draftCount})</button>
          {options.length > 1 && <button className="btn-ghost" onClick={() => {
            const out = exportNilaiMapelXlsx(s, options.map((o) => ({ batchId: o.batchId, subjectId: o.subjectId })), `nilai-akhir-semua-mapel-${stamp}.xlsx`)
            toast(`Excel diunduh: ${out.sheet} mata pelajaran, satu sheet tiap mata pelajaran.`, 'ok')
          }}><IconFileSpreadsheet size={18} />Ekspor semua mapel ({options.length})</button>}
        </div>
      </div>
      {gateMsg && <p role="alert" className="mx-5 mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Nilai mata pelajaran ini belum bisa diisi. {gateMsg} Lengkapi pertemuan dan absensi di menu Pertemuan dan Absensi terlebih dahulu.</p>}
      {people.length === 0 ? <Empty title="Belum ada peserta aktif" body="Peserta muncul setelah ditempatkan di angkatan ini." /> : (
        <Table bare head={['Peserta didik', `Absensi (${w.absensi}%)`, `Tugas (${w.tugas}%)`, `Teori / UTS (${w.teori}%)`, `Praktik / UAS (${w.praktik}%)`, 'Nilai angka dan huruf', 'Status']}>
          {people.map(({ r, u, g }) => {
            const v = nilaiMapel(s, cur.batchId, cur.subjectId, r.id)
            const locked = g!.status !== 'draft' || sgStatus(r.id) !== 'draft' || !!gateMsg
            return (
              <tr key={r.id}>
                <td><p className="font-semibold">{u!.name}</p><p className="font-mono text-xs text-muted">{r.nip ?? '-'}</p>
                  <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${r.paidOff ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>{r.paidOff ? 'Pembayaran lunas' : 'Pembayaran belum lunas'}</span></td>
                <td><b className="tabular-nums">{v.absensiPct}%</b><span className="block text-xs text-muted">{v.diabsen ? `Hadir ${v.hadir} dari ${v.diabsen} pertemuan` : 'Belum ada absensi'}</span></td>
                <td>{w.tugas ? <>
                  <ScoreInput label={`Tugas ${u!.name}`} value={v.tugas} disabled={locked} onSave={(x) => save(r.id, { task: x })} />
                  {(() => { const rt = rataTugas(s, cur.batchId, cur.subjectId, r.id); return rt == null ? null : <button type="button" className="mt-1 block text-xs font-semibold text-brass-600 underline disabled:opacity-40 disabled:no-underline" disabled={locked || rt === v.tugas} onClick={() => save(r.id, { task: rt })}>Pakai rata-rata tugas ({fmt(rt)})</button> })()}
                </> : <span className="text-muted">-</span>}</td>
                <td>{w.teori ? <ScoreInput label={`Teori ${u!.name}`} value={v.teori} disabled={locked} onSave={(x) => save(r.id, { theory: x })} /> : <span className="text-muted">-</span>}</td>
                <td>{w.praktik ? <ScoreInput label={`Praktik ${u!.name}`} value={v.praktik} disabled={locked} onSave={(x) => save(r.id, { practical: x })} /> : <span className="text-muted">-</span>}</td>
                <td><b className="text-lg tabular-nums">{fmt(v.akhir)}</b> <b>{v.huruf}</b><span className="block text-xs text-muted">Poin: {fmt(v.poin.absensi)} + {fmt(v.poin.tugas)} + {fmt(v.poin.teori)} + {fmt(v.poin.praktik)}</span><span className={`block text-xs font-semibold ${v.akhir >= kkm ? 'text-emerald-700' : 'text-red-700'}`}>{v.akhir >= kkm ? 'Lulus' : 'Tidak lulus'} (KKM {kkm})</span></td>
                <td>
                  <StatusMapel status={sgStatus(r.id)} />
                  {g!.status === 'validated' && <span className={`mt-1 block text-xs font-semibold ${g!.passed ? 'text-emerald-700' : 'text-red-700'}`}>Hasil program: {g!.passed ? 'lulus' : 'tidak lulus'}</span>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <p className="px-5 py-3 text-xs text-muted">Setor nilai dilakukan per mata pelajaran untuk seluruh peserta. Nilai yang sudah disetor terkunci sampai Akademik mengembalikannya; setelah divalidasi, nilai masuk ke transkrip peserta.</p>
    </section>
  )
}
