// Uji: bank mata pelajaran (Akademik), jadwal angkatan dengan pilihan mapel, pertemuan per mapel oleh instruktur, materi per pertemuan.
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
  async form(path, fields, file) { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); if (file) f.set('file', new Blob([file], { type: 'application/pdf' }), 'materi.pdf'); const r = await this.req(path, { method: 'POST', body: f }); return { status: r.status, ...(await r.json().catch(() => ({}))) } }
}
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 32)])

const anon = new Client()
const akad = new Client(); await akad.login('akademik@cih.demo')
const ins1 = new Client(); await ins1.login('instruktur@cih.demo')
const ins2 = new Client(); await ins2.login('instruktur2@cih.demo')
const adm = new Client(); await adm.login('pendaftaran@cih.demo')
const st = await akad.state()
const prog = (slug) => st.programs.find((p) => p.slug === slug)
const hk = prog('housekeeping'), fo = prog('front-office')
const hk1 = st.batches.find((b) => b.code === 'HK-2026-B2')
const fo1 = st.batches.find((b) => b.code === 'FO-2026-B3')
const insId = st.users.find((u) => u.email === 'instruktur@cih.demo').id
const hkSubs = st.subjects.filter((x) => x.programId === hk.id)
const foSubs = st.subjects.filter((x) => x.programId === fo.id)
const sched = (b, subjects, over = {}) => ({ batchId: b.id, instructorId: insId, days: ['Sen', 'Rab'], startTime: '09:00', endTime: '11:00', location: 'Ruang A', subjects, ...over })

console.log('Bank mata pelajaran')
check('seed memuat bank mapel per pelatihan', hkSubs.length >= 4 && foSubs.length >= 5, `${hkSubs.length}/${foSubs.length}`)
check('publik hanya melihat mapel aktif', (await anon.state()).subjects.length > 0 && (await anon.state()).subjects.every((x) => x.active))
const newSj = { id: crypto.randomUUID(), programId: hk.id, name: 'Mapel Uji ' + Date.now() % 100000, kind: 'praktik', hours: 6, description: '', active: true }
check('instruktur tidak bisa mengelola bank mapel', (await ins1.rpc('saveSubject', newSj)).status === 403)
check('Admin Pendaftaran tidak bisa mengelola bank mapel', (await adm.rpc('saveSubject', newSj)).status === 403)
check('Akademik menambah mapel', (await akad.rpc('saveSubject', newSj)).ok === true)
check('nama mapel kembar di pelatihan sama ditolak', (await akad.rpc('saveSubject', { ...newSj, id: crypto.randomUUID() })).ok === false)
check('jenis tidak valid ditolak', (await akad.rpc('saveSubject', { ...newSj, id: crypto.randomUUID(), name: 'x', kind: 'lain' })).ok === false)
check('jam 0 ditolak', (await akad.rpc('saveSubject', { ...newSj, id: crypto.randomUUID(), name: 'y', hours: 0 })).ok === false)
check('mapel tidak bisa dipindah ke pelatihan lain', (await akad.rpc('saveSubject', { ...newSj, programId: fo.id })).ok === false)
check('mapel yang dipakai jadwal tidak bisa dihapus', (await akad.rpc('deleteSubject', foSubs[0].id)).ok === false)
check('mapel nonaktif tidak tampil untuk publik', (await akad.rpc('saveSubject', { ...newSj, active: false })).ok === true && !(await anon.state()).subjects.some((x) => x.id === newSj.id))
check('staf tetap melihat mapel nonaktif', (await akad.state()).subjects.some((x) => x.id === newSj.id && !x.active))
check('mapel yang belum dipakai bisa dihapus', (await akad.rpc('deleteSubject', newSj.id)).ok === true)

console.log('Pembagian peran')
const two = [{ subjectId: hkSubs[0].id, sessions: 1 }, { subjectId: hkSubs[1].id, sessions: 1 }]
check('instruktur tidak bisa menetapkan jadwal', (await ins1.rpc('saveBatchSchedule', sched(fo1, two))).status === 403)
check('Admin Pendaftaran tidak bisa menetapkan jadwal', (await adm.rpc('saveBatchSchedule', sched(fo1, two))).status === 403)
check('Akademik tidak bisa menambah pertemuan', (await akad.rpc('savePertemuan', { batchId: fo1.id, subjectId: foSubs[0].id, title: 'x', date: fo1.startDate })).status === 403)

console.log('Jadwal oleh Akademik')
check('jadwal tanpa mapel ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, []))).ok === false)
check('jadwal tanpa hari ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, two, { days: [] }))).ok === false)
check('jam selesai sebelum mulai ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, two, { endTime: '08:00' }))).ok === false)
check('instruktur tak valid ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, two, { instructorId: st.users.find((u) => u.email === 'super@cih.demo').id }))).ok === false)
check('mapel dari pelatihan lain ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, [{ subjectId: foSubs[0].id, sessions: 1 }]))).ok === false)
check('jumlah pertemuan 0 ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, [{ subjectId: hkSubs[0].id, sessions: 0 }]))).ok === false)
check('mapel dobel ditolak', (await akad.rpc('saveBatchSchedule', sched(hk1, [two[0], two[0]]))).ok === false)

console.log('Pertemuan oleh instruktur')
const before = await ins1.rpc('savePertemuan', { batchId: hk1.id, subjectId: hkSubs[0].id, title: 'Belum ada jadwal', date: hk1.startDate })
check('angkatan tanpa jadwal tidak bisa diisi pertemuan', before.ok === false, JSON.stringify(before))
check('Akademik menetapkan jadwal HK dengan 2 mapel (1 + 1 pertemuan)', (await akad.rpc('saveBatchSchedule', sched(hk1, two))).ok === true)
const hkNow = (await akad.state()).batches.find((b) => b.id === hk1.id)
check('total pertemuan dihitung dari mapel (2)', hkNow.plannedSessions === 2, String(hkNow.plannedSessions))
check('pilihan mapel tersimpan di angkatan', (await akad.state()).batchSubjects.filter((x) => x.batchId === hk1.id).length === 2)
const mk = (over = {}) => ({ batchId: hk1.id, subjectId: hkSubs[0].id, title: 'Dasar housekeeping', date: hk1.startDate, ...over })
check('instruktur lain tidak boleh mengisi angkatan ini', (await ins2.rpc('savePertemuan', mk())).status === 403)
check('pertemuan tanpa mapel ditolak', (await ins1.rpc('savePertemuan', mk({ subjectId: '' }))).ok === false)
check('mapel di luar jadwal angkatan ditolak', (await ins1.rpc('savePertemuan', mk({ subjectId: hkSubs[2].id }))).ok === false)
check('mapel pelatihan lain ditolak', (await ins1.rpc('savePertemuan', mk({ subjectId: foSubs[0].id }))).ok === false)
check('tanggal di luar masa angkatan ditolak', (await ins1.rpc('savePertemuan', mk({ date: '2020-01-01' }))).ok === false)
check('tautan http ditolak', (await ins1.rpc('savePertemuan', mk({ meetingUrl: 'http://x.com' }))).ok === false)
check('pertemuan mapel 1 ditambahkan', (await ins1.rpc('savePertemuan', mk())).ok === true)
check('pertemuan mapel 2 ditambahkan', (await ins1.rpc('savePertemuan', mk({ subjectId: hkSubs[1].id, title: 'Penataan kamar', date: hk1.endDate }))).ok === true)
const cap = await ins1.rpc('savePertemuan', mk({ title: 'Melebihi jatah mapel 1' }))
check('melebihi jatah mapel ditolak', cap.ok === false && /jatah/i.test(cap.error ?? ''), JSON.stringify(cap))
const sess = (await ins1.state()).sessions.filter((x) => x.batchId === hk1.id).sort((a, b) => a.startAt.localeCompare(b.startAt))
check('pertemuan menyimpan mapelnya', sess.length === 2 && sess.every((x) => x.subjectId))
check('jam pertemuan mengikuti jadwal (09:00 WIB = 02:00 UTC)', sess[0].startAt.slice(11, 16) === '02:00', sess[0].startAt)
check('lokasi pertemuan mengikuti jadwal', sess[0].location === 'Ruang A')

console.log('Perubahan jadwal saat sudah ada pertemuan')
check('mapel yang sudah punya pertemuan tidak bisa dilepas', (await akad.rpc('saveBatchSchedule', sched(hk1, [two[0]]))).ok === false)
check('jatah tidak bisa di bawah pertemuan yang ada', (await akad.rpc('saveBatchSchedule', sched(hk1, [{ subjectId: hkSubs[0].id, sessions: 1 }, { subjectId: hkSubs[1].id, sessions: 1 }, { subjectId: hkSubs[2].id, sessions: 0 }]))).ok === false)
check('Akademik menambah mapel dan jatah', (await akad.rpc('saveBatchSchedule', sched(hk1, [{ subjectId: hkSubs[0].id, sessions: 2 }, two[1], { subjectId: hkSubs[2].id, sessions: 1 }]))).ok === true)
check('jatah baru bisa dipakai instruktur', (await ins1.rpc('savePertemuan', mk({ title: 'Dasar lanjutan' }))).ok === true)
check('mapel baru bisa dipilih', (await ins1.rpc('savePertemuan', mk({ subjectId: hkSubs[2].id, title: 'Linen' }))).ok === true)
const sess2 = (await ins1.state()).sessions.filter((x) => x.batchId === hk1.id).sort((a, b) => a.startAt.localeCompare(b.startAt))
check('mengganti mapel pertemuan ke yang penuh ditolak', (await ins1.rpc('savePertemuan', mk({ id: sess2.find((x) => x.subjectId === hkSubs[0].id).id, subjectId: hkSubs[1].id, title: 'x' }))).ok === false)

console.log('Materi per pertemuan')
const first = sess2.find((x) => x.subjectId === hkSubs[0].id)
check('materi tanpa pertemuan ditolak', (await ins1.rpc('saveMaterialLink', { title: 'x', url: 'https://x.com' })).ok === false)
check('materi tautan pada pertemuan', (await ins1.rpc('saveMaterialLink', { sessionId: first.id, title: 'Video pembuka', url: 'https://example.com/v' })).ok === true)
const up = await ins1.form('/api/upload/material', { sessionId: first.id, title: 'Modul 1' }, PDF)
check('materi berkas PDF pada pertemuan', up.ok === true, JSON.stringify(up))
check('instruktur lain tidak bisa menambah materi', (await ins2.form('/api/upload/material', { sessionId: first.id, title: 'x' }, PDF)).status === 403)
check('2 materi menempel pada pertemuan', (await ins1.state()).materials.filter((m) => m.sessionId === first.id).length === 2)
const del = await ins1.rpc('deletePertemuan', first.id)
check('hapus pertemuan menghapus materinya', del.ok === true && (await ins1.state()).materials.filter((m) => m.sessionId === first.id).length === 0)
check('jatah mapel kembali longgar setelah hapus', (await ins1.rpc('savePertemuan', mk({ title: 'Pengganti' }))).ok === true)

console.log('Absensi pada pertemuan tanpa peserta aktif')
const live = (await ins1.state()).sessions.find((x) => x.batchId === hk1.id)
check('absensi kosong tidak error (regresi 0/0)', (await ins1.rpc('saveAttendance', live.id, {})).ok === true)
check('absensi untuk peserta yang bukan di angkatan itu diabaikan', (await ins1.rpc('saveAttendance', live.id, { 'tidak-ada': 'hadir' })).ok === true)

console.log('Admin Pendaftaran tidak menimpa jadwal')
const hkBefore = (await adm.state()).batches.find((b) => b.id === hk1.id)
await adm.rpc('saveBatch', { ...hkBefore, instructorId: '', location: 'DITIMPA', scheduleDays: '' })
const hkAfter = (await adm.state()).batches.find((b) => b.id === hk1.id)
check('simpan angkatan oleh pendaftaran tidak mengubah jadwal/instruktur/lokasi', hkAfter.location === 'Ruang A' && hkAfter.instructorId === hkBefore.instructorId && hkAfter.startTime === '09:00')
check('pilihan mapel angkatan tidak berubah', (await adm.state()).batchSubjects.filter((x) => x.batchId === hk1.id).length === 3)

console.log('Peserta')
const p1 = new Client(); await p1.login('peserta@cih.demo')
const ps = await p1.state()
const foMat = ps.materials.find((m) => m.title === 'Rekaman praktik penanganan keluhan')
check('peserta aktif melihat materi dengan sessionId', !!foMat?.sessionId)
check('sesi peserta membawa mata pelajarannya', ps.sessions.length > 0 && ps.sessions.every((x) => x.subjectId && ps.subjects.some((y) => y.id === x.subjectId)))
check('peserta tidak melihat materi angkatan lain', !ps.materials.some((m) => m.batchId === hk1.id))
check('peserta tidak menerima pilihan mapel angkatan', ps.batchSubjects.length === 0)

console.log(`\n${pass} lulus, ${failed} gagal`)
process.exit(failed ? 1 : 0)
