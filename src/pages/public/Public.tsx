import { useEffect } from 'react'
import { Link, Outlet, useParams, useLocation } from 'react-router-dom'
import { SectionView } from '../../components/SectionRenderer'
import { Logo, Reveal, dateID, rupiah } from '../../components/ui'
import { seatsTaken, useStore } from '../../lib/store'

export function PublicLayout() {
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))
  const settings = useStore((s) => s.settings)
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Beranda"><Logo /></Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Navigasi publik">
            <Link to="/verifikasi" className="hidden px-3 text-sm font-medium text-muted hover:text-ink sm:block">Cek sertifikat</Link>
            {user ? (
              <Link to={user.role === 'peserta' ? '/app' : '/admin'} className="btn-primary">Buka dashboard</Link>
            ) : (
              <>
                <Link to="/masuk" className="btn-ghost">Masuk</Link>
                <Link to="/daftar" className="btn-primary hidden sm:inline-flex">Daftar</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="flex-1"><Outlet /></div>
      <footer className="bg-brand-900 text-brand-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm sm:px-6">
          <Logo light />
          <p>{settings.address}</p>
          <p className="text-brand-200">© {new Date().getFullYear()} {settings.name}</p>
        </div>
      </footer>
    </div>
  )
}

export function Landing() {
  const sections = useStore((s) => s.publishedSections)
  return (
    <>
      {sections.filter((s) => s.visible).map((s) => <SectionView key={s.id} section={s} />)}
    </>
  )
}

export function ProgramDetail() {
  const { slug } = useParams()
  const s = useStore((x) => x)
  const p = s.programs.find((x) => x.slug === slug && !x.archived)
  if (!p) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><p className="font-semibold">Program tidak ditemukan.</p><Link to="/" className="btn-ghost mt-4">Kembali</Link></div>
  const batches = s.batches.filter((b) => b.programId === p.id && b.status === 'open')
  const subjects = s.subjects.filter((x) => x.programId === p.id && x.active)
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Reveal>
        <p className="text-xs font-bold uppercase tracking-wider text-brass-600">{p.category}</p>
        <h1 className="mt-1 font-display text-4xl font-bold">{p.title}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">{p.description}</p>
        <dl className="mt-6 grid grid-cols-3 gap-4 rounded-2xl border border-line bg-white p-5">
          <div><dt className="text-xs text-muted">Durasi</dt><dd className="font-bold">{p.durationHours} jam</dd></div>
          <div><dt className="text-xs text-muted">Biaya</dt><dd className="font-bold">{rupiah(p.price)}</dd></div>
          <div><dt className="text-xs text-muted">Batas lulus</dt><dd className="font-bold">{p.rules.passingScore}, hadir {p.rules.minAttendance}%</dd></div>
        </dl>
      </Reveal>
      {subjects.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">Mata pelajaran</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
            {subjects.map((x) => <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-medium">{x.name}</span><span className="text-muted capitalize">{x.kind} · {x.hours} jam</span></li>)}
          </ul>
        </section>
      )}
      <h2 className="mt-10 text-lg font-bold">Angkatan yang dibuka</h2>
      <div className="mt-3 space-y-3">
        {batches.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada angkatan dibuka untuk program ini.</p>}
        {batches.map((b, i) => (
          <Reveal key={b.id} delay={i * 0.07}>
            <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <div><p className="font-semibold">{b.code}</p><p className="text-sm text-muted">{dateID(b.startDate)} sampai {dateID(b.endDate)} · {b.location}</p></div>
              <div className="flex items-center gap-3"><span className="text-sm font-semibold text-brand-700">Sisa {b.quota - seatsTaken(s, b.id)} kursi</span><Link to={`/daftar?batch=${b.id}`} className="btn-primary">Daftar</Link></div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  )
}

