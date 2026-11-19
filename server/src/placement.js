import { audit, cq, fail, tx, uid } from './lib.js'
import { isFullyPaid, notify, syncGraduation } from './admission.js'

/*
 * Penempatan magang atau kerja, daftar perusahaan mitra, dan logbook harian magang.
 * Staf mengelola perusahaan dan penempatan. Peserta didik mengisi logbook sendiri, staf menyetujui atau meminta revisi.
 */

export const PLACEMENT_ROLES = ['super_admin', 'akademik']
const num = (v, min = 0, max = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail('Nilai angka tidak valid.'); return n }
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
const day = (v, label, req = true) => { const s = String(v ?? ''); if (!s && !req) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) fail(`Tanggal ${label} tidak valid.`); return s }
/** Tanggal hari ini menurut WIB (UTC+7), format YYYY-MM-DD. */
const dateID = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Peserta yang boleh ditempatkan: registrasi ulang terkonfirmasi (tahap aktif). */
async function activeReg(c, regId) {
  const [r] = await cq(c, "SELECT * FROM registrations WHERE id = ? AND stage = 'aktif' AND status IN ('active','completed')", [regId])
  if (!r) fail('Hanya peserta didik yang registrasi ulangnya sudah dikonfirmasi yang dapat ditempatkan.')
  return r
}

async function ownPlacement(c, user, placementId) {
  const [p] = await cq(c, 'SELECT p.*, r.user_id FROM placements p JOIN registrations r ON r.id = p.registration_id WHERE p.id = ?', [placementId])
  if (!p || p.user_id !== user.id) fail('Penempatan tidak ditemukan.', 404)
  return p
}

export const placementActions = {
  saveCompany: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, x) => tx(async (c) => {
      const vals = [str(x.name, 160), str(x.category, 60, false) || 'Hotel', str(x.address, 255, false) || null, str(x.city, 80, false) || null, str(x.country, 80, false) || 'Indonesia', str(x.contactName, 120, false) || null,
        str(x.contactPhone, 30, false) || null, str(x.contactEmail, 160, false) || null, str(x.notes, 500, false) || null, x.active === false ? 0 : 1]
      if (x.id) {
        const [ex] = await cq(c, 'SELECT id FROM companies WHERE id = ?', [x.id])
        if (!ex) fail('Perusahaan tidak ditemukan.', 404)
        await cq(c, 'UPDATE companies SET name=?, category=?, address=?, city=?, country=?, contact_name=?, contact_phone=?, contact_email=?, notes=?, is_active=? WHERE id = ?', [...vals, x.id])
      } else await cq(c, 'INSERT INTO companies (name, category, address, city, country, contact_name, contact_phone, contact_email, notes, is_active, id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...vals, uid()])
      await audit(c, ctx.user.id, 'perusahaan.simpan', 'companies', vals[0])
    }),
  },
  deleteCompany: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, id) => tx(async (c) => {
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM placements WHERE company_id = ?', [id])
      if (Number(n)) { await cq(c, 'UPDATE companies SET is_active = 0 WHERE id = ?', [id]); await audit(c, ctx.user.id, 'perusahaan.nonaktif', 'companies', id); return 'nonaktif' }
      await cq(c, 'DELETE FROM companies WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'perusahaan.hapus', 'companies', id)
      return 'hapus'
    }),
  },
  savePlacement: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, x) => tx(async (c) => {
      const kind = ['magang', 'kerja'].includes(x.kind) ? x.kind : fail('Jenis harus magang atau kerja.')
      const start = day(x.startDate, 'mulai'), end = day(x.endDate, 'selesai', false)
      if (end && end < start) fail('Tanggal selesai tidak boleh sebelum tanggal mulai.')
      const [co] = await cq(c, 'SELECT id, name, is_active FROM companies WHERE id = ?', [x.companyId])
      if (!co) fail('Pilih perusahaan.')
      const vals = [co.id, kind, str(x.position, 120, false) || null, start, end, str(x.notes, 500, false) || null]
      if (x.id) {
        const [ex] = await cq(c, 'SELECT id FROM placements WHERE id = ?', [x.id])
        if (!ex) fail('Penempatan tidak ditemukan.', 404)
        await cq(c, 'UPDATE placements SET company_id=?, kind=?, position=?, start_date=?, end_date=?, notes=? WHERE id = ?', [...vals, x.id])
        await audit(c, ctx.user.id, 'penempatan.ubah', 'placements', co.name)
        return
      }
      if (!co.is_active) fail('Perusahaan ini sudah nonaktif.')
      const r = await activeReg(c, x.registrationId)
      // Penempatan (magang atau kerja) baru boleh diatur setelah peserta melunasi seluruh pembayaran.
      if (!(await isFullyPaid(c, r.id))) fail('Peserta ini belum melunasi pembayaran. Penempatan magang baru bisa diatur setelah seluruh tagihan lunas.')
      const [dup] = await cq(c, "SELECT id FROM placements WHERE registration_id = ? AND status = 'berjalan'", [r.id])
      if (dup) fail('Peserta ini masih punya penempatan yang berjalan. Selesaikan atau batalkan dulu.')
      await cq(c, 'INSERT INTO placements (company_id, kind, position, start_date, end_date, notes, id, registration_id, created_by) VALUES (?,?,?,?,?,?,?,?,?)', [...vals, uid(), r.id, ctx.user.id])
      await audit(c, ctx.user.id, 'penempatan.buat', 'placements', `${r.code} di ${co.name}`)
      await notify(c, r.user_id, kind === 'magang' ? 'Penempatan magang Anda' : 'Penempatan kerja Anda',
        `Anda ditempatkan di ${co.name}${vals[2] ? ` sebagai ${vals[2]}` : ''}, mulai ${dateID(start)}.${kind === 'magang' ? ' Isi logbook harian di menu Magang dan kerja.' : ''}`, '/app/magang')
    }),
  },
  setPlacementStatus: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, id, status) => tx(async (c) => {
      if (!['berjalan', 'selesai', 'batal'].includes(status)) fail('Status tidak dikenal.')
      const [p] = await cq(c, 'SELECT p.*, r.user_id FROM placements p JOIN registrations r ON r.id = p.registration_id WHERE p.id = ? FOR UPDATE', [id])
      if (!p) fail('Penempatan tidak ditemukan.', 404)
      if (status === 'berjalan') {
        const [dup] = await cq(c, "SELECT id FROM placements WHERE registration_id = ? AND status = 'berjalan' AND id <> ?", [p.registration_id, id])
        if (dup) fail('Peserta ini sudah punya penempatan lain yang berjalan.')
      }
      await cq(c, 'UPDATE placements SET status = ? WHERE id = ?', [status, id])
      await audit(c, ctx.user.id, 'penempatan.status', 'placements', `${id}: ${status}`)
      if (status !== 'berjalan' && p.status === 'berjalan') await notify(c, p.user_id, status === 'selesai' ? 'Penempatan selesai' : 'Penempatan dibatalkan', status === 'selesai' ? 'Penempatan Anda ditandai selesai.' : 'Penempatan Anda dibatalkan. Hubungi admin bila ada pertanyaan.', '/app/magang')
    }),
  },
  /** Nilai magang (0-100) satu penempatan, diinput Akademik setelah magang selesai. Kosongkan untuk menghapus nilai. */
  setPlacementScore: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, id, score) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT p.*, r.user_id FROM placements p JOIN registrations r ON r.id = p.registration_id WHERE p.id = ? FOR UPDATE', [id])
      if (!p) fail('Penempatan tidak ditemukan.', 404)
      if (p.kind !== 'magang') fail('Nilai hanya untuk penempatan magang.')
      if (p.status !== 'selesai') fail('Nilai magang diinput setelah magang ditandai selesai.')
      const v = score === '' || score == null ? null : Math.round(num(score, 0, 100) * 10) / 10
      await cq(c, 'UPDATE placements SET score = ? WHERE id = ?', [v, id])
      await audit(c, ctx.user.id, 'penempatan.nilai', 'placements', `${id}: ${v ?? 'dihapus'}`)
      await syncGraduation(c, p.registration_id) // nilai magang terisi + lunas + lulus = kelulusan sempurna; dihapus = kembali belum lulus
      if (v != null && p.score == null) await notify(c, p.user_id, 'Nilai magang Anda', 'Nilai magang Anda sudah diinput dan masuk ke transkrip akhir pelatihan. Lihat di menu Laporan.', '/app/laporan')
    }),
  },
  reviewLogbook: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, entryId, status, note) => tx(async (c) => {
      if (!['disetujui', 'revisi'].includes(status)) fail('Status penilaian tidak dikenal.')
      const [e] = await cq(c, 'SELECT e.*, r.user_id FROM logbook_entries e JOIN placements p ON p.id = e.placement_id JOIN registrations r ON r.id = p.registration_id WHERE e.id = ? FOR UPDATE', [entryId])
      if (!e) fail('Catatan logbook tidak ditemukan.', 404)
      const n = str(note, 500, status === 'revisi')
      await cq(c, 'UPDATE logbook_entries SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?', [status, n || null, ctx.user.id, new Date(), entryId])
      await audit(c, ctx.user.id, 'logbook.nilai', 'logbook_entries', `${entryId}: ${status}`)
      if (status === 'revisi') await notify(c, e.user_id, 'Logbook perlu revisi', `Logbook tanggal ${dateID(String(e.entry_date).slice(0, 10))} perlu diperbaiki: ${n}`, '/app/magang')
    }),
  },

  /** Akademik menyetujui banyak logbook yang diajukan peserta sekaligus. Hanya catatan berstatus diajukan atau revisi yang diproses. */
  approveLogbooks: {
    roles: PLACEMENT_ROLES,
    fn: (ctx, ids) => tx(async (c) => {
      const list = [...new Set(Array.isArray(ids) ? ids.map(String) : [])].slice(0, 500)
      if (!list.length) fail('Pilih logbook yang akan disetujui.')
      const rows = await cq(c, "SELECT e.id FROM logbook_entries e WHERE e.id IN (?) AND e.status <> 'disetujui' FOR UPDATE", [list])
      if (!rows.length) fail('Semua logbook yang dipilih sudah disetujui.')
      await cq(c, "UPDATE logbook_entries SET status = 'disetujui', reviewer_note = NULL, reviewed_by = ?, reviewed_at = ? WHERE id IN (?)", [ctx.user.id, new Date(), rows.map((r) => r.id)])
      await audit(c, ctx.user.id, 'logbook.setujui-massal', 'logbook_entries', String(rows.length) + ' catatan')
      return rows.length
    }),
  },

  // Peserta didik mengisi logbook sendiri.
  saveLogbook: {
    roles: ['peserta'],
    fn: (ctx, x) => tx(async (c) => {
      const p = await ownPlacement(c, ctx.user, x.placementId)
      if (p.kind !== 'magang') fail('Logbook hanya untuk penempatan magang.')
      const [{ n: docs }] = await cq(c, 'SELECT COUNT(DISTINCT kind) n FROM registration_documents WHERE user_id = ?', [ctx.user.id])
      if (Number(docs) < 5) fail('Unggah kelima berkas registrasi ulang terlebih dahulu.', 403)
      if (p.status !== 'berjalan') fail('Penempatan ini sudah tidak berjalan.')
      const date = day(x.date, 'logbook')
      const start = String(p.start_date).slice(0, 10), end = p.end_date ? String(p.end_date).slice(0, 10) : null
      if (date < start || (end && date > end)) fail('Tanggal di luar masa magang Anda.')
      const activity = str(x.activity, 2000)
      if (activity.length < 10) fail('Uraikan kegiatan minimal 10 karakter.')
      const learning = str(x.learning, 500, false) || null
      const hours = num(x.hours, 0.5, 16)
      if (x.id) {
        // Mengubah catatan yang sudah ada: tanggalnya tetap, hanya isinya yang diperbarui.
        const [ex] = await cq(c, 'SELECT id, status, entry_date FROM logbook_entries WHERE id = ? AND placement_id = ? FOR UPDATE', [x.id, p.id])
        if (!ex) fail('Catatan logbook tidak ditemukan.', 404)
        if (ex.status === 'disetujui') fail('Logbook yang sudah divalidasi tidak bisa diubah.', 403)
        await cq(c, "UPDATE logbook_entries SET activity = ?, learning = ?, hours = ?, status = 'diajukan', reviewer_note = NULL, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?", [activity, learning, hours, ex.id])
        await audit(c, ctx.user.id, 'logbook.ubah', 'logbook_entries', String(ex.entry_date).slice(0, 10))
        return
      }
      // Catatan baru: tanggal tidak boleh sama dengan atau lebih awal dari tanggal logbook yang sudah terisi.
      const [{ last }] = await cq(c, 'SELECT MAX(entry_date) last FROM logbook_entries WHERE placement_id = ? FOR UPDATE', [p.id])
      const lastDay = last ? (last instanceof Date ? new Date(last.getTime() - last.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : String(last).slice(0, 10)) : null
      if (lastDay && date <= lastDay) fail(`Tanggal harus setelah logbook terakhir (${lastDay}). Satu tanggal hanya boleh punya satu logbook.`)
      await cq(c, 'INSERT INTO logbook_entries (id, placement_id, entry_date, activity, learning, hours) VALUES (?,?,?,?,?,?)', [uid(), p.id, date, activity, learning, hours])
      await audit(c, ctx.user.id, 'logbook.simpan', 'logbook_entries', date)
    }),
  },
  deleteLogbook: {
    roles: ['peserta'],
    fn: (ctx, id) => tx(async (c) => {
      const [e] = await cq(c, 'SELECT e.*, r.user_id FROM logbook_entries e JOIN placements p ON p.id = e.placement_id JOIN registrations r ON r.id = p.registration_id WHERE e.id = ? FOR UPDATE', [id])
      if (!e || e.user_id !== ctx.user.id) fail('Catatan logbook tidak ditemukan.', 404)
      if (e.status === 'disetujui') fail('Logbook yang sudah disetujui tidak bisa dihapus.', 403)
      await cq(c, 'DELETE FROM logbook_entries WHERE id = ?', [id])
    }),
  },
}
