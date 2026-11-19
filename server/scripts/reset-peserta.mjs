// Mengosongkan SEMUA data pendaftar dan peserta untuk memulai uji dari awal. Tidak dapat dibatalkan.
//   node --env-file=.env scripts/reset-peserta.mjs --yes            (pendaftar dan peserta saja)
//   node --env-file=.env scripts/reset-peserta.mjs --yes --katalog  (ditambah program, angkatan, jadwal, mapel, materi, tugas)
//
// Dihapus : akun peserta, registrasi, pembayaran, data diri, absensi, nilai, pengumpulan tugas, sertifikat (termasuk penghitung nomor),
//           berkas unggahan peserta (bukti transfer, foto, KTP, tugas, PDF sertifikat), antrean email, audit log, token email.
// Dipertahankan: akun staf, program, angkatan, jadwal, pertemuan, materi, tugas, pengaturan, landing page, template sertifikat.
import fs from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR, pool, q } from '../src/lib.js'

if (!process.argv.includes('--yes')) {
  console.log('Ini menghapus semua data pendaftar dan peserta di database "' + (process.env.DB_NAME || 'cih_sim') + '".')
  console.log('Jalankan ulang dengan --yes untuk melanjutkan.')
  process.exit(1)
}
if (process.env.NODE_ENV === 'production') throw new Error('Pengosongan data peserta tidak boleh dijalankan di produksi.')

const katalog = process.argv.includes('--katalog')
const count = async (sql) => Number((await q(sql))[0].n)
const before = {
  peserta: await count("SELECT COUNT(*) n FROM users WHERE role = 'peserta'"),
  registrasi: await count('SELECT COUNT(*) n FROM registrations'),
  pembayaran: await count('SELECT COUNT(*) n FROM payments'),
  sertifikat: await count('SELECT COUNT(*) n FROM certificates'),
  ...(katalog ? { program: await count('SELECT COUNT(*) n FROM programs'), angkatan: await count('SELECT COUNT(*) n FROM batches') } : {}),
}

const peserta = `(SELECT id FROM users WHERE role = 'peserta')`
const regs = `(SELECT id FROM registrations)`
const conn = await pool.getConnection()
try {
  await conn.beginTransaction()
  const certs = (await conn.query('SELECT id FROM certificates'))[0].map((c) => c.id)
  const files = (await conn.query(`SELECT id, stored_name FROM files WHERE owner_id IN ${peserta} AND kind IN ('proof','profile','submission','document')`))[0]

  await conn.query('DELETE FROM registration_documents')
  await conn.query('DELETE FROM exam_attempts')
  await conn.query('DELETE FROM installments')
  await conn.query('DELETE FROM notifications')
  await conn.query(`DELETE FROM submissions WHERE registration_id IN ${regs}`)
  await conn.query(`DELETE FROM attendances WHERE registration_id IN ${regs}`)
  await conn.query(`DELETE FROM subject_grades WHERE registration_id IN ${regs}`)
  await conn.query(`DELETE FROM grades WHERE registration_id IN ${regs}`)
  await conn.query('DELETE FROM certificates')
  await conn.query('DELETE FROM certificate_sequences')
  await conn.query('DELETE FROM payments')
  await conn.query('DELETE FROM registrations')
  await conn.query('DELETE FROM participant_profiles')
  await conn.query(`DELETE FROM email_tokens WHERE user_id IN ${peserta}`)
  await conn.query('DELETE FROM email_queue')
  await conn.query('DELETE FROM audit_logs')
  if (files.length) await conn.query('DELETE FROM files WHERE id IN (?)', [files.map((f) => f.id)])
  await conn.query("DELETE FROM users WHERE role = 'peserta'")
  if (katalog) {
    const mats = (await conn.query("SELECT f.id, f.stored_name FROM files f WHERE f.kind = 'material'"))[0]
    for (const t of ['submissions', 'attendances', 'materials', 'assignments', 'class_sessions', 'batch_subjects', 'batches', 'subjects']) await conn.query(`DELETE FROM ${t}`)
    await conn.query('DELETE FROM exam_tokens WHERE exam_id IN (SELECT id FROM exams WHERE program_id IS NOT NULL)')
    await conn.query('DELETE FROM exams WHERE program_id IS NOT NULL')
    await conn.query('DELETE FROM payment_plans WHERE program_id IS NOT NULL')
    await conn.query('DELETE FROM fee_items WHERE program_id IS NOT NULL')
    await conn.query('DELETE FROM programs')
    if (mats.length) { await conn.query('DELETE FROM files WHERE id IN (?)', [mats.map((m) => m.id)]); files.push(...mats) }
  }
  await conn.commit()

  // Berkas fisik dihapus setelah transaksi berhasil; kegagalan menghapus berkas tidak membatalkan reset.
  let removed = 0
  for (const name of [...files.map((f) => f.stored_name), ...certs.map((id) => `cert-${id}.pdf`)]) {
    try { await fs.unlink(path.join(UPLOAD_DIR, name)); removed++ } catch { /* sudah tidak ada */ }
  }
  console.log('Dihapus  :', before)
  console.log('Berkas   :', removed, 'berkas fisik dihapus')
} catch (e) {
  await conn.rollback()
  throw e
} finally {
  conn.release()
  await pool.end()
}

console.log(katalog ? 'Selesai. Staf, pengaturan, bank soal, paket cicilan, dan landing page tidak diubah.' : 'Selesai. Katalog, jadwal, staf, pengaturan, dan landing page tidak diubah.')
