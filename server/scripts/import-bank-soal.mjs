// Tambahkan bank soal "Seleksi masuk: Hospitality dan TPA" (100 soal) ke database yang sudah berjalan.
// Tidak mengubah atau menghapus bank soal lain. Bila bank dengan nama yang sama sudah ada, tidak melakukan apa-apa.
// Jalankan dari folder server: npm run bank-soal
import { BANK_NAME, HOSPITALITY, TPA, importBankSoal } from '../src/bankSoal.js'
import { pool } from '../src/lib.js'

try {
  const r = await importBankSoal()
  if (r.created) console.log(`Bank soal "${BANK_NAME}" dibuat: ${r.count} soal (${HOSPITALITY.length} hospitality, ${TPA.length} TPA).`)
  else console.log(`Bank soal "${BANK_NAME}" sudah ada, tidak ada yang ditambahkan.`)
} finally {
  await pool.end()
}
