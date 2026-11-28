// Uji alur penerimaan: registrasi, data diri, bayar pendaftaran, ujian bertoken, keputusan, surat, registrasi ulang, cicilan.
const BASE = process.env.API || 'http://localhost:4000'
let pass = 0, failed = 0
const check = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ', name) } else { failed++; console.log('  GAGAL', name, extra) } }
class Client {
  cookie = ''
  async req(path, init = {}) { const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), cookie: this.cookie } }); const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]; return r }
  async json(path, body) { const r = await this.req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json().catch(() => ({}))) } }
  login(email) { return this.json('/api/auth/login', { email, password: 'demo12345' }) }
  rpc(name, ...args) { return this.json(`/api/rpc/${name}`, { args }) }
  async state() { return (await this.req('/api/state')).json() }
  async form(path, fields, files = {}) {
    const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v)
    for (const [k, v] of Object.entries(files)) f.set(k, new Blob([v.bytes], { type: v.type }), v.name)
    const r = await this.req(path, { method: 'POST', body: f }); return { status: r.status, ...(await r.json().catch(() => ({}))) }
  }
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const img = (name) => ({ bytes: PNG, type: 'image/png', name })
const stamp = Date.now()
const nik = () => String(Math.floor(Math.random() * 9e15) + 1e15).slice(0, 16)
const profileFields = (n) => ({
  fullName: 'Peserta Penerimaan', nik: n, birthPlace: 'Cimahi', birthDate: '2001-05-20', gender: 'P', address: 'Jl. Uji No. 5', rt: '003', rw: '007', provinceId: '32', cityId: '3277', districtId: '3277010',
  postalCode: '40511', phone: '081234567890', school: 'SMK Uji Cimahi', education: 'SMA/SMK', occupation: 'Belum bekerja',
})

const adm = new Client(); await adm.login('pendaftaran@cih.demo')
const uang = new Client(); await uang.login('keuangan@cih.demo')
const akad = new Client(); await akad.login('akademik@cih.demo')
const as0 = await adm.state()
const batch = as0.batches.find((b) => b.status === 'open')
const exam = as0.exams.find((e) => e.active)
check('ada angkatan terbuka dan ujian aktif untuk diuji', !!batch && !!exam)
check('Keuangan tidak bisa membuat token', (await uang.rpc('createExamToken', exam.id, 60)).status === 403)
check('masa aktif di luar pilihan ditolak', (await adm.rpc('createExamToken', exam.id, 7)).ok !== true)
const made = await adm.rpc('createExamToken', exam.id, 15)
check('admin membuat token 15 menit', made.ok === true && /^[A-Z2-9]{6}$/.test(made.data), JSON.stringify(made))
const tok1 = made.data
const tokRow = (await adm.state()).examTokens.find((x) => x.token === tok1)
check('masa aktif token 15 menit', Math.abs(new Date(tokRow.expiresAt) - Date.now() - 15 * 60_000) < 60_000)
exam.token = tok1

async function newApplicant(tag) {
  const c = new Client(); const n = nik()
  const r = await c.json('/api/auth/register', { name: `Calon ${tag}`, email: `adm${tag}${stamp}@example.com`, nik: n, birthDate: '2001-05-20', password: 'rahasia123', programId: batch.programId })
  return { c, n, r }
}
const a = await newApplicant('A')
console.log('Registrasi dan data diri')
check('registrasi berhasil', a.r.ok === true, JSON.stringify(a.r))
let st = await a.c.state()
const reg = st.registrations[0]
check('tahap awal data diri, tanpa angkatan', reg.stage === 'data' && reg.batchId === '')
check('bayar pendaftaran sebelum data diri ditolak', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'pendaftaran', payerName: 'A', transferDate: '2026-11-08', amountPaid: 200000 }, { file: img('b.png') })).ok !== true)
check('ujian belum bisa dimulai', (await a.c.rpc('startExam', exam.id, exam.token)).ok !== true)
check('data diri tanpa asal sekolah ditolak', (await a.c.form('/api/upload/profile', { ...profileFields(a.n), school: '' })).ok !== true)
check('data diri tersimpan', (await a.c.form('/api/upload/profile', profileFields(a.n))).ok === true)
st = await a.c.state()
check('pindah ke tahap bayar pendaftaran', st.registrations[0].stage === 'bayar_daftar')
check('notifikasi bayar pendaftaran', st.notifications.some((n) => /bayar biaya pendaftaran/i.test(n.title)))

console.log('Pengumuman tagihan')
check('peserta tidak bisa mengumumkan tagihan', (await a.c.rpc('remindPayment', [reg.id])).status === 403)
check('Akademik tidak bisa mengumumkan tagihan', (await akad.rpc('remindPayment', [reg.id])).status === 403)
check('daftar kosong ditolak', (await uang.rpc('remindPayment', [])).ok !== true)
const rm1 = await uang.rpc('remindPayment', [reg.id, 'bukan-id'])
check('Keuangan mengumumkan tagihan: 1 terkirim, 1 dilewati', rm1.ok === true && rm1.data.sent === 1 && rm1.data.skipped === 1, JSON.stringify(rm1))
const notes = (await a.c.state()).notifications
const note = notes.find((n) => n.title === 'Pengingat pembayaran')
check('akun peserta menerima pengingat berisi nominal dan rekening', !!note && /200\.000/.test(note.body) && /2040792254/.test(note.body), JSON.stringify(note))
check('email pengingat masuk antrean', (await adm.state()).emails.some((e) => e.to === `adma${stamp}@example.com` && e.subject === 'Pengingat pembayaran'))
const rm2 = await uang.rpc('remindPayment', [reg.id])
check('pengingat berulang dalam 6 jam dilewati', rm2.data.sent === 0 && rm2.data.skipped === 1)
const stNow = await uang.state()
check('Keuangan melihat pembayaran dan jadwal cicilan peserta', Array.isArray(stNow.payments) && Array.isArray(stNow.installments) && stNow.registrations.some((r) => r.id === reg.id))

console.log('Bayar pendaftaran')
check('jenis pembayaran salah ditolak', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'cicilan', payerName: 'A', transferDate: '2026-11-08', amountPaid: 200000 }, { file: img('b.png') })).ok !== true)
check('unggah bukti pendaftaran', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'pendaftaran', payerName: 'A', transferDate: '2026-11-08', amountPaid: 200000 }, { file: img('b.png') })).ok === true)
check('bukti kedua saat menunggu ditolak', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'pendaftaran', payerName: 'A', transferDate: '2026-11-08', amountPaid: 200000 }, { file: img('b.png') })).ok !== true)
check('ujian masih terkunci sebelum konfirmasi', (await a.c.rpc('startExam', exam.id, exam.token)).ok !== true)
const pay = (await adm.state()).payments.find((p) => p.registrationId === reg.id && p.status === 'submitted')
check('antrean memuat jenis pendaftaran Rp200.000', pay?.kind === 'pendaftaran' && pay.amountDue === 200000)
check('Akademik tidak bisa konfirmasi pembayaran', (await akad.rpc('verifyPayment', pay.id)).status === 403)
check('Admin Pendaftaran bisa konfirmasi pembayaran', (await adm.rpc('verifyPayment', pay.id)).ok === true)
st = await a.c.state()
check('tahap ujian terbuka', st.registrations[0].stage === 'ujian')
check('notifikasi konfirmasi pembayaran', st.notifications.some((n) => /dikonfirmasi/i.test(n.title)))
check('email konfirmasi masuk antrean', (await adm.state()).emails.some((e) => e.to === `adma${stamp}@example.com` && /dikonfirmasi/i.test(e.subject)))

console.log('Ujian bertoken')
check('peserta tidak melihat token di state', st.exams.every((e) => e.token === undefined) && st.exams.length > 0 && st.examTokens.length === 0)
check('token salah ditolak', (await a.c.rpc('startExam', exam.id, 'SALAH1')).ok !== true)
const started = await a.c.rpc('startExam', exam.id, exam.token.toLowerCase())
check('token benar memulai ujian (tanpa peduli huruf besar)', started.ok === true, JSON.stringify(started))
const qs = started.data.questions
check('jumlah soal sesuai pengaturan (atau seisi bank)', qs.length === Math.min(exam.questionCount, (await adm.state()).banks.find((b) => b.id === exam.bankId).count))
check('soal tanpa kunci jawaban', qs.every((q) => q.correctIdx === undefined && q.options.length >= 2))
const again = await a.c.rpc('startExam', exam.id, exam.token)
check('mulai ulang melanjutkan percobaan yang sama', again.data.attemptId === started.data.attemptId && again.data.questions.map((q) => q.id).join() === qs.map((q) => q.id).join())
const key = Object.fromEntries((await adm.state()).questions.map((q) => [q.id, q.correctIdx]))
const answers = Object.fromEntries(qs.map((q, i) => [q.id, i % 2 === 0 ? key[q.id] : (key[q.id] + 1) % q.options.length]))
check('simpan jawaban sementara', (await a.c.rpc('saveExamAnswers', started.data.attemptId, answers)).ok === true)
check('peserta lain tidak bisa menyelesaikan ujian ini', (await new Client().rpc('finishExam', started.data.attemptId, answers)).status === 401)
check('selesai ujian', (await a.c.rpc('finishExam', started.data.attemptId, answers)).ok === true)
st = await a.c.state()
check('tahap menunggu hasil', st.registrations[0].stage === 'menunggu_hasil')
check('nilai tidak dikirim ke peserta', st.attempts.length === 0 && !JSON.stringify(st).includes('"score"'))
check('ujian tidak bisa diulang', (await a.c.rpc('startExam', exam.id, exam.token)).ok !== true)
const aStaff = await adm.state()
const att = aStaff.attempts.find((x) => x.registrationId === reg.id)
const right = qs.filter((q, i) => i % 2 === 0).length
check('staf melihat skor yang benar', att && Math.abs(att.score - Math.round((right / qs.length) * 10000) / 100) < 0.01, JSON.stringify(att))

console.log('Keputusan dan surat kelulusan')
check('peserta tidak bisa memutuskan', (await a.c.rpc('decideAdmission', reg.id, true, batch.id)).status === 403)
check('Keuangan tidak bisa memutuskan', (await uang.rpc('decideAdmission', reg.id, true, batch.id)).status === 403)
check('lulus tanpa angkatan ditolak', (await adm.rpc('decideAdmission', reg.id, true, '')).ok !== true)
check('surat belum ada sebelum lulus', (await a.c.req(`/api/surat/${reg.id}/pdf`)).status === 404)
check('admin menyatakan lulus', (await adm.rpc('decideAdmission', reg.id, true, batch.id)).ok === true)
st = await a.c.state()
check('tahap registrasi ulang dengan angkatan dan nomor', st.registrations[0].stage === 'registrasi_ulang' && st.registrations[0].batchId === batch.id && st.registrations[0].admissionNo > 0)
check('notifikasi lulus', st.notifications.some((n) => /LULUS/.test(n.title)))
const letter = await a.c.req(`/api/surat/${reg.id}/pdf`)
const bytes = Buffer.from(await letter.arrayBuffer())
check('surat kelulusan berupa PDF', letter.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 2000, `${letter.status} ${bytes.length}`)
const b = await newApplicant('B')
check('peserta lain tidak bisa membuka surat ini', (await b.c.req(`/api/surat/${reg.id}/pdf`)).status === 403)
check('keputusan tidak bisa diulang', (await adm.rpc('decideAdmission', reg.id, false)).ok !== true)

console.log('Registrasi ulang dan cicilan')
check('Admin Pendaftaran tidak bisa menambah biaya tambahan', (await adm.rpc('saveFeeItem', { name: 'x', amount: 1, programId: '', active: true })).status === 403)
check('biaya tambahan negatif ditolak', (await uang.rpc('saveFeeItem', { name: 'Jas almamater', amount: -5, programId: '', active: true })).ok !== true)
check('Keuangan menambah biaya jas almamater', (await uang.rpc('saveFeeItem', { name: 'Jas almamater', amount: 450000, programId: '', active: true })).ok === true)
check('peserta melihat biaya tambahan aktif', (await a.c.state()).feeItems.some((x) => x.name === 'Jas almamater' && x.amount === 450000))
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64)])
const pdf = (name) => ({ bytes: PDF, type: 'application/pdf', name })
check('berkas belum bisa diunggah sebelum registrasi ulang selesai', (await a.c.form('/api/upload/document/ktp', {}, { file: img('k.png') })).status === 403)
const plans = st.plans
const cicil = plans.find((p) => p.installments > 1)
check('paket pembayaran tersedia untuk peserta', !!cicil && plans.some((p) => p.installments === 1))
check('bayar registrasi ulang sebelum pilih paket ditolak', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'registrasi_ulang', payerName: 'A', transferDate: '2026-11-08', amountPaid: 1000000 }, { file: img('b.png') })).ok !== true)
check('pilih paket cicilan', (await a.c.rpc('choosePlan', reg.id, cicil.id)).ok === true)
let insts = (await a.c.state()).installments
check('jadwal cicilan dibuat, termin pertama sebesar uang muka', insts.length === cicil.installments && insts[0].amount === cicil.downPayment && insts.every((i) => i.status === 'unpaid'))
const program = st.programs.find((p) => p.id === reg.programId)
const extraNow = (await uang.state()).feeItems.filter((x) => x.active && (!x.programId || x.programId === program.id)).reduce((s2, x) => s2 + x.amount, 0)
const expectedTotal = program.price + extraNow - 200000
check('jumlah termin = biaya program + semua biaya tambahan aktif - biaya pendaftaran', insts.reduce((t, i) => t + i.amount, 0) === expectedTotal, `${insts.reduce((t, i) => t + i.amount, 0)} vs ${expectedTotal}`)
check('biaya jas almamater uji ikut terhitung', extraNow >= 450000)
const single = plans.find((p) => p.installments === 1)
check('peserta boleh mengganti paket sebelum bayar', (await a.c.rpc('choosePlan', reg.id, single.id)).ok === true && (await a.c.state()).installments.length === 1)
check('ganti kembali ke cicilan', (await a.c.rpc('choosePlan', reg.id, cicil.id)).ok === true)
insts = (await a.c.state()).installments
check('unggah bukti registrasi ulang', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'registrasi_ulang', payerName: 'A', transferDate: '2026-11-08', amountPaid: insts[0].amount }, { file: img('b.png') })).ok === true)
check('paket tidak bisa diganti setelah bukti diunggah', (await a.c.rpc('choosePlan', reg.id, single.id)).ok !== true)
const pay2 = (await uang.state()).payments.find((p) => p.registrationId === reg.id && p.status === 'submitted')
check('Keuangan menolak lalu peserta unggah ulang', (await uang.rpc('rejectPayment', pay2.id, 'Nominal tidak sesuai')).ok === true)
check('cicilan kembali belum dibayar setelah ditolak', (await a.c.state()).installments[0].status === 'unpaid')
check('unggah ulang bukti registrasi ulang', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'registrasi_ulang', payerName: 'A', transferDate: '2026-11-08', amountPaid: insts[0].amount }, { file: img('b.png') })).ok === true)
const pay3 = (await uang.state()).payments.find((p) => p.registrationId === reg.id && p.status === 'submitted')
check('Keuangan menyetujui registrasi ulang', (await uang.rpc('verifyPayment', pay3.id)).ok === true)
st = await a.c.state()
check('peserta aktif belajar', st.registrations[0].stage === 'aktif' && st.registrations[0].status === 'active')
check('cicilan pertama lunas', st.installments[0].status === 'paid')
const aReg = st.registrations[0]
const nipPrefix = `${batch.startDate.slice(0, 4)}${batch.angkatan}${program.nipCode}`
check('NIP terbit saat registrasi ulang dikonfirmasi', /^\d{9}$/.test(aReg.nip ?? ''), String(aReg.nip))
check('format NIP: tahun masuk + angkatan + kode program + nomor urut', aReg.nip?.startsWith(nipPrefix) && aReg.nip.length === nipPrefix.length + 3, `${aReg.nip} vs ${nipPrefix}`)
check('notifikasi registrasi ulang memuat NIP', st.notifications.some((n) => n.body.includes(aReg.nip)))
check('NIP tidak bisa diterbitkan dua kali', (await adm.rpc('issueNip', reg.id)).ok !== true)
check('peserta tidak bisa menerbitkan NIP', (await a.c.rpc('issueNip', reg.id)).status === 403)
const second = st.installments.find((i) => i.seq === 2)
check('bayar cicilan kedua', (await a.c.form(`/api/upload/proof/${reg.id}`, { kind: 'cicilan', installmentId: second.id, payerName: 'A', transferDate: '2026-11-08', amountPaid: second.amount }, { file: img('b.png') })).ok === true)
check('cicilan milik peserta lain ditolak', (await b.c.form(`/api/upload/proof/${b.c.cookie ? (await b.c.state()).registrations[0].id : ''}`, { kind: 'cicilan', installmentId: second.id, payerName: 'B', transferDate: '2026-11-08', amountPaid: second.amount }, { file: img('b.png') })).ok !== true)
const pay4 = (await uang.state()).payments.find((p) => p.registrationId === reg.id && p.status === 'submitted')
check('Keuangan menyetujui cicilan', (await uang.rpc('verifyPayment', pay4.id)).ok === true)
check('cicilan kedua lunas', (await a.c.state()).installments.find((i) => i.seq === 2).status === 'paid')

const item = (await uang.state()).feeItems.find((x) => x.name === 'Jas almamater')
check('Keuangan menghapus biaya tambahan', (await uang.rpc('deleteFeeItem', item.id)).ok === true)
check('jadwal cicilan yang ada tidak berubah setelah biaya dihapus', (await a.c.state()).installments.reduce((s, i) => s + i.amount, 0) === expectedTotal)

console.log('Berkas registrasi ulang')
const upl = (kind, file) => a.c.form(`/api/upload/document/${kind}`, {}, { file })
check('jenis berkas tidak dikenal ditolak', (await upl('sim', img('x.png'))).status === 404)
check('unggah tanpa berkas ditolak', (await a.c.form('/api/upload/document/ktp', {})).ok !== true)
check('pas foto berupa PDF ditolak', (await upl('foto', pdf('f.pdf'))).ok !== true)
check('berkas palsu ditolak', (await upl('kk', { bytes: Buffer.from('bukan gambar sama sekali, hanya teks biasa'), type: 'image/png', name: 'x.png' })).ok !== true)
const docKinds = ['ktp', 'ijazah', 'foto', 'kk', 'buta_warna']
check('unggah KTP pertama', (await upl('ktp', img('ktp0.png'))).ok === true)
const ktp0 = (await a.c.state()).documents.find((d) => d.kind === 'ktp').fileId
check('selama berkas belum lengkap, peserta bisa mengganti KTP', (await upl('ktp', img('ktp0b.png'))).ok === true)
const ktp0b = (await a.c.state()).documents.filter((d) => d.kind === 'ktp')
check('KTP tetap satu dengan berkas baru', ktp0b.length === 1 && ktp0b[0].fileId !== ktp0)
check('berkas KTP lama dihapus dari penyimpanan', (await a.c.req(`/api/files/${ktp0}`)).status === 404)
for (const k of docKinds) check(`unggah ${k}`, (await upl(k, k === 'foto' ? img('f.png') : k === 'ijazah' ? pdf('i.pdf') : img(`${k}.png`))).ok === true)
let docs = (await a.c.state()).documents
check('kelima berkas tercatat', docs.length === 5 && docKinds.every((k) => docs.some((d) => d.kind === k)))
const ktp1 = docs.find((d) => d.kind === 'ktp').fileId
check('pemilik bisa membuka berkas', (await a.c.req(`/api/files/${ktp1}`)).status === 200)
check('peserta lain tidak bisa membuka berkas', (await b.c.req(`/api/files/${ktp1}`)).status === 404)
check('Admin Pendaftaran bisa membuka berkas', (await adm.req(`/api/files/${ktp1}`)).status === 200)
check('Keuangan tidak bisa membuka berkas', (await uang.req(`/api/files/${ktp1}`)).status === 404)
check('admin melihat berkas peserta di state', (await adm.state()).documents.filter((d) => d.userId === reg.userId).length === 5)
check('setelah kelima berkas lengkap, peserta tidak bisa mengganti berkas sendiri', (await upl('ktp', img('ktp2.png'))).status === 403)
check('berkas KTP tetap yang pertama', (await a.c.state()).documents.find((d) => d.kind === 'ktp').fileId === ktp1)
check('Keuangan tidak bisa menghapus berkas', (await uang.rpc('removeDocument', reg.userId, 'ktp')).status === 403)
check('peserta tidak bisa menghapus berkas lewat jalur admin', (await a.c.rpc('removeDocument', reg.userId, 'ktp')).status === 403)
check('admin menghapus KTP, lalu yang kedua kali ditolak', (await adm.rpc('removeDocument', reg.userId, 'ktp')).ok === true && (await adm.rpc('removeDocument', reg.userId, 'ktp')).ok !== true)
docs = (await a.c.state()).documents
check('tersisa empat berkas tanpa KTP', docs.length === 4 && !docs.some((d) => d.kind === 'ktp'))
check('berkas lama hilang dari penyimpanan', (await adm.req(`/api/files/${ktp1}`)).status === 404)
check('peserta diminta unggah ulang', (await a.c.state()).notifications.some((n) => /Unggah ulang KTP/.test(n.title)))
check('peserta mengunggah KTP baru', (await upl('ktp', img('ktp2.png'))).ok === true && (await a.c.state()).documents.length === 5)
check('peserta lain tidak bisa mengunggah atas nama orang lain', (await b.c.form('/api/upload/document/ktp', {}, { file: img('k.png') })).status === 403)

console.log('Data diri terkunci setelah registrasi ulang')
const aFields = (over = {}) => ({ ...profileFields(a.n), ...over })
check('peserta aktif tidak bisa mengubah data diri', (await a.c.form('/api/upload/profile', aFields({ address: 'Alamat baru 1' }))).status === 403)
check('pesan terkunci menyebut admin', /admin/i.test((await a.c.form('/api/upload/profile', aFields())).error ?? ''))
check('data diri peserta tidak berubah', (await adm.state()).profiles.find((p) => p.userId === reg.userId).address === 'Jl. Uji No. 5')
check('peserta tidak bisa memakai jalur admin', (await a.c.form(`/api/admin/profile/${reg.userId}`, aFields({ address: 'Dibajak' }))).ok !== true)
check('Keuangan tidak bisa mengubah data diri', (await uang.form(`/api/admin/profile/${reg.userId}`, aFields({ address: 'Dibajak' }))).status === 403)
check('Akademik tidak bisa mengubah data diri', (await akad.form(`/api/admin/profile/${reg.userId}`, aFields({ address: 'Dibajak' }))).status === 403)
check('admin mengubah data diri peserta aktif', (await adm.form(`/api/admin/profile/${reg.userId}`, aFields({ address: 'Jl. Koreksi Admin No. 9', school: 'SMK Koreksi' }))).ok === true)
const aAfter = (await adm.state()).profiles.find((p) => p.userId === reg.userId)
check('perubahan admin tersimpan', aAfter.address === 'Jl. Koreksi Admin No. 9' && aAfter.school === 'SMK Koreksi')
check('peserta melihat data hasil koreksi admin', (await a.c.state()).profiles[0].address === 'Jl. Koreksi Admin No. 9')
const newNik = nik()
check('admin boleh mengoreksi NIK', (await adm.form(`/api/admin/profile/${reg.userId}`, aFields({ nik: newNik }))).ok === true && (await adm.state()).users.find((u) => u.id === reg.userId).nik === newNik)
check('koreksi NIK ke NIK milik peserta lain ditolak', (await adm.form(`/api/admin/profile/${reg.userId}`, aFields({ nik: b.n }))).ok !== true)
check('data peserta yang tidak ada ditolak', (await adm.form('/api/admin/profile/tidak-ada', aFields())).status === 404)
check('peserta aktif tidak bisa memulai ujian lagi', (await a.c.rpc('startExam', exam.id, exam.token)).ok !== true)

console.log('Pembayaran kurang dan berlebih')
async function toReenroll(tag) {
  const x = await newApplicant(tag)
  const rid = (await x.c.state()).registrations[0].id
  await x.c.form('/api/upload/profile', profileFields(x.n))
  await x.c.form(`/api/upload/proof/${rid}`, { kind: 'pendaftaran', payerName: tag, transferDate: '2026-11-08', amountPaid: 200000 }, { file: img('b.png') })
  await uang.rpc('verifyPayment', (await uang.state()).payments.find((p) => p.registrationId === rid && p.status === 'submitted').id)
  const tk = await adm.rpc('createExamToken', exam.id, 60)
  const sx = await x.c.rpc('startExam', exam.id, tk.data)
  await x.c.rpc('finishExam', sx.data.attemptId, {})
  await adm.rpc('decideAdmission', rid, true, batch.id)
  return { ...x, rid }
}
const plan3 = plans.find((p) => p.installments >= 3)
const minRe = (await uang.state()).settings.minReenroll
const upProof = (u, body) => u.c.form(`/api/upload/proof/${u.rid}`, { payerName: 'X', transferDate: '2026-11-08', ...body }, { file: img('b.png') })
const confirmLast = async (u) => uang.rpc('verifyPayment', (await uang.state()).payments.find((p) => p.registrationId === u.rid && p.status === 'submitted').id)

// kurang dari minimal
const d = await toReenroll('D')
check('peserta D memilih paket cicilan', (await d.c.rpc('choosePlan', d.rid, plan3.id)).ok === true)
const dInst = (await d.c.state()).installments
const half = Math.floor(Math.min(minRe, dInst[0].amount) / 2)
check('nominal melebihi seluruh sisa tagihan ditolak', (await upProof(d, { kind: 'registrasi_ulang', amountPaid: dInst.reduce((s2, i) => s2 + i.amount, 0) + 1 })).ok !== true)
check('bayar kurang dari minimal tetap bisa diunggah', (await upProof(d, { kind: 'registrasi_ulang', amountPaid: half })).ok === true)
const qd = (await uang.state()).payments.find((p) => p.registrationId === d.rid && p.status === 'submitted')
check('antrean keuangan memuat selisih kurang', qd.amountPaid < qd.amountDue)
check('Keuangan tetap bisa menyetujui pembayaran kurang', (await uang.rpc('verifyPayment', qd.id)).ok === true)
let ds = await d.c.state()
check('peserta D aktif walau pembayaran kurang', ds.registrations[0].stage === 'aktif' && ds.registrations[0].status === 'active')
check('termin pertama sebagian terbayar', ds.installments[0].paidAmount === half && ds.installments[0].status === 'partial', JSON.stringify(ds.installments[0]))
const noteD = ds.notifications.find((n) => /kurang/i.test(n.title))
check('notifikasi segera melunasi kekurangan', !!noteD && /Segera lunasi/.test(noteD.body), JSON.stringify(noteD))
check('Keuangan mengumumkan, pengingat memuat kekurangan', (await uang.rpc('remindPayment', [d.rid])).data.sent === 1 && (await d.c.state()).notifications.some((n) => n.title === 'Pengingat pembayaran' && /Kekurangan registrasi ulang/.test(n.body)))
const shortD = Math.min(minRe, dInst[0].amount) - half
check('bayar kekurangan lewat termin pertama', (await upProof(d, { kind: 'cicilan', installmentId: ds.installments[0].id, amountPaid: shortD })).ok === true && (await confirmLast(d)).ok === true)
ds = await d.c.state()
check('kekurangan lunas, tidak ada pesan kurang lagi', ds.installments[0].paidAmount === half + shortD)

// lebih dari tagihan
const e = await toReenroll('E')
check('peserta E memilih paket cicilan', (await e.c.rpc('choosePlan', e.rid, plan3.id)).ok === true)
const eInst = (await e.c.state()).installments
const extra = 100000
const payE = eInst[0].amount + eInst[1].amount + extra
check('bayar lebih dari dua termin diunggah', (await upProof(e, { kind: 'registrasi_ulang', amountPaid: payE })).ok === true)
check('Keuangan menyetujui pembayaran lebih', (await confirmLast(e)).ok === true)
const es = await e.c.state()
check('termin 1 dan 2 lunas, kelebihan memotong termin 3', es.installments[0].status === 'paid' && es.installments[1].status === 'paid' && es.installments[2].paidAmount === extra && es.installments[2].status === 'partial', JSON.stringify(es.installments))
check('total terbayar sama dengan nominal transfer', es.installments.reduce((s2, i) => s2 + i.paidAmount, 0) === payE)
check('notifikasi menyebut kelebihan memotong cicilan', es.notifications.some((n) => /memotong cicilan/.test(n.body)))
const left3 = es.installments[2].amount - extra
check('sisa dibayar sesuai sisa termin 3', (await upProof(e, { kind: 'cicilan', installmentId: es.installments[2].id, amountPaid: left3 })).ok === true && (await confirmLast(e)).ok === true && (await e.c.state()).installments.every((i) => i.status === 'paid'))

const suffix = (n) => Number(n.slice(-3))
const dNip = (await d.c.state()).registrations[0].nip, eNip = (await e.c.state()).registrations[0].nip
check('nomor urut NIP berjalan per angkatan', suffix(dNip) === suffix(aReg.nip) + 1 && suffix(eNip) === suffix(dNip) + 1, `${aReg.nip} ${dNip} ${eNip}`)
check('semua NIP unik', new Set([aReg.nip, dNip, eNip]).size === 3)

console.log('Tidak lulus')
const regB = (await b.c.state()).registrations[0]
check('keputusan sebelum ujian ditolak', (await adm.rpc('decideAdmission', regB.id, false)).ok !== true)
await b.c.form('/api/upload/profile', profileFields(b.n))
await b.c.form(`/api/upload/proof/${regB.id}`, { kind: 'pendaftaran', payerName: 'B', transferDate: '2026-11-08', amountPaid: 200000 }, { file: img('b.png') })
await uang.rpc('verifyPayment', (await uang.state()).payments.find((p) => p.registrationId === regB.id && p.status === 'submitted').id)
const tok2 = await adm.rpc('createExamToken', exam.id, 1440)
check('token 24 jam dibuat', tok2.ok === true && tok2.data !== tok1)
check('token lama tidak berlaku setelah diganti', (await b.c.rpc('startExam', exam.id, tok1)).ok !== true)
const sb = await b.c.rpc('startExam', exam.id, tok2.data)
check('token baru dipakai peserta B', sb.ok === true, JSON.stringify(sb))
check('peserta B tetap bisa lanjut setelah token dicabut', (await adm.rpc('revokeExamToken', (await adm.state()).examTokens.find((x) => x.token === tok2.data).id)).ok === true && (await b.c.rpc('startExam', exam.id, 'TIDAKADA')).ok === true)
await b.c.rpc('finishExam', sb.data.attemptId, {})
check('peserta B menunggu hasil tanpa jawaban', (await b.c.state()).registrations[0].stage === 'menunggu_hasil')
check('admin menyatakan tidak lulus', (await adm.rpc('decideAdmission', regB.id, false)).ok === true)
const afterB = (await b.c.state()).registrations[0]
check('status tidak lulus dan dibatalkan', afterB.stage === 'tidak_lulus' && afterB.status === 'cancelled')
check('tidak ada surat untuk yang tidak lulus', (await b.c.req(`/api/surat/${regB.id}/pdf`)).status === 404)

console.log('Pengelolaan ujian dan biaya')
check('peserta tidak bisa mengubah ujian', (await a.c.rpc('saveExamConfig', { ...exam, bankId: exam.bankId })).status === 403)
check('Keuangan tidak bisa mengubah bank soal', (await uang.rpc('saveBank', { name: 'x' })).status === 403)
check('Akademik membuat bank soal', (await akad.rpc('saveBank', { name: `Uji ${stamp}` })).ok === true)
const bank = (await akad.state()).banks.find((x) => x.name === `Uji ${stamp}`)
check('soal tanpa kunci valid ditolak', (await akad.rpc('saveQuestions', bank.id, [{ body: 'Q', options: ['a', 'b'], correctIdx: 5 }])).ok !== true)
check('soal dengan satu pilihan ditolak', (await akad.rpc('saveQuestions', bank.id, [{ body: 'Q', options: ['a'], correctIdx: 0 }])).ok !== true)
check('Akademik menambah soal', (await akad.rpc('saveQuestions', bank.id, [{ body: '1+1?', options: ['1', '2', '3'], correctIdx: 1 }])).ok === true)
check('jendela waktu terbalik ditolak', (await akad.rpc('saveExamConfig', { title: 'T', bankId: bank.id, programId: '', token: '', openAt: new Date(Date.now() + 5e6).toISOString(), closeAt: new Date().toISOString(), durationMin: 30, questionCount: 1, active: true })).ok !== true)
check('ujian yang sudah dikerjakan tidak bisa dihapus', (await adm.rpc('deleteExam', exam.id)).ok !== true)
check('Admin tidak bisa mengubah biaya', (await adm.rpc('saveFees', {})).status === 403)
check('Keuangan menambah paket', (await uang.rpc('savePlan', { name: `Paket uji ${stamp}`, programId: '', downPayment: 500000, installments: 2, active: true })).ok === true)
check('paket dengan termin 0 ditolak', (await uang.rpc('savePlan', { name: 'x', programId: '', downPayment: 0, installments: 0, active: true })).ok !== true)
const fees = (await uang.state()).settings
check('Keuangan menyimpan biaya, kunci lain tidak hilang', (await uang.rpc('saveFees', { regFee: fees.regFee, minReenroll: fees.minReenroll, bankName: fees.bankName, bankAccount: fees.bankAccount, bankHolder: fees.bankHolder, reenrollDue: fees.reenrollDue, refundCutoff: fees.refundCutoff, pelunasanDue: fees.pelunasanDue })).ok === true && (await uang.state()).settings.ketuaName === fees.ketuaName)
check('rekening BNI sesuai ketentuan', fees.bankAccount === '2040792254' && /BNI/i.test(fees.bankName) && /Daya Juang/i.test(fees.bankHolder))

console.log('Kode NIP program dan angkatan')
const progs0 = (await adm.state()).programs
const p0 = progs0.find((p) => p.id === batch.programId)
check('kode NIP di luar 1 sampai 9 ditolak', (await adm.rpc('saveProgram', { ...p0, nipCode: 10 })).ok !== true)
check('kode NIP nol ditolak', (await adm.rpc('saveProgram', { ...p0, nipCode: 0 })).ok !== true)
const other = progs0.find((p) => p.id !== p0.id && !p.archived)
if (other) check('kode NIP yang sama dengan program lain ditolak', (await adm.rpc('saveProgram', { ...other, nipCode: p0.nipCode })).ok !== true)
check('angkatan di luar 1 sampai 9 ditolak', (await adm.rpc('saveBatch', { ...batch, angkatan: 10 })).ok !== true)
check('angkatan berhuruf ditolak', (await adm.rpc('saveBatch', { ...batch, angkatan: 'x' })).ok !== true)

console.log(`\n${pass} lulus, ${failed} gagal`)
process.exit(failed ? 1 : 0)
