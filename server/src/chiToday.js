import { audit, cq, fail, tx, uid } from './lib.js'

/*
 * CHI Today: kabar kegiatan Cimahi Hotel Institute untuk publik (halaman /chi-today).
 * Super Admin menulis kegiatan dan memilih mana yang tampil di bagian Kegiatan pada landing page (is_featured).
 */

export const CHI_TODAY_ROLES = ['super_admin']
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
const day = (v) => { const s = String(v ?? ''); if (!s) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) fail('Tanggal kegiatan tidak valid.'); return s }
// Foto bawaan landing page hanya boleh dari folder /landing di aplikasi sendiri.
const landingSrc = (v) => { const s = String(v ?? '').trim(); if (!s) return null; if (!/^\/landing\/[\w.-]+\.(jpe?g|png|webp)$/i.test(s)) fail('Foto bawaan tidak valid.'); return s }
const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150) || 'kegiatan'

async function uniqueSlug(c, title, id) {
  const base = slugify(title)
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    const [ex] = await cq(c, 'SELECT id FROM chi_today WHERE slug = ? AND id <> ?', [slug, id ?? ''])
    if (!ex) return slug
  }
}

export const chiTodayActions = {
  saveChiToday: {
    roles: CHI_TODAY_ROLES,
    fn: (ctx, x) => tx(async (c) => {
      const title = str(x?.title, 160)
      const imageId = x.imageId ? str(x.imageId, 36) : null
      if (imageId) {
        const [m] = await cq(c, "SELECT id FROM files WHERE id = ? AND kind = 'media'", [imageId])
        if (!m) fail('Foto tidak ditemukan di pustaka media.')
      }
      const vals = [title, str(x.summary, 300, false), str(x.body, 8000, false), str(x.tag, 60, false), day(x.eventDate), imageId, imageId ? null : landingSrc(x.imageSrc),
        x.published === false ? 0 : 1, x.featured ? 1 : 0, Math.max(-999, Math.min(999, Math.round(Number(x.sort) || 0)))]
      if (x.id) {
        const [ex] = await cq(c, 'SELECT id, slug, title FROM chi_today WHERE id = ? FOR UPDATE', [x.id])
        if (!ex) fail('Kegiatan tidak ditemukan.', 404)
        const slug = ex.title === title ? ex.slug : await uniqueSlug(c, title, ex.id)
        await cq(c, 'UPDATE chi_today SET title=?, summary=?, body=?, tag=?, event_date=?, image_id=?, image_src=?, is_published=?, is_featured=?, sort_order=?, slug=? WHERE id = ?', [...vals, slug, ex.id])
      } else {
        await cq(c, 'INSERT INTO chi_today (title, summary, body, tag, event_date, image_id, image_src, is_published, is_featured, sort_order, slug, id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [...vals, await uniqueSlug(c, title), uid(), ctx.user.id])
      }
      await audit(c, ctx.user.id, x.id ? 'chi-today.ubah' : 'chi-today.buat', 'chi_today', title)
    }),
  },
  /** Tampilkan atau sembunyikan kegiatan dari landing page tanpa membuka formulir. */
  setChiTodayFeatured: {
    roles: CHI_TODAY_ROLES,
    fn: (ctx, id, on) => tx(async (c) => {
      const [n] = await cq(c, 'SELECT title, is_published FROM chi_today WHERE id = ?', [id ?? ''])
      if (!n) fail('Kegiatan tidak ditemukan.', 404)
      if (on && !n.is_published) fail('Terbitkan kegiatan ini dulu sebelum ditampilkan di beranda.')
      await cq(c, 'UPDATE chi_today SET is_featured = ? WHERE id = ?', [on ? 1 : 0, id])
      await audit(c, ctx.user.id, on ? 'chi-today.tampil-beranda' : 'chi-today.lepas-beranda', 'chi_today', n.title)
    }),
  },
  deleteChiToday: {
    roles: CHI_TODAY_ROLES,
    fn: (ctx, id) => tx(async (c) => {
      const [n] = await cq(c, 'SELECT title FROM chi_today WHERE id = ?', [id ?? ''])
      if (!n) fail('Kegiatan tidak ditemukan.', 404)
      await cq(c, 'DELETE FROM chi_today WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'chi-today.hapus', 'chi_today', n.title)
    }),
  },
}
