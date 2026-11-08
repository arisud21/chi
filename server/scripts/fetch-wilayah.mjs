// Membangun server/data/wilayah.json (provinsi, kota/kabupaten, kecamatan) dari dataset terbuka
// https://github.com/emsifa/api-wilayah-indonesia (turunan data Kemendagri). Dijalankan sekali; hasilnya disimpan di repo,
// jadi aplikasi tidak bergantung pada layanan itu saat berjalan. Jalankan: node scripts/fetch-wilayah.mjs
import fs from 'node:fs/promises'

const BASES = ['https://www.emsifa.com/api-wilayah-indonesia/api', 'https://emsifa.github.io/api-wilayah-indonesia/api']
const KEEP_UPPER = new Set(['DKI', 'DI', 'NTB', 'NTT'])

const title = (s) => String(s).toLowerCase().split(/(\s+|-)/).map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join('')

async function get(path) {
  let last
  for (const base of BASES) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`${base}/${path}`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
        if (r.ok) return await r.json()
        last = new Error(`${path}: HTTP ${r.status}`)
      } catch (e) { last = e }
    }
  }
  throw last
}

async function pool(items, size, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]) } }))
  return out
}

const rows = (data, idRe, what) => {
  if (!Array.isArray(data) || !data.length) throw new Error(`${what}: bukan daftar`)
  return data.map((r) => {
    if (!r || !idRe.test(String(r.id)) || typeof r.name !== 'string' || !r.name.trim()) throw new Error(`${what}: baris tidak valid ${JSON.stringify(r)}`)
    return [String(r.id), title(r.name.trim())]
  })
}

const provinces = rows(await get('provinces.json'), /^\d{2}$/, 'provinsi')
console.log('provinsi', provinces.length)
const regencies = {}, districts = {}
const regLists = await pool(provinces, 6, ([id]) => get(`regencies/${id}.json`).then((d) => rows(d, /^\d{4}$/, `kota ${id}`)))
provinces.forEach(([id], i) => { regencies[id] = regLists[i] })
const allRegs = Object.values(regencies).flat()
console.log('kota/kabupaten', allRegs.length)
const disLists = await pool(allRegs, 10, ([id]) => get(`districts/${id}.json`).then((d) => rows(d, /^\d{7}$/, `kecamatan ${id}`)))
allRegs.forEach(([id], i) => { districts[id] = disLists[i] })
const nDis = Object.values(districts).flat().length
console.log('kecamatan', nDis)

// Pemeriksaan kewajaran: hierarki konsisten dan data uji dikenal ada.
for (const [pid, list] of Object.entries(regencies)) for (const [id] of list) if (!id.startsWith(pid)) throw new Error(`hierarki rusak ${pid} > ${id}`)
for (const [rid, list] of Object.entries(districts)) for (const [id] of list) if (!id.startsWith(rid)) throw new Error(`hierarki rusak ${rid} > ${id}`)
if (provinces.length < 34 || allRegs.length < 500 || nDis < 7000) throw new Error('jumlah data terlalu sedikit, unduhan kemungkinan tidak lengkap')
if (!districts['3277']?.some(([, n]) => n === 'Cimahi Selatan')) throw new Error('data uji Cimahi Selatan tidak ditemukan')

await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true })
await fs.writeFile(new URL('../data/wilayah.json', import.meta.url), JSON.stringify({ provinces, regencies, districts }))
console.log('tersimpan: server/data/wilayah.json')
