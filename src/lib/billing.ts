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

/** Semua kewajiban bayar satu registrasi, urut sesuai tahapan. */
export function itemsFor(s: State, r: Registration): Item[] {
  const regFee = s.settings.regFee ?? 200000
  const pays = s.payments.filter((p) => p.registrationId === r.id)
  const items: Item[] = []
  const detail = (p?: (typeof pays)[number]) => ({ paidOn: p?.transferDate, receipt: p?.receiptNo, proofFileId: p?.proofFileId, payer: p?.payerName })

  const reg = pays.filter((p) => p.kind === 'pendaftaran')
  const ok = reg.find((p) => p.status === 'verified')
  const waiting = reg.find((p) => p.status === 'submitted')
  items.push(
    ok ? { key: 'reg', label: 'Biaya pendaftaran', amount: ok.amountPaid, state: 'paid', ...detail(ok) }
      : waiting ? { key: 'reg', label: 'Biaya pendaftaran', amount: regFee, state: 'confirm', ...detail(waiting) }
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
        items.push({ key: i.id, label, amount: i.amount, due: i.dueDate, state: 'paid', ...detail(verified), note: verified ? undefined : 'Terpotong dari kelebihan pembayaran lain' })
      } else {
        if (i.paidAmount > 0) items.push({ key: i.id + '-sebagian', label: `${label} (sebagian)`, amount: i.paidAmount, due: i.dueDate, state: 'paid', ...detail(verified), note: verified ? undefined : 'Terpotong dari kelebihan pembayaran lain' })
        items.push({ key: i.id, label: i.paidAmount > 0 ? `Sisa ${label.toLowerCase()}` : label, amount: rest, due: i.dueDate, state: i.status === 'submitted' ? 'confirm' : 'unpaid', ...detail(waitingPay) })
      }
    }
  } else if (r.stage === 'registrasi_ulang') items.push({ key: 'ru', label: 'Registrasi ulang dan cicilan', amount: null, state: 'nopackage' })
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
