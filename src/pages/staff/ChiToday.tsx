import { IconEye, IconPhoto, IconPlus, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, Field, Modal, PageHeader, Table, dateID, useAct, useToast } from '../../components/ui'
import { chiTodayImage, deleteChiToday, saveChiToday, setChiTodayFeatured, uploadMedia, useStore } from '../../lib/store'
import type { ChiTodayItem } from '../../lib/types'

/*
 * CHI Today (Super Admin): menulis kabar kegiatan untuk halaman publik /chi-today dan memilih
 * kegiatan yang tampil di bagian Kegiatan pada landing page (tanda bintang "Tampil di beranda").
 */

type Form = Partial<ChiTodayItem> & { title: string }
const blank = (): Form => ({ title: '', summary: '', body: '', tag: '', eventDate: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), imageId: '', imageSrc: '', published: true, featured: false, sort: 0 })

export function ChiTodayAdmin() {
  const s = useStore((x) => x)
  const act = useAct()
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(null)
  const [hapus, setHapus] = useState<ChiTodayItem | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const limit = Number(s.publishedSections.find((x) => x.type === 'gallery')?.content.limit) || 6
  const rows = [...s.chiToday].sort((a, b) => (b.eventDate || b.createdAt).localeCompare(a.eventDate || a.createdAt))
  const featured = rows.filter((x) => x.published && x.featured).sort((a, b) => a.sort - b.sort || (b.eventDate || b.createdAt).localeCompare(a.eventDate || a.createdAt))
  const onHome = new Set(featured.slice(0, limit).map((x) => x.id))
  const tags = [...new Set(rows.map((x) => x.tag).filter(Boolean))]

  const submit = async () => {
    if (!form) return
    setBusy(true)
    let imageId = form.imageId
    if (file) {
      const up = await uploadMedia(file, form.title || 'Foto kegiatan CHI Today')
      if (!up.ok) { setBusy(false); return toast(up.error, 'err') }
      imageId = (up.data as { id: string }).id
    }
    await act(saveChiToday({ ...form, imageId, imageSrc: imageId ? '' : form.imageSrc }), form.id ? 'Kegiatan diperbarui.' : 'Kegiatan ditambahkan.', () => { setForm(null); setFile(null) })
    setBusy(false)
  }
  const preview = form && (file ? URL.createObjectURL(file) : chiTodayImage({ imageId: form.imageId ?? '', imageSrc: form.imageSrc ?? '' }, true))

  return (
    <>
      <PageHeader title="CHI Today" sub="Kabar kegiatan untuk halaman publik CHI Today. Tandai bintang untuk menampilkan kegiatan di bagian Kegiatan pada landing page."
        action={<div className="flex gap-2"><Link to="/chi-today" target="_blank" className="btn-ghost"><IconEye size={18} />Lihat halaman</Link><button className="btn-primary" onClick={() => { setForm(blank()); setFile(null) }}><IconPlus size={18} />Tambah kegiatan</button></div>} />
      <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        Landing page menampilkan <b>{Math.min(featured.length, limit)}</b> dari maksimal {limit} kegiatan bertanda bintang, urut menurut angka urutan lalu tanggal terbaru.
        {featured.length > limit && <> {featured.length - limit} kegiatan bertanda bintang lainnya tidak muat; ubah jumlahnya di Landing page, bagian Kegiatan.</>}
        {featured.length === 0 && <> Belum ada yang bertanda bintang, jadi landing page memakai foto cadangan.</>}
      </p>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada kegiatan" body="Tambahkan kabar kegiatan pertama. Kegiatan yang diterbitkan tampil di halaman CHI Today." action={<button className="btn-primary" onClick={() => setForm(blank())}>Tambah kegiatan</button>} /></div> : (
        <Table head={['', 'Kegiatan', 'Tanggal', 'Status', 'Beranda', 'Urutan', '']}>
          {rows.map((x) => (
            <tr key={x.id}>
              <td className="w-20">{chiTodayImage(x) ? <img src={chiTodayImage(x, true)} alt="" className="h-12 w-16 rounded-lg bg-zinc-100 object-contain" /> : <span className="grid h-12 w-16 place-items-center rounded-lg bg-canvas text-muted"><IconPhoto size={18} /></span>}</td>
              <td><p className="font-semibold">{x.title}</p>{x.tag && <p className="text-xs text-muted">{x.tag}</p>}</td>
              <td className="whitespace-nowrap">{dateID(x.eventDate || x.createdAt)}</td>
              <td>{x.published ? <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Terbit</span> : <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">Draf</span>}</td>
              <td>
                <button type="button" className={`btn-ghost !min-h-9 ${x.featured ? 'text-amber-600' : 'text-muted'}`} aria-pressed={x.featured} disabled={!x.published && !x.featured}
                  title={!x.published ? 'Terbitkan dulu untuk menampilkan di beranda' : undefined}
                  onClick={() => act(setChiTodayFeatured(x.id, !x.featured), x.featured ? 'Kegiatan dilepas dari beranda.' : 'Kegiatan ditampilkan di beranda.')}>
                  {x.featured ? <IconStarFilled size={18} /> : <IconStar size={18} />}{x.featured ? (onHome.has(x.id) ? 'Tampil' : 'Tidak muat') : 'Tampilkan'}
                </button>
              </td>
              <td className="tabular-nums">{x.sort}</td>
              <td className="whitespace-nowrap text-right">
                {x.published && <Link to={`/chi-today/${x.slug}`} target="_blank" className="btn-ghost !min-h-9">Lihat</Link>}{' '}
                <button className="btn-ghost !min-h-9" onClick={() => { setForm({ ...x }); setFile(null) }}>Ubah</button>{' '}
                <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${x.title}`} onClick={() => setHapus(x)}><IconTrash size={16} /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!form} title={form?.id ? 'Ubah kegiatan' : 'Tambah kegiatan'} onClose={() => setForm(null)}>
        {form && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Field label="Judul"><input className="input" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal kegiatan"><input className="input" type="date" value={form.eventDate ?? ''} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} /></Field>
            <Field label="Label" hint="Mis. Room Division, Magang"><input className="input" list="chi-tags" maxLength={60} value={form.tag ?? ''} onChange={(e) => setForm({ ...form, tag: e.target.value })} /><datalist id="chi-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist></Field>
          </div>
          <Field label="Ringkasan" hint="Tampil di kartu dan di bawah judul."><textarea className="input !py-2" rows={2} maxLength={300} value={form.summary ?? ''} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
          <Field label="Isi" hint="Pisahkan paragraf dengan baris kosong."><textarea className="input !py-2" rows={6} maxLength={8000} value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <Field label="Foto" hint="JPG, PNG, atau WebP, maks 2 MB. Atau pilih dari pustaka media.">
            <div className="flex flex-wrap items-start gap-3">
              {preview ? <img src={preview} alt="" className="h-20 w-28 rounded-lg bg-zinc-100 object-contain" /> : <span className="grid h-20 w-28 place-items-center rounded-lg bg-canvas text-muted"><IconPhoto size={22} /></span>}
              <div className="min-w-0 flex-1 space-y-2">
                <input className="input !py-2" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <select className="input" value={file ? '' : form.imageId ?? ''} disabled={!!file} onChange={(e) => setForm({ ...form, imageId: e.target.value })} aria-label="Pilih dari pustaka media">
                  <option value="">{form.imageSrc && !form.imageId ? 'Foto bawaan' : 'Pustaka media: tidak dipilih'}</option>
                  {s.media.map((m) => <option key={m.id} value={m.id}>{m.alt}</option>)}
                </select>
              </div>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Urutan di beranda" hint="Angka kecil tampil lebih dulu."><input className="input" type="number" min={-999} max={999} value={form.sort ?? 0} onChange={(e) => setForm({ ...form, sort: +e.target.value })} /></Field>
            <div className="space-y-1 pt-6">
              <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={form.published !== false} onChange={(e) => setForm({ ...form, published: e.target.checked, featured: e.target.checked ? form.featured : false })} />Terbitkan di CHI Today</label>
              <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" disabled={form.published === false} checked={!!form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />Tampil di beranda</label>
            </div>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </form>}
      </Modal>

      <Modal open={!!hapus} title="Hapus kegiatan?" onClose={() => setHapus(null)}>
        {hapus && <div className="space-y-4">
          <p className="text-sm"><b>{hapus.title}</b> akan dihapus dari CHI Today{hapus.featured ? ' dan dari landing page' : ''}. Foto di pustaka media tidak ikut terhapus.</p>
          <div className="flex gap-2"><button className="btn-danger" onClick={() => act(deleteChiToday(hapus.id), 'Kegiatan dihapus.', () => setHapus(null))}>Ya, hapus</button><button className="btn-ghost" onClick={() => setHapus(null)}>Batal</button></div>
        </div>}
      </Modal>
    </>
  )
}
