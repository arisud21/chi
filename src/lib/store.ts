import { useSyncExternalStore } from 'react'
import type {
  Assignment, Attendance, AuditLog, Batch, BatchSubject, Subject, CertTemplate, Certificate, ClassSession, EmailItem, Grade, MediaAsset, Material, Payment,
  Profile, Program, Registration, Revision, Installment, PaymentPlan, FeeItem, ExamToken, Doc, DocKind, Exam, QuestionBank, Question, ExamAttempt, Notification, Section, SiteSettings, Submission, User,
} from './types'

/**
 * Lapisan data frontend. Sumber kebenaran ada di server (Express + MySQL). Store ini hanya cache baca:
 * setiap aksi memanggil API, lalu mengambil ulang snapshot yang sudah difilter menurut role.
 */
export interface State {
  loaded: boolean
  devMode: boolean
  sessionUserId: string | null
  users: User[]
  programs: Program[]
  batches: Batch[]
  seats: Record<string, number>
  subjects: Subject[]
  batchSubjects: BatchSubject[]
  stats: { certificates: number; participants: number }
  registrations: Registration[]
  payments: Payment[]
  sessions: ClassSession[]
  materials: Material[]
  assignments: Assignment[]
  submissions: Submission[]
  attendances: Attendance[]
  profiles: Profile[]
  grades: Grade[]
  certificates: Certificate[]
  audit: AuditLog[]
  emails: EmailItem[]
  settings: SiteSettings
  templates: CertTemplate[]
  media: MediaAsset[]
  publishedSections: Section[]
  draftSections: Section[]
  publishedRevisionId: string | null
  revisions: Revision[]
  installments: Installment[]
  documents: Doc[]
  plans: PaymentPlan[]
  feeItems: FeeItem[]
  exams: Exam[]
  banks: QuestionBank[]
  questions: Question[]
  attempts: ExamAttempt[]
  examTokens: ExamToken[]
  notifications: Notification[]
}

const EMPTY: State = {
  loaded: false, devMode: false, sessionUserId: null, users: [], programs: [], batches: [], seats: {}, subjects: [], batchSubjects: [], stats: { certificates: 0, participants: 0 },
  registrations: [], payments: [], sessions: [], materials: [], assignments: [], submissions: [], attendances: [], profiles: [], grades: [], certificates: [],
  audit: [], emails: [], settings: {} as SiteSettings, templates: [], media: [], publishedSections: [], draftSections: [], publishedRevisionId: null, revisions: [],
  installments: [], documents: [], plans: [], feeItems: [], exams: [], banks: [], questions: [], attempts: [], examTokens: [], notifications: [],
}

let state: State = EMPTY
const listeners = new Set<() => void>()
const set = (s: State) => { state = s; listeners.forEach((l) => l()) }

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => selector(state),
  )
}
export const getState = () => state

export type Result<T = any> = { ok: true; data?: T } | { ok: false; error: string }

async function request(path: string, init?: RequestInit): Promise<Result> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', ...init })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? 'Terjadi kesalahan. Coba lagi.' }
    return { ok: true, data: json.data ?? json }
  } catch {
    return { ok: false, error: 'Server tidak dapat dihubungi. Periksa koneksi Anda.' }
  }
}

export async function refresh() {
  try {
    const res = await fetch('/api/state', { credentials: 'same-origin' })
    const s = await res.json()
    set({ ...EMPTY, ...s, loaded: true })
  } catch {
    set({ ...state, loaded: true })
  }
}

const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function rpc(name: string, ...args: unknown[]): Promise<Result> {
  const r = await post(`/api/rpc/${name}`, { args })
  await refresh()
  return r
}
async function upload(path: string, form: FormData): Promise<Result> {
  const r = await request(path, { method: 'POST', body: form })
  await refresh()
  return r
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { if (state.sessionUserId) refresh() })
  setInterval(() => { if (state.sessionUserId && !document.hidden) refresh() }, 45_000)
}

/* ---------- derived helpers (dipakai UI; keputusan final tetap dihitung server) ---------- */
export const seatsTaken = (s: State, batchId: string) => s.seats[batchId] ?? 0
export function finalScore(g: Grade, p: Program) {
  const { theoryWeight: t, practicalWeight: pr } = p.rules
  return Math.round(((g.theory * t + g.practical * pr) / (t + pr)) * 10) / 10
}
export const recommendPass = (g: Grade, p: Program) => finalScore(g, p) >= p.rules.passingScore && g.attendancePct >= p.rules.minAttendance
export const newId = (_prefix = '') => crypto.randomUUID()

/* ---------- auth ---------- */
export async function login(email: string, password: string) { const r = await post('/api/auth/login', { email, password }); await refresh(); return r }
export async function register(input: { name: string; email: string; nik: string; birthDate: string; password: string; programId: string; website?: string }) { const r = await post('/api/auth/register', input); await refresh(); return r }
export async function logout() { await post('/api/auth/logout', {}); await refresh() }
export const forgotPassword = (email: string) => post('/api/auth/forgot', { email })
export const resetPassword = (token: string, password: string) => post('/api/auth/reset', { token, password })
export async function changePassword(oldPassword: string, newPassword: string) { const r = await post('/api/auth/change-password', { oldPassword, newPassword }); await refresh(); return r }
export const verifyCertificate = (code: string) => request(`/api/verify/${encodeURIComponent(code)}`)

/* ---------- registrasi dan pembayaran ---------- */
export const createRegistration = (programId: string) => rpc('createRegistration', programId)
export const assignBatch = (regId: string, batchId: string) => rpc('assignBatch', regId, batchId)
export const cancelRegistration = (id: string, reason = '') => rpc('cancelRegistration', id, reason)
export const submitProof = (registrationId: string, v: { kind: 'pendaftaran' | 'registrasi_ulang' | 'cicilan'; installmentId?: string; payerName: string; transferDate: string; amountPaid: number; file: File }) => {
  const f = new FormData()
  f.set('kind', v.kind); if (v.installmentId) f.set('installmentId', v.installmentId)
  f.set('payerName', v.payerName); f.set('transferDate', v.transferDate); f.set('amountPaid', String(v.amountPaid)); f.set('file', v.file)
  return upload(`/api/upload/proof/${registrationId}`, f)
}
/* ---------- penerimaan: paket bayar, ujian, notifikasi ---------- */
export const choosePlan = (regId: string, planId: string) => rpc('choosePlan', regId, planId)
export const markNotificationsRead = () => rpc('markNotificationsRead')
export interface ExamSession { attemptId: string; endsAt: string; title: string; answers: Record<string, number>; questions: { id: string; body: string; options: string[] }[] }
export const startExam = (examId: string, token: string) => rpc('startExam', examId, token)
export const saveExamAnswers = (attemptId: string, answers: Record<string, number>) => post('/api/rpc/saveExamAnswers', { args: [attemptId, answers] })
export const finishExam = (attemptId: string, answers: Record<string, number>) => rpc('finishExam', attemptId, answers)
export const saveBank = (b: { id?: string; name: string }) => rpc('saveBank', b)
export const deleteBank = (id: string) => rpc('deleteBank', id)
export const saveQuestions = (bankId: string, list: { id?: string; body: string; options: string[]; correctIdx: number }[]) => rpc('saveQuestions', bankId, list)
export const deleteQuestion = (id: string) => rpc('deleteQuestion', id)
export const saveExamConfig = (e: { id?: string; title: string; bankId: string; programId: string; openAt: string; closeAt: string; durationMin: number; questionCount: number; active: boolean }) => rpc('saveExamConfig', e)
export const createExamToken = (examId: string, minutes: number) => rpc('createExamToken', examId, minutes)
export const revokeExamToken = (id: string) => rpc('revokeExamToken', id)
export const deleteExam = (id: string) => rpc('deleteExam', id)
export const decideAdmission = (regId: string, passed: boolean, batchId = '') => rpc('decideAdmission', regId, passed, batchId)
export const saveFees = (f: Record<string, unknown>) => rpc('saveFees', f)
export const setProgramPrice = (programId: string, price: number) => rpc('setProgramPrice', programId, price)
export const saveFeeItem = (x: { id?: string; name: string; amount: number; programId: string; active: boolean }) => rpc('saveFeeItem', x)
export const deleteFeeItem = (id: string) => rpc('deleteFeeItem', id)
export const savePlan = (p: { id?: string; name: string; programId: string; downPayment: number; installments: number; active: boolean }) => rpc('savePlan', p)
export const deletePlan = (id: string) => rpc('deletePlan', id)
export const saveLetterSettings = (f: Record<string, unknown>) => rpc('saveLetterSettings', f)
export const remindPayment = (regIds: string[]) => rpc('remindPayment', regIds)
export const verifyPayment = (id: string) => rpc('verifyPayment', id)
export const rejectPayment = (id: string, reason: string) => rpc('rejectPayment', id, reason)

/* ---------- data wilayah (provinsi, kota/kabupaten, kecamatan) ---------- */
export interface Area { id: string; name: string }
const areaCache = new Map<string, Promise<Area[]>>()
function area(path: string): Promise<Area[]> {
  let p = areaCache.get(path)
  if (!p) {
    p = fetch(`/api/wilayah/${path}`).then((r) => { if (!r.ok) throw new Error('gagal'); return r.json() as Promise<Area[]> })
    p.catch(() => areaCache.delete(path)) // jangan menyimpan kegagalan
    areaCache.set(path, p)
  }
  return p
}
export const getProvinces = () => area('provinces')
export const getRegencies = (provinceId: string) => area(`regencies/${provinceId}`)
export const getDistricts = (regencyId: string) => area(`districts/${regencyId}`)

/* ---------- data diri ---------- */
export const saveProfile = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return upload('/api/upload/profile', f)
}
/** Berkas registrasi ulang. Hanya bisa diunggah setelah registrasi ulang dikonfirmasi. */
export const DOC_LABEL: Record<DocKind, string> = { ktp: 'KTP', ijazah: 'Ijazah', foto: 'Pas foto 3x4', kk: 'Kartu Keluarga (KK)', buta_warna: 'Surat keterangan tidak buta warna' }
export const DOC_KINDS = Object.keys(DOC_LABEL) as DocKind[]
export const uploadDocument = (kind: DocKind, file: File) => {
  const f = new FormData()
  f.set('file', file)
  return upload(`/api/upload/document/${kind}`, f)
}
export const saveProfileAsAdmin = (userId: string, fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return upload(`/api/admin/profile/${userId}`, f)
}
export const removeDocument = (userId: string, kind: DocKind) => rpc('removeDocument', userId, kind)
export const issueNip = (regId: string) => rpc('issueNip', regId)
export const remindProfile = (userId: string) => rpc('remindProfile', userId)

/* ---------- katalog ---------- */
export const saveProgram = (p: Program) => rpc('saveProgram', p)
export const archiveProgram = (id: string) => rpc('archiveProgram', id)
export const deleteProgram = (id: string) => rpc('deleteProgram', id)
export const deleteBatch = (id: string) => rpc('deleteBatch', id)
export const saveBatch = (b: Batch) => rpc('saveBatch', b)

/* ---------- pembelajaran ---------- */
export const saveSubject = (x: Subject) => rpc('saveSubject', x)
export const importSubjects = (items: Record<string, unknown>[], updateExisting: boolean) => rpc('importSubjects', items, updateExisting)
export const readSheet = (url: string) => post('/api/subjects/sheet', { url })
export const deleteSubject = (id: string) => rpc('deleteSubject', id)
export const saveBatchSchedule = (b: { batchId: string; instructorId: string; days: string[]; startTime: string; endTime: string; location: string; subjects: { subjectId: string; sessions: number }[] }) => rpc('saveBatchSchedule', b)
export const savePertemuan = (p: { id?: string; batchId: string; subjectId: string; title: string; date: string; meetingUrl?: string }) => rpc('savePertemuan', p)
export const deletePertemuan = (id: string) => rpc('deletePertemuan', id)
export const saveMaterialLink = (m: { sessionId: string; title: string; url: string }) => rpc('saveMaterialLink', m)
export const uploadMaterial = (sessionId: string, title: string, file: File) => {
  const f = new FormData(); f.set('sessionId', sessionId); f.set('title', title); f.set('file', file)
  return upload('/api/upload/material', f)
}
export const deleteMaterial = (id: string) => rpc('deleteMaterial', id)
export const saveAssignment = (a: { batchId: string; title: string; description: string; dueAt: string }) => rpc('saveAssignment', a)
export const gradeSubmission = (id: string, score: number, feedback: string) => rpc('gradeSubmission', id, score, feedback)
export const submitWork = (assignmentId: string, note: string, file: File | null) => {
  const f = new FormData(); f.set('assignmentId', assignmentId); f.set('note', note); if (file) f.set('file', file)
  return upload('/api/upload/submission', f)
}
export const saveAttendance = (sessionId: string, marks: Record<string, Attendance['status']>) => rpc('saveAttendance', sessionId, marks)

/* ---------- nilai dan sertifikat ---------- */
export const saveGrade = (registrationId: string, patch: Partial<Pick<Grade, 'theory' | 'practical' | 'attendancePct'>>) => rpc('saveGrade', registrationId, patch)
export const submitGrade = (registrationId: string) => rpc('submitGrade', registrationId)
export const returnGrade = (registrationId: string) => rpc('returnGrade', registrationId)
export const validateGrade = (registrationId: string, passed: boolean, overrideReason?: string) => rpc('validateGrade', registrationId, passed, overrideReason)
export const issueCertificate = (registrationId: string) => rpc('issueCertificate', registrationId)
export const revokeCertificate = (id: string, reason: string) => rpc('revokeCertificate', id, reason)
export const saveTemplate = (id: string, config: unknown, activate: boolean) => rpc('saveTemplate', id, config, activate)
export const uploadTemplate = (bg: File | null, sig: File | null) => {
  const f = new FormData(); if (bg) f.set('background', bg); if (sig) f.set('signature', sig)
  return upload('/api/upload/template', f)
}

/* ---------- landing page ---------- */
export const saveDraft = (sections: Section[]) => rpc('saveDraft', sections)
export const publishDraft = (sections: Section[], note: string) => rpc('publishDraft', sections, note)
export const restoreRevision = (id: string) => rpc('restoreRevision', id)
export const uploadMedia = (file: File, alt: string) => { const f = new FormData(); f.set('alt', alt); f.set('file', file); return upload('/api/upload/media', f) }
export const deleteMedia = (id: string) => rpc('deleteMedia', id)

/* ---------- sistem ---------- */
export const saveSettings = (s: SiteSettings) => rpc('saveSettings', s)
export const saveUser = (u: User, password?: string) => rpc('saveUser', u, password)
export const sendAnnouncement = (scope: 'all' | 'program' | 'batch', scopeId: string, subject: string, body: string) => rpc('sendAnnouncement', scope, scopeId, subject, body)
