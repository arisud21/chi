import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { HttpError, MAX_AGE, UPLOAD_DIR, ageOn, audit, cq, dt, fail, getSettings, mail, q, randomCode, tx, uid } from './lib.js'
import { newsActions } from './news.js'
import { chiTodayActions } from './chiToday.js'
import { placementActions } from './placement.js'
import { kasActions } from './kas.js'
import { staffProfileActions } from './staffProfile.js'
import { MIN_REENROLL_DEFAULT, REG_FEE_DEFAULT, admissionActions, allocatePayment, applyScheduleDelta, buildSchedule, discountsOf, regFeeDue, scheduleCredit, issueNip, notify, reenrollShortfall, recalcAttendancePct, syncFinal, validWeights, remainingTotal, sweepAdmissions, syncGraduation, unattendedSessions } from './admission.js'

const ALL_STAFF = ['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur']
const CMS = ['super_admin', 'admin_pendaftaran']
const LIVE = ['pending_payment', 'waiting_verification', 'active']
void ALL_STAFF

const num = (v, min = 0, max = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail('Nilai angka tidak valid.'); return n }
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
/** Satu digit 1 sampai 9 (atau kosong). Dipakai untuk angkatan dan kode program di NIP. */
const digit = (v, label) => { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 9) fail(`${label} harus angka 1 sampai 9.`); return n }
/** Validasi satu mata pelajaran, dipakai simpan satu per satu dan impor massal. */
const cleanSubject = (x) => {
  if (!['teori', 'praktik', 'teori_praktik'].includes(x.kind)) fail('Jenis harus teori, praktik, atau teori dan praktik.')
  // Jumlah pertemuan dan jam total tidak dibatasi; batas atas hanya kapasitas kolom INT di database.
  const INT_MAX = 2_147_483_647
  const opt = (v, max, label) => { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > max) fail(max === INT_MAX ? `${label} harus bilangan bulat minimal 1.` : `${label} harus bilangan bulat 1 sampai ${max}.`); return n }
  const hoursPerMeeting = opt(x.hoursPerMeeting, 24, 'Jam per pertemuan')
  const meetings = opt(x.meetings, INT_MAX, 'Jumlah pertemuan')
  // Bila jam per pertemuan dan jumlah pertemuan terisi, jam total = hasil kalinya (isian jam total diabaikan).
  const hours = hoursPerMeeting != null && meetings != null ? hoursPerMeeting * meetings : num(x.hours, 1, INT_MAX)
  if (!Number.isInteger(hours)) fail('Jumlah jam per program harus bilangan bulat.')
  if (hours > INT_MAX) fail('Jumlah jam per program terlalu besar.')
  return { name: str(x.name, 120), code: str(x.code, 12, false) || null, kind: x.kind, hours, hoursPerMeeting, meetings, description: str(x.description, 255, false) }
}
const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const hm = (t) => (t ? String(t).slice(0, 5) : '')
/** Dua jadwal beririsan bila ada hari yang sama dan rentang jamnya bertumpuk. */
const clash = (a, o) => a.days.some((d) => o.days.includes(d)) && a.start < o.end && o.start < a.end
const okHref = (h) =>!h || h.startsWith('/') || h.startsWith('#') || /^https:\/\//.test(h)

async function seats(conn, batchId) {
  const [r] = await cq(conn, "SELECT COUNT(*) n FROM registrations WHERE batch_id = ? AND status IN ('pending_payment','waiting_verification','active')", [batchId])
  return Number(r.n)
}
/** Nilai akhir = hasil bobot per mata pelajaran yang ditetapkan Akademik (grades.final_score). Tanpa itu (data lama) dipakai rata-rata teori dan praktik. */
const finalScore = (g) => (g.final_score != null ? Number(g.final_score) : Math.round(((Number(g.theory) + Number(g.practical)) / 2) * 10) / 10)
const recommend = (g, p) => finalScore(g) >= p.passing_score && Number(g.attendance_pct) >= p.min_attendance

/** Kedaluwarsa otomatis (PAY-6). Dipanggil oleh job berkala dan saat state diminta. */
export const expireOverdue = sweepAdmissions

/** Membuat registrasi + tagihan untuk satu peserta di dalam transaksi yang sudah berjalan. Angkatan ditetapkan admin kemudian. */
export async function registerForProgram(c, user, programId) {
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ? AND is_active = 1 AND deleted_at IS NULL FOR UPDATE', [programId])
      if (!p) fail('Jenis pelatihan tidak ditemukan atau tidak dibuka.')
      const live = await cq(c, `SELECT id FROM registrations WHERE user_id = ? AND program_id = ? AND status IN (${LIVE.map(() => '?').join(',')})`, [user.id, p.id, ...LIVE])
      if (live.length) fail('Anda masih punya pendaftaran aktif pada jenis pelatihan yang sama.')
      const settings = await getSettings(c)
      const ym = new Date().toISOString().slice(0, 7).replace('-', '')
      // Urutan diambil dari nomor tertinggi (bukan jumlah baris) agar tidak bentrok setelah ada registrasi yang dihapus atau direset.
      const [{ mx }] = await cq(c, "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(code, '-', -1) AS UNSIGNED)), 0) mx FROM registrations")
      let next = Number(mx) + 1
      while ((await cq(c, 'SELECT 1 FROM registrations WHERE code = ? OR invoice_no = ? LIMIT 1', [`REG-${ym}-${String(next).padStart(3, '0')}`, `INV-${ym}-${String(next).padStart(3, '0')}`])).length) next++
      const seq = String(next).padStart(3, '0')
      const due = new Date(Date.now() + 366 * 86_400_000) // batas nyata ada di tiap tahap, bukan di registrasi
      const id = uid()
      await cq(c, 'INSERT INTO registrations (id, code, user_id, program_id, batch_id, status, stage, price_snapshot, unique_code, invoice_no, due_at) VALUES (?,?,?,?,NULL,?,?,?,?,?,?)',
        [id, `REG-${ym}-${seq}`, user.id, p.id, 'pending_payment', 'data', p.price, 0, `INV-${ym}-${seq}`, due])
      await notify(c, user.id, `Registrasi ${p.title} berhasil`, `Halo ${user.name}, lengkapi data diri di aplikasi. Setelah itu Anda akan diminta membayar biaya pendaftaran ${'Rp' + Number(settings.regFee ?? REG_FEE_DEFAULT).toLocaleString('id-ID')}.`, '/app/data-diri')
      await audit(c, user.id, 'registrasi.buat', 'registrations', `${user.name} memilih ${p.title}`)
}

/**
 * Daftar aksi RPC. Setiap aksi: roles yang boleh, lalu fungsi (ctx, ...args).
 * Kegagalan bisnis dilempar lewat fail() dan menjadi {ok:false,error}.
 */
export const actions = {
  ...admissionActions,
  ...placementActions,
  ...kasActions,
  ...staffProfileActions,
  ...newsActions,
  ...chiTodayActions,
  /* ---------- registrasi dan pembayaran ---------- */
  createRegistration: {
    roles: ['peserta'],
    fn: (ctx, programId) => tx((c) => registerForProgram(c, ctx.user, programId)),
  },

  assignBatch: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, regId, batchId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r) fail('Registrasi tidak ditemukan.')
      if (!['pending_payment', 'waiting_verification', 'active'].includes(r.status)) fail('Angkatan hanya bisa ditetapkan untuk pendaftaran yang masih berjalan.')
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [batchId])
      if (!b) fail('Angkatan tidak ditemukan.')
      if (b.program_id !== r.program_id) fail('Angkatan harus dari jenis pelatihan yang dipilih peserta.')
      if (!['open', 'running'].includes(b.status)) fail('Angkatan ini sudah tidak menerima peserta.')
      if (r.batch_id !== b.id && (await seats(c, b.id)) >= b.quota) fail('Kuota angkatan penuh.')
      await cq(c, 'UPDATE registrations SET batch_id = ? WHERE id = ?', [b.id, r.id])
      const [u] = await cq(c, 'SELECT email, name FROM users WHERE id = ?', [r.user_id])
      await mail(c, u.email, 'Angkatan Anda ditetapkan', `Halo ${u.name}, Anda ditempatkan di angkatan ${b.code} (mulai ${b.start_date}). Cek jadwalnya di portal peserta.`)
      await audit(c, ctx.user.id, 'registrasi.angkatan', 'registrations', `${r.code} -> ${b.code}`)
    }),
  },

  /**
   * Ubah program pilihan pendaftar. Dibuka sejak pendaftaran sampai peserta menyelesaikan unggah kelima berkas registrasi ulang;
   * setelah itu terkunci. Angkatan dan NIP dikosongkan karena melekat pada program lama, dan admin menetapkannya ulang.
   */
  changeProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, regId, programId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r) fail('Registrasi tidak ditemukan.', 404)
      if (!LIVE.includes(r.status) || r.stage === 'tidak_lulus') fail('Program hanya bisa diubah untuk pendaftaran yang masih berjalan.')
      if (r.program_id === programId) fail('Program yang dipilih sama dengan program saat ini.')
      const [{ n }] = await cq(c, 'SELECT COUNT(DISTINCT kind) n FROM registration_documents WHERE user_id = ?', [r.user_id])
      if (Number(n) >= 5) fail('Program tidak bisa diubah lagi karena peserta sudah menyelesaikan unggah berkas.', 403)
      const [np] = await cq(c, 'SELECT id, title, price FROM programs WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [programId])
      if (!np) fail('Program tujuan tidak ditemukan atau tidak dibuka.')
      const [old] = await cq(c, 'SELECT title, price FROM programs WHERE id = ?', [r.program_id])
      const [dup] = await cq(c, `SELECT id FROM registrations WHERE user_id = ? AND program_id = ? AND id <> ? AND status IN (${LIVE.map(() => '?').join(',')})`, [r.user_id, np.id, r.id, ...LIVE])
      if (dup) fail('Peserta ini sudah punya pendaftaran aktif pada program tujuan.')
      const [{ inst }] = await cq(c, 'SELECT COUNT(*) inst FROM installments WHERE registration_id = ?', [r.id])
      await cq(c, 'UPDATE registrations SET program_id = ?, price_snapshot = ?, batch_id = NULL, nip = NULL WHERE id = ?', [np.id, np.price, r.id])
      await audit(c, ctx.user.id, 'registrasi.program', 'registrations', `${r.code}: ${old?.title} -> ${np.title}`)
      const hadBatch = !!r.batch_id
      await notify(c, r.user_id, 'Program pilihan Anda diubah', `Admin mengubah program Anda dari ${old?.title ?? '-'} menjadi ${np.title}.${hadBatch ? ' Angkatan akan ditetapkan ulang oleh admin.' : ''} Jika ini tidak sesuai, hubungi admin pendaftaran.`, '/app')
      return { priceChanged: Number(old?.price) !== Number(np.price), scheduleExists: Number(inst) > 0, hadBatch }
    }),
  },

  cancelRegistration: {
    roles: ['peserta', 'admin_pendaftaran', 'super_admin'],
    fn: (ctx, id, reason) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [id])
      if (!r) fail('Registrasi tidak ditemukan.')
      if (ctx.user.role === 'peserta') {
        if (r.user_id !== ctx.user.id) fail('Registrasi bukan milik Anda.', 403)
        if (r.status !== 'pending_payment') fail('Registrasi yang sudah dibayar dibatalkan lewat admin.')
        reason = 'Dibatalkan peserta'
      } else {
        // Admin menandai pendaftar mundur di tahap mana pun selama pendaftarannya masih berjalan. Datanya tetap tersimpan untuk rekap.
        if (!['pending_payment', 'waiting_verification', 'active'].includes(r.status)) fail('Pendaftaran ini sudah tidak berjalan (selesai, mundur, atau kedaluwarsa).')
        reason = str(reason, 200)
      }
      await cq(c, "UPDATE registrations SET status = 'cancelled', cancelled_reason = ? WHERE id = ?", [reason, id])
      await audit(c, ctx.user.id, 'registrasi.mundur', 'registrations', `${r.code}: ${reason}`)
    }),
  },

  verifyPayment: {
    roles: ['admin_keuangan', 'super_admin'],
    // amount (opsional): nominal sesuai bukti transfer bila berbeda dari unggahan pendaftar atau peserta.
    // Untuk registrasi ulang dan cicilan, selisih terhadap tagihan menjadi sisa tagihan peserta didik (termin berstatus sebagian).
    fn: (ctx, id, amount) => tx(async (c) => {
      const [p] = await cq(c, "SELECT * FROM payments WHERE id = ? AND status = 'submitted' FOR UPDATE", [id])
      if (!p) fail('Pembayaran tidak dalam antrean.')
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [p.registration_id])
      let adjNote = ''
      if (amount != null && amount !== '') {
        const a = num(amount, 1, 1_000_000_000_000)
        const old = Number(p.amount_paid)
        if (a !== old) {
          const rpa = (n) => 'Rp' + Number(n).toLocaleString('id-ID')
          const text = `Nominal disesuaikan bagian keuangan dari ${rpa(old)} menjadi ${rpa(a)} sesuai bukti transfer.`
          await cq(c, 'UPDATE payments SET amount_paid = ?, note = ? WHERE id = ?', [a, text.slice(0, 255), p.id])
          p.amount_paid = a
          adjNote = ` ${text}`
        }
      }
      const receipt = `KWT-${new Date().toISOString().slice(0, 7).replace('-', '')}-${r.code.slice(-3)}-${p.id.slice(0, 4).toUpperCase()}`
      await cq(c, "UPDATE payments SET status = 'verified', verified_by = ?, receipt_no = ? WHERE id = ?", [ctx.user.id, receipt, id])
      const paid = 'Rp' + Number(p.amount_paid).toLocaleString('id-ID')
      if (p.kind === 'pendaftaran') {
        await cq(c, "UPDATE registrations SET stage = 'ujian' WHERE id = ? AND stage = 'bayar_daftar'", [r.id])
        await notify(c, r.user_id, 'Pembayaran pendaftaran dikonfirmasi', `Kwitansi ${receipt}, ${paid}.${adjNote} Ujian online kini terbuka. Buka menu Ujian online; token diberikan otomatis oleh sistem dan berlaku 1 hari.`, '/app/ujian')
      } else {
        // Pembayaran lebih memotong termin berikutnya. Pembayaran kurang tetap disimpan, peserta diminta segera melunasi.
        const { leftover } = await allocatePayment(c, p)
        await syncGraduation(c, r.id) // lunas + nilai lulus tervalidasi = kelulusan sempurna
        const rest = await remainingTotal(c, r.id)
        const rpx = (n) => 'Rp' + Number(n).toLocaleString('id-ID')
        const over = Number(p.amount_paid) > Number(p.amount_due) ? ` Kelebihan pembayaran otomatis memotong cicilan berikutnya.` : ''
        const leftNote = leftover > 0 ? ` Kelebihan ${rpx(leftover)} melebihi seluruh tagihan dan dicatat untuk dikembalikan.` : ''
        const sisa = rest > 0 ? ` Sisa tagihan ${rpx(rest)}.` : ' Seluruh tagihan lunas.'
        const s = await getSettings(c)
        const short = await reenrollShortfall(c, r.id, s)
        const shortNote = short > 0 ? ` Pembayaran registrasi ulang kurang ${rpx(short)} dari minimal ${rpx(s.minReenroll ?? MIN_REENROLL_DEFAULT)}. Segera lunasi kekurangan ini.` : ''
        if (p.kind === 'registrasi_ulang') {
          await cq(c, "UPDATE registrations SET stage = 'aktif', status = 'active' WHERE id = ?", [r.id])
          await cq(c, 'INSERT IGNORE INTO grades (registration_id) VALUES (?)', [r.id])
          const nip = await issueNip(c, r)
          const nipNote = nip ? ` NIP Anda: ${nip}.` : ' NIP akan diterbitkan admin.'
          await notify(c, r.user_id, short > 0 ? 'Registrasi ulang diterima, pembayaran kurang' : 'Registrasi ulang dikonfirmasi', `Kwitansi ${receipt}, ${paid}.${adjNote} Anda resmi menjadi peserta didik.${nipNote}${shortNote}${over}${leftNote}${sisa}`, '/app')
        } else {
          await notify(c, r.user_id, short > 0 ? 'Cicilan diterima, registrasi ulang masih kurang' : 'Cicilan dikonfirmasi', `Kwitansi ${receipt}, ${paid}.${adjNote}${shortNote}${over}${leftNote}${sisa}`, '/app')
        }
      }
      await audit(c, ctx.user.id, 'pembayaran.setujui', 'payments', `${r.invoice_no} ${p.kind} Rp${p.amount_paid}${adjNote ? ' (nominal disesuaikan)' : ''}`)
    }),
  },

  /* ---------- keuangan: potongan biaya per pendaftar ---------- */
  /**
   * Beri atau ubah potongan untuk satu biaya pendaftar: 'pendaftaran', 'pelatihan', atau id biaya tambahan yang berlaku untuknya.
   * Satu potongan per biaya. Jadwal cicilan yang sudah ada langsung disesuaikan.
   */
  saveDiscount: {
    roles: ['super_admin', 'admin_keuangan'],
    fn: (ctx, regId, x) => tx((c) => changeDiscount(c, ctx, regId, String(x?.target ?? ''), x ?? {})),
  },
  deleteDiscount: {
    roles: ['super_admin', 'admin_keuangan'],
    fn: (ctx, regId, target) => tx((c) => changeDiscount(c, ctx, regId, String(target ?? ''), null)),
  },

  /* ---------- keuangan: peserta didik yang ditambahkan atau diimpor admin ---------- */
  /** Tetapkan paket pembayaran biaya registrasi (peserta impor tidak melewati tahap memilih paket sendiri). */
  setPlanAdmin: {
    roles: ['super_admin', 'admin_keuangan'],
    run: async (c, ctx, regId, planId) => {
      const r = await importedReg(c, regId)
      const [plan] = await cq(c, 'SELECT * FROM payment_plans WHERE id = ? AND is_active = 1 AND (program_id IS NULL OR program_id = ?)', [planId, r.program_id])
      if (!plan) fail('Paket pembayaran tidak tersedia untuk program ini.')
      const [{ n }] = await cq(c, "SELECT COUNT(*) n FROM payments WHERE registration_id = ? AND installment_id IS NOT NULL AND status IN ('verified','submitted')", [r.id])
      if (Number(n)) fail('Sudah ada pembayaran registrasi atau cicilan, jadi paket tidak bisa diganti. Batalkan dulu catatan pembayarannya bila memang perlu.')
      const [p] = await cq(c, 'SELECT price, title FROM programs WHERE id = ?', [r.program_id])
      const s = await getSettings(c)
      // Sama dengan pilihan paket oleh peserta: biaya program + biaya tambahan (biaya pendaftaran ditagih terpisah, tidak mengurangi).
      // Potongan yang diberikan keuangan ikut mengurangi total.
      const [{ extra }] = await cq(c, 'SELECT COALESCE(SUM(amount), 0) extra FROM fee_items WHERE is_active = 1 AND ((user_id IS NULL AND (program_id IS NULL OR program_id = ?)) OR user_id = ?)', [r.program_id, r.user_id])
      const total = Math.max(0, Number(p.price) + Number(extra) - await scheduleCredit(c, r, s))
      if (total <= 0) fail('Tidak ada biaya registrasi yang perlu dijadwalkan.')
      const today = new Date().toISOString().slice(0, 10)
      const sched = buildSchedule(total, plan, s.reenrollDue || today, s.pelunasanDue || s.reenrollDue || today)
      await cq(c, 'DELETE FROM installments WHERE registration_id = ?', [r.id])
      for (const x of sched) await cq(c, 'INSERT INTO installments (id, registration_id, seq, amount, due_date) VALUES (?,?,?,?,?)', [uid(), r.id, x.seq, x.amount, x.due])
      await cq(c, 'UPDATE registrations SET plan_id = ? WHERE id = ?', [plan.id, r.id])
      await syncGraduation(c, r.id)
      await notify(c, r.user_id, 'Tagihan biaya registrasi ditetapkan', `Bagian keuangan menetapkan paket ${plan.name} untuk biaya registrasi ${p.title} sebesar Rp${total.toLocaleString('id-ID')}. Lihat rinciannya di aplikasi.`, '/app')
      await audit(c, ctx.user.id, 'keuangan.paket-admin', 'registrations', `${r.code}: ${plan.name}, Rp${total}`)
    },
  },
  /** Catat pembayaran yang sudah diterima di luar aplikasi (langsung terverifikasi, tanpa bukti unggahan). */
  recordPayment: {
    roles: ['super_admin', 'admin_keuangan'],
    run: async (c, ctx, regId, x) => {
      const r = await importedReg(c, regId)
      const amount = num(x?.amount, 1, 1_000_000_000_000)
      const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x?.transferDate ?? '') || x.transferDate > today) fail('Tanggal bayar tidak valid atau di masa depan.')
      const s = await getSettings(c)
      let kind, inst = null, due
      if (x.kind === 'pendaftaran') {
        const [b] = r.batch_id ? await cq(c, 'SELECT code, free_reg_fee FROM batches WHERE id = ?', [r.batch_id]) : []
        if (b?.free_reg_fee) fail(`Angkatan ${b.code} dibebaskan dari biaya pendaftaran, jadi tidak perlu dicatat.`)
        const [ok] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'verified' LIMIT 1", [r.id])
        if (ok) fail('Biaya pendaftaran sudah tercatat lunas.')
        // Biaya pendaftaran terpisah dari cicilan biaya pelatihan, jadi boleh dicatat sebelum atau sesudah paket ditetapkan.
        kind = 'pendaftaran'; due = await regFeeDue(c, r, s)
        if (due <= 0) fail('Biaya pendaftaran peserta ini sudah dihapus seluruhnya lewat potongan, jadi tidak perlu dicatat.')
      } else {
        const insts = await cq(c, 'SELECT * FROM installments WHERE registration_id = ? ORDER BY seq FOR UPDATE', [r.id])
        if (!insts.length) fail('Tetapkan paket pembayaran biaya registrasi dulu.')
        inst = insts.find((i) => Number(i.paid_amount) < Number(i.amount))
        if (!inst) fail('Seluruh biaya registrasi sudah lunas.')
        const rest = await remainingTotal(c, r.id)
        if (amount > rest) fail(`Nominal melebihi sisa biaya registrasi (Rp${rest.toLocaleString('id-ID')}).`)
        kind = inst.seq === 1 ? 'registrasi_ulang' : 'cicilan'; due = Number(inst.amount) - Number(inst.paid_amount)
      }
      const id = uid()
      const receipt = `KWT-${new Date().toISOString().slice(0, 7).replace('-', '')}-${r.code.slice(-3)}-${id.slice(0, 4).toUpperCase()}`
      const note = str(x.note, 255, false) || 'Dicatat bagian keuangan'
      await cq(c, "INSERT INTO payments (id, registration_id, kind, installment_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, note) VALUES (?,?,?,?,?,?,?,?,'verified',?,?,?)",
        [id, r.id, kind, inst?.id ?? null, due, amount, str(x.payerName, 120, false) || 'Peserta', x.transferDate, receipt, ctx.user.id, note])
      if (inst) { await allocatePayment(c, { registration_id: r.id, installment_id: inst.id, amount_paid: amount }); await syncGraduation(c, r.id) }
      const label = kind === 'pendaftaran' ? 'biaya pendaftaran' : 'biaya registrasi'
      await notify(c, r.user_id, 'Pembayaran tercatat', `Pembayaran ${label} Rp${amount.toLocaleString('id-ID')} tanggal ${x.transferDate} sudah dicatat bagian keuangan. Kwitansi ${receipt}.`, '/app')
      await audit(c, ctx.user.id, 'keuangan.catat-bayar', 'payments', `${r.code} ${kind} Rp${amount}`)
      return { receipt }
    },
  },
  /**
   * Catat biaya pendaftaran yang sudah dibayar di luar aplikasi (mis. tunai di kantor) untuk pendaftar yang mendaftar sendiri.
   * Hanya biaya pendaftaran. Langsung terverifikasi, berkwitansi, dan membuka ujian tulis seperti bukti transfer yang disetujui.
   * Boleh dicatat sebelum data diri lengkap; tahap pembayaran kemudian dilewati (lihat afterProfileDone).
   */
  recordRegFee: {
    roles: ['super_admin', 'admin_keuangan'],
    run: async (c, ctx, regId, x) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId ?? ''])
      if (!r) fail('Pendaftar tidak ditemukan.', 404)
      // Peserta yang ditambahkan atau diimpor admin tidak melewati tahapan seleksi: pakai pencatatan peserta didik, khusus biaya pendaftaran.
      if (r.source === 'admin') {
        const [u] = await cq(c, 'SELECT name FROM users WHERE id = ?', [r.user_id])
        return actions.recordPayment.run(c, ctx, regId, { ...x, kind: 'pendaftaran', payerName: x?.payerName || u?.name })
      }
      if (!LIVE.includes(r.status)) fail('Pendaftaran ini sudah tidak berjalan (mundur atau kedaluwarsa).')
      if (!['data', 'bayar_daftar'].includes(r.stage)) fail('Biaya pendaftaran hanya bisa dicatat sebelum pendaftar masuk tahap ujian tulis.')
      const [b] = r.batch_id ? await cq(c, 'SELECT code, free_reg_fee FROM batches WHERE id = ?', [r.batch_id]) : []
      if (b?.free_reg_fee) fail(`Angkatan ${b.code} dibebaskan dari biaya pendaftaran, jadi tidak perlu dicatat.`)
      const [ok] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'verified' LIMIT 1", [r.id])
      if (ok) fail('Biaya pendaftaran sudah tercatat lunas.')
      const [pending] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'submitted' LIMIT 1", [r.id])
      if (pending) fail('Pendaftar sudah mengunggah bukti pembayaran pendaftaran. Setujui atau tolak bukti itu, jangan dicatat dua kali.')
      const amount = num(x?.amount, 1, 1_000_000_000_000)
      const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x?.transferDate ?? '') || x.transferDate > today) fail('Tanggal bayar tidak valid atau di masa depan.')
      const s = await getSettings(c)
      const due = await regFeeDue(c, r, s)
      if (due <= 0) fail('Biaya pendaftaran pendaftar ini sudah dihapus seluruhnya lewat potongan, jadi tidak perlu dicatat.')
      const id = uid()
      const receipt = `KWT-${new Date().toISOString().slice(0, 7).replace('-', '')}-${r.code.slice(-3)}-${id.slice(0, 4).toUpperCase()}`
      const note = str(x.note, 255, false) || 'Dicatat bagian keuangan'
      const [u] = await cq(c, 'SELECT name FROM users WHERE id = ?', [r.user_id])
      await cq(c, "INSERT INTO payments (id, registration_id, kind, installment_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, note) VALUES (?,?,'pendaftaran',NULL,?,?,?,?,'verified',?,?,?)",
        [id, r.id, due, amount, str(x.payerName, 120, false) || u?.name || 'Pendaftar', x.transferDate, receipt, ctx.user.id, note])
      const paid = 'Rp' + amount.toLocaleString('id-ID')
      if (r.stage === 'bayar_daftar') {
        await cq(c, "UPDATE registrations SET stage = 'ujian' WHERE id = ?", [r.id])
        await notify(c, r.user_id, 'Pembayaran pendaftaran tercatat', `Pembayaran biaya pendaftaran ${paid} tanggal ${x.transferDate} sudah dicatat bagian keuangan. Kwitansi ${receipt}. Ujian online kini terbuka. Buka menu Ujian online; token diberikan otomatis oleh sistem dan berlaku 1 hari.`, '/app/ujian')
      } else {
        await notify(c, r.user_id, 'Pembayaran pendaftaran tercatat', `Pembayaran biaya pendaftaran ${paid} tanggal ${x.transferDate} sudah dicatat bagian keuangan. Kwitansi ${receipt}. Lengkapi data diri; setelah itu Anda langsung bisa mengikuti ujian online tanpa membayar lagi.`, '/app/data-diri')
      }
      await audit(c, ctx.user.id, 'keuangan.catat-bayar', 'payments', `${r.code} pendaftaran Rp${amount}`)
      return { receipt }
    },
  },
  /** Batalkan catatan pembayaran yang dicatat keuangan (salah input). Alokasi ke cicilan dihitung ulang. */
  cancelManualPayment: {
    roles: ['super_admin', 'admin_keuangan'],
    run: async (c, ctx, paymentId, reason) => {
      const why = str(reason, 200)
      const [p] = await cq(c, 'SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId])
      if (!p || p.status !== 'verified' || p.proof_file_id || !p.note) fail('Hanya catatan pembayaran yang dicatat bagian keuangan yang bisa dibatalkan.')
      const [reg] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [p.registration_id])
      // Pendaftar yang mendaftar sendiri: hanya catatan biaya pendaftaran, dan hanya sebelum ujian tulis dikerjakan.
      if (reg && reg.source !== 'admin') {
        if (p.kind !== 'pendaftaran') fail('Hanya catatan biaya pendaftaran yang bisa dibatalkan di sini.')
        if (!['data', 'bayar_daftar', 'ujian'].includes(reg.stage)) fail('Pendaftar sudah melewati ujian tulis, jadi catatan biaya pendaftarannya tidak bisa dibatalkan lagi.')
        const [att] = await cq(c, 'SELECT id FROM exam_attempts WHERE registration_id = ? LIMIT 1', [reg.id])
        if (att) fail('Pendaftar sudah mulai mengerjakan ujian tulis, jadi catatan biaya pendaftarannya tidak bisa dibatalkan lagi.')
        await cq(c, "UPDATE payments SET status = 'rejected', reject_reason = ? WHERE id = ?", [`Dibatalkan keuangan: ${why}`, p.id])
        if (reg.stage === 'ujian') await cq(c, "UPDATE registrations SET stage = 'bayar_daftar' WHERE id = ?", [reg.id])
        await notify(c, reg.user_id, 'Catatan pembayaran pendaftaran dibatalkan', `Catatan pembayaran biaya pendaftaran Rp${Number(p.amount_paid).toLocaleString('id-ID')} (kwitansi ${p.receipt_no}) dibatalkan bagian keuangan. Alasan: ${why}`, '/app')
        await audit(c, ctx.user.id, 'keuangan.batal-catat', 'payments', `${reg.code} ${p.kind} Rp${p.amount_paid}: ${why}`)
        return
      }
      const r = await importedReg(c, p.registration_id)
      await cq(c, "UPDATE payments SET status = 'rejected', reject_reason = ? WHERE id = ?", [`Dibatalkan keuangan: ${why}`, p.id])
      await recomputeInstallments(c, r.id)
      await audit(c, ctx.user.id, 'keuangan.batal-catat', 'payments', `${r.code} ${p.kind} Rp${p.amount_paid}: ${why}`)
    },
  },

  rejectPayment: {
    roles: ['admin_keuangan', 'super_admin'],
    fn: (ctx, id, reason) => tx(async (c) => {
      const why = str(reason, 200)
      const [p] = await cq(c, "SELECT * FROM payments WHERE id = ? AND status = 'submitted' FOR UPDATE", [id])
      if (!p) fail('Pembayaran tidak dalam antrean.')
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [p.registration_id])
      await cq(c, "UPDATE payments SET status = 'rejected', reject_reason = ?, verified_by = ? WHERE id = ?", [why, ctx.user.id, id])
      if (p.installment_id) await cq(c, "UPDATE installments SET status = IF(paid_amount >= amount, 'paid', IF(paid_amount > 0, 'partial', 'unpaid')) WHERE id = ?", [p.installment_id])
      await notify(c, r.user_id, 'Pembayaran ditolak: unggah ulang bukti', `Alasan: ${why}`, '/app')
      await audit(c, ctx.user.id, 'pembayaran.tolak', 'payments', `${r.invoice_no}: ${why}`)
    }),
  },

  /* ---------- katalog ---------- */
  saveProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, p) => tx(async (c) => {
      const title = str(p.title, 160)
      const slug = str(p.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 160)
      const r = p.rules ?? {}
      const vals = [slug, title, str(p.category, 80), str(p.shortDesc, 255, false), str(p.description, 5000, false), num(p.durationHours, 1), num(p.price, 0), p.active ? 1 : 0,
        num(r.passingScore, 0, 100), num(r.minAttendance, 0, 100), digit(p.nipCode, 'Kode NIP program')]
      if (vals[vals.length - 1] != null) {
        const [dup] = await cq(c, 'SELECT title FROM programs WHERE nip_code = ? AND id <> ? AND deleted_at IS NULL', [vals[vals.length - 1], p.id])
        if (dup) fail(`Kode NIP ${vals[vals.length - 1]} sudah dipakai program ${dup.title}.`)
      }
      const [ex] = await cq(c, 'SELECT id FROM programs WHERE id = ?', [p.id])
      // Bobot nilai tidak diatur di program; hanya bobot dari Akademik (per mata pelajaran dan default) yang dipakai.
      if (ex) await cq(c, 'UPDATE programs SET slug=?, title=?, category=?, short_desc=?, description=?, duration_hours=?, price=?, is_active=?, passing_score=?, min_attendance=?, nip_code=? WHERE id = ?', [...vals, p.id])
      else await cq(c, 'INSERT INTO programs (slug, title, category, short_desc, description, duration_hours, price, is_active, passing_score, min_attendance, nip_code, id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [...vals, p.id || uid()])
      await audit(c, ctx.user.id, ex ? 'program.ubah' : 'program.buat', 'programs', title)
    }),
  },
  deleteProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ? FOR UPDATE', [id])
      if (!p) fail('Program tidak ditemukan.')
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM batches WHERE program_id = ?', [id])
      if (Number(n)) fail(`Program ini punya ${n} angkatan sehingga tidak bisa dihapus permanen. Gunakan Arsip agar riwayatnya tetap utuh.`)
      await cq(c, 'DELETE FROM programs WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'program.hapus', 'programs', p.title)
    }),
  },
  deleteBatch: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [id])
      if (!b) fail('Angkatan tidak ditemukan.')
      const [{ r }] = await cq(c, 'SELECT COUNT(*) r FROM registrations WHERE batch_id = ?', [id])
      if (Number(r)) fail(`Angkatan ini sudah punya ${r} pendaftaran sehingga tidak bisa dihapus. Ubah statusnya menjadi cancelled atau finished.`)
      const [{ s: ses }] = await cq(c, 'SELECT COUNT(*) s FROM class_sessions WHERE batch_id = ?', [id])
      const [{ a }] = await cq(c, 'SELECT COUNT(*) a FROM assignments WHERE batch_id = ?', [id])
      if (Number(ses) || Number(a)) fail('Angkatan ini sudah punya pertemuan atau tugas. Hapus dulu isinya, atau ubah statusnya menjadi cancelled.')
      await cq(c, 'DELETE FROM materials WHERE batch_id = ?', [id])
      await cq(c, 'DELETE FROM batches WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'batch.hapus', 'batches', b.code)
    }),
  },
  remindProfile: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, userId) => tx(async (c) => {
      const [u] = await cq(c, "SELECT u.* FROM users u WHERE u.id = ? AND u.role = 'peserta'", [userId])
      if (!u) fail('Peserta tidak ditemukan.')
      const [done] = await cq(c, 'SELECT user_id FROM participant_profiles WHERE user_id = ? AND completed_at IS NOT NULL', [userId])
      if (done) fail('Peserta ini sudah melengkapi data diri.')
      const [reg] = await cq(c, "SELECT id FROM registrations WHERE user_id = ? AND status IN ('active','completed') LIMIT 1", [userId])
      if (!reg) fail('Pengingat hanya untuk peserta yang pembayarannya sudah dikonfirmasi.')
      await mail(c, u.email, 'Lengkapi data diri Anda', `Halo ${u.name}, pembayaran Anda sudah dikonfirmasi. Lengkapi data diri di portal peserta (menu Data diri) agar kelas dapat dimulai.`)
      await audit(c, ctx.user.id, 'pengingat.data-diri', 'users', u.email)
    }),
  },
  archiveProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      await cq(c, 'UPDATE programs SET deleted_at = ?, is_active = 0 WHERE id = ?', [dt(), id])
      await audit(c, ctx.user.id, 'program.arsip', 'programs', id)
    }),
  },
  /** Kembalikan program dari arsip. Program kembali dalam keadaan nonaktif; admin mengaktifkan pendaftarannya lewat Ubah. */
  restoreProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ? FOR UPDATE', [id ?? ''])
      if (!p) fail('Program tidak ditemukan.', 404)
      if (!p.deleted_at) fail('Program ini tidak sedang diarsipkan.')
      if (p.nip_code != null) {
        const [dup] = await cq(c, 'SELECT title FROM programs WHERE nip_code = ? AND id <> ? AND deleted_at IS NULL', [p.nip_code, p.id])
        if (dup) fail(`Kode NIP ${p.nip_code} sudah dipakai program ${dup.title}. Ubah dulu kode NIP program itu, lalu kembalikan program ini.`)
      }
      await cq(c, 'UPDATE programs SET deleted_at = NULL, is_active = 0 WHERE id = ?', [p.id])
      await audit(c, ctx.user.id, 'program.kembalikan', 'programs', p.title)
    }),
  },
  saveBatch: {
    roles: ['admin_pendaftaran', 'akademik', 'super_admin'], // Akademik boleh menambah angkatan dari menu Jadwal
    fn: (ctx, b) => tx(async (c) => {
      if (!b.startDate || !b.endDate || b.endDate < b.startDate) fail('Tanggal selesai sebelum tanggal mulai.')
      if (!['draft', 'open', 'running', 'finished', 'cancelled'].includes(b.status)) fail('Status tidak valid.')
      // Instruktur, lokasi, dan jadwal diatur Akademik lewat Jadwal pembelajaran (saveJadwal).
      const [ex] = await cq(c, 'SELECT id, curriculum_id FROM batches WHERE id = ? FOR UPDATE', [b.id ?? ''])
      const cur = await batchCurriculum(c, b.programId, b.curriculumId, ex)
      const vals = [b.programId, str(b.code, 40), b.startDate, b.endDate, num(b.quota, 1), b.status, digit(b.angkatan, 'Angkatan'), b.freeRegFee ? 1 : 0, cur]
      if (ex) await cq(c, 'UPDATE batches SET program_id=?, code=?, start_date=?, end_date=?, quota=?, status=?, angkatan=?, free_reg_fee=?, curriculum_id=? WHERE id = ?', [...vals, b.id])
      else await cq(c, 'INSERT INTO batches (program_id, code, start_date, end_date, quota, status, angkatan, free_reg_fee, curriculum_id, id) VALUES (?,?,?,?,?,?,?,?,?,?)', [...vals, b.id || uid()])
      await audit(c, ctx.user.id, ex ? 'batch.ubah' : 'batch.buat', 'batches', b.code)
    }),
  },

  /* ---------- pembelajaran ---------- */
  /* Akademik menetapkan jadwal angkatan; instruktur mengisi pertemuan dan materinya. */
  /** Akademik menetapkan kurikulum yang dipakai satu angkatan (menu Jadwal pembelajaran). */
  setBatchCurriculum: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, batchId, curriculumId) => tx(async (c) => {
      const [b] = await cq(c, 'SELECT id, code, program_id, curriculum_id FROM batches WHERE id = ? FOR UPDATE', [batchId ?? ''])
      if (!b) fail('Angkatan tidak ditemukan.')
      if (!curriculumId) fail('Pilih kurikulum.')
      const cur = await batchCurriculum(c, b.program_id, curriculumId, b, true)
      await cq(c, 'UPDATE batches SET curriculum_id = ? WHERE id = ?', [cur, b.id])
      const [{ name }] = await cq(c, 'SELECT name FROM curricula WHERE id = ?', [cur])
      await audit(c, ctx.user.id, 'batch.kurikulum', 'batches', `${b.code}: ${name}`)
    }),
  },

  /* Kurikulum pelatihan: wadah mata pelajaran. Satu pelatihan bisa punya beberapa kurikulum; tiap angkatan memakai satu. */
  saveCurriculum: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, x) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT id FROM programs WHERE id = ? AND deleted_at IS NULL', [x.programId ?? ''])
      if (!p) fail('Pilih pelatihan.')
      const name = str(x.name, 120)
      const [ex] = x.id ? await cq(c, 'SELECT * FROM curricula WHERE id = ? FOR UPDATE', [x.id]) : []
      if (ex && ex.program_id !== p.id) fail('Kurikulum tidak bisa dipindah ke pelatihan lain.')
      const [dup] = await cq(c, 'SELECT id FROM curricula WHERE program_id = ? AND LOWER(name) = LOWER(?) AND id <> ?', [p.id, name, x.id ?? ''])
      if (dup) fail('Kurikulum dengan nama itu sudah ada di pelatihan ini.')
      const vals = [name, str(x.description, 255, false), x.active === false ? 0 : 1]
      const id = ex ? ex.id : x.id || uid()
      if (ex) await cq(c, 'UPDATE curricula SET name = ?, description = ?, is_active = ? WHERE id = ?', [...vals, id])
      else {
        await cq(c, 'INSERT INTO curricula (name, description, is_active, id, program_id) VALUES (?,?,?,?,?)', [...vals, id, p.id])
        // Kurikulum baru boleh disalin dari kurikulum lain di pelatihan yang sama, lalu diubah seperlunya.
        if (x.copyFrom) {
          const [src] = await cq(c, 'SELECT id FROM curricula WHERE id = ? AND program_id = ?', [x.copyFrom, p.id])
          if (!src) fail('Kurikulum sumber tidak ditemukan di pelatihan ini.')
          await cq(c, `INSERT INTO subjects (id, program_id, curriculum_id, code, name, kind, hours, hours_per_meeting, meetings, description, is_active)
            SELECT UUID(), program_id, ?, code, name, kind, hours, hours_per_meeting, meetings, description, is_active FROM subjects WHERE curriculum_id = ?`, [id, src.id])
        }
      }
      await audit(c, ctx.user.id, ex ? 'kurikulum.ubah' : 'kurikulum.tambah', 'curricula', name)
      return { id }
    }),
  },
  /** Hapus kurikulum beserta mata pelajarannya. Hanya bila belum dipakai angkatan mana pun. */
  deleteCurriculum: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [cur] = await cq(c, 'SELECT * FROM curricula WHERE id = ? FOR UPDATE', [id ?? ''])
      if (!cur) fail('Kurikulum tidak ditemukan.')
      const used = await cq(c, 'SELECT code FROM batches WHERE curriculum_id = ?', [cur.id])
      if (used.length) fail(`Kurikulum ini dipakai angkatan ${used.map((b) => b.code).join(', ')}. Ganti kurikulum angkatan itu dulu, atau nonaktifkan kurikulum ini.`)
      const [{ n }] = await cq(c, `SELECT (SELECT COUNT(*) FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE sj.curriculum_id = ?)
        + (SELECT COUNT(*) FROM class_sessions cs JOIN subjects sj ON sj.id = cs.subject_id WHERE sj.curriculum_id = ?) n`, [cur.id, cur.id])
      if (Number(n)) fail('Mata pelajaran kurikulum ini sudah dipakai di jadwal, jadi kurikulumnya tidak bisa dihapus. Nonaktifkan saja.')
      await cq(c, 'DELETE FROM subjects WHERE curriculum_id = ?', [cur.id])
      await cq(c, 'DELETE FROM curricula WHERE id = ?', [cur.id])
      await audit(c, ctx.user.id, 'kurikulum.hapus', 'curricula', cur.name)
    }),
  },

  /* Bank mata pelajaran per kurikulum pelatihan (Akademik). */
  saveSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, x) => tx(async (c) => {
      // Setiap mata pelajaran milik satu kurikulum pelatihan. Kelas gabungan tidak lagi dibuat di bank, tetapi diatur di Jadwal pembelajaran.
      const pid = x.programId || null
      if (!pid) fail('Pilih pelatihan dan kurikulum. Kelas gabungan diatur di menu Jadwal pembelajaran.')
      { const [p] = await cq(c, 'SELECT id FROM programs WHERE id = ? AND deleted_at IS NULL', [pid]); if (!p) fail('Pilih pelatihan.') }
      const [cur] = pid ? await cq(c, 'SELECT id FROM curricula WHERE id = ? AND program_id = ?', [x.curriculumId ?? '', pid]) : []
      if (pid && !cur) fail('Pilih kurikulum pelatihan.')
      const cid = cur?.id ?? null
      const v = cleanSubject(x)
      const [ex] = x.id ? await cq(c, 'SELECT * FROM subjects WHERE id = ? FOR UPDATE', [x.id]) : []
      if (ex && (ex.program_id ?? null) !== pid) fail('Mata pelajaran tidak bisa dipindah ke pelatihan lain.')
      if (ex && (ex.curriculum_id ?? null) !== cid) fail('Mata pelajaran tidak bisa dipindah ke kurikulum lain.')
      const [dup] = await cq(c, `SELECT id FROM subjects WHERE ${cid ? 'curriculum_id = ?' : 'program_id IS NULL'} AND LOWER(name) = LOWER(?) AND id <> ?`, [...(cid ? [cid] : []), v.name, x.id ?? ''])
      if (dup) fail(pid ? 'Mata pelajaran dengan nama itu sudah ada di kurikulum ini.' : 'Kelas gabungan dengan nama itu sudah ada.')
      const vals = [pid, cid, v.code, v.name, v.kind, v.hours, v.hoursPerMeeting, v.meetings, v.description, x.active === false ? 0 : 1]
      if (ex) await cq(c, 'UPDATE subjects SET program_id=?, curriculum_id=?, code=?, name=?, kind=?, hours=?, hours_per_meeting=?, meetings=?, description=?, is_active=? WHERE id = ?', [...vals, x.id])
      else await cq(c, 'INSERT INTO subjects (program_id, curriculum_id, code, name, kind, hours, hours_per_meeting, meetings, description, is_active, id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...vals, x.id || uid()])
      if (ex) await syncMeetings(c, ex.id, v.meetings)
      await audit(c, ctx.user.id, ex ? 'mapel.ubah' : 'mapel.tambah', 'subjects', v.name)
    }),
  },
  /** Impor banyak mata pelajaran dari spreadsheet ke kurikulum pilihan. Nama yang sama di kurikulum yang sama diperbarui bila diminta, selain itu dilewati. */
  importSubjects: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, items, updateExisting) => tx(async (c) => {
      if (!Array.isArray(items) || !items.length) fail('Tidak ada mata pelajaran untuk diimpor.')
      if (items.length > 300) fail('Maksimal 300 mata pelajaran sekali impor.')
      const out = { added: 0, updated: 0, skipped: 0 }
      const curs = new Map()
      for (const x of items) {
        if (x.shared) fail('Kelas gabungan tidak lagi diimpor ke bank mata pelajaran. Impor ke kurikulum tiap pelatihan, lalu atur kelas gabungannya di Jadwal pembelajaran.')
        const pid = x.shared ? null : String(x.programId ?? '')
        const cid = x.shared ? null : String(x.curriculumId ?? '')
        const key = `${pid}/${cid}`
        if (pid && !curs.has(key)) curs.set(key, (await cq(c, 'SELECT cu.id FROM curricula cu JOIN programs p ON p.id = cu.program_id WHERE cu.id = ? AND p.id = ? AND p.deleted_at IS NULL', [cid, pid]))[0] ?? null)
        if (pid && !curs.get(key)) fail('Ada bagian yang belum dipetakan ke pelatihan dan kurikulum yang valid.')
        const v = cleanSubject(x)
        const [ex] = await cq(c, `SELECT id FROM subjects WHERE ${cid ? 'curriculum_id = ?' : 'program_id IS NULL'} AND LOWER(name) = LOWER(?) FOR UPDATE`, [...(cid ? [cid] : []), v.name])
        if (ex) {
          if (!updateExisting) { out.skipped++; continue }
          await cq(c, 'UPDATE subjects SET code=?, kind=?, hours=?, hours_per_meeting=?, meetings=?, description=? WHERE id = ?', [v.code, v.kind, v.hours, v.hoursPerMeeting, v.meetings, v.description, ex.id])
          await syncMeetings(c, ex.id, v.meetings)
          out.updated++
        } else {
          await cq(c, 'INSERT INTO subjects (id, program_id, curriculum_id, code, name, kind, hours, hours_per_meeting, meetings, description) VALUES (?,?,?,?,?,?,?,?,?,?)', [uid(), pid, cid, v.code, v.name, v.kind, v.hours, v.hoursPerMeeting, v.meetings, v.description])
          out.added++
        }
      }
      await audit(c, ctx.user.id, 'mapel.impor', 'subjects', `${out.added} baru, ${out.updated} diperbarui, ${out.skipped} dilewati`)
      return out
    }),
  },
  deleteSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [sj] = await cq(c, 'SELECT * FROM subjects WHERE id = ? FOR UPDATE', [id])
      if (!sj) fail('Mata pelajaran tidak ditemukan.')
      const [{ n }] = await cq(c, 'SELECT (SELECT COUNT(*) FROM batch_subjects WHERE subject_id = ?) + (SELECT COUNT(*) FROM class_sessions WHERE subject_id = ?) n', [id, id])
      if (Number(n)) fail('Mata pelajaran ini sudah dipakai di jadwal angkatan, jadi tidak bisa dihapus. Nonaktifkan saja agar tidak muncul lagi di pilihan.')
      await cq(c, 'DELETE FROM subjects WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'mapel.hapus', 'subjects', sj.name)
    }),
  },

  /*
   * Jadwal pembelajaran: satu jadwal = satu mata pelajaran di satu angkatan, dengan instruktur, hari, jam, ruang kelas,
   * dan jumlah pertemuannya sendiri. Mata pelajaran kelas gabungan bisa sekaligus dijadwalkan di angkatan semua program
   * (satu grup: instruktur, hari, jam, dan ruang yang sama).
   */
  saveJadwal: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, x) => tx(async (c) => {
      const r = await upsertJadwal(c, x)
      await audit(c, ctx.user.id, r.existed ? 'jadwal.ubah' : 'jadwal.tambah', 'batch_subjects', r.summary)
    }),
  },
  /**
   * Hapus permanen satu pendaftar atau peserta didik: akun beserta seluruh datanya (registrasi, pembayaran, cicilan, nilai,
   * absensi, tugas, penempatan, berkas). Untuk yang mengundurkan diri, gunakan Mundur agar rekapnya tetap ada.
   */
  deletePeserta: {
    roles: ['super_admin', 'admin_pendaftaran'],
    fn: async (ctx, userId) => {
      const stored = await tx((c) => removePeserta(c, ctx.user, userId))
      for (const name of stored) await fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {}) // berkas fisik dihapus setelah commit
    },
  },
  /** Impor jadwal dari Excel. Tiap baris diproses di transaksinya sendiri; baris yang ada akan diperbarui. */
  importJadwal: {
    roles: ['akademik', 'super_admin'],
    fn: async (ctx, rows) => {
      if (!Array.isArray(rows) || !rows.length) fail('Tidak ada baris untuk diimpor.')
      if (rows.length > 500) fail('Maksimal 500 baris sekali impor.')
      const results = []
      for (const [i, x] of rows.entries()) {
        try {
          const r = await tx((c) => upsertJadwal(c, { ...x, editing: true, overwrite: true })) // impor = tambah atau perbarui
          results.push({ row: x.row ?? i + 1, ok: true, existed: r.existed })
        } catch (e) {
          if (!(e instanceof HttpError)) throw e
          results.push({ row: x.row ?? i + 1, ok: false, error: e.message })
        }
      }
      await tx((c) => audit(c, ctx.user.id, 'jadwal.impor', 'batch_subjects', `${results.filter((r) => r.ok).length} dari ${rows.length} baris berhasil`))
      return results
    },
  },
  /** Hapus jadwal. Untuk kelas gabungan, all = hapus dari semua angkatan di grupnya. */
  deleteJadwal: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, batchId, subjectId, all) => tx(async (c) => {
      const [bs] = await cq(c, 'SELECT bs.*, b.code, sj.name FROM batch_subjects bs JOIN batches b ON b.id = bs.batch_id JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ? FOR UPDATE', [batchId, subjectId])
      if (!bs) fail('Jadwal tidak ditemukan.')
      // Anggota kelas gabungan bisa memakai mata pelajaran dari kurikulumnya sendiri, jadi tiap baris dihapus dengan subject_id-nya.
      const targets = all && bs.group_id ? await cq(c, 'SELECT bs.batch_id, bs.subject_id, b.code FROM batch_subjects bs JOIN batches b ON b.id = bs.batch_id WHERE bs.group_id = ? FOR UPDATE', [bs.group_id]) : [{ batch_id: batchId, subject_id: subjectId, code: bs.code }]
      for (const t of targets) {
        const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM class_sessions WHERE batch_id = ? AND subject_id = ?', [t.batch_id, t.subject_id])
        if (Number(n)) fail(`"${bs.name}" di angkatan ${t.code} sudah punya ${n} pertemuan sehingga jadwalnya tidak bisa dihapus.`)
        await cq(c, 'DELETE FROM batch_subjects WHERE batch_id = ? AND subject_id = ?', [t.batch_id, t.subject_id])
        await refreshBatchSummary(c, t.batch_id)
      }
      // Grup yang tersisa satu angkatan bukan lagi kelas gabungan.
      if (bs.group_id) {
        const left = await cq(c, 'SELECT batch_id FROM batch_subjects WHERE group_id = ?', [bs.group_id])
        if (left.length === 1) await cq(c, 'UPDATE batch_subjects SET group_id = NULL WHERE group_id = ?', [bs.group_id])
      }
      await audit(c, ctx.user.id, 'jadwal.hapus', 'batch_subjects', `${bs.name}: ${targets.map((t) => t.code).join(', ')}`)
    }),
  },
  savePertemuan: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, p) => tx(async (c) => {
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [p.batchId])
      if (!b) fail('Angkatan tidak ditemukan.')
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ?', [p.batchId, p.subjectId ?? ''])
      if (!bs) fail('Pilih mata pelajaran dari jadwal angkatan ini.')
      assertTeaches(ctx.user, b, bs)
      if (!bs.start_time) fail(`Akademik belum menetapkan hari dan jam untuk "${bs.name}".`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '')) fail('Tanggal pertemuan tidak valid.')
      if (p.date < b.start_date || p.date > b.end_date) fail(`Tanggal harus di antara ${b.start_date} dan ${b.end_date}.`)
      const startAt = new Date(`${p.date}T${hm(bs.start_time)}:00+07:00`) // jam kelas mata pelajaran ini, dalam WIB
      if (p.meetingUrl && !/^https:\/\//.test(p.meetingUrl)) fail('Tautan pertemuan online harus diawali https://.')
      const [ex] = p.id ? await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [p.id]) : []
      if (ex && ex.batch_id !== p.batchId) fail('Pertemuan bukan milik angkatan ini.', 403)
      if (ex) await assertOwnSession(c, ctx.user, ex)
      // Instruktur tidak bisa menambah pertemuan baru selama masih ada pertemuan sebelumnya yang absensinya belum diisi.
      if (!ex && ctx.user.role === 'instruktur') {
        const pend = await unattendedSessions(c, ctx.user.id, p.batchId, null)
        if (pend.length) {
          const list = pend.slice(0, 3).map((x) => `${x.subject ?? 'Pertemuan'}: ${x.title}`).join('; ')
          fail(`Isi absensi peserta didik dulu sebelum menambah pertemuan baru. Belum diabsen (${pend.length}): ${list}${pend.length > 3 ? ', dan lainnya' : ''}. Buka menu Absensi.`, 409)
        }
      }
      if (!ex || ex.subject_id !== p.subjectId) {
        const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM class_sessions WHERE batch_id = ? AND subject_id = ?', [p.batchId, p.subjectId])
        if (Number(n) >= bs.sessions_planned) fail(`Jatah pertemuan "${bs.name}" sudah penuh (${bs.sessions_planned}). Minta Akademik menambah jumlah pertemuannya bila perlu.`)
      }
      const vals = [p.batchId, p.subjectId, str(p.title, 160), startAt, bs.room || b.location, p.meetingUrl || null]
      if (ex) await cq(c, 'UPDATE class_sessions SET batch_id=?, subject_id=?, title=?, start_at=?, location=?, meeting_url=? WHERE id = ?', [...vals, p.id])
      else await cq(c, 'INSERT INTO class_sessions (batch_id, subject_id, title, start_at, location, meeting_url, id) VALUES (?,?,?,?,?,?,?)', [...vals, p.id || uid()])
      await audit(c, ctx.user.id, ex ? 'pertemuan.ubah' : 'pertemuan.tambah', 'class_sessions', `${b.code} ${bs.name}: ${p.title}`)
    }),
  },
  deletePertemuan: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [s] = await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [id])
      if (!s) fail('Pertemuan tidak ditemukan.')
      await assertOwnSession(c, ctx.user, s)
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM attendances WHERE session_id = ?', [id])
      if (Number(n)) fail('Pertemuan sudah punya data absensi dan tidak dapat dihapus.')
      await cq(c, 'DELETE FROM class_sessions WHERE id = ?', [id]) // materi pertemuan ikut terhapus (ON DELETE CASCADE)
      await audit(c, ctx.user.id, 'pertemuan.hapus', 'class_sessions', s.title)
    }),
  },
  saveMaterialLink: {
    roles: ['instruktur', 'akademik', 'super_admin'],
    fn: (ctx, m) => tx(async (c) => {
      if (!m.url || !/^https:\/\//.test(m.url)) fail('Tautan harus diawali https://.')
      const [ses] = await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [m.sessionId])
      if (!ses) fail('Pilih pertemuan untuk materi ini.')
      await assertOwnSession(c, ctx.user, ses)
      await cq(c, 'INSERT INTO materials (id, batch_id, session_id, title, kind, url) VALUES (?,?,?,?,?,?)', [uid(), ses.batch_id, ses.id, str(m.title, 160), 'Tautan', m.url])
      await audit(c, ctx.user.id, 'materi.tambah', 'materials', m.title)
    }),
  },
  deleteMaterial: {
    roles: ['instruktur', 'akademik', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [m] = await cq(c, 'SELECT * FROM materials WHERE id = ?', [id])
      if (!m) fail('Materi tidak ditemukan.')
      const [ses] = m.session_id ? await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [m.session_id]) : []
      if (ses) await assertOwnSession(c, ctx.user, ses)
      else await assertOwnBatch(c, ctx.user, m.batch_id)
      await cq(c, 'DELETE FROM materials WHERE id = ?', [id])
    }),
  },
  saveAssignment: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, a) => tx(async (c) => {
      await assertOwnBatch(c, ctx.user, a.batchId)
      // Tugas melekat pada satu mata pelajaran di jadwal angkatan; instruktur hanya untuk mata pelajaran yang ia ampu.
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ?', [a.batchId])
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ?', [a.batchId, a.subjectId ?? ''])
      if (!bs) fail('Pilih mata pelajaran tugas ini dari jadwal angkatan.')
      assertTeaches(ctx.user, b, bs)
      await cq(c, 'INSERT INTO assignments (id, batch_id, subject_id, title, description, due_at) VALUES (?,?,?,?,?,?)', [uid(), a.batchId, bs.subject_id, str(a.title, 160), str(a.description, 2000, false), dt(a.dueAt)])
      await audit(c, ctx.user.id, 'tugas.buat', 'assignments', a.title)
    }),
  },
  gradeSubmission: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, id, score, feedback) => tx(async (c) => {
      const [s] = await cq(c, 'SELECT s.*, a.batch_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?', [id])
      if (!s) fail('Pengumpulan tidak ditemukan.')
      await assertOwnBatch(c, ctx.user, s.batch_id)
      await cq(c, 'UPDATE submissions SET score = ?, feedback = ? WHERE id = ?', [num(score, 0, 100), str(feedback, 500, false), id])
    }),
  },
  /** Absensi per pertemuan. Sekali diisi, instruktur tidak bisa mengubahnya; perubahan hanya oleh Akademik atau Super Admin. */
  saveAttendance: {
    roles: ['instruktur', 'akademik', 'super_admin'],
    fn: (ctx, sessionId, marks) => tx(async (c) => {
      const [s] = await cq(c, 'SELECT * FROM class_sessions WHERE id = ? FOR UPDATE', [sessionId]) // dikunci: dua simpanan bersamaan tidak lolos dari cek di bawah
      if (!s) fail('Sesi tidak ditemukan.')
      await assertOwnSession(c, ctx.user, s)
      const [{ n: filled }] = await cq(c, 'SELECT COUNT(*) n FROM attendances WHERE session_id = ?', [sessionId])
      if (ctx.user.role === 'instruktur' && Number(filled)) fail('Absensi pertemuan ini sudah diisi dan terkunci. Perubahan hanya dapat dilakukan Admin Akademik atau Super Admin.', 403)
      const accepted = []
      for (const [regId, status] of Object.entries(marks ?? {})) {
        if (!['hadir', 'izin', 'sakit', 'alpa'].includes(status)) fail('Status kehadiran tidak valid.')
        const [r] = await cq(c, "SELECT id FROM registrations WHERE id = ? AND batch_id = ? AND status = 'active'", [regId, s.batch_id])
        if (!r) continue
        accepted.push(regId)
        await cq(c, 'INSERT INTO attendances (session_id, registration_id, status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status = VALUES(status)', [sessionId, regId, status])
      }
      // Persentase hadir di menu Nilai terisi otomatis dari rekap absensi seluruh pertemuan yang sudah diabsen (semua peserta aktif di angkatan).
      if (accepted.length) await recalcAttendancePct(c, s.batch_id)
      await audit(c, ctx.user.id, Number(filled) ? 'absensi.ubah' : 'absensi.simpan', 'attendances', s.title)
    }),
  },

  /* ---------- nilai dan sertifikat ---------- */
  saveGrade: {
    roles: ['instruktur'], // hanya angkatan lama tanpa jadwal mata pelajaran
    fn: (ctx, regId, patch) => tx(async (c) => {
      const g = await ownedGrade(c, ctx.user, regId)
      await failIfSubjectBased(c, regId)
      if (g.status !== 'draft') fail('Nilai sudah dikirim dan terkunci.')
      const set = []; const vals = []
      // Kehadiran (attendancePct) tidak bisa diisi manual: dihitung otomatis dari rekap absensi.
      for (const [k, col] of [['theory', 'theory'], ['practical', 'practical']]) {
        if (patch[k] !== undefined) { set.push(`${col} = ?`); vals.push(num(patch[k], 0, 100)) }
      }
      if (set.length) await cq(c, `UPDATE grades SET ${set.join(', ')} WHERE registration_id = ?`, [...vals, regId])
    }),
  },
  /**
   * Nilai teori dan praktik satu peserta di satu mata pelajaran. Hanya pengampu mata pelajaran itu (atau Akademik dan super admin) yang boleh mengisi.
   * Nilai teori dan praktik program (grades) ikut dihitung sebagai rata-rata seluruh mata pelajaran, jadi alur kirim dan validasi tidak berubah.
   * Kosong (null) = belum diisi.
   */
  saveSubjectGrade: {
    roles: ['instruktur'], // semua nilai diinput instruktur pengampu; Super Admin memakai fitur masuk sebagai instruktur
    fn: (ctx, regId, subjectId, patch) => tx(async (c) => {
      const g = await ownedGrade(c, ctx.user, regId)
      if (g.status !== 'draft') fail('Nilai sudah divalidasi dan terkunci.')
      const [lock] = await cq(c, 'SELECT status FROM subject_grades WHERE registration_id = ? AND subject_id = ?', [regId, subjectId ?? ''])
      if (lock && lock.status !== 'draft') fail('Nilai mata pelajaran ini sudah disetor ke Akademik dan terkunci. Minta Akademik mengembalikannya bila perlu diperbaiki.')
      const [reg] = await cq(c, 'SELECT batch_id FROM registrations WHERE id = ?', [regId])
      const [bs] = reg?.batch_id ? await cq(c, 'SELECT * FROM batch_subjects WHERE batch_id = ? AND subject_id = ?', [reg.batch_id, subjectId ?? '']) : []
      if (!bs) fail('Mata pelajaran ini tidak ada di jadwal angkatan peserta.')
      assertTeaches(ctx.user, null, bs)
      const [sj] = await cq(c, 'SELECT kind, name FROM subjects WHERE id = ?', [subjectId])
      // Instruktur baru boleh mengisi nilai setelah seluruh pertemuan mata pelajaran dibuat dan semuanya sudah diabsen.
      if (ctx.user.role === 'instruktur') {
        const [{ n, belum }] = await cq(c, `SELECT COUNT(*) n, SUM(NOT EXISTS (SELECT 1 FROM attendances a WHERE a.session_id = cs.id)) belum
          FROM class_sessions cs WHERE cs.batch_id = ? AND cs.subject_id = ?`, [reg.batch_id, subjectId])
        if (Number(n) < Number(bs.sessions_planned)) fail(`Nilai ${sj.name} belum bisa diisi: baru ${n} dari ${bs.sessions_planned} pertemuan dibuat.`)
        if (Number(belum)) fail(`Nilai ${sj.name} belum bisa diisi: ${belum} pertemuan belum diisi absensinya.`)
      }
      const vals = {}
      for (const k of ['task', 'theory', 'practical']) {
        if (patch?.[k] === undefined) continue
        // Semua jenis mata pelajaran menilai tugas, teori, dan praktik (mapel teori tetap bisa punya penilaian praktik, mis. Bahasa Inggris).
        vals[k] = patch[k] === null || patch[k] === '' ? null : num(patch[k], 0, 100)
      }
      const cols = Object.keys(vals)
      if (!cols.length) return
      await cq(c, `INSERT INTO subject_grades (registration_id, subject_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})
        ON DUPLICATE KEY UPDATE ${cols.map((k) => `${k} = VALUES(${k})`).join(', ')}`, [regId, subjectId, ...cols.map((k) => vals[k])])
      // Rata-rata nilai mata pelajaran yang sudah diisi menjadi nilai teori dan praktik program.
      const [avg] = await cq(c, `SELECT AVG(sg.theory) t, AVG(sg.practical) p FROM subject_grades sg
        JOIN batch_subjects b2 ON b2.batch_id = ? AND b2.subject_id = sg.subject_id WHERE sg.registration_id = ?`, [reg.batch_id, regId])
      await cq(c, 'UPDATE grades SET theory = ROUND(?, 1), practical = ROUND(?, 1) WHERE registration_id = ?', [Number(avg?.t ?? 0), Number(avg?.p ?? 0), regId])
      await syncFinal(c, reg.batch_id, regId) // nilai akhir program = rata-rata nilai akhir semua mata pelajaran
    }),
  },
  /**
   * Bobot nilai satu mata pelajaran di satu angkatan (absensi, tugas, teori, praktik; jumlah 100%). Diatur instruktur pengampu atau Akademik.
   * reset = kembali ke bobot default dari Akademik. Terkunci setelah ada nilai peserta yang dikirim atau divalidasi di angkatan itu.
   */
  setSubjectWeights: {
    roles: ['akademik', 'super_admin'], // bobot ditentukan Akademik; instruktur hanya memakainya
    fn: (ctx, batchId, subjectId, w, reset) => tx(async (c) => {
      await assertOwnBatch(c, ctx.user, batchId)
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [batchId])
      const [bs] = await cq(c, 'SELECT bs.*, sj.name, sj.kind FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ? FOR UPDATE', [batchId, subjectId ?? ''])
      if (!bs) fail('Mata pelajaran tidak ada di jadwal angkatan ini.')
      assertTeaches(ctx.user, b, bs)
      const [st] = await cq(c, "SELECT COUNT(*) n FROM grades g JOIN registrations r ON r.id = g.registration_id WHERE r.batch_id = ? AND g.status <> 'draft'", [batchId])
      if (Number(st.n)) fail('Angkatan ini sudah punya nilai yang dikirim atau divalidasi, jadi bobot tidak bisa diubah. Minta Akademik mengembalikan nilainya ke draf.')
      let v = [null, null, null, null]
      if (!reset) {
        const x = { absensi: Number(w?.absensi), tugas: Number(w?.tugas), teori: Number(w?.teori), praktik: Number(w?.praktik) }
        if (!validWeights(x)) fail('Bobot harus bilangan bulat 0 sampai 100 dan jumlahnya 100%.')
        // Bobot keempat komponen bebas untuk semua jenis mata pelajaran.
        v = [x.absensi, x.tugas, x.teori, x.praktik]
      }
      await cq(c, 'UPDATE batch_subjects SET w_absensi = ?, w_tugas = ?, w_teori = ?, w_praktik = ? WHERE batch_id = ? AND subject_id = ?', [...v, batchId, subjectId])
      await syncFinal(c, batchId)
      await audit(c, ctx.user.id, 'nilai.bobot-mapel', 'batch_subjects', `${b.code} ${bs.name}: ${reset ? 'kembali ke default' : `absensi ${v[0]}%, tugas ${v[1]}%, teori ${v[2]}%, praktik ${v[3]}%`}`)
    }),
  },
  /**
   * Akademik menetapkan batas bawah nilai huruf A, AB, B, BC, C, CD, D (E = di bawah batas D) untuk seluruh mata pelajaran.
   * Batas harus turun ketat dan antara 0 sampai 100. Hanya memengaruhi tampilan huruf, bukan lulus atau tidak.
   */
  setGradeLetters: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, batas) => tx(async (c) => {
      const b = Array.isArray(batas) ? batas.map((v) => Math.round(Number(v) * 10) / 10) : []
      if (b.length !== 7 || !b.every((v, i) => Number.isFinite(v) && v > 0 && v <= 100 && (i === 0 || v < b[i - 1]))) fail('Batas nilai huruf harus 7 angka antara 0 sampai 100 yang menurun dari A sampai D.')
      await cq(c, "INSERT INTO settings (k, v) VALUES ('grade_letters', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(b)])
      await audit(c, ctx.user.id, 'nilai.huruf', 'settings', `A ${b[0]}, AB ${b[1]}, B ${b[2]}, BC ${b[3]}, C ${b[4]}, CD ${b[5]}, D ${b[6]}`)
    }),
  },
  /** Akademik menetapkan bobot default (absensi, tugas, teori, praktik) untuk semua mata pelajaran yang bobotnya belum diatur sendiri. */
  setDefaultGradeWeights: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, w) => tx(async (c) => {
      const x = { absensi: Number(w?.absensi), tugas: Number(w?.tugas), teori: Number(w?.teori), praktik: Number(w?.praktik) }
      if (!validWeights(x)) fail('Bobot harus bilangan bulat 0 sampai 100 dan jumlahnya 100%.')
      const [locked] = await cq(c, `SELECT b.code FROM batch_subjects bs JOIN batches b ON b.id = bs.batch_id JOIN registrations r ON r.batch_id = b.id JOIN grades g ON g.registration_id = r.id
        WHERE bs.w_absensi IS NULL AND g.status <> 'draft' LIMIT 1`)
      if (locked) fail(`Angkatan ${locked.code} memakai bobot default dan sudah punya nilai yang dikirim atau divalidasi, jadi bobot default tidak bisa diubah. Kembalikan nilainya ke draf atau atur bobot per mata pelajaran.`)
      await cq(c, "INSERT INTO settings (k, v) VALUES ('grade_weights', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(x)])
      for (const { id } of await cq(c, 'SELECT DISTINCT batch_id id FROM batch_subjects')) await syncFinal(c, id)
      await audit(c, ctx.user.id, 'nilai.bobot-default', 'settings', `absensi ${x.absensi}%, tugas ${x.tugas}%, teori ${x.teori}%, praktik ${x.praktik}%`)
    }),
  },
  /**
   * Instruktur menyetor nilai satu mata pelajaran (seluruh peserta aktif) ke Akademik. Syarat: semua pertemuan sudah dibuat dan diabsen.
   * Setelah disetor, nilai terkunci sampai Akademik memvalidasi atau mengembalikannya.
   */
  submitSubjectGrades: {
    roles: ['instruktur'],
    fn: (ctx, batchId, subjectId) => tx(async (c) => {
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ? FOR UPDATE', [batchId ?? '', subjectId ?? ''])
      if (!bs) fail('Mata pelajaran tidak ada di jadwal angkatan ini.')
      assertTeaches(ctx.user, null, bs)
      const [{ n, belum }] = await cq(c, `SELECT COUNT(*) n, COALESCE(SUM(NOT EXISTS (SELECT 1 FROM attendances a WHERE a.session_id = cs.id)), 0) belum
        FROM class_sessions cs WHERE cs.batch_id = ? AND cs.subject_id = ?`, [batchId, subjectId])
      if (Number(n) < Number(bs.sessions_planned)) fail(`Belum bisa disetor: baru ${n} dari ${bs.sessions_planned} pertemuan dibuat.`)
      if (Number(belum)) fail(`Belum bisa disetor: ${belum} pertemuan belum diisi absensinya.`)
      const regs = await cq(c, "SELECT r.id FROM registrations r JOIN grades g ON g.registration_id = r.id WHERE r.batch_id = ? AND r.status = 'active' AND g.status = 'draft'", [batchId])
      if (!regs.length) fail('Tidak ada peserta aktif yang nilainya bisa disetor.')
      const now = dt()
      for (const { id } of regs) {
        await cq(c, `INSERT INTO subject_grades (registration_id, subject_id, status, submitted_at) VALUES (?, ?, 'submitted', ?)
          ON DUPLICATE KEY UPDATE submitted_at = IF(status = 'draft', VALUES(submitted_at), submitted_at), status = IF(status = 'draft', 'submitted', status)`, [id, subjectId, now])
      }
      await audit(c, ctx.user.id, 'nilai.setor-mapel', 'batch_subjects', `${batchId} ${bs.name}`)
    }),
  },
  /** Akademik memvalidasi nilai satu mata pelajaran yang sudah disetor instruktur. Bila semua mapel peserta sudah valid, hasil program ditetapkan otomatis dari rekomendasi sistem. */
  validateSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, batchId, subjectId) => tx(async (c) => {
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ? FOR UPDATE', [batchId ?? '', subjectId ?? ''])
      if (!bs) fail('Mata pelajaran tidak ada di jadwal angkatan ini.')
      const rows = await cq(c, "SELECT sg.registration_id id FROM subject_grades sg JOIN registrations r ON r.id = sg.registration_id WHERE r.batch_id = ? AND sg.subject_id = ? AND sg.status = 'submitted' FOR UPDATE", [batchId, subjectId])
      if (!rows.length) fail('Tidak ada nilai yang disetor untuk divalidasi.')
      await recalcAttendancePct(c, batchId)
      await cq(c, "UPDATE subject_grades sg JOIN registrations r ON r.id = sg.registration_id SET sg.status = 'validated', sg.validated_by = ?, sg.validated_at = ? WHERE r.batch_id = ? AND sg.subject_id = ? AND sg.status = 'submitted'", [ctx.user.id, dt(), batchId, subjectId])
      let finalized = 0
      for (const { id } of rows) if (await finalizeIfComplete(c, ctx, id, batchId)) finalized++
      await audit(c, ctx.user.id, 'nilai.validasi-mapel', 'batch_subjects', `${batchId} ${bs.name}: ${rows.length} peserta, ${finalized} hasil program ditetapkan`)
    }),
  },
  /** Akademik mengembalikan nilai mata pelajaran yang disetor ke instruktur (draf) untuk diperbaiki. */
  returnSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, batchId, subjectId, reason) => tx(async (c) => {
      const why = str(reason, 200)
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ?', [batchId ?? '', subjectId ?? ''])
      if (!bs) fail('Mata pelajaran tidak ada di jadwal angkatan ini.')
      const r = await cq(c, "UPDATE subject_grades sg JOIN registrations r ON r.id = sg.registration_id SET sg.status = 'draft', sg.submitted_at = NULL WHERE r.batch_id = ? AND sg.subject_id = ? AND sg.status = 'submitted'", [batchId, subjectId])
      if (!r.affectedRows) fail('Tidak ada nilai berstatus disetor untuk dikembalikan.')
      if (bs.instructor_id) await notify(c, bs.instructor_id, 'Nilai dikembalikan Akademik', `Nilai ${bs.name} dikembalikan untuk diperbaiki. Catatan: ${why}`, '/admin/nilai')
      await audit(c, ctx.user.id, 'nilai.kembalikan-mapel', 'batch_subjects', `${batchId} ${bs.name}: ${why}`)
    }),
  },
  /** Akademik membatalkan validasi satu mata pelajaran (kembali berstatus disetor). Hasil program peserta yang sudah ditetapkan ikut dibuka kembali. */
  unvalidateSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, batchId, subjectId, reason) => tx(async (c) => {
      const why = str(reason, 200)
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ?', [batchId ?? '', subjectId ?? ''])
      if (!bs) fail('Mata pelajaran tidak ada di jadwal angkatan ini.')
      const rows = await cq(c, "SELECT sg.registration_id id FROM subject_grades sg JOIN registrations r ON r.id = sg.registration_id WHERE r.batch_id = ? AND sg.subject_id = ? AND sg.status = 'validated' FOR UPDATE", [batchId, subjectId])
      if (!rows.length) fail('Tidak ada nilai tervalidasi untuk mata pelajaran ini.')
      await cq(c, "UPDATE subject_grades sg JOIN registrations r ON r.id = sg.registration_id SET sg.status = 'submitted', sg.validated_by = NULL, sg.validated_at = NULL WHERE r.batch_id = ? AND sg.subject_id = ? AND sg.status = 'validated'", [batchId, subjectId])
      for (const { id } of rows) {
        const [g] = await cq(c, "SELECT * FROM grades WHERE registration_id = ? AND status = 'validated' FOR UPDATE", [id])
        if (!g) continue
        const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [id])
        await cq(c, "UPDATE grades SET status = 'draft', passed = NULL, override_reason = NULL, validated_by = NULL, validated_at = NULL WHERE registration_id = ?", [id])
        await cq(c, "UPDATE registrations SET status = 'active' WHERE id = ? AND status = 'completed'", [id])
        await notify(c, r.user_id, 'Validasi nilai dibatalkan', 'Hasil nilai akhir Anda sedang ditinjau ulang oleh Akademik. Hasil dan transkrip akan tampil kembali setelah divalidasi ulang.', '/app')
      }
      await audit(c, ctx.user.id, 'nilai.batal-validasi-mapel', 'batch_subjects', `${batchId} ${bs.name}: ${why}`)
    }),
  },
  submitGrade: {
    roles: ['instruktur'],
    fn: (ctx, regId) => tx(async (c) => {
      const g = await ownedGrade(c, ctx.user, regId)
      await failIfSubjectBased(c, regId)
      if (g.status !== 'draft') fail('Nilai tidak dalam status draf.')
      const [reg] = await cq(c, 'SELECT batch_id FROM registrations WHERE id = ?', [regId])
      if (reg?.batch_id) await recalcAttendancePct(c, reg.batch_id) // kehadiran terakhir sebelum nilai dikunci
      await cq(c, "UPDATE grades SET status = 'submitted' WHERE registration_id = ?", [regId])
      await audit(c, ctx.user.id, 'nilai.kirim', 'grades', regId)
    }),
  },
  returnGrade: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, regId) => tx(async (c) => {
      await cq(c, "UPDATE grades SET status = 'draft' WHERE registration_id = ? AND status = 'submitted'", [regId])
      await audit(c, ctx.user.id, 'nilai.kembalikan', 'grades', regId)
    }),
  },
  /** Akademik dan super admin memvalidasi nilai yang dikirim instruktur, atau yang mereka isi sendiri (langsung dari draf). */
  validateGrade: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, regId, passed, overrideReason) => tx(async (c) => {
      await failIfSubjectBased(c, regId)
      const [g] = await cq(c, "SELECT * FROM grades WHERE registration_id = ? AND status IN ('draft','submitted') FOR UPDATE", [regId])
      if (!g) fail('Data nilai tidak ada atau sudah divalidasi.')
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (g.status === 'draft' && r.batch_id) await recalcAttendancePct(c, r.batch_id) // kehadiran terakhir sebelum nilai dikunci
      const [g2] = g.status === 'draft' ? await cq(c, 'SELECT * FROM grades WHERE registration_id = ?', [regId]) : [g]
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ?', [r.program_id])
      const [b] = r.batch_id ? await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [r.batch_id]) : [] // dikunci: bobot tidak berubah di tengah validasi
      const rec = recommend(g2, p, b)
      if (rec !== !!passed && !String(overrideReason ?? '').trim()) fail('Menimpa rekomendasi sistem wajib disertai alasan.')
      await cq(c, "UPDATE grades SET status = 'validated', passed = ?, override_reason = ?, validated_by = ?, validated_at = ? WHERE registration_id = ?",
        [passed ? 1 : 0, rec !== !!passed ? str(overrideReason, 200) : null, ctx.user.id, dt(), regId])
      // Lulus pelatihan belum berarti lulus sempurna: status selesai baru diberikan setelah seluruh pembayaran lunas.
      if (passed) {
        const { paid, scored } = await syncGraduation(c, regId)
        if (!paid || !scored) await notify(c, r.user_id, 'Lulus pelatihan, menunggu pelunasan dan nilai magang', 'Nilai akhir Anda dinyatakan lulus. Kelulusan baru sempurna setelah seluruh pembayaran lunas dan nilai magang diinput Akademik; transkrip akhir dibuka setelah itu. Cek tagihan di menu Beranda.', '/app')
      } else await cq(c, "UPDATE registrations SET status = 'completed' WHERE id = ?", [regId])
      await audit(c, ctx.user.id, 'nilai.validasi', 'grades', `${r.code} ${passed ? 'lulus' : 'tidak lulus'}${rec !== !!passed ? ' (override)' : ''}`)
    }),
  },

  /**
   * Akademik atau super admin membatalkan validasi nilai. Nilai kembali berstatus "dikirim" (bisa divalidasi ulang atau dikembalikan ke draf),
   * hasil lulus dihapus, dan pendaftaran yang sudah berstatus selesai kembali aktif. Alasan wajib dan tercatat di audit log.
   */
  unvalidateGrade: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, regId, reason) => tx(async (c) => {
      await failIfSubjectBased(c, regId)
      const [g] = await cq(c, "SELECT * FROM grades WHERE registration_id = ? AND status = 'validated' FOR UPDATE", [regId])
      if (!g) fail('Nilai ini belum divalidasi.')
      const why = str(reason, 200)
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      await cq(c, "UPDATE grades SET status = 'submitted', passed = NULL, override_reason = NULL, validated_by = NULL, validated_at = NULL WHERE registration_id = ?", [regId])
      await cq(c, "UPDATE registrations SET status = 'active' WHERE id = ? AND status = 'completed'", [regId])
      await notify(c, r.user_id, 'Validasi nilai dibatalkan', 'Hasil nilai akhir Anda sedang ditinjau ulang oleh Akademik. Hasil dan transkrip akan tampil kembali setelah divalidasi ulang.', '/app')
      await audit(c, ctx.user.id, 'nilai.batal-validasi', 'grades', `${r.code}: ${why}`)
    }),
  },

  /* ---------- landing page (CMS) ---------- */
  saveDraft: {
    roles: CMS,
    fn: (ctx, sections) => tx(async (c) => {
      checkSections(sections)
      await cq(c, "INSERT INTO settings (k, v) VALUES ('draft_sections', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(sections)])
      await audit(c, ctx.user.id, 'landing.draf', 'landing', `${sections.length} section`)
    }),
  },
  publishDraft: {
    roles: CMS,
    fn: (ctx, sections, note) => tx(async (c) => {
      checkSections(sections)
      const id = uid()
      await cq(c, "INSERT INTO settings (k, v) VALUES ('draft_sections', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(sections)])
      await cq(c, 'INSERT INTO landing_revisions (id, snapshot, note, created_by) VALUES (?,?,?,?)', [id, JSON.stringify(sections), str(note, 200, false) || 'Tanpa catatan', ctx.user.id])
      await cq(c, "INSERT INTO settings (k, v) VALUES ('published_revision', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [id])
      await audit(c, ctx.user.id, 'landing.terbit', 'landing', note)
    }),
  },
  restoreRevision: {
    roles: CMS,
    fn: (ctx, id) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM landing_revisions WHERE id = ?', [id])
      if (!r) fail('Versi tidak ditemukan.')
      await cq(c, "INSERT INTO settings (k, v) VALUES ('published_revision', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [id]) // rollback = ganti penunjuk (PRD §8.6)
      await cq(c, "INSERT INTO settings (k, v) VALUES ('draft_sections', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [r.snapshot])
      await audit(c, ctx.user.id, 'landing.rollback', 'landing', r.note)
    }),
  },
  deleteMedia: {
    roles: ['super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [{ n }] = await cq(c, "SELECT COUNT(*) n FROM settings WHERE k IN ('draft_sections') AND v LIKE ?", [`%${id}%`])
      const [{ m }] = await cq(c, 'SELECT COUNT(*) m FROM landing_revisions WHERE snapshot LIKE ?', [`%${id}%`])
      if (Number(n) || Number(m)) fail('Gambar masih dipakai di landing page atau riwayat versi.')
      const [{ k }] = await cq(c, 'SELECT COUNT(*) k FROM chi_today WHERE image_id = ?', [id])
      if (Number(k)) fail('Gambar masih dipakai di kegiatan CHI Today.')
      await cq(c, "DELETE FROM files WHERE id = ? AND kind = 'media'", [id])
    }),
  },

  /* ---------- pengaturan, pengguna, email ---------- */
  saveSettings: {
    roles: ['super_admin'],
    fn: (ctx, s) => tx(async (c) => {
      const clean = {
        name: str(s.name, 120), bankName: str(s.bankName, 80), bankAccount: str(s.bankAccount, 40), bankHolder: str(s.bankHolder, 80),
        payDueHours: num(s.payDueHours, 1, 720), phone: str(s.phone, 40, false), whatsapp: str(s.whatsapp, 20, false), address: str(s.address, 255, false),
        hours: str(s.hours, 120, false), signerName: str(s.signerName, 80, false), signerTitle: str(s.signerTitle, 80, false),
      }
      const cur = await getSettings(c) // pertahankan kunci penerimaan dan biaya yang diatur di menu lain
      await cq(c, "INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify({ ...cur, ...clean })])
      await audit(c, ctx.user.id, 'pengaturan.ubah', 'settings', clean.name)
    }),
  },
  saveUser: {
    roles: ['super_admin'],
    fn: (ctx, u, password) => tx(async (c) => {
      if (u.role === 'peserta') fail('Akun peserta dibuat lewat tombol Peserta baru.')
      if (!['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur'].includes(u.role)) fail('Role tidak valid.')
      const email = str(u.email, 160).toLowerCase()
      // Instruktur memilih satu atau lebih program yang diampu: pelatihan (mis. Room Division, Food & Beverage) dan/atau kelas gabungan.
      let prog = null
      if (u.role === 'instruktur') {
        const picks = [...new Set((Array.isArray(u.instructorPrograms) ? u.instructorPrograms : []).map(String))]
        if (!picks.length) fail('Pilih minimal satu program pelatihan yang diampu instruktur.')
        const ids = picks.filter((x) => x !== 'gabungan')
        const found = ids.length ? await cq(c, 'SELECT id FROM programs WHERE id IN (?) AND deleted_at IS NULL', [ids]) : []
        if (found.length !== ids.length) fail('Ada program pelatihan instruktur yang tidak valid.')
        prog = picks.join(',')
      }
      const [ex] = await cq(c, 'SELECT id, role FROM users WHERE id = ?', [u.id])
      if (ex?.role === 'peserta') fail('Akun peserta tidak diubah dari sini.')
      if (ex) {
        const [dup] = await cq(c, 'SELECT id FROM users WHERE email = ? AND id <> ?', [email, u.id])
        if (dup) fail('Email sudah dipakai akun lain.')
        await cq(c, 'UPDATE users SET name=?, email=?, role=?, is_active=?, instructor_program=? WHERE id = ?', [str(u.name, 120), email, u.role, u.active ? 1 : 0, prog, u.id])
        if (u.id === ctx.user.id && (!u.active || u.role !== 'super_admin')) fail('Anda tidak dapat menonaktifkan atau menurunkan role akun sendiri.')
      } else {
        if (String(password ?? '').length < 8) fail('Password awal minimal 8 karakter.')
        const [dup] = await cq(c, 'SELECT id FROM users WHERE email = ?', [email])
        if (dup) fail('Email sudah terdaftar.')
        await cq(c, 'INSERT INTO users (id, name, email, password_hash, role, is_active, must_change_password, email_verified_at, instructor_program) VALUES (?,?,?,?,?,?,1,?,?)', [uid(), str(u.name, 120), email, await bcrypt.hash(password, 10), u.role, 1, dt(), prog])
      }
      await audit(c, ctx.user.id, ex ? 'user.ubah' : 'user.buat', 'users', `${email} (${u.role})`)
    }),
  },
  /** Hapus permanen akun pengelola. Akun yang sudah terpakai (mis. wali angkatan) ditolak; nonaktifkan saja. */
  deleteUser: {
    roles: ['super_admin'],
    fn: (ctx, userId) => tx(async (c) => {
      const [u] = await cq(c, 'SELECT id, email, role FROM users WHERE id = ? FOR UPDATE', [userId])
      if (!u) fail('Akun tidak ditemukan.', 404)
      if (u.role === 'peserta') fail('Akun peserta dihapus dari menu Peserta.')
      if (u.id === ctx.user.id) fail('Anda tidak dapat menghapus akun sendiri.')
      if (u.role === 'super_admin') {
        const [n] = await cq(c, "SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND id <> ?", [u.id])
        if (!Number(n.n)) fail('Super Admin terakhir tidak dapat dihapus.')
      }
      try {
        await cq(c, 'DELETE FROM users WHERE id = ?', [u.id])
      } catch (e) {
        if (e?.errno === 1451) fail('Akun ini masih dipakai data lain (mis. wali angkatan). Nonaktifkan akun, atau alihkan datanya lebih dulu.')
        throw e
      }
      await audit(c, ctx.user.id, 'user.hapus', 'users', `${u.email} (${u.role})`)
    }),
  },
  /** Super Admin mengganti password pengguna mana pun (staf atau peserta). Kunci login karena salah password ikut dibuka. */
  setUserPassword: {
    roles: ['super_admin'],
    fn: (ctx, userId, password, mustChange) => tx(async (c) => {
      if (typeof password !== 'string' || password.length < 8 || password.length > 100) fail('Password minimal 8 karakter.')
      const [u] = await cq(c, 'SELECT id, email FROM users WHERE id = ? FOR UPDATE', [userId])
      if (!u) fail('Pengguna tidak ditemukan.', 404)
      const force = mustChange !== false && u.id !== ctx.user.id
      await cq(c, 'UPDATE users SET password_hash = ?, must_change_password = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(password, 10), force ? 1 : 0, u.id])
      await cq(c, "UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL", [dt(), u.id]) // tautan reset lama tidak berlaku lagi
      await audit(c, ctx.user.id, 'user.password', 'users', `${u.email}${force ? ' (wajib ganti saat masuk)' : ''}`)
    }),
  },
  /**
   * Admin menambah pendaftar baru secara manual untuk calon yang kesulitan membuat akun sendiri. Hasilnya sama dengan daftar
   * sendiri: akun peserta + registrasi di tahap isi data diri, lalu mengikuti seluruh tahapan penerimaan (bayar pendaftaran,
   * ujian, dan seterusnya). Password awal diisi admin atau dibuat otomatis, dan wajib diganti saat pertama masuk.
   * Mengembalikan data masuk agar admin bisa menyampaikannya ke pendaftar.
   */
  createPendaftar: {
    roles: ['super_admin', 'admin_pendaftaran'],
    fn: async (ctx, x) => {
      const name = str(x?.name, 120)
      const email = String(x?.email ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) fail('Format email tidak valid.')
      const nik = String(x?.nik ?? '').trim()
      if (!/^\d{16}$/.test(nik)) fail('NIK harus 16 digit angka.')
      const birthDate = String(x?.birthDate ?? '')
      const age = ageOn(birthDate)
      if (age == null || age < 14) fail('Tanggal lahir tidak valid.')
      if (age > MAX_AGE) fail(`Pendaftaran hanya untuk usia maksimal ${MAX_AGE} tahun.`)
      const phone = str(x?.phone, 30, false).replace(/[^\d+]/g, '')
      if (phone && !/^\+?\d{9,15}$/.test(phone)) fail('Nomor HP tidak valid.')
      const given = typeof x?.password === 'string' ? x.password : ''
      if (given && (given.length < 8 || given.length > 100)) fail('Password awal minimal 8 karakter.')
      const password = given || `CHI-${randomCode(6)}`
      const hash = await bcrypt.hash(password, 10)
      const id = uid()
      // Nomor registrasi bisa bentrok dengan pendaftar yang daftar bersamaan; ulangi seperti daftar sendiri.
      for (let attempt = 1; ; attempt++) {
        try {
          return await tx(async (c) => {
            const [dup] = await cq(c, 'SELECT id FROM users WHERE email = ?', [email])
            if (dup) fail('Email sudah terdaftar.')
            const [dupNik] = await cq(c, 'SELECT user_id FROM participant_profiles WHERE nik = ? UNION SELECT id FROM users WHERE nik = ?', [nik, nik])
            if (dupNik) fail('NIK ini sudah terdaftar. Satu NIK hanya dapat dipakai untuk satu akun.')
            // Email dianggap terverifikasi (dimasukkan admin); pendaftar masih boleh mengganti email satu kali saat pertama masuk.
            await cq(c, "INSERT INTO users (id, name, email, phone, nik, birth_date, password_hash, role, email_verified_at, must_change_password, email_change_left) VALUES (?,?,?,?,?,?,?,'peserta',?,1,1)",
              [id, name, email, phone, nik, birthDate, hash, dt()])
            await registerForProgram(c, { id, email, name }, x?.programId ?? '')
            const [r] = await cq(c, 'SELECT code FROM registrations WHERE user_id = ?', [id])
            await audit(c, ctx.user.id, 'pendaftar.tambah-admin', 'users', `${email} (${r.code})`)
            return { userId: id, code: r.code, email, password, generated: !given }
          })
        } catch (e) { if (e?.code !== 'ER_DUP_ENTRY' || attempt >= 3) throw e }
      }
    },
  },
  /**
   * Super Admin atau Akademik menambah peserta didik langsung, lengkap dengan akun penggunanya. Peserta langsung berstatus aktif
   * (tanpa ujian dan registrasi ulang), lalu melengkapi data diri dan berkas sendiri agar ruang belajar terbuka.
   */
  createPeserta: {
    roles: ['super_admin', 'akademik'],
    fn: (ctx, x) => tx((c) => insertPeserta(c, ctx.user, x)),
  },
  /**
   * Impor banyak peserta didik dari Excel. Tiap baris diproses di transaksinya sendiri: baris yang gagal dilaporkan
   * tanpa membatalkan baris lain. Program dan angkatan sudah dipetakan ke id oleh klien.
   */
  importPeserta: {
    roles: ['super_admin', 'akademik'],
    fn: async (ctx, rows) => {
      if (!Array.isArray(rows) || !rows.length) fail('Tidak ada baris untuk diimpor.')
      if (rows.length > 500) fail('Maksimal 500 baris sekali impor.')
      const results = []
      for (const [i, x] of rows.entries()) {
        try {
          const { nip } = await tx((c) => insertPeserta(c, ctx.user, x, true))
          results.push({ row: x.row ?? i + 1, ok: true, nip })
        } catch (e) {
          if (!(e instanceof HttpError)) throw e
          results.push({ row: x.row ?? i + 1, ok: false, error: e.message })
        }
      }
      const added = results.filter((r) => r.ok).length
      await tx((c) => audit(c, ctx.user.id, 'peserta.impor', 'users', `${added} dari ${rows.length} baris berhasil`))
      return results
    },
  },
  sendAnnouncement: {
    roles: ['admin_pendaftaran', 'super_admin', 'instruktur'],
    fn: (ctx, scope, scopeId, subject, body) => tx(async (c) => {
      let rows
      if (scope === 'all') rows = await cq(c, "SELECT DISTINCT u.email FROM users u JOIN registrations r ON r.user_id = u.id WHERE r.status IN ('active','pending_payment','waiting_verification')")
      else if (scope === 'program') rows = await cq(c, "SELECT DISTINCT u.email FROM users u JOIN registrations r ON r.user_id = u.id WHERE r.program_id = ? AND r.status IN ('active','pending_payment','waiting_verification')", [scopeId])
      else if (scope === 'batch') { await assertOwnBatch(c, ctx.user, scopeId); rows = await cq(c, "SELECT DISTINCT u.email FROM users u JOIN registrations r ON r.user_id = u.id WHERE r.batch_id = ? AND r.status IN ('active','pending_payment','waiting_verification')", [scopeId]) }
      else fail('Segmen tidak dikenal.')
      if (ctx.user.role === 'instruktur' && scope !== 'batch') fail('Instruktur hanya dapat mengumumkan ke angkatannya.', 403)
      const sub = str(subject, 200), text = str(body, 4000)
      for (const r of rows) await mail(c, r.email, sub, text)
      await audit(c, ctx.user.id, 'pengumuman.kirim', 'email_queue', `${scope}: ${rows.length} penerima`)
      return rows.length
    }),
  },
}

/** Registrasi peserta didik yang ditambahkan atau diimpor admin (fitur pencatatan keuangan khusus untuk mereka). Dikunci untuk transaksi ini. */
async function importedReg(c, regId) {
  const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId ?? ''])
  if (!r) fail('Peserta didik tidak ditemukan.', 404)
  if (r.source !== 'admin' || r.stage !== 'aktif' || !['active', 'completed'].includes(r.status)) fail('Fitur ini khusus peserta didik aktif yang ditambahkan atau diimpor admin. Peserta lain membayar lewat aplikasi.', 403)
  return r
}
/** Hitung ulang alokasi semua pembayaran terverifikasi ke cicilan (dipakai setelah catatan pembayaran dibatalkan). */
async function recomputeInstallments(c, regId) {
  await cq(c, "UPDATE installments SET paid_amount = 0, status = 'unpaid' WHERE registration_id = ?", [regId])
  for (const p of await cq(c, "SELECT * FROM payments WHERE registration_id = ? AND status = 'verified' AND installment_id IS NOT NULL ORDER BY created_at, id", [regId])) await allocatePayment(c, p)
  await cq(c, "UPDATE installments i SET i.status = 'submitted' WHERE i.registration_id = ? AND i.status IN ('unpaid','partial') AND EXISTS (SELECT 1 FROM payments p WHERE p.installment_id = i.id AND p.status = 'submitted')", [regId])
  await syncGraduation(c, regId) // pembayaran dibatalkan: kelulusan sempurna bisa kembali menunggu pelunasan
}
/** Hapus akun peserta dan semua datanya di dalam transaksi c. Mengembalikan nama berkas fisik yang perlu dihapus setelah commit. */
export async function removePeserta(c, actor, userId) {
  const [u] = await cq(c, "SELECT id, name, email FROM users WHERE id = ? AND role = 'peserta' FOR UPDATE", [userId])
  if (!u) fail('Pendaftar tidak ditemukan.', 404)
  const regs = await cq(c, 'SELECT id, code FROM registrations WHERE user_id = ? FOR UPDATE', [u.id])
  const ids = regs.length ? regs.map((r) => r.id) : ['-']
  // Berkas milik peserta (bukti bayar, dokumen, tugas, foto) ikut dihapus.
  const files = await cq(c, "SELECT id, stored_name FROM files WHERE owner_id = ? AND kind IN ('proof','document','submission','profile')", [u.id])
  // Fitur sertifikat sudah dihapus; baris sertifikat lama (bila ada) beserta PDF-nya ikut dibersihkan.
  const certs = await cq(c, 'SELECT id FROM certificates WHERE registration_id IN (?)', [ids])
  for (const t of ['exam_attempts', 'attendances', 'submissions', 'subject_grades', 'grades', 'installments', 'payments', 'placements', 'certificates']) await cq(c, `DELETE FROM ${t} WHERE registration_id IN (?)`, [ids])
  await cq(c, 'DELETE FROM registrations WHERE user_id = ?', [u.id])
  await cq(c, 'DELETE FROM users WHERE id = ?', [u.id]) // data diri, berkas registrasi ulang, notifikasi, dan token ikut terhapus (ON DELETE CASCADE)
  if (files.length) await cq(c, 'DELETE FROM files WHERE id IN (?)', [files.map((f) => f.id)])
  await audit(c, actor.id, 'peserta.hapus', 'users', `${u.name} <${u.email}>${regs.length ? `, registrasi ${regs.map((r) => r.code).join(', ')}` : ''}`)
  return [...files.map((f) => f.stored_name), ...certs.map((x) => `cert-${x.id}.pdf`)]
}
/** Buat akun peserta + registrasi aktif. Dipakai tambah satu dan impor Excel. bulk: tanpa notifikasi per baris di audit (satu catatan ringkas saja). */
async function insertPeserta(c, actor, x, bulk = false) {
  const name = str(x.name, 120)
  const email = str(x.email, 160).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Format email tidak valid.')
  if (typeof x.password !== 'string' || x.password.length < 8 || x.password.length > 100) fail('Password awal minimal 8 karakter.')
  const nik = String(x.nik ?? '').trim()
  if (nik && !/^\d{16}$/.test(nik)) fail('NIK harus 16 digit angka.')
  const birthDate = String(x.birthDate ?? '').trim()
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) fail('Tanggal lahir harus berformat YYYY-MM-DD.')
  // NIP boleh diisi admin (mis. peserta lama). Kosong = diterbitkan otomatis bila angkatan sudah ditetapkan.
  const givenNip = String(x.nip ?? '').trim()
  if (givenNip && !/^[0-9A-Za-z./-]{1,12}$/.test(givenNip)) fail('NIP maksimal 12 karakter (angka, huruf, titik, garis miring, atau tanda hubung).')
  if (givenNip) {
    const [dupNip] = await cq(c, 'SELECT code FROM registrations WHERE nip = ?', [givenNip])
    if (dupNip) fail(`NIP ${givenNip} sudah dipakai peserta lain.`)
  }
  const [dup] = await cq(c, 'SELECT id FROM users WHERE email = ?', [email])
  if (dup) fail(`Email ${email} sudah terdaftar.`)
  if (nik) {
    const [dupNik] = await cq(c, 'SELECT user_id FROM participant_profiles WHERE nik = ? UNION SELECT id FROM users WHERE nik = ?', [nik, nik])
    if (dupNik) fail(`NIK ${nik} sudah terdaftar pada akun lain.`)
  }
  const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ? AND deleted_at IS NULL', [x.programId ?? ''])
  if (!p) fail('Program pelatihan tidak ditemukan.')
  let bt = null
  if (x.batchId) {
    ;[bt] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [x.batchId])
    if (!bt || bt.program_id !== p.id) fail('Angkatan harus dari program yang dipilih.')
    if (['finished', 'cancelled'].includes(bt.status)) fail(`Angkatan ${bt.code} sudah selesai atau dibatalkan.`)
    if ((await seats(c, bt.id)) >= bt.quota) fail(`Kuota angkatan ${bt.code} penuh.`)
  }
  const id = uid()
  await cq(c, "INSERT INTO users (id, name, email, phone, nik, birth_date, password_hash, role, email_verified_at, must_change_password, email_change_left) VALUES (?,?,?,?,?,?,?,'peserta',?,1,1)",
    [id, name, email, str(x.phone, 30, false), nik || null, birthDate || null, await bcrypt.hash(x.password, 10), dt()])
  // Nomor registrasi berurutan per bulan; dilompati bila sudah terpakai (mis. ada registrasi yang dihapus).
  const ym = new Date().toISOString().slice(0, 7).replace('-', '')
  let [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM registrations')
  n = Number(n) + 1
  while ((await cq(c, 'SELECT 1 FROM registrations WHERE code = ? OR invoice_no = ?', [`REG-${ym}-${String(n).padStart(3, '0')}`, `INV-${ym}-${String(n).padStart(3, '0')}`])).length) n++
  const seq = String(n).padStart(3, '0')
  const regId = uid()
  await cq(c, "INSERT INTO registrations (id, code, user_id, program_id, batch_id, status, stage, nip, price_snapshot, unique_code, invoice_no, due_at, source) VALUES (?,?,?,?,?,'active','aktif',?,?,0,?,?,'admin')",
    [regId, `REG-${ym}-${seq}`, id, p.id, bt?.id ?? null, givenNip || null, p.price, `INV-${ym}-${seq}`, new Date(Date.now() + 366 * 86_400_000)])
  await cq(c, 'INSERT IGNORE INTO grades (registration_id) VALUES (?)', [regId])
  const nip = givenNip || (bt ? await issueNip(c, { id: regId, nip: null, batch_id: bt.id, program_id: p.id }) : null)
  await notify(c, id, 'Akun peserta didik Anda sudah dibuat', `Halo ${name}, Anda terdaftar sebagai peserta didik ${p.title}${bt ? ` angkatan ${bt.code}` : ''}.${nip ? ` NIP Anda: ${nip}.` : ''} Lengkapi data diri dan unggah berkas agar ruang belajar terbuka.`, '/app/data-diri')
  if (!bulk) await audit(c, actor.id, 'peserta.buat-admin', 'users', `${email} -> ${p.title}${bt ? ` ${bt.code}` : ''}`)
  return { nip }
}
/**
 * Simpan satu jadwal (tambah atau ubah). Untuk kelas gabungan, x.batchIds berisi semua angkatan (boleh lintas pelatihan)
 * yang ikut kelas itu: semuanya mendapat instruktur, hari, jam, dan ruang yang sama dan diikat dengan group_id.
 */
export async function upsertJadwal(c, x) {
  const [bt] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [x.batchId ?? '']) // dikunci: dua simpanan bersamaan dicek berurutan
  if (!bt) fail('Angkatan tidak ditemukan.')
  // Mapel harus dari kurikulum angkatan ini, atau kelas gabungan.
  const [sj] = await cq(c, 'SELECT id, name, program_id FROM subjects WHERE id = ? AND is_active = 1 AND (program_id IS NULL OR (program_id = ? AND (? IS NULL OR curriculum_id = ?)))', [x.subjectId ?? '', bt.program_id, bt.curriculum_id, bt.curriculum_id])
  if (!sj) fail(`Mata pelajaran tidak ada di kurikulum angkatan ${bt.code}.`)
  const [ex] = await cq(c, 'SELECT * FROM batch_subjects WHERE batch_id = ? AND subject_id = ?', [bt.id, sj.id])
  if (ex && !x.editing) fail(`"${sj.name}" sudah ada di jadwal angkatan ini. Ubah jadwalnya saja.`)
  // Jumlah pertemuan mengikuti bank mata pelajaran; isian manual hanya dipakai bila bank belum mengisinya.
  const [{ meetings: bankMeetings }] = await cq(c, 'SELECT meetings FROM subjects WHERE id = ?', [sj.id])
  const sessions = bankMeetings != null ? Number(bankMeetings) : num(x.sessions, 1, 50)
  const days = DAYS.filter((d) => Array.isArray(x.days) && x.days.includes(d))
  if (!days.length) fail('Pilih minimal satu hari.')
  if (!HHMM.test(x.startTime ?? '') || !HHMM.test(x.endTime ?? '')) fail('Jam mulai dan selesai wajib diisi (HH:MM).')
  if (x.endTime <= x.startTime) fail('Jam selesai harus setelah jam mulai.')
  if (!x.instructorId) fail('Pilih instruktur pengampu.')
  const [ins] = await cq(c, "SELECT id, name FROM users WHERE id = ? AND role = 'instruktur' AND is_active = 1", [x.instructorId])
  if (!ins) fail('Instruktur tidak valid.')
  const room = str(x.room, 160, false)
  const a = { days, start: x.startTime, end: x.endTime }
  const sameRoom = (r) => room && r && room.toLowerCase() === String(r).toLowerCase()

  // Kelas gabungan diatur di sini (bukan di bank mata pelajaran): angkatan lain, juga dari pelatihan lain, ikut kelas yang sama
  // dengan instruktur, hari, jam, dan ruang yang sama, diikat dengan group_id. Tiap angkatan memakai mata pelajaran bernama sama
  // dari kurikulumnya sendiri bila ada, sehingga nilainya tetap tercatat di kurikulum masing-masing.
  const ids = [...new Set([bt.id, ...(Array.isArray(x.batchIds) ? x.batchIds.map(String) : [])])]
  const group = ids.length > 1 ? ex?.group_id || uid() : null
  // Angkatan yang dikeluarkan dari grup saat diubah: jadwalnya dihapus bila belum ada pertemuan.
  if (ex?.group_id) {
    for (const o of await cq(c, 'SELECT bs.batch_id, bs.subject_id, b.code FROM batch_subjects bs JOIN batches b ON b.id = bs.batch_id WHERE bs.group_id = ?', [ex.group_id])) {
      if (ids.includes(o.batch_id)) continue
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM class_sessions WHERE batch_id = ? AND subject_id = ?', [o.batch_id, o.subject_id])
      if (Number(n)) fail(`Angkatan ${o.code} sudah punya pertemuan "${sj.name}", jadi tidak bisa dikeluarkan dari kelas gabungan.`)
      await cq(c, 'DELETE FROM batch_subjects WHERE batch_id = ? AND subject_id = ?', [o.batch_id, o.subject_id])
      await refreshBatchSummary(c, o.batch_id)
    }
  }
  const codes = []
  for (const id of ids) {
    const [t] = id === bt.id ? [bt] : await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [id])
    if (!t) fail('Ada angkatan tujuan yang tidak ditemukan.')
    if (['finished', 'cancelled'].includes(t.status)) fail(`Angkatan ${t.code} sudah selesai atau dibatalkan.`)
    // Mata pelajaran untuk angkatan ini: yang bernama sama di kurikulumnya, atau mata pelajaran yang dipilih bila tidak ada.
    const [match] = id !== bt.id && t.curriculum_id ? await cq(c, 'SELECT id, name, meetings FROM subjects WHERE curriculum_id = ? AND is_active = 1 AND LOWER(name) = LOWER(?) LIMIT 1', [t.curriculum_id, sj.name]) : []
    const tsj = match ?? sj
    const tSessions = match && match.meetings != null ? Number(match.meetings) : sessions
    const [own] = id === bt.id ? [ex] : await cq(c, 'SELECT * FROM batch_subjects WHERE batch_id = ? AND subject_id = ?', [id, tsj.id])
    if (own && id !== bt.id && (!own.group_id || own.group_id !== group) && !x.overwrite) fail(`"${sj.name}" sudah punya jadwal sendiri di angkatan ${t.code}. Hapus atau ubah di sana dulu.`)
    // Bentrok: instruktur atau ruang yang sama pada hari dan jam yang beririsan, di angkatan ini atau angkatan lain yang periodenya beririsan.
    // Anggota kelas gabungan yang sama (dan mata pelajaran yang sama di angkatan lain) boleh berbarengan.
    const others = await cq(c, `SELECT bs.*, b.code, sj.name FROM batch_subjects bs JOIN batches b ON b.id = bs.batch_id JOIN subjects sj ON sj.id = bs.subject_id
      WHERE NOT (bs.batch_id = ? AND bs.subject_id = ?) AND (bs.batch_id = ? OR (b.status NOT IN ('finished','cancelled') AND b.start_date <= ? AND b.end_date >= ?)) AND bs.start_time IS NOT NULL`,
      [t.id, tsj.id, t.id, t.end_date, t.start_date])
    for (const o of others) {
      const here = o.batch_id === t.id
      if (!here && (o.subject_id === tsj.id || (group && o.group_id === group))) continue
      if (!clash(a, { days: String(o.schedule_days).split(','), start: hm(o.start_time), end: hm(o.end_time) })) continue
      const where = here ? ` di angkatan ${t.code}` : ` di angkatan ${o.code}`
      if (o.instructor_id === ins.id) fail(`Bentrok: ${ins.name} sudah mengajar "${o.name}"${where} pada ${o.schedule_days} ${hm(o.start_time)}-${hm(o.end_time)}.`)
      if (sameRoom(o.room)) fail(`Bentrok: ruang ${room} sudah dipakai "${o.name}"${where} pada ${o.schedule_days} ${hm(o.start_time)}-${hm(o.end_time)}.`)
    }
    const [{ n: used }] = await cq(c, 'SELECT COUNT(*) n FROM class_sessions WHERE batch_id = ? AND subject_id = ?', [t.id, tsj.id])
    if (tSessions < Number(used)) fail(`"${sj.name}" di angkatan ${t.code} sudah punya ${used} pertemuan, jadi jumlahnya tidak bisa di bawah itu.`)
    await cq(c, `INSERT INTO batch_subjects (batch_id, subject_id, sessions_planned, instructor_id, schedule_days, start_time, end_time, room, group_id) VALUES (?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE sessions_planned = VALUES(sessions_planned), instructor_id = VALUES(instructor_id), schedule_days = VALUES(schedule_days),
      start_time = VALUES(start_time), end_time = VALUES(end_time), room = VALUES(room), group_id = VALUES(group_id)`, [t.id, tsj.id, tSessions, ins.id, days.join(','), x.startTime, x.endTime, room, group])
    await refreshBatchSummary(c, t.id)
    codes.push(t.code)
  }
  return { existed: !!ex, summary: `${sj.name} (${codes.join(', ')}): ${ins.name}, ${days.join('/')} ${x.startTime}-${x.endTime}${room ? `, ${room}` : ''}` }
}
/**
 * Simpan (next berisi { amount, reason }) atau hapus (next = null) potongan satu biaya pendaftar, lalu sesuaikan tahapan
 * pembayaran pendaftaran dan jadwal cicilannya. Semua dalam satu transaksi: pelanggaran aturan membatalkan perubahan.
 */
export async function changeDiscount(c, ctx, regId, target, next) {
  const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId ?? ''])
  if (!r) fail('Pendaftar tidak ditemukan.', 404)
  if (!['pending_payment', 'waiting_verification', 'active'].includes(r.status)) fail('Pendaftaran ini sudah tidak berjalan atau sudah selesai, jadi potongannya tidak bisa diubah.')
  const [pend] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND status = 'submitted' LIMIT 1", [r.id])
  if (pend) fail('Ada bukti pembayaran yang menunggu verifikasi. Setujui atau tolak dulu, lalu atur potongannya.')
  const s = await getSettings(c)
  const fee = Number(s.regFee ?? REG_FEE_DEFAULT)
  const [ex] = await cq(c, 'SELECT * FROM registration_discounts WHERE registration_id = ? AND target = ? FOR UPDATE', [r.id, target])
  if (!next && !ex) fail('Potongan tidak ditemukan.')
  const regBefore = await regFeeDue(c, r, s)
  const creditBefore = await scheduleCredit(c, r, s)
  const [paidReg] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'verified' LIMIT 1", [r.id])
  const rpx = (n) => 'Rp' + Number(n).toLocaleString('id-ID')

  let label = ex?.label ?? ''
  if (next) {
    // Dasar potongan: nominal biaya yang dipotong. Potongan tidak boleh melebihinya.
    let base
    if (target === 'pendaftaran') {
      const [b] = r.batch_id ? await cq(c, 'SELECT code, free_reg_fee FROM batches WHERE id = ?', [r.batch_id]) : []
      if (b?.free_reg_fee) fail(`Angkatan ${b.code} sudah dibebaskan dari biaya pendaftaran.`)
      if (paidReg) fail('Biaya pendaftaran sudah dibayar lunas. Berikan potongan pada biaya pelatihan bila perlu.')
      base = fee; label = 'Biaya pendaftaran'
    } else if (target === 'pelatihan') {
      const [p] = await cq(c, 'SELECT title, price FROM programs WHERE id = ?', [r.program_id])
      base = Number(p.price); label = `Biaya pelatihan ${p.title}`
    } else {
      const [fi] = await cq(c, 'SELECT name, amount FROM fee_items WHERE id = ? AND is_active = 1 AND ((user_id IS NULL AND (program_id IS NULL OR program_id = ?)) OR user_id = ?)', [target, r.program_id, r.user_id])
      if (!fi) fail('Pilih biaya yang dipotong: biaya pendaftaran, biaya pelatihan, atau biaya tambahan yang berlaku untuk pendaftar ini.')
      base = Number(fi.amount); label = fi.name
    }
    const amount = Number(next.amount)
    if (!Number.isInteger(amount) || amount < 1) fail('Nominal potongan harus lebih dari Rp0.')
    if (amount > base) fail(`Potongan melebihi ${label.toLowerCase()} (${rpx(base)}).`)
    const reason = str(next.reason, 255)
    if (ex) await cq(c, 'UPDATE registration_discounts SET amount = ?, reason = ?, label = ?, created_by = ? WHERE id = ?', [amount, reason, label, ctx.user.id, ex.id])
    else await cq(c, 'INSERT INTO registration_discounts (id, registration_id, target, label, amount, reason, created_by) VALUES (?,?,?,?,?,?,?)', [uid(), r.id, target, label, amount, reason, ctx.user.id])
  } else {
    await cq(c, 'DELETE FROM registration_discounts WHERE id = ?', [ex.id])
  }

  // Biaya pendaftaran yang kini Rp0 membuka ujian tulis seperti pembayaran yang dikonfirmasi.
  const regAfter = await regFeeDue(c, r, s)
  if (target === 'pendaftaran' && !paidReg) {
    if (regAfter > 0 && regBefore === 0 && r.source !== 'admin' && !['data', 'bayar_daftar'].includes(r.stage)) {
      fail('Pendaftar sudah melewati tahap pembayaran pendaftaran karena biayanya dipotong seluruhnya, jadi potongan ini tidak bisa dikurangi lagi.')
    }
    if (regAfter === 0 && r.stage === 'bayar_daftar') {
      await cq(c, "UPDATE registrations SET stage = 'ujian' WHERE id = ?", [r.id])
    }
  }
  // Jadwal cicilan yang sudah ada mengikuti perubahan total biaya.
  const delta = creditBefore - await scheduleCredit(c, r, s)
  await applyScheduleDelta(c, r.id, delta)
  await syncGraduation(c, r.id)

  const { reg, other } = await discountsOf(c, r.id)
  const stageNote = target === 'pendaftaran' && regAfter === 0 && r.stage === 'bayar_daftar' ? ' Biaya pendaftaran Anda menjadi Rp0, jadi ujian online kini terbuka.' : ''
  const body = next
    ? `Bagian keuangan memberikan potongan ${label.toLowerCase()} sebesar ${rpx(next.amount)}.${target === 'pendaftaran' ? ` Biaya pendaftaran yang perlu dibayar kini ${rpx(regAfter)}.` : ''}${stageNote} Lihat rincian tagihan di aplikasi.`
    : `Potongan ${label.toLowerCase()} dibatalkan bagian keuangan. Lihat rincian tagihan terbaru di aplikasi.`
  await notify(c, r.user_id, next ? 'Potongan biaya diberikan' : 'Potongan biaya dibatalkan', body, stageNote ? '/app/ujian' : '/app')
  await audit(c, ctx.user.id, next ? 'keuangan.potongan' : 'keuangan.batal-potongan', 'registration_discounts', `${r.code} ${label}: ${next ? `${rpx(next.amount)} (${str(next.reason, 255)})` : 'dihapus'}; total potongan ${rpx(reg + other)}`)
}

/**
 * Kurikulum untuk angkatan: yang diminta bila milik pelatihan angkatan; bila kosong atau milik pelatihan lain (pelatihan diganti),
 * pakai kurikulum terbaru pelatihan. strict = pilihan wajib valid. Ganti kurikulum ditolak bila jadwal angkatan
 * masih memuat mata pelajaran dari kurikulum lain.
 */
async function batchCurriculum(c, programId, wanted, ex, strict = false) {
  let [cur] = wanted ? await cq(c, 'SELECT id, program_id, name, is_active FROM curricula WHERE id = ?', [wanted]) : []
  if (wanted && !cur) fail('Kurikulum tidak ditemukan.')
  if (cur && cur.program_id !== programId) { if (strict) fail('Kurikulum itu bukan milik pelatihan angkatan ini.'); cur = undefined }
  if (cur && !cur.is_active && cur.id !== ex?.curriculum_id) fail(`Kurikulum ${cur.name} sudah nonaktif.`)
  if (!cur) [cur] = await cq(c, 'SELECT id, name FROM curricula WHERE program_id = ? ORDER BY is_active DESC, created_at DESC LIMIT 1', [programId])
  if (!cur) return null
  if (ex && ex.curriculum_id !== cur.id) {
    const bad = await cq(c, 'SELECT sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND sj.program_id IS NOT NULL AND NOT (sj.curriculum_id <=> ?)', [ex.id, cur.id])
    if (bad.length) fail(`Jadwal angkatan ini masih memuat mata pelajaran di luar kurikulum ${cur.name}: ${bad.slice(0, 5).map((x) => x.name).join(', ')}${bad.length > 5 ? ', dan lainnya' : ''}. Hapus jadwal itu dulu.`)
  }
  return cur.id
}
/** Samakan jatah pertemuan di jadwal semua angkatan dengan jumlah pertemuan di bank mata pelajaran (tidak di bawah pertemuan yang sudah dibuat). */
async function syncMeetings(c, subjectId, meetings) {
  if (meetings == null) return
  const rows = await cq(c, 'SELECT batch_id, sessions_planned FROM batch_subjects WHERE subject_id = ?', [subjectId])
  for (const r of rows) {
    const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM class_sessions WHERE batch_id = ? AND subject_id = ?', [r.batch_id, subjectId])
    const target = Math.max(Number(meetings), Number(n))
    if (target === Number(r.sessions_planned)) continue
    await cq(c, 'UPDATE batch_subjects SET sessions_planned = ? WHERE batch_id = ? AND subject_id = ?', [target, r.batch_id, subjectId])
    await refreshBatchSummary(c, r.batch_id)
  }
}
/** Ringkasan jadwal di tingkat angkatan (dipakai portal peserta): gabungan hari, jam paling awal dan akhir, daftar ruang, total pertemuan. */
async function refreshBatchSummary(c, batchId) {
  const rows = await cq(c, 'SELECT * FROM batch_subjects WHERE batch_id = ?', [batchId])
  const days = DAYS.filter((d) => rows.some((x) => String(x.schedule_days).split(',').includes(d)))
  const starts = rows.map((x) => hm(x.start_time)).filter(Boolean).sort(), ends = rows.map((x) => hm(x.end_time)).filter(Boolean).sort()
  const rooms = [...new Set(rows.map((x) => x.room).filter(Boolean))].join(', ').slice(0, 160)
  const total = rows.reduce((t, x) => t + Number(x.sessions_planned), 0)
  await cq(c, 'UPDATE batches SET location = ?, schedule_days = ?, start_time = ?, end_time = ?, planned_sessions = ? WHERE id = ?',
    [rooms, days.join(','), starts[0] ?? null, ends.at(-1) ?? null, total, batchId])
}
/** Instruktur boleh mengakses angkatan yang ia walikan atau yang salah satu mata pelajarannya ia ampu. */
async function assertOwnBatch(c, user, batchId) {
  const [b] = await cq(c, 'SELECT id FROM batches WHERE id = ?', [batchId])
  if (!b) fail('Angkatan tidak ditemukan.')
  if (user.role !== 'instruktur') return
  const [bs] = await cq(c, 'SELECT 1 FROM batch_subjects WHERE batch_id = ? AND instructor_id = ? LIMIT 1', [batchId, user.id])
  if (!bs) fail('Bukan angkatan yang Anda ajar.', 403)
}
/** Pengampu mata pelajaran: instruktur yang ditunjuk Akademik di jadwal pembelajaran. */
function assertTeaches(user, _batch, bs) {
  if (user.role !== 'instruktur') return
  if (!bs?.instructor_id || bs.instructor_id !== user.id) fail('Mata pelajaran ini diampu instruktur lain.', 403)
}
/** Hak atas satu pertemuan mengikuti pengampu mata pelajarannya. */
export async function assertOwnSession(c, user, ses) {
  if (user.role !== 'instruktur') return
  const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ?', [ses.batch_id])
  const [bs] = ses.subject_id ? await cq(c, 'SELECT * FROM batch_subjects WHERE batch_id = ? AND subject_id = ?', [ses.batch_id, ses.subject_id]) : []
  assertTeaches(user, b, bs)
}
/**
 * Setelah satu mata pelajaran divalidasi: bila semua mata pelajaran peserta di angkatan itu sudah tervalidasi,
 * nilai akhir program dihitung ulang dan hasil lulus atau tidak lulus ditetapkan dari rekomendasi sistem (kehadiran dan KKM).
 */
async function finalizeIfComplete(c, ctx, regId, batchId) {
  const [{ total }] = await cq(c, 'SELECT COUNT(*) total FROM batch_subjects WHERE batch_id = ?', [batchId])
  const [{ ok }] = await cq(c, "SELECT COUNT(*) ok FROM subject_grades sg JOIN batch_subjects bs ON bs.batch_id = ? AND bs.subject_id = sg.subject_id WHERE sg.registration_id = ? AND sg.status = 'validated'", [batchId, regId])
  if (!Number(total) || Number(ok) < Number(total)) return false
  const [g0] = await cq(c, "SELECT * FROM grades WHERE registration_id = ? AND status = 'draft' FOR UPDATE", [regId])
  if (!g0) return false
  const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
  if (!r || r.status !== 'active') return false
  await syncFinal(c, batchId, regId)
  const [g] = await cq(c, 'SELECT * FROM grades WHERE registration_id = ?', [regId])
  const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ?', [r.program_id])
  const passed = recommend(g, p)
  await cq(c, "UPDATE grades SET status = 'validated', passed = ?, override_reason = NULL, validated_by = ?, validated_at = ? WHERE registration_id = ?", [passed ? 1 : 0, ctx.user.id, dt(), regId])
  if (passed) {
    const { paid, scored } = await syncGraduation(c, regId)
    if (!paid || !scored) await notify(c, r.user_id, 'Lulus pelatihan, menunggu pelunasan dan nilai magang', 'Nilai akhir Anda dinyatakan lulus. Kelulusan baru sempurna setelah seluruh pembayaran lunas dan nilai magang diinput Akademik; transkrip akhir dibuka setelah itu. Cek tagihan di menu Beranda.', '/app')
  } else await cq(c, "UPDATE registrations SET status = 'completed' WHERE id = ?", [regId])
  await audit(c, ctx.user.id, 'nilai.validasi', 'grades', `${r.code} ${passed ? 'lulus' : 'tidak lulus'} (otomatis dari validasi semua mata pelajaran)`)
  return true
}
/** Angkatan yang sudah punya jadwal mata pelajaran dinilai per mata pelajaran, bukan lewat nilai program langsung. */
async function failIfSubjectBased(c, regId) {
  const [x] = await cq(c, 'SELECT 1 FROM batch_subjects bs JOIN registrations r ON r.batch_id = bs.batch_id WHERE r.id = ? LIMIT 1', [regId])
  if (x) fail('Angkatan ini dinilai per mata pelajaran: instruktur menyetor, Akademik memvalidasi per mata pelajaran.')
}
async function ownedGrade(c, user, regId) {
  const [g] = await cq(c, 'SELECT g.* FROM grades g WHERE g.registration_id = ? FOR UPDATE', [regId])
  if (!g) fail('Data nilai tidak ada.')
  // Nilai diisi instruktur yang mengampu minimal satu mata pelajaran di angkatan peserta (tanpa wali angkatan), atau Akademik dan super admin.
  if (user.role === 'instruktur') {
    const [bs] = await cq(c, 'SELECT 1 FROM batch_subjects bs JOIN registrations r ON r.batch_id = bs.batch_id WHERE r.id = ? AND bs.instructor_id = ? LIMIT 1', [regId, user.id])
    if (!bs) fail('Bukan angkatan yang Anda ajar.', 403)
  }
  return g
}
const TYPES = ['announcement_bar', 'hero', 'about', 'programs', 'upcoming_batches', 'benefits', 'testimonials', 'stats', 'faq', 'cta', 'contact', 'marquee', 'gallery', 'organization', 'location', 'social']
// Tautan akun media sosial: https:// atau mailto:, tidak boleh skema lain (mis. javascript:).
const okLinkUrl = (v) => !v || /^https:\/\/[^\s]+$/.test(v) || /^mailto:[^\s]+@[^\s]+$/.test(v)
// Foto bawaan landing page hanya boleh dari folder /landing di aplikasi sendiri.
const okLandingSrc = (v) => !v || /^\/landing\/[\w.-]+\.(jpe?g|png|webp)$/i.test(v)
function checkSections(sections) {
  if (!Array.isArray(sections) || sections.length > 40) fail('Susunan section tidak valid.')
  for (const s of sections) {
    if (!TYPES.includes(s.type)) fail(`Tipe section tidak dikenal: ${s.type}`)
    const c = s.content ?? {}
    for (const k of ['ctaHref', 'secondaryHref', 'href']) if (c[k] && !okHref(c[k])) fail('Tautan harus https:// atau path internal.')
    if (!okLandingSrc(c.photoSrc) || (Array.isArray(c.items) && c.items.some((i) => !okLandingSrc(i?.src)))) fail('Foto bawaan harus dari folder /landing.')
    if (Array.isArray(c.items) && c.items.some((i) => !okLinkUrl(i?.url))) fail('Tautan media sosial harus diawali https:// atau mailto:.')
    if (JSON.stringify(c).length > 20000) fail('Isi section terlalu panjang.')
  }
}
export { seats }

// Aksi yang ditulis sebagai run(c, ctx, ...) dijalankan dalam satu transaksi (bisa juga dipanggil langsung di dalam transaksi lain, mis. untuk uji).
for (const a of Object.values(actions)) if (a.run && !a.fn) a.fn = (ctx, ...args) => tx((c) => a.run(c, ctx, ...args))
