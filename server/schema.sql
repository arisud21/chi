-- Skema MySQL 8 / MariaDB 10.4 untuk SIM Cimahi Institute Hotel (PRD §9). JSON disimpan sebagai TEXT agar portabel.
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  nik CHAR(16) NULL UNIQUE,
  birth_date DATE NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('super_admin','admin_pendaftaran','admin_keuangan','akademik','instruktur','peserta') NOT NULL,
  email_verified_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_tokens (
  token CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind ENUM('verify','reset') NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programs (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(160) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  short_desc VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT,
  duration_hours INT NOT NULL,
  price BIGINT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at DATETIME NULL,
  theory_weight INT NOT NULL DEFAULT 30,
  practical_weight INT NOT NULL DEFAULT 70,
  passing_score INT NOT NULL DEFAULT 70,
  min_attendance INT NOT NULL DEFAULT 80,
  nip_code TINYINT NULL -- digit program di NIP, misalnya 1 untuk FB dan 2 untuk RD
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS batches (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  quota INT NOT NULL,
  status ENUM('draft','open','running','finished','cancelled') NOT NULL DEFAULT 'draft',
  instructor_id CHAR(36) NULL,
  location VARCHAR(160) NOT NULL DEFAULT '',
  schedule_days VARCHAR(40) NOT NULL DEFAULT '',
  start_time TIME NULL,
  end_time TIME NULL,
  planned_sessions INT NOT NULL DEFAULT 0,
  angkatan TINYINT NULL, -- angkatan ke-berapa (1 sampai 9), dipakai di NIP
  FOREIGN KEY (program_id) REFERENCES programs(id),
  FOREIGN KEY (instructor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registrations (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  program_id CHAR(36) NOT NULL,
  batch_id CHAR(36) NULL, -- diisi admin saat peserta dinyatakan lulus
  status ENUM('pending_payment','waiting_verification','active','completed','cancelled','expired') NOT NULL DEFAULT 'pending_payment',
  -- tahapan penerimaan: data diri, bayar pendaftaran, ujian tulis, menunggu hasil, registrasi ulang, aktif belajar
  stage ENUM('data','bayar_daftar','ujian','menunggu_hasil','registrasi_ulang','aktif','tidak_lulus') NOT NULL DEFAULT 'data',
  admission_no INT NULL,
  admission_at DATETIME NULL,
  plan_id CHAR(36) NULL,
  nip VARCHAR(12) NULL UNIQUE, -- Nomor Induk Peserta: tahun masuk + angkatan + kode program + nomor urut
  price_snapshot BIGINT NOT NULL,
  unique_code INT NOT NULL,
  invoice_no VARCHAR(30) NOT NULL UNIQUE,
  due_at DATETIME NOT NULL,
  cancelled_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, status), INDEX (batch_id, status), INDEX (program_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (program_id) REFERENCES programs(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS files (
  id CHAR(36) PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  original_name VARCHAR(200) NOT NULL,
  stored_name VARCHAR(80) NOT NULL,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL,
  owner_id CHAR(36) NULL,
  alt_text VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  registration_id CHAR(36) NOT NULL,
  kind ENUM('pendaftaran','registrasi_ulang','cicilan') NOT NULL DEFAULT 'registrasi_ulang',
  installment_id CHAR(36) NULL,
  amount_due BIGINT NOT NULL,
  amount_paid BIGINT NOT NULL,
  payer_name VARCHAR(120) NOT NULL,
  transfer_date DATE NOT NULL,
  proof_file_id CHAR(36) NULL,
  status ENUM('submitted','verified','rejected') NOT NULL DEFAULT 'submitted',
  reject_reason VARCHAR(255) NULL,
  receipt_no VARCHAR(40) NULL UNIQUE,
  verified_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (status, created_at),
  FOREIGN KEY (registration_id) REFERENCES registrations(id),
  FOREIGN KEY (proof_file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bank mata pelajaran per pelatihan (program). Dikelola Akademik.
CREATE TABLE IF NOT EXISTS subjects (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NULL, -- NULL = kelas gabungan, berlaku untuk semua pelatihan
  code VARCHAR(12) NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('teori','praktik','teori_praktik') NOT NULL,
  hours INT NOT NULL, -- jumlah jam per program
  hours_per_meeting INT NULL,
  meetings INT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE (program_id, name),
  FOREIGN KEY (program_id) REFERENCES programs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mata pelajaran yang dipilih Akademik untuk satu angkatan, beserta jumlah pertemuannya.
CREATE TABLE IF NOT EXISTS batch_subjects (
  batch_id CHAR(36) NOT NULL,
  subject_id CHAR(36) NOT NULL,
  sessions_planned INT NOT NULL,
  PRIMARY KEY (batch_id, subject_id),
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_sessions (
  id CHAR(36) PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  subject_id CHAR(36) NULL,
  title VARCHAR(160) NOT NULL,
  start_at DATETIME NOT NULL,
  location VARCHAR(160) NOT NULL DEFAULT '',
  meeting_url VARCHAR(255) NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS materials (
  id CHAR(36) PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  session_id CHAR(36) NULL,
  file_id CHAR(36) NULL,
  url VARCHAR(255) NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assignments (
  id CHAR(36) PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  due_at DATETIME NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS submissions (
  id CHAR(36) PRIMARY KEY,
  assignment_id CHAR(36) NOT NULL,
  registration_id CHAR(36) NOT NULL,
  file_id CHAR(36) NULL,
  note VARCHAR(500) NULL,
  score INT NULL,
  feedback VARCHAR(500) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, registration_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendances (
  session_id CHAR(36) NOT NULL,
  registration_id CHAR(36) NOT NULL,
  status ENUM('hadir','izin','sakit','alpa') NOT NULL,
  PRIMARY KEY (session_id, registration_id),
  FOREIGN KEY (session_id) REFERENCES class_sessions(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grades (
  registration_id CHAR(36) PRIMARY KEY,
  theory DECIMAL(5,1) NOT NULL DEFAULT 0,
  practical DECIMAL(5,1) NOT NULL DEFAULT 0,
  attendance_pct DECIMAL(5,1) NOT NULL DEFAULT 0,
  status ENUM('draft','submitted','validated') NOT NULL DEFAULT 'draft',
  passed TINYINT(1) NULL,
  override_reason VARCHAR(255) NULL,
  validated_by CHAR(36) NULL,
  validated_at DATETIME NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS certificate_templates (
  id CHAR(36) PRIMARY KEY,
  version INT NOT NULL,
  background_file_id CHAR(36) NULL,
  signature_file_id CHAR(36) NULL,
  config TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS certificate_sequences (year INT PRIMARY KEY, last_number INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS certificates (
  id CHAR(36) PRIMARY KEY,
  registration_id CHAR(36) NOT NULL,
  template_id CHAR(36) NULL,
  number VARCHAR(40) NOT NULL UNIQUE,
  verification_code CHAR(10) NOT NULL UNIQUE,
  status ENUM('issued','revoked') NOT NULL DEFAULT 'issued',
  revoked_reason VARCHAR(255) NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  detail VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (entity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  to_email VARCHAR(160) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  body TEXT,
  status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (k VARCHAR(40) PRIMARY KEY, v TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS landing_revisions (
  id CHAR(36) PRIMARY KEY,
  snapshot TEXT NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Data diri peserta: diisi setelah pembayaran dikonfirmasi, sebelum kelas dimulai.
CREATE TABLE IF NOT EXISTS participant_profiles (
  user_id CHAR(36) PRIMARY KEY,
  nik CHAR(16) NOT NULL UNIQUE,
  birth_place VARCHAR(80) NOT NULL,
  birth_date DATE NOT NULL,
  gender ENUM('L','P') NOT NULL,
  address VARCHAR(255) NOT NULL,
  rt VARCHAR(3) NOT NULL DEFAULT '',
  rw VARCHAR(3) NOT NULL DEFAULT '',
  district_id CHAR(7) NOT NULL,
  district VARCHAR(80) NOT NULL,
  city_id CHAR(4) NOT NULL,
  city VARCHAR(80) NOT NULL,
  province_id CHAR(2) NOT NULL,
  province VARCHAR(80) NOT NULL,
  postal_code CHAR(5) NOT NULL,
  education VARCHAR(20) NOT NULL,
  occupation VARCHAR(80) NOT NULL,
  school VARCHAR(160) NULL,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Penerimaan: opsi cicilan, ujian tulis, notifikasi dalam aplikasi
CREATE TABLE IF NOT EXISTS payment_plans (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NULL,
  name VARCHAR(80) NOT NULL,
  down_payment BIGINT NOT NULL,
  installments INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS installments (
  id CHAR(36) PRIMARY KEY,
  registration_id CHAR(36) NOT NULL,
  seq INT NOT NULL,
  amount BIGINT NOT NULL,
  paid_amount BIGINT NOT NULL DEFAULT 0, -- terisi dari pembayaran terkonfirmasi, kelebihan memotong termin berikutnya
  due_date DATE NOT NULL,
  status ENUM('unpaid','partial','submitted','paid') NOT NULL DEFAULT 'unpaid',
  UNIQUE (registration_id, seq),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS question_banks (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS questions (
  id CHAR(36) PRIMARY KEY,
  bank_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_idx TINYINT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (bank_id),
  FOREIGN KEY (bank_id) REFERENCES question_banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS exams (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  bank_id CHAR(36) NOT NULL,
  program_id CHAR(36) NULL,
  open_at DATETIME NOT NULL,
  close_at DATETIME NOT NULL,
  duration_min INT NOT NULL,
  question_count INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bank_id) REFERENCES question_banks(id),
  FOREIGN KEY (program_id) REFERENCES programs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS exam_attempts (
  id CHAR(36) PRIMARY KEY,
  exam_id CHAR(36) NOT NULL,
  registration_id CHAR(36) NOT NULL,
  question_ids TEXT NOT NULL,
  answers TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  score DECIMAL(5,2) NULL,
  UNIQUE (exam_id, registration_id),
  FOREIGN KEY (exam_id) REFERENCES exams(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  link VARCHAR(120) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Biaya tambahan (jas almamater dan sejenisnya): masuk ke total yang dicicil peserta
CREATE TABLE IF NOT EXISTS fee_items (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  amount BIGINT NOT NULL,
  program_id CHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Token ujian dipisah dari ujian: masa aktifnya dipilih admin saat token dibuat
CREATE TABLE IF NOT EXISTS exam_tokens (
  id CHAR(36) PRIMARY KEY,
  exam_id CHAR(36) NOT NULL,
  token VARCHAR(12) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (exam_id, token),
  FOREIGN KEY (exam_id) REFERENCES exams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Berkas registrasi ulang: KTP, ijazah, pas foto 3x4, KK, surat tidak buta warna. Diunggah setelah registrasi ulang dikonfirmasi.
CREATE TABLE IF NOT EXISTS registration_documents (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind ENUM('ktp','ijazah','foto','kk','buta_warna') NOT NULL,
  file_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, kind),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
