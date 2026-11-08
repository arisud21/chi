import { IconArrowDown, IconArrowUp, IconCopy, IconDeviceDesktop, IconDeviceMobile, IconEye, IconEyeOff, IconPhoto, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { SECTION_LABEL, SectionView } from '../../components/SectionRenderer'
import { Badge, Empty, Field, Modal, PageHeader, dateTimeID, newIdLike, useAct } from '../../components/ui'
import { deleteMedia, publishDraft, restoreRevision, saveDraft, uploadMedia, useStore } from '../../lib/store'
import type { Section, SectionType } from '../../lib/types'

type FieldDef = { key: string; label: string; kind?: 'text' | 'area' | 'number' | 'href' | 'media' }
interface TypeDef { fields: FieldDef[]; list?: { key: string; label: string; item: FieldDef[] }; blank: Record<string, any> }

const DEFS: Partial<Record<SectionType, TypeDef>> = {
  announcement_bar: { fields: [{ key: 'text', label: 'Teks' }, { key: 'href', label: 'Tautan (opsional)', kind: 'href' }], blank: { text: 'Pendaftaran angkatan baru dibuka.', href: '' } },
  hero: { fields: [{ key: 'title', label: 'Judul' }, { key: 'subtitle', label: 'Subjudul', kind: 'area' }, { key: 'imageId', label: 'Gambar latar (opsional)', kind: 'media' }, { key: 'ctaLabel', label: 'Label tombol utama' }, { key: 'ctaHref', label: 'Tujuan tombol utama', kind: 'href' }, { key: 'secondaryLabel', label: 'Label tombol kedua' }, { key: 'secondaryHref', label: 'Tujuan tombol kedua', kind: 'href' }], blank: { title: 'Judul baru', subtitle: '', ctaLabel: 'Daftar', ctaHref: '/daftar' } },
  stats: { fields: [{ key: 'note', label: 'Catatan kecil' }], blank: { note: '' } },
  programs: { fields: [{ key: 'title', label: 'Judul' }, { key: 'limit', label: 'Jumlah ditampilkan', kind: 'number' }], blank: { title: 'Program pelatihan', limit: 4 } },
  upcoming_batches: { fields: [{ key: 'title', label: 'Judul' }, { key: 'limit', label: 'Jumlah ditampilkan', kind: 'number' }], blank: { title: 'Angkatan dibuka', limit: 4 } },
  benefits: { fields: [{ key: 'title', label: 'Judul' }], list: { key: 'items', label: 'Poin', item: [{ key: 'title', label: 'Judul poin' }, { key: 'body', label: 'Isi', kind: 'area' }] }, blank: { title: 'Keunggulan', items: [{ title: '', body: '' }] } },
  faq: { fields: [{ key: 'title', label: 'Judul' }], list: { key: 'items', label: 'Pertanyaan', item: [{ key: 'q', label: 'Pertanyaan' }, { key: 'a', label: 'Jawaban', kind: 'area' }] }, blank: { title: 'FAQ', items: [{ q: '', a: '' }] } },
  cta: { fields: [{ key: 'title', label: 'Judul' }, { key: 'body', label: 'Isi', kind: 'area' }, { key: 'label', label: 'Label tombol' }, { key: 'href', label: 'Tujuan', kind: 'href' }], blank: { title: 'Ajakan', body: '', label: 'Daftar', href: '/daftar' } },
  about: { fields: [{ key: 'imageId', label: 'Gambar (opsional)', kind: 'media' }, { key: 'title', label: 'Judul' }, { key: 'body', label: 'Isi', kind: 'area' }], blank: { title: 'Tentang kami', body: '' } },
  testimonials: { fields: [{ key: 'title', label: 'Judul' }], list: { key: 'items', label: 'Testimoni', item: [{ key: 'name', label: 'Nama' }, { key: 'role', label: 'Jabatan atau angkatan' }, { key: 'quote', label: 'Kutipan', kind: 'area' }] }, blank: { title: 'Kata alumni', items: [{ name: '', role: '', quote: '' }] } },
  contact: { fields: [{ key: 'title', label: 'Judul' }], blank: { title: 'Hubungi kami' } },
}
const ADDABLE = Object.keys(DEFS) as SectionType[]
const validHref = (h: string) => !h || h.startsWith('/') || h.startsWith('#') || /^https:\/\//.test(h)

function FieldInput({ f, value, onChange, onPatch }: { f: FieldDef; value: any; onChange: (v: any) => void; onPatch?: (p: Record<string, any>) => void }) {
  const media = useStore((s) => s.media)
  if (f.kind === 'media') {
    return (
      <Field label={f.label} hint={media.length ? 'Pilih dari pustaka media. Unggah gambar baru lewat tombol Pustaka media.' : 'Pustaka media masih kosong.'}>
        <select className="input" value={value ?? ''} onChange={(e) => onPatch?.({ [f.key]: e.target.value, imageAlt: media.find((m) => m.id === e.target.value)?.alt ?? '' })}>
          <option value="">Tanpa gambar</option>
          {media.map((m) => <option key={m.id} value={m.id}>{m.alt}</option>)}
        </select>
      </Field>
    )
  }
  const bad = f.kind === 'href' && !validHref(value ?? '')
  return (
    <Field label={f.label} hint={bad ? 'Harus diawali https://, atau berupa path internal seperti /daftar.' : undefined}>
      {f.kind === 'area'
        ? <textarea className="input !py-2" rows={3} maxLength={400} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        : <input className={`input ${bad ? '!border-red-500' : ''}`} type={f.kind === 'number' ? 'number' : 'text'} maxLength={160} value={value ?? ''} onChange={(e) => onChange(f.kind === 'number' ? +e.target.value : e.target.value)} />}
    </Field>
  )
}

export function LandingEditor() {
  const published = useStore((s) => s.revisions.find((r) => r.id === s.publishedRevisionId))
  const revisions = useStore((s) => s.revisions)
  const users = useStore((s) => s.users)
  const stored = useStore((s) => s.draftSections)
  const act = useAct()
  const media = useStore((s) => s.media)
  const me = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))
  const [lib, setLib] = useState(false)
  const [upFile, setUpFile] = useState<File | null>(null)
  const [upAlt, setUpAlt] = useState('')
  const [draft, setDraft] = useState<Section[]>(() => structuredClone(stored))
  const [editing, setEditing] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [pub, setPub] = useState(false)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(published?.sections)
  const move = (i: number, d: number) => { const a = [...draft]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setDraft(a) }
  const patch = (id: string, fn: (s: Section) => Section) => setDraft(draft.map((s) => (s.id === id ? fn(s) : s)))
  const sec = draft.find((s) => s.id === editing)
  const def = sec && DEFS[sec.type]
  const hasBadLink = draft.some((s) => (DEFS[s.type]?.fields ?? []).some((f) => f.kind === 'href' && !validHref(s.content[f.key] ?? '')))

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const a = [...draft]; const from = a.findIndex((s) => s.id === dragId); const [m] = a.splice(from, 1)
    a.splice(a.findIndex((s) => s.id === targetId), 0, m); setDraft(a); setDragId(null)
  }

  return (
    <>
      <PageHeader title="Landing page" sub="Susun blok halaman depan tanpa menyentuh kode. Pengunjung hanya melihat versi yang diterbitkan."
        action={<div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setLib(true)}><IconPhoto size={18} />Pustaka media</button>
          <button className="btn-ghost" onClick={() => setPreview(true)}><IconEye size={18} />Pratinjau</button>
          <button className="btn-ghost" disabled={!dirty} onClick={() => act(saveDraft(draft), 'Draf disimpan.')}>Simpan draf</button>
          <button className="btn-primary" disabled={hasBadLink} onClick={() => { setNote(''); setPub(true) }}>Terbitkan</button>
        </div>} />
      {dirty && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">Ada perubahan yang belum diterbitkan.</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section aria-label="Daftar section" className="space-y-2">
          {draft.map((s, i) => (
            <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(s.id)}
              className={`card flex items-center gap-2 p-3 transition ${dragId === s.id ? 'opacity-40' : ''} ${s.visible ? '' : 'bg-canvas'} animate-rise`} style={{ animationDelay: `${i * 30}ms` }}>
              <span className="hidden cursor-grab select-none px-1 text-muted sm:block" aria-hidden>⋮⋮</span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{SECTION_LABEL[s.type]}</p><p className="truncate text-xs text-muted">{s.content.title || s.content.text || (s.visible ? 'Tanpa judul' : 'Disembunyikan')}</p></div>
              <button className="btn-ghost !min-h-10 !px-2.5" aria-label="Naik" disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={16} /></button>
              <button className="btn-ghost !min-h-10 !px-2.5" aria-label="Turun" disabled={i === draft.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={16} /></button>
              <button className="btn-ghost !min-h-10 !px-2.5" aria-label={s.visible ? 'Sembunyikan' : 'Tampilkan'} onClick={() => patch(s.id, (x) => ({ ...x, visible: !x.visible }))}>{s.visible ? <IconEye size={16} /> : <IconEyeOff size={16} />}</button>
              <button className="btn-ghost !min-h-10 !px-2.5" aria-label="Duplikat" onClick={() => { const a = [...draft]; a.splice(i + 1, 0, { ...structuredClone(s), id: newIdLike('sec') }); setDraft(a) }}><IconCopy size={16} /></button>
              <button className="btn-ghost !min-h-10" onClick={() => setEditing(s.id)}>Ubah</button>
              <button className="btn-ghost !min-h-10 !px-2.5 text-red-700" aria-label="Hapus" onClick={() => setDraft(draft.filter((x) => x.id !== s.id))}><IconTrash size={16} /></button>
            </div>
          ))}
          <button className="btn-ghost w-full border-dashed" onClick={() => setAdding(true)}><IconPlus size={18} />Tambah section</button>
        </section>
        <aside className="card h-fit p-4">
          <h2 className="font-bold">Riwayat versi</h2>
          {revisions.length === 0 ? <Empty title="Belum ada" body="Versi tersimpan setiap kali menerbitkan." /> : (
            <ul className="mt-3 space-y-2 text-sm">
              {revisions.slice(0, 8).map((r) => (
                <li key={r.id} className="rounded-lg bg-canvas p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.note}</span>{r.id === published?.id && <Badge status="open" />}</div>
                  <p className="text-xs text-muted">{dateTimeID(r.at)} · {users.find((u) => u.id === r.by)?.name ?? r.by}</p>
                  {r.id !== published?.id && <button className="btn-ghost mt-2 !min-h-9" onClick={() => act(restoreRevision(r.id), 'Versi dikembalikan dan langsung tayang.', () => setDraft(structuredClone(r.sections)))}>Kembalikan</button>}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <Modal open={!!sec} title={sec ? `Ubah: ${SECTION_LABEL[sec.type]}` : ''} onClose={() => setEditing(null)}>
        {sec && (def ? (
          <div className="space-y-3">
            {def.fields.map((f) => <FieldInput key={f.key} f={f} value={sec.content[f.key]} onChange={(v) => patch(sec.id, (x) => ({ ...x, content: { ...x.content, [f.key]: v } }))} onPatch={(pt) => patch(sec.id, (x) => ({ ...x, content: { ...x.content, ...pt } }))} />)}
            {def.list && (
              <div>
                <p className="mb-2 text-sm font-bold">{def.list.label}</p>
                {(sec.content[def.list.key] as any[]).map((it, idx) => (
                  <div key={idx} className="mb-3 space-y-2 rounded-xl bg-canvas p-3">
                    {def.list!.item.map((f) => <FieldInput key={f.key} f={f} value={it[f.key]} onChange={(v) => patch(sec.id, (x) => { const items = [...x.content[def.list!.key]]; items[idx] = { ...items[idx], [f.key]: v }; return { ...x, content: { ...x.content, [def.list!.key]: items } } })} />)}
                    <button className="btn-ghost !min-h-9 text-red-700" onClick={() => patch(sec.id, (x) => ({ ...x, content: { ...x.content, [def.list!.key]: x.content[def.list!.key].filter((_: any, k: number) => k !== idx) } }))}>Hapus item</button>
                  </div>
                ))}
                <button className="btn-ghost" onClick={() => patch(sec.id, (x) => ({ ...x, content: { ...x.content, [def.list!.key]: [...x.content[def.list!.key], Object.fromEntries(def.list!.item.map((f) => [f.key, ''] ))] } }))}><IconPlus size={16} />Tambah item</button>
              </div>
            )}
            <button className="btn-primary w-full" onClick={() => setEditing(null)}>Selesai</button>
          </div>
        ) : <p className="text-sm text-muted">Tipe ini belum punya formulir.</p>)}
      </Modal>

      <Modal open={adding} title="Tambah section" onClose={() => setAdding(false)}>
        <div className="grid gap-2">
          {ADDABLE.map((t) => <button key={t} className="btn-ghost justify-start" onClick={() => { setDraft([...draft, { id: newIdLike('sec'), type: t, visible: true, content: structuredClone(DEFS[t]!.blank) }]); setAdding(false) }}>{SECTION_LABEL[t]}</button>)}
        </div>
      </Modal>

      <Modal open={pub} title="Terbitkan perubahan" onClose={() => setPub(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(publishDraft(draft, note), 'Landing page terbit.', () => setPub(false)) }}>
          <Field label="Catatan versi" hint="Ringkas apa yang berubah, agar mudah dicari saat rollback."><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: Tambah promo akhir tahun" /></Field>
          <button className="btn-primary w-full">Terbitkan sekarang</button>
        </form>
      </Modal>

      <Modal open={lib} title="Pustaka media" onClose={() => setLib(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!upFile) return; act(uploadMedia(upFile, upAlt), 'Gambar diunggah dan dibuat varian WebP.', () => { setUpFile(null); setUpAlt('') }) }}>
          <Field label="Gambar" hint="JPG, PNG, atau WebP, maksimal 2 MB. Dikonversi ke WebP otomatis."><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png,.webp" required onChange={(e) => setUpFile(e.target.files?.[0] ?? null)} /></Field>
          <Field label="Teks alternatif (wajib)" hint="Jelaskan isi gambar untuk pembaca layar."><input className="input" required maxLength={200} value={upAlt} onChange={(e) => setUpAlt(e.target.value)} /></Field>
          <button className="btn-primary w-full">Unggah</button>
        </form>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {media.length === 0 && <p className="col-span-3 text-sm text-muted">Belum ada gambar.</p>}
          {media.map((m) => (
            <figure key={m.id} className="text-xs">
              <img src={`/api/media/${m.id}?w=sm`} alt={m.alt} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
              <figcaption className="mt-1 line-clamp-2 text-muted">{m.alt}</figcaption>
              {me?.role === 'super_admin' && <button className="mt-1 font-semibold text-red-700 underline" onClick={() => act(deleteMedia(m.id), 'Gambar dihapus.')}>Hapus</button>}
            </figure>
          ))}
        </div>
      </Modal>

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-900/70 animate-fade">
          <div className="flex items-center justify-between gap-3 bg-white px-4 py-2">
            <p className="text-sm font-bold">Pratinjau draf</p>
            <div className="flex gap-2">
              <button className={`btn-ghost !min-h-10 ${!mobile ? 'bg-brand-50' : ''}`} onClick={() => setMobile(false)}><IconDeviceDesktop size={18} />Desktop</button>
              <button className={`btn-ghost !min-h-10 ${mobile ? 'bg-brand-50' : ''}`} onClick={() => setMobile(true)}><IconDeviceMobile size={18} />Mobile</button>
              <button className="btn-primary !min-h-10" onClick={() => setPreview(false)}>Tutup</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className={`mx-auto overflow-hidden bg-canvas transition-all duration-300 ${mobile ? 'max-w-[390px] rounded-3xl' : 'max-w-6xl rounded-xl'}`}>
              {draft.filter((s) => s.visible).map((s) => <SectionView key={s.id} section={s} />)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
