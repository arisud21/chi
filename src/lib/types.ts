export type Role = 'super_admin' | 'admin_pendaftaran' | 'admin_keuangan' | 'akademik' | 'instruktur' | 'peserta'

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin_pendaftaran: 'Admin Pendaftaran',
  admin_keuangan: 'Admin Keuangan',
  akademik: 'Akademik',
  instruktur: 'Instruktur',
  peserta: 'Peserta didik',
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  nik?: string
  birthDate?: string
  role: Role
  active: boolean
  mustChange?: boolean
  emailChangeable?: boolean // peserta buatan admin: boleh ganti email satu kali saat masuk pertama
  profileDone?: boolean
  instructorPrograms?: string[] // khusus instruktur: id program yang diampu dan/atau 'gabungan'
}

export interface Profile {
  userId: string
  nik: string
  birthPlace: string
  birthDate: string
  gender: 'L' | 'P'
  address: string
  rt: string
  rw: string
  districtId: string
  district: string
  cityId: string
  city: string
  provinceId: string
  province: string
  postalCode: string
  education: string
  occupation: string
  completed: boolean
  school?: string
  internshipPref?: '' | 'dalam_negeri' | 'luar_negeri'
  groomingAgreed?: boolean
  infoSource?: string
  infoSourceOther?: string
}

export interface Program {
  id: string
  slug: string
  title: string
  category: string
  shortDesc: string
  description: string
  durationHours: number
  price: number
  active: boolean
  archived: boolean
  rules: { passingScore: number; minAttendance: number }
  nipCode?: number | null // digit program di NIP, misalnya 1 untuk FB dan 2 untuk RD
}

export type BatchStatus = 'draft' | 'open' | 'running' | 'finished' | 'cancelled'
export interface Batch {
  id: string
  programId: string
  code: string
  angkatan?: number | null // angkatan ke-berapa (1 sampai 9), dipakai di NIP
  startDate: string
  endDate: string
  quota: number
  status: BatchStatus
  location: string
  scheduleDays: string
  startTime: string
  endTime: string
  plannedSessions: number
  freeRegFee?: boolean // angkatan dibebaskan dari biaya pendaftaran (biaya registrasi tetap ditagih)
}

export type Stage = 'data' | 'bayar_daftar' | 'ujian' | 'menunggu_hasil' | 'registrasi_ulang' | 'aktif' | 'tidak_lulus'
export type RegStatus = 'pending_payment' | 'waiting_verification' | 'active' | 'completed' | 'cancelled' | 'expired'
export interface Registration {
  id: string
  code: string
  userId: string
  programId: string
  batchId: string // kosong sampai admin menyatakan peserta lulus
  status: RegStatus
  stage: Stage
  nip?: string // Nomor Induk Peserta, terbit saat registrasi ulang dikonfirmasi
  admissionNo?: number
  planId?: string
  priceSnapshot: number
  uniqueCode: number
  invoiceNo: string
  dueAt: string
  createdAt: string
  cancelledReason?: string
  followUpAt?: string // kapan pendaftar mundur ditandai sudah di-follow up lewat WhatsApp; kosong = belum
  followUpBy?: string
  paidOff?: boolean // seluruh pembayaran sudah lunas (syarat kelulusan sempurna dan penempatan magang)
  canResume?: boolean // calon peserta didik yang mundur dan boleh melanjutkan proses (tombol Lanjutkan proses)
  autoWithdrawn?: boolean // dinyatakan mundur otomatis oleh sistem (2 minggu tanpa proses); pendaftar boleh melanjutkan sendiri
  source?: string // 'admin' = ditambahkan atau diimpor admin
}

export type PaymentStatus = 'submitted' | 'verified' | 'rejected'
export type PayKind = 'pendaftaran' | 'registrasi_ulang' | 'cicilan'
export interface Payment {
  id: string
  registrationId: string
  kind: PayKind
  installmentId?: string
  amountDue: number
  amountPaid: number
  payerName: string
  transferDate: string
  proofFileId?: string
  status: PaymentStatus
  rejectReason?: string
  receiptNo?: string
  verifiedBy?: string
  note?: string // ada = dicatat langsung oleh keuangan
  createdAt: string
}

export interface Subject {
  id: string
  programId: string // kosong = kelas gabungan, berlaku untuk semua pelatihan
  code?: string
  name: string
  kind: 'teori' | 'praktik' | 'teori_praktik'
  hours: number // jumlah jam per program
  hoursPerMeeting?: number | null
  meetings?: number | null
  description: string
  active: boolean
}

/** Jadwal satu mata pelajaran di satu angkatan: pengampu, hari (dipisah koma), jam, dan ruang kelasnya. */
export interface BatchSubject {
  batchId: string; subjectId: string; sessions: number
  instructorId: string; days: string; startTime: string; endTime: string; room: string
  groupId: string // kelas gabungan: sama untuk semua angkatan yang ikut kelas yang sama; kosong = jadwal sendiri
  weights?: { absensi: number; tugas: number; teori: number; praktik: number } | null // bobot nilai mapel ini (persen, jumlah 100); null = bobot default Akademik
}

export interface ClassSession {
  id: string
  batchId: string
  subjectId?: string
  title: string
  startAt: string
  location: string
  meetingUrl?: string
}

export type GradeStatus = 'draft' | 'submitted' | 'validated'
export interface Grade {
  registrationId: string
  theory: number
  practical: number
  attendancePct: number
  finalScore?: number | null // rata-rata nilai akhir semua mata pelajaran; kosong = rumus bobot teori/praktik program (data lama)
  status: GradeStatus
  passed?: boolean
  overrideReason?: string
}

/** Nilai tugas, teori (UTS), dan praktik (UAS) satu peserta di satu mata pelajaran, skala 0-100, diisi manual. null = belum diisi. */
export interface SubjectGrade {
  registrationId: string
  subjectId: string
  task: number | null
  theory: number | null
  practical: number | null
  status?: 'draft' | 'submitted' | 'validated' // draft = instruktur mengisi, submitted = disetor ke Akademik, validated = masuk transkrip
  validatedAt?: string | null
}

export interface Material {
  id: string
  batchId: string
  title: string
  kind: string
  sessionId?: string
  fileId?: string
  url?: string
}

export interface Assignment {
  id: string
  batchId: string
  subjectId?: string // kosong = tugas umum angkatan (data lama)
  title: string
  description: string
  dueAt: string
}

export interface Submission {
  id: string
  assignmentId: string
  registrationId: string
  fileId?: string
  note: string
  score?: number
  feedback?: string
  submittedAt: string
}

export interface MediaAsset { id: string; name: string; alt: string; at: string }

export interface AuditLog {
  id: string
  at: string
  userId: string
  action: string
  entity: string
  detail: string
}

export interface EmailItem {
  id: string
  at: string
  to: string
  subject: string
  status: 'queued' | 'sent'
}

export type SectionType =
  | 'announcement_bar' | 'hero' | 'about' | 'programs' | 'upcoming_batches'
  | 'benefits' | 'testimonials' | 'stats' | 'faq' | 'cta' | 'contact' | 'marquee' | 'gallery' | 'organization' | 'location' | 'social'

/** CHI Today: kabar kegiatan untuk publik. featured = tampil di bagian Kegiatan pada landing page. */
export interface ChiTodayItem {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  tag: string
  eventDate: string
  imageId: string
  imageSrc: string
  published: boolean
  featured: boolean
  sort: number
  createdAt: string
}

export interface Section {
  id: string
  type: SectionType
  visible: boolean
  content: Record<string, any>
}

export interface Revision {
  id: string
  at: string
  by: string
  note: string
  sections: Section[]
}

export interface Attendance {
  sessionId: string
  registrationId: string
  status: 'hadir' | 'izin' | 'sakit' | 'alpa'
}

export interface SiteSettings {
  signerName: string
  signerTitle: string
  name: string
  bankName: string
  bankAccount: string
  bankHolder: string
  payDueHours: number
  phone: string
  whatsapp: string
  address: string
  hours: string
  regFee?: number
  minReenroll?: number
  reenrollDue?: string
  refundCutoff?: string
  pelunasanDue?: string
  kuliahUmum?: string
  trainingStart?: string
  lpkRegNo?: string
  ketuaName?: string
  batchLabel?: string
  email?: string
  website?: string
  hotline?: string
  campusNote?: string
  signatureFileId?: string
}

export type DocKind = 'ktp' | 'ijazah' | 'foto' | 'kk' | 'buta_warna'
export interface Doc { id: string; userId: string; kind: DocKind; fileId: string; createdAt: string }
export interface FeeItem { id: string; name: string; amount: number; programId: string; userId: string; active: boolean }
export interface Installment { id: string; registrationId: string; seq: number; amount: number; paidAmount: number; dueDate: string; status: 'unpaid' | 'partial' | 'submitted' | 'paid' }
export interface PaymentPlan { id: string; programId: string; name: string; downPayment: number; installments: number; active: boolean }
export interface Exam {
  id: string; title: string; bankId: string; programId: string; openAt: string; closeAt: string; durationMin: number; questionCount: number; active: boolean
  mine?: 'none' | 'running' | 'done' // hanya untuk peserta
}
export interface ExamToken { id: string; examId: string; token: string; expiresAt: string; createdAt: string }
export interface QuestionBank { id: string; name: string; count: number }
export interface Question { id: string; bankId: string; body: string; options: string[]; correctIdx: number }
export interface ExamAttempt { id: string; examId: string; registrationId: string; startedAt: string; finishedAt: string; score: number | null }
export interface Notification { id: string; title: string; body: string; link: string; read: boolean; createdAt: string }

export interface Company { id: string; name: string; category: string; address: string; city: string; country: string; contactName: string; contactPhone: string; contactEmail: string; notes: string; active: boolean }
export interface Placement { id: string; registrationId: string; companyId: string; kind: 'magang' | 'kerja'; position: string; startDate: string; endDate: string; score: number | null; status: 'berjalan' | 'selesai' | 'batal'; notes: string }
export interface CashTx { id: string; direction: 'masuk' | 'keluar'; category: string; date: string; amount: number; description: string; createdAt: string }
export interface LogbookEntry { id: string; placementId: string; date: string; activity: string; learning: string; hours: number; status: 'diajukan' | 'disetujui' | 'revisi'; reviewerNote: string; reviewedAt: string }

export interface NewsItem { id: string; title: string; body: string; audience: string[]; startsOn: string; endsOn: string; active: boolean; createdAt: string; read: boolean; eligible: boolean; readCount: number }