import fs from 'node:fs'

// Dibangun oleh scripts/fetch-wilayah.mjs. Dimuat sekali ke memori (sekitar 200 KB).
const data = JSON.parse(fs.readFileSync(new URL('../data/wilayah.json', import.meta.url), 'utf8'))
const toObj = ([id, name]) => ({ id, name })

export const provinces = () => data.provinces.map(toObj)
export const regencies = (provinceId) => (data.regencies[provinceId] ?? []).map(toObj)
export const districts = (regencyId) => (data.districts[regencyId] ?? []).map(toObj)

/** Memvalidasi satu rantai wilayah dan mengembalikan nama resmi dari dataset (nama dari klien tidak dipercaya). */
export function resolveArea(provinceId, cityId, districtId) {
  const prov = data.provinces.find(([id]) => id === provinceId)
  const city = (data.regencies[provinceId] ?? []).find(([id]) => id === cityId)
  const dist = (data.districts[cityId] ?? []).find(([id]) => id === districtId)
  if (!prov) return { error: 'Pilih provinsi dari daftar.' }
  if (!city) return { error: 'Kota atau kabupaten tidak sesuai dengan provinsi yang dipilih.' }
  if (!dist) return { error: 'Kecamatan tidak sesuai dengan kota atau kabupaten yang dipilih.' }
  return { province: prov[1], city: city[1], district: dist[1] }
}
