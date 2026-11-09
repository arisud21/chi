import { getSettings, iso, q } from './lib.js'

const bool = (v) => v === 1 || v === true

const mapUser = (u, done = new Set()) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, nik: u.nik ?? '', birthDate: u.birth_date ?? '', role: u.role, profileDone: done.has(u.id),
  active: bool(u.is_active), mustChange: bool(u.must_change_password),
})
const mapProgram = (p) => ({
  id: p.id, slug: p.slug, title: p.title, category: p.category, shortDesc: p.short_desc, description: p.description ?? '',
  durationHours: p.duration_hours, price: Number(p.price), active: bool(p.is_active), archived: !!p.deleted_at,
  rules: { theoryWeight: p.theory_weight, practicalWeight: p.practical_weight, passingScore: p.passing_score, minAttendance: p.min_attendance },
  nipCode: p.nip_code ?? null,
})
const mapBatch = (b) => ({
  id: b.id, programId: b.program_id, code: b.code, angkatan: b.angkatan ?? null, startDate: b.start_date, endDate: b.end_date, quota: b.quota,
  status: b.status, instructorId: b.instructor_id ?? '', location: b.location,
  scheduleDays: b.schedule_days, startTime: b.start_time ? String(b.start_time).slice(0, 5) : '', endTime: b.end_time ? String(b.end_time).slice(0, 5) : '', plannedSessions: b.planned_sessions,
})
const mapReg = (r) => ({
  id: r.id, code: r.code, userId: r.user_id, programId: r.program_id, batchId: r.batch_id ?? '', stage: r.stage, nip: r.nip ?? undefined, admissionNo: r.admission_no ?? undefined, planId: r.plan_id ?? undefined, status: r.status, priceSnapshot: Number(r.price_snapshot),
  uniqueCode: r.unique_code, invoiceNo: r.invoice_no, dueAt: iso(r.due_at), createdAt: iso(r.created_at), cancelledReason: r.cancelled_reason ?? undefined,
})
const mapPay = (p) => ({
  id: p.id, registrationId: p.registration_id, kind: p.kind, installmentId: p.installment_id ?? undefined, amountDue: Number(p.amount_due), amountPaid: Number(p.amount_paid), payerName: p.payer_name,
  transferDate: p.transfer_date, proofFileId: p.proof_file_id ?? undefined, status: p.status, rejectReason: p.reject_reason ?? undefined,
  receiptNo: p.receipt_no ?? undefined, verifiedBy: p.verified_by ?? undefined, createdAt: iso(p.created_at),
})
const mapGrade = (g) => ({
  registrationId: g.registration_id, theory: Number(g.theory), practical: Number(g.practical), attendancePct: Number(g.attendance_pct),
  status: g.status, passed: g.passed == null ? undefined : bool(g.passed), overrideReason: g.override_reason ?? undefined,
})
const mapCert = (c) => ({
  id: c.id, registrationId: c.registration_id, number: c.number, verificationCode: c.verification_code, status: c.status,
  issuedAt: iso(c.issued_at), revokedReason: c.revoked_reason ?? undefined,
})
const mapSubject = (x) => ({ id: x.id, programId: x.program_id ?? '', code: x.code ?? '', name: x.name, kind: x.kind, hours: x.hours, hoursPerMeeting: x.hours_per_meeting ?? null, meetings: x.meetings ?? null, description: x.description, active: bool(x.is_active) })
const mapSession = (s) => ({ id: s.id, batchId: s.batch_id, subjectId: s.subject_id ?? undefined, title: s.title, startAt: iso(s.start_at), location: s.location, meetingUrl: s.meeting_url ?? undefined })
const mapMaterial = (m) => ({ id: m.id, batchId: m.batch_id, sessionId: m.session_id ?? undefined, title: m.title, kind: m.kind, fileId: m.file_id ?? undefined, url: m.url ?? undefined })
const mapAssignment = (a) => ({ id: a.id, batchId: a.batch_id, title: a.title, description: a.description ?? '', dueAt: iso(a.due_at) })
const mapSubmission = (s) => ({
  id: s.id, assignmentId: s.assignment_id, registrationId: s.registration_id, fileId: s.file_id ?? undefined, note: s.note ?? '',
  score: s.score ?? undefined, feedback: s.feedback ?? undefined, submittedAt: iso(s.submitted_at),
})
const mapTemplate = (t) => ({
  id: t.id, version: t.version, config: JSON.parse(t.config), isActive: bool(t.is_active),
  hasBackground: !!t.background_file_id, hasSignature: !!t.signature_file_id, backgroundFileId: t.background_file_id ?? undefined, signatureFileId: t.signature_file_id ?? undefined,
})

const mapProfile = (p) => ({
  userId: p.user_id, nik: p.nik, birthPlace: p.birth_place, birthDate: p.birth_date, gender: p.gender, address: p.address, rt: p.rt, rw: p.rw, districtId: p.district_id, district: p.district, cityId: p.city_id, city: p.city,
  provinceId: p.province_id, province: p.province, postalCode: p.postal_code, education: p.education, occupation: p.occupation, school: p.school ?? '',
  completed: !!p.completed_at,
})
const mapInst = (i) => ({ id: i.id, registrationId: i.registration_id, seq: i.seq, amount: Number(i.amount), paidAmount: Number(i.paid_amount), dueDate: i.due_date, status: i.status })
const mapPlan = (p) => ({ id: p.id, programId: p.program_id ?? '', name: p.name, downPayment: Number(p.down_payment), installments: p.installments, active: bool(p.is_active) })
const mapExam = (e) => ({
  id: e.id, title: e.title, bankId: e.bank_id, programId: e.program_id ?? '', openAt: iso(e.open_at), closeAt: iso(e.close_at), durationMin: e.duration_min,
  questionCount: e.question_count, active: bool(e.is_active),
})
const mapFeeItem = (x) => ({ id: x.id, name: x.name, amount: Number(x.amount), programId: x.program_id ?? '', active: bool(x.is_active) })
const mapNotif = (n) => ({ id: n.id, title: n.title, body: n.body, link: n.link ?? '', read: !!n.read_at, createdAt: iso(n.created_at) })
const EXAM_ROLES = ['super_admin', 'admin_pendaftaran', 'akademik']
const mapDoc = (d) => ({ id: d.id, userId: d.user_id, kind: d.kind, fileId: d.file_id, createdAt: iso(d.created_at) })
const PROFILE_VIEWERS = ['super_admin', 'admin_pendaftaran', 'akademik']
const CMS_ROLES = ['super_admin', 'admin_pendaftaran']
const FINANCE = ['super_admin', 'admin_keuangan', 'admin_pendaftaran']

/** Snapshot data yang boleh dilihat pengguna ini. Semua filter hak akses ada di sini. */
export async function buildState(user, devMode) {
  const role = user?.role
  const staff = role && role !== 'peserta'
  const settingsAll = await getSettings()
  const { bankName, bankAccount, bankHolder, ...pub } = settingsAll
  const settings = user ? settingsAll : pub

  const [programs, batches, seatRows, latest, certCount, activeCount, pubRev] = await Promise.all([
    q(role && staff ? 'SELECT * FROM programs' : 'SELECT * FROM programs WHERE deleted_at IS NULL AND is_active = 1'),
    q(staff ? 'SELECT * FROM batches' : "SELECT * FROM batches WHERE status IN ('open','running')"),
    q("SELECT batch_id, COUNT(*) n FROM registrations WHERE status IN ('pending_payment','waiting_verification','active') GROUP BY batch_id"),
    q('SELECT id FROM landing_revisions ORDER BY created_at DESC LIMIT 1'),
    q("SELECT COUNT(*) n FROM certificates WHERE status = 'issued'"),
    q("SELECT COUNT(*) n FROM registrations WHERE status IN ('active','completed')"),
    q("SELECT snapshot FROM landing_revisions WHERE id = (SELECT v FROM settings WHERE k = 'published_revision')"),
  ])

  const subjectRows = await q(role && staff ? 'SELECT * FROM subjects ORDER BY program_id, kind, name' : 'SELECT sj.* FROM subjects sj LEFT JOIN programs p ON p.id = sj.program_id WHERE sj.is_active = 1 AND (sj.program_id IS NULL OR (p.is_active = 1 AND p.deleted_at IS NULL)) ORDER BY sj.kind, sj.name')
  const s = {
    sessionUserId: user?.id ?? null,
    devMode,
    programs: programs.map(mapProgram),
    batches: batches.map(mapBatch),
    seats: Object.fromEntries(seatRows.map((r) => [r.batch_id, Number(r.n)])),
    stats: { certificates: Number(certCount[0].n), participants: Number(activeCount[0].n) },
    settings,
    publishedSections: pubRev[0] ? JSON.parse(pubRev[0].snapshot) : [],
    subjects: subjectRows.map(mapSubject), batchSubjects: [],
    users: [], registrations: [], payments: [], installments: [], documents: [], plans: [], feeItems: [], notifications: [], exams: [], banks: [], questions: [], attempts: [], examTokens: [], sessions: [], materials: [], assignments: [], submissions: [], attendances: [],
    profiles: [], grades: [], certificates: [], audit: [], emails: [], templates: [], media: [], draftSections: [], revisions: [], publishedRevisionId: null,
  }
  if (!user) return s

  const me = user.id
  const rev = await q("SELECT v FROM settings WHERE k = 'published_revision'")
  s.publishedRevisionId = rev[0]?.v ?? null
  void latest

  const doneRows = await q('SELECT user_id FROM participant_profiles WHERE completed_at IS NOT NULL')
  const done = new Set(doneRows.map((r) => r.user_id))

  if (role === 'peserta') {
    s.users = [mapUser(user, done)]
    s.profiles = (await q('SELECT * FROM participant_profiles WHERE user_id = ?', [me])).map(mapProfile)
    s.registrations = (await q('SELECT * FROM registrations WHERE user_id = ?', [me])).map(mapReg)
    const ids = s.registrations.map((r) => r.id)
    const inList = ids.length ? ids : ['-']
    s.payments = (await q('SELECT * FROM payments WHERE registration_id IN (?)', [inList])).map(mapPay)
    s.installments = (await q('SELECT * FROM installments WHERE registration_id IN (?) ORDER BY seq', [inList])).map(mapInst)
    s.documents = (await q('SELECT * FROM registration_documents WHERE user_id = ?', [me])).map(mapDoc)
    s.plans = (await q('SELECT * FROM payment_plans WHERE is_active = 1')).map(mapPlan)
    s.feeItems = (await q('SELECT * FROM fee_items WHERE is_active = 1')).map(mapFeeItem)
    s.notifications = (await q('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [me])).map(mapNotif)
    // Ujian: tanpa token, tanpa soal, tanpa nilai. Nilai hanya dibaca staf.
    const ex = await q('SELECT e.* FROM exams e WHERE e.is_active = 1')
    const at = await q('SELECT exam_id, registration_id, started_at, finished_at FROM exam_attempts WHERE registration_id IN (?)', [inList])
    s.exams = ex.filter((e) => !e.program_id || s.registrations.some((r) => r.programId === e.program_id)).map((e) => {
      const a = at.find((x) => x.exam_id === e.id)
      return { ...mapExam(e), mine: a ? (a.finished_at ? 'done' : 'running') : 'none' }
    })
    s.grades = (await q("SELECT * FROM grades WHERE status = 'validated' AND registration_id IN (?)", [inList])).map(mapGrade)
    s.certificates = (await q('SELECT * FROM certificates WHERE registration_id IN (?)', [inList])).map(mapCert)
    // Ruang belajar terkunci sampai data diri lengkap.
    const active = done.has(me) ? s.registrations.filter((r) => (r.status === 'active' || r.status === 'completed') && r.batchId).map((r) => r.batchId) : []
    const bl = active.length ? active : ['-']
    s.sessions = (await q('SELECT * FROM class_sessions WHERE batch_id IN (?)', [bl])).map(mapSession)
    s.materials = (await q('SELECT * FROM materials WHERE batch_id IN (?)', [bl])).map(mapMaterial)
    s.assignments = (await q('SELECT * FROM assignments WHERE batch_id IN (?)', [bl])).map(mapAssignment)
    s.submissions = done.has(me) ? (await q('SELECT * FROM submissions WHERE registration_id IN (?)', [inList])).map(mapSubmission) : []
    return s
  }

  // staf
  const scoped = role === 'instruktur'
  const myBatches = scoped ? s.batches.filter((b) => b.instructorId === me).map((b) => b.id) : null
  const bl = myBatches ? (myBatches.length ? myBatches : ['-']) : null

  const regs = bl ? await q('SELECT * FROM registrations WHERE batch_id IN (?)', [bl]) : (['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik'].includes(role) ? await q('SELECT * FROM registrations') : [])
  s.registrations = regs.map(mapReg)
  const rl = s.registrations.length ? s.registrations.map((r) => r.id) : ['-']

  const users = await q('SELECT * FROM users')
  s.users = users
    .filter((u) => !scoped || u.role !== 'peserta' || s.registrations.some((r) => r.userId === u.id))
    .map((u) => { const m = mapUser(u, done); if (scoped && u.role === 'peserta') { m.email = ''; m.phone = ''; m.nik = ''; m.birthDate = '' } return m })

  if (PROFILE_VIEWERS.includes(role)) {
    s.profiles = (await q('SELECT * FROM participant_profiles')).map(mapProfile)
    s.documents = (await q('SELECT * FROM registration_documents')).map(mapDoc)
  }
  if (FINANCE.includes(role)) s.payments = (await q('SELECT * FROM payments')).map(mapPay)
  if (FINANCE.includes(role)) {
    s.installments = (await q('SELECT * FROM installments ORDER BY registration_id, seq')).map(mapInst)
    s.plans = (await q('SELECT * FROM payment_plans ORDER BY created_at')).map(mapPlan)
    s.feeItems = (await q('SELECT * FROM fee_items ORDER BY created_at')).map(mapFeeItem)
  }
  if (EXAM_ROLES.includes(role)) {
    s.banks = (await q('SELECT b.*, (SELECT COUNT(*) FROM questions x WHERE x.bank_id = b.id AND x.is_active = 1) n FROM question_banks b ORDER BY b.created_at')).map((b) => ({ id: b.id, name: b.name, count: Number(b.n) }))
    s.questions = (await q('SELECT * FROM questions WHERE is_active = 1 ORDER BY created_at')).map((x) => ({ id: x.id, bankId: x.bank_id, body: x.body, options: JSON.parse(x.options), correctIdx: x.correct_idx }))
    s.exams = (await q('SELECT * FROM exams ORDER BY open_at DESC')).map(mapExam)
    s.examTokens = (await q('SELECT * FROM exam_tokens ORDER BY created_at DESC LIMIT 300')).map((t) => ({ id: t.id, examId: t.exam_id, token: t.token, expiresAt: iso(t.expires_at), createdAt: iso(t.created_at) }))
    s.attempts = (await q('SELECT id, exam_id, registration_id, started_at, finished_at, score FROM exam_attempts')).map((a) => ({ id: a.id, examId: a.exam_id, registrationId: a.registration_id, startedAt: iso(a.started_at), finishedAt: iso(a.finished_at) ?? '', score: a.score == null ? null : Number(a.score) }))
  }
  s.batchSubjects = (await q('SELECT * FROM batch_subjects')).map((x) => ({ batchId: x.batch_id, subjectId: x.subject_id, sessions: x.sessions_planned }))
  s.sessions = (await q(bl ? 'SELECT * FROM class_sessions WHERE batch_id IN (?)' : 'SELECT * FROM class_sessions', bl ? [bl] : [])).map(mapSession)
  s.materials = (await q(bl ? 'SELECT * FROM materials WHERE batch_id IN (?)' : 'SELECT * FROM materials', bl ? [bl] : [])).map(mapMaterial)
  s.assignments = (await q(bl ? 'SELECT * FROM assignments WHERE batch_id IN (?)' : 'SELECT * FROM assignments', bl ? [bl] : [])).map(mapAssignment)
  if (['super_admin', 'akademik', 'instruktur'].includes(role)) {
    s.submissions = (await q('SELECT * FROM submissions WHERE registration_id IN (?)', [rl])).map(mapSubmission)
    s.attendances = (await q('SELECT * FROM attendances WHERE registration_id IN (?)', [rl])).map((a) => ({ sessionId: a.session_id, registrationId: a.registration_id, status: a.status }))
    s.grades = (await q('SELECT * FROM grades WHERE registration_id IN (?)', [rl])).map(mapGrade)
  }
  if (['super_admin', 'akademik'].includes(role)) {
    s.certificates = (await q('SELECT * FROM certificates')).map(mapCert)
    s.templates = (await q('SELECT * FROM certificate_templates ORDER BY version DESC')).map(mapTemplate)
  }
  if (role === 'super_admin') s.audit = (await q('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300')).map((a) => ({ id: String(a.id), at: iso(a.created_at), userId: a.user_id ?? 'sistem', action: a.action, entity: a.entity, detail: a.detail }))
  if (['super_admin', 'admin_pendaftaran'].includes(role)) s.emails = (await q('SELECT * FROM email_queue ORDER BY id DESC LIMIT 200')).map((e) => ({ id: String(e.id), at: iso(e.created_at), to: e.to_email, subject: e.subject, status: e.status }))
  if (CMS_ROLES.includes(role)) {
    const draft = await q("SELECT v FROM settings WHERE k = 'draft_sections'")
    s.draftSections = draft[0] ? JSON.parse(draft[0].v) : s.publishedSections
    s.revisions = (await q('SELECT r.*, 1 FROM landing_revisions r ORDER BY created_at DESC LIMIT 30')).map((r) => ({ id: r.id, at: iso(r.created_at), by: r.created_by ?? 'sistem', note: r.note, sections: JSON.parse(r.snapshot) }))
    s.media = (await q("SELECT id, original_name, alt_text, mime, created_at FROM files WHERE kind = 'media' ORDER BY created_at DESC")).map((f) => ({ id: f.id, name: f.original_name, alt: f.alt_text ?? '', at: iso(f.created_at) }))
  }
  return s
}
