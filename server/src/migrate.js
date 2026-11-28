// Migrasi ringan untuk database yang sudah berjalan: menambah kolom baru bila belum ada. Aman dijalankan berulang.
import { q, uid } from './lib.js'

/**
 * Lengkapi kurikulum yang belum diisi (aman dijalankan berulang):
 * mata pelajaran pelatihan tanpa kurikulum masuk ke kurikulum terbaru pelatihannya (dibuat "Kurikulum awal" bila belum ada),
 * dan angkatan tanpa kurikulum memakai kurikulum terbaru pelatihannya.
 */
export async function ensureCurricula() {
  for (const { program_id: pid } of await q('SELECT DISTINCT program_id FROM subjects WHERE program_id IS NOT NULL AND curriculum_id IS NULL')) {
    let [cur] = await q('SELECT id FROM curricula WHERE program_id = ? ORDER BY is_active DESC, created_at DESC LIMIT 1', [pid])
    if (!cur) { cur = { id: uid() }; await q("INSERT INTO curricula (id, program_id, name, description) VALUES (?, ?, 'Kurikulum awal', 'Dibuat otomatis dari bank mata pelajaran sebelumnya.')", [cur.id, pid]) }
    await q('UPDATE subjects SET curriculum_id = ? WHERE program_id = ? AND curriculum_id IS NULL', [cur.id, pid])
  }
  await q(`UPDATE batches b SET b.curriculum_id = (SELECT c.id FROM curricula c WHERE c.program_id = b.program_id ORDER BY c.is_active DESC, c.created_at DESC LIMIT 1)
    WHERE b.curriculum_id IS NULL`)
  // Kelas gabungan tidak lagi dibuat di bank mata pelajaran (diatur di Jadwal pembelajaran). Mata pelajaran gabungan lama yang belum
  // dipakai jadwal atau pertemuan disalin ke setiap kurikulum (kecuali yang sudah punya nama sama), lalu yang lama dihapus.
  // Yang sudah dipakai dibiarkan agar jadwal dan nilainya tetap utuh.
  const legacy = await q(`SELECT * FROM subjects s WHERE s.program_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM batch_subjects bs WHERE bs.subject_id = s.id) AND NOT EXISTS (SELECT 1 FROM class_sessions cs WHERE cs.subject_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.subject_id = s.id) AND NOT EXISTS (SELECT 1 FROM subject_grades g WHERE g.subject_id = s.id)`)
  const curricula = await q('SELECT id, program_id FROM curricula')
  if (!curricula.length) return // belum ada kurikulum tujuan: jangan hapus apa pun
  for (const sj of legacy) {
    for (const cur of curricula) {
      const [dup] = await q('SELECT id FROM subjects WHERE curriculum_id = ? AND LOWER(name) = LOWER(?)', [cur.id, sj.name])
      if (dup) continue
      await q('INSERT INTO subjects (id, program_id, curriculum_id, code, name, kind, hours, hours_per_meeting, meetings, description, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), cur.program_id, cur.id, sj.code, sj.name, sj.kind, sj.hours, sj.hours_per_meeting, sj.meetings, sj.description, sj.is_active])
    }
    await q('DELETE FROM subjects WHERE id = ?', [sj.id])
  }
}

const COLUMNS = [
  // Biaya tambahan bisa ditetapkan untuk satu peserta didik (user_id terisi) selain per program.
  ['fee_items', 'user_id', 'CHAR(36) NULL'],
  // Jadwal per mata pelajaran di tiap angkatan: instruktur, hari, jam, dan ruang kelasnya masing-masing.
  ['batch_subjects', 'instructor_id', 'CHAR(36) NULL'],
  ['batch_subjects', 'schedule_days', "VARCHAR(40) NOT NULL DEFAULT ''"],
  ['batch_subjects', 'start_time', 'TIME NULL'],
  ['batch_subjects', 'end_time', 'TIME NULL'],
  ['batch_subjects', 'room', "VARCHAR(160) NOT NULL DEFAULT ''"],
  // Kelas gabungan: jadwal mata pelajaran yang sama di beberapa angkatan (lintas program) diikat dengan group_id yang sama.
  ['batch_subjects', 'group_id', 'CHAR(36) NULL'],
  // Tugas milik satu mata pelajaran (kosong = tugas umum angkatan, data lama).
  ['assignments', 'subject_id', 'CHAR(36) NULL'],
  // Program yang diampu instruktur, dipisah koma: id program (mis. Room Division, Food & Beverage) dan/atau 'gabungan' untuk kelas gabungan.
  ['users', 'instructor_program', 'VARCHAR(500) NULL'],
  // 1 = peserta ditambahkan admin dan masih boleh mengganti email satu kali saat masuk pertama.
  ['users', 'email_change_left', 'TINYINT(1) NOT NULL DEFAULT 0'],
  // Nilai tugas per mata pelajaran, diisi manual instruktur (tabel subject_grades dibuat lebih dulu tanpa kolom ini di versi awal).
  ['subject_grades', 'task', 'DECIMAL(5,1) NULL'],
  // Bobot nilai per mata pelajaran di tiap angkatan (NULL = bobot default Akademik) dan nilai akhir program hasil rata-rata mata pelajaran.
  ['batch_subjects', 'w_absensi', 'INT NULL'],
  ['batch_subjects', 'w_tugas', 'INT NULL'],
  ['batch_subjects', 'w_teori', 'INT NULL'],
  ['batch_subjects', 'w_praktik', 'INT NULL'],
  ['grades', 'final_score', 'DECIMAL(5,1) NULL'],
  // Status nilai per mata pelajaran: draft (instruktur mengisi), submitted (disetor ke Akademik), validated (diverifikasi Akademik, masuk transkrip).
  ['subject_grades', 'status', "ENUM('draft','submitted','validated') NOT NULL DEFAULT 'draft'"],
  ['subject_grades', 'submitted_at', 'DATETIME NULL'],
  ['subject_grades', 'validated_by', 'CHAR(36) NULL'],
  ['subject_grades', 'validated_at', 'DATETIME NULL'],
  // Bobot nilai khusus angkatan yang disesuaikan instruktur wali. NULL = ikut bobot default program dari Akademik.
  ['batches', 'theory_weight', 'INT NULL'],
  ['batches', 'practical_weight', 'INT NULL'],
  // Angkatan yang dibebaskan dari biaya pendaftaran (dianggap lunas). Biaya registrasi tetap ditagih.
  ['batches', 'free_reg_fee', 'TINYINT(1) NOT NULL DEFAULT 0'],
  // Asal registrasi: 'admin' = ditambahkan atau diimpor Super Admin/Akademik (tanpa alur pendaftaran). NULL = daftar sendiri.
  ['registrations', 'source', 'VARCHAR(10) NULL'],
  // Catatan pembayaran yang dicatat langsung oleh keuangan.
  ['payments', 'note', 'VARCHAR(255) NULL'],
  // Penanda follow up WhatsApp untuk pendaftar yang mundur.
  ['registrations', 'followup_at', 'DATETIME NULL'],
  ['registrations', 'followup_by', 'CHAR(36) NULL'],
  // Waktu pendaftar melanjutkan proses setelah dinyatakan mundur otomatis (hitungan 2 minggu dimulai ulang).
  ['registrations', 'resumed_at', 'DATETIME NULL'],
  // Token ujian otomatis per pendaftar (NULL = token umum buatan admin).
  ['exam_tokens', 'registration_id', 'CHAR(36) NULL'],
  // Data diri tambahan pendaftar: kesediaan magang, grooming, dan sumber informasi pendaftaran.
  ['participant_profiles', 'internship_pref', "ENUM('dalam_negeri','luar_negeri') NULL"],
  ['participant_profiles', 'grooming_agreed', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['participant_profiles', 'info_source', 'VARCHAR(30) NULL'],
  ['participant_profiles', 'info_source_other', 'VARCHAR(100) NULL'],
  // Nilai magang (diinput Akademik) dan negara perusahaan mitra: dipakai transkrip akhir pelatihan.
  ['placements', 'score', 'DECIMAL(5,1) NULL'],
  ['companies', 'country', "VARCHAR(80) NOT NULL DEFAULT 'Indonesia'"],
  // Kurikulum pelatihan: mata pelajaran milik satu kurikulum, dan tiap angkatan memakai satu kurikulum.
  ['subjects', 'curriculum_id', 'CHAR(36) NULL'],
  ['batches', 'curriculum_id', 'CHAR(36) NULL'],
]

// Tabel baru untuk database yang sudah berjalan (sama dengan schema.sql).
const TABLES = [
  // Data diri dan sertifikat instruktur (sama dengan schema.sql).
  `CREATE TABLE IF NOT EXISTS staff_profiles (
      user_id CHAR(36) PRIMARY KEY,
      birth_place VARCHAR(80) NULL,
      gender ENUM('L','P') NULL,
      marital ENUM('belum_kawin','kawin','cerai_hidup','cerai_mati') NULL,
      religion VARCHAR(30) NULL,
      address VARCHAR(500) NULL,
      photo_file_id CHAR(36) NULL,
      cv_file_id CHAR(36) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS staff_certificates (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      file_id CHAR(36) NOT NULL,
      label VARCHAR(160) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Potongan biaya per pendaftar (sama dengan schema.sql).
  `CREATE TABLE IF NOT EXISTS registration_discounts (
    id CHAR(36) PRIMARY KEY,
    registration_id CHAR(36) NOT NULL,
    target VARCHAR(50) NOT NULL,
    label VARCHAR(120) NOT NULL,
    amount BIGINT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (registration_id, target),
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Kurikulum pelatihan (sama dengan schema.sql).
  `CREATE TABLE IF NOT EXISTS curricula (
    id CHAR(36) PRIMARY KEY,
    program_id CHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (program_id, name),
    FOREIGN KEY (program_id) REFERENCES programs(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // CHI Today: kabar kegiatan untuk publik. is_featured = tampil di bagian Kegiatan pada landing page.
  `CREATE TABLE IF NOT EXISTS chi_today (
    id CHAR(36) PRIMARY KEY,
    slug VARCHAR(180) NOT NULL UNIQUE,
    title VARCHAR(160) NOT NULL,
    summary VARCHAR(300) NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    tag VARCHAR(60) NOT NULL DEFAULT '',
    event_date DATE NULL,
    image_id CHAR(36) NULL,
    image_src VARCHAR(120) NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 1,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_by CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Manajemen kas: transaksi manual. Kas masuk dari pembayaran peserta dihitung langsung dari tabel payments, tidak disalin ke sini.
  `CREATE TABLE IF NOT EXISTS cash_transactions (
    id CHAR(36) PRIMARY KEY,
    direction ENUM('masuk','keluar') NOT NULL,
    category VARCHAR(40) NOT NULL,
    tx_date DATE NOT NULL,
    amount DECIMAL(14,0) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_by CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Nilai teori dan praktik per mata pelajaran (sama dengan schema.sql).
  `CREATE TABLE IF NOT EXISTS subject_grades (
    registration_id CHAR(36) NOT NULL,
    subject_id CHAR(36) NOT NULL,
    task DECIMAL(5,1) NULL,
    theory DECIMAL(5,1) NULL,
    practical DECIMAL(5,1) NULL,
    PRIMARY KEY (registration_id, subject_id),
    FOREIGN KEY (registration_id) REFERENCES registrations(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]

export async function migrate() {
  for (const sql of TABLES) await q(sql)
  const added = []
  for (const [table, col, def] of COLUMNS) {
    const [r] = await q('SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, col])
    if (!Number(r.n)) { await q(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); added.push(`${table}.${col}`) }
  }
  // Nama mata pelajaran kini unik per kurikulum (bukan per pelatihan), agar kurikulum baru boleh memuat nama yang sama.
  const idx = await q("SELECT INDEX_NAME n, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND NON_UNIQUE = 0 GROUP BY INDEX_NAME")
  if (!idx.some((x) => x.n === 'uq_subject_curriculum')) await q('ALTER TABLE subjects ADD UNIQUE KEY uq_subject_curriculum (program_id, curriculum_id, name)')
  for (const x of idx) if (x.cols === 'program_id,name') await q(`ALTER TABLE subjects DROP INDEX \`${x.n}\``)
  await ensureCurricula()
  // Dulu instructor_program hanya muat satu program (VARCHAR(36)); kini bisa banyak, jadi diperlebar.
  const [w] = await q("SELECT CHARACTER_MAXIMUM_LENGTH len FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'instructor_program'")
  if (w && Number(w.len) < 500) await q('ALTER TABLE users MODIFY COLUMN instructor_program VARCHAR(500) NULL')
  // Aturan mundur otomatis 2 minggu baru berlaku: pendaftar yang sedang berjalan mendapat 2 minggu penuh mulai sekarang.
  if (added.includes('registrations.resumed_at')) await q("UPDATE registrations SET resumed_at = NOW() WHERE status = 'pending_payment'")
  // Samakan penulisan pendidikan lama dengan daftar pilihan baru.
  await q("UPDATE participant_profiles SET education = 'SMA/SMK/MA' WHERE education = 'SMA/SMK'")
  await q("UPDATE participant_profiles SET education = 'S1/D4' WHERE education = 'S1'")
  // Sekali saja, saat kolom source baru ditambahkan: tandai peserta didik yang dibuat admin sebelum kolom ini ada,
  // yaitu yang sudah aktif tanpa satu pun catatan pembayaran atau jadwal cicilan (alur pendaftaran biasa selalu punya pembayaran).
  if (added.includes('registrations.source')) {
    await q(`UPDATE registrations r SET r.source = 'admin' WHERE r.source IS NULL AND r.stage = 'aktif'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id) AND NOT EXISTS (SELECT 1 FROM installments i WHERE i.registration_id = r.id)`)
  }
}
