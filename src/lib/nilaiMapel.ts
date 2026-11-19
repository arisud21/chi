import type { State } from './store'

/**
 * Nilai akhir per mata pelajaran (format "Template Nilai Akhir Mata Pelajaran - CHI"):
 * Absensi + Tugas + UTS (teori) + UAS (praktik), masing-masing dikali bobotnya.
 * Absensi terisi otomatis dari rekap kehadiran; tugas, teori, dan praktik diinput manual instruktur (skala 0-100).
 */
export const BOBOT_BAWAAN = { absensi: 10, tugas: 20, teori: 30, praktik: 40 }
export type BobotMapel = typeof BOBOT_BAWAAN
export const BOBOT_KEYS = ['absensi', 'tugas', 'teori', 'praktik'] as const
export const jumlahBobot = (w: BobotMapel) => BOBOT_KEYS.reduce((t, k) => t + (Number(w[k]) || 0), 0)

/**
 * Bobot berlaku: bobot yang diatur untuk mapel itu (instruktur atau Akademik) bila ada, selain itu bobot default dari Akademik.
 * Bobot default sama untuk semua jenis mapel: mapel teori tetap punya penilaian praktik (mis. Bahasa Inggris).
 */
export function bobotMapel(kind?: string, def: BobotMapel = BOBOT_BAWAAN, own?: BobotMapel | null): BobotMapel {
  if (own) return own
  void kind // bobot default sama untuk semua jenis mapel
  return def
}

/** Bobot berlaku untuk satu mata pelajaran di satu angkatan. */
export function bobotBerlaku(s: State, batchId: string, subjectId: string) {
  const bs = s.batchSubjects.find((x) => x.batchId === batchId && x.subjectId === subjectId)
  const kind = s.subjects.find((x) => x.id === subjectId)?.kind
  return { w: bobotMapel(kind, s.gradeWeights, bs?.weights), own: !!bs?.weights }
}

/**
 * Skala nilai huruf yang diatur Akademik: batas bawah A sampai D (E = di bawah batas D, mulai 0).
 * Bawaan mengikuti template: A 85, AB 80, B 75, BC 70, C 60, CD 50, D 40.
 */
export const HURUF = ['A', 'AB', 'B', 'BC', 'C', 'CD', 'D', 'E'] as const
export const BATAS_HURUF_BAWAAN = [85, 80, 75, 70, 60, 50, 40]
export interface BarisHuruf { huruf: string; min: number; label: string }
/** Batas harus turun ketat, antara 0 (di atas) dan 100. */
export const batasHurufSah = (b: number[]) => b.length === 7 && b.every((v, i) => Number.isFinite(v) && v > 0 && v <= 100 && (i === 0 || v < b[i - 1]))
/** Susun baris skala (huruf, batas bawah, keterangan rentang) dari tujuh batas bawah. */
export function skalaHuruf(batas: number[] = BATAS_HURUF_BAWAAN): BarisHuruf[] {
  const mins = [...batas, 0]
  return HURUF.map((huruf, i) => {
    const atas = i === 0 ? '100' : String(Math.round((mins[i - 1] - 0.1) * 10) / 10)
    return { huruf, min: mins[i], label: `= ${mins[i]} - ${atas}` }
  })
}
export const hurufOf = (n: number, batas: number[] = BATAS_HURUF_BAWAAN) => (skalaHuruf(batas).find((x) => n >= x.min) ?? { huruf: 'E' }).huruf

const r2 = (n: number) => Math.round(n * 100) / 100

export interface NilaiMapel {
  diabsen: number // pertemuan mata pelajaran yang sudah diabsen
  hadir: number
  absensiPct: number // 0-100
  tugas: number | null // nilai tugas (manual, 0-100); null = belum diisi
  teori: number | null
  praktik: number | null
  /** Nilai terbobot tiap komponen (kolom Absensi, Tugas, UTS, UAS di template). */
  poin: { absensi: number; tugas: number; teori: number; praktik: number }
  akhir: number
  huruf: string
}

/**
 * Rata-rata nilai tugas satu peserta di satu mata pelajaran. Tugas yang belum dikumpulkan dihitung 0;
 * tugas yang sudah dikumpulkan tetapi belum dinilai dilewati. null = belum ada tugas yang bisa dihitung.
 */
export function rataTugas(s: State, batchId: string, subjectId: string, registrationId: string): number | null {
  const scores: number[] = []
  for (const a of s.assignments.filter((x) => x.batchId === batchId && x.subjectId === subjectId)) {
    const sub = s.submissions.find((x) => x.assignmentId === a.id && x.registrationId === registrationId)
    if (!sub) scores.push(0)
    else if (sub.score != null) scores.push(sub.score)
  }
  return scores.length ? Math.round((scores.reduce((p, n) => p + n, 0) / scores.length) * 10) / 10 : null
}

/** Hitung nilai satu peserta di satu mata pelajaran angkatannya. Komponen yang belum terisi dihitung 0. */
export function nilaiMapel(s: State, batchId: string, subjectId: string, registrationId: string): NilaiMapel {
  const { w } = bobotBerlaku(s, batchId, subjectId)
  const ids = new Set(s.sessions.filter((x) => x.batchId === batchId && x.subjectId === subjectId).map((x) => x.id))
  const att = s.attendances.filter((a) => ids.has(a.sessionId))
  const diabsen = new Set(att.map((a) => a.sessionId)).size
  const hadir = att.filter((a) => a.registrationId === registrationId && a.status === 'hadir').length
  const absensiPct = diabsen ? Math.min(100, Math.round((hadir / diabsen) * 100)) : 0
  const g = s.subjectGrades.find((x) => x.registrationId === registrationId && x.subjectId === subjectId)
  const tugas = g?.task ?? null
  const teori = g?.theory ?? null
  const praktik = g?.practical ?? null
  const poin = {
    absensi: r2((absensiPct * w.absensi) / 100),
    tugas: r2(((tugas ?? 0) * w.tugas) / 100),
    teori: r2(((teori ?? 0) * w.teori) / 100),
    praktik: r2(((praktik ?? 0) * w.praktik) / 100),
  }
  const akhir = r2(poin.absensi + poin.tugas + poin.teori + poin.praktik)
  return { diabsen, hadir, absensiPct, tugas, teori, praktik, poin, akhir, huruf: hurufOf(akhir, s.gradeLetters) }
}

/**
 * Satu mata pelajaran di satu angkatan sudah selesai bila semua pesertanya yang aktif sudah tervalidasi Akademik.
 * Mata pelajaran seperti ini pindah dari "Input nilai akhir" ke "Arsip nilai" (hanya baca).
 */
export function mapelTervalidasi(s: State, batchId: string, subjectId: string): boolean {
  const regs = s.registrations.filter((r) => r.batchId === batchId && (r.status === 'active' || r.status === 'completed') && s.grades.some((g) => g.registrationId === r.id))
  return regs.length > 0 && regs.every((r) => s.subjectGrades.some((x) => x.registrationId === r.id && x.subjectId === subjectId && x.status === 'validated'))
}
