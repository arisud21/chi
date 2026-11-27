import {
  IconArrowRight, IconArrowUpRight, IconBrandFacebook, IconBrandInstagram, IconBrandTiktok, IconBrandWhatsapp, IconBrandYoutube,
  IconCheck, IconClock, IconMail, IconMapPin, IconPhone, IconPlus, IconSparkles, IconWorld,
} from '@tabler/icons-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { catalogSubjects, seatsTaken, useStore } from '../lib/store'
import type { Program, Section } from '../lib/types'
import { CountUp, Reveal, dateID, rupiah } from './ui'

/*
 * Landing page bergaya gelap: dasar biru tua tema (brand-950), sorotan biru tema, tombol pil putih.
 * Foto bawaan ada di /public/landing; gambar dari pustaka media (imageId) selalu didahulukan.
 */

const isExternal = (h: string) => /^https?:\/\//.test(h)
function Cta({ href, children, kind = 'pill' }: { href: string; children: ReactNode; kind?: 'pill' | 'outline' }) {
  const cls = kind === 'pill' ? 'lp-pill' : 'lp-outline'
  if (href.startsWith('#')) return <a href={href} className={cls}>{children}</a>
  if (isExternal(href)) return <a href={href} className={cls} target="_blank" rel="noreferrer">{children}</a>
  return <Link to={href} className={cls}>{children}</Link>
}

/** Sumber gambar: dari pustaka media bila dipilih, selain itu foto bawaan di /landing. */
const imgSrc = (imageId?: string, src?: string) => (imageId ? `/api/media/${imageId}` : src || '')

/** Cahaya lembut di latar, mengganti gradasi warna-warni pada desain acuan dengan biru tema. */
function Glow({ className }: { className: string }) {
  return <div aria-hidden className={`pointer-events-none absolute rounded-full bg-brand-500/25 blur-[110px] ${className}`} />
}

function Dark({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return <section id={id} className={`relative scroll-mt-16 overflow-hidden bg-brand-950 text-white ${className}`}>{children}</section>
}

function Hero({ c }: { c: Section['content'] }) {
  const s = useStore((x) => x)
  const next = s.batches.filter((b) => b.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const prog = next && s.programs.find((p) => p.id === next.programId)
  const left = next ? next.quota - (s.seats[next.id] ?? 0) : 0
  const programs = s.programs.filter((p) => p.active && !p.archived).length
  const photo = imgSrc(c.imageId, c.photoSrc || '/landing/tim-rd-fb.jpg')
  const ease = [0.22, 1, 0.36, 1] as const
  return (
    <Dark>
      <Glow className="-left-40 top-24 size-[28rem]" />
      <Glow className="-right-32 top-10 size-[24rem] bg-brand-200/20" />
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-6 lg:pt-20">
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}
          className="text-center text-4xl font-extrabold leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
          {c.title}
          {c.highlight && <span className="lp-gradient mt-3 block pb-1 text-3xl sm:text-5xl lg:text-6xl">{c.highlight}</span>}
        </motion.h1>

        <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1fr_1.5fr_1fr]">
          {/* Kiri: angka singkat dalam kartu kaca */}
          <div className="order-2 grid grid-cols-2 gap-3 lg:order-1 lg:grid-cols-1">
            {[[programs, 'Program pelatihan aktif'], s.stats.graduates > 0 ? [s.stats.graduates, 'Peserta lulus'] : [s.stats.participants, 'Peserta didik aktif']].map(([n, label], i) => (
              <motion.div key={label} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.3 + i * 0.12, ease }}
                className={`lp-glass p-5 ${i === 1 ? 'lg:ml-10' : ''}`}>
                <p className="text-3xl font-extrabold tabular-nums"><CountUp to={Number(n)} /></p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-brand-200">{label}</p>
              </motion.div>
            ))}
          </div>

          {/* Tengah: foto peserta */}
          <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.15, ease }} className="relative order-1 lg:order-2">
            <div aria-hidden className="absolute -inset-3 rounded-[2.25rem] bg-linear-to-br from-brand-500/60 via-brand-200/20 to-transparent blur-xl" />
            <img src={photo} alt={c.imageAlt || 'Peserta pelatihan Room Division dan Food and Beverage'} fetchPriority="high"
              className="relative h-auto w-full rounded-[2rem] border border-white/15 object-contain shadow-2xl" />
            {next && prog && (
              <Link to={`/daftar?batch=${next.id}`} className="lp-glass absolute -bottom-5 left-1/2 flex w-[90%] -translate-x-1/2 items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-white/10 sm:w-auto sm:min-w-80">
                <span><span className="block text-[11px] font-bold uppercase tracking-wider text-brand-200">Angkatan terdekat</span><b>{prog.title}</b> · mulai {dateID(next.startDate)}</span>
                <span className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-900">{left > 0 ? `Sisa ${left} kursi` : 'Penuh'}</span>
              </Link>
            )}
          </motion.div>

          {/* Kanan: ringkasan dan tombol */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.35, ease }} className="order-3 text-center lg:text-left">
            <p className="text-sm leading-relaxed text-brand-100/90">{c.subtitle}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Cta href={c.ctaHref || '/daftar'}>{c.ctaLabel || 'Daftar'} <IconArrowUpRight size={18} /></Cta>
              {c.secondaryLabel && <Cta href={c.secondaryHref || '/'} kind="outline">{c.secondaryLabel}</Cta>}
            </div>
          </motion.div>
        </div>
      </div>
    </Dark>
  )
}

/** Strip kata kunci yang bergerak, seperti pita miring pada desain acuan. */
function Marquee({ c }: { c: Section['content'] }) {
  const items: string[] = (c.items || []).map((i: any) => i.text).filter(Boolean)
  if (!items.length) return null
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((t, i) => <li key={i} className="flex items-center gap-5 whitespace-nowrap pr-5 text-base font-bold tracking-wide sm:text-lg"><IconSparkles size={18} className="text-brand-200" aria-hidden />{t}</li>)}
    </ul>
  )
  return (
    <div className="relative overflow-hidden bg-brand-950 py-6">
      <div className="-mx-4 -rotate-2 border-y border-white/10 bg-brand-600 py-3 text-white shadow-[0_10px_40px_-10px_rgba(98,142,203,0.6)]">
        <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">{row(false)}{row(true)}</div>
      </div>
    </div>
  )
}

function Stats({ c }: { c: Section['content'] }) {
  const programs = useStore((s) => s.programs.filter((p) => p.active && !p.archived).length)
  const open = useStore((s) => s.batches.filter((b) => b.status === 'open').length)
  const done = useStore((s) => s.stats.participants)
  const graduates = useStore((s) => s.stats.graduates)
  const items = [['Program aktif', programs], ['Angkatan dibuka', open], ['Peserta aktif', done], ['Peserta lulus', graduates]] as const
  return (
    <Dark>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="lp-glass px-6 py-10">
          <dl className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            {items.map(([label, n], i) => (
              <Reveal key={label} delay={i * 0.07}>
                <dd className="text-4xl font-extrabold tabular-nums sm:text-5xl"><CountUp to={n} /></dd>
                <dt className="mt-1 text-sm text-brand-200">{label}</dt>
              </Reveal>
            ))}
          </dl>
          {c.note && <p className="mt-6 text-center text-xs text-brand-100/60">{c.note}</p>}
        </div>
      </div>
    </Dark>
  )
}

const PHOTO_POOL = ['/landing/fb-service.jpg', '/landing/rd-housekeeping.jpg', '/landing/peserta-putri.jpg', '/landing/siap-mendunia.jpg', '/landing/tim-rd-fb.jpg']
/** Foto bawaan per program, dipilih dari nama program. */
function programPhoto(p: Program) {
  const t = `${p.title} ${p.slug} ${p.category}`.toLowerCase()
  if (/food|beverage|f&b|boga|restoran|kitchen|barista|kopi|coffee|bar\b/.test(t)) return '/landing/fb-service.jpg'
  if (/room|front|house|kamar/.test(t)) return '/landing/rd-housekeeping.jpg'
  return '/landing/peserta-putri.jpg'
}

function Programs({ c }: { c: Section['content'] }) {
  const s = useStore((x) => x)
  const list = s.programs.filter((p) => p.active && !p.archived).slice(0, c.limit || 4)
  // Tiap program mendapat foto berbeda: foto yang cocok dengan namanya, atau foto cadangan yang belum terpakai.
  // Program utama (Room Division, Food and Beverage) memilih lebih dulu.
  const used = new Set<string>()
  const photos = new Map<string, string>()
  const main = (p: Program) => /food|beverage|room/i.test(p.title)
  for (const p of [...list.filter(main), ...list.filter((p) => !main(p))]) {
    const want = programPhoto(p)
    const pick = !used.has(want) ? want : PHOTO_POOL.find((x) => !used.has(x)) ?? want
    used.add(pick)
    photos.set(p.id, pick)
  }
  return (
    <Dark id="program" className="py-16 lg:py-24">
      <Glow className="-right-40 top-1/3 size-[26rem]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2></Reveal>
        <div className="mt-14 space-y-20">
          {list.map((p, i) => {
            const open = s.batches.filter((b) => b.programId === p.id && b.status === 'open').length
            const subjects = catalogSubjects(s, p.id).slice(0, 4).map((x) => x.name)
            const points = subjects.length ? subjects : [`${p.durationHours} jam pelatihan`, open ? `${open} angkatan sedang dibuka` : 'Angkatan baru segera dibuka', 'Magang dan penempatan kerja']
            return (
              <div key={p.id} className="grid items-center gap-10 lg:grid-cols-2">
                <Reveal className={i % 2 ? 'lg:order-2' : ''}>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">{p.category}</p>
                  <h3 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{p.title}</h3>
                  <p className="mt-4 max-w-lg leading-relaxed text-brand-100/80">{p.shortDesc}</p>
                  <ul className="mt-6 space-y-3">
                    {points.map((t) => <li key={t} className="flex items-center gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"><IconCheck size={14} /></span>{t}</li>)}
                  </ul>
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Link to={`/program/${p.slug}`} className="lp-outline">Selengkapnya <IconArrowRight size={16} /></Link>
                    <span className="text-sm text-brand-200">Biaya {rupiah(p.price)}</span>
                  </div>
                </Reveal>
                <Reveal delay={0.1} className={`relative ${i % 2 ? 'lg:order-1' : ''}`}>
                  <div aria-hidden className="absolute -inset-4 rounded-[2.5rem] bg-brand-500/20 blur-2xl" />
                  <img src={photos.get(p.id)} alt={`Peserta program ${p.title}`} loading="lazy" className={`relative h-auto w-full rounded-[2rem] border border-white/10 object-contain shadow-2xl`} />
                </Reveal>
              </div>
            )
          })}
        </div>
      </div>
    </Dark>
  )
}

/**
 * Kegiatan di landing page: kegiatan CHI Today yang ditandai Super Admin "Tampil di beranda".
 * Bila belum ada yang ditandai, foto cadangan di isian section yang dipakai.
 */
function Gallery({ c }: { c: Section['content'] }) {
  const chi = useStore((s) => s.chiToday)
  const featured = chi.filter((x) => x.published && x.featured)
    .sort((a, b) => a.sort - b.sort || (b.eventDate || b.createdAt).localeCompare(a.eventDate || a.createdAt))
    .slice(0, Number(c.limit) || 6)
  const items: any[] = featured.length
    ? featured.map((x) => ({ imageId: x.imageId, src: x.imageSrc, caption: x.title, tag: x.tag, to: `/chi-today/${x.slug}` }))
    : (c.items || []).filter((i: any) => i.imageId || i.src)
  if (!items.length) return null
  // Pola petak per 6 foto (4 kolom): foto pertama 2x2, foto ke-4 sampai ke-6 melebar dua kolom, sehingga tiap baris penuh.
  // Di ponsel 2 kolom: foto pertama selebar layar, foto terakhir melebar bila jumlah sisanya ganjil.
  const span = (i: number) => [
    i % 6 === 0 ? 'col-span-2 lg:row-span-2' : i % 6 >= 3 ? 'lg:col-span-2' : '',
    i > 0 && i === items.length - 1 && (items.length - 1) % 2 === 1 ? 'col-span-2' : '',
  ].join(' ')
  return (
    <Dark id="kegiatan" className="py-16 lg:py-24">
      <Glow className="-left-40 bottom-0 size-[26rem]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2>{c.subtitle && <p className="mx-auto mt-4 max-w-2xl text-center text-brand-100/80">{c.subtitle}</p>}</Reveal>
        <div className="mt-12 grid auto-rows-[13rem] grid-cols-2 gap-3 sm:auto-rows-[14rem] sm:gap-4 lg:grid-cols-4">
          {items.map((it: any, i: number) => {
            const inner = <>
              <img src={imgSrc(it.imageId, it.src)} alt={it.caption || 'Kegiatan peserta'} loading="lazy" className="size-full bg-brand-950/60 object-contain transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-linear-to-t from-brand-950/90 via-brand-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                {it.tag && <span className="mb-2 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur">{it.tag}</span>}
                {it.caption && <p className="text-xs font-semibold leading-snug sm:text-sm">{it.caption}</p>}
              </div>
            </>
            return (
              <Reveal key={i} delay={(i % 4) * 0.06} className={`group relative overflow-hidden rounded-3xl border border-white/10 ${span(i)}`}>
                {it.to ? <Link to={it.to} className="block size-full" aria-label={it.caption}>{inner}</Link> : inner}
              </Reveal>
            )
          })}
        </div>
        <div className="mt-10 text-center"><Link to="/chi-today" className="lp-outline">Lihat semua di CHI Today <IconArrowRight size={16} /></Link></div>
      </div>
    </Dark>
  )
}

function Upcoming({ c }: { c: Section['content'] }) {
  const s = useStore((x) => x)
  const list = s.batches.filter((b) => b.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, c.limit || 4)
  return (
    <Dark className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2></Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {list.length === 0 && <p className="lp-glass p-8 text-center text-sm text-brand-100/80 md:col-span-2">Belum ada angkatan yang dibuka.</p>}
          {list.map((b, i) => {
            const p = s.programs.find((x) => x.id === b.programId)!
            const left = b.quota - seatsTaken(s, b.id)
            const pct = Math.min(100, Math.round(((b.quota - left) / Math.max(1, b.quota)) * 100))
            return (
              <Reveal key={b.id} delay={i * 0.06}>
                <div className="lp-glass p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-lg font-bold">{p.title}</p><p className="text-sm text-brand-200">{b.code} · mulai {dateID(b.startDate)}{b.location ? ` · ${b.location}` : ''}</p></div>
                    <Link to={`/daftar?batch=${b.id}`} className="lp-pill !min-h-9 !px-4">Daftar</Link>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-200" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-2 text-xs text-brand-100/80">{left > 0 ? `Sisa ${left} dari ${b.quota} kursi` : 'Kuota penuh'}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </Dark>
  )
}

function Benefits({ c }: { c: Section['content'] }) {
  return (
    <Dark className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2></Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {(c.items || []).map((it: any, i: number) => (
            <Reveal key={i} delay={i * 0.1} className="lp-glass p-6 transition hover:-translate-y-1 hover:bg-white/10">
              <p className="lp-gradient text-5xl font-extrabold">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-3 text-lg font-bold">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-100/80">{it.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </Dark>
  )
}

function Faq({ c }: { c: Section['content'] }) {
  return (
    <Dark className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2></Reveal>
        <div className="mt-10 space-y-3">
          {(c.items || []).map((it: any, i: number) => (
            <details key={i} className="lp-glass group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex min-h-8 cursor-pointer items-center justify-between gap-4 font-semibold">
                {it.q}<IconPlus size={18} className="shrink-0 transition duration-300 group-open:rotate-45" />
              </summary>
              <p className="mt-2 animate-fade text-sm leading-relaxed text-brand-100/80">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Dark>
  )
}

function CtaBlock({ c }: { c: Section['content'] }) {
  return (
    <Dark className="px-4 py-12 sm:px-6">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-linear-to-br from-brand-600 via-brand-500 to-brand-700">
        <div className="grid items-stretch md:grid-cols-[1fr_auto]">
          <div className="px-8 py-12 sm:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{c.title}</h2>
            <p className="mt-3 max-w-xl text-brand-50/90">{c.body}</p>
            <div className="mt-7"><Cta href={c.href || '/daftar'}>{c.label} <IconArrowRight size={18} /></Cta></div>
          </div>
          <img src={imgSrc(c.imageId, c.photoSrc || '/landing/peserta-putra.jpg')} alt="" loading="lazy" className="hidden h-full max-h-80 w-72 object-cover object-top [mask-image:linear-gradient(to_right,transparent,black_45%)] md:block" />
        </div>
      </Reveal>
    </Dark>
  )
}

function Contact({ c }: { c: Section['content'] }) {
  const st = useStore((s) => s.settings)
  return (
    <Dark id="kontak" className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2></Reveal>
        <Reveal delay={0.1} className="mt-10 grid gap-4 md:grid-cols-2">
          <ul className="lp-glass space-y-4 p-6 text-sm">
            <li className="flex gap-3"><IconMapPin className="shrink-0 text-brand-200" size={20} />{st.address}</li>
            <li className="flex gap-3"><IconClock className="shrink-0 text-brand-200" size={20} />{st.hours}</li>
            <li className="flex gap-3"><IconPhone className="shrink-0 text-brand-200" size={20} />{st.phone}</li>
          </ul>
          <a href={`https://wa.me/${st.whatsapp}`} target="_blank" rel="noreferrer" className="lp-glass flex items-center gap-4 p-6 transition hover:bg-white/10">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-brand-700"><IconBrandWhatsapp size={30} /></span>
            <span><span className="block text-lg font-bold">Tanya lewat WhatsApp</span><span className="text-sm text-brand-200">Jam layanan: {st.hours}</span></span>
          </a>
        </Reveal>
      </div>
    </Dark>
  )
}

/** Profil lembaga (menu Profil). Data resmi seperti nomor izin dan ketua diambil dari Pengaturan. */
function About({ c }: { c: Section['content'] }) {
  const st = useStore((s) => s.settings)
  const points: string[] = (c.items || []).map((i: any) => i.text).filter(Boolean)
  const facts = [
    st.ketuaName && ['Ketua LPK', st.ketuaName],
    st.lpkRegNo && ['Nomor izin LPK', st.lpkRegNo],
    st.campusNote && ['Lokasi', st.campusNote],
  ].filter(Boolean) as [string, string][]
  return (
    <Dark id="profil" className="py-16 lg:py-24">
      <Glow className="-left-40 top-10 size-[24rem]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          {c.tagline && <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">{c.tagline}</p>}
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">{c.title}</h2>
          <p className="mt-5 whitespace-pre-line leading-relaxed text-brand-100/80">{c.body}</p>
          {points.length > 0 && (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {points.map((t) => <li key={t} className="flex items-start gap-3 text-sm"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"><IconCheck size={14} /></span>{t}</li>)}
            </ul>
          )}
        </Reveal>
        <Reveal delay={0.1} className="relative">
          <div aria-hidden className="absolute -inset-4 rounded-[2.5rem] bg-brand-500/20 blur-2xl" />
          <img src={imgSrc(c.imageId, c.photoSrc || '/landing/siap-mendunia.jpg')} alt={c.imageAlt || 'Peserta Cimahi Hotel Institute'} loading="lazy" className="relative h-auto w-full rounded-[2rem] border border-white/10 object-contain" />
          {facts.length > 0 && (
            <dl className="lp-glass relative -mt-10 ml-4 mr-4 grid gap-3 p-5 text-sm sm:ml-8 sm:mr-8">
              {facts.map(([k, v]) => <div key={k} className="flex flex-wrap justify-between gap-x-4"><dt className="text-brand-200">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
            </dl>
          )}
        </Reveal>
      </div>
    </Dark>
  )
}

/** Struktur organisasi: kartu tiap jabatan. Nama yang belum diisi tidak ditampilkan. */
function Organization({ c }: { c: Section['content'] }) {
  const items = (c.items || []).filter((i: any) => i.position?.trim() && i.name?.trim())
  if (!items.length) return null
  const [head, ...rest] = items
  const card = (it: any, big = false) => (
    <div className={`lp-glass flex flex-col items-center p-5 text-center ${big ? 'sm:min-w-72' : ''}`}>
      {it.imageId
        ? <img src={`/api/media/${it.imageId}`} alt={it.name} loading="lazy" className={`${big ? 'size-24' : 'size-20'} rounded-full border-2 border-white/20 object-cover`} />
        : <span className={`${big ? 'size-24 text-3xl' : 'size-20 text-2xl'} grid place-items-center rounded-full bg-linear-to-br from-brand-200 to-brand-600 font-extrabold text-brand-950`} aria-hidden>{it.name.trim().slice(0, 1).toUpperCase()}</span>}
      <p className={`mt-4 font-bold ${big ? 'text-lg' : ''}`}>{it.name}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-brand-200">{it.position}</p>
    </div>
  )
  return (
    <Dark id="struktur" className="py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2>{c.subtitle && <p className="mx-auto mt-4 max-w-2xl text-center text-brand-100/80">{c.subtitle}</p>}</Reveal>
        <Reveal delay={0.05} className="mt-12 flex justify-center">{card(head, true)}</Reveal>
        {rest.length > 0 && <>
          <div aria-hidden className="mx-auto h-8 w-px bg-white/20" />
          <div aria-hidden className="mx-auto hidden h-px max-w-3xl bg-white/20 sm:block" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((it: any, i: number) => <Reveal key={i} delay={0.1 + (i % 4) * 0.05}>{card(it)}</Reveal>)}
          </div>
        </>}
      </div>
    </Dark>
  )
}

/** Lokasi: peta Google Maps dan alamat dari Pengaturan. */
function Location({ c }: { c: Section['content'] }) {
  const st = useStore((s) => s.settings)
  const query = c.mapQuery || st.address || st.campusNote || ''
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  return (
    <Dark id="lokasi" className="py-16 lg:py-24">
      <Glow className="-right-40 top-1/4 size-[24rem]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2>{c.subtitle && <p className="mx-auto mt-4 max-w-2xl text-center text-brand-100/80">{c.subtitle}</p>}</Reveal>
        <div className="mt-12 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Reveal className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
            {query && <iframe title={`Peta lokasi ${st.name}`} src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-80 w-full lg:h-full lg:min-h-96" />}
          </Reveal>
          <Reveal delay={0.1} className="lp-glass flex flex-col gap-5 p-6 text-sm">
            {st.campusNote && <p className="text-lg font-bold">{st.campusNote}</p>}
            <p className="flex gap-3"><IconMapPin className="shrink-0 text-brand-200" size={20} />{st.address}</p>
            {st.hours && <p className="flex gap-3"><IconClock className="shrink-0 text-brand-200" size={20} />{st.hours}</p>}
            {st.phone && <p className="flex gap-3"><IconPhone className="shrink-0 text-brand-200" size={20} />{st.phone}</p>}
            <div className="mt-auto flex flex-wrap gap-3 pt-2">
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="lp-pill">Buka di Google Maps <IconArrowUpRight size={16} /></a>
              {st.whatsapp && <a href={`https://wa.me/${st.whatsapp}`} target="_blank" rel="noreferrer" className="lp-outline"><IconBrandWhatsapp size={18} />WhatsApp</a>}
            </div>
          </Reveal>
        </div>
      </div>
    </Dark>
  )
}

const SOCIAL: Record<string, { label: string; icon: typeof IconWorld }> = {
  instagram: { label: 'Instagram', icon: IconBrandInstagram }, tiktok: { label: 'TikTok', icon: IconBrandTiktok },
  youtube: { label: 'YouTube', icon: IconBrandYoutube }, facebook: { label: 'Facebook', icon: IconBrandFacebook },
  whatsapp: { label: 'WhatsApp', icon: IconBrandWhatsapp }, website: { label: 'Website', icon: IconWorld }, email: { label: 'Email', icon: IconMail },
}
/** Media sosial: kartu tautan ke tiap akun. */
function Social({ c }: { c: Section['content'] }) {
  const items = (c.items || []).filter((i: any) => /^(https:\/\/|mailto:)\S+$/.test(i.url?.trim() ?? ''))
  if (!items.length) return null
  return (
    <Dark id="media-sosial" className="py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2>{c.subtitle && <p className="mx-auto mt-4 max-w-2xl text-center text-brand-100/80">{c.subtitle}</p>}</Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it: any, i: number) => {
            const p = SOCIAL[(it.platform || '').toLowerCase()] ?? SOCIAL.website
            const Icon = p.icon
            return (
              <Reveal key={i} delay={(i % 3) * 0.06}>
                <a href={it.url} target="_blank" rel="noreferrer" className="lp-glass group flex items-center gap-4 p-5 transition hover:-translate-y-1 hover:bg-white/10">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-brand-700 transition group-hover:scale-105"><Icon size={28} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-wider text-brand-200">{p.label}</span><span className="block truncate font-semibold">{it.handle || it.url}</span></span>
                  <IconArrowUpRight size={18} className="shrink-0 text-brand-200 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </Reveal>
            )
          })}
        </div>
      </div>
    </Dark>
  )
}

function Testimonials({ c }: { c: Section['content'] }) {
  const items = (c.items || []).filter((i: any) => i.quote?.trim())
  if (!items.length) return null
  return (
    <Dark className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><h2 className="lp-h2">{c.title}</h2></Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {items.map((t: any, i: number) => (
            <Reveal key={i} delay={i * 0.08}>
              <figure className="lp-glass h-full p-6">
                <blockquote className="leading-relaxed text-brand-50">“{t.quote}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 text-sm">
                  <span className="grid size-10 place-items-center rounded-full bg-linear-to-br from-brand-200 to-brand-600 font-bold text-brand-950">{(t.name || '?').slice(0, 1).toUpperCase()}</span>
                  <span><b className="block">{t.name}</b><span className="text-brand-200">{t.role}</span></span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </Dark>
  )
}

function Announcement({ c }: { c: Section['content'] }) {
  const inner = <>{c.text}{c.href && <span className="ml-2 underline">Selengkapnya</span>}</>
  return <div className="bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white">{c.href ? (isExternal(c.href) ? <a href={c.href} target="_blank" rel="noreferrer">{inner}</a> : <Link to={c.href}>{inner}</Link>) : inner}</div>
}

export function SectionView({ section }: { section: Section }) {
  const c = section.content
  switch (section.type) {
    case 'hero': return <Hero c={c} />
    case 'marquee': return <Marquee c={c} />
    case 'stats': return <Stats c={c} />
    case 'programs': return <Programs c={c} />
    case 'gallery': return <Gallery c={c} />
    case 'upcoming_batches': return <Upcoming c={c} />
    case 'benefits': return <Benefits c={c} />
    case 'faq': return <Faq c={c} />
    case 'cta': return <CtaBlock c={c} />
    case 'about': return <About c={c} />
    case 'testimonials': return <Testimonials c={c} />
    case 'contact': return <Contact c={c} />
    case 'organization': return <Organization c={c} />
    case 'location': return <Location c={c} />
    case 'social': return <Social c={c} />
    case 'announcement_bar': return <Announcement c={c} />
    default: return null
  }
}

export const SECTION_LABEL: Record<string, string> = {
  announcement_bar: 'Bilah pengumuman', hero: 'Hero', marquee: 'Strip kata kunci', about: 'Profil', programs: 'Program (otomatis)',
  organization: 'Struktur organisasi (halaman sendiri)', location: 'Lokasi', social: 'Media sosial',
  gallery: 'Kegiatan (dari CHI Today)', upcoming_batches: 'Angkatan dibuka (otomatis)', benefits: 'Keunggulan', testimonials: 'Testimoni',
  stats: 'Statistik (otomatis)', faq: 'FAQ', cta: 'Ajakan bertindak', contact: 'Kontak',
}
