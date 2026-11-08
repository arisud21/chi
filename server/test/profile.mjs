// Uji: pilih pelatihan saat registrasi, data diri wajib setelah bayar, kelas terkunci sebelum itu, pemisahan Pendaftar dan Peserta.
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
const profileFields = (over = {}) => ({
  fullName: 'Peserta Uji Data', nik: nik(), birthPlace: 'Cimahi', birthDate: '2001-05-20', gender: 'P', address: 'Jl. Uji No. 5', rt: '003', rw: '007', provinceId: '32', cityId: '3277', districtId: '3277010',
  postalCode: '40511', phone: '081234567890', education: 'SMA/SMK', occupation: 'Belum bekerja', emergencyName: 'Wali Uji', emergencyRelation: 'Orang tua', emergencyPhone: '081298765432', ...over,
})

const anon = new Client()
const pub = await anon.state()
const fo = pub.batches.find((b) => b.code === 'FO-2026-B3')

console.log('Registrasi dengan pilihan pelatihan')
const reg = (over = {}) => ({ name: 'Calon Uji', email: `uji${stamp}${Math.floor(Math.random() * 1000)}@example.com`, phone: '081200000000', password: 'rahasia123', batchId: fo.id, ...over })
check('daftar tanpa pilihan pelatihan ditolak', (await new Client().json('/api/auth/register', reg({ batchId: '' }))).ok !== true)
check('daftar ke angkatan yang tidak dibuka ditolak', (await new Client().json('/api/auth/register', reg({ batchId: pub.batches.find((b) => b.status === 'running').id }))).ok !== true)
const me = new Client(); const email = `uji${stamp}@example.com`
const created = await me.json('/api/auth/register', reg({ email }))
check('daftar dengan pilihan pelatihan berhasil', created.ok === true, JSON.stringify(created))
const st = await me.state()
check('tagihan terbit otomatis untuk angkatan pilihan', st.registrations.length === 1 && st.registrations[0].batchId === fo.id && st.registrations[0].status === 'pending_payment')
check('email duplikat ditolak', (await new Client().json('/api/auth/register', reg({ email }))).ok !== true)

console.log('Data diri dikunci sebelum pembayaran dikonfirmasi')
const early = await me.form('/api/upload/profile', profileFields(), { photo: img('f.png'), ktp: img('k.png') })
check('isi data diri sebelum bayar ditolak', early.status === 403, JSON.stringify(early))

console.log('Pembayaran dikonfirmasi, data diri belum diisi')
const regRow = st.registrations[0]
await me.form(`/api/upload/proof/${regRow.id}`, { payerName: 'Calon Uji', transferDate: '2026-11-08', amountPaid: regRow.priceSnapshot + regRow.uniqueCode }, { file: img('b.png') })
const uang = new Client(); await uang.login('keuangan@cih.demo')
const pay = (await uang.state()).payments.find((p) => p.registrationId === regRow.id && p.status === 'submitted')
check('keuangan menyetujui', (await uang.rpc('verifyPayment', pay.id)).ok === true)
const locked = await me.state()
check('registrasi aktif tapi belum profileDone', locked.registrations[0].status === 'active' && locked.users[0].profileDone === false)
check('jadwal, materi, tugas tidak dikirim ke peserta tanpa data diri', locked.sessions.length === 0 && locked.materials.length === 0 && locked.assignments.length === 0)

console.log('Admin: pendaftar vs peserta')
const adm = new Client(); await adm.login('pendaftaran@cih.demo')
let as = await adm.state()
const myUser = as.users.find((u) => u.email === email)
check('muncul sebagai pendaftar (profileDone=false)', myUser.profileDone === false)
check('belum ada di daftar peserta (profil lengkap)', !as.profiles.some((p) => p.userId === myUser.id && p.completed))
check('Admin Pendaftaran mengirim pengingat', (await adm.rpc('remindProfile', myUser.id)).ok === true)
check('Keuangan tidak bisa mengirim pengingat', (await uang.rpc('remindProfile', myUser.id)).status === 403)
check('Keuangan tidak menerima data profil', (await uang.state()).profiles.length === 0)

console.log('Data wilayah')
const provs = await (await anon.req('/api/wilayah/provinces')).json()
const jabar = provs.find((p) => p.name === 'Jawa Barat')
check('daftar provinsi memuat Jawa Barat (kode 32)', jabar?.id === '32' && provs.length >= 34)
const kotas = await (await anon.req('/api/wilayah/regencies/32')).json()
check('Kota Cimahi ada di Jawa Barat', kotas.some((k) => k.id === '3277' && k.name === 'Kota Cimahi'))
const kecs = await (await anon.req('/api/wilayah/districts/3277')).json()
check('kecamatan Kota Cimahi lengkap (3)', kecs.length === 3 && kecs.some((k) => k.name === 'Cimahi Selatan'))
check('kode wilayah tidak valid ditolak', (await anon.req('/api/wilayah/regencies/abc')).status === 400)
check('provinsi tak dikenal mengembalikan daftar kosong', (await (await anon.req('/api/wilayah/regencies/99')).json()).length === 0)

console.log('Validasi data diri')
const ok1 = { photo: img('f.png'), ktp: img('k.png') }
check('kecamatan dari kota lain ditolak', (await me.form('/api/upload/profile', profileFields({ districtId: '3273010' }), ok1)).ok !== true)
check('kota yang bukan bagian provinsi ditolak', (await me.form('/api/upload/profile', profileFields({ cityId: '3171' }), ok1)).ok !== true)
check('kode wilayah ngawur ditolak', (await me.form('/api/upload/profile', profileFields({ districtId: '0000000' }), ok1)).ok !== true)
check('tanpa wilayah ditolak', (await me.form('/api/upload/profile', profileFields({ provinceId: '', cityId: '', districtId: '' }), ok1)).ok !== true)
check('RT bukan angka ditolak', (await me.form('/api/upload/profile', profileFields({ rt: 'ab' }), ok1)).ok !== true)
check('RW kosong ditolak', (await me.form('/api/upload/profile', profileFields({ rw: '' }), ok1)).ok !== true)
check('NIK bukan 16 digit ditolak', (await me.form('/api/upload/profile', profileFields({ nik: '123' }), ok1)).ok !== true)
check('tanggal lahir tidak masuk akal ditolak', (await me.form('/api/upload/profile', profileFields({ birthDate: '2024-01-01' }), ok1)).ok !== true)
check('nomor telepon salah ditolak', (await me.form('/api/upload/profile', profileFields({ phone: 'abc' }), ok1)).ok !== true)
check('kode pos salah ditolak', (await me.form('/api/upload/profile', profileFields({ postalCode: '12' }), ok1)).ok !== true)
check('pendidikan di luar daftar ditolak', (await me.form('/api/upload/profile', profileFields({ education: 'Hacker' }), ok1)).ok !== true)
check('tanpa pas foto ditolak', (await me.form('/api/upload/profile', profileFields(), { ktp: img('k.png') })).ok !== true)
check('tanpa KTP ditolak', (await me.form('/api/upload/profile', profileFields(), { photo: img('f.png') })).ok !== true)
check('berkas palsu ditolak', (await me.form('/api/upload/profile', profileFields(), { photo: { bytes: Buffer.from('bukan gambar sama sekali, hanya teks'), type: 'image/png', name: 'x.png' }, ktp: img('k.png') })).ok !== true)
check('state tetap belum lengkap setelah semua gagal', (await me.state()).users[0].profileDone === false)

console.log('Data diri lengkap')
const myNik = nik()
const good = await me.form('/api/upload/profile', profileFields({ nik: myNik, fullName: 'Nama Sesuai KTP' }), ok1)
check('data diri valid tersimpan', good.ok === true, JSON.stringify(good))
const after = await me.state()
check('profileDone true', after.users[0].profileDone === true)
check('nama wilayah diambil dari dataset, bukan dari klien', after.profiles[0].district === 'Cimahi Selatan' && after.profiles[0].city === 'Kota Cimahi' && after.profiles[0].province === 'Jawa Barat')
check('RT dan RW tersimpan', after.profiles[0].rt === '003' && after.profiles[0].rw === '007')
check('nama akun mengikuti nama KTP', after.users[0].name === 'Nama Sesuai KTP')
check('peserta melihat profilnya sendiri', after.profiles.length === 1 && after.profiles[0].nik === myNik)
const other = new Client(); await other.login('peserta@cih.demo')
check('NIK sama di akun lain ditolak', (await other.form('/api/upload/profile', profileFields({ nik: myNik }), ok1)).ok !== true)
const os = await other.state()
check('peserta tidak melihat profil orang lain', os.profiles.every((p) => p.userId === os.sessionUserId))
as = await adm.state()
check('kini masuk daftar peserta', as.profiles.some((p) => p.userId === myUser.id && p.completed))
check('pengingat ditolak untuk yang sudah lengkap', (await adm.rpc('remindProfile', myUser.id)).ok === false)
const photoId = after.profiles[0].photoFileId
check('pemilik bisa membuka foto', (await me.req(`/api/files/${photoId}`)).status === 200)
check('peserta lain tidak bisa membuka foto', (await other.req(`/api/files/${photoId}`)).status === 404)
check('Admin Pendaftaran bisa membuka KTP', (await adm.req(`/api/files/${after.profiles[0].ktpFileId}`)).status === 200)
check('Keuangan tidak bisa membuka KTP', (await uang.req(`/api/files/${after.profiles[0].ktpFileId}`)).status === 404)
const upd = await me.form('/api/upload/profile', profileFields({ nik: myNik, address: 'Alamat baru 9' }), {})
check('perbarui data tanpa unggah ulang berkas', upd.ok === true, JSON.stringify(upd))

console.log('Seed demo')
const seedBelum = new Client(); await seedBelum.login('datadiri@cih.demo')
const sb = await seedBelum.state()
check('akun demo "belum isi data" terkunci', sb.users[0].profileDone === false && sb.sessions.length === 0)
const seedSudah = new Client(); await seedSudah.login('peserta@cih.demo')
check('akun demo peserta aktif punya data lengkap dan jadwal', (await seedSudah.state()).sessions.length > 0)

console.log(`\n${pass} lulus, ${failed} gagal`)
process.exit(failed ? 1 : 0)
