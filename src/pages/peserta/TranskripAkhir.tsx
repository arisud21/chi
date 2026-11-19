import { IconConfetti, IconFileTypePdf } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { Empty, PageHeader } from '../../components/ui'
import { finalScore, useStore } from '../../lib/store'

/** Transkrip akhir pelatihan peserta: tampil setelah nilai divalidasi, lulus, dan seluruh pembayaran lunas. */
export function TranskripSaya() {
  const s = useStore((x) => x)
  const mine = s.registrations
    .filter((r) => r.status === 'completed')
    .map((r) => ({ r, g: s.grades.find((g) => g.registrationId === r.id && g.status === 'validated' && g.passed), p: s.programs.find((p) => p.id === r.programId), b: s.batches.find((b) => b.id === r.batchId) }))
    .filter((x) => x.g)
  return (
    <>
      <PageHeader title="Transkrip akhir pelatihan" sub="Nilai seluruh mata pelatihan dan magang Anda." />
      {mine.length === 0 ? <div className="card"><Empty title="Transkrip belum tersedia" body="Transkrip tersedia setelah nilai Anda divalidasi Akademik, seluruh pembayaran lunas, dan nilai magang diinput Akademik. Selama nilai magang belum ada, status Anda belum lulus." action={<Link to="/app" className="btn-primary">Ke beranda</Link>} /></div> : (
        <div className="space-y-4">
          {mine.map(({ r, g, p, b }) => (
            <section key={r.id} className="card p-5">
              <p className="flex items-center gap-2 font-bold text-emerald-700"><IconConfetti size={20} />Selamat atas kelulusan Anda!</p>
              <h2 className="mt-2 text-lg font-bold">{p?.title}</h2>
              <p className="text-sm text-muted">Angkatan {b?.code ?? '-'} · NIP {r.nip ?? '-'}{p && g ? ` · Nilai akhir ${finalScore(g, p, b)}` : ''}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a className="btn-primary" href={`/api/transkrip-akhir/${r.id}.pdf`} target="_blank" rel="noreferrer"><IconFileTypePdf size={18} />Lihat PDF (draft)</a>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
