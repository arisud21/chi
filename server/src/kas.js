import { audit, cq, fail, tx, uid } from './lib.js'

/*
 * Manajemen kas. Kas masuk dari pembayaran peserta dihitung langsung dari tabel payments (status verified), jadi tidak disimpan di sini.
 * Tabel cash_transactions hanya memuat catatan manual: modal dan pemasukan lain (kas masuk) serta kas keluar operasional.
 * Kas keluar hanya boleh dicatat bagian keuangan; Super Admin hanya melihat.
 */

export const CASH_IN_CATEGORIES = ['modal', 'pemasukan_lain']
export const CASH_OUT_CATEGORIES = ['operasional', 'gaji_honor', 'sarana', 'pemasaran', 'lainnya']

const day = (v) => { const s = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) fail('Tanggal transaksi tidak valid.'); return s }

export const kasActions = {
  saveCashTx: {
    roles: ['admin_keuangan', 'super_admin'],
    fn: (ctx, x) => tx(async (c) => {
      const direction = x.direction === 'keluar' ? 'keluar' : x.direction === 'masuk' ? 'masuk' : fail('Jenis transaksi tidak dikenal.')
      if (direction === 'keluar' && ctx.user.role !== 'admin_keuangan') fail('Kas keluar hanya dapat diinput oleh bagian keuangan.', 403)
      const category = String(x.category ?? '')
      if (!(direction === 'masuk' ? CASH_IN_CATEGORIES : CASH_OUT_CATEGORIES).includes(category)) fail('Kategori tidak valid.')
      const amount = Math.round(Number(x.amount))
      if (!Number.isFinite(amount) || amount < 1 || amount > 100_000_000_000) fail('Nominal harus lebih dari nol.')
      const desc = String(x.description ?? '').trim().slice(0, 255)
      if (!desc) fail('Keterangan wajib diisi.')
      const date = day(x.date)
      if (x.id) {
        const [ex] = await cq(c, 'SELECT id, direction FROM cash_transactions WHERE id = ? FOR UPDATE', [x.id])
        if (!ex) fail('Transaksi tidak ditemukan.', 404)
        if (ex.direction !== direction) fail('Jenis transaksi tidak bisa diubah.')
        await cq(c, 'UPDATE cash_transactions SET category = ?, tx_date = ?, amount = ?, description = ? WHERE id = ?', [category, date, amount, desc, x.id])
        await audit(c, ctx.user.id, 'kas.ubah', 'cash_transactions', `${direction} ${amount} ${desc}`)
        return
      }
      await cq(c, 'INSERT INTO cash_transactions (id, direction, category, tx_date, amount, description, created_by) VALUES (?,?,?,?,?,?,?)', [uid(), direction, category, date, amount, desc, ctx.user.id])
      await audit(c, ctx.user.id, 'kas.catat', 'cash_transactions', `${direction} ${amount} ${desc}`)
    }),
  },
  deleteCashTx: {
    roles: ['admin_keuangan', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [ex] = await cq(c, 'SELECT * FROM cash_transactions WHERE id = ? FOR UPDATE', [id])
      if (!ex) fail('Transaksi tidak ditemukan.', 404)
      if (ex.direction === 'keluar' && ctx.user.role !== 'admin_keuangan') fail('Kas keluar hanya dapat dikelola oleh bagian keuangan.', 403)
      await cq(c, 'DELETE FROM cash_transactions WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'kas.hapus', 'cash_transactions', `${ex.direction} ${ex.amount} ${ex.description}`)
    }),
  },
}
