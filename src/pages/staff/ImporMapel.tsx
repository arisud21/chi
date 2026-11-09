import { IconDownload, IconFileSpreadsheet } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Field, Modal, Table, useToast } from '../../components/ui'
import { SAMPLE_CSV, parseSubjects, titleScore, type ParsedSubject } from '../../lib/subjectImport'
import { importSubjects, readSheet, useStore } from '../../lib/store'

type Source = 'link' | 'file' | 'tempel'
const SOURCES: [Source, string][] = [['link', 'Tautan Google Sheets'], ['file', 'Unggah file CSV'], ['tempel', 'Tempel dari spreadsheet']]
export const SUBJECT_KIND: Record<string, string> = { teori: 'Teori', praktik: 'Praktik', teori_praktik: 'Teori dan praktik' }

/** Mata pelajaran berketerangan "Kelas Gabungan" dipakai bersama oleh semua pelatihan, jadi cukup diimpor satu kali. */
const isShared = (r: ParsedSubject) => /gabungan/i.test(r.description)

interface Block { title: string; rows: ParsedSubject[]; shared: boolean; note?: string }

/** Impor bank mata pelajaran dari spreadsheet: baca, petakan tiap bagian ke pelatihan, tinjau, lalu impor. */
export function ImporMapel({ open, onClose, defaultProgramId }: { open: boolean; onClose: () => void; defaultProgramId: string }) {
  const s = useStore((x) => x)
  const toast = useToast()
  const programs = s.programs.filter((p) => !p.archived)
  const [src, setSrc] = useState<Source>('link')
  const [url, setUrl] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [target, setTarget] = useState<string[]>([]) // id pelatihan per blok; untuk blok gabungan: 'on' atau ''
  const [update, setUpdate] = useState(true)

  const reset = () => { setBlocks(null); setTarget([]) }
  const close = () => { reset(); setUrl(''); setPasted(''); onClose() }

  const load = (text: string) => {
    const parsed = parseSubjects(text)
    if (!parsed.length) return toast('Format tidak dikenali. Pastikan ada judul kolom: No, Kode, Mata Kuliah, Jam/Pertemuan, Jumlah Pertemuan, Jumlah Jam.', 'err')
    // Kelas gabungan dikumpulkan dari semua bagian dan digabung per nama, jadi hanya satu salinan.
    const shared = new Map<string, ParsedSubject>()
    const seen = new Map<string, number>()
    const own = parsed.map((sec) => ({
      title: sec.title, shared: false,
      rows: sec.rows.filter((r) => {
        if (!isShared(r)) return true
        const key = r.name.trim().toLowerCase()
        seen.set(key, (seen.get(key) ?? 0) + 1)
        if (!shared.has(key)) shared.set(key, r)
        return false
      }),
    })).filter((b) => b.rows.length > 0)
    const list: Block[] = own
    if (shared.size) list.push({ title: 'Kelas gabungan', shared: true, rows: [...shared.values()], note: `Berlaku untuk semua pelatihan dan diimpor sekali. Di spreadsheet muncul ${[...seen.values()].reduce((a, b) => Math.max(a, b), 1)} kali.` })
    setBlocks(list)
    // Petakan otomatis ke pelatihan dengan nama paling mirip. Di bawah 0.7 dibiarkan kosong agar dipilih manual.
    setTarget(list.map((b) => {
      if (b.shared) return 'on'
      const best = programs.map((p) => ({ id: p.id, sc: titleScore(b.title, p.title) })).sort((a, c) => c.sc - a.sc)[0]
      return best && best.sc >= 0.7 ? best.id : own.length === 1 ? defaultProgramId : ''
    }))
  }

  const readLink = async () => {
    setBusy(true)
    const r = await readSheet(url)
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    load(r.data as string)
  }
  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 1_000_000) return toast('Berkas terlalu besar (maksimal 1 MB).', 'err')
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) return toast('Unggah berkas CSV. Di Excel atau Google Sheets pilih Unduh atau Simpan sebagai CSV.', 'err')
    load(await file.text())
  }

  const exists = (pid: string, name: string) => s.subjects.some((x) => x.programId === pid && x.name.trim().toLowerCase() === name.trim().toLowerCase())
  const plan = useMemo(() => (blocks ?? []).map((b, i) => b.rows.map((r) => {
    const t = target[i]
    const state = !t ? 'skip' : r.problems.length ? 'bad' : exists(b.shared ? '' : t, r.name) ? (update ? 'update' : 'same') : 'new'
    return { r, state }
  })), [blocks, target, update, s.subjects]) // eslint-disable-line react-hooks/exhaustive-deps
  const count = (st: string) => plan.flat().filter((x) => x.state === st).length
  const importable = count('new') + count('update')

  const run = async () => {
    const items = (blocks ?? []).flatMap((b, i) => target[i]
      ? b.rows.filter((r) => !r.problems.length).map((r) => ({ shared: b.shared, programId: b.shared ? '' : target[i], code: r.code, name: r.name, kind: r.kind, hours: r.hours, hoursPerMeeting: r.hoursPerMeeting, meetings: r.meetings, description: r.description }))
      : [])
    setBusy(true)
    const res = await importSubjects(items, update)
    setBusy(false)
    if (!res.ok) return toast(res.error, 'err')
    const d = res.data as { added: number; updated: number; skipped: number }
    toast(`Impor selesai: ${d.added} baru, ${d.updated} diperbarui${d.skipped ? `, ${d.skipped} dilewati` : ''}.`)
    close()
  }

  const sample = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }))
    a.download = 'contoh-bank-mata-pelajaran.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const label: Record<string, { t: string; c: string }> = {
    new: { t: 'Baru', c: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }, update: { t: 'Diperbarui', c: 'bg-sky-50 text-sky-800 ring-sky-200' },
    same: { t: 'Sudah ada, dilewati', c: 'bg-zinc-100 text-zinc-700 ring-zinc-200' }, bad: { t: 'Perlu dibenahi', c: 'bg-red-50 text-red-800 ring-red-200' }, skip: { t: 'Bagian dilewati', c: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  }

  return (
    <Modal open={open} size="xl" title="Impor bank mata pelajaran" onClose={close}>
      {!blocks ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Format mengikuti spreadsheet kurikulum: satu bagian per pelatihan (misalnya ROOM DIVISION), dengan kolom No, Kode, Mata Kuliah, Keterangan, Jam/Pertemuan, Jumlah Pertemuan, dan Jumlah Jam Per Program. Mata pelajaran berketerangan <b>Kelas Gabungan</b> diimpor sekali dan bisa dipakai di semua pelatihan.</p>
          <div role="tablist" aria-label="Sumber data" className="flex gap-1 overflow-x-auto border-b border-line">
            {SOURCES.map(([k, text]) => <button key={k} role="tab" aria-selected={src === k} onClick={() => setSrc(k)} className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${src === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>{text}</button>)}
          </div>
          {src === 'link' && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); readLink() }}>
              <Field label="Tautan Google Sheets" hint='Spreadsheet harus dibagikan dengan akses "Siapa saja yang memiliki link". Tab yang dibaca mengikuti angka gid di tautan.'>
                <input className="input" type="url" required placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              </Field>
              <button className="btn-primary" disabled={busy}>{busy ? 'Membaca…' : 'Baca spreadsheet'}</button>
            </form>
          )}
          {src === 'file' && (
            <Field label="Berkas CSV" hint="Dari Google Sheets: Berkas, Unduh, Comma-separated values (.csv). Dari Excel: Simpan sebagai CSV UTF-8."><input className="input !py-2" type="file" accept=".csv,.tsv,.txt,text/csv" onChange={(e) => readFile(e.target.files?.[0])} /></Field>
          )}
          {src === 'tempel' && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); load(pasted) }}>
              <Field label="Tempel sel dari spreadsheet" hint="Blok semua sel termasuk judul kolom, salin, lalu tempel di sini."><textarea className="input !py-2 font-mono text-xs" rows={9} required value={pasted} onChange={(e) => setPasted(e.target.value)} /></Field>
              <button className="btn-primary">Baca data</button>
            </form>
          )}
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline" onClick={sample}><IconDownload size={16} />Unduh contoh format (CSV)</button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="flex items-center gap-2 text-sm"><IconFileSpreadsheet size={18} className="text-brand-600" />Terbaca <b>{blocks.length} bagian</b>, {blocks.reduce((t, x) => t + x.rows.length, 0)} mata pelajaran. Pilih pelatihan untuk tiap bagian, lalu tinjau.</p>
          {blocks.map((b, i) => (
            <section key={i} className="space-y-2" aria-label={`Bagian ${b.title}`}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{b.shared ? 'Dipakai bersama' : 'Bagian di spreadsheet'}</p><p className="font-bold">{b.title}</p>{b.note && <p className="text-xs text-muted">{b.note}</p>}</div>
                {b.shared
                  ? <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-brand-600" checked={target[i] === 'on'} onChange={(e) => setTarget(target.map((x, j) => (j === i ? (e.target.checked ? 'on' : '') : x)))} />Impor ke semua pelatihan</label>
                  : <label className="block min-w-60"><span className="label">Masuk ke pelatihan</span>
                    <select className="input" value={target[i] ?? ''} onChange={(e) => setTarget(target.map((x, j) => (j === i ? e.target.value : x)))}>
                      <option value="">Lewati bagian ini</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </label>}
              </div>
              <Table bare head={['Kode', 'Mata pelajaran', 'Jenis', 'Jam/pertemuan', 'Pertemuan', 'Jam total', 'Status']}>
                {b.rows.map((r, k) => {
                  const st = plan[i]?.[k]?.state ?? 'skip'
                  return (
                    <tr key={k}>
                      <td className="font-mono text-xs">{r.code || '-'}</td>
                      <td><p className="font-semibold">{r.name}</p>{r.description && <p className="text-xs text-muted">{r.description}</p>}{r.problems.length > 0 && <p className="text-xs font-medium text-red-700">{r.problems.join('. ')} (baris {r.row})</p>}</td>
                      <td>{SUBJECT_KIND[r.kind]}</td><td className="tabular-nums">{r.hoursPerMeeting ?? '-'}</td><td className="tabular-nums">{r.meetings ?? '-'}</td><td className="font-semibold tabular-nums">{r.hours || '-'}</td>
                      <td><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${label[st].c}`}>{label[st].t}</span></td>
                    </tr>
                  )
                })}
              </Table>
            </section>
          ))}
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={update} onChange={(e) => setUpdate(e.target.checked)} />Perbarui mata pelajaran yang sudah ada (nama sama di pelatihan yang sama). Bila dimatikan, yang sudah ada dilewati.</label>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button className="btn-primary" disabled={busy || importable === 0} onClick={run}>{busy ? 'Mengimpor…' : `Impor ${importable} mata pelajaran`}</button>
            <button className="btn-ghost" onClick={reset}>Kembali</button>
            <p className="text-sm text-muted">{count('new')} baru · {count('update')} diperbarui · {count('same') + count('skip')} dilewati{count('bad') ? ` · ${count('bad')} perlu dibenahi (tidak ikut diimpor)` : ''}</p>
          </div>
        </div>
      )}
    </Modal>
  )
}
