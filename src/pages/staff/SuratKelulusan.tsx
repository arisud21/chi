import { IconExternalLink, IconTrash, IconUpload } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { ask, Field, PageHeader, useAct } from '../../components/ui'
import { removeSignature, saveLetterSettings, uploadSignature, useStore } from '../../lib/store'

const CAMPUS_DEFAULT = 'Area Kampus Politeknik TEDC Bandung'

/** Pengaturan surat kelulusan: nama dan tanda tangan ketua LPK, serta isian yang tercetak di surat. */
export function SuratKelulusan() {
  const st = useStore((x) => x.settings)
  const act = useAct()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    ketuaName: st.ketuaName ?? '', lpkRegNo: st.lpkRegNo ?? '', batchLabel: st.batchLabel ?? '', hotline: st.hotline ?? '', email: st.email ?? '', website: st.website ?? '',
    kuliahUmum: st.kuliahUmum ?? '', trainingStart: st.trainingStart ?? '', campusNote: st.campusNote ?? CAMPUS_DEFAULT,
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) return act(Promise.resolve({ ok: false, error: 'Tanda tangan harus PNG atau JPG.' }), '')
    if (file.size > 2 * 1024 * 1024) return act(Promise.resolve({ ok: false, error: 'Ukuran berkas maksimal 2 MB.' }), '')
    setBusy(true)
    await act(uploadSignature(file), 'Tanda tangan ketua LPK diperbarui.')
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <PageHeader title="Surat kelulusan" sub="Isian yang tercetak di surat pengumuman penerimaan. Data peserta, nomor surat, dan angkatan diambil otomatis." action={<a className="btn-ghost" href="/api/surat/preview/pdf" target="_blank" rel="noreferrer"><IconExternalLink size={18} />Pratinjau surat</a>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form className="card grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(saveLetterSettings(f), 'Pengaturan surat disimpan.') }}>
          <Field label="Nama ketua LPK (penanda tangan)" hint="Tercetak di bawah tanda tangan."><input className="input" required maxLength={80} value={f.ketuaName} onChange={set('ketuaName')} /></Field>
          <Field label="Nomor registrasi LPK"><input className="input" maxLength={60} value={f.lpkRegNo} onChange={set('lpkRegNo')} /></Field>
          <Field label="Nama batch" hint="Contoh: Batch Ganjil TA. 2026/2027"><input className="input" required maxLength={80} value={f.batchLabel} onChange={set('batchLabel')} /></Field>
          <Field label="Hotline pembayaran"><input className="input" type="tel" maxLength={20} value={f.hotline} onChange={set('hotline')} /></Field>
          <Field label="Email lembaga"><input className="input" type="email" maxLength={120} value={f.email} onChange={set('email')} /></Field>
          <Field label="Situs web"><input className="input" maxLength={120} value={f.website} onChange={set('website')} /></Field>
          <Field label="Tanggal kuliah umum"><input className="input" type="date" value={f.kuliahUmum} onChange={set('kuliahUmum')} /></Field>
          <Field label="Tanggal mulai pelatihan"><input className="input" type="date" value={f.trainingStart} onChange={set('trainingStart')} /></Field>
          <div className="sm:col-span-2"><Field label="Keterangan lokasi kampus" hint="Dicetak dalam tanda kurung setelah alamat. Kosongkan bila tidak perlu."><input className="input" maxLength={120} value={f.campusNote} onChange={set('campusNote')} /></Field></div>
          <p className="text-sm text-muted sm:col-span-2">Alamat dan telepon di kop surat diatur di menu Pengaturan. Batas registrasi ulang, pengembalian dana, pelunasan, serta rekening pembayaran diatur di menu Biaya.</p>
          <div className="sm:col-span-2"><button className="btn-primary">Simpan pengaturan</button></div>
        </form>

        <aside className="card h-fit p-5" aria-labelledby="ttd">
          <h2 id="ttd" className="font-bold">Tanda tangan ketua LPK</h2>
          <p className="mt-1 text-sm text-muted">PNG berlatar transparan paling rapi. JPG juga bisa. Maksimal 2 MB.</p>
          <div className="mt-3 grid h-32 place-items-center rounded-lg border border-dashed border-line bg-white p-2">
            {st.signatureFileId
              ? <img src={`/api/files/${st.signatureFileId}`} alt={`Tanda tangan ${st.ketuaName ?? 'ketua LPK'}`} className="max-h-full max-w-full object-contain" />
              : <p className="text-sm text-muted">Belum ada tanda tangan. Surat dicetak dengan ruang kosong.</p>}
          </div>
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-label="Pilih berkas tanda tangan" accept=".png,.jpg,.jpeg" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}><IconUpload size={18} />{busy ? 'Mengunggah…' : st.signatureFileId ? 'Ganti' : 'Unggah'}</button>
            {st.signatureFileId && <button type="button" className="btn-ghost" onClick={async () => await ask('Hapus tanda tangan dari surat kelulusan?') && act(removeSignature(), 'Tanda tangan dihapus.')}><IconTrash size={18} />Hapus</button>}
          </div>
        </aside>
      </div>
    </>
  )
}
