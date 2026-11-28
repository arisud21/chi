import fs from 'node:fs'
import path from 'node:path'
import { UPLOAD_DIR, ageOn, audit, cq, fail, q, saveUpload, tx, uid } from './lib.js'

/*
 * Data diri instruktur: identitas, kontak, pas foto, CV, dan sertifikat pendukung (boleh lebih dari satu).
 * Nama dan email disimpan di tabel users (nama terisi dari admin, boleh dikoreksi instruktur). Sisanya di staff_profiles.
 * Super Admin melihat semuanya di menu Akun pengelola.
 */

export const STAFF_PROFILE_ROLES = ['instruktur']
export const GENDERS = ['L', 'P']
export const MARITAL = ['belum_kawin', 'kawin', 'cerai_hidup', 'cerai_mati']
export const RELIGIONS = ['Islam', 'Kristen Protestan', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']
export const MAX_CERTS = 20

/** Jenis berkas yang diunggah instruktur: format yang diterima dan jenis file di tabel files. */
export const STAFF_FILES = {
  photo: { kind: 'staff_photo', allowed: ['image/jpeg', 'image/png', 'image/webp'], label: 'Pas foto' },
  cv: { kind: 'staff_cv', allowed: ['application/pdf', 'image/jpeg', 'image/png'], label: 'CV' },
  cert: { kind: 'staff_cert', allowed: ['application/pdf', 'image/jpeg', 'image/png'], label: 'Sertifikat' },
}

const text = (v, max, label, req = true) => {
  const s = String(v ?? '').trim()
  if (req && !s) fail(`${label} wajib diisi.`)
  if (s.length > max) fail(`${label} maksimal ${max} karakter.`)
  return s
}
const phoneOk = (v) => { const t = String(v ?? '').replace(/[\s-]/g, ''); if (!/^(\+62|62|0)\d{8,13}$/.test(t)) fail('Nomor HP tidak valid. Contoh: 081234567890.'); return t }
const removeStored = (names) => { for (const n of names) fs.promises.unlink(path.join(UPLOAD_DIR, n)).catch(() => {}) }

export const staffProfileActions = {
  /** Instruktur menyimpan data dirinya. */
  saveStaffProfile: {
    roles: STAFF_PROFILE_ROLES,
    fn: (ctx, x = {}) => tx(async (c) => {
      const me = ctx.user.id
      const name = text(x.name, 120, 'Nama lengkap dan gelar')
      const nik = String(x.nik ?? '').trim()
      if (!/^\d{16}$/.test(nik)) fail('NIK harus 16 digit angka sesuai KTP.')
      const birthPlace = text(x.birthPlace, 80, 'Tempat lahir')
      const birthDate = String(x.birthDate ?? '')
      const age = ageOn(birthDate)
      if (age === null || age < 17 || age > 90) fail('Tanggal lahir tidak valid (usia 17 sampai 90 tahun).')
      if (!GENDERS.includes(x.gender)) fail('Pilih jenis kelamin.')
      if (!MARITAL.includes(x.marital)) fail('Pilih status perkawinan.')
      if (!RELIGIONS.includes(x.religion)) fail('Pilih agama.')
      const address = text(x.address, 500, 'Alamat')
      const phone = phoneOk(x.phone)
      const email = text(x.email, 160, 'Alamat e-mail').toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Alamat e-mail tidak valid.')
      const [dupMail] = await cq(c, 'SELECT id FROM users WHERE email = ? AND id <> ?', [email, me])
      if (dupMail) fail('Alamat e-mail sudah dipakai akun lain.')
      const [dupNik] = await cq(c, 'SELECT id FROM users WHERE nik = ? AND id <> ? UNION SELECT user_id FROM participant_profiles WHERE nik = ? AND user_id <> ?', [nik, me, nik, me])
      if (dupNik) fail('NIK sudah dipakai akun lain.')
      await cq(c, 'UPDATE users SET name = ?, nik = ?, birth_date = ?, phone = ?, email = ? WHERE id = ?', [name, nik, birthDate, phone, email, me])
      await cq(c, `INSERT INTO staff_profiles (user_id, birth_place, gender, marital, religion, address) VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE birth_place = VALUES(birth_place), gender = VALUES(gender), marital = VALUES(marital), religion = VALUES(religion), address = VALUES(address)`,
      [me, birthPlace, x.gender, x.marital, x.religion, address])
      await audit(c, me, 'datadiri.staf-simpan', 'staff_profiles', email)
    }),
  },
  /** Instruktur menghapus salah satu sertifikat pendukungnya. */
  deleteStaffCert: {
    roles: STAFF_PROFILE_ROLES,
    fn: async (ctx, id) => {
      let stored = null
      await tx(async (c) => {
        const [x] = await cq(c, 'SELECT id, file_id, label FROM staff_certificates WHERE id = ? AND user_id = ? FOR UPDATE', [String(id ?? ''), ctx.user.id])
        if (!x) fail('Sertifikat tidak ditemukan.', 404)
        const [f] = await cq(c, 'SELECT stored_name FROM files WHERE id = ?', [x.file_id])
        stored = f?.stored_name ?? null
        await cq(c, 'DELETE FROM staff_certificates WHERE id = ?', [x.id])
        await cq(c, 'DELETE FROM files WHERE id = ?', [x.file_id])
        await audit(c, ctx.user.id, 'datadiri.sertifikat-hapus', 'staff_certificates', x.label)
      })
      if (stored) removeStored([stored])
    },
  },
}

/**
 * Unggah pas foto atau CV (mengganti yang lama), atau tambah satu sertifikat.
 * Dipanggil dari rute unggah di index.js setelah memeriksa role.
 */
export async function saveStaffFile(user, which, file, label) {
  const spec = STAFF_FILES[which]
  if (!spec) fail('Jenis berkas tidak dikenal.', 404)
  if (which === 'cert') {
    const name = text(label, 160, 'Nama sertifikat')
    const [{ n }] = await q('SELECT COUNT(*) n FROM staff_certificates WHERE user_id = ?', [user.id])
    if (Number(n) >= MAX_CERTS) fail(`Maksimal ${MAX_CERTS} sertifikat. Hapus yang tidak diperlukan dulu.`)
    const fileId = await saveUpload(file, { kind: spec.kind, ownerId: user.id, allowed: spec.allowed })
    await q('INSERT INTO staff_certificates (id, user_id, file_id, label) VALUES (?,?,?,?)', [uid(), user.id, fileId, name])
    await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [user.id, 'datadiri.sertifikat-unggah', 'staff_certificates', name])
    return
  }
  const col = which === 'photo' ? 'photo_file_id' : 'cv_file_id'
  const fileId = await saveUpload(file, { kind: spec.kind, ownerId: user.id, allowed: spec.allowed })
  let old = null
  await tx(async (c) => {
    const [p] = await cq(c, `SELECT ${col} fid FROM staff_profiles WHERE user_id = ? FOR UPDATE`, [user.id])
    if (p) await cq(c, `UPDATE staff_profiles SET ${col} = ? WHERE user_id = ?`, [fileId, user.id])
    else await cq(c, `INSERT INTO staff_profiles (user_id, ${col}) VALUES (?, ?)`, [user.id, fileId])
    if (p?.fid) {
      const [f] = await cq(c, 'SELECT stored_name FROM files WHERE id = ?', [p.fid])
      old = f?.stored_name ?? null
      await cq(c, 'DELETE FROM files WHERE id = ?', [p.fid])
    }
    await audit(c, user.id, `datadiri.${which}-unggah`, 'staff_profiles', spec.label)
  })
  if (old) removeStored([old])
}

const mapStaffProfile = (p) => ({
  userId: p.user_id, birthPlace: p.birth_place ?? '', gender: p.gender ?? '', marital: p.marital ?? '', religion: p.religion ?? '', address: p.address ?? '',
  photoFileId: p.photo_file_id ?? '', cvFileId: p.cv_file_id ?? '', updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : '',
})
const mapStaffCert = (x) => ({ id: x.id, userId: x.user_id, fileId: x.file_id, label: x.label, createdAt: x.created_at ? new Date(x.created_at).toISOString() : '' })

/** Data diri staf untuk state: Super Admin melihat semua, instruktur hanya miliknya. */
export async function staffProfileState(role, me) {
  if (role === 'super_admin') {
    return {
      staffProfiles: (await q('SELECT * FROM staff_profiles')).map(mapStaffProfile),
      staffCerts: (await q('SELECT * FROM staff_certificates ORDER BY created_at')).map(mapStaffCert),
    }
  }
  if (STAFF_PROFILE_ROLES.includes(role)) {
    return {
      staffProfiles: (await q('SELECT * FROM staff_profiles WHERE user_id = ?', [me])).map(mapStaffProfile),
      staffCerts: (await q('SELECT * FROM staff_certificates WHERE user_id = ? ORDER BY created_at', [me])).map(mapStaffCert),
    }
  }
  return { staffProfiles: [], staffCerts: [] }
}
