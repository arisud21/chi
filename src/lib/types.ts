export type Role = 'super_admin' | 'admin_pendaftaran' | 'admin_keuangan' | 'akademik' | 'instruktur' | 'peserta'

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin_pendaftaran: 'Admin Pendaftaran',
  admin_keuangan: 'Admin Keuangan',
  akademik: 'Akademik',
  instruktur: 'Instruktur',
  peserta: 'Peserta',
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
  profileDone?: boolean
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
  rules: { theoryWeight: number; practicalWeight: number; passingScore: number; minAttendance: number }
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
  instructorId: string
  location: string
  scheduleDays: string
  startTime: string
  endTime: string
  plannedSessions: number
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

export interface BatchSubject { batchId: string; subjectId: string; sessions: number }

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
  status: GradeStatus
  passed?: boolean
  overrideReason?: string
}

export interface Certificate {
  id: string
  registrationId: string
  number: string
  verificationCode: string
  status: 'issued' | 'revoked'
  issuedAt: string
  revokedReason?: string
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

export interface FieldCfg { x: number; y: number; size: number; color: string; align: 'left' | 'center' | 'right' }
export interface TemplateConfig {
  fields: Record<string, FieldCfg>
  qr: { x: number; y: number; size: number }
  signature: { x: number; y: number; size: number }
}
export interface CertTemplate {
  id: string
  version: number
  config: TemplateConfig
  isActive: boolean
  hasBackground: boolean
  hasSignature: boolean
  backgroundFileId?: string
  signatureFileId?: string
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
  | 'benefits' | 'testimonials' | 'stats' | 'faq' | 'cta' | 'contact'

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
}

export type DocKind = 'ktp' | 'ijazah' | 'foto' | 'kk' | 'buta_warna'
export interface Doc { id: string; userId: string; kind: DocKind; fileId: string; createdAt: string }
export interface FeeItem { id: string; name: string; amount: number; programId: string; active: boolean }
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
