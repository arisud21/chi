import { dateID } from '../components/ui'
import type { Item, Summary } from './billing'
import type { State } from './store'
import type { Registration } from './types'
import { buildXlsx, downloadBlob, type Cell } from './xlsx'

export interface ExportRow { r: Registration; user?: { name: string; nik?: string; phone?: string }; items: Item[]; total: number; paid: number; rest: number; status: Summary }

const SUMMARY: Record<Summary, string> = { due: 'Ada tagihan', confirm: 'Menunggu konfirmasi', paid: 'Lunas', later: 'Belum jatuh tempo' }
const ITEM: Record<Item['state'], string> = { paid: 'Lunas', confirm: 'Menunggu konfirmasi', unpaid: 'Belum dibayar', later: 'Belum jatuh tempo', nopackage: 'Belum pilih paket' }
const PAY_KIND: Record<string, string> = { pendaftaran: 'Pendaftaran', registrasi_ulang: 'Registrasi ulang', cicilan: 'Cicilan' }
const PAY_STATUS: Record<string, string> = { verified: 'Terverifikasi', submitted: 'Menunggu verifikasi', rejected: 'Ditolak' }
const d = (iso?: string) => (iso ? dateID(iso) : '')

const INST_STATUS: Record<string, string> = { unpaid: 'Belum dibayar', partial: 'Sebagian, masih ada sisa', submitted: 'Menunggu konfirmasi', paid: 'Lunas' }

/**
 * Excel rekap pembayaran satu siswa. Sheet utama "Rekap Pembayaran": satu baris untuk setiap cicilan yang dibayar dari tiap
 * pembayaran terverifikasi (tanggal, nominal, kwitansi, sisa cicilan, dan sisa seluruh tagihan sesudahnya). Sheet "Sisa Tagihan"
 * memuat yang belum dibayar. Pembayaran yang menunggu verifikasi atau ditolak ada di sheet terpisah dan tidak mengurangi sisa.
 */
export function exportRincianSiswaXlsx(s: State, x: ExportRow, filename: string) {
  const { r, user, items } = x
  const prog = s.programs.find((p) => p.id === r.programId)?.title ?? ''
  const batch = s.batches.find((b) => b.id === r.batchId)?.code ?? ''
  const insts = s.installments.filter((i) => i.registrationId === r.id).sort((a, b) => a.seq - b.seq)
  const instLabel = (seq: number) => (seq === 1 ? 'Registrasi ulang' : `Cicilan ${seq - 1}`)
  const today = new Date().toISOString().slice(0, 10)
  const reg = items.find((i) => i.key === 'reg')

  const pays = s.payments.filter((p) => p.registrationId === r.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const verified = pays.filter((p) => p.status === 'verified')
  const verifiedSum = verified.reduce((t, p) => t + p.amountPaid, 0)
  const legacy = Math.max(0, x.paid - verifiedSum) // dianggap lunas tanpa catatan transaksi (data lama)

  // Rekap: pembayaran terverifikasi dibagi ke cicilan dengan aturan yang sama seperti server (mulai dari cicilan yang dituju,
  // kelebihan memotong cicilan berikutnya, lalu cicilan sebelumnya yang masih kurang).
  const got = new Map(insts.map((i) => [i.id, 0]))
  let cum = legacy
  let no = 0
  const rekap: Cell[][] = []
  const sisaTotal = () => Math.max(0, x.total - cum)
  if (legacy > 0) rekap.push([++no, 'Tanpa catatan transaksi', 'Biaya pendaftaran', 'Biaya pendaftaran', null, legacy, '', sisaTotal(), '', '', 'Dianggap lunas (data lama atau angkatan dibebaskan)'])
  for (const p of verified) {
    const common = [d(p.transferDate)]
    const tail = [p.payerName, p.receiptNo ?? '', p.note ?? '']
    if (p.kind === 'pendaftaran' || !p.installmentId) {
      cum += p.amountPaid
      rekap.push([++no, ...common, PAY_KIND[p.kind], PAY_KIND[p.kind] === 'Pendaftaran' ? 'Biaya pendaftaran' : PAY_KIND[p.kind], p.amountDue, p.amountPaid, '', sisaTotal(), ...tail])
      continue
    }
    let left = p.amountPaid
    const start = Math.max(0, insts.findIndex((i) => i.id === p.installmentId))
    for (const i of [...insts.slice(start), ...insts.slice(0, start)]) {
      const need = i.amount - (got.get(i.id) ?? 0)
      if (left <= 0) break
      if (need <= 0) continue
      const take = Math.min(left, need)
      got.set(i.id, (got.get(i.id) ?? 0) + take)
      left -= take
      cum += take
      rekap.push([++no, ...common, PAY_KIND[p.kind], instLabel(i.seq), i.amount, take, i.amount - (got.get(i.id) ?? 0), sisaTotal(), ...tail])
    }
    if (left > 0) rekap.push([++no, ...common, PAY_KIND[p.kind], 'Kelebihan pembayaran (dicatat untuk dikembalikan)', null, left, '', sisaTotal(), ...tail])
  }
  rekap.push(['', 'TOTAL DIBAYAR', '', '', null, verifiedSum + legacy, '', x.rest, '', '', 'Kolom sisa: sisa seluruh tagihan setelah pembayaran terakhir'])

  // Sisa tagihan: yang belum dibayar.
  const sisa: Cell[][] = []
  if (reg && reg.state !== 'paid') sisa.push(['Biaya pendaftaran', '', reg.amount, 0, reg.amount, ITEM[reg.state], reg.note ?? ''])
  if (insts.length) {
    for (const i of insts) {
      const rest = Math.max(0, i.amount - i.paidAmount)
      if (rest > 0) sisa.push([instLabel(i.seq), d(i.dueDate), i.amount, i.paidAmount, rest, INST_STATUS[i.status] ?? i.status, i.status !== 'submitted' && i.dueDate < today ? 'Terlambat' : ''])
    }
  } else {
    for (const i of items.filter((y) => y.key !== 'reg' && y.state !== 'paid')) sisa.push([i.label, d(i.due), i.amount, 0, i.amount, ITEM[i.state], i.note ?? ''])
  }
  if (!sisa.length) sisa.push(['Semua tagihan sudah lunas', '', '', '', 0, '', ''])
  sisa.push(['TOTAL SISA TAGIHAN', '', '', '', x.rest, SUMMARY[x.status], ''])

  const pending = pays.filter((p) => p.status !== 'verified').map((p) => [d(p.transferDate), PAY_KIND[p.kind], p.amountPaid, p.payerName, PAY_STATUS[p.status] ?? p.status, p.rejectReason ?? p.note ?? ''])

  const sheets = [
    { name: 'Rekap Pembayaran', rows: rekap,
      cols: [{ header: 'No', width: 6 }, { header: 'Tanggal transfer', width: 18 }, { header: 'Jenis', width: 18 }, { header: 'Pembayaran untuk', width: 34 }, { header: 'Tagihan', money: true, width: 16 },
        { header: 'Dibayar', money: true, width: 16 }, { header: 'Sisa cicilan', money: true, width: 16 }, { header: 'Sisa seluruh tagihan', money: true, width: 20 },
        { header: 'Pengirim', width: 24 }, { header: 'No. kwitansi', width: 22 }, { header: 'Catatan', width: 46 }] },
    { name: 'Sisa Tagihan', rows: sisa,
      cols: [{ header: 'Tagihan', width: 26 }, { header: 'Jatuh tempo', width: 16 }, { header: 'Nominal tagihan', money: true, width: 18 }, { header: 'Sudah dibayar', money: true, width: 16 },
        { header: 'Sisa tagihan', money: true, width: 16 }, { header: 'Status', width: 26 }, { header: 'Keterangan', width: 30 }] },
    { name: 'Ringkasan', rows: [[r.code, r.nip ?? '', user?.name ?? '', user?.nik ?? '', user?.phone ?? '', prog, batch, x.total, x.paid, x.rest, SUMMARY[x.status]]],
      cols: [{ header: 'Kode', width: 16 }, { header: 'NIP', width: 14 }, { header: 'Nama', width: 28 }, { header: 'NIK', width: 20, text: true }, { header: 'Telepon', width: 16, text: true },
        { header: 'Program', width: 28 }, { header: 'Angkatan', width: 14 }, { header: 'Total tagihan', money: true, width: 16 }, { header: 'Sudah dibayar', money: true, width: 16 },
        { header: 'Sisa tagihan', money: true, width: 16 }, { header: 'Status', width: 22 }] },
    ...(pending.length ? [{ name: 'Belum Terkonfirmasi', rows: pending as Cell[][],
      cols: [{ header: 'Tanggal transfer', width: 18 }, { header: 'Jenis', width: 18 }, { header: 'Nominal', money: true, width: 16 }, { header: 'Pengirim', width: 24 }, { header: 'Status', width: 22 }, { header: 'Alasan atau catatan', width: 40 }] }] : []),
  ]
  downloadBlob(buildXlsx(sheets), filename)
  return { pembayaran: verified.length }
}

/** Unduh Excel berisi ringkasan tagihan, rincian tagihan, dan pembayaran registrasi untuk peserta didik yang sedang tampil. */
export function exportPesertaDidikXlsx(s: State, rows: ExportRow[], filename = `pembayaran-peserta-didik-${new Date().toISOString().slice(0, 10)}.xlsx`) {
  const prog = (r: Registration) => s.programs.find((p) => p.id === r.programId)?.title ?? ''
  const batch = (r: Registration) => s.batches.find((b) => b.id === r.batchId)?.code ?? ''
  const who = (x: ExportRow) => [x.r.code, x.r.nip ?? '', x.user?.name ?? ''] as const

  const ringkasan = rows.map((x) => [...who(x), x.user?.nik ?? '', x.user?.phone ?? '', prog(x.r), batch(x.r), x.total, x.paid, x.rest, SUMMARY[x.status]])

  const rincian = rows.flatMap((x) => x.items.map((i) => [...who(x), i.label, i.amount, ITEM[i.state], d(i.due), d(i.paidOn), i.receipt ?? '', i.payer ?? '', i.note ?? '']))

  const ids = new Set(rows.map((x) => x.r.id))
  const byId = new Map(rows.map((x) => [x.r.id, x]))
  const registrasi = s.payments
    .filter((p) => ids.has(p.registrationId) && (p.kind === 'pendaftaran' || p.kind === 'registrasi_ulang'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((p) => { const x = byId.get(p.registrationId)!; return [...who(x), prog(x.r), PAY_KIND[p.kind], p.amountDue, p.amountPaid, p.payerName, d(p.transferDate), PAY_STATUS[p.status] ?? p.status, p.receiptNo ?? '', p.rejectReason ?? ''] })

  const id = [{ header: 'Kode', width: 16 }, { header: 'NIP', width: 16 }, { header: 'Nama', width: 28 }]
  const blob = buildXlsx([
    { name: 'Ringkasan Tagihan', rows: ringkasan, cols: [...id, { header: 'NIK', width: 20 }, { header: 'Telepon', width: 16 }, { header: 'Program', width: 28 }, { header: 'Angkatan', width: 14 },
      { header: 'Total tagihan', money: true, width: 16 }, { header: 'Sudah dibayar', money: true, width: 16 }, { header: 'Sisa', money: true, width: 16 }, { header: 'Status', width: 22 }] },
    { name: 'Rincian Tagihan', rows: rincian, cols: [...id, { header: 'Tagihan', width: 30 }, { header: 'Nominal', money: true, width: 16 }, { header: 'Status', width: 22 }, { header: 'Jatuh tempo', width: 14 },
      { header: 'Tanggal transfer', width: 16 }, { header: 'No. kwitansi', width: 20 }, { header: 'Pengirim', width: 24 }, { header: 'Catatan', width: 34 }] },
    { name: 'Pembayaran Registrasi', rows: registrasi, cols: [...id, { header: 'Program', width: 28 }, { header: 'Jenis', width: 18 }, { header: 'Tagihan', money: true, width: 16 }, { header: 'Dibayar', money: true, width: 16 },
      { header: 'Pengirim', width: 24 }, { header: 'Tanggal transfer', width: 16 }, { header: 'Status', width: 22 }, { header: 'No. kwitansi', width: 20 }, { header: 'Alasan ditolak', width: 30 }] },
  ])
  downloadBlob(blob, filename)
  return { peserta: rows.length, pembayaran: registrasi.length }
}

/**
 * Excel bukti penerimaan: semua pembayaran terverifikasi dalam rentang tanggal transfer (kosong = tanpa batas) untuk peserta yang dipilih.
 * Sheet "Bukti Penerimaan" memuat satu baris per pembayaran (nominal yang dibayarkan) dengan total; sheet "Rekap per Tanggal" menjumlahkan per hari.
 */
export function exportBuktiPenerimaanXlsx(s: State, regs: Registration[], from: string, to: string, filename: string) {
  const byId = new Map(regs.map((r) => [r.id, r]))
  const list = s.payments
    .filter((p) => p.status === 'verified' && byId.has(p.registrationId))
    .filter((p) => (!from || p.transferDate.slice(0, 10) >= from) && (!to || p.transferDate.slice(0, 10) <= to))
    .sort((a, b) => a.transferDate.localeCompare(b.transferDate) || (a.receiptNo ?? '').localeCompare(b.receiptNo ?? ''))
  const total = list.reduce((t, p) => t + p.amountPaid, 0)
  const rows: Cell[][] = list.map((p, i) => {
    const r = byId.get(p.registrationId)!
    return [i + 1, d(p.transferDate), p.receiptNo ?? '', s.users.find((u) => u.id === r.userId)?.name ?? '', r.nip ?? '', s.programs.find((x) => x.id === r.programId)?.title ?? '', s.batches.find((b) => b.id === r.batchId)?.code ?? '', PAY_KIND[p.kind] ?? p.kind, p.amountPaid, p.payerName, p.note ?? '']
  })
  rows.push(['', '', '', 'TOTAL', '', '', '', `${list.length} pembayaran`, total, '', ''])
  const perDay = new Map<string, { n: number; sum: number }>()
  for (const p of list) { const k = p.transferDate.slice(0, 10); const x = perDay.get(k) ?? { n: 0, sum: 0 }; x.n++; x.sum += p.amountPaid; perDay.set(k, x) }
  const rekap: Cell[][] = [...perDay.entries()].map(([k, x]) => [d(k), x.n, x.sum])
  rekap.push(['TOTAL', list.length, total])
  const blob = buildXlsx([
    { name: 'Bukti Penerimaan', rows, cols: [{ header: 'No', width: 6 }, { header: 'Tanggal bayar', width: 16 }, { header: 'No. kwitansi', width: 24 }, { header: 'Nama', width: 28 }, { header: 'NIP', width: 16 }, { header: 'Program', width: 28 }, { header: 'Angkatan', width: 14 },
      { header: 'Jenis pembayaran', width: 20 }, { header: 'Dibayarkan', money: true, width: 16 }, { header: 'Pengirim', width: 24 }, { header: 'Catatan', width: 30 }] },
    { name: 'Rekap per Tanggal', rows: rekap, cols: [{ header: 'Tanggal', width: 18 }, { header: 'Jumlah pembayaran', width: 20 }, { header: 'Total diterima', money: true, width: 18 }] },
  ])
  downloadBlob(blob, filename)
  return { pembayaran: list.length, total }
}
