// Uji impor bank mata pelajaran: pembaca format spreadsheet, pembacaan Google Sheets, dan aksi importSubjects.
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
}
const { parseSubjects, parseTable, titleScore } = await import('../../src/lib/subjectImport.ts')

const akad = new Client(); await akad.login('akademik@cih.demo')
const uang = new Client(); await uang.login('keuangan@cih.demo')
const ins = new Client(); await ins.login('instruktur@cih.demo')
const SHEET = 'https://docs.google.com/spreadsheets/d/1OOJpm9-f-5d7RV_yhrMUjz3-bbHOivM94KOoYTCTxaw/edit?gid=826481570#gid=826481570'

console.log('Pembaca format')
const sample = [
  ',ROOM DIVISION,,,,,,,', ',No,Kode,Mata Kuliah,Keterangan,Keterangan,Jam/Pertemuan,Jumlah Pertemuan,Jumlah Jam Per Program',
  ',1,PTG,Pengetahuan Tata Graha,,Teori & Peraktik,4,12,48', ',2,BAJ,Bahasa Jepang,Kelas Gabungan,Teori,2,16,32', ',,,,Jam Per Minggu,,30,,384', ',,,,,,,,',
  ',FOOD & BEVERAGE,,,,,,,', ',No,Kode,Mata Kuliah,,Keterangan,Jam/Pertemuan,Jumlah Pertemuan,Jumlah Jam Per Program', ',1,PEB,"Pengetahuan Bar, dasar",Kelas Gabungan,Teori & Praktik,4,12,48',
].join('\n')
const ps = parseSubjects(sample)
check('dua bagian terbaca dengan judulnya', ps.length === 2 && ps[0].title === 'ROOM DIVISION' && ps[1].title === 'FOOD & BEVERAGE')
check('baris ringkasan "Jam Per Minggu" dilewati', ps[0].rows.length === 2)
check('jenis "Teori & Peraktik" menjadi teori_praktik', ps[0].rows[0].kind === 'teori_praktik')
check('jenis "Teori" menjadi teori, keterangan "Kelas Gabungan" terbawa', ps[0].rows[1].kind === 'teori' && ps[0].rows[1].description === 'Kelas Gabungan')
check('jam, pertemuan, dan total terbaca', ps[0].rows[0].hoursPerMeeting === 4 && ps[0].rows[0].meetings === 12 && ps[0].rows[0].hours === 48)
check('kolom keterangan tanpa judul tetap terbaca', ps[1].rows[0].description === 'Kelas Gabungan' && ps[1].rows[0].kind === 'teori_praktik')
check('sel bertanda kutip berisi koma terbaca utuh', ps[1].rows[0].name === 'Pengetahuan Bar, dasar')
check('hasil tempel dari spreadsheet (tab dan BOM) terbaca', parseSubjects('' + String.fromCharCode(0xfeff) + '' + sample.split('\n').map((l) => parseTable(l)[0].join('\t')).join('\r\n')).map((s) => s.rows.length).join() === '2,1')
const bad = parseSubjects(',X,,,,,,\n,No,Kode,Mata Kuliah,Keterangan,Jam/Pertemuan,Jumlah Pertemuan,Jumlah Jam\n,1,A,Tanpa jenis,,2,2,4\n,2,B,Jam nol,Teori,0,0,0\n,3,C,Tanpa total,Praktik,3,4,')
check('jenis tidak terbaca ditandai bermasalah', bad[0].rows[0].problems.length === 1)
check('jam 0 ditandai bermasalah', bad[0].rows[1].problems.some((p) => /jam/i.test(p)))
check('total kosong dihitung dari jam x pertemuan', bad[0].rows[2].hours === 12 && bad[0].rows[2].problems.length === 0)
check('format tanpa judul kolom dikenali tidak dibaca', parseSubjects('a,b,c\n1,2,3').length === 0)
check('kecocokan nama bagian dan pelatihan', titleScore('FOOD & BEVERAGE', 'Food And Beverange') > 0.85 && titleScore('ROOM DIVISION', 'Room Division') === 1 && titleScore('ROOM DIVISION', 'Food And Beverange') < 0.5)

console.log('Pembacaan Google Sheets')
check('tautan selain Google ditolak', (await akad.json('/api/subjects/sheet', { url: 'https://example.com/spreadsheets/d/' + 'a'.repeat(30) })).ok !== true)
check('tautan http ditolak', (await akad.json('/api/subjects/sheet', { url: 'http://docs.google.com/spreadsheets/d/' + 'a'.repeat(30) })).ok !== true)
check('tautan ke host lain yang menyamar ditolak', (await akad.json('/api/subjects/sheet', { url: 'https://docs.google.com.evil.test/spreadsheets/d/' + 'a'.repeat(30) })).ok !== true)
check('Keuangan tidak bisa membaca spreadsheet', (await uang.json('/api/subjects/sheet', { url: SHEET })).status === 403)
check('tanpa login ditolak', (await new Client().json('/api/subjects/sheet', { url: SHEET })).status === 401)
check('spreadsheet yang tidak ada ditolak dengan pesan jelas', /dibagikan|dibaca|dijangkau/i.test((await akad.json('/api/subjects/sheet', { url: 'https://docs.google.com/spreadsheets/d/' + 'Z'.repeat(44) })).error ?? ''))
const live = await akad.json('/api/subjects/sheet', { url: SHEET })
let sections = []
if (live.ok) {
  sections = parseSubjects(live.data)
  check('spreadsheet kurikulum terbaca: 2 bagian, masing-masing 8 mata pelajaran, 384 jam', sections.length === 2 && sections.every((s) => s.rows.length === 8 && s.rows.reduce((t, r) => t + r.hours, 0) === 384 && s.rows.every((r) => !r.problems.length)))
} else { console.log('  lewati  spreadsheet tidak terjangkau dari mesin ini:', live.error); sections = ps }

console.log('Impor ke database')
const st0 = await akad.state()
const programs = st0.programs.filter((p) => !p.archived)
const map = sections.map((sec) => programs.map((p) => ({ id: p.id, sc: titleScore(sec.title, p.title) })).sort((a, b) => b.sc - a.sc)[0].id)
const isShared = (r) => /gabungan/i.test(r.description)
const curOf = (pid) => st0.curricula.filter((c) => c.programId === pid && c.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? ''
const sharedRows = new Map()
const own = sections.flatMap((sec, i) => sec.rows.filter((r) => { if (!isShared(r)) return true; if (!sharedRows.has(r.name.toLowerCase())) sharedRows.set(r.name.toLowerCase(), r); return false }).map((r) => ({ programId: map[i], curriculumId: curOf(map[i]), code: r.code, name: r.name, kind: r.kind, hours: r.hours, hoursPerMeeting: r.hoursPerMeeting, meetings: r.meetings, description: r.description })))
const shared = [...sharedRows.values()].map((r) => ({ shared: true, programId: '', code: r.code, name: r.name, kind: r.kind, hours: r.hours, hoursPerMeeting: r.hoursPerMeeting, meetings: r.meetings, description: r.description }))
const items = [...own, ...shared]
check('kelas gabungan dikumpulkan sekali per nama (3 dari 6 baris)', !live.ok || (shared.length === 3 && own.length === 10), `${shared.length} gabungan, ${own.length} khusus`)
const before = st0.subjects.length
check('Keuangan tidak bisa mengimpor', (await uang.rpc('importSubjects', items, true)).status === 403)
check('Instruktur tidak bisa mengimpor', (await ins.rpc('importSubjects', items, true)).status === 403)
check('daftar kosong ditolak', (await akad.rpc('importSubjects', [], true)).ok !== true)
check('lebih dari 300 baris ditolak', (await akad.rpc('importSubjects', Array.from({ length: 301 }, (_, i) => ({ ...items[0], name: 'X' + i })), true)).ok !== true)
const broken = [...items.slice(0, 3), { ...items[0], name: 'Mapel rusak', hours: 0 }]
check('satu baris tidak valid membatalkan seluruh impor', (await akad.rpc('importSubjects', broken, true)).ok !== true && (await akad.state()).subjects.length === before)
check('pelatihan yang tidak ada ditolak', (await akad.rpc('importSubjects', [{ ...items[0], programId: crypto.randomUUID() }], true)).ok !== true)
check('jenis tidak dikenal ditolak', (await akad.rpc('importSubjects', [{ ...items[0], kind: 'lain' }], true)).ok !== true)
check('jam per pertemuan di luar batas ditolak', (await akad.rpc('importSubjects', [{ ...items[0], hoursPerMeeting: 99 }], true)).ok !== true)
const r1 = await akad.rpc('importSubjects', items, true)
check(`impor pertama: ${items.length} mata pelajaran diproses`, r1.ok === true && r1.data.added + r1.data.updated === items.length, JSON.stringify(r1))
const st1 = await akad.state()
const first = st1.subjects.find((x) => x.programId === items[0].programId && x.name === items[0].name)
const sharedIn = (st) => st.subjects.filter((x) => x.programId === '')
check('kode, jenis, jam per pertemuan, pertemuan, dan total tersimpan', first && first.code === items[0].code && first.kind === items[0].kind && first.hoursPerMeeting === items[0].hoursPerMeeting && first.meetings === items[0].meetings && first.hours === items[0].hours, JSON.stringify(first))
check('kelas gabungan tersimpan satu kali tanpa pelatihan', sharedIn(st1).length === shared.length && sharedIn(st1).every((x) => /gabungan/i.test(x.description)))
check('tidak ada salinan kelas gabungan per pelatihan', !st1.subjects.some((x) => x.programId !== '' && /gabungan/i.test(x.description)))
const r2 = await akad.rpc('importSubjects', items, false)
check('impor ulang tanpa perbarui: semua dilewati', r2.ok === true && r2.data.added === 0 && r2.data.skipped === items.length, JSON.stringify(r2))
const edited = items.map((x, i) => (i === 0 ? { ...x, hours: x.hours + 8, code: 'ZZ' } : x))
const r3 = await akad.rpc('importSubjects', edited, true)
check('impor ulang dengan perbarui: tidak ada yang ganda, yang berubah diperbarui', r3.ok === true && r3.data.added === 0 && r3.data.updated === items.length, JSON.stringify(r3))
const st3 = await akad.state()
check('jumlah mata pelajaran tidak bertambah dua kali', st3.subjects.length === st1.subjects.length)
check('kelas gabungan tidak ganda setelah impor ulang', sharedIn(st3).length === shared.length)
const upd = st3.subjects.find((x) => x.programId === items[0].programId && x.name === items[0].name)
check('nilai yang diubah ikut diperbarui', upd.hours === items[0].hours + 8 && upd.code === 'ZZ')
const lower = await akad.rpc('importSubjects', [{ ...items[0], name: items[0].name.toUpperCase() }], false)
check('nama sama beda huruf dianggap sudah ada', lower.data.skipped === 1 && (await akad.state()).subjects.length === st1.subjects.length)

console.log('Kelas gabungan dipakai semua pelatihan')
const pub = await new Client().state()
check('halaman publik menerima kelas gabungan', shared.length === 0 || pub.subjects.some((x) => x.programId === ''))
const batches = st3.batches.filter((b) => st3.programs.some((p) => p.id === b.programId))
const bA = batches.find((b) => b.programId === map[0]), bB = batches.find((b) => b.programId === map[1] && b.programId !== map[0])
const insId = st3.users.find((u) => u.role === 'instruktur').id
const sched = (b, subs) => ({ batchId: b.id, instructorId: insId, days: ['Sen', 'Rab'], startTime: '09:00', endTime: '11:00', location: 'Ruang A', subjects: subs.map((x) => ({ subjectId: x.id, sessions: x.meetings ?? 2 })) })
if (shared.length && bA && bB) {
  const g = sharedIn(st3)[0]
  const ownA = st3.subjects.find((x) => x.programId === bA.programId)
  const ownB = st3.subjects.find((x) => x.programId === bB.programId)
  check('angkatan pelatihan pertama bisa memakai kelas gabungan', (await akad.rpc('saveBatchSchedule', sched(bA, [g, ownA]))).ok === true)
  check('angkatan pelatihan kedua memakai kelas gabungan yang sama', (await akad.rpc('saveBatchSchedule', sched(bB, [g, ownB]))).ok === true)
  const bs = (await akad.state()).batchSubjects
  check('kedua angkatan menunjuk satu mata pelajaran yang sama', bs.filter((x) => x.subjectId === g.id).map((x) => x.batchId).sort().join() === [bA.id, bB.id].sort().join())
  check('mata pelajaran khusus pelatihan lain tetap ditolak', (await akad.rpc('saveBatchSchedule', sched(bA, [ownB]))).ok !== true)
  check('kelas gabungan nonaktif tidak bisa dipilih', (await akad.rpc('saveSubject', { ...g, active: false })).ok === true && (await akad.rpc('saveBatchSchedule', sched(bA, [g]))).ok !== true)
  await akad.rpc('saveSubject', { ...g, active: true })
  check('kelas gabungan yang sudah dipakai jadwal tidak bisa dihapus', (await akad.rpc('deleteSubject', g.id)).ok !== true)
}

console.log('Simpan satu per satu')
const one = { id: crypto.randomUUID(), programId: items[0].programId, code: 'tes', name: 'Mapel uji jenis campuran ' + Date.now(), kind: 'teori_praktik', hours: 10, hoursPerMeeting: 2, meetings: 5, description: '', active: true }
check('simpan mata pelajaran teori dan praktik', (await akad.rpc('saveSubject', one)).ok === true)
check('kode lebih dari 12 karakter dipotong, tidak ditolak', (await akad.rpc('saveSubject', { ...one, id: crypto.randomUUID(), name: one.name + '2', code: 'x'.repeat(13) })).ok === true) // dipotong, bukan ditolak
const gnew = { id: crypto.randomUUID(), programId: '', code: 'GBG', name: 'Gabungan uji ' + Date.now(), kind: 'teori', hours: 6, hoursPerMeeting: 2, meetings: 3, description: 'Kelas Gabungan', active: true }
check('simpan kelas gabungan baru (tanpa pelatihan)', (await akad.rpc('saveSubject', gnew)).ok === true && (await akad.state()).subjects.some((x) => x.id === gnew.id && x.programId === ''))
check('nama kelas gabungan ganda ditolak (beda huruf)', (await akad.rpc('saveSubject', { ...gnew, id: crypto.randomUUID(), name: gnew.name.toUpperCase() })).ok !== true)
check('kelas gabungan tidak bisa dipindah ke satu pelatihan', (await akad.rpc('saveSubject', { ...gnew, programId: items[0].programId })).ok !== true)
check('nama sama dengan mapel khusus pelatihan tetap boleh', (await akad.rpc('saveSubject', { ...one, id: crypto.randomUUID(), name: gnew.name })).ok === true)
check('jenis tidak valid ditolak', (await akad.rpc('saveSubject', { ...one, id: crypto.randomUUID(), name: one.name + '3', kind: 'lain' })).ok !== true)
check('jumlah pertemuan 0 ditolak', (await akad.rpc('saveSubject', { ...one, id: crypto.randomUUID(), name: one.name + '4', meetings: 0 })).ok !== true)

console.log(`\n${pass} lulus, ${failed} gagal`)
process.exit(failed ? 1 : 0)
