import { audit, cq, fail, onCommit, tx, uid } from './lib.js'
import { push } from './realtime.js'

/*
 * Berita popup di beranda tiap role. Super admin dan admin pendaftaran menulis berita dan memilih sasaran role.
 * Berita yang sudah ditutup pengguna dicatat di news_reads, jadi tidak muncul lagi di perangkat mana pun.
 */

export const NEWS_ROLES = ['super_admin', 'admin_pendaftaran']
const ALL_ROLES = ['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur', 'peserta']
const AUDIENCE = ['semua', ...ALL_ROLES]
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
const day = (v, label) => { const s = String(v ?? ''); if (!s) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) fail(`Tanggal ${label} tidak valid.`); return s }

export const newsActions = {
  saveNews: {
    roles: NEWS_ROLES,
    fn: (ctx, x) => tx(async (c) => {
      const audience = [...new Set(Array.isArray(x.audience) ? x.audience.map(String) : [])].filter((a) => AUDIENCE.includes(a))
      if (!audience.length) fail('Pilih minimal satu sasaran.')
      const starts = day(x.startsOn, 'mulai tayang'), ends = day(x.endsOn, 'akhir tayang')
      if (starts && ends && ends < starts) fail('Tanggal akhir tayang tidak boleh sebelum tanggal mulai.')
      const vals = [str(x.title, 160), str(x.body, 4000), JSON.stringify(audience.includes('semua') ? ['semua'] : audience), starts, ends, x.active === false ? 0 : 1]
      if (x.id) {
        const [ex] = await cq(c, 'SELECT id FROM news WHERE id = ?', [x.id])
        if (!ex) fail('Berita tidak ditemukan.', 404)
        await cq(c, 'UPDATE news SET title=?, body=?, audience=?, starts_on=?, ends_on=?, is_active=? WHERE id = ?', [...vals, x.id])
        // Isi berubah: yang sudah menutupnya perlu melihat lagi.
        if (x.resend) await cq(c, 'DELETE FROM news_reads WHERE news_id = ?', [x.id])
      } else await cq(c, 'INSERT INTO news (title, body, audience, starts_on, ends_on, is_active, id, created_by) VALUES (?,?,?,?,?,?,?,?)', [...vals, uid(), ctx.user.id])
      await audit(c, ctx.user.id, x.id ? 'berita.ubah' : 'berita.buat', 'news', vals[0])
      onCommit(c, () => push('news', { roles: audience }))
    }),
  },
  deleteNews: {
    roles: NEWS_ROLES,
    fn: (ctx, id) => tx(async (c) => {
      const [n] = await cq(c, 'SELECT title FROM news WHERE id = ?', [id])
      if (!n) fail('Berita tidak ditemukan.', 404)
      await cq(c, 'DELETE FROM news WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'berita.hapus', 'news', n.title)
      onCommit(c, () => push('news'))
    }),
  },
  /** Dipanggil saat pengguna menutup popup. Berlaku untuk semua role. */
  markNewsRead: {
    roles: ALL_ROLES,
    fn: (ctx, id) => tx(async (c) => {
      const [n] = await cq(c, 'SELECT id FROM news WHERE id = ?', [id])
      if (!n) return
      await cq(c, 'INSERT IGNORE INTO news_reads (news_id, user_id) VALUES (?,?)', [id, ctx.user.id])
    }),
  },
}
