// Uji: data diri instruktur (identitas, pas foto, CV, sertifikat) dan tampilannya untuk Super Admin.
// Nama asli akun uji dikembalikan di akhir dan sertifikat uji dihapus; isian lain (NIK, foto, CV) tetap tersimpan di akun demo.
const BASE = process.env.API || 'http://localhost:4000'
let pass = 0, failed = 0
const check = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ', name) } else { failed++; console.log('  GAGAL', name, extra) } }
class Client {
  cookie = ''
  async req(path, init = {}) { const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), cookie: this.cookie } }); const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]; return r }
  async json(path, body) { const r = await this.req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json().catch(() => ({}))) } }
  login(email, password = 'demo12345') { return this.json('/api/auth/login', { email, password }) }
  rpc(name, ...args) { return this.json(`/api/rpc/${name}`, { args }) }
  async state() { return (await this.req('/api/state')).json() }
  async form(path, fields, file) {
    const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v)
    if (file) f.set('file', new Blob([file.bytes], { type: file.type }), file.name)
    const r = await this.req(path, { method: 'POST', body: f }); return { status: r.status, ...(await r.json().catch(() => ({}))) }
  }
}
const PNG = { bytes: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]), type: 'image/png', name: 'foto.png' }
const PDF = { bytes: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 32)]), type: 'application/pdf', name: 'dok.pdf' }
const FAKE = { bytes: Buffer.from('bukan gambar sama sekali, hanya teks biasa'), type: 'image/png', name: 'palsu.png' }

const ins = new Client(); await ins.login('instruktur2@cih.demo')
const sa = new Client(); await sa.login('super@cih.demo')
const uang = new Client(); await uang.login('keuangan@cih.demo')
const st0 = await ins.state()
const me0 = st0.users.find((u) => u.id === st0.sessionUserId)
check('login instruktur uji', !!me0 && me0.role === 'instruktur', JSON.stringify(me0))

const base = {
  name: me0.name + ', S.Par.', nik: '3217' + String(Date.now()).slice(-12), birthPlace: 'Cimahi', birthDate: '1988-05-17', gender: 'L', marital: 'kawin',
  religion: 'Islam', address: 'Jl. Uji No. 1, Cimahi', phone: '081234567890', email: me0.email,
}

console.log('Isian data diri')
check('peserta/keuangan tidak bisa memakai aksi data diri instruktur', (await uang.rpc('saveStaffProfile', base)).status === 403)
check('NIK bukan 16 digit ditolak', (await ins.rpc('saveStaffProfile', { ...base, nik: '123' })).ok !== true)
check('agama di luar pilihan ditolak', (await ins.rpc('saveStaffProfile', { ...base, religion: 'Lain' })).ok !== true)
check('status perkawinan di luar pilihan ditolak', (await ins.rpc('saveStaffProfile', { ...base, marital: 'x' })).ok !== true)
check('HP tidak valid ditolak', (await ins.rpc('saveStaffProfile', { ...base, phone: '12' })).ok !== true)
check('e-mail milik akun lain ditolak', (await ins.rpc('saveStaffProfile', { ...base, email: 'super@cih.demo' })).ok !== true)
check('tanggal lahir tidak valid ditolak', (await ins.rpc('saveStaffProfile', { ...base, birthDate: '2020-01-01' })).ok !== true)
const saved = await ins.rpc('saveStaffProfile', base)
check('data diri lengkap tersimpan', saved.ok === true, JSON.stringify(saved))
let st = await ins.state()
const me1 = st.users.find((u) => u.id === me0.id)
const p1 = st.staffProfiles.find((p) => p.userId === me0.id)
check('nama dan gelar yang dikoreksi tersimpan di akun', me1.name === base.name && me1.nik === base.nik && me1.birthDate === base.birthDate)
check('profil tersimpan', p1?.birthPlace === 'Cimahi' && p1.gender === 'L' && p1.marital === 'kawin' && p1.religion === 'Islam')

console.log('Unggah berkas')
check('berkas palsu ditolak', (await ins.form('/api/upload/staff/photo', {}, FAKE)).ok !== true)
check('pas foto PDF ditolak', (await ins.form('/api/upload/staff/photo', {}, PDF)).ok !== true)
check('jenis unggahan tidak dikenal ditolak', (await ins.form('/api/upload/staff/ktp', {}, PNG)).ok !== true)
check('pas foto tersimpan', (await ins.form('/api/upload/staff/photo', {}, PNG)).ok === true)
const photo1 = (await ins.state()).staffProfiles.find((p) => p.userId === me0.id)?.photoFileId
check('pas foto diganti, yang lama dihapus', (await ins.form('/api/upload/staff/photo', {}, PNG)).ok === true && (await sa.req(`/api/files/${photo1}`)).status === 404)
check('CV tersimpan', (await ins.form('/api/upload/staff/cv', {}, PDF)).ok === true)
check('sertifikat tanpa nama ditolak', (await ins.form('/api/upload/staff/cert', {}, PDF)).ok !== true)
check('sertifikat pertama', (await ins.form('/api/upload/staff/cert', { label: 'Uji sertifikat A' }, PDF)).ok === true)
check('sertifikat kedua (boleh lebih dari satu)', (await ins.form('/api/upload/staff/cert', { label: 'Uji sertifikat B' }, PNG)).ok === true)
st = await ins.state()
const p2 = st.staffProfiles.find((p) => p.userId === me0.id)
const mine = st.staffCerts.filter((c) => c.userId === me0.id && c.label.startsWith('Uji sertifikat'))
check('dua sertifikat tercatat', mine.length === 2)
check('pemilik bisa membuka foto, CV, dan sertifikat', (await ins.req(`/api/files/${p2.photoFileId}`)).status === 200 && (await ins.req(`/api/files/${p2.cvFileId}`)).status === 200 && (await ins.req(`/api/files/${mine[0].fileId}`)).status === 200)

console.log('Super Admin di menu Akun pengelola')
const sst = await sa.state()
check('Super Admin menerima data diri dan sertifikat instruktur', sst.staffProfiles.some((p) => p.userId === me0.id && p.cvFileId) && sst.staffCerts.filter((c) => c.userId === me0.id && c.label.startsWith('Uji sertifikat')).length === 2)
check('Super Admin bisa membuka CV dan sertifikat', (await sa.req(`/api/files/${p2.cvFileId}`)).status === 200 && (await sa.req(`/api/files/${mine[1].fileId}`)).status === 200)
check('Keuangan tidak bisa membuka CV', (await uang.req(`/api/files/${p2.cvFileId}`)).status === 404)
check('Keuangan tidak menerima data diri instruktur', ((await uang.state()).staffProfiles ?? []).length === 0)
const other = new Client(); await other.login('instruktur@cih.demo')
check('instruktur lain tidak bisa membuka CV', (await other.req(`/api/files/${p2.cvFileId}`)).status === 404)
check('instruktur lain tidak bisa menghapus sertifikat', (await other.rpc('deleteStaffCert', mine[0].id)).ok !== true)

console.log('Hapus sertifikat dan kembalikan akun uji')
for (const c of mine) check(`hapus ${c.label}`, (await ins.rpc('deleteStaffCert', c.id)).ok === true)
check('berkas sertifikat terhapus', (await sa.req(`/api/files/${mine[0].fileId}`)).status === 404)
// Nama asli dikembalikan; NIK, tanggal lahir, dan HP uji tetap tersimpan di akun demo ini.
check('nama asli dikembalikan', (await ins.rpc('saveStaffProfile', { ...base, name: me0.name })).ok === true)

console.log(`\n${pass} lulus, ${failed} gagal`)
process.exit(failed ? 1 : 0)
