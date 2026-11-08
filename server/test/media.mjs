import sharp from 'sharp'

const BASE = process.env.API || 'http://localhost:4000'
let cookie = ''
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'super@cih.demo', password: 'demo12345' }) })
cookie = login.headers.get('set-cookie').split(';')[0]

const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#12625e' } }).png().toBuffer()
const f = new FormData()
f.set('alt', 'Ruang simulasi front office')
f.set('file', new Blob([png], { type: 'image/png' }), 'ruang.png')
const up = await (await fetch(BASE + '/api/upload/media', { method: 'POST', headers: { cookie }, body: f })).json()
console.log('upload', up.ok, up.id ? 'id ok' : up.error)

const big = await fetch(`${BASE}/api/media/${up.id}`)
const small = await fetch(`${BASE}/api/media/${up.id}?w=sm`)
const bm = await sharp(Buffer.from(await big.arrayBuffer())).metadata()
const sm = await sharp(Buffer.from(await small.arrayBuffer())).metadata()
console.log('besar', big.status, big.headers.get('content-type'), bm.width + 'x' + bm.height)
console.log('kecil', small.status, sm.width + 'x' + sm.height)
const ok = up.ok && bm.format === 'webp' && bm.width === 1600 && sm.width === 480
console.log(ok ? 'media: lulus' : 'media: GAGAL')
process.exit(ok ? 0 : 1)
