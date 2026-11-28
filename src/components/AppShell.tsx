import {
  IconBell, IconBuildingStore, IconBook2, IconCoin, IconPencilCheck, IconChecklist, IconCreditCard, IconHistory, IconHome,
  IconAward, IconArchive, IconCalendarEvent, IconCash, IconChartAreaLine, IconFiles, IconNews, IconIdBadge2, IconLayoutDashboard, IconLogout, IconMail, IconMenu2, IconPhoto, IconScale, IconSchool, IconSettings, IconUsers, IconWorld, IconX, IconListDetails,
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { DOC_KINDS, changePassword, logout, markNewsRead, photoOf, stopImpersonate, useStore } from '../lib/store'
import { ROLE_LABEL, type Role } from '../lib/types'
import { Field, Logo, Modal, PasswordInput, useAct } from './ui'

interface NavItem { to: string; label: string; icon: ComponentType<{ size?: number }>; roles: Role[]; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const ALL_STAFF: Role[] = ['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur']

const STAFF_NAV: NavGroup[] = [
  { title: 'Ringkasan', items: [
    { to: '/admin', label: 'Dashboard', icon: IconLayoutDashboard, roles: ALL_STAFF, end: true },
    { to: '/admin/data-diri', label: 'Data diri', icon: IconIdBadge2, roles: ['instruktur'] },
    { to: '/admin/berita', label: 'Berita', icon: IconNews, roles: ['super_admin', 'admin_pendaftaran'] },
  ] },
  { title: 'Pendaftaran', items: [
    { to: '/admin/program', label: 'Program dan angkatan', icon: IconBook2, roles: ['super_admin', 'admin_pendaftaran'] },
    { to: '/admin/ujian', label: 'Ujian online', icon: IconPencilCheck, roles: ['super_admin', 'admin_pendaftaran'] },
    { to: '/admin/pendaftar', label: 'Pendaftar', icon: IconListDetails, roles: ['super_admin', 'admin_pendaftaran', 'admin_keuangan'] },
    { to: '/admin/peserta', label: 'Peserta didik', icon: IconUsers, roles: ['super_admin', 'admin_pendaftaran', 'akademik'] },
    { to: '/admin/peserta-didik', label: 'Pembayaran peserta didik', icon: IconSchool, roles: ['super_admin', 'admin_keuangan'] },
    { to: '/admin/penempatan', label: 'Penempatan magang dan kerja', icon: IconBuildingStore, roles: ['super_admin', 'akademik'] },
    { to: '/admin/surat', label: 'Surat kelulusan', icon: IconFiles, roles: ['super_admin', 'admin_pendaftaran'] },
    { to: '/admin/email', label: 'Pengumuman dan email', icon: IconMail, roles: ['super_admin', 'admin_pendaftaran', 'instruktur'] },
  ] },
  { title: 'Keuangan', items: [
    { to: '/admin/pembayaran', label: 'Verifikasi pembayaran', icon: IconCreditCard, roles: ['super_admin', 'admin_keuangan'] },
    { to: '/admin/biaya', label: 'Biaya dan cicilan', icon: IconCoin, roles: ['super_admin', 'admin_keuangan'] },
    { to: '/admin/dashboard-kas', label: 'Dashboard kas', icon: IconChartAreaLine, roles: ['super_admin', 'admin_keuangan'] },
    { to: '/admin/kas', label: 'Manajemen kas', icon: IconCash, roles: ['super_admin', 'admin_keuangan'] },
  ] },
  { title: 'Akademik', items: [
    { to: '/admin/mapel', label: 'Bank mata pelajaran', icon: IconBook2, roles: ['super_admin', 'akademik'] },
    { to: '/admin/jadwal', label: 'Jadwal pembelajaran', icon: IconCalendarEvent, roles: ['super_admin', 'akademik'] },
    { to: '/admin/pertemuan', label: 'Pertemuan dan materi', icon: IconFiles, roles: ['instruktur'] },
    { to: '/admin/absensi', label: 'Absensi dan berita acara', icon: IconUsers, roles: ['super_admin', 'akademik', 'instruktur'] },
    { to: '/admin/nilai', label: 'Input nilai akhir', icon: IconChecklist, roles: ['instruktur'] },
    { to: '/admin/arsip-nilai', label: 'Arsip nilai', icon: IconArchive, roles: ['instruktur'] },
    { to: '/admin/validasi-nilai', label: 'Validasi nilai', icon: IconChecklist, roles: ['super_admin', 'akademik'] },
    { to: '/admin/bobot-nilai', label: 'Bobot dan skala nilai', icon: IconScale, roles: ['super_admin', 'akademik'] },
    { to: '/admin/transkrip-akhir', label: 'Transkrip akhir pelatihan', icon: IconAward, roles: ['super_admin', 'akademik'] },
  ] },
  { title: 'Situs', items: [
    { to: '/admin/landing', label: 'Landing page', icon: IconWorld, roles: ['super_admin', 'admin_pendaftaran'] },
    { to: '/admin/chi-today', label: 'CHI Today', icon: IconPhoto, roles: ['super_admin'] },
  ] },
  { title: 'Sistem', items: [
    { to: '/admin/pengguna/pengelola', label: 'Akun pengelola', icon: IconUsers, roles: ['super_admin'] },
    { to: '/admin/pengguna/siswa', label: 'Akun siswa', icon: IconSchool, roles: ['super_admin'] },
    { to: '/admin/audit', label: 'Audit log', icon: IconHistory, roles: ['super_admin'] },
    { to: '/admin/pengaturan', label: 'Pengaturan', icon: IconSettings, roles: ['super_admin'] },
  ] },
]

const PESERTA_NAV: NavGroup[] = [
  { title: 'Menu', items: [
    { to: '/app', label: 'Tahapan', icon: IconHome, roles: ['peserta'], end: true },
    { to: '/app/ujian', label: 'Ujian online', icon: IconPencilCheck, roles: ['peserta'] },
    { to: '/app/data-diri', label: 'Data diri', icon: IconIdBadge2, roles: ['peserta'] },
    { to: '/app/belajar', label: 'Ruang belajar', icon: IconSchool, roles: ['peserta'] },
    { to: '/app/laporan', label: 'Laporan', icon: IconChecklist, roles: ['peserta'] },
    { to: '/app/magang', label: 'Magang dan kerja', icon: IconBuildingStore, roles: ['peserta'] },
    { to: '/app/transkrip', label: 'Transkrip akhir', icon: IconAward, roles: ['peserta'] },
    { to: '/app/notifikasi', label: 'Notifikasi', icon: IconBell, roles: ['peserta'] },
  ] },
]

/** Halaman staf yang hanya untuk role tertentu; role lain diarahkan ke Dashboard (mis. lewat tautan lama atau URL yang diketik). */
export function OnlyRoles({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const role = useStore((s) => s.users.find((u) => u.id === s.sessionUserId)?.role)
  if (!role || !roles.includes(role)) return <Navigate to="/admin" replace />
  return <>{children}</>
}

export function RequireRole({ staff }: { staff: boolean }) {
  const uid = useStore((s) => s.sessionUserId)
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))
  const loc = useLocation()
  if (!uid || !user) return <Navigate to="/masuk" state={{ from: loc.pathname }} replace />
  if (staff && user.role === 'peserta') return <Navigate to="/app" replace />
  if (!staff && user.role !== 'peserta') return <Navigate to="/admin" replace />
  return <Shell staff={staff} />
}

function ForceChange({ email: current, canEmail }: { email: string; canEmail: boolean }) {
  const act = useAct()
  const [em, setEm] = useState(current)
  const [o, setO] = useState('')
  const [n, setN] = useState('')
  return (
    <Modal open title="Ganti password sekarang" onClose={() => {}}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(changePassword(o, n, canEmail ? em : undefined), 'Password diganti.') }}>
        <p className="text-sm text-muted">Akun Anda memakai password sementara. Ganti dulu sebelum melanjutkan.</p>
        <Field label="Password sementara"><PasswordInput required value={o} onChange={(e) => setO(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Password baru" hint="Minimal 8 karakter."><PasswordInput required minLength={8} value={n} onChange={(e) => setN(e.target.value)} autoComplete="new-password" /></Field>
        {canEmail && <Field label="Email" hint="Email ini diisi oleh admin. Anda hanya dapat mengubahnya satu kali. Biarkan bila sudah benar; kesempatan ini tetap ada di menu Data diri sampai email diganti."><input className="input" type="email" required value={em} onChange={(e) => setEm(e.target.value)} autoComplete="email" /></Field>}
        <button className="btn-primary w-full">Simpan</button>
      </form>
    </Modal>
  )
}

/**
 * Popup notifikasi yang masuk secara realtime. Notifikasi yang sudah ada saat aplikasi dibuka tidak dimunculkan lagi;
 * hanya yang tiba sesudahnya. Tidak memblokir halaman, hilang sendiri dalam 15 detik, dan tetap ada di menu Notifikasi.
 */
function LiveNotifications() {
  const notifs = useStore((s) => s.notifications)
  const loaded = useStore((s) => s.loaded)
  const nav = useNavigate()
  const seen = useRef<Set<string> | null>(null)
  const [toasts, setToasts] = useState<{ id: string; title: string; body: string; link: string }[]>([])
  useEffect(() => {
    if (!loaded) return
    if (seen.current === null) { seen.current = new Set(notifs.map((n) => n.id)); return }
    const fresh = notifs.filter((n) => !seen.current!.has(n.id) && !n.read)
    notifs.forEach((n) => seen.current!.add(n.id))
    if (fresh.length) setToasts((t) => [...fresh.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link })), ...t].slice(0, 3))
  }, [notifs, loaded])
  useEffect(() => {
    if (!toasts.length) return
    const timer = setTimeout(() => setToasts((t) => t.slice(0, -1)), 15_000)
    return () => clearTimeout(timer)
  }, [toasts])
  if (!toasts.length) return null
  const drop = (id: string) => setToasts((t) => t.filter((x) => x.id !== id))
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:top-5" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto rounded-xl border border-line bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2"><IconBell size={18} className="mt-0.5 shrink-0 text-brand-600" /><p className="text-sm font-bold">{t.title}</p></div>
            <button className="btn-ghost !min-h-8 !px-1.5" aria-label="Tutup notifikasi" onClick={() => drop(t.id)}><IconX size={16} /></button>
          </div>
          <p className="mt-1 line-clamp-4 text-sm text-muted">{t.body}</p>
          {t.link && <button className="btn-primary mt-3 !min-h-9" onClick={() => { drop(t.id); nav(t.link) }}>Lihat</button>}
        </div>
      ))}
    </div>
  )
}

/** Popup berita. Tampil di halaman mana pun, termasuk saat berita baru tiba secara realtime. Ditutup berarti sudah dibaca (dicatat di server), lalu berita berikutnya tampil. */
function NewsPopup() {
  // Selector harus mengembalikan nilai yang stabil: array hasil filter baru di tiap render membuat React berputar tanpa henti.
  const news = useStore((s) => s.news)
  const [skipped, setSkipped] = useState<string[]>([]) // sudah ditutup di sesi ini, sambil menunggu server mencatat
  const list = useMemo(() => news.filter((n) => n.eligible && !n.read && !skipped.includes(n.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [news, skipped])
  const cur = list[0]
  const close = () => { if (!cur) return; setSkipped((x) => [...x, cur.id]); markNewsRead(cur.id) }
  return (
    <Modal open={!!cur} title={cur?.title ?? ''} onClose={close}>
      {cur && (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{cur.body}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{list.length > 1 ? `${list.length} berita belum dibaca` : 'Berita terbaru'}</p>
            <button className="btn-primary" onClick={close}>{list.length > 1 ? 'Tutup, berita berikutnya' : 'Tutup'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

const LOCKED_MENUS = ['/app/belajar', '/app/laporan', '/app/magang']
/** Menu Transkrip akhir hanya ada bagi peserta yang sudah lulus dan lunas (kelulusan sempurna). */
const GRADUATE_MENUS = ['/app/transkrip']

function Shell({ staff }: { staff: boolean }) {
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))!
  const impersonator = useStore((s) => s.impersonatedBy)
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length)
  const photo = useStore((s) => (s.sessionUserId ? photoOf(s, s.sessionUserId) : ''))
  const registeredAgain = useStore((s) => s.registrations.some((r) => r.stage === 'aktif'))
  // Ruang belajar dan magang baru terbuka setelah registrasi ulang terkonfirmasi dan kelima berkas terunggah.
  const unlocked = useStore((s) => s.registrations.some((r) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed')) && DOC_KINDS.every((k) => s.documents.some((d) => d.kind === k)))
  const graduated = useStore((s) => s.registrations.some((r) => r.status === 'completed' && s.grades.some((g) => g.registrationId === r.id && g.status === 'validated' && g.passed)))
  const groups = (staff ? STAFF_NAV : PESERTA_NAV)
    // Setelah registrasi ulang, menu Ujian tulis tidak diperlukan lagi.
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role) && !(!staff && registeredAgain && i.to === '/app/ujian') && !(!staff && !unlocked && LOCKED_MENUS.includes(i.to)) && !(!staff && !graduated && GRADUATE_MENUS.includes(i.to))).map((i) => (!staff && registeredAgain && i.to === '/app' ? { ...i, label: 'Beranda' } : i)) }))
    .filter((g) => g.items.length)

  const loc = useLocation()
  const allowed = groups.flatMap((g) => g.items.map((i) => i.to))
  if (!allowed.some((t) => loc.pathname === t || (t !== '/admin' && t !== '/app' && loc.pathname.startsWith(t + '/')))) {
    return <Navigate to={staff ? '/admin' : '/app'} replace />
  }

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Menu utama">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link to="/"><Logo /></Link>
        <button className="btn-ghost !min-h-10 !px-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><IconX size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title} className="mt-4">
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</p>
            {g.items.map((i) => (
              <NavLink
                key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
                className={({ isActive }) => `group relative mb-0.5 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-ink hover:bg-brand-50'}`}
              >
                <i.icon size={19} />{i.label}
                {i.to === '/app/notifikasi' && unread > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-brand-100 px-1.5 text-xs font-bold text-brand-700" aria-label={`${unread} belum dibaca`}>{unread}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <button className="btn-ghost w-full justify-start" onClick={async () => { await logout(); nav('/') }}>
          <IconLogout size={18} /> Keluar
        </button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 animate-fade bg-brand-900/40" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      {user.mustChange && <ForceChange email={user.email} canEmail={!!user.emailChangeable} />}
      <div className="lg:pl-64">
        {impersonator && (
          <div role="status" className="relative z-30 flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 sm:px-6">
            <span>Anda masuk sebagai instruktur <b>{user.name}</b> (akun Super Admin: {impersonator.name}). Perubahan tercatat atas nama instruktur ini.</span>
            <button className="btn-primary !min-h-9" onClick={async () => { await stopImpersonate(); nav('/admin') }}>Kembali ke Super Admin</button>
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="btn-ghost !px-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><IconMenu2 size={20} /></button>
          <div className="hidden text-sm text-muted lg:block">{staff ? 'Panel pengelola' : 'Portal peserta'}</div>
          <div className="flex items-center gap-3">
            {!staff && <Link to="/app/notifikasi" className="btn-ghost relative !px-2.5" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}><IconBell size={20} />{unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">{unread}</span>}</Link>}
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
            </div>
            {photo
              ? <img src={`/api/files/${photo}`} alt={`Foto ${user.name}`} className="size-10 rounded-full object-cover ring-2 ring-brand-100" />
              : <span className="grid size-10 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{user.name.slice(0, 1)}</span>}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><NewsPopup /><LiveNotifications /><Outlet /></main>
      </div>
    </div>
  )
}
