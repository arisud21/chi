import { useRef, useState } from 'react'
import { Empty, Field, PageHeader, useAct } from '../../components/ui'
import { saveTemplate, sendAnnouncement, uploadTemplate, useStore } from '../../lib/store'
import type { FieldCfg, TemplateConfig } from '../../lib/types'

function useMyBatches() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const batches = s.batches.filter((b) => me.role !== 'instruktur' || b.instructorId === me.id)
  return { s, me, batches }
}

/* ---------------- Editor visual template sertifikat (CER-2, CER-3) ---------------- */
const FIELD_LABEL: Record<string, string> = {
  institution: 'Nama lembaga', title: 'Judul', number: 'Nomor', intro: 'Kalimat pembuka', name: 'Nama peserta', desc: 'Uraian program',
  date: 'Tanggal terbit', signerTitle: 'Jabatan penanda tangan', signerName: 'Nama penanda tangan', code: 'Kode verifikasi',
}
const SAMPLE: Record<string, string> = {
  institution: 'CIMAHI INSTITUTE HOTEL', title: 'Sertifikat Pelatihan', number: 'CERT/CIH/2026/0001', intro: 'diberikan kepada', name: 'Nama Peserta Contoh',
  desc: 'atas keberhasilan menyelesaikan program Front Office Hotel (80 jam)', date: 'Diterbitkan 8 November 2026', signerTitle: 'Kepala Akademik', signerName: 'Nama Penanda Tangan', code: 'Kode verifikasi: CONTOH0000',
}

export function TemplateEditor() {
  const s = useStore((x) => x)
  const act = useAct()
  const active = s.templates.find((t) => t.isActive) ?? s.templates[0]
  const [id, setId] = useState(active?.id)
  const tpl = s.templates.find((t) => t.id === id) ?? active
  const [cfg, setCfg] = useState<TemplateConfig | null>(tpl ? structuredClone(tpl.config) : null)
  const [sel, setSel] = useState('name')
  const [bg, setBg] = useState<File | null>(null)
  const [sig, setSig] = useState<File | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const drag = useRef<{ key: string } | null>(null)

  if (!tpl || !cfg) return <><PageHeader title="Template sertifikat" /><div className="card"><Empty title="Belum ada template" body="Jalankan seed data atau unggah template pertama." /></div></>

  const pick = (nid: string) => { setId(nid); const t = s.templates.find((x) => x.id === nid)!; setCfg(structuredClone(t.config)) }
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !canvas.current) return
    const r = canvas.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))
    const k = drag.current.key
    setCfg((c) => {
      if (!c) return c
      if (k === 'qr' || k === 'signature') return { ...c, [k]: { ...c[k], x: Math.round(x), y: Math.round(y) } }
      return { ...c, fields: { ...c.fields, [k]: { ...c.fields[k], x: Math.round(x), y: Math.round(y) } } }
    })
  }
  const field = cfg.fields[sel] as FieldCfg | undefined
  const patchField = (p: Partial<FieldCfg>) => setCfg({ ...cfg, fields: { ...cfg.fields, [sel]: { ...cfg.fields[sel], ...p } } })
  const widthPx = 640

  return (
    <>
      <PageHeader title="Template sertifikat" sub="Seret elemen ke posisi yang diinginkan. Pratinjau PDF memakai data contoh sebelum template diaktifkan."
        action={<select className="input !w-auto" value={tpl.id} onChange={(e) => pick(e.target.value)} aria-label="Versi template">{s.templates.map((t) => <option key={t.id} value={t.id}>Versi {t.version}{t.isActive ? ' (aktif)' : ''}</option>)}</select>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto p-4">
          <div ref={canvas} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}
            className="relative mx-auto select-none overflow-hidden rounded-lg border border-line bg-white" style={{ width: widthPx, aspectRatio: '842 / 595', touchAction: 'none' }}>
            {tpl.hasBackground ? <img src={`/api/files/${tpl.backgroundFileId}`} alt="" className="absolute inset-0 size-full object-cover" draggable={false} /> : <div className="absolute inset-3 border-4 border-double border-brass-500" />}
            {Object.entries(cfg.fields).map(([k, f]) => (
              <button key={k} type="button" onPointerDown={(e) => { drag.current = { key: k }; setSel(k); (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
                className={`absolute cursor-move whitespace-nowrap rounded px-1 leading-tight ${sel === k ? 'outline outline-2 outline-brand-500' : 'hover:outline hover:outline-1 hover:outline-brand-200'}`}
                style={{ left: `${f.x}%`, top: `${f.y}%`, transform: f.align === 'center' ? 'translateX(-50%)' : f.align === 'right' ? 'translateX(-100%)' : undefined, fontSize: (f.size * widthPx) / 842, color: f.color, fontFamily: ['title', 'name', 'institution'].includes(k) ? 'Georgia, serif' : undefined, fontWeight: ['title', 'name', 'institution'].includes(k) ? 700 : 400 }}>
                {SAMPLE[k]}
              </button>
            ))}
            <button type="button" onPointerDown={(e) => { drag.current = { key: 'qr' }; setSel('qr'); (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
              className={`absolute grid cursor-move place-items-center bg-ink/80 text-[10px] text-white ${sel === 'qr' ? 'outline outline-2 outline-brand-500' : ''}`}
              style={{ left: `${cfg.qr.x}%`, top: `${cfg.qr.y}%`, width: (cfg.qr.size * widthPx) / 842, height: (cfg.qr.size * widthPx) / 842, transform: 'translateX(-50%)' }}>QR</button>
            {tpl.hasSignature && <button type="button" onPointerDown={(e) => { drag.current = { key: 'signature' }; setSel('signature'); (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
              className={`absolute cursor-move ${sel === 'signature' ? 'outline outline-2 outline-brand-500' : ''}`} style={{ left: `${cfg.signature.x}%`, top: `${cfg.signature.y}%`, width: (cfg.signature.size * widthPx) / 842, transform: 'translateX(-50%)' }}>
              <img src={`/api/files/${tpl.signatureFileId}`} alt="Tanda tangan" draggable={false} className="w-full" /></button>}
          </div>
          <p className="mt-3 text-center text-xs text-muted">Posisi di PDF dapat bergeser beberapa piksel dari kanvas ini. Cek lewat pratinjau PDF.</p>
        </div>
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="font-bold">{FIELD_LABEL[sel] ?? (sel === 'qr' ? 'QR code' : 'Tanda tangan')}</h2>
            {field ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ukuran font"><input className="input" type="number" min={6} max={72} value={field.size} onChange={(e) => patchField({ size: +e.target.value })} /></Field>
                  <Field label="Warna"><input className="input !p-1" type="color" value={field.color} onChange={(e) => patchField({ color: e.target.value })} /></Field>
                </div>
                <Field label="Rata teks"><select className="input" value={field.align} onChange={(e) => patchField({ align: e.target.value as FieldCfg['align'] })}><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option></select></Field>
              </div>
            ) : (
              <Field label="Ukuran (px)"><input className="input" type="number" min={30} max={300} value={(cfg as any)[sel]?.size ?? 64} onChange={(e) => setCfg({ ...cfg, [sel]: { ...(cfg as any)[sel], size: +e.target.value } } as TemplateConfig)} /></Field>
            )}
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Berkas template</h2>
            <Field label="Latar (JPG/PNG, minimal 300 DPI)" hint="Maksimal 2 MB. Ukuran A4 lanskap."><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setBg(e.target.files?.[0] ?? null)} /></Field>
            <Field label="Tanda tangan (PNG transparan)"><input className="input !py-2" type="file" accept=".png" onChange={(e) => setSig(e.target.files?.[0] ?? null)} /></Field>
            <button className="btn-ghost w-full" disabled={!bg && !sig} onClick={() => act(uploadTemplate(bg, sig), 'Versi template baru dibuat. Pilih dari daftar versi.', () => { setBg(null); setSig(null) })}>Unggah sebagai versi baru</button>
          </section>
          <div className="grid gap-2">
            <a className="btn-ghost" href={`/api/templates/${tpl.id}/preview.pdf`} target="_blank" rel="noreferrer" onClick={() => { void saveTemplate(tpl.id, cfg, false) }}>Pratinjau PDF (data contoh)</a>
            <button className="btn-ghost" onClick={() => act(saveTemplate(tpl.id, cfg, false), 'Posisi disimpan.')}>Simpan posisi</button>
            <button className="btn-primary" disabled={tpl.isActive} onClick={() => act(saveTemplate(tpl.id, cfg, true), 'Template diaktifkan untuk sertifikat berikutnya.')}>{tpl.isActive ? 'Template ini aktif' : 'Simpan dan aktifkan'}</button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------- Pengumuman (EML-4, LRN-5) ---------------- */
export function PengumumanForm() {
  const { s, me, batches } = useMyBatches()
  const act = useAct()
  const [scope, setScope] = useState<'all' | 'program' | 'batch'>(me.role === 'instruktur' ? 'batch' : 'all')
  const [target, setTarget] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const options = scope === 'program' ? s.programs.filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.title })) : batches.map((b) => ({ id: b.id, label: b.code }))
  return (
    <form className="card mb-6 grid gap-3 p-5 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(sendAnnouncement(scope, target || options[0]?.id || '', subject, body), 'Pengumuman masuk antrean email.', () => { setSubject(''); setBody('') }) }}>
      <h2 className="font-bold md:col-span-2">Kirim pengumuman</h2>
      <Field label="Penerima">
        <select className="input" value={scope} onChange={(e) => { setScope(e.target.value as any); setTarget('') }}>
          {me.role !== 'instruktur' && <option value="all">Semua peserta aktif</option>}{me.role !== 'instruktur' && <option value="program">Per program</option>}<option value="batch">Per angkatan</option>
        </select>
      </Field>
      {scope !== 'all' && <Field label="Pilih"><select className="input" value={target || options[0]?.id} onChange={(e) => setTarget(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>}
      <div className="md:col-span-2"><Field label="Subjek"><input className="input" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field></div>
      <div className="md:col-span-2"><Field label="Isi"><textarea className="input !py-2" required rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></Field></div>
      <div className="md:col-span-2"><button className="btn-primary">Kirim ke antrean</button></div>
    </form>
  )
}
