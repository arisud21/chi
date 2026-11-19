import { KIND_LABEL } from '../components/ui'
import type { State } from './store'

export type KasArah = 'masuk' | 'keluar'
export interface KasRow { id: string; arah: KasArah; date: string; amount: number; category: string; description: string; auto: boolean; manualId?: string }

export const KAS_MASUK_KATEGORI: Record<string, string> = { pembayaran: 'Pembayaran peserta', modal: 'Modal', pemasukan_lain: 'Pemasukan lainnya' }
export const KAS_KELUAR_KATEGORI: Record<string, string> = { operasional: 'Operasional', gaji_honor: 'Gaji dan honor', sarana: 'Sarana dan prasarana', pemasaran: 'Pemasaran', lainnya: 'Lainnya' }
export const kategoriLabel = (c: string) => KAS_MASUK_KATEGORI[c] ?? KAS_KELUAR_KATEGORI[c] ?? c

/**
 * Semua transaksi kas: kas masuk dari pembayaran peserta yang sudah terverifikasi (otomatis, tidak bisa diubah di sini)
 * ditambah catatan manual (modal, pemasukan lain, dan kas keluar). Urut dari yang terbaru.
 */
export function kasRows(s: Pick<State, 'payments' | 'registrations' | 'users' | 'cashTx'>): KasRow[] {
  const fromPay: KasRow[] = s.payments.filter((p) => p.status === 'verified').map((p) => {
    const r = s.registrations.find((x) => x.id === p.registrationId)
    const name = s.users.find((u) => u.id === r?.userId)?.name ?? '-'
    return { id: `pay-${p.id}`, arah: 'masuk', date: p.transferDate.slice(0, 10), amount: p.amountPaid, category: 'pembayaran', description: `${KIND_LABEL[p.kind] ?? p.kind} · ${name}${r?.nip ? ` (${r.nip})` : ''}${p.receiptNo ? ` · ${p.receiptNo}` : ''}`, auto: true }
  })
  const manual: KasRow[] = s.cashTx.map((x) => ({ id: `kas-${x.id}`, arah: x.direction, date: x.date, amount: x.amount, category: x.category, description: x.description, auto: false, manualId: x.id }))
  return [...fromPay, ...manual].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

export const jumlahKas = (rows: KasRow[], arah: KasArah) => rows.filter((r) => r.arah === arah).reduce((t, r) => t + r.amount, 0)
