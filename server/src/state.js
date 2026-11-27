import { AUTO_WITHDRAW_REASON, getSettings, iso, q } from './lib.js'
import { canResumeReg, notifCutoff, paidOffIds } from './admission.js'

const bool = (v) => v === 1 || v === true

const mapUser = (u, done = new Set()) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, nik: u.nik ?? '', birthDate: u.birth_date ?? '', role: u.role, profileDone: done.has(u.id),
  active: bool(u.is_active), mustChange: bool(u.must_change_password), emailChangeable: u.role === 'peserta' && bool(u.email_change_left), instructorPrograms: u.instructor_program ? String(u.instructor_program).split(',').filter(Boolean) : [],
})
const hm = (t) => (t ? String(t).slice(0, 5) : '')
const mapBatchSubject = (x) => ({
  batchId: x.batch_id, subjectId: x.subject_id, sessions: x.sessions_planned, instructorId: x.instructor_id ?? '',
  days: x.schedule_days ?? '', startTime: hm(x.start_time), endTime: hm(x.end_time), room: x.room ?? '', groupId: x.group_id ?? '',
  // Bobot nilai mapel ini; null = memakai bobot default Akademik (gradeWeights).
  weights: x.w_absensi != null && x.w_tugas != null && x.w_teori != null && x.w_praktik != null ? { absensi: x.w_absensi, tugas: x.w_tugas, teori: x.w_teori, praktik: x.w_praktik } : null,
})
const mapProgram = (p) => ({
  id: p.id, slug: p.slug, title: p.title, category: p.category, shortDesc: p.short_desc, description: p.description ?? '',
  durationHours: p.duration_hours, price: Number(p.price), active: bool(p.is_active), archived: !!p.deleted_at,
  rules: { passingScore: p.passing_score, minAttendance: p.min_attendance },
  nipCode: p.nip_code ?? null,
})
const mapBatch = (b) => ({
  id: b.id, programId: b.program_id, code: b.code, angkatan: b.angkatan ?? null, startDate: b.start_date, endDate: b.end_date, quota: b.quota,
  status: b.status, location: b.location,
  freeRegFee: bool(b.free_reg_fee), curriculumId: b.curriculum_id ?? '',
  scheduleDays: b.schedule_days, startTime: b.start_time ? String(b.start_time).slice(0, 5) : '', endTime: b.end_time ? String(b.end_time).slice(0, 5) : '', plannedSessions: b.planned_sessions,
})
const mapReg = (r) => ({
  id: r.id, code: r.code, userId: r.user_id, programId: r.program_id, batchId: r.batch_id ?? '', stage: r.stage, nip: r.nip ?? undefined, admissionNo: r.admission_no ?? undefined, planId: r.plan_id ?? undefined, status: r.status, priceSnapshot: Number(r.price_snapshot),
  uniqueCode: r.unique_code, invoiceNo: r.invoice_no, dueAt: iso(r.due_at), createdAt: iso(r.created_at), cancelledReason: r.cancelled_reason ?? undefined, source: r.source ?? '',
  autoWithdrawn: r.status === 'expired' && r.cancelled_reason === AUTO_WITHDRAW_REASON,
  followUpAt: iso(r.followup_at) ?? '', followUpBy: r.followup_by ?? '',
  canResume: canResumeReg(r),
})
/** Tandai registrasi yang seluruh pembayarannya sudah lunas (dipakai kelulusan sempurna dan syarat penempatan magang). */
async function markPaidOff(regs) {
  const po = await paidOffIds(null, regs.map((r) => r.id))
  for (const r of regs) r.paidOff = po.has(r.id)
}
const mapPay = (p) => ({
  id: p.id, registrationId: p.registration_id, kind: p.kind, installmentId: p.installment_id ?? undefined, amountDue: Number(p.amount_due), amountPaid: Number(p.amount_paid), payerName: p.payer_name,
  transferDate: p.transfer_date, proofFileId: p.proof_file_id ?? undefined, status: p.status, rejectReason: p.reject_reason ?? undefined,
  receiptNo: p.receipt_no ?? undefined, verifiedBy: p.verified_by ?? undefined, note: p.note ?? undefined, createdAt: iso(p.created_at),
})
const mapGrade = (g) => ({
  registrationId: g.registration_id, theory: Number(g.theory), practical: Number(g.practical), attendancePct: Number(g.attendance_pct),
  finalScore: g.final_score == null ? null : Number(g.final_score),
  status: g.status, passed: g.passed == null ? undefined : bool(g.passed), overrideReason: g.override_reason ?? undefined,
})
const mapDiscount = (d) => ({ id: d.id, registrationId: d.registration_id, target: d.target, label: d.label, amount: Number(d.amount), reason: d.reason, createdBy: d.created_by ?? '', createdAt: iso(d.created_at) })
const mapCurriculum =(x) => ({ id: x.id, programId: x.program_id, name: x.name, description: x.description, active: bool(x.is_active), createdAt: iso(x.created_at) })
const mapSubject = (x) => ({ id: x.id, programId: x.program_id ?? '', curriculumId: x.curriculum_id ?? '', code: x.code ?? '', name: x.name, kind: x.kind, hours: x.hours, hoursPerMeeting: x.hours_per_meeting ?? null, meetings: x.meetings ?? null, description: x.description, active: bool(x.is_active) })
const mapSession = (s) => ({ id: s.id, batchId: s.batch_id, subjectId: s.subject_id ?? undefined, title: s.title, startAt: iso(s.start_at), location: s.location, meetingUrl: s.meeting_url ?? undefined })
const mapMaterial = (m) => ({ id: m.id, batchId: m.batch_id, sessionId: m.session_id ?? undefined, title: m.title, kind: m.kind, fileId: m.file_id ?? undefined, url: m.url ?? undefined })
const mapAssignment = (a) => ({ id: a.id, batchId: a.batch_id, subjectId: a.subject_id ?? '', title: a.title, description: a.description ?? '', dueAt: iso(a.due_at) })
const mapSubmission = (s) => ({
  id: s.id, assignmentId: s.assignment_id, registrationId: s.registration_id, fileId: s.file_id ?? undefined, note: s.note ?? '',
  score: s.score ?? undefined, feedback: s.feedback ?? undefined, submittedAt: iso(s.submitted_at),
})

const mapProfile = (p) => ({
  userId: p.user_id, nik: p.nik, birthPlace: p.birth_place, birthDate: p.birth_date, gender: p.gender, address: p.address, rt: p.rt, rw: p.rw, districtId: p.district_id, district: p.district, cityId: p.city_id, city: p.city,
  provinceId: p.province_id, province: p.province, postalCode: p.postal_code, education: p.education, occupation: p.occupation, school: p.school ?? '',
  internshipPref: p.internship_pref ?? '', groomingAgreed: !!p.grooming_agreed, infoSource: p.info_source ?? '', infoSourceOther: p.info_source_other ?? '',
  completed: !!p.completed_at,
})
const mapInst = (i) => ({ id: i.id, registrationId: i.registration_id, seq: i.seq, amount: Number(i.amount), paidAmount: Number(i.paid_amount), dueDate: i.due_date, status: i.status })
const mapPlan = (p) => ({ id: p.id, programId: p.program_id ?? '', name: p.name, downPayment: Number(p.down_payment), installments: p.installments, active: bool(p.is_active) })
const mapExam = (e) => ({
  id: e.id, title: e.title, bankId: e.bank_id, programId: e.program_id ?? '', openAt: iso(e.open_at), closeAt: iso(e.close_at), durationMin: e.duration_min,
  questionCount: e.question_count, active: bool(e.is_active),
})
const mapFeeItem = (x) => ({ id: x.id, name: x.name, amount: Number(x.amount), programId: x.program_id ?? '', userId: x.user_id ?? '', active: bool(x.is_active) })
const mapNotif = (n) => ({ id: n.id, title: n.title, body: n.body, link: n.link ?? '', read: !!n.read_at, createdAt: iso(n.created_at) })
const EXAM_ROLES = ['super_admin', 'admin_pendaftaran']
const mapDoc = (d) => ({ id: d.id, userId: d.user_id, kind: d.kind, fileId: d.file_id, createdAt: iso(d.created_at) })
const mapCompany = (x) => ({ id: x.id, name: x.name, category: x.category, address: x.address ?? '', city: x.city ?? '', country: x.country ?? 'Indonesia', contactName: x.contact_name ?? '', contactPhone: x.contact_phone ?? '', contactEmail: x.contact_email ?? '', notes: x.notes ?? '', active: bool(x.is_active) })
const mapPlacement = (x) => ({ id: x.id, registrationId: x.registration_id, companyId: x.company_id, kind: x.kind, position: x.position ?? '', startDate: String(x.start_date).slice(0, 10), endDate: x.end_date ? String(x.end_date).slice(0, 10) : '', score: x.score == null ? null : Number(x.score), status: x.status, notes: x.notes ?? '' })
const mapLogbook = (x) => ({ id: x.id, placementId: x.placement_id, date: String(x.entry_date).slice(0, 10), activity: x.activity, learning: x.learning ?? '', hours: Number(x.hours), status: x.status, reviewerNote: x.reviewer_note ?? '', reviewedAt: iso(x.reviewed_at) ?? '' })
const mapNews = (n, role, today, manager) => {
  const audience = JSON.parse(n.audience)
  const live = !!n.is_active && (!n.starts_on || String(n.starts_on).slice(0, 10) <= today) && (!n.ends_on || String(n.ends_on).slice(0, 10) >= today)
  return {
    id: n.id, title: n.title, body: n.body, audience, startsOn: n.starts_on ? String(n.starts_on).slice(0, 10) : '', endsOn: n.ends_on ? String(n.ends_on).slice(0, 10) : '',
    active: !!n.is_active, createdAt: iso(n.created_at), read: !!Number(n.is_read), eligible: live && (audience.includes('semua') || audience.includes(role)), readCount: manager ? Number(n.read_count) : 0,
  }
}
const mapCashTx = (x) => ({ id: x.id, direction: x.direction, category: x.category, date: x.tx_date instanceof Date ? new Date(x.tx_date.getTime() - x.tx_date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : String(x.tx_date).slice(0, 10), amount: Number(x.amount), description: x.description, createdAt: iso(x.created_at) })
const NEWS_MANAGERS = ['super_admin', 'admin_pendaftaran']
const PLACEMENT_VIEWERS = ['super_admin', 'akademik']
const PROFILE_VIEWERS =['super_admin', 'admin_pendaftaran', 'akademik']
const CMS_ROLES = ['super_admin', 'admin_pendaftaran']
const FINANCE = ['super_admin', 'admin_keuangan', 'admin_pendaftaran']

/** Bobot nilai default dari Akademik (absensi, tugas, teori, praktik); belum diatur = 10/20/30/40. */
async function gradeWeights() {
  const [r] = await q("SELECT v FROM settings WHERE k = 'grade_weights'")
  try { const w = JSON.parse(r?.v); if (['absensi', 'tugas', 'teori', 'praktik'].every((k) => Number.isInteger(w?.[k]))) return w } catch { /* pakai bawaan */ }
  return { absensi: 10, tugas: 20, teori: 30, praktik: 40 }
}

/** Batas bawah nilai huruf A, AB, B, BC, C, CD, D dari Akademik; belum diatur = 85/80/75/70/60/50/40 (template). */
async function gradeLetters() {
  const [r] = await q("SELECT v FROM settings WHERE k = 'grade_letters'")
  try { const b = JSON.parse(r?.v); if (Array.isArray(b) && b.length === 7 && b.every((v, i) => Number.isFinite(v) && (i === 0 || v < b[i - 1]))) return b } catch { /* pakai bawaan */ }
  return [85, 80, 75, 70, 60, 50, 40]
}

/** Snapshot data yang boleh dilihat pengguna ini. Semua filter hak akses ada di sini. */
export async function buildState(user, devMode, impersonator = null) {
  const role = user?.role
  const staff = role && role !== 'peserta'
  const settingsAll = await getSettings()
  const { bankName, bankAccount, bankHolder, ...pub } = settingsAll
  const settings = user ? settingsAll : pub

  const [programs, batches, seatRows, latest, gradCount, activeCount, pubRev, chiRows] = await Promise.all([
    q(role && staff ? 'SELECT * FROM programs' : 'SELECT * FROM programs WHERE deleted_at IS NULL AND is_active = 1'),
    q(staff ? 'SELECT * FROM batches' : "SELECT * FROM batches WHERE status IN ('open','running')"),
    q("SELECT batch_id, COUNT(*) n FROM registrations WHERE status IN ('pending_payment','waiting_verification','active') GROUP BY batch_id"),
    q('SELECT id FROM landing_revisions ORDER BY created_at DESC LIMIT 1'),
    q("SELECT COUNT(*) n FROM grades WHERE status = 'validated' AND passed = 1"),
    q("SELECT COUNT(*) n FROM registrations WHERE status IN ('active','completed')"),
    q("SELECT snapshot FROM landing_revisions WHERE id = (SELECT v FROM settings WHERE k = 'published_revision')"),
    // CHI Today: publik hanya melihat yang terbit; Super Admin melihat semua termasuk draf.
    q(`SELECT * FROM chi_today ${role === 'super_admin' ? '' : 'WHERE is_published = 1'} ORDER BY COALESCE(event_date, DATE(created_at)) DESC, created_at DESC`),
  ])

  const subjectRows = await q(role && staff ? 'SELECT * FROM subjects ORDER BY program_id, kind, name' : 'SELECT sj.* FROM subjects sj LEFT JOIN programs p ON p.id = sj.program_id WHERE sj.is_active = 1 AND (sj.program_id IS NULL OR (p.is_active = 1 AND p.deleted_at IS NULL)) ORDER BY sj.kind, sj.name')
  const curriculumRows = await q(role && staff ? 'SELECT * FROM curricula ORDER BY created_at' : 'SELECT * FROM curricula WHERE is_active = 1 ORDER BY created_at')
  const s = {
    sessionUserId: user?.id ?? null,
    curricula: curriculumRows.map(mapCurriculum),
    impersonatedBy: impersonator ? { id: impersonator.id, name: impersonator.name } : null, // Super Admin yang sedang masuk sebagai instruktur
    devMode,
    programs: programs.map(mapProgram),
    batches: batches.map(mapBatch),
    seats: Object.fromEntries(seatRows.map((r) => [r.batch_id, Number(r.n)])),
    stats: { graduates: Number(gradCount[0].n), participants: Number(activeCount[0].n) },
    settings,
    gradeWeights: await gradeWeights(),
    gradeLetters: await gradeLetters(),
    publishedSections: pubRev[0] ? JSON.parse(pubRev[0].snapshot) : [],
    chiToday: chiRows.map((n) => ({
      id: n.id, slug: n.slug, title: n.title, summary: n.summary, body: n.body, tag: n.tag,
      eventDate: n.event_date ? (n.event_date instanceof Date ? n.event_date.toISOString().slice(0, 10) : String(n.event_date).slice(0, 10)) : '',
      imageId: n.image_id ?? '', imageSrc: n.image_src ?? '', published: !!n.is_published, featured: !!n.is_featured, sort: Number(n.sort_order), createdAt: iso(n.created_at),
    })),
    subjects: subjectRows.map(mapSubject), batchSubjects: [],
    users: [], registrations: [], payments: [], installments: [], discounts: [], documents: [], plans: [], feeItems: [], notifications: [], exams: [], banks: [], questions: [], attempts: [], examTokens: [], sessions: [], materials: [], assignments: [], submissions: [], attendances: [],
    companies: [], placements: [], logbook: [], news: [], cashTx: [],
    profiles: [], grades: [], subjectGrades: [], audit: [], emails: [], media: [], draftSections: [], revisions: [], publishedRevisionId: null,
  }
  if (!user) return s

  const me = user.id
  const rev = await q("SELECT v FROM settings WHERE k = 'published_revision'")
  s.publishedRevisionId = rev[0]?.v ?? null
  void latest

  const doneRows = await q('SELECT user_id FROM participant_profiles WHERE completed_at IS NOT NULL')
  const done = new Set(doneRows.map((r) => r.user_id))

  // Berita untuk popup di beranda. Pengelola melihat semua berita; role lain hanya yang sedang tayang untuk mereka.
  {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
    const manager = NEWS_MANAGERS.includes(role)
    const rows = await q('SELECT n.*, (SELECT COUNT(*) FROM news_reads x WHERE x.news_id = n.id) read_count, EXISTS(SELECT 1 FROM news_reads x WHERE x.news_id = n.id AND x.user_id = ?) is_read FROM news n ORDER BY n.created_at DESC', [me])
    s.news = rows.map((n) => mapNews(n, role, today, manager)).filter((n) => manager || n.eligible)
  }

  if (role === 'peserta') {
    s.users = [mapUser(user, done)]
    s.profiles = (await q('SELECT * FROM participant_profiles WHERE user_id = ?', [me])).map(mapProfile)
    s.registrations = (await q('SELECT * FROM registrations WHERE user_id = ?', [me])).map(mapReg)
    await markPaidOff(s.registrations)
    const ids = s.registrations.map((r) => r.id)
    const inList = ids.length ? ids : ['-']
    s.payments = (await q('SELECT * FROM payments WHERE registration_id IN (?)', [inList])).map(mapPay)
    s.installments = (await q('SELECT * FROM installments WHERE registration_id IN (?) ORDER BY seq', [inList])).map(mapInst)
    s.discounts = (await q('SELECT * FROM registration_discounts WHERE registration_id IN (?)', [inList])).map(mapDiscount)
    s.documents = (await q('SELECT * FROM registration_documents WHERE user_id = ?', [me])).map(mapDoc)
    s.plans = (await q('SELECT * FROM payment_plans WHERE is_active = 1')).map(mapPlan)
    s.feeItems = (await q('SELECT * FROM fee_items WHERE is_active = 1 AND (user_id IS NULL OR user_id = ?)', [me])).map(mapFeeItem)
    s.notifications = (await q('SELECT * FROM notifications WHERE user_id = ? AND (read_at IS NULL OR read_at >= ?) ORDER BY created_at DESC LIMIT 50', [me, notifCutoff()])).map(mapNotif)
    // Ujian: tanpa token, tanpa soal, tanpa nilai. Nilai hanya dibaca staf.
    const ex = await q('SELECT e.* FROM exams e WHERE e.is_active = 1')
    const at = await q('SELECT exam_id, registration_id, started_at, finished_at FROM exam_attempts WHERE registration_id IN (?)', [inList])
    s.exams = ex.filter((e) => !e.program_id || s.registrations.some((r) => r.programId === e.program_id)).map((e) => {
      const a = at.find((x) => x.exam_id === e.id)
      return { ...mapExam(e), mine: a ? (a.finished_at ? 'done' : 'running') : 'none' }
    })
    s.grades = (await q("SELECT * FROM grades WHERE status = 'validated' AND registration_id IN (?)", [inList])).map(mapGrade)
    // Ruang belajar terkunci sampai data diri lengkap dan kelima berkas registrasi ulang terunggah.
    const docsDone = new Set(s.documents.map((d) => d.kind)).size >= 5
    const unlocked = done.has(me) && docsDone
    if (!unlocked) s.grades = [] // nilai ikut terkunci
    const active = unlocked ? s.registrations.filter((r) => (r.status === 'active' || r.status === 'completed') && r.batchId).map((r) => r.batchId) : []
    const bl = active.length ? active : ['-']
    // Mata pelajaran angkatan yang disetel Akademik, beserta nama instrukturnya saja (tanpa email atau telepon).
    s.batchSubjects = (await q('SELECT * FROM batch_subjects WHERE batch_id IN (?)', [bl])).map(mapBatchSubject)
    const insIds = [...new Set(s.batchSubjects.map((x) => x.instructorId).filter(Boolean))]
    if (insIds.length) s.users.push(...(await q('SELECT id, name FROM users WHERE id IN (?)', [insIds])).map((u) => ({ id: u.id, name: u.name, email: '', phone: '', role: 'instruktur', active: true })))
    s.sessions = (await q('SELECT * FROM class_sessions WHERE batch_id IN (?)', [bl])).map(mapSession)
    s.materials = (await q('SELECT * FROM materials WHERE batch_id IN (?)', [bl])).map(mapMaterial)
    s.assignments = (await q('SELECT * FROM assignments WHERE batch_id IN (?)', [bl])).map(mapAssignment)
    s.submissions = unlocked ? (await q('SELECT * FROM submissions WHERE registration_id IN (?)', [inList])).map(mapSubmission) : []
    // Kehadiran sendiri, untuk rekap per mata pelajaran di ruang belajar.
    s.attendances = unlocked ? (await q('SELECT * FROM attendances WHERE registration_id IN (?)', [inList])).map((a) => ({ sessionId: a.session_id, registrationId: a.registration_id, status: a.status })) : []
    // Nilai tiap mata pelajaran milik sendiri, hanya yang sudah divalidasi Akademik (untuk menu Laporan).
    s.subjectGrades = unlocked ? (await q("SELECT * FROM subject_grades WHERE status = 'validated' AND registration_id IN (?)", [inList])).map((x) => ({
      registrationId: x.registration_id, subjectId: x.subject_id, task: x.task == null ? null : Number(x.task), theory: x.theory == null ? null : Number(x.theory), practical: x.practical == null ? null : Number(x.practical),
      status: 'validated', validatedAt: iso(x.validated_at),
    })) : []
    // Penempatan sendiri, perusahaannya, dan logbook.
    s.placements = unlocked ? (await q('SELECT * FROM placements WHERE registration_id IN (?) ORDER BY start_date DESC', [inList])).map(mapPlacement) : []
    const pl = s.placements.length ? s.placements.map((p) => p.id) : ['-']
    const co = s.placements.length ? s.placements.map((p) => p.companyId) : ['-']
    s.companies = (await q('SELECT * FROM companies WHERE id IN (?)', [co])).map(mapCompany)
    s.logbook = (await q('SELECT * FROM logbook_entries WHERE placement_id IN (?) ORDER BY entry_date DESC', [pl])).map(mapLogbook)
    return s
  }

  // staf
  const scoped = role === 'instruktur'
  // Instruktur melihat angkatan tempat ia mengampu minimal satu mata pelajaran menurut jadwal pembelajaran.
  s.batchSubjects = (await q('SELECT * FROM batch_subjects')).map(mapBatchSubject)
  const myBatches = scoped ? s.batches.filter((b) => s.batchSubjects.some((x) => x.batchId === b.id && x.instructorId === me)).map((b) => b.id) : null
  const bl = myBatches ? (myBatches.length ? myBatches : ['-']) : null

  const regs = bl ? await q('SELECT * FROM registrations WHERE batch_id IN (?)', [bl]) : (['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik'].includes(role) ? await q('SELECT * FROM registrations') : [])
  s.registrations = regs.map(mapReg)
  await markPaidOff(s.registrations)
  const rl = s.registrations.length ? s.registrations.map((r) => r.id) : ['-']

  const users = await q('SELECT * FROM users')
  s.users = users
    .filter((u) => !scoped || u.role !== 'peserta' || s.registrations.some((r) => r.userId === u.id))
    .map((u) => { const m = mapUser(u, done); if (scoped && u.role === 'peserta') { m.email = ''; m.phone = ''; m.nik = ''; m.birthDate = '' } return m })

  if (PROFILE_VIEWERS.includes(role)) {
    s.profiles = (await q('SELECT * FROM participant_profiles')).map(mapProfile)
    s.documents = (await q('SELECT * FROM registration_documents')).map(mapDoc)
  }
  if (PLACEMENT_VIEWERS.includes(role)) {
    s.companies = (await q('SELECT * FROM companies ORDER BY name')).map(mapCompany)
    s.placements = (await q('SELECT * FROM placements ORDER BY start_date DESC')).map(mapPlacement)
    s.logbook = (await q('SELECT * FROM logbook_entries ORDER BY entry_date DESC')).map(mapLogbook)
  }
  if (FINANCE.includes(role)) s.payments = (await q('SELECT * FROM payments')).map(mapPay)
  if (FINANCE.includes(role)) {
    s.installments = (await q('SELECT * FROM installments ORDER BY registration_id, seq')).map(mapInst)
    s.discounts = (await q('SELECT * FROM registration_discounts ORDER BY created_at')).map(mapDiscount)
    s.plans = (await q('SELECT * FROM payment_plans ORDER BY created_at')).map(mapPlan)
    s.feeItems = (await q('SELECT * FROM fee_items ORDER BY created_at')).map(mapFeeItem)
  }
  if (['super_admin', 'admin_keuangan'].includes(role)) s.cashTx = (await q('SELECT * FROM cash_transactions ORDER BY tx_date DESC, created_at DESC')).map(mapCashTx)
  if (EXAM_ROLES.includes(role)) {
    s.banks = (await q('SELECT b.*, (SELECT COUNT(*) FROM questions x WHERE x.bank_id = b.id AND x.is_active = 1) n FROM question_banks b ORDER BY b.created_at')).map((b) => ({ id: b.id, name: b.name, count: Number(b.n) }))
    s.questions = (await q('SELECT * FROM questions WHERE is_active = 1 ORDER BY created_at')).map((x) => ({ id: x.id, bankId: x.bank_id, body: x.body, options: JSON.parse(x.options), correctIdx: x.correct_idx }))
    s.exams = (await q('SELECT * FROM exams ORDER BY open_at DESC')).map(mapExam)
    s.examTokens = (await q('SELECT * FROM exam_tokens WHERE registration_id IS NULL ORDER BY created_at DESC LIMIT 300')).map((t) => ({ id: t.id, examId: t.exam_id, token: t.token, expiresAt: iso(t.expires_at), createdAt: iso(t.created_at) }))
    s.attempts = (await q('SELECT id, exam_id, registration_id, started_at, finished_at, score FROM exam_attempts')).map((a) => ({ id: a.id, examId: a.exam_id, registrationId: a.registration_id, startedAt: iso(a.started_at), finishedAt: iso(a.finished_at) ?? '', score: a.score == null ? null : Number(a.score) }))
  }
  s.sessions = (await q(bl ? 'SELECT * FROM class_sessions WHERE batch_id IN (?)' : 'SELECT * FROM class_sessions', bl ? [bl] : [])).map(mapSession)
  s.materials = (await q(bl ? 'SELECT * FROM materials WHERE batch_id IN (?)' : 'SELECT * FROM materials', bl ? [bl] : [])).map(mapMaterial)
  s.assignments = (await q(bl ? 'SELECT * FROM assignments WHERE batch_id IN (?)' : 'SELECT * FROM assignments', bl ? [bl] : [])).map(mapAssignment)
  if (['super_admin', 'akademik', 'instruktur'].includes(role)) {
    s.submissions = (await q('SELECT * FROM submissions WHERE registration_id IN (?)', [rl])).map(mapSubmission)
    s.attendances = (await q('SELECT * FROM attendances WHERE registration_id IN (?)', [rl])).map((a) => ({ sessionId: a.session_id, registrationId: a.registration_id, status: a.status }))
    s.grades = (await q('SELECT * FROM grades WHERE registration_id IN (?)', [rl])).map(mapGrade)
    s.subjectGrades = (await q('SELECT * FROM subject_grades WHERE registration_id IN (?)', [rl])).map((x) => ({
      registrationId: x.registration_id, subjectId: x.subject_id, task: x.task == null ? null : Number(x.task), theory: x.theory == null ? null : Number(x.theory), practical: x.practical == null ? null : Number(x.practical),
      status: x.status ?? 'draft', validatedAt: iso(x.validated_at),
    }))
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
