import { finalScore, recommendPass, type State } from './store'
import type { Batch, Grade, Program, Registration, User } from './types'
import { buildXlsx, downloadBlob, type Cell, type Sheet } from './xlsx'

export interface NilaiRow { g: Grade; r: Registration; b: Batch; p: Program; u: User }

const STATUS: Record<string, string> = { draft: 'Draf', submitted: 'Dikirim, menunggu validasi', validated: 'Tervalidasi' }
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

/** Nama sheet unik (maksimal 31 karakter, batas Excel). */
function uniqueName(used: Set<string>, base: string) {
  let name = base.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.replace(/[:\\/?*[\]]/g, ' ').slice(0, 28)} ${n}`
  used.add(name.toLowerCase())
  return name
}

/**
 * Excel rekap nilai: sheet "Nilai Akhir" (teori, praktik, kehadiran, nilai akhir, hasil, dan status kelulusan) lalu satu sheet untuk
 * setiap mata pelajaran di tiap angkatan (kehadiran per mata pelajaran dan nilai setiap tugas beserta rata-ratanya).
 * onlyTeacherId: instruktur hanya mendapat sheet mata pelajaran yang ia ampu.
 */
export function exportNilaiXlsx(s: State, rows: NilaiRow[], filename: string, onlyTeacherId?: string) {
  const used = new Set<string>(['nilai akhir'])
  const sorted = [...rows].sort((a, b) => a.b.code.localeCompare(b.b.code) || a.u.name.localeCompare(b.u.name))

  const final: Cell[][] = sorted.map((x, i) => {
    const fin = finalScore(x.g, x.p, x.b)
    const rec = recommendPass(x.g, x.p, x.b)
    const hasil = x.g.status === 'validated' ? (x.g.passed ? 'Lulus' : 'Tidak lulus') : ''
    const sempurna = x.g.status === 'validated' && x.g.passed ? (x.r.status === 'completed' ? 'Lulus sempurna' : 'Lulus, menunggu pelunasan') : ''
    return [i + 1, x.r.nip ?? '', x.u.name, x.b.code, x.p.title, x.g.theory, x.g.practical, x.g.attendancePct, fin, rec ? 'Lulus' : 'Tidak lulus', STATUS[x.g.status] ?? x.g.status, hasil, sempurna, x.r.paidOff ? 'Lunas' : 'Belum lunas']
  })
  const sheets: Sheet[] = [{
    name: 'Nilai Akhir', rows: final,
    cols: [{ header: 'No', width: 5 }, { header: 'NIP', width: 14 }, { header: 'Nama', width: 30 }, { header: 'Angkatan', width: 12 }, { header: 'Program', width: 28 },
      { header: 'Teori', width: 8 }, { header: 'Praktik', width: 8 }, { header: 'Kehadiran (%)', width: 14 }, { header: 'Nilai akhir', width: 11 },
      { header: 'Rekomendasi sistem', width: 18 }, { header: 'Status nilai', width: 26 }, { header: 'Hasil validasi', width: 14 }, { header: 'Kelulusan', width: 26 }, { header: 'Pembayaran', width: 14 }],
  }]

  // Satu sheet untuk setiap mata pelajaran di tiap angkatan.
  const batches = [...new Map(sorted.map((x) => [x.b.id, x.b])).values()].sort((a, b) => a.code.localeCompare(b.code))
  for (const b of batches) {
    const people = sorted.filter((x) => x.b.id === b.id)
    const subs = s.batchSubjects.filter((x) => x.batchId === b.id && (!onlyTeacherId || x.instructorId === onlyTeacherId))
      .map((x) => ({ x, subject: s.subjects.find((y) => y.id === x.subjectId) }))
      .sort((m, n) => (m.subject?.name ?? '').localeCompare(n.subject?.name ?? ''))
    for (const { x: bs, subject } of subs) {
      const sessions = s.sessions.filter((z) => z.batchId === b.id && z.subjectId === bs.subjectId)
      const ids = new Set(sessions.map((z) => z.id))
      const att = s.attendances.filter((a) => ids.has(a.sessionId))
      const held = new Set(att.map((a) => a.sessionId)).size // pertemuan yang sudah diabsen
      const tasks = s.assignments.filter((a) => a.batchId === b.id && a.subjectId === bs.subjectId).sort((m, n) => m.dueAt.localeCompare(n.dueAt))
      const teacher = s.users.find((u) => u.id === bs.instructorId)?.name ?? ''
      const body: Cell[][] = people.map((x, i) => {
        const mine = att.filter((a) => a.registrationId === x.r.id)
        const n = (st: string) => mine.filter((a) => a.status === st).length
        const scores = tasks.map((t) => s.submissions.find((m) => m.assignmentId === t.id && m.registrationId === x.r.id)?.score ?? null)
        return [i + 1, x.r.nip ?? '', x.u.name, held, n('hadir'), n('izin'), n('sakit'), n('alpa'), held ? Math.round((n('hadir') / held) * 100) : null, ...scores, avg(scores.filter((v): v is number => v != null))]
      })
      sheets.push({
        name: uniqueName(used, `${b.code} ${subject?.name ?? 'Mata pelajaran'}`), rows: body,
        cols: [{ header: 'No', width: 5 }, { header: 'NIP', width: 14 }, { header: `Nama (pengampu: ${teacher || '-'})`, width: 34 }, { header: 'Pertemuan diabsen', width: 18 },
          { header: 'Hadir', width: 8 }, { header: 'Izin', width: 8 }, { header: 'Sakit', width: 8 }, { header: 'Alpa', width: 8 }, { header: 'Kehadiran (%)', width: 14 },
          ...tasks.map((t) => ({ header: `Tugas: ${t.title}`, width: 20 })), { header: 'Rata-rata tugas', width: 16 }],
      })
    }
  }
  downloadBlob(buildXlsx(sheets), filename)
  return { peserta: sorted.length, sheet: sheets.length }
}
