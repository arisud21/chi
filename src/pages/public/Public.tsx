import { IconChevronDown, IconMenu2, IconX } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useParams, useLocation } from 'react-router-dom'
import { SectionView } from '../../components/SectionRenderer'
import { Logo, Reveal, dateID, rupiah } from '../../components/ui'
import { seatsTaken, useStore } from '../../lib/store'
import type { SectionType } from '../../lib/types'

const DARK_PAGES = ['/', '/profil', '/struktur-organisasi', '/program-pelatihan', '/chi-today']
/** Section yang hanya tampil di halaman submenu, tidak di beranda. */
const PAGE_ONLY: SectionType[] = ['organization']

/** Kepala halaman profil: jejak navigasi dan judul kecil. Isi halaman berasal dari section landing page. */
export function PageIntro({ label, sub, trail = [{ label: 'Profil' }] }: { label: string; sub?: string; trail?: { label: string; to?: string }[] }) {
  return (
    <div className="bg-brand-950 text-white">
      <div className="mx-auto max-w-6xl px-4 pb-2 pt-10 sm:px-6">
        <nav aria-label="Jejak navigasi" className="text-sm text-brand-200">
          <Link to="/" className="hover:text-white">Beranda</Link>
          {trail.map((t) => <span key={t.label}><span className="mx-2" aria-hidden>/</span>{t.to ? <Link to={t.to} className="hover:text-white">{t.label}</Link> : t.label}</span>)}
          <span className="mx-2" aria-hidden>/</span><span className="text-white" aria-current="page">{label}</span>
        </nav>
        {sub && <p className="mt-2 max-w-2xl text-sm text-brand-100/70">{sub}</p>}
      </div>
    </div>
  )
}

/** Halaman yang menampilkan section landing page tertentu; bila belum diisi, tampilkan pesan. */
function SectionPage({ type, label, empty, override }: { type: SectionType; label: string; empty: string; override?: Record<string, any> }) {
  const sections = useStore((s) => s.publishedSections)
  const sec = sections.find((s) => s.visible && s.type === type)
  useEffect(() => { document.title = `${label} · Cimahi Hotel Institute`; return () => { document.title = 'Cimahi Hotel Institute' } }, [label])
  const shown = sec ?? (override ? { id: `page-${type}`, type, visible: true, content: {} } : null)
  return (
    <>
      <PageIntro label={label} />
      {shown ? <SectionView section={{ ...shown, content: { ...shown.content, ...override } }} /> : null}
      {!shown && <div className="bg-brand-950 px-4 py-24 text-center text-brand-100/80">{empty}</div>}
    </>
  )
}

export function ProfilPage() {
  return <SectionPage type="about" label="Profil" empty="Profil lembaga belum diisi." />
}

export function StrukturPage() {
  const sec = useStore((s) => s.publishedSections.find((x) => x.visible && x.type === 'organization'))
  const named = (sec?.content.items || []).some((i: any) => i.name?.trim() && i.position?.trim())
  if (!named) return <><PageIntro label="Struktur organisasi" /><div className="bg-brand-950 px-4 py-24 text-center text-brand-100/80">Struktur organisasi belum diisi.</div></>
  return <SectionPage type="organization" label="Struktur organisasi" empty="Struktur organisasi belum diisi." />
}

export function ProgramPage() {
  // Semua program aktif ditampilkan di halaman ini, tidak dibatasi seperti di beranda.
  return <SectionPage type="programs" label="Program pelatihan" empty="Belum ada program." override={{ title: 'Program pelatihan', limit: 99 }} />
}

/** Menu landing page. Tiap tautan menunjuk section di landing page; yang section-nya tidak tampil disembunyikan. */
function useLandingMenu() {
  const sections = useStore((s) => s.publishedSections)
  const has = (type: string, ok: (c: any) => boolean = () => true) => sections.some((s) => s.visible && s.type === type && ok(s.content))
  const named = (c: any) => (c.items || []).some((i: any) => i.name?.trim() && i.position?.trim())
  // Submenu Profil membuka halaman tersendiri.
  const profil = [
    has('about') && { to: '/profil', label: 'Profil' },
    has('organization', named) && { to: '/struktur-organisasi', label: 'Struktur organisasi' },
    { to: '/program-pelatihan', label: 'Program pelatihan' },
  ].filter(Boolean) as { to: string; label: string }[]
  const top = [
    has('location') && { id: 'lokasi', label: 'Lokasi' },
    has('social', (c) => (c.items || []).some((i: any) => i.url)) && { id: 'media-sosial', label: 'Media sosial' },
  ].filter(Boolean) as { id: string; label: string }[]
  return { profil, top }
}

export function PublicLayout() {
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))
  const settings = useStore((s) => s.settings)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false) // panel menu di ponsel
  const [sub, setSub] = useState(false) // submenu Profil di layar lebar
  const subRef = useRef<HTMLDivElement>(null)
  useEffect(() => { window.scrollTo(0, 0); setOpen(false) }, [pathname])
  useEffect(() => {
    if (!sub) return
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !subRef.current?.contains(e.target as Node)) setSub(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [sub])
  const dark = DARK_PAGES.includes(pathname) || pathname.startsWith('/chi-today/') // landing page, halaman profil, dan CHI Today bergaya gelap
  const { profil, top } = useLandingMenu()
  const chiActive = pathname === '/chi-today' || pathname.startsWith('/chi-today/')
  const homeActive = pathname === '/'
  // Sudah di beranda: menu Beranda menggulir ke atas dan membuang #anchor dari alamat.
  const toTop = (e: React.MouseEvent) => {
    if (pathname !== '/') return
    e.preventDefault()
    window.history.replaceState(null, '', '/')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const href = (id: string) => (pathname === '/' ? `#${id}` : `/#${id}`)
  const subLink = (active: boolean) => `block rounded-xl px-3 py-2.5 text-sm font-medium ${dark ? `text-brand-50 hover:bg-white/10 ${active ? 'bg-white/10' : ''}` : `text-ink hover:bg-brand-50 ${active ? 'bg-brand-50' : ''}`}`
  const navLink = `px-3 py-2 text-sm font-medium rounded-lg ${dark ? 'text-brand-100/80 hover:text-white' : 'text-muted hover:text-ink'}`
  return (
    <div className={`flex min-h-dvh flex-col ${dark ? 'bg-brand-950' : ''}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${dark ? 'border-white/10 bg-brand-950/80' : 'border-line bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Beranda" className="shrink-0"><Logo light={dark} /></Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Navigasi publik">
            <div className="hidden items-center lg:flex">
              <Link to="/" onClick={toTop} aria-current={homeActive ? 'page' : undefined} className={`${navLink} ${homeActive ? (dark ? '!text-white' : '!text-ink') : ''}`}>Beranda</Link>
              {profil.length > 0 && (
                <div ref={subRef} className="relative" onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)}>
                  <button type="button" className={`${navLink} flex items-center gap-1 ${profil.some((m) => m.to === pathname) ? (dark ? '!text-white' : '!text-ink') : ''}`} aria-expanded={sub} aria-haspopup="true" onClick={() => setSub(!sub)}>
                    Profil<IconChevronDown size={16} className={`transition ${sub ? 'rotate-180' : ''}`} />
                  </button>
                  {sub && (
                    <div className="absolute left-0 top-full pt-2">
                      <ul className={`w-56 animate-pop overflow-hidden rounded-2xl border p-1.5 shadow-xl ${dark ? 'border-white/10 bg-brand-900' : 'border-line bg-white'}`}>
                        {profil.map((m) => <li key={m.to}><Link to={m.to} onClick={() => setSub(false)} aria-current={m.to === pathname ? 'page' : undefined} className={subLink(m.to === pathname)}>{m.label}</Link></li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <Link to="/chi-today" className={`${navLink} ${chiActive ? (dark ? '!text-white' : '!text-ink') : ''}`} aria-current={chiActive ? 'page' : undefined}>CHI Today</Link>
              {top.map((m) => <a key={m.id} href={href(m.id)} className={navLink}>{m.label}</a>)}
              <Link to="/cek-status" className={navLink}>Cek status</Link>
            </div>
            {user ? (
              <Link to={user.role === 'peserta' ? '/app' : '/admin'} className={`${dark ? 'lp-pill' : 'btn-primary'} hidden sm:inline-flex`}>Buka dashboard</Link>
            ) : (
              <>
                <Link to="/masuk" className={`${dark ? 'lp-outline' : 'btn-ghost'} hidden sm:inline-flex`}>Masuk</Link>
                <Link to="/daftar" className={`${dark ? 'lp-pill' : 'btn-primary'} hidden sm:inline-flex`}>Registrasi</Link>
              </>
            )}
            <button type="button" className={`grid size-11 place-items-center rounded-lg lg:hidden ${dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-brand-50'}`} aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <IconX size={22} /> : <IconMenu2 size={22} />}
            </button>
          </nav>
        </div>
        {open && (
          <div className={`animate-fade border-t lg:hidden ${dark ? 'border-white/10 bg-brand-950' : 'border-line bg-white'}`}>
            <nav className="mx-auto max-w-6xl space-y-1 px-4 py-4 sm:px-6" aria-label="Menu ponsel">
              <Link to="/" onClick={(e) => { toTop(e); setOpen(false) }} aria-current={homeActive ? 'page' : undefined} className={`${navLink} block ${homeActive ? (dark ? '!text-white' : '!text-ink') : ''}`}>Beranda</Link>
              {profil.length > 0 && <>
                <p className={`px-3 pt-1 text-xs font-bold uppercase tracking-wider ${dark ? 'text-brand-200' : 'text-muted'}`}>Profil</p>
                {profil.map((m) => <Link key={m.to} to={m.to} onClick={() => setOpen(false)} aria-current={m.to === pathname ? 'page' : undefined} className={`${navLink} block pl-6 ${m.to === pathname ? (dark ? '!text-white' : '!text-ink') : ''}`}>{m.label}</Link>)}
              </>}
              <Link to="/chi-today" onClick={() => setOpen(false)} className={`${navLink} block ${chiActive ? (dark ? '!text-white' : '!text-ink') : ''}`}>CHI Today</Link>
              {top.map((m) => <a key={m.id} href={href(m.id)} onClick={() => setOpen(false)} className={`${navLink} block`}>{m.label}</a>)}
              <Link to="/cek-status" className={`${navLink} block`}>Cek status peserta</Link>
              <div className="flex gap-2 pt-3">
                {user
                  ? <Link to={user.role === 'peserta' ? '/app' : '/admin'} className={`${dark ? 'lp-pill' : 'btn-primary'} flex-1`}>Buka dashboard</Link>
                  : <><Link to="/masuk" className={`${dark ? 'lp-outline' : 'btn-ghost'} flex-1`}>Masuk</Link><Link to="/daftar" className={`${dark ? 'lp-pill' : 'btn-primary'} flex-1`}>Registrasi</Link></>}
              </div>
            </nav>
          </div>
        )}
      </header>
      <div className="flex-1"><Outlet /></div>
      <footer className={`${dark ? 'border-t border-white/10 bg-brand-950' : 'bg-brand-900'} text-brand-100`}>
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
  const { hash } = useLocation()
  // Datang dari halaman lain lewat /#lokasi dsb.: gulir ke section setelah halaman tergambar.
  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' }), 120)
    return () => clearTimeout(t)
  }, [hash])
  return (
    <>
      {/* Struktur organisasi hanya tampil di halamannya sendiri (/struktur-organisasi), tidak di beranda. */}
      {sections.filter((s) => s.visible && !PAGE_ONLY.includes(s.type)).map((s) => <SectionView key={s.id} section={s} />)}
    </>
  )
}

export function ProgramDetail() {
  const { slug } = useParams()
  const s = useStore((x) => x)
  const p = s.programs.find((x) => x.slug === slug && !x.archived)
  if (!p) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><p className="font-semibold">Program tidak ditemukan.</p><Link to="/" className="btn-ghost mt-4">Kembali</Link></div>
  const batches = s.batches.filter((b) => b.programId === p.id && b.status === 'open')
  const subjects = s.subjects.filter((x) => (x.programId === p.id || x.programId === '') && x.active)
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
              <div className="flex items-center gap-3"><span className="text-sm font-semibold text-brand-700">Sisa {b.quota - seatsTaken(s, b.id)} kursi</span><Link to={`/daftar?batch=${b.id}`} className="btn-primary">Registrasi</Link></div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  )
}

