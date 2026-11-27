import type { State } from './store'
import type { Registration } from './types'

/* Perhitungan tagihan satu registrasi. Dipakai portal peserta dan halaman keuangan agar angkanya selalu sama. */

export type ItemState = 'paid' | 'confirm' | 'unpaid' | 'later' | 'nopackage'
export interface Item {
  key: string; label: string; amount: number | null; state: ItemState
  due?: string; paidOn?: string; receipt?: string; proofFileId?: string; payer?: string; note?: string
}

const STAGE_RANK = ['data', 'bayar_daftar', 'ujian', 'menunggu_hasil', 'registrasi_ulang', 'aktif']
const rank = (st: string) => (st === 'tidak_lulus' ? 3 : STAGE_RANK.indexOf(st))

/** Potongan biaya satu registrasi dari bagian keuangan. */
export const discountsFor = (s: Pick<State, 'discounts'>, regId: string) => s.discounts.filter((d) => d.registrationId === regId)

/** Biaya pendaftaran yang harus dibayar: tarif umum dikurangi potongan biaya pendaftaran (rumus sama dengan server). */
export function regFeeFor(s: Pick<State, 'discounts' | 'settings' | 'batches'>, r: Registration) {
  if (s.batches.find((b) => b.id === r.batchId)?.freeRegFee) return 0
  const cut = discountsFor(s, r.id).filter((d) => d.target === 'pendaftaran').reduce((t, d) => t + d.amount, 0)
  return Math.max(0, (s.settings.regFee ?? 200000) - cut)
}

/**
 * Pengurang total biaya registrasi (yang dicicil), sama dengan server: biaya pendaftaran yang sudah dibayar, potongan biaya pelatihan
 * dan biaya tambahan, serta potongan biaya pendaftaran bila biaya pendaftaran ikut diperhitungkan (sudah dibayar atau dipotong seluruhnya).
 */
export function scheduleCreditFor(s: State, r: Registration) {
  const credit = s.payments.filter((p) => p.registrationId === r.id && p.kind === 'pendaftaran' && p.status === 'verified').reduce((t, p) => t + p.amountPaid, 0)
  const ds = discountsFor(s, r.id)
  const reg = ds.filter((d) => d.target === 'pendaftaran').reduce((t, d) => t + d.amount, 0)
  const other = ds.reduce((t, d) => t + d.amount, 0) - reg
  const counted = credit > 0 || (reg > 0 && reg >= (s.settings.regFee ?? 200000))
  return credit + other + (counted ? reg : 0)
}

/** Semua kewajiban bayar satu registrasi, urut sesuai tahapan. */
export function itemsFor(s: State, r: Registration): Item[] {
  const regFee = regFeeFor(s, r)
  const pays = s.payments.filter((p) => p.registrationId === r.id)
  const items: Item[] = []
  const detail = (p?: (typeof pays)[number]) => ({ paidOn: p?.transferDate, receipt: p?.receiptNo, proofFileId: p?.proofFileId, payer: p?.payerName, note: p?.note })
  const batch = s.batches.find((b) => b.id === r.batchId)
  const imported = r.source === 'admin' // ditambahkan atau diimpor admin: biaya dicatat bagian keuangan

  const reg = pays.filter((p) => p.kind === 'pendaftaran')
  const ok = reg.find((p) => p.status === 'verified')
  const waiting = reg.find((p) => p.status === 'submitted')
  items.push(
    ok ? { key: 'reg', label: 'Biaya pendaftaran', amount: ok.amountPaid, state: 'paid', ...detail(ok) }
      // Angkatan yang dibebaskan: biaya pendaftaran dianggap lunas (Rp0). Biaya registrasi tetap ditagih penuh.
      : batch?.freeRegFee ? { key: 'reg', label: 'Biaya pendaftaran', amount: 0, state: 'paid', note: `Dibebaskan untuk angkatan ${batch.code}` }
      // Biaya pendaftaran yang dipotong seluruhnya oleh bagian keuangan: dianggap lunas (Rp0).
      : regFee === 0 ? { key: 'reg', label: 'Biaya pendaftaran', amount: 0, state: 'paid', note: 'Dipotong seluruhnya oleh bagian keuangan' }
      : waiting ? { key: 'reg', label: 'Biaya pendaftaran', amount: regFee, state: 'confirm', ...detail(waiting) }
      : imported ? { key: 'reg', label: 'Biaya pendaftaran', amount: regFee, state: 'unpaid' }
      : rank(r.stage) > 1 ? { key: 'reg', label: 'Biaya pendaftaran', amount: regFee, state: 'paid' } // data lama tanpa catatan pembayaran
      : { key: 'reg', label: 'Biaya pendaftaran', amount: regFee, state: r.stage === 'data' ? 'later' : 'unpaid' },
  )

  const insts = s.installments.filter((i) => i.registrationId === r.id).sort((a, b) => a.seq - b.seq)
  if (insts.length) {
    for (const i of insts) {
      const label = i.seq === 1 ? 'Registrasi ulang' : `Cicilan ${i.seq - 1}`
      const mine = pays.filter((p) => p.installmentId === i.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const verified = mine.find((p) => p.status === 'verified')
      const waitingPay = mine.find((p) => p.status === 'submitted')
      const rest = i.amount - i.paidAmount
      if (i.paidAmount >= i.amount) {
        items.push({ key: i.id, label, amount: i.amount, due: i.dueDate, state: 'paid', ...detail(verified), note: verified ? verified.note : 'Terpotong dari kelebihan pembayaran lain' })
      } else {
        if (i.paidAmount > 0) items.push({ key: i.id + '-sebagian', label: `${label} (sebagian)`, amount: i.paidAmount, due: i.dueDate, state: 'paid', ...detail(verified), note: verified ? verified.note : 'Terpotong dari kelebihan pembayaran lain' })
        items.push({ key: i.id, label: i.paidAmount > 0 ? `Sisa ${label.toLowerCase()}` : label, amount: rest, due: i.dueDate, state: i.status === 'submitted' ? 'confirm' : 'unpaid', ...detail(waitingPay) })
      }
    }
  } else if (imported && r.stage === 'aktif') items.push({ key: 'ru', label: 'Biaya registrasi', amount: null, state: 'nopackage', note: 'Paket pembayaran belum ditetapkan bagian keuangan' })
  else if (r.stage === 'registrasi_ulang') items.push({ key: 'ru', label: 'Registrasi ulang dan cicilan', amount: null, state: 'nopackage' })
  else if (r.stage !== 'aktif' && r.stage !== 'tidak_lulus') items.push({ key: 'ru', label: 'Registrasi ulang dan cicilan', amount: null, state: 'later' })
  return items
}

export type Summary = 'due' | 'confirm' | 'paid' | 'later'
export function summarize(items: Item[]) {
  const total = items.reduce((t, i) => t + (i.amount ?? 0), 0)
  const paid = items.filter((i) => i.state === 'paid').reduce((t, i) => t + (i.amount ?? 0), 0)
  const status: Summary = items.some((i) => i.state === 'unpaid' || i.state === 'nopackage') ? 'due'
    : items.some((i) => i.state === 'confirm') ? 'confirm'
    : items.some((i) => i.state === 'later') ? 'later' : 'paid'
  return { total, paid, rest: Math.max(0, total - paid), status }
}

/** Kekurangan terhadap minimal registrasi ulang (termin pertama bila lebih kecil), dari pembayaran yang sudah dikonfirmasi. Rumus sama dengan server. */
export function shortfallOf(s: State, regId: string) {
  const first = s.installments.filter((i) => i.registrationId === regId).sort((a, b) => a.seq - b.seq)[0]
  if (!first) return 0
  const got = s.payments.filter((p) => p.registrationId === regId && p.status === 'verified' && (p.kind === 'registrasi_ulang' || p.kind === 'cicilan')).reduce((t, p) => t + p.amountPaid, 0)
  return Math.max(0, Math.min(s.settings.minReenroll ?? 1_000_000, first.amount) - got)
}

/**
 * Pesan WhatsApp dari bagian keuangan ke peserta didik, sesuai status tagihannya. Admin masih bisa mengubah isinya sebelum mengirim.
 * Memuat rincian yang belum dibayar, jatuh tempo, dan rekening tujuan.
 */
export function billMessage(s: State, r: Registration, name: string): string {
  const rp = (n: number) => 'Rp' + n.toLocaleString('id-ID')
  const day = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const items = itemsFor(s, r)
  const { rest, status } = summarize(items)
  const open = items.filter((i) => i.state === 'unpaid')
  const short = r.stage === 'aktif' ? shortfallOf(s, r.id) : 0
  const lines: string[] = [`Halo ${name.split(' ')[0]}, kami dari bagian Keuangan Cimahi Hotel Institute.`, '']
  if (status === 'due') {
    if (open.length) {
      lines.push('Rincian tagihan Anda yang belum dibayar:')
      for (const i of open) lines.push(`- ${i.label}: ${rp(i.amount ?? 0)}${i.due ? ` (jatuh tempo ${day(i.due)})` : ''}`)
      lines.push(`Total belum dibayar: ${rp(rest)}.`)
    }
    if (items.some((i) => i.state === 'nopackage')) lines.push('Silakan pilih paket pembayaran registrasi ulang di aplikasi.')
    if (short > 0) lines.push(`Pembayaran registrasi ulang Anda masih kurang ${rp(short)} dari minimal ${rp(s.settings.minReenroll ?? 1_000_000)}.`)
    lines.push('', `Pembayaran melalui transfer ${s.settings.bankName ?? 'bank'} ${s.settings.bankAccount ?? ''} a.n. ${s.settings.bankHolder ?? ''}, lalu unggah bukti pembayaran di aplikasi.`.replace(/\s+/g, ' ').trim())
  } else if (status === 'confirm') lines.push('Bukti pembayaran Anda sudah kami terima dan sedang diverifikasi. Kami akan memberi kabar setelah dikonfirmasi.')
  else if (status === 'paid') lines.push('Seluruh tagihan Anda saat ini sudah lunas. Terima kasih atas pembayarannya.')
  else lines.push('Tagihan Anda akan tersedia sesuai tahapan pendaftaran. Kami akan menginformasikannya kembali.')
  lines.push('', 'Salam,', 'Keuangan Cimahi Hotel Institute')
  return lines.join('\n')
}