import { useSyncExternalStore } from 'react'
import type {
  Assignment, Attendance, AuditLog, ChiTodayItem, Batch, BatchSubject, Subject, ClassSession, EmailItem, Grade, SubjectGrade, MediaAsset, Material, Payment,
  Profile, Program, Registration, Revision, Installment, PaymentPlan, FeeItem, ExamToken, Doc, DocKind, Exam, QuestionBank, Question, ExamAttempt, Notification, Company, Placement, LogbookEntry, CashTx, NewsItem, Section, SiteSettings, Submission, User,
} from './types'

/**
 * Lapisan data frontend. Sumber kebenaran ada di server (Express + MySQL). Store ini hanya cache baca:
 * setiap aksi memanggil API, lalu mengambil ulang snapshot yang sudah difilter menurut role.
 */
export interface State {
  loaded: boolean
  devMode: boolean
  sessionUserId: string | null
  impersonatedBy?: { id: string; name: string } | null // Super Admin yang sedang masuk sebagai instruktur
  users: User[]
  programs: Program[]
  batches: Batch[]
  seats: Record<string, number>
  subjects: Subject[]
  batchSubjects: BatchSubject[]
  stats: { graduates: number; participants: number }
  registrations: Registration[]
  payments: Payment[]
  sessions: ClassSession[]
  materials: Material[]
  assignments: Assignment[]
  submissions: Submission[]
  attendances: Attendance[]
  profiles: Profile[]
  grades: Grade[]
  subjectGrades: SubjectGrade[]
  gradeWeights: { absensi: number; tugas: number; teori: number; praktik: number } // bobot nilai default dari Akademik
  gradeLetters: number[] // batas bawah nilai huruf A, AB, B, BC, C, CD, D (E = di bawahnya) dari Akademik
  audit: AuditLog[]
  emails: EmailItem[]
  settings: SiteSettings
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
  companies: Company[]
  placements: Placement[]
  logbook: LogbookEntry[]
  cashTx: CashTx[]
  news: NewsItem[]
  chiToday: ChiTodayItem[]
}

const EMPTY: State = {
  loaded: false, devMode: false, sessionUserId: null, users: [], programs: [], batches: [], seats: {}, subjects: [], batchSubjects: [], stats: { graduates: 0, participants: 0 },
  registrations: [], payments: [], sessions: [], materials: [], assignments: [], submissions: [], attendances: [], profiles: [], grades: [], subjectGrades: [], gradeWeights: { absensi: 10, tugas: 20, teori: 30, praktik: 40 }, gradeLetters: [85, 80, 75, 70, 60, 50, 40],
  audit: [], emails: [], settings: {} as SiteSettings, media: [], publishedSections: [], draftSections: [], publishedRevisionId: null, revisions: [],
  installments: [], documents: [], plans: [], feeItems: [], exams: [], banks: [], questions: [], attempts: [], examTokens: [], notifications: [], companies: [], placements: [], logbook: [], cashTx: [], news: [], chiToday: [],
}

let state: State = EMPTY
const listeners = new Set<() => void>()
const set = (s: State) => { state = s; syncStream(); listeners.forEach((l) => l()) }

/**
 * Kanal realtime dari server (SSE). Server hanya memberi tahu ada notifikasi atau berita baru,
 * lalu snapshot diambil ulang lewat /api/state yang sudah difilter menurut role. EventSource tersambung ulang sendiri bila putus.
 */
let stream: EventSource | null = null
function syncStream() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
  if (state.sessionUserId && !stream) {
    stream = new EventSource('/api/events')
    const go = () => { refresh() }
    stream.addEventListener('notify', go)
    stream.addEventListener('news', go)
  } else if (!state.sessionUserId && stream) {
    stream.close()
    stream = null
  }
}

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
/** Nilai akhir dari bobot per mata pelajaran yang ditetapkan Akademik; data lama tanpa itu memakai rata-rata teori dan praktik. Sama dengan server. */
export function finalScore(g: Grade, _p?: Program, _b?: Batch) {
  if (g.finalScore != null) return g.finalScore
  return Math.round(((g.theory + g.practical) / 2) * 10) / 10
}
export const recommendPass = (g: Grade, p: Program, b?: Batch) => finalScore(g, p, b) >= p.rules.passingScore && g.attendancePct >= p.rules.minAttendance
export const newId = (_prefix = '') => crypto.randomUUID()

/* ---------- auth ---------- */
export async function login(email: string, password: string) { const r = await post('/api/auth/login', { email, password }); await refresh(); return r }
export async function register(input: { name: string; email: string; nik: string; birthDate: string; password: string; programId: string; website?: string }) { const r = await post('/api/auth/register', input); await refresh(); return r }
/** Super Admin masuk sebagai instruktur untuk melengkapi pertemuan, absensi, dan nilai; stopImpersonate kembali ke akun Super Admin. */
export async function impersonate(userId: string) { const r = await post('/api/auth/impersonate', { userId }); await refresh(); return r }
export async function stopImpersonate() { const r = await post('/api/auth/stop-impersonate', {}); await refresh(); return r }
export async function logout() { await post('/api/auth/logout', {}); await refresh() }
export const forgotPassword = (email: string) => post('/api/auth/forgot', { email })
export const resetPassword = (token: string, password: string) => post('/api/auth/reset', { token, password })
export async function changeEmail(email: string) { const r = await post('/api/auth/change-email', { email }); await refresh(); return r }
export async function changePassword(oldPassword: string, newPassword: string, email?: string) { const r = await post('/api/auth/change-password', { oldPassword, newPassword, ...(email !== undefined ? { email } : {}) }); await refresh(); return r }
/** Cek status peserta publik berdasarkan NIP (Nomor Induk Peserta). */
export const checkParticipantStatus = (nip: string) => request(`/api/status-peserta?nip=${encodeURIComponent(nip)}`)

/* ---------- registrasi dan pembayaran ---------- */
export const createRegistration = (programId: string) => rpc('createRegistration', programId)
export const assignBatch = (regId: string, batchId: string) => rpc('assignBatch', regId, batchId)
/** Pendaftar yang dinyatakan mundur otomatis melanjutkan prosesnya; hitungan 2 minggu dimulai ulang. */
export const resumeRegistration = (id: string) => rpc('resumeRegistration', id)
/** Staf melanjutkan proses pendaftar yang dinyatakan mundur oleh sistem. */
export const resumeRegistrationAdmin = (id: string) => rpc('resumeRegistrationAdmin', id)
/** Tandai pendaftar yang mundur sudah (done = true) atau belum di-follow up lewat WhatsApp. */
export const setFollowUp = (regId: string, done: boolean) => rpc('setFollowUp', regId, done)
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
/** Token ujian otomatis dari sistem (berlaku 1 hari). token kosong bila ujian sudah berjalan dan tidak perlu token. */
export const requestExamToken = (examId: string) => post('/api/rpc/requestExamToken', { args: [examId] })
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
export const saveFeeItem = (x: { id?: string; name: string; amount: number; programId: string; userId: string; active: boolean }) => rpc('saveFeeItem', x)
export const deleteFeeItem = (id: string) => rpc('deleteFeeItem', id)
export const savePlan = (p: { id?: string; name: string; programId: string; programIds?: string[]; downPayment: number; installments: number; active: boolean }) => rpc('savePlan', p)
export const deletePlan = (id: string) => rpc('deletePlan', id)
export const saveLetterSettings = (f: Record<string, unknown>) => rpc('saveLetterSettings', f)
export const removeSignature = () => rpc('removeSignature')
export const saveNews = (x: { id?: string; title: string; body: string; audience: string[]; startsOn: string; endsOn: string; active: boolean; resend?: boolean }) => rpc('saveNews', x)
export const deleteNews = (id: string) => rpc('deleteNews', id)
export const markNewsRead = (id: string) => rpc('markNewsRead', id)
export const changeProgram = (regId: string, programId: string) => rpc('changeProgram', regId, programId)
export const uploadSignature = (file: File) => {
  const f = new FormData()
  f.set('file', file)
  return upload('/api/upload/signature', f)
}
export const saveCompany = (x: Partial<Company> & { name: string }) => rpc('saveCompany', x)
export const deleteCompany = (id: string) => rpc('deleteCompany', id)
export const savePlacement = (x: { id?: string; registrationId?: string; companyId: string; kind: string; position: string; startDate: string; endDate: string; notes: string }) => rpc('savePlacement', x)
export const setPlacementScore = (id: string, score: number | null) => rpc('setPlacementScore', id, score)
export const setPlacementStatus =(id: string, status: Placement['status']) => rpc('setPlacementStatus', id, status)
export const reviewLogbook = (entryId: string, status: 'disetujui' | 'revisi', note: string) => rpc('reviewLogbook', entryId, status, note)
export const saveLogbook = (x: { id?: string; placementId: string; date: string; activity: string; learning: string; hours: number }) => rpc('saveLogbook', x)
export const approveLogbooks = (ids: string[]) => rpc('approveLogbooks', ids)
export const saveCashTx = (x: { id?: string; direction: 'masuk' | 'keluar'; category: string; date: string; amount: number; description: string }) => rpc('saveCashTx', x)
export const deleteCashTx = (id: string) => rpc('deleteCashTx', id)
export const deleteLogbook = (id: string) => rpc('deleteLogbook', id)
export const remindPayment = (regIds: string[]) => rpc('remindPayment', regIds)
/** amount: nominal sesuai bukti transfer bila keuangan menyesuaikannya (registrasi ulang dan cicilan). Selisih jadi sisa tagihan peserta. */
export const verifyPayment = (id: string, amount?: number) => rpc('verifyPayment', id, amount ?? null)
/* Keuangan: peserta didik yang ditambahkan atau diimpor admin. */
export const setPlanAdmin = (regId: string, planId: string) => rpc('setPlanAdmin', regId, planId)
export const recordPayment = (regId: string, x: { kind: 'pendaftaran' | 'registrasi'; amount: number; transferDate: string; payerName: string; note: string }) => rpc('recordPayment', regId, x)
export const cancelManualPayment = (paymentId: string, reason: string) => rpc('cancelManualPayment', paymentId, reason)
/** Keuangan mencatat biaya pendaftaran yang sudah dibayar di luar aplikasi untuk pendaftar (hanya biaya pendaftaran). */
export const recordRegFee = (regId: string, x: { amount: number; transferDate: string; payerName: string; note: string }) => rpc('recordRegFee', regId, x)
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
/** Kelima berkas registrasi ulang sudah terunggah. Setelah itu program pilihan terkunci. */
export const docsComplete = (s: Pick<State, 'documents'>, userId: string) => DOC_KINDS.every((k) => s.documents.some((d) => d.userId === userId && d.kind === k))
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
export const restoreProgram = (id: string) => rpc('restoreProgram', id)
export const deleteProgram = (id: string) => rpc('deleteProgram', id)
export const deleteBatch = (id: string) => rpc('deleteBatch', id)
export const saveBatch = (b: Batch) => rpc('saveBatch', b)

/* ---------- pembelajaran ---------- */
export const saveSubject = (x: Subject) => rpc('saveSubject', x)
export const importSubjects = (items: Record<string, unknown>[], updateExisting: boolean) => rpc('importSubjects', items, updateExisting)
export const readSheet = (url: string) => post('/api/subjects/sheet', { url })
export const deleteSubject = (id: string) => rpc('deleteSubject', id)
/** Satu jadwal pembelajaran: satu mata pelajaran di satu angkatan, dengan instruktur, hari, jam, dan ruangnya. */
/** batchIds: khusus kelas gabungan, semua angkatan (lintas program) yang ikut kelas itu. */
export interface JadwalInput { batchId: string; subjectId: string; editing: boolean; sessions: number; instructorId: string; days: string[]; startTime: string; endTime: string; room: string; batchIds?: string[] }
export const saveJadwal = (x: JadwalInput) => rpc('saveJadwal', x)
export const importJadwal = (rows: (Omit<JadwalInput, 'editing'> & { row: number })[]) => rpc('importJadwal', rows)
export const deleteJadwal = (batchId: string, subjectId: string, all = false) => rpc('deleteJadwal', batchId, subjectId, all)
/** Pengampu mata pelajaran di angkatan: yang ditunjuk Akademik di jadwal pembelajaran (sama dengan aturan server). */
export const subjectTeacher = (s: Pick<State, 'batchSubjects'>, batchId: string, subjectId?: string) =>
  s.batchSubjects.find((x) => x.batchId === batchId && x.subjectId === subjectId)?.instructorId || ''
/** Instruktur terlibat di angkatan ini: pengampu minimal satu mata pelajaran menurut jadwal. */
export const teachesBatch = (s: Pick<State, 'batchSubjects'>, userId: string, batchId: string) =>
  s.batchSubjects.some((x) => x.batchId === batchId && x.instructorId === userId)
/**
 * Pertemuan yang sudah dimulai tetapi absensinya belum diisi, untuk satu instruktur (pengampu mata pelajarannya menurut jadwal).
 * Hanya angkatan yang punya peserta didik aktif. Selama ada, instruktur tidak bisa menambah pertemuan baru (server juga menegakkannya).
 */
export const unattendedSessions = (s: Pick<State, 'sessions' | 'attendances' | 'batches' | 'batchSubjects' | 'registrations'>, userId: string, batchId?: string, anyTime = false) => {
  const now = Date.now()
  return s.sessions
    .filter((x) => (!batchId || x.batchId === batchId) && (anyTime || new Date(x.startAt).getTime() <= now) && subjectTeacher(s, x.batchId, x.subjectId) === userId
      && !s.attendances.some((a) => a.sessionId === x.id) && s.registrations.some((r) => r.batchId === x.batchId && r.status === 'active'))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
}
export const beritaAcaraUrl = (batchId: string, subjectId: string, fmt: 'docx' | 'pdf') => `/api/berita-acara/${batchId}/${subjectId}.${fmt}`
export const savePertemuan = (p: { id?: string; batchId: string; subjectId: string; title: string; date: string; meetingUrl?: string }) => rpc('savePertemuan', p)
export const deletePertemuan = (id: string) => rpc('deletePertemuan', id)
export const saveMaterialLink = (m: { sessionId: string; title: string; url: string }) => rpc('saveMaterialLink', m)
export const uploadMaterial = (sessionId: string, title: string, file: File) => {
  const f = new FormData(); f.set('sessionId', sessionId); f.set('title', title); f.set('file', file)
  return upload('/api/upload/material', f)
}
export const deleteMaterial = (id: string) => rpc('deleteMaterial', id)
export const saveAssignment = (a: { batchId: string; subjectId: string; title: string; description: string; dueAt: string }) => rpc('saveAssignment', a)
export const gradeSubmission = (id: string, score: number, feedback: string) => rpc('gradeSubmission', id, score, feedback)
export const submitWork = (assignmentId: string, note: string, file: File | null) => {
  const f = new FormData(); f.set('assignmentId', assignmentId); f.set('note', note); if (file) f.set('file', file)
  return upload('/api/upload/submission', f)
}
export const saveAttendance = (sessionId: string, marks: Record<string, Attendance['status']>) => rpc('saveAttendance', sessionId, marks)

/* ---------- nilai ---------- */
export const saveGrade = (registrationId: string, patch: Partial<Pick<Grade, 'theory' | 'practical' | 'attendancePct'>>) => rpc('saveGrade', registrationId, patch)
export type Bobot = { absensi: number; tugas: number; teori: number; praktik: number }
/** Atur bobot nilai satu mata pelajaran di satu angkatan (instruktur pengampu atau Akademik); reset = kembali ke default Akademik. */
export const setSubjectWeights = (batchId: string, subjectId: string, w: Bobot | null, reset = false) => rpc('setSubjectWeights', batchId, subjectId, w, reset)
/** Akademik menetapkan bobot default semua mata pelajaran yang bobotnya belum diatur sendiri. */
/** Akademik menetapkan batas bawah nilai huruf A, AB, B, BC, C, CD, D untuk semua mata pelajaran. */
export const setGradeLetters = (batas: number[]) => rpc('setGradeLetters', batas)
export const setDefaultGradeWeights =(w: Bobot) => rpc('setDefaultGradeWeights', w)
/** Simpan nilai teori dan/atau praktik satu mata pelajaran; null mengosongkan nilai. */
export const saveSubjectGrade = (registrationId: string, subjectId: string, patch: { task?: number | null; theory?: number | null; practical?: number | null }) => rpc('saveSubjectGrade', registrationId, subjectId, patch)
/** Instruktur menyetor nilai satu mata pelajaran ke Akademik; Akademik memvalidasi atau mengembalikannya. */
export const submitSubjectGrades = (batchId: string, subjectId: string) => rpc('submitSubjectGrades', batchId, subjectId)
export const validateSubject = (batchId: string, subjectId: string) => rpc('validateSubject', batchId, subjectId)
export const returnSubject = (batchId: string, subjectId: string, reason: string) => rpc('returnSubject', batchId, subjectId, reason)
export const unvalidateSubject = (batchId: string, subjectId: string, reason: string) => rpc('unvalidateSubject', batchId, subjectId, reason)
export const submitGrade =(registrationId: string) => rpc('submitGrade', registrationId)
export const returnGrade = (registrationId: string) => rpc('returnGrade', registrationId)
/** Batalkan validasi nilai (Akademik atau super admin); alasan wajib. Nilai kembali berstatus dikirim. */
export const unvalidateGrade = (registrationId: string, reason: string) => rpc('unvalidateGrade', registrationId, reason)
export const validateGrade =(registrationId: string, passed: boolean, overrideReason?: string) => rpc('validateGrade', registrationId, passed, overrideReason)

/* ---------- landing page ---------- */
export const saveDraft = (sections: Section[]) => rpc('saveDraft', sections)
export const publishDraft = (sections: Section[], note: string) => rpc('publishDraft', sections, note)
export const restoreRevision = (id: string) => rpc('restoreRevision', id)
export const uploadMedia = (file: File, alt: string) => { const f = new FormData(); f.set('alt', alt); f.set('file', file); return upload('/api/upload/media', f) }
export const deleteMedia = (id: string) => rpc('deleteMedia', id)

/* ---------- CHI Today (Super Admin) ---------- */
export const saveChiToday = (x: Partial<ChiTodayItem>) => rpc('saveChiToday', x)
export const setChiTodayFeatured = (id: string, on: boolean) => rpc('setChiTodayFeatured', id, on)
export const deleteChiToday = (id: string) => rpc('deleteChiToday', id)
/** Foto kegiatan: dari pustaka media bila ada, selain itu foto bawaan /landing. */
export const chiTodayImage = (x: Pick<ChiTodayItem, 'imageId' | 'imageSrc'>, small = false) => (x.imageId ? `/api/media/${x.imageId}${small ? '?w=sm' : ''}` : x.imageSrc || '')

/* ---------- sistem ---------- */
export const saveSettings = (s: SiteSettings) => rpc('saveSettings', s)
export const saveUser = (u: User, password?: string) => rpc('saveUser', u, password)
export const setUserPassword = (userId: string, password: string, mustChange: boolean) => rpc('setUserPassword', userId, password, mustChange)
export interface PesertaInput { name: string; email: string; phone: string; nip: string; nik: string; password: string; programId: string; batchId: string }
export const createPeserta = (x: PesertaInput) => rpc('createPeserta', x)
/** Hapus permanen pendaftar atau peserta didik beserta seluruh datanya. */
export const deleteUser = (userId: string) => rpc('deleteUser', userId)
export const deletePeserta =(userId: string) => rpc('deletePeserta', userId)
export const importPeserta =(rows: (PesertaInput & { row: number })[]) => rpc('importPeserta', rows)
export const sendAnnouncement = (scope: 'all' | 'program' | 'batch', scopeId: string, subject: string, body: string) => rpc('sendAnnouncement', scope, scopeId, subject, body)
