import { IconArrowLeft, IconArrowRight, IconCalendarEvent } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Reveal, dateID } from '../../components/ui'
import { chiTodayImage, useStore } from '../../lib/store'
import type { ChiTodayItem } from '../../lib/types'
import { PageIntro } from './Public'

/* CHI Today: halaman publik kabar kegiatan Cimahi Hotel Institute. Isinya ditulis Super Admin di menu CHI Today. */

const byDate = (a: ChiTodayItem, b: ChiTodayItem) => (b.eventDate || b.createdAt).localeCompare(a.eventDate || a.createdAt)
const when = (x: ChiTodayItem) => dateID(x.eventDate || x.createdAt)

function useTitle(t: string) {
  useEffect(() => { document.title = `${t} · Cimahi Hotel Institute`; return () => { document.title = 'Cimahi Hotel Institute' } }, [t])
}

function Card({ x, big = false }: { x: ChiTodayItem; big?: boolean }) {
  return (
    <Link to={`/chi-today/${x.slug}`} className={`group lp-glass flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:bg-white/10 ${big ? 'md:flex-row' : ''}`}>
      <div className={`relative overflow-hidden ${big ? 'aspect-[16/10] md:aspect-auto md:h-96 md:w-3/5 md:shrink-0' : 'aspect-[16/10]'}`}>
        {chiTodayImage(x) ? <img src={chiTodayImage(x, !big)} alt={x.title} loading="lazy" className="size-full bg-brand-950/60 object-contain transition duration-700 group-hover:scale-105" />
          : <div className="grid size-full place-items-center bg-linear-to-br from-brand-600 to-brand-900 text-2xl font-extrabold">CHI Today</div>}
        {x.tag && <span className="absolute left-3 top-3 rounded-full bg-brand-950/70 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur">{x.tag}</span>}
      </div>
      <div className={`flex flex-1 flex-col p-5 ${big ? 'md:justify-center md:p-8' : ''}`}>
        <p className="flex items-center gap-1.5 text-xs text-brand-200"><IconCalendarEvent size={14} />{when(x)}</p>
        <h2 className={`mt-2 font-bold leading-snug ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{x.title}</h2>
        {x.summary && <p className={`mt-2 text-sm leading-relaxed text-brand-100/80 ${big ? '' : 'line-clamp-3'}`}>{x.summary}</p>}
        <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-brand-200 group-hover:text-white">Baca selengkapnya <IconArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
      </div>
    </Link>
  )
}

export function ChiTodayPage() {
  useTitle('CHI Today')
  const all = useStore((s) => s.chiToday).filter((x) => x.published).sort(byDate)
  const tags = [...new Set(all.map((x) => x.tag).filter(Boolean))]
  const [tag, setTag] = useState('')
  const list = all.filter((x) => !tag || x.tag === tag)
  const [first, ...rest] = list
  const chip = (v: string, label: string) => (
    <button key={label} type="button" aria-pressed={tag === v} onClick={() => setTag(v)}
      className={`min-h-9 rounded-full border px-4 text-sm font-semibold transition ${tag === v ? 'border-white bg-white text-brand-900' : 'border-white/20 text-brand-100 hover:bg-white/10'}`}>{label}</button>
  )
  return (
    <>
      <PageIntro label="CHI Today" trail={[]} />
      <section className="relative overflow-hidden bg-brand-950 pb-20 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-40 top-0 size-[28rem] rounded-full bg-brand-500/20 blur-[110px]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">CHI <span className="lp-gradient">Today</span></h1>
            <p className="mt-3 max-w-2xl text-brand-100/80">Kabar kegiatan peserta dan Cimahi Hotel Institute: praktik, magang, kunjungan industri, dan acara lainnya.</p>
          </Reveal>
          {tags.length > 1 && <div className="mt-8 flex flex-wrap gap-2" aria-label="Filter label">{chip('', 'Semua')}{tags.map((t) => chip(t, t))}</div>}
          {!first ? <p className="lp-glass mt-10 p-10 text-center text-brand-100/80">Belum ada kegiatan yang diterbitkan.</p> : <>
            <Reveal className="mt-10"><Card x={first} big /></Reveal>
            {rest.length > 0 && <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{rest.map((x, i) => <Reveal key={x.id} delay={(i % 3) * 0.06}><Card x={x} /></Reveal>)}</div>}
          </>}
        </div>
      </section>
    </>
  )
}

export function ChiTodayDetail() {
  const { slug } = useParams()
  const all = useStore((s) => s.chiToday).filter((x) => x.published)
  const x = all.find((n) => n.slug === slug)
  useTitle(x?.title ?? 'CHI Today')
  if (!x) return (
    <><PageIntro label="Tidak ditemukan" trail={[{ label: 'CHI Today', to: '/chi-today' }]} />
      <div className="bg-brand-950 px-4 py-24 text-center text-white"><p className="font-semibold">Kegiatan tidak ditemukan atau belum diterbitkan.</p><Link to="/chi-today" className="lp-outline mt-6">Kembali ke CHI Today</Link></div></>
  )
  const others = all.filter((n) => n.id !== x.id).sort(byDate).slice(0, 3)
  return (
    <>
      <PageIntro label={x.title} trail={[{ label: 'CHI Today', to: '/chi-today' }]} />
      <article className="bg-brand-950 pb-16 text-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-brand-200">
              {x.tag && <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white">{x.tag}</span>}
              <span className="flex items-center gap-1.5"><IconCalendarEvent size={16} />{when(x)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{x.title}</h1>
            {x.summary && <p className="mt-4 text-lg leading-relaxed text-brand-100/90">{x.summary}</p>}
          </Reveal>
        </div>
        {chiTodayImage(x) && (
          <Reveal className="mx-auto mt-8 max-w-4xl px-4 sm:px-6">
            <img src={chiTodayImage(x)} alt={x.title} className="h-auto w-full rounded-[2rem] border border-white/10 object-contain" />
          </Reveal>
        )}
        {x.body && (
          <div className="mx-auto mt-8 max-w-3xl space-y-4 px-4 leading-relaxed text-brand-50/90 sm:px-6">
            {x.body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
          </div>
        )}
        <div className="mx-auto mt-10 max-w-3xl px-4 sm:px-6"><Link to="/chi-today" className="lp-outline"><IconArrowLeft size={16} />Semua kegiatan</Link></div>
      </article>
      {others.length > 0 && (
        <section className="border-t border-white/10 bg-brand-950 py-14 text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-extrabold tracking-tight">Kegiatan lainnya</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{others.map((n) => <Card key={n.id} x={n} />)}</div>
          </div>
        </section>
      )}
    </>
  )
}
