import { IconFileWord, IconPencil, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { ask, Empty, Field, PageHeader, Table, dateID, useAct } from '../../components/ui'
import { deleteLogbook, saveLogbook, useStore } from '../../lib/store'
import type { LogbookEntry, Placement } from '../../lib/types'
import { Chip, KIND_LABEL } from '../staff/Penempatan'

/** Tanggal hari ini menurut waktu setempat, format YYYY-MM-DD. */
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }

/** Geser tanggal (YYYY-MM-DD) sebanyak n hari. */
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const LOG_STATUS: Record<string, { label: string; cls: string }> = {
  disetujui: { label: 'Tervalidasi', cls: 'bg-emerald-50 text-emerald-800' },
  diajukan: { label: 'Belum tervalidasi', cls: 'bg-amber-50 text-amber-800' },
  revisi: { label: 'Belum tervalidasi (perlu revisi)', cls: 'bg-red-50 text-red-800' },
}

function Logbook({ p }: { p: Placement }) {
  const entries = useStore((x) => x.logbook).filter((e) => e.placementId === p.id).sort((a, b) => a.date.localeCompare(b.date))
  const act = useAct()
  const running = p.status === 'berjalan'
  const max = p.endDate || '9999-12-31' // batas atas hanya akhir masa magang; logbook boleh terus ditambah di tanggal berikutnya
  // Satu tanggal hanya satu logbook, dan tanggal baru harus setelah logbook terakhir: otomatis sehari sesudahnya, atau dipilih manual yang lebih akhir.
  const lastDate = entries.at(-1)?.date ?? null
  const minNew = lastDate ? addDays(lastDate, 1) : p.startDate
  const blankFor = (last: string | null) => ({ id: '', date: last ? addDays(last, 1) : (p.startDate > today() ? p.startDate : today()), hours: '8', activity: '', learning: '' })
  const [f, setF] = useState(() => blankFor(lastDate))
  const editing = !!f.id
  const full = !editing && minNew > max // masa magang sudah terisi sampai tanggal terakhir
  const total = entries.reduce((n, e) => n + e.hours, 0)
  const approved = entries.filter((e) => e.status === 'disetujui').length
  const edit = (e: LogbookEntry) => { setF({ id: e.id, date: e.date, hours: String(e.hours), activity: e.activity, learning: e.learning }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <section className="mt-6" aria-labelledby={`lb-${p.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`lb-${p.id}`} className="font-bold">Logbook harian</h3>
        <a className="btn-ghost" href={`/api/logbook/${p.id}.docx`} download><IconFileWord size={18} />Ekspor ke Word</a></div>
      <p className="mt-1 text-sm text-muted">{entries.length} catatan · {total} jam · {approved} tervalidasi. Satu tanggal satu logbook, dan tanggal baru harus setelah logbook terakhir. Catatan yang sudah tervalidasi tidak bisa diubah. Ekspor Word memuat satu halaman per minggu (7 hari) sesuai template logbook magang.</p>
      {running && (
        <form className="card mt-3 grid gap-3 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(saveLogbook({ id: f.id || undefined, placementId: p.id, date: f.date, hours: Number(f.hours), activity: f.activity, learning: f.learning }), editing ? 'Logbook diperbarui.' : 'Logbook tersimpan.', () => setF(blankFor(editing ? lastDate : f.date))) }}>
          <Field label="Tanggal" hint={editing ? 'Tanggal catatan tidak bisa diubah.' : full ? undefined : `Otomatis sehari setelah logbook terakhir. Boleh dipilih sendiri mulai ${dateID(minNew)}.`}>
            <input className="input" type="date" required readOnly={editing} min={editing ? undefined : minNew} max={editing || !p.endDate ? undefined : max} value={f.date} onChange={set('date')} />
          </Field>
          <Field label="Jam kerja"><input className="input tabular-nums" type="number" required min={0.5} max={16} step={0.5} value={f.hours} onChange={set('hours')} /></Field>
          <div className="sm:col-span-2"><Field label="Kegiatan hari ini" hint="Uraikan pekerjaan yang dilakukan, minimal 10 karakter."><textarea className="input !py-2" rows={4} required minLength={10} maxLength={2000} value={f.activity} onChange={set('activity')} /></Field></div>
          <div className="sm:col-span-2"><Field label="Yang dipelajari (opsional)"><input className="input" maxLength={500} value={f.learning} onChange={set('learning')} /></Field></div>
          {full && <p className="text-sm text-amber-800 sm:col-span-2">Logbook sudah terisi sampai akhir masa magang ({lastDate ? dateID(lastDate) : '-'}).</p>}
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={full}>{editing ? 'Perbarui logbook' : 'Simpan logbook'}</button>{editing && <button type="button" className="btn-ghost" onClick={() => setF(blankFor(lastDate))}>Batal</button>}</div>
        </form>
      )}
      {!running && <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-muted">Penempatan ini {p.status === 'selesai' ? 'sudah selesai' : 'dibatalkan'}, jadi logbook tidak bisa ditambah.</p>}
      {entries.length === 0 ? <div className="card mt-3"><Empty title="Belum ada catatan" body="Isi logbook setiap hari magang." /></div> : (
        <div className="card mt-3 overflow-hidden">
          <div className="p-4 pb-2"><h4 className="font-bold">Rekap logbook</h4><p className="text-sm text-muted">{approved} dari {entries.length} catatan tervalidasi pembimbing.</p></div>
          <Table bare head={['No', 'Tanggal', 'Jam', 'Kegiatan', 'Status validasi', 'Catatan pembimbing', '']}>
            {entries.map((e, i) => {
              const st = LOG_STATUS[e.status] ?? LOG_STATUS.diajukan
              return (
                <tr key={e.id}>
                  <td className="tabular-nums">{i + 1}</td>
                  <td className="whitespace-nowrap font-semibold">{dateID(e.date)}</td>
                  <td className="tabular-nums">{e.hours}</td>
                  <td className="min-w-[14rem]"><p className="whitespace-pre-wrap">{e.activity}</p>{e.learning && <p className="mt-1 text-xs text-muted">Dipelajari: {e.learning}</p>}</td>
                  <td><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                  <td className="text-muted">{e.reviewerNote || '-'}</td>
                  <td className="whitespace-nowrap text-right">
                    {e.status !== 'disetujui' && running && (<>
                      <button className="btn-ghost !min-h-9" onClick={() => edit(e)}><IconPencil size={16} />Ubah</button>{' '}
                      <button className="btn-ghost !min-h-9 text-red-700" onClick={async () => await ask('Hapus catatan logbook ini?') && act(deleteLogbook(e.id), 'Catatan dihapus.')}><IconTrash size={16} />Hapus</button>
                    </>)}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-canvas font-bold"><td colSpan={2}>Total</td><td className="tabular-nums">{total}</td><td colSpan={4}>{approved} tervalidasi · {entries.length - approved} belum tervalidasi</td></tr>
          </Table>
        </div>
      )}
    </section>
  )
}

/** Magang dan kerja: penempatan peserta didik dan logbook harian untuk magang. */
export function Magang() {
  const s = useStore((x) => x)
  const list = [...s.placements].sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <>
      <PageHeader title="Magang dan kerja" sub="Penempatan Anda di perusahaan mitra. Untuk magang, isi logbook setiap hari." />
      {list.length === 0 ? <div className="card"><Empty title="Belum ada penempatan" body="Admin akan menempatkan Anda di perusahaan mitra. Anda akan mendapat notifikasi saat penempatan ditetapkan." /></div> : (
        <div className="space-y-8">
          {list.map((p) => {
            const co = s.companies.find((c) => c.id === p.companyId)
            return (
              <div key={p.id}>
                <section className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">{KIND_LABEL[p.kind]}</p><h2 className="text-lg font-bold">{co?.name}</h2></div>
                    <Chip status={p.status} />
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted">Posisi</dt><dd>{p.position || '-'}</dd></div>
                    <div><dt className="text-xs text-muted">Periode</dt><dd>{dateID(p.startDate)}{p.endDate ? ` s.d. ${dateID(p.endDate)}` : ''}</dd></div>
                    <div><dt className="text-xs text-muted">Alamat</dt><dd>{[co?.address, co?.city].filter(Boolean).join(', ') || '-'}</dd></div>
                    <div><dt className="text-xs text-muted">Kontak</dt><dd>{co?.contactName || '-'}{co?.contactPhone ? ` · ${co.contactPhone}` : ''}</dd></div>
                  </dl>
                  {p.notes && <p className="mt-3 rounded-lg bg-canvas p-3 text-sm">{p.notes}</p>}
                </section>
                {p.kind === 'magang' && <Logbook p={p} />}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
