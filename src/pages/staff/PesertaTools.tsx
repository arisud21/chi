import { IconDownload, IconFileSpreadsheet, IconPlus, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { Field, Modal, Table, useToast } from '../../components/ui'
import { createPeserta, importPeserta, seatsTaken, useStore, type State } from '../../lib/store'
import type { Registration } from '../../lib/types'
import { INTERNSHIP_LABEL, infoSourceText } from '../peserta/DataDiri'
import { buildXlsx, downloadBlob, type Cell } from '../../lib/xlsx'
import { readTable } from '../../lib/xlsxRead'

/** Password acak yang mudah dibacakan: tanpa huruf atau angka yang mirip (0/O, 1/l). */
export const randomPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('')

const stamp = () => new Date().toISOString().slice(0, 10)
const L = (v?: string) => (v === 'L' ? 'Laki-laki' : v === 'P' ? 'Perempuan' : '')

/* ---------------- Tambah satu ---------------- */
interface PesertaForm { name: string; email: string; phone: string; nip: string; nik: string; password: string; programId: string; batchId: string }

export function PesertaBaruModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((x) => x)
  const toast = useToast()
  const programs = s.programs.filter((p) => !p.archived)
  const blank = (): PesertaForm => ({ name: '', email: '', phone: '', nip: '', nik: '', password: randomPassword(), programId: programs[0]?.id ?? '', batchId: '' })
  const [pf, setPf] = useState<PesertaForm>(blank)
  const [done, setDone] = useState<{ name: string; email: string; password: string; nip?: string } | null>(null)
  const batches = s.batches.filter((b) => b.programId === pf.programId && b.status !== 'finished' && b.status !== 'cancelled')
  const close = () => { setPf(blank()); setDone(null); onClose() }
  const submit = async () => {
    const r = await createPeserta(pf)
    if (!r.ok) return toast(r.error, 'err')
    toast('Peserta didik dan akunnya dibuat.')
    setDone({ name: pf.name, email: pf.email, password: pf.password, nip: r.data?.nip ?? undefined })
  }
  return (
    <Modal open={open} title="Tambah peserta didik" onClose={close}>
      {done ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Akun peserta didik <b>{done.name}</b> sudah dibuat. Sampaikan data masuk berikut; password wajib diganti saat masuk pertama.</p>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Email</dt><dd className="font-semibold">{done.email}</dd>
            <dt className="text-muted">Password awal</dt><dd className="font-mono font-semibold">{done.password}</dd>
            {done.nip && <><dt className="text-muted">NIP</dt><dd className="font-mono font-semibold">{done.nip}</dd></>}
          </dl>
          <div className="flex gap-2"><button className="btn-primary" onClick={() => { setPf(blank()); setDone(null) }}>Tambah lagi</button><button className="btn-ghost" onClick={close}>Selesai</button></div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm">Peserta langsung menjadi peserta didik aktif tanpa ujian dan registrasi ulang, dan akun penggunanya dibuat sekaligus. Saat masuk pertama, peserta mengganti password lalu melengkapi sendiri data diri lainnya (tempat dan tanggal lahir, alamat, pendidikan) dan berkas.</p>
          <Field label="Nama lengkap (sesuai KTP)"><input className="input" required value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email (untuk masuk)"><input className="input" type="email" required value={pf.email} onChange={(e) => setPf({ ...pf, email: e.target.value })} /></Field>
            <Field label="Nomor HP (opsional)"><input className="input" value={pf.phone} onChange={(e) => setPf({ ...pf, phone: e.target.value })} /></Field>
            <Field label="NIP (opsional)" hint="Kosongkan agar terbit otomatis saat angkatan ditetapkan."><input className="input font-mono" maxLength={12} value={pf.nip} onChange={(e) => setPf({ ...pf, nip: e.target.value })} /></Field>
            <Field label="NIK (opsional)"><input className="input" inputMode="numeric" pattern="\d{16}" title="16 digit angka" value={pf.nik} onChange={(e) => setPf({ ...pf, nik: e.target.value })} /></Field>
            <Field label="Program pelatihan"><select className="input" required value={pf.programId} onChange={(e) => setPf({ ...pf, programId: e.target.value, batchId: '' })}>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
            <Field label="Angkatan"><select className="input" value={pf.batchId} onChange={(e) => setPf({ ...pf, batchId: e.target.value })}><option value="">Tetapkan nanti</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.code} ({seatsTaken(s, b.id)}/{b.quota})</option>)}</select></Field>
          </div>
          <Field label="Password awal" hint="Minimal 8 karakter. Peserta wajib menggantinya saat masuk pertama.">
            <div className="flex gap-2"><input className="input font-mono" type="text" required minLength={8} maxLength={100} value={pf.password} onChange={(e) => setPf({ ...pf, password: e.target.value })} autoComplete="off" /><button type="button" className="btn-ghost shrink-0" onClick={() => setPf({ ...pf, password: randomPassword() })}>Acak</button></div>
          </Field>
          <button className="btn-primary w-full">Buat peserta didik dan akun</button>
        </form>
      )}
    </Modal>
  )
}

/* ---------------- Impor dari Excel ---------------- */
const COLS = [
  { key: 'name', header: 'Nama lengkap', test: /nama/, width: 30 },
  { key: 'email', header: 'Email', test: /e-?mail|surel/, width: 28 },
  { key: 'phone', header: 'No HP', test: /hp|telepon|telp|whatsapp|\bwa\b|ponsel/, width: 16, text: true },
  { key: 'nip', header: 'NIP', test: /\bnip\b|nomor induk/, width: 14, text: true },
  { key: 'nik', header: 'NIK', test: /\bnik\b/, width: 20, text: true },
  { key: 'program', header: 'Program', test: /program|pelatihan/, width: 26 },
  { key: 'batch', header: 'Kode angkatan', test: /angkatan/, width: 16, text: true },
  { key: 'password', header: 'Password awal (kosongkan = acak)', test: /password|sandi/, width: 30, text: true },
] as const
type Key = typeof COLS[number]['key']
interface Row { row: number; name: string; email: string; phone: string; nip: string; nik: string; password: string; programId: string; batchId: string; programLabel: string; batchLabel: string; problems: string[] }

/** Contoh berkas impor beserta sheet referensi program dan kode angkatan yang berlaku. */
function downloadTemplate(s: State) {
  const programs = s.programs.filter((p) => !p.archived)
  const p = programs[0]
  const b = s.batches.find((x) => x.programId === p?.id && x.status !== 'finished' && x.status !== 'cancelled')
  const ref: Cell[][] = programs.flatMap((pr) => {
    const bs = s.batches.filter((x) => x.programId === pr.id && x.status !== 'finished' && x.status !== 'cancelled')
    return bs.length ? bs.map((x) => [pr.title, x.code, `${seatsTaken(s, x.id)}/${x.quota}`]) : [[pr.title, '', '']]
  })
  downloadBlob(buildXlsx([
    { name: 'Peserta didik', cols: COLS.map((c) => ({ header: c.header, width: c.width, text: 'text' in c && c.text })), rows: [['Contoh Nama Peserta', 'contoh@email.com', '081234567890', '', '3277010101010001', p?.title ?? '', b?.code ?? '', '']] },
    { name: 'Daftar program', cols: [{ header: 'Program', width: 32 }, { header: 'Kode angkatan', width: 18 }, { header: 'Terisi / kuota', width: 14 }], rows: ref },
  ]), 'template-impor-peserta-didik.xlsx')
}

function mapRows(s: State, table: string[][]): Row[] {
  const head = (table[0] ?? []).map((h) => (h ?? '').toLowerCase())
  const idx = Object.fromEntries(COLS.map((c) => [c.key, head.findIndex((h) => c.test.test(h))])) as Record<Key, number>
  if (idx.name < 0 || idx.email < 0 || idx.program < 0) throw new Error('Kolom wajib tidak ditemukan. Baris pertama harus berisi judul kolom: Nama lengkap, Email, dan Program. Gunakan template.')
  const known = new Set(s.users.map((u) => u.email.toLowerCase()))
  const seen = new Map<string, number>()
  const knownNip = new Set(s.registrations.map((r) => r.nip).filter(Boolean))
  const seenNip = new Map<string, number>()
  const programs = s.programs.filter((p) => !p.archived)
  return table.slice(1).map((cells, i) => {
    const get = (k: Key) => (idx[k] >= 0 ? (cells[idx[k]] ?? '').trim() : '')
    const problems: string[] = []
    const email = get('email').toLowerCase()
    const progText = get('program').toLowerCase()
    const prog = programs.find((p) => p.title.toLowerCase() === progText || p.slug === progText || String(p.nipCode ?? '') === progText)
    const batchText = get('batch').toLowerCase()
    const batch = batchText ? s.batches.find((b) => b.code.toLowerCase() === batchText) : undefined
    if (!get('name')) problems.push('Nama kosong')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('Email tidak valid')
    else if (known.has(email)) problems.push('Email sudah terdaftar')
    else if (seen.has(email)) problems.push(`Email sama dengan baris ${seen.get(email)}`)
    if (!prog) problems.push(get('program') ? `Program "${get('program')}" tidak dikenal` : 'Program kosong')
    if (batchText && !batch) problems.push(`Angkatan "${get('batch')}" tidak dikenal`)
    else if (batch && prog && batch.programId !== prog.id) problems.push(`Angkatan ${batch.code} bukan dari program ${prog.title}`)
    const nik = get('nik').replace(/\s/g, '')
    if (/e\+?\d+$/i.test(nik) || /^\d+\.\d+$/.test(nik)) problems.push('NIK terbaca sebagai angka dan bisa terpotong. Format kolom NIK sebagai Teks lalu ketik ulang')
    else if (nik && !/^\d{16}$/.test(nik)) problems.push('NIK harus 16 digit')
    // Excel membuang angka 0 di depan nomor HP yang diketik sebagai angka.
    const phone = /^8\d{7,12}$/.test(get('phone')) ? '0' + get('phone') : get('phone')
    const nip = get('nip')
    if (nip && !/^[0-9A-Za-z./-]{1,12}$/.test(nip)) problems.push('NIP maksimal 12 karakter')
    else if (nip && knownNip.has(nip)) problems.push(`NIP ${nip} sudah dipakai`)
    else if (nip && seenNip.has(nip)) problems.push(`NIP sama dengan baris ${seenNip.get(nip)}`)
    if (nip) seenNip.set(nip, i + 2)
    const pw = get('password')
    if (pw && pw.length < 8) problems.push('Password kurang dari 8 karakter')
    if (email) seen.set(email, i + 2)
    return {
      row: i + 2, name: get('name'), email, phone, nip, nik, password: pw || randomPassword(),
      programId: prog?.id ?? '', batchId: batch?.id ?? '', programLabel: prog?.title ?? get('program'), batchLabel: batch?.code ?? get('batch'), problems,
    }
  }).filter((r) => r.name || r.email) // abaikan baris kosong
}

export function ImportPesertaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((x) => x)
  const toast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<{ row: number; ok: boolean; nip?: string; error?: string }[] | null>(null)
  const valid = rows?.filter((r) => !r.problems.length) ?? []
  const close = () => { setRows(null); setError(''); setResults(null); onClose() }
  const read = async (file?: File) => {
    setError(''); setRows(null); setResults(null)
    if (!file) return
    try { const list = mapRows(s, await readTable(file)); if (!list.length) throw new Error('Tidak ada baris data di bawah judul kolom.'); if (list.length > 500) throw new Error('Maksimal 500 baris sekali impor.'); setRows(list) } catch (e) { setError((e as Error).message) }
  }
  const run = async () => {
    setBusy(true)
    const r = await importPeserta(valid.map(({ row, name, email, phone, nip, nik, password, programId, batchId }) => ({ row, name, email, phone, nip, nik, password, programId, batchId })))
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    const res = r.data as { row: number; ok: boolean; nip?: string; error?: string }[]
    setResults(res)
    toast(`${res.filter((x) => x.ok).length} peserta didik berhasil diimpor.`)
  }
  // Daftar akun hasil impor: email dan password awal untuk dibagikan ke peserta.
  const downloadAccounts = () => {
    if (!rows || !results) return
    const out: Cell[][] = rows.map((r) => {
      const res = results.find((x) => x.row === r.row)
      const ok = res?.ok
      return [r.row, r.name, r.email, ok ? r.password : '', ok ? res?.nip ?? '' : '', r.programLabel, r.batchLabel, ok ? 'Berhasil' : res?.error ?? r.problems.join('; ')]
    })
    downloadBlob(buildXlsx([{ name: 'Akun peserta didik', cols: [{ header: 'Baris', width: 7 }, { header: 'Nama', width: 30 }, { header: 'Email', width: 28 }, { header: 'Password awal', width: 16 }, { header: 'NIP', width: 12 }, { header: 'Program', width: 26 }, { header: 'Angkatan', width: 14 }, { header: 'Hasil', width: 40 }], rows: out }]), `akun-peserta-didik-${stamp()}.xlsx`)
  }
  return (
    <Modal open={open} size="xl" title="Impor peserta didik dari Excel" onClose={close}>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Unduh template, isi satu peserta per baris: Nama lengkap, Email, No HP, NIP, NIK, Program, Kode angkatan, dan Password awal. Wajib: Nama lengkap, Email, Program. NIP kosong diterbitkan otomatis bila angkatan diisi. Nama program dan kode angkatan ada di sheet "Daftar program".</li>
          <li>Unggah berkas .xlsx (atau .csv). Sistem memeriksa tiap baris sebelum diimpor.</li>
          <li>Setiap baris dibuatkan akun pengguna peserta. Unduh daftar akun untuk membagikan password awal.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => downloadTemplate(s)}><IconDownload size={18} />Unduh template</button>
          <label className="block flex-1"><span className="label">Berkas Excel</span><input className="input !py-2" type="file" accept=".xlsx,.csv" onChange={(e) => { read(e.target.files?.[0]); e.target.value = '' }} /></label>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
        {rows && (
          <>
            <p className="text-sm"><b>{rows.length}</b> baris terbaca · <b className="text-emerald-700">{valid.length}</b> siap diimpor · <b className={rows.length - valid.length ? 'text-red-700' : ''}>{rows.length - valid.length}</b> bermasalah</p>
            <div className="max-h-80 overflow-auto rounded-lg border border-line">
              <Table bare head={['Baris', 'Nama', 'Email', 'Program', 'Angkatan', 'Status']}>
                {rows.map((r) => {
                  const res = results?.find((x) => x.row === r.row)
                  const msg = res ? (res.ok ? `Berhasil${res.nip ? ` · NIP ${res.nip}` : ''}` : res.error) : r.problems.length ? r.problems.join('; ') : 'Siap'
                  const good = res ? res.ok : !r.problems.length
                  return <tr key={r.row}><td className="tabular-nums">{r.row}</td><td className="font-semibold">{r.name}</td><td>{r.email}</td><td>{r.programLabel}</td><td>{r.batchLabel || '-'}</td><td className={good ? 'text-emerald-700' : 'text-red-700'}>{msg}</td></tr>
                })}
              </Table>
            </div>
            {results ? (
              <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={downloadAccounts}><IconFileSpreadsheet size={18} />Unduh daftar akun (email dan password)</button><button className="btn-ghost" onClick={close}>Selesai</button></div>
            ) : (
              <button className="btn-primary w-full" disabled={!valid.length || busy} onClick={run}>{busy ? 'Mengimpor…' : `Impor ${valid.length} peserta didik`}</button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ---------------- Ekspor ke Excel ---------------- */
/** Ekspor data lengkap peserta didik (registrasi aktif atau selesai) ke Excel. */
export function exportPesertaDidik(s: State, regs: Registration[], filename = `peserta-didik-${stamp()}.xlsx`) {
  const rows: Cell[][] = regs.map((r, i) => {
    const u = s.users.find((x) => x.id === r.userId)
    const p = s.profiles.find((x) => x.userId === r.userId)
    return [
      i + 1, r.nip ?? '', u?.name ?? '', u?.nik || p?.nik || '', u?.email ?? '', u?.phone ?? '', p?.birthPlace ?? '', u?.birthDate || p?.birthDate || '', L(p?.gender),
      p ? `${p.address}, RT ${p.rt}/RW ${p.rw}` : '', p?.district ?? '', p?.city ?? '', p?.province ?? '', p?.postalCode ?? '', p?.education ?? '', p?.school ?? '', p?.occupation ?? '',
      INTERNSHIP_LABEL[p?.internshipPref ?? ''] ?? '', p?.groomingAgreed ? 'Bersedia' : '', infoSourceText(p),
      s.programs.find((x) => x.id === r.programId)?.title ?? '', s.batches.find((x) => x.id === r.batchId)?.code ?? '', r.status === 'completed' ? 'Selesai' : 'Aktif',
      `${s.documents.filter((d) => d.userId === r.userId).length}/5`,
    ]
  })
  const head = ['No', 'NIP', 'Nama', 'NIK', 'Email', 'No HP', 'Tempat lahir', 'Tanggal lahir', 'Jenis kelamin', 'Alamat', 'Kecamatan', 'Kota/Kabupaten', 'Provinsi', 'Kode pos', 'Pendidikan', 'Asal sekolah', 'Pekerjaan', 'Kesediaan magang', 'Standar grooming', 'Mengetahui pendaftaran dari', 'Program', 'Angkatan', 'Status', 'Berkas']
  const widths = [5, 12, 28, 20, 28, 16, 16, 14, 13, 40, 18, 22, 18, 9, 12, 26, 18, 16, 16, 28, 26, 14, 9, 8]
  downloadBlob(buildXlsx([{ name: 'Peserta didik', cols: head.map((h, i) => ({ header: h, width: widths[i] })), rows }]), filename)
}

/** Tombol tambah, impor, dan ekspor peserta didik. Tambah dan impor khusus Super Admin dan Akademik. */
export function PesertaActions({ regs }: { regs: Registration[] }) {
  const s = useStore((x) => x)
  const role = s.users.find((u) => u.id === s.sessionUserId)?.role
  const canAdd = role === 'super_admin' || role === 'akademik'
  const [add, setAdd] = useState(false)
  const [imp, setImp] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      {canAdd && <button className="btn-primary" onClick={() => setAdd(true)}><IconPlus size={18} />Tambah peserta didik</button>}
      {canAdd && <button className="btn-ghost" onClick={() => setImp(true)}><IconUpload size={18} />Impor Excel</button>}
      <button className="btn-ghost" disabled={!regs.length} onClick={() => exportPesertaDidik(s, regs)}><IconFileSpreadsheet size={18} />Ekspor Excel</button>
      <PesertaBaruModal open={add} onClose={() => setAdd(false)} />
      <ImportPesertaModal open={imp} onClose={() => setImp(false)} />
    </div>
  )
}
