import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Empty, Field, Modal, PageHeader, Table, dateID, useAct } from '../../components/ui'
import { deleteNews, saveNews, useStore } from '../../lib/store'
import { ROLE_LABEL, type NewsItem } from '../../lib/types'

const TARGETS: [string, string][] = [['semua', 'Semua role'], ['peserta', 'Pendaftar dan peserta didik'], ['super_admin', ROLE_LABEL.super_admin], ['admin_pendaftaran', ROLE_LABEL.admin_pendaftaran], ['admin_keuangan', ROLE_LABEL.admin_keuangan], ['akademik', ROLE_LABEL.akademik], ['instruktur', ROLE_LABEL.instruktur]]
const targetLabel = (a: string[]) => (a.includes('semua') ? 'Semua role' : a.map((x) => (x === 'peserta' ? 'Pendaftar/peserta didik' : ROLE_LABEL[x as keyof typeof ROLE_LABEL] ?? x)).join(', '))

type Form = { id: string; title: string; body: string; audience: string[]; startsOn: string; endsOn: string; active: boolean; resend: boolean }
const blank: Form = { id: '', title: '', body: '', audience: ['semua'], startsOn: '', endsOn: '', active: true, resend: false }
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }

function statusOf(n: NewsItem) {
  if (!n.active) return { label: 'Nonaktif', cls: 'bg-canvas text-muted ring-line' }
  if (n.startsOn && n.startsOn > today()) return { label: 'Terjadwal', cls: 'bg-sky-50 text-sky-800 ring-sky-200' }
  if (n.endsOn && n.endsOn < today()) return { label: 'Berakhir', cls: 'bg-canvas text-muted ring-line' }
  return { label: 'Tayang', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }
}

/** Kelola berita popup. Berita tampil di beranda tiap role sesuai sasaran, satu kali per pengguna sampai ditutup. */
export function Berita() {
  const list = useStore((x) => x.news)
  const act = useAct()
  const [f, setF] = useState<Form | null>(null)
  const [del, setDel] = useState<NewsItem | null>(null)
  const toggle = (k: string) => {
    if (!f) return
    if (k === 'semua') return setF({ ...f, audience: f.audience.includes('semua') ? [] : ['semua'] })
    const rest = f.audience.filter((a) => a !== 'semua')
    setF({ ...f, audience: rest.includes(k) ? rest.filter((a) => a !== k) : [...rest, k] })
  }
  return (
    <>
      <PageHeader title="Berita" sub="Tulis pengumuman yang muncul sebagai popup di beranda tiap role saat mereka masuk. Setiap pengguna melihatnya sampai menutupnya." action={<button className="btn-primary" onClick={() => setF({ ...blank })}><IconPlus size={18} />Berita baru</button>} />
      {list.length === 0 ? <div className="card"><Empty title="Belum ada berita" body="Buat berita pertama. Pilih sasarannya, dan berita tampil di beranda saat pengguna itu masuk." /></div> : (
        <Table head={['Judul', 'Sasaran', 'Tayang', 'Status', 'Sudah dibaca', '']}>
          {list.map((n) => {
            const st = statusOf(n)
            return (
              <tr key={n.id}>
                <td className="max-w-xs font-semibold">{n.title}<span className="mt-0.5 line-clamp-1 block text-xs font-normal text-muted">{n.body}</span></td>
                <td className="text-sm">{targetLabel(n.audience)}</td>
                <td className="whitespace-nowrap text-sm">{n.startsOn ? dateID(n.startsOn) : 'Langsung'}{n.endsOn ? ` s.d. ${dateID(n.endsOn)}` : ''}</td>
                <td><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${st.cls}`}>{st.label}</span></td>
                <td className="tabular-nums">{n.readCount} pengguna</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-ghost !min-h-9" aria-label={`Ubah ${n.title}`} onClick={() => setF({ id: n.id, title: n.title, body: n.body, audience: n.audience, startsOn: n.startsOn, endsOn: n.endsOn, active: n.active, resend: false })}><IconPencil size={16} /></button>{' '}
                  <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${n.title}`} onClick={() => setDel(n)}><IconTrash size={16} /></button>
                </td>
              </tr>
            )
          })}
        </Table>
      )}

      <Modal open={!!f} title={f?.id ? 'Ubah berita' : 'Berita baru'} onClose={() => setF(null)}>
        {f && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveNews({ ...f, id: f.id || undefined }), 'Berita disimpan.', () => setF(null)) }}>
            <Field label="Judul"><input className="input" required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Isi berita" hint="Teks biasa. Baris baru ikut tampil."><textarea className="input !py-2" rows={6} required maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Sasaran</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {TARGETS.map(([k, label]) => (
                  <label key={k} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={f.audience.includes(k)} onChange={() => toggle(k)} />{label}</label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mulai tayang" hint="Kosong berarti langsung."><input className="input" type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></Field>
              <Field label="Akhir tayang" hint="Kosong berarti tanpa batas."><input className="input" type="date" min={f.startsOn} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></Field>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Tayang (hilangkan centang untuk menyembunyikan tanpa menghapus)</label>
            {f.id && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={f.resend} onChange={(e) => setF({ ...f, resend: e.target.checked })} />Tampilkan lagi kepada yang sudah menutupnya</label>}
            <button className="btn-primary w-full" disabled={f.audience.length === 0}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={!!del} title="Hapus berita?" onClose={() => setDel(null)}>
        {del && (
          <div className="space-y-4">
            <p className="text-sm"><b>{del.title}</b> akan dihapus permanen. Untuk menyembunyikan sementara, ubah dan hilangkan centang Tayang.</p>
            <div className="flex gap-2"><button className="btn-danger flex-1" onClick={() => act(deleteNews(del.id), 'Berita dihapus.', () => setDel(null))}>Hapus</button><button className="btn-ghost" onClick={() => setDel(null)}>Batal</button></div>
          </div>
        )}
      </Modal>
    </>
  )
}
