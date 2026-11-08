import { IconArrowRight, IconBrandWhatsapp, IconClock, IconMapPin, IconPhone, IconPlus } from '@tabler/icons-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { seatsTaken, useStore } from '../lib/store'
import type { Section } from '../lib/types'
import { CountUp, Reveal, dateID, rupiah } from './ui'

const isExternal = (h: string) => /^https?:\/\//.test(h)
function Cta({ href, children, kind = 'primary' }: { href: string; children: React.ReactNode; kind?: 'primary' | 'ghost' | 'light' }) {
  const cls = kind === 'primary' ? 'btn-primary' : kind === 'light' ? 'btn bg-brass-500 text-white hover:bg-brass-600' : 'btn-ghost'
  if (href.startsWith('#')) return <a href={href} className={cls}>{children}</a>
  if (isExternal(href)) return <a href={href} className={cls} target="_blank" rel="noreferrer">{children}</a>
  return <Link to={href} className={cls}>{children}</Link>
}

function Hero({ c }: { c: Section['content'] }) {
  const batches = useStore((s) => s.batches)
  const programs = useStore((s) => s.programs)
  const seats = useStore((s) => s.seats)
  const next = batches.filter((b) => b.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const prog = next && programs.find((p) => p.id === next.programId)
  const taken = next ? seats[next.id] ?? 0 : 0
  const pct = next ? Math.min(100, Math.round((taken / next.quota) * 100)) : 0
  return (
    <section className="relative overflow-hidden bg-brand-900 text-white">
      {c.imageId && <img src={`/api/media/${c.imageId}`} alt={c.imageAlt || ''} className="absolute inset-0 size-full object-cover opacity-25" fetchPriority="high" />}
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >{c.title}</motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-brand-100 sm:text-lg"
          >{c.subtitle}</motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Cta href={c.ctaHref || '#program'} kind="light">{c.ctaLabel} <IconArrowRight size={18} /></Cta>
            {c.secondaryLabel && <Cta href={c.secondaryHref || '/'} kind="ghost">{c.secondaryLabel}</Cta>}
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 30, rotate: 1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl bg-white p-6 text-ink shadow-2xl"
        >
          {next && prog ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-brass-600">Angkatan terdekat</p>
              <h2 className="mt-1 font-display text-2xl font-bold">{prog.title}</h2>
              <p className="mt-1 text-sm text-muted">{next.code} · mulai {dateID(next.startDate)}</p>
              <div className="mt-5">
                <div className="flex justify-between text-sm font-semibold"><span>Kuota terisi</span><span>{taken} dari {next.quota}</span></div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <motion.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.1, delay: 0.7, ease: 'easeOut' }} />
                </div>
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div><p className="text-xs text-muted">Biaya</p><p className="text-xl font-bold">{rupiah(prog.price)}</p></div>
                <Link to={`/daftar?batch=${next.id}`} className="btn-primary">Daftar angkatan ini</Link>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted">Belum ada angkatan yang dibuka. Cek kembali segera.</p>
          )}
        </motion.div>
      </div>
    </section>
  )
}

function Stats({ c }: { c: Section['content'] }) {
  const programs = useStore((s) => s.programs.filter((p) => p.active && !p.archived).length)
  const open = useStore((s) => s.batches.filter((b) => b.status === 'open').length)
  const done = useStore((s) => s.stats.participants)
  const certs = useStore((s) => s.stats.certificates)
  const items = [
    ['Program aktif', programs], ['Angkatan dibuka', open], ['Peserta terdaftar aktif', done], ['Sertifikat terbit', certs],
  ] as const
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {items.map(([label, n], i) => (
            <Reveal key={label} delay={i * 0.07}>
              <dd className="font-display text-4xl font-bold text-brand-700"><CountUp to={n} /></dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </Reveal>
          ))}
        </dl>
        {c.note && <p className="mt-4 text-xs text-muted">{c.note}</p>}
      </div>
    </section>
  )
}

function Programs({ c }: { c: Section['content'] }) {
  const programs = useStore((s) => s.programs)
  const batches = useStore((s) => s.batches)
  const list = programs.filter((p) => p.active && !p.archived).slice(0, c.limit || 4)
  return (
    <section id="program" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal><h2 className="font-display text-3xl font-bold">{c.title}</h2></Reveal>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {list.map((p, i) => {
          const open = batches.filter((b) => b.programId === p.id && b.status === 'open').length
          return (
            <Reveal key={p.id} delay={i * 0.08}>
              <Link to={`/program/${p.slug}`} className="card group block h-full p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-brass-600">{p.category}</span>
                  <span className="text-sm text-muted">{p.durationHours} jam</span>
                </div>
                <h3 className="mt-2 font-display text-xl font-bold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.shortDesc}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-bold">{rupiah(p.price)}</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-brand-600">
                    {open ? `${open} angkatan dibuka` : 'Belum ada angkatan'}
                    <IconArrowRight size={16} className="transition group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

function Upcoming({ c }: { c: Section['content'] }) {
  const s = useStore((x) => x)
  const list = s.batches.filter((b) => b.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, c.limit || 4)
  return (
    <section className="bg-brand-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal><h2 className="font-display text-3xl font-bold">{c.title}</h2></Reveal>
        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-white">
          {list.length === 0 && <p className="p-8 text-center text-sm text-muted">Belum ada angkatan yang dibuka.</p>}
          {list.map((b, i) => {
            const p = s.programs.find((x) => x.id === b.programId)!
            const left = b.quota - seatsTaken(s, b.id)
            return (
              <Reveal key={b.id} delay={i * 0.06}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-0">
                  <div>
                    <p className="font-semibold">{p.title}</p>
                    <p className="text-sm text-muted">{b.code} · mulai {dateID(b.startDate)} · {b.location}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-semibold ${left <= 3 ? 'text-red-700' : 'text-brand-700'}`}>{left > 0 ? `Sisa ${left} kursi` : 'Penuh'}</span>
                    <Link to={`/daftar?batch=${b.id}`} className="btn-ghost">Daftar</Link>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Benefits({ c }: { c: Section['content'] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal><h2 className="font-display text-3xl font-bold">{c.title}</h2></Reveal>
      <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {(c.items || []).map((it: any, i: number) => (
          <Reveal key={i} delay={i * 0.1}>
            <p className="font-display text-5xl font-bold text-brass-500/40">{String(i + 1).padStart(2, '0')}</p>
            <h3 className="mt-2 text-lg font-bold">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Faq({ c }: { c: Section['content'] }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Reveal><h2 className="font-display text-3xl font-bold">{c.title}</h2></Reveal>
      <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
        {(c.items || []).map((it: any, i: number) => (
          <details key={i} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-8 cursor-pointer items-center justify-between gap-4 font-semibold">
              {it.q}<IconPlus size={18} className="shrink-0 transition duration-300 group-open:rotate-45" />
            </summary>
            <p className="mt-2 animate-fade text-sm leading-relaxed text-muted">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function CtaBlock({ c }: { c: Section['content'] }) {
  return (
    <section className="px-4 py-8 sm:px-6">
      <Reveal className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 rounded-3xl bg-brand-700 px-8 py-10 text-white">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl font-bold">{c.title}</h2>
          <p className="mt-2 text-brand-100">{c.body}</p>
        </div>
        <Cta href={c.href || '/daftar'} kind="light">{c.label} <IconArrowRight size={18} /></Cta>
      </Reveal>
    </section>
  )
}

function Contact({ c }: { c: Section['content'] }) {
  const st = useStore((s) => s.settings)
  return (
    <section id="kontak" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal><h2 className="font-display text-3xl font-bold">{c.title}</h2></Reveal>
      <Reveal delay={0.1} className="mt-6 grid gap-4 md:grid-cols-2">
        <ul className="card space-y-4 p-6 text-sm">
          <li className="flex gap-3"><IconMapPin className="shrink-0 text-brand-600" size={20} />{st.address}</li>
          <li className="flex gap-3"><IconClock className="shrink-0 text-brand-600" size={20} />{st.hours}</li>
          <li className="flex gap-3"><IconPhone className="shrink-0 text-brand-600" size={20} />{st.phone}</li>
        </ul>
        <a href={`https://wa.me/${st.whatsapp}`} target="_blank" rel="noreferrer" className="card flex items-center gap-4 p-6 transition hover:border-brand-200 hover:shadow-md">
          <IconBrandWhatsapp size={32} className="text-brand-600" />
          <span><span className="block font-bold">Tanya lewat WhatsApp</span><span className="text-sm text-muted">Jam layanan: {st.hours}</span></span>
        </a>
      </Reveal>
    </section>
  )
}

function About({ c }: { c: Section['content'] }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Reveal>{c.imageId && <img src={`/api/media/${c.imageId}`} srcSet={`/api/media/${c.imageId}?w=sm 480w, /api/media/${c.imageId} 1600w`} sizes="(min-width: 768px) 768px, 100vw" alt={c.imageAlt || ''} loading="lazy" className="mb-6 w-full rounded-2xl" />}<h2 className="font-display text-3xl font-bold">{c.title}</h2><p className="mt-4 whitespace-pre-line leading-relaxed text-muted">{c.body}</p></Reveal>
    </section>
  )
}

function Testimonials({ c }: { c: Section['content'] }) {
  const items = (c.items || []).filter((i: any) => i.quote?.trim())
  if (!items.length) return null
  return (
    <section className="bg-brand-50"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal><h2 className="font-display text-3xl font-bold">{c.title}</h2></Reveal>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {items.map((t: any, i: number) => (
          <Reveal key={i} delay={i * 0.08}><figure className="card h-full p-6"><blockquote className="leading-relaxed">{t.quote}</blockquote><figcaption className="mt-4 text-sm"><b>{t.name}</b><span className="text-muted"> · {t.role}</span></figcaption></figure></Reveal>
        ))}
      </div>
    </div></section>
  )
}

function Announcement({ c }: { c: Section['content'] }) {
  const inner = <>{c.text}{c.href && <span className="ml-2 underline">Selengkapnya</span>}</>
  return <div className="bg-brass-500 px-4 py-2 text-center text-sm font-semibold text-white">{c.href ? <Cta href={c.href} kind="ghost">{inner}</Cta> : inner}</div>
}

export function SectionView({ section }: { section: Section }) {
  const c = section.content
  switch (section.type) {
    case 'hero': return <Hero c={c} />
    case 'stats': return <Stats c={c} />
    case 'programs': return <Programs c={c} />
    case 'upcoming_batches': return <Upcoming c={c} />
    case 'benefits': return <Benefits c={c} />
    case 'faq': return <Faq c={c} />
    case 'cta': return <CtaBlock c={c} />
    case 'about': return <About c={c} />
    case 'testimonials': return <Testimonials c={c} />
    case 'contact': return <Contact c={c} />
    case 'announcement_bar': return <Announcement c={c} />
    default: return null
  }
}

export const SECTION_LABEL: Record<string, string> = {
  announcement_bar: 'Bilah pengumuman', hero: 'Hero', about: 'Tentang', programs: 'Program (otomatis)',
  upcoming_batches: 'Angkatan dibuka (otomatis)', benefits: 'Keunggulan', testimonials: 'Testimoni',
  stats: 'Statistik (otomatis)', faq: 'FAQ', cta: 'Ajakan bertindak', contact: 'Kontak',
}
