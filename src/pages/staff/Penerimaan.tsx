import { IconCopy, IconDownload, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { Empty, Field, Modal, PageHeader, Table, dateID, dateTimeID, rupiah, useAct, useToast } from '../../components/ui'
import {
  createExamToken, decideAdmission, deleteBank, deleteExam, deleteFeeItem, deletePlan, deleteQuestion, saveBank, saveExamConfig, saveFeeItem, saveFees, saveLetterSettings, savePlan, revokeExamToken, saveQuestions, setProgramPrice, useStore,
} from '../../lib/store'
import type { Exam, PaymentPlan, Question } from '../../lib/types'
import { planPreview } from '../peserta/Tahapan'

type Tab = 'ujian' | 'soal' | 'hasil' | 'surat'
const TABS: [Tab, string][] = [['ujian', 'Jadwal dan token'], ['soal', 'Bank soal'], ['hasil', 'Hasil dan keputusan'], ['surat', 'Surat kelulusan']]

const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const nowLocal = (plusDays = 0) => toLocal(new Date(Date.now() + plusDays * 86_400_000).toISOString())

export function UjianAdmin() {
  const [tab, setTab] = useState<Tab>('ujian')
  return (
    <>
      <PageHeader title="Ujian tulis" sub="Atur bank soal, jadwal dan token ujian, lalu putuskan kelulusan peserta. Nilai hanya terlihat oleh staf." />
      <div role="tablist" aria-label="Bagian ujian" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {tab === 'ujian' && <JadwalUjian />}
      {tab === 'soal' && <BankSoal />}
      {tab === 'hasil' && <HasilSeleksi />}
      {tab === 'surat' && <PengaturanSurat />}
    </>
  )
}

/* ---------- jadwal dan token ---------- */
const TOKEN_CHOICES: [number, string][] = [[15, '15 menit'], [30, '30 menit'], [60, '1 jam'], [120, '2 jam'], [180, '3 jam'], [240, '4 jam'], [360, '6 jam'], [480, '8 jam'], [720, '12 jam'], [1440, '24 jam']]

const remaining = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000))
  if (m < 60) return `${m} menit`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} jam ${r} menit` : `${h} jam`
}

function JadwalUjian() {
  const s = useStore((x) => x)
  const act = useAct()
  const toast = useToast()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [f, setF] = useState<(Omit<Exam, 'openAt' | 'closeAt'> & { openAt: string; closeAt: string }) | null>(null)
  const [tk, setTk] = useState<{ exam: Exam; minutes: number } | null>(null)
  const blank = () => ({ id: '', title: '', bankId: s.banks[0]?.id ?? '', programId: '', openAt: nowLocal(), closeAt: nowLocal(7), durationMin: 60, questionCount: 20, active: true } as NonNullable<typeof f>)
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Token disalin.')).catch(() => toast('Gagal menyalin. Salin manual.', 'err'))
  const set = (k: string) => (e: any) => setF({ ...f!, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value })
  const activeToken = (examId: string) => s.examTokens.find((t) => t.examId === examId && new Date(t.expiresAt).getTime() > now)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">Token dibuat terpisah dari jadwal. Pilih berapa lama token aktif. Token baru langsung menggantikan token sebelumnya.</p>
        <button className="btn-primary" disabled={s.banks.length === 0} onClick={() => setF(blank())}><IconPlus size={18} />Buat ujian</button>
      </div>
      {s.banks.length === 0 && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Buat bank soal dulu di tab Bank soal sebelum membuat ujian.</p>}
      {s.exams.length === 0 ? <div className="card"><Empty title="Belum ada ujian" body="Buat ujian, tentukan jumlah soal dan durasi. Soal peserta diacak dari bank soal yang dipilih." /></div> : (
        <Table head={['Ujian', 'Jadwal', 'Soal', 'Token aktif', 'Pengerjaan', '']}>
          {s.exams.map((e) => {
            const at = s.attempts.filter((a) => a.examId === e.id)
            const t = activeToken(e.id)
            return (
              <tr key={e.id}>
                <td><p className="font-semibold">{e.title}</p><p className="text-xs text-muted">{s.banks.find((b) => b.id === e.bankId)?.name} · {e.programId ? s.programs.find((p) => p.id === e.programId)?.title : 'Semua program'}{e.active ? '' : ' · nonaktif'}</p></td>
                <td className="text-xs">{dateTimeID(e.openAt)}<br />{dateTimeID(e.closeAt)}<br />{e.durationMin} menit</td>
                <td className="tabular-nums">{e.questionCount}</td>
                <td>
                  {t ? (
                    <div className="flex flex-wrap items-center justify-end gap-2 md:justify-start">
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 font-mono text-sm font-bold tracking-widest text-brand-700" onClick={() => copy(t.token)} aria-label={`Salin token ${t.token}`}>{t.token}<IconCopy size={14} /></button>
                      <span className="text-xs text-muted">sisa {remaining(new Date(t.expiresAt).getTime() - now)}</span>
                    </div>
                  ) : <span className="text-sm text-muted">Belum ada token aktif</span>}
                </td>
                <td className="text-xs">{at.filter((a) => a.finishedAt).length} selesai · {at.filter((a) => !a.finishedAt).length} berjalan</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-primary !min-h-10" onClick={() => setTk({ exam: e, minutes: 60 })}>{t ? 'Token baru' : 'Buat token'}</button>{' '}
                  {t && <button className="btn-ghost !min-h-10" onClick={() => act(revokeExamToken(t.id), 'Token dicabut.')}>Cabut</button>}{' '}
                  <button className="btn-ghost !min-h-10" onClick={() => setF({ ...e, openAt: toLocal(e.openAt), closeAt: toLocal(e.closeAt) } as NonNullable<typeof f>)} aria-label="Ubah ujian"><IconPencil size={16} /></button>{' '}
                  <button className="btn-ghost !min-h-10" onClick={() => confirm(`Hapus ujian "${e.title}"?`) && act(deleteExam(e.id), 'Ujian dihapus.')} aria-label="Hapus ujian"><IconTrash size={16} /></button>
                </td>
              </tr>
            )
          })}
        </Table>
      )}

      <Modal open={!!tk} title={`Buat token: ${tk?.exam.title ?? ''}`} onClose={() => setTk(null)}>
        {tk && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act(createExamToken(tk.exam.id, tk.minutes), 'Token dibuat.', () => setTk(null)) }}>
          <fieldset>
            <legend className="label">Masa aktif token</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Masa aktif token">
              {TOKEN_CHOICES.map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={tk.minutes === m} onClick={() => setTk({ ...tk, minutes: m })}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition ${tk.minutes === m ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-white hover:border-brand-200'}`}>{label}</button>
              ))}
            </div>
          </fieldset>
          <p className="text-sm text-muted">Peserta memakai token untuk memulai ujian. Peserta yang sudah mulai tetap bisa melanjutkan setelah token berakhir. Token juga hanya berguna selama jadwal ujian dibuka.</p>
          <button className="btn-primary w-full">Buat token {TOKEN_CHOICES.find(([m]) => m === tk.minutes)?.[1]}</button>
        </form>}
      </Modal>

      <Modal open={!!f} title={f?.id ? 'Ubah ujian' : 'Buat ujian'} onClose={() => setF(null)}>
        {f && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveExamConfig({ ...f, id: f.id || undefined, openAt: new Date(f.openAt).toISOString(), closeAt: new Date(f.closeAt).toISOString() }), 'Ujian disimpan.', () => setF(null)) }}>
          <Field label="Nama ujian"><input className="input" required value={f.title} onChange={set('title')} /></Field>
          <Field label="Bank soal"><select className="input" required value={f.bankId} onChange={set('bankId')}>{s.banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.count} soal)</option>)}</select></Field>
          <Field label="Untuk program"><select className="input" value={f.programId} onChange={set('programId')}><option value="">Semua program</option>{s.programs.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dibuka"><input className="input" type="datetime-local" required value={f.openAt} onChange={set('openAt')} /></Field>
            <Field label="Ditutup"><input className="input" type="datetime-local" required value={f.closeAt} onChange={set('closeAt')} /></Field>
            <Field label="Durasi (menit)"><input className="input" type="number" min={5} max={480} required value={f.durationMin} onChange={set('durationMin')} /></Field>
            <Field label="Jumlah soal diacak"><input className="input" type="number" min={1} max={200} required value={f.questionCount} onChange={set('questionCount')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={set('active')} />Ujian aktif (terlihat oleh peserta)</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
    </>
  )
}

/* ---------- bank soal ---------- */
interface QForm { id?: string; body: string; options: string[]; correctIdx: number }
const blankQ = (): QForm => ({ body: '', options: ['', '', '', ''], correctIdx: 0 })

/** Format tempel: blok dipisah baris kosong. Baris pertama soal, baris berikutnya pilihan, tanda * di depan pilihan yang benar. */
function parseBulk(text: string): QForm[] {
  return text.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((l) => l.length >= 3).map((lines) => {
    const opts = lines.slice(1).map((l) => l.replace(/^\*?\s*[A-Ea-e][.)]\s*/, (m) => m.replace(/[A-Ea-e][.)]\s*/, '')))
    const ci = lines.slice(1).findIndex((l) => l.startsWith('*'))
    return { body: lines[0], options: opts.map((o) => o.replace(/^\*\s*/, '')), correctIdx: Math.max(0, ci) }
  })
}

function BankSoal() {
  const s = useStore((x) => x)
  const act = useAct()
  const [bankId, setBankId] = useState(s.banks[0]?.id ?? '')
  const bank = s.banks.find((b) => b.id === bankId) ?? s.banks[0]
  const qs = useMemo(() => s.questions.filter((q) => q.bankId === bank?.id), [s.questions, bank?.id])
  const [name, setName] = useState<{ id?: string; name: string } | null>(null)
  const [f, setF] = useState<QForm | null>(null)
  const [bulk, setBulk] = useState<string | null>(null)
  const parsed = bulk ? parseBulk(bulk) : []
  const edit = (q: Question) => setF({ id: q.id, body: q.body, options: [...q.options, '', '', '', '', ''].slice(0, Math.max(4, q.options.length)), correctIdx: q.correctIdx })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input !w-auto min-w-48" aria-label="Pilih bank soal" value={bank?.id ?? ''} onChange={(e) => setBankId(e.target.value)}>
          {s.banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.count})</option>)}
        </select>
        <button className="btn-ghost" onClick={() => setName({ name: '' })}><IconPlus size={18} />Bank baru</button>
        {bank && <>
          <button className="btn-ghost" onClick={() => setName({ id: bank.id, name: bank.name })}><IconPencil size={16} />Ubah nama</button>
          <button className="btn-ghost" onClick={() => confirm(`Hapus bank "${bank.name}" beserta soalnya?`) && act(deleteBank(bank.id), 'Bank soal dihapus.', () => setBankId(''))}><IconTrash size={16} />Hapus bank</button>
          <span className="flex-1" />
          <button className="btn-ghost" onClick={() => setBulk('')}>Tempel banyak soal</button>
          <button className="btn-primary" onClick={() => setF(blankQ())}><IconPlus size={18} />Tambah soal</button>
        </>}
      </div>
      {!bank ? <div className="card"><Empty title="Belum ada bank soal" body="Buat bank soal, lalu isi dengan soal pilihan ganda." action={<button className="btn-primary" onClick={() => setName({ name: '' })}>Buat bank soal</button>} /></div>
        : qs.length === 0 ? <div className="card"><Empty title="Bank soal masih kosong" body="Tambah soal satu per satu atau tempel banyak soal sekaligus." /></div> : (
        <ol className="space-y-3">
          {qs.map((q, i) => (
            <li key={q.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium"><span className="mr-2 text-muted">{i + 1}.</span>{q.body}</p>
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost !min-h-9" onClick={() => edit(q)} aria-label="Ubah soal"><IconPencil size={16} /></button>
                  <button className="btn-ghost !min-h-9" onClick={() => confirm('Hapus soal ini?') && act(deleteQuestion(q.id), 'Soal dihapus.')} aria-label="Hapus soal"><IconTrash size={16} /></button>
                </div>
              </div>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {q.options.map((o, k) => <li key={k} className={k === q.correctIdx ? 'font-semibold text-emerald-700' : 'text-muted'}>{String.fromCharCode(65 + k)}. {o}{k === q.correctIdx ? ' (kunci)' : ''}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <Modal open={!!name} title={name?.id ? 'Ubah nama bank soal' : 'Bank soal baru'} onClose={() => setName(null)}>
        {name && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveBank(name), 'Bank soal disimpan.', () => setName(null)) }}>
          <Field label="Nama bank soal"><input className="input" required value={name.name} onChange={(e) => setName({ ...name, name: e.target.value })} /></Field>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>

      <Modal open={!!f} title={f?.id ? 'Ubah soal' : 'Tambah soal'} onClose={() => setF(null)}>
        {f && bank && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveQuestions(bank.id, [{ ...f, options: f.options.filter((o) => o.trim()) }]), 'Soal disimpan.', () => setF(null)) }}>
          <Field label="Soal"><textarea className="input !py-2" rows={3} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <fieldset className="space-y-2"><legend className="label">Pilihan jawaban (pilih yang benar)</legend>
            {f.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <input type="radio" name="kunci" className="size-4 accent-brand-600" checked={f.correctIdx === k} onChange={() => setF({ ...f, correctIdx: k })} aria-label={`Jadikan pilihan ${String.fromCharCode(65 + k)} kunci jawaban`} />
                <span className="w-5 text-sm font-semibold text-muted">{String.fromCharCode(65 + k)}</span>
                <input className="input" required={k < 2} value={o} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === k ? e.target.value : x)) })} aria-label={`Pilihan ${String.fromCharCode(65 + k)}`} />
              </div>
            ))}
            {f.options.length < 5 && <button type="button" className="text-sm font-semibold text-brand-600" onClick={() => setF({ ...f, options: [...f.options, ''] })}>Tambah pilihan</button>}
          </fieldset>
          <button className="btn-primary w-full">Simpan soal</button>
        </form>}
      </Modal>

      <Modal open={bulk !== null} title="Tempel banyak soal" onClose={() => setBulk(null)}>
        {bulk !== null && bank && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveQuestions(bank.id, parsed), `${parsed.length} soal ditambahkan.`, () => setBulk(null)) }}>
          <p className="text-sm text-muted">Pisahkan tiap soal dengan baris kosong. Baris pertama adalah soal, baris berikutnya pilihan jawaban. Beri tanda <code className="rounded bg-canvas px-1 font-mono">*</code> di depan pilihan yang benar.</p>
          <textarea className="input !py-2 font-mono text-xs" rows={10} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Daftar soal" placeholder={'Ibu kota Indonesia adalah...\nBandung\n*Jakarta\nSurabaya\n\n2 + 2 = ...\n3\n*4\n5'} />
          <p className="text-sm font-medium">{parsed.length} soal terbaca.</p>
          <button className="btn-primary w-full" disabled={parsed.length === 0}>Tambahkan</button>
        </form>}
      </Modal>
    </>
  )
}

/* ---------- hasil dan keputusan ---------- */
function HasilSeleksi() {
  const s = useStore((x) => x)
  const act = useAct()
  const [pick, setPick] = useState<string | null>(null)
  const [batchId, setBatchId] = useState('')
  const rows = s.registrations.filter((r) => ['menunggu_hasil', 'registrasi_ulang', 'aktif', 'tidak_lulus'].includes(r.stage))
    .map((r) => ({ r, u: s.users.find((x) => x.id === r.userId), p: s.programs.find((x) => x.id === r.programId), a: s.attempts.filter((x) => x.registrationId === r.id && x.finishedAt).sort((m, n) => n.finishedAt.localeCompare(m.finishedAt))[0] }))
    .sort((m, n) => (m.r.stage === 'menunggu_hasil' ? -1 : 0) - (n.r.stage === 'menunggu_hasil' ? -1 : 0) || (n.a?.finishedAt ?? '').localeCompare(m.a?.finishedAt ?? ''))
  const target = rows.find((x) => x.r.id === pick)
  const options = s.batches.filter((b) => b.programId === target?.r.programId && ['open', 'running'].includes(b.status))
  const label: Record<string, string> = { menunggu_hasil: 'Menunggu keputusan', registrasi_ulang: 'Lulus, registrasi ulang', aktif: 'Aktif belajar', tidak_lulus: 'Tidak lulus' }
  return (
    <>
      <p className="mb-4 text-sm text-muted">Tidak ada nilai minimal. Admin menilai skor dan memutuskan sendiri. Peserta tidak melihat skor.</p>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada peserta yang selesai ujian" body="Peserta muncul di sini setelah mengumpulkan jawaban." /></div> : (
        <Table head={['Peserta', 'Program', 'Selesai', 'Skor', 'Status', '']}>
          {rows.map(({ r, u, p, a }) => (
            <tr key={r.id}>
              <td className="font-semibold">{u?.name}<p className="font-mono text-xs font-normal text-muted">{r.code}</p></td>
              <td>{p?.title}</td>
              <td className="text-xs">{a ? dateTimeID(a.finishedAt) : '-'}</td>
              <td className="font-mono font-semibold">{a?.score != null ? a.score.toFixed(1) : '-'}</td>
              <td><span className="text-sm">{label[r.stage]}</span></td>
              <td className="whitespace-nowrap text-right">
                {r.stage === 'menunggu_hasil' && <>
                  <button className="btn-primary !min-h-9" onClick={() => { setPick(r.id); setBatchId('') }}>Putuskan</button>
                </>}
                {r.admissionNo && <a className="btn-ghost !min-h-9" href={`/api/surat/${r.id}/pdf`} target="_blank" rel="noreferrer"><IconDownload size={16} />Surat</a>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!target} title={`Keputusan: ${target?.u?.name ?? ''}`} onClose={() => setPick(null)}>
        {target && <div className="space-y-4">
          <p className="text-sm">Skor ujian <b className="font-mono">{target.a?.score?.toFixed(1) ?? '-'}</b>. {target.p?.title}.</p>
          <Field label="Angkatan untuk peserta yang lulus" hint="Wajib dipilih bila dinyatakan lulus. Angkatan tercetak di surat kelulusan.">
            <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Pilih angkatan</option>
              {options.map((b) => { const left = b.quota - (s.seats[b.id] ?? 0); return <option key={b.id} value={b.id} disabled={left <= 0}>{b.code} · mulai {dateID(b.startDate)} · {left > 0 ? `sisa ${left}` : 'penuh'}</option> })}
            </select>
          </Field>
          {options.length === 0 && <p className="text-sm text-amber-800">Belum ada angkatan dibuka untuk program ini. Buat dulu di menu Program dan angkatan.</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!batchId} onClick={() => act(decideAdmission(target.r.id, true, batchId), 'Peserta dinyatakan lulus. Surat kelulusan dan notifikasi dikirim.', () => setPick(null))}>Lulus dan diterima</button>
            <button className="btn-danger" onClick={() => confirm('Nyatakan peserta tidak lulus? Keputusan tidak bisa dibatalkan.') && act(decideAdmission(target.r.id, false), 'Peserta dinyatakan tidak lulus.', () => setPick(null))}>Tidak lulus</button>
          </div>
        </div>}
      </Modal>
    </>
  )
}

/* ---------- pengaturan surat ---------- */
function PengaturanSurat() {
  const st = useStore((x) => x.settings)
  const act = useAct()
  const [f, setF] = useState({
    lpkRegNo: st.lpkRegNo ?? '', ketuaName: st.ketuaName ?? '', batchLabel: st.batchLabel ?? '', email: st.email ?? '', website: st.website ?? '', hotline: st.hotline ?? '',
    kuliahUmum: st.kuliahUmum ?? '', trainingStart: st.trainingStart ?? '',
  })
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); act(saveLetterSettings(f), 'Pengaturan surat disimpan.') }}>
      <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">Isi surat kelulusan diambil dari data peserta dan pengaturan ini. Tanggal registrasi ulang, batas pengembalian dana, dan pelunasan diatur bagian keuangan di menu Biaya.</p>
      <Field label="Nomor registrasi LPK"><input className="input" value={f.lpkRegNo} onChange={set('lpkRegNo')} /></Field>
      <Field label="Nama ketua LPK (penanda tangan)"><input className="input" required value={f.ketuaName} onChange={set('ketuaName')} /></Field>
      <Field label="Nama batch" hint="Contoh: Batch Ganjil TA. 2026/2027"><input className="input" required value={f.batchLabel} onChange={set('batchLabel')} /></Field>
      <Field label="Hotline pembayaran"><input className="input" type="tel" value={f.hotline} onChange={set('hotline')} /></Field>
      <Field label="Email lembaga"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Situs web"><input className="input" value={f.website} onChange={set('website')} /></Field>
      <Field label="Tanggal kuliah umum"><input className="input" type="date" value={f.kuliahUmum} onChange={set('kuliahUmum')} /></Field>
      <Field label="Tanggal mulai pelatihan"><input className="input" type="date" value={f.trainingStart} onChange={set('trainingStart')} /></Field>
      <div className="sm:col-span-2 lg:col-span-3"><button className="btn-primary">Simpan</button></div>
    </form>
  )
}

/* ---------- Biaya (keuangan) ---------- */
type BTab = 'pokok' | 'total' | 'tambahan' | 'paket'
const BTABS: [BTab, string][] = [['pokok', 'Pendaftaran dan rekening'], ['total', 'Total biaya program'], ['tambahan', 'Biaya tambahan'], ['paket', 'Paket cicilan']]

export function Biaya() {
  const [tab, setTab] = useState<BTab>('pokok')
  return (
    <>
      <PageHeader title="Biaya dan cicilan" sub="Biaya yang tampil ke peserta mengikuti pengaturan di halaman ini." />
      <div role="tablist" aria-label="Bagian biaya" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {BTABS.map(([k, text]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>{text}</button>
        ))}
      </div>
      {tab === 'pokok' && <BiayaPokok />}
      {tab === 'total' && <TotalBiaya />}
      {tab === 'tambahan' && <BiayaTambahan />}
      {tab === 'paket' && <PaketCicilan />}
    </>
  )
}

function BiayaPokok() {
  const st = useStore((x) => x.settings)
  const act = useAct()
  const [f, setF] = useState({
    regFee: st.regFee ?? 200000, minReenroll: st.minReenroll ?? 1000000, bankName: st.bankName ?? '', bankAccount: st.bankAccount ?? '', bankHolder: st.bankHolder ?? '',
    reenrollDue: st.reenrollDue ?? '', refundCutoff: st.refundCutoff ?? '', pelunasanDue: st.pelunasanDue ?? '',
  })
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value })
  return (
    <form className="card divide-y divide-line" onSubmit={(e) => { e.preventDefault(); act(saveFees(f), 'Pengaturan biaya disimpan.') }}>
      <section className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3"><h2 className="font-bold">Biaya</h2><p className="text-sm text-muted">Biaya pendaftaran yang sudah dibayar peserta mengurangi total yang dicicil saat registrasi ulang.</p></div>
        <Field label="Biaya pendaftaran (Rp)"><input className="input tabular-nums" type="number" min={0} required value={f.regFee} onChange={set('regFee')} /></Field>
        <Field label="Minimal registrasi ulang (Rp)" hint="Dicetak di surat kelulusan."><input className="input tabular-nums" type="number" min={0} required value={f.minReenroll} onChange={set('minReenroll')} /></Field>
      </section>
      <section className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="font-bold sm:col-span-2 lg:col-span-3">Rekening pembayaran</h2>
        <Field label="Bank"><input className="input" required value={f.bankName} onChange={set('bankName')} /></Field>
        <Field label="Nomor rekening"><input className="input font-mono" required value={f.bankAccount} onChange={set('bankAccount')} /></Field>
        <Field label="Atas nama"><input className="input" required value={f.bankHolder} onChange={set('bankHolder')} /></Field>
      </section>
      <section className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="font-bold sm:col-span-2 lg:col-span-3">Batas waktu</h2>
        <Field label="Batas registrasi ulang"><input className="input" type="date" required value={f.reenrollDue} onChange={set('reenrollDue')} /></Field>
        <Field label="Batas pengembalian dana (potongan 50%)"><input className="input" type="date" required value={f.refundCutoff} onChange={set('refundCutoff')} /></Field>
        <Field label="Batas pelunasan biaya pelatihan"><input className="input" type="date" required value={f.pelunasanDue} onChange={set('pelunasanDue')} /></Field>
      </section>
      <div className="flex justify-end p-5"><button className="btn-primary">Simpan</button></div>
    </form>
  )
}

/** Total per program: biaya pelatihan, biaya tambahan yang berlaku, dan sisa yang dicicil setelah biaya pendaftaran. */
function TotalBiaya() {
  const s = useStore((x) => x)
  const act = useAct()
  const [prices, setPrices] = useState<Record<string, number>>({})
  const programs = s.programs.filter((p) => !p.archived)
  const regFee = s.settings.regFee ?? 0
  if (programs.length === 0) return <div className="card"><Empty title="Belum ada program" body="Tambahkan program di menu Program dan angkatan, lalu atur total biayanya di sini." /></div>
  return (
    <>
      <Table head={['Program', 'Biaya pelatihan (Rp)', 'Biaya tambahan', 'Total keseluruhan', 'Dicicil setelah pendaftaran', '']}>
        {programs.map((p) => {
          const price = prices[p.id] ?? p.price
          const extra = s.feeItems.filter((x) => x.active && (!x.programId || x.programId === p.id)).reduce((t, x) => t + x.amount, 0)
          const dirty = prices[p.id] != null && prices[p.id] !== p.price
          return (
            <tr key={p.id}>
              <td className="font-semibold">{p.title}</td>
              <td><input className="input !min-h-10 min-w-36 text-right tabular-nums" type="number" min={0} aria-label={`Biaya pelatihan ${p.title}`} value={price} onChange={(e) => setPrices({ ...prices, [p.id]: +e.target.value })} /></td>
              <td className="tabular-nums">{rupiah(extra)}</td>
              <td className="font-semibold tabular-nums">{rupiah(price + extra)}</td>
              <td className="tabular-nums">{rupiah(Math.max(0, price + extra - regFee))}</td>
              <td className="text-right"><button className="btn-primary !min-h-10" disabled={!dirty} onClick={() => act(setProgramPrice(p.id, price), 'Total biaya program disimpan.', () => { const rest = { ...prices }; delete rest[p.id]; setPrices(rest) })}>Simpan</button></td>
            </tr>
          )
        })}
      </Table>
      <p className="mt-3 text-xs text-muted">Kolom terakhir adalah biaya pelatihan ditambah biaya tambahan, dikurangi biaya pendaftaran {rupiah(regFee)}. Perubahan berlaku untuk peserta yang belum memilih paket pembayaran.</p>
    </>
  )
}

function BiayaTambahan() {
  const s = useStore((x) => x)
  const act = useAct()
  const [item, setItem] = useState<{ id?: string; name: string; amount: number; programId: string; active: boolean } | null>(null)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">Biaya seperti jas almamater ditambahkan ke total yang dicicil peserta. Setiap pembayaran, termasuk biaya pendaftaran, mengurangi sisa total.</p>
        <button className="btn-primary" onClick={() => setItem({ name: '', amount: 0, programId: '', active: true })}><IconPlus size={18} />Biaya baru</button>
      </div>
      {s.feeItems.length === 0 ? <div className="card"><Empty title="Belum ada biaya tambahan" body="Contoh: jas almamater, seragam, atau modul. Biaya aktif langsung masuk ke total peserta yang memilih paket sesudahnya." action={<button className="btn-primary" onClick={() => setItem({ name: 'Jas almamater', amount: 0, programId: '', active: true })}>Tambah jas almamater</button>} /></div> : (
        <Table head={['Biaya', 'Berlaku untuk', 'Nominal', 'Status', '']}>
          {s.feeItems.map((x) => (
            <tr key={x.id}>
              <td className="font-semibold">{x.name}</td>
              <td>{x.programId ? s.programs.find((p) => p.id === x.programId)?.title : 'Semua program'}</td>
              <td className="tabular-nums">{rupiah(x.amount)}</td>
              <td>{x.active ? <span className="text-sm font-medium text-emerald-700">Aktif</span> : <span className="text-sm text-muted">Nonaktif</span>}</td>
              <td className="whitespace-nowrap text-right">
                <button className="btn-ghost !min-h-10" onClick={() => setItem(x)} aria-label={`Ubah ${x.name}`}><IconPencil size={16} /></button>{' '}
                <button className="btn-ghost !min-h-10" onClick={() => confirm(`Hapus biaya "${x.name}"? Jadwal cicilan yang sudah dibuat tidak berubah.`) && act(deleteFeeItem(x.id), 'Biaya dihapus.')} aria-label={`Hapus ${x.name}`}><IconTrash size={16} /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!item} title={item?.id ? 'Ubah biaya tambahan' : 'Biaya tambahan baru'} onClose={() => setItem(null)}>
        {item && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveFeeItem(item), 'Biaya disimpan.', () => setItem(null)) }}>
          <Field label="Nama biaya"><input className="input" required value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></Field>
          <Field label="Nominal (Rp)"><input className="input" type="number" min={0} required value={item.amount} onChange={(e) => setItem({ ...item, amount: +e.target.value })} /></Field>
          <Field label="Berlaku untuk"><select className="input" value={item.programId} onChange={(e) => setItem({ ...item, programId: e.target.value })}><option value="">Semua program</option>{s.programs.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={item.active} onChange={(e) => setItem({ ...item, active: e.target.checked })} />Aktif (masuk ke total peserta)</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
    </>
  )
}

function PaketCicilan() {
  const s = useStore((x) => x)
  const act = useAct()
  const [plan, setPlan] = useState<(Omit<PaymentPlan, 'id'> & { id?: string }) | null>(null)
  const programs = s.programs.filter((p) => !p.archived)
  const sample = programs[0]
  const sampleTotal = sample ? Math.max(0, sample.price + s.feeItems.filter((x) => x.active && (!x.programId || x.programId === sample.id)).reduce((t, x) => t + x.amount, 0) - (s.settings.regFee ?? 0)) : 0
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">Termin 1 berarti bayar sekali. Termin lebih dari 1: pembayaran pertama sebesar uang muka, sisanya dibagi rata sampai batas pelunasan.</p>
        <button className="btn-primary" onClick={() => setPlan({ name: '', programId: '', downPayment: s.settings.minReenroll ?? 1000000, installments: 3, active: true })}><IconPlus size={18} />Paket baru</button>
      </div>
      {s.plans.length === 0 ? <div className="card"><Empty title="Belum ada paket" body="Tanpa paket, peserta tidak bisa memilih cara membayar registrasi ulang." /></div> : (
        <Table head={['Paket', 'Program', 'Uang muka', 'Termin', sample ? `Contoh: ${sample.title}` : 'Contoh', '']}>
          {s.plans.map((p) => {
            const v = planPreview(sampleTotal, p)
            return (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}{p.active ? '' : <span className="ml-2 text-xs font-normal text-muted">nonaktif</span>}</td>
                <td>{p.programId ? s.programs.find((x) => x.id === p.programId)?.title : 'Semua program'}</td>
                <td className="tabular-nums">{rupiah(p.downPayment)}</td><td>{p.installments}x</td>
                <td className="text-xs text-muted">{!sample ? '-' : v.count === 0 ? `${rupiah(v.first)} sekaligus` : `${rupiah(v.first)} + ${v.count} x ${rupiah(v.each)}`}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-ghost !min-h-10" onClick={() => setPlan(p)} aria-label={`Ubah ${p.name}`}><IconPencil size={16} /></button>{' '}
                  <button className="btn-ghost !min-h-10" onClick={() => confirm(`Hapus paket "${p.name}"?`) && act(deletePlan(p.id), 'Paket dihapus atau dinonaktifkan.')} aria-label={`Hapus ${p.name}`}><IconTrash size={16} /></button>
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <Modal open={!!plan} title={plan?.id ? 'Ubah paket' : 'Paket baru'} onClose={() => setPlan(null)}>
        {plan && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(savePlan(plan), 'Paket disimpan.', () => setPlan(null)) }}>
          <Field label="Nama paket"><input className="input" required value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></Field>
          <Field label="Berlaku untuk"><select className="input" value={plan.programId} onChange={(e) => setPlan({ ...plan, programId: e.target.value })}><option value="">Semua program</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uang muka (Rp)" hint="Pembayaran pertama."><input className="input" type="number" min={0} required value={plan.downPayment} onChange={(e) => setPlan({ ...plan, downPayment: +e.target.value })} /></Field>
            <Field label="Jumlah termin" hint="Termasuk uang muka."><input className="input" type="number" min={1} max={36} required value={plan.installments} onChange={(e) => setPlan({ ...plan, installments: +e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={plan.active} onChange={(e) => setPlan({ ...plan, active: e.target.checked })} />Paket aktif</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
    </>
  )
}
