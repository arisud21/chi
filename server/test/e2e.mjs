// Uji end-to-end terhadap API yang sedang berjalan. Jalankan: node test/e2e.mjs (setelah `npm run seed` dan `npm start`).
const BASE = process.env.API || 'http://localhost:4000'
let pass = 0, failed = 0
const check = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ', name) } else { failed++; console.log('  GAGAL', name, extra) } }

class Client {
  cookie = ''
  async req(path, init = {}) {
    const res = await fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), cookie: this.cookie }, redirect: 'manual' })
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]
    return res
  }
  async json(path, body) { const r = await this.req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json().catch(() => ({}))) } }
  login(email, password = 'demo12345') { return this.json('/api/auth/login', { email, password }) }
  rpc(name, ...args) { return this.json(`/api/rpc/${name}`, { args }) }
  async state() { return (await this.req('/api/state')).json() }
  async form(path, fields, file) {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    if (file) f.set('file', new Blob([file.bytes], { type: file.type }), file.name)
    const r = await this.req(path, { method: 'POST', body: f }); return { status: r.status, ...(await r.json().catch(() => ({}))) }
  }
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])

console.log('Auth')
const bad = new Client(); check('login password salah ditolak', (await bad.login('super@cih.demo', 'salah')).status === 401)
const anon = new Client(); const st0 = await anon.state()
check('publik tidak melihat registrasi/pengguna', st0.registrations.length === 0 && st0.users.length === 0)
check('publik tidak melihat rekening bank', st0.settings.bankAccount === undefined)
check('RPC tanpa login ditolak', (await anon.rpc('verifyPayment', 'x')).status === 401)

console.log('Izin akses')
const daftar = new Client(); await daftar.login('pendaftaran@cih.demo')
check('Admin Pendaftaran tidak bisa verifikasi pembayaran', (await daftar.rpc('verifyPayment', 'x')).status === 403)
const p1 = new Client(); await p1.login('peserta@cih.demo')
const s1 = await p1.state()
check('peserta hanya melihat dirinya', s1.users.length === 1 && s1.registrations.every((r) => r.userId === s1.sessionUserId))
check('peserta tidak bisa memvalidasi nilai', (await p1.rpc('validateGrade', 'x', true)).status === 403)

console.log('Pembayaran')
const p2 = new Client(); await p2.login('baru@cih.demo')
const reg2 = (await p2.state()).registrations[0]
const txt = await p2.form(`/api/upload/proof/${reg2.id}`, { payerName: 'X', transferDate: '2026-11-08', amountPaid: reg2.priceSnapshot + reg2.uniqueCode }, { bytes: Buffer.from('<script>alert(1)</script>'.repeat(5)), type: 'image/png', name: 'x.png' })
check('berkas palsu (magic bytes salah) ditolak', txt.status === 400, JSON.stringify(txt))
const up = await p2.form(`/api/upload/proof/${reg2.id}`, { payerName: 'Peserta Baru', transferDate: '2026-11-08', amountPaid: reg2.priceSnapshot + reg2.uniqueCode }, { bytes: PNG, type: 'image/png', name: 'bukti.png' })
check('unggah bukti PNG valid', up.ok === true, JSON.stringify(up))
check('registrasi jadi waiting_verification', (await p2.state()).registrations[0].status === 'waiting_verification')
const uang = new Client(); await uang.login('keuangan@cih.demo')
const queue = (await uang.state()).payments.filter((p) => p.status === 'submitted')
check('antrean keuangan berisi 2 bukti', queue.length === 2, String(queue.length))
const mine = queue.find((p) => p.registrationId === reg2.id)
check('tolak tanpa alasan gagal', (await uang.rpc('rejectPayment', mine.id, '')).ok === false)
check('tolak dengan alasan berhasil', (await uang.rpc('rejectPayment', mine.id, 'Nominal tidak sesuai')).ok === true)
check('registrasi kembali pending_payment', (await p2.state()).registrations[0].status === 'pending_payment')
await p2.form(`/api/upload/proof/${reg2.id}`, { payerName: 'Peserta Baru', transferDate: '2026-11-08', amountPaid: reg2.priceSnapshot + reg2.uniqueCode }, { bytes: PNG, type: 'image/png', name: 'b2.png' })
const q2 = (await uang.state()).payments.find((p) => p.registrationId === reg2.id && p.status === 'submitted')
check('setujui pembayaran', (await uang.rpc('verifyPayment', q2.id)).ok === true)
check('registrasi aktif + grade dibuat', (await p2.state()).registrations[0].status === 'active')
const proof = await uang.req(`/api/files/${q2.proofFileId}`)
check('keuangan bisa membuka bukti', proof.status === 200)
check('peserta lain tidak bisa membuka bukti', (await p1.req(`/api/files/${q2.proofFileId}`)).status === 404)

console.log('Kuota (oversell)')
const adm = new Client(); await adm.login('pendaftaran@cih.demo')
const sup0 = new Client(); await sup0.login('super@cih.demo')
const st = await adm.state()
const prog = st.programs.find((p) => p.slug === 'tata-boga-dasar')
const bid = crypto.randomUUID()
check('buat angkatan kuota 1', (await adm.rpc('saveBatch', { id: bid, programId: prog.id, code: 'TEST-Q1-' + Date.now() % 100000, startDate: '2027-01-01', endDate: '2027-02-01', quota: 1, status: 'open', instructorId: '', location: 'x' })).ok === true)
const a = new Client(), b = new Client(); await a.login('peserta@cih.demo'); await b.login('lulus@cih.demo')
const [ra, rb] = await Promise.all([a.rpc('createRegistration', bid), b.rpc('createRegistration', bid)])
check('hanya satu yang dapat kursi (kuota 1)', [ra.ok, rb.ok].filter(Boolean).length === 1, JSON.stringify([ra, rb]))
check('program sama tidak boleh dobel', (await (ra.ok ? a : b).rpc('createRegistration', bid)).ok === false)

console.log('Nilai dan sertifikat')
const ins = new Client(); await ins.login('instruktur@cih.demo')
const sess = (await ins.state()).sessions[0]
const aReg = (await ins.state()).registrations.filter((r) => r.status === 'active')
const marks = Object.fromEntries(aReg.map((r) => [r.id, 'hadir']))
check('instruktur simpan absensi', (await ins.rpc('saveAttendance', sess.id, marks)).ok === true)
const insState = await ins.state()
check('instruktur tidak melihat email peserta', insState.users.filter((u) => u.role === 'peserta').every((u) => u.email === ''))
const akad = new Client(); await akad.login('akademik@cih.demo')
const gs = (await akad.state()).grades
const submitted = gs.find((g) => g.status === 'submitted')
check('nilai submitted dari seed ada', !!submitted)
check('akademik tidak bisa timpa tanpa alasan', (await akad.rpc('validateGrade', submitted.registrationId, false, '')).ok === false)
check('validasi sesuai rekomendasi', (await akad.rpc('validateGrade', submitted.registrationId, true)).ok === true)
check('terbitkan sertifikat', (await akad.rpc('issueCertificate', submitted.registrationId)).ok === true)
check('sertifikat ganda ditolak', (await akad.rpc('issueCertificate', submitted.registrationId)).ok === false)
const cert = (await akad.state()).certificates[0]
check('nomor sertifikat berformat', /^CERT\/CIH\/\d{4}\/0001$/.test(cert.number), cert.number)
const pl = new Client(); await pl.login('lulus@cih.demo')
const pdf = await pl.req(`/api/certificates/${cert.id}/pdf`); const pdfBuf = Buffer.from(await pdf.arrayBuffer())
check('pemilik unduh PDF sertifikat', pdf.status === 200 && pdfBuf.subarray(0, 5).toString() === '%PDF-', String(pdf.status))
check('peserta lain tidak bisa unduh', (await p1.req(`/api/certificates/${cert.id}/pdf`)).status === 403)
const tr = await pl.req(`/api/transcripts/${cert.registrationId}/pdf`)
check('transkrip PDF', tr.status === 200 && Buffer.from(await tr.arrayBuffer()).subarray(0, 5).toString() === '%PDF-')
const ver = await (await anon.req(`/api/verify/${cert.verificationCode}`)).json()
check('verifikasi publik sah', ver.found && ver.status === 'issued' && ver.holder === 'Peserta Lulus')
check('kode palsu tidak ditemukan', (await (await anon.req('/api/verify/ZZZZZZZZZZ')).json()).found === false)
check('cabut tanpa alasan gagal', (await akad.rpc('revokeCertificate', cert.id, '')).ok === false)
check('cabut dengan alasan', (await akad.rpc('revokeCertificate', cert.id, 'Salah nama')).ok === true)
check('verifikasi publik menunjukkan dicabut', (await (await anon.req(`/api/verify/${cert.verificationCode}`)).json()).status === 'revoked')
const tpl = (await akad.state()).templates[0]
const prev = await akad.req(`/api/templates/${tpl.id}/preview.pdf`)
check('pratinjau template PDF', prev.status === 200 && Buffer.from(await prev.arrayBuffer()).subarray(0, 5).toString() === '%PDF-')

console.log('Landing page')
const cms = new Client(); await cms.login('super@cih.demo')
const draft = (await cms.state()).draftSections
check('Super Admin melihat draf landing page', draft.length > 0)
check('Admin Pendaftaran melihat draf landing page', (await daftar.state()).draftSections.length > 0)
check('Admin Pendaftaran bisa menyimpan draf', (await daftar.rpc('saveDraft', draft)).ok === true)
check('Admin Keuangan tidak bisa menyimpan draf', (await uang.rpc('saveDraft', draft)).status === 403)
check('Akademik tidak melihat draf landing page', (await akad.state()).draftSections.length === 0)
check('Admin Pendaftaran tidak bisa menghapus media', (await daftar.rpc('deleteMedia', 'x')).status === 403)
const bad2 = structuredClone(draft); bad2[0].content.ctaHref = 'javascript:alert(1)'
check('tautan javascript: ditolak', (await cms.rpc('saveDraft', bad2)).ok === false)
const edited = structuredClone(draft); edited[0].content.title = 'Judul uji ' + Date.now()
check('terbitkan perubahan', (await cms.rpc('publishDraft', edited, 'uji e2e')).ok === true)
check('publik melihat versi terbit', (await anon.state()).publishedSections[0].content.title === edited[0].content.title)
check('peserta tidak bisa terbitkan', (await p1.rpc('publishDraft', edited, 'x')).status === 403)
const revs = (await cms.state()).revisions
check('riwayat versi tercatat', revs.length >= 2)
check('rollback ke versi awal', (await cms.rpc('restoreRevision', revs[revs.length - 1].id)).ok === true)

console.log('Hapus program dan angkatan')
const progs = (await adm.state()).programs
const withBatch = progs.find((p) => p.slug === 'front-office')
check('program yang punya angkatan tidak bisa dihapus', (await adm.rpc('deleteProgram', withBatch.id)).ok === false)
const newProg = { id: crypto.randomUUID(), slug: 'uji-hapus', title: 'Program Uji Hapus', category: 'Uji', shortDesc: 'x', description: '', durationHours: 10, price: 1000, active: true, archived: false, rules: { theoryWeight: 30, practicalWeight: 70, passingScore: 70, minAttendance: 80 } }
check('buat program kosong', (await adm.rpc('saveProgram', newProg)).ok === true)
const bId = crypto.randomUUID()
await adm.rpc('saveBatch', { id: bId, programId: newProg.id, code: 'UJI-HAPUS-' + (Date.now() % 100000), startDate: '2027-03-01', endDate: '2027-04-01', quota: 5, status: 'draft' })
check('program dengan angkatan kosong masih ditolak', (await adm.rpc('deleteProgram', newProg.id)).ok === false)
check('Akademik tidak bisa menghapus angkatan', (await akad.rpc('deleteBatch', bId)).status === 403)
check('angkatan kosong bisa dihapus', (await adm.rpc('deleteBatch', bId)).ok === true)
check('program kosong bisa dihapus', (await adm.rpc('deleteProgram', newProg.id)).ok === true)
const foBatch = (await adm.state()).batches.find((b) => b.code === 'FO-2026-B2')
check('angkatan yang punya pendaftar tidak bisa dihapus', (await adm.rpc('deleteBatch', foBatch.id)).ok === false)
check('penghapusan tercatat di audit', (await sup0.state()).audit.some((a) => a.action === 'program.hapus'))

console.log('Media')
const img = await cms.form('/api/upload/media', { alt: '' }, { bytes: PNG, type: 'image/png', name: 'a.png' })
check('media tanpa alt ditolak', img.ok !== true)

console.log('Audit')
const sup = new Client(); await sup.login('super@cih.demo')
check('audit log tercatat', (await sup.state()).audit.length > 5)
check('email masuk antrean', (await sup.state()).emails.length > 3)

console.log(`\n${pass} lulus, ${failed} gagal`)
process.exit(failed ? 1 : 0)
