import { IconFileTypePdf, IconFileWord } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { AngkatanFilter, angkatanKe, cocokAngkatan, useAngkatan } from '../../lib/angkatan'
import { Empty, PageHeader, Table } from '../../components/ui'
import { finalScore, useStore } from '../../lib/store'

/**
 * Akademik: transkrip akhir pelatihan semua peserta yang nilainya sudah divalidasi (mata pelatihan + magang).
 * PDF memakai watermark DRAFT; Word adalah dokumen sesuai template. Peserta yang lulus dan lunas melihat transkripnya sendiri
 * di menu Transkrip akhir dan mendapat notifikasi kelulusan.
 */
export function TranskripAkhir() {
  const s = useStore((x) => x)
  const [q, setQ] = useState('')
  const [angkatan, setAngkatan] = useAngkatan()
  const all = useMemo(() => s.registrations
    .filter((r) => s.grades.some((g) => g.registrationId === r.id && g.status === 'validated'))
    .map((r) => ({ r, g: s.grades.find((g) => g.registrationId === r.id)!, u: s.users.find((u) => u.id === r.userId), p: s.programs.find((p) => p.id === r.programId), b: s.batches.find((b) => b.id === r.batchId), pl: s.placements.filter((x) => x.registrationId === r.id && x.kind === 'magang' && x.status !== 'batal').sort((a, b) => (a.status === 'selesai' ? -1 : 1) - (b.status === 'selesai' ? -1 : 1))[0] }))
    .sort((a, b) => (a.u?.name ?? '').localeCompare(b.u?.name ?? '')), [s.registrations, s.grades, s.users, s.programs, s.batches, s.placements])
  const rows = all
    .filter((x) => cocokAngkatan(angkatan, angkatanKe(s, x.r)))
    .filter((x) => !q.trim() || `${x.u?.name ?? ''} ${x.r.nip ?? ''} ${x.r.code}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <PageHeader title="Transkrip akhir pelatihan" sub="Transkrip peserta yang nilai mata pelatihannya sudah divalidasi. PDF bertanda DRAFT; unduh Word untuk dokumen sesuai template. Peserta lulus yang sudah lunas melihat transkripnya di menu Transkrip akhir dan menerima ucapan selamat." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama, NIP, atau kode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" />
        <AngkatanFilter values={all.map((x) => angkatanKe(s, x.r))} value={angkatan} onChange={setAngkatan} />
      </div>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada transkrip" body="Transkrip muncul setelah nilai seluruh mata pelatihan peserta divalidasi di menu Validasi nilai." /></div> : (
        <Table head={['Peserta didik', 'Program', 'Angkatan', 'Nilai akhir', 'Hasil', 'Nilai magang', 'Pembayaran', 'Transkrip']}>
          {rows.map(({ r, g, u, p, b, pl }) => (
            <tr key={r.id}>
              <td><p className="font-semibold">{u?.name}</p><p className="font-mono text-xs text-muted">{r.nip ?? '-'}</p></td>
              <td>{p?.title}</td>
              <td>{b?.code ?? '-'}</td>
              <td className="tabular-nums">{p ? <b>{finalScore(g, p, b)}</b> : '-'}</td>
              <td><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${g.passed && r.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{!g.passed ? 'Tidak lulus' : r.status === 'completed' ? 'Lulus' : 'Belum lulus'}</span>{g.passed && r.status !== 'completed' && <span className="mt-1 block text-xs text-muted">{pl?.score == null ? 'Menunggu nilai magang' : 'Menunggu pelunasan'}</span>}</td>
              <td className="tabular-nums">{pl ? (pl.score != null ? <b>{pl.score}</b> : <span className="text-xs text-amber-800">Belum dinilai</span>) : <span className="text-muted">Belum magang</span>}</td>
              <td>{r.paidOff ? <span className="text-xs font-semibold text-emerald-700">Lunas</span> : <span className="text-xs font-semibold text-amber-800">Belum lunas</span>}</td>
              <td className="whitespace-nowrap">
                <a className="btn-ghost !min-h-9" href={`/api/transkrip-akhir/${r.id}.pdf`} target="_blank" rel="noreferrer" title="PDF dengan watermark DRAFT"><IconFileTypePdf size={16} />PDF</a>{' '}
                <a className="btn-ghost !min-h-9" href={`/api/transkrip-akhir/${r.id}.docx`} download title="Word sesuai template"><IconFileWord size={16} />Word</a>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
