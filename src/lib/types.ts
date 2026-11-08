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
  role: Role
  emailVerified: boolean
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
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  photoFileId?: string
  ktpFileId?: string
  completed: boolean
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
}

export type BatchStatus = 'draft' | 'open' | 'running' | 'finished' | 'cancelled'
export interface Batch {
  id: string
  programId: string
  code: string
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

export type RegStatus = 'pending_payment' | 'waiting_verification' | 'active' | 'completed' | 'cancelled' | 'expired'
export interface Registration {
  id: string
  code: string
  userId: string
  batchId: string
  status: RegStatus
  priceSnapshot: number
  uniqueCode: number
  invoiceNo: string
  dueAt: string
  createdAt: string
  cancelledReason?: string
}

export type PaymentStatus = 'submitted' | 'verified' | 'rejected'
export interface Payment {
  id: string
  registrationId: string
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
  programId: string
  name: string
  kind: 'teori' | 'praktik'
  hours: number
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
}
