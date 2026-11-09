import {
  IconAward, IconBell, IconBook2, IconCoin, IconPencilCheck, IconCertificate, IconChecklist, IconCreditCard, IconHistory, IconHome,
  IconCalendarEvent, IconFiles, IconIdBadge2, IconLayoutDashboard, IconLogout, IconMail, IconMenu2, IconPalette, IconSchool, IconSettings, IconUsers, IconWorld, IconX, IconListDetails,
} from '@tabler/icons-react'
import { useState, type ComponentType } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { changePassword, logout, useStore } from '../lib/store'
import { ROLE_LABEL, type Role } from '../lib/types'
import { Field, Logo, Modal, PasswordInput, useAct } from './ui'

interface NavItem { to: string; label: string; icon: ComponentType<{ size?: number }>; roles: Role[]; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const ALL_STAFF: Role[] = ['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur']

const STAFF_NAV: NavGroup[] = [
  { title: 'Ringkasan', items: [
    { to: '/admin', label: 'Dashboard', icon: IconLayoutDashboard, roles: ALL_STAFF, end: true },
  ] },
  { title: 'Pendaftaran', items: [
    { to: '/admin/program', label: 'Program dan angkatan', icon: IconBook2, roles: ['super_admin', 'admin_pendaftaran'] },
    { to: '/admin/ujian', label: 'Ujian tulis', icon: IconPencilCheck, roles: ['super_admin', 'admin_pendaftaran', 'akademik'] },
    { to: '/admin/pendaftar', label: 'Pendaftar', icon: IconListDetails, roles: ['super_admin', 'admin_pendaftaran', 'admin_keuangan'] },
    { to: '/admin/peserta', label: 'Peserta', icon: IconUsers, roles: ['super_admin', 'admin_pendaftaran', 'akademik'] },
    { to: '/admin/email', label: 'Pengumuman dan email', icon: IconMail, roles: ['super_admin', 'admin_pendaftaran', 'instruktur'] },
  ] },
  { title: 'Keuangan', items: [
    { to: '/admin/pembayaran', label: 'Verifikasi pembayaran', icon: IconCreditCard, roles: ['super_admin', 'admin_keuangan', 'admin_pendaftaran'] },
    { to: '/admin/biaya', label: 'Biaya dan cicilan', icon: IconCoin, roles: ['super_admin', 'admin_keuangan'] },
  ] },
  { title: 'Akademik', items: [
    { to: '/admin/mapel', label: 'Bank mata pelajaran', icon: IconBook2, roles: ['super_admin', 'akademik'] },
    { to: '/admin/jadwal', label: 'Jadwal angkatan', icon: IconCalendarEvent, roles: ['super_admin', 'akademik'] },
    { to: '/admin/pertemuan', label: 'Pertemuan dan materi', icon: IconFiles, roles: ['super_admin', 'instruktur'] },
    { to: '/admin/absensi', label: 'Absensi', icon: IconUsers, roles: ['super_admin', 'instruktur'] },
    { to: '/admin/nilai', label: 'Nilai dan kelulusan', icon: IconChecklist, roles: ['super_admin', 'akademik', 'instruktur'] },
    { to: '/admin/sertifikat', label: 'Sertifikat', icon: IconCertificate, roles: ['super_admin', 'akademik'] },
    { to: '/admin/template', label: 'Template sertifikat', icon: IconPalette, roles: ['super_admin', 'akademik'] },
  ] },
  { title: 'Situs', items: [
    { to: '/admin/landing', label: 'Landing page', icon: IconWorld, roles: ['super_admin', 'admin_pendaftaran'] },
  ] },
  { title: 'Sistem', items: [
    { to: '/admin/pengguna', label: 'Pengguna', icon: IconUsers, roles: ['super_admin'] },
    { to: '/admin/audit', label: 'Audit log', icon: IconHistory, roles: ['super_admin'] },
    { to: '/admin/pengaturan', label: 'Pengaturan', icon: IconSettings, roles: ['super_admin'] },
  ] },
]

const PESERTA_NAV: NavGroup[] = [
  { title: 'Menu', items: [
    { to: '/app', label: 'Tahapan', icon: IconHome, roles: ['peserta'], end: true },
    { to: '/app/ujian', label: 'Ujian tulis', icon: IconPencilCheck, roles: ['peserta'] },
    { to: '/app/data-diri', label: 'Data diri', icon: IconIdBadge2, roles: ['peserta'] },
    { to: '/app/belajar', label: 'Ruang belajar', icon: IconSchool, roles: ['peserta'] },
    { to: '/app/sertifikat', label: 'Sertifikat', icon: IconAward, roles: ['peserta'] },
    { to: '/app/notifikasi', label: 'Notifikasi', icon: IconBell, roles: ['peserta'] },
  ] },
]

export function RequireRole({ staff }: { staff: boolean }) {
  const uid = useStore((s) => s.sessionUserId)
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))
  const loc = useLocation()
  if (!uid || !user) return <Navigate to="/masuk" state={{ from: loc.pathname }} replace />
  if (staff && user.role === 'peserta') return <Navigate to="/app" replace />
  if (!staff && user.role !== 'peserta') return <Navigate to="/admin" replace />
  return <Shell staff={staff} />
}

function ForceChange() {
  const act = useAct()
  const [o, setO] = useState('')
  const [n, setN] = useState('')
  return (
    <Modal open title="Ganti password sekarang" onClose={() => {}}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(changePassword(o, n), 'Password diganti.') }}>
        <p className="text-sm text-muted">Akun Anda memakai password sementara. Ganti dulu sebelum melanjutkan.</p>
        <Field label="Password sementara"><PasswordInput required value={o} onChange={(e) => setO(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Password baru" hint="Minimal 8 karakter."><PasswordInput required minLength={8} value={n} onChange={(e) => setN(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn-primary w-full">Simpan</button>
      </form>
    </Modal>
  )
}

function Shell({ staff }: { staff: boolean }) {
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId))!
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length)
  const registeredAgain = useStore((s) => s.registrations.some((r) => r.stage === 'aktif'))
  const groups = (staff ? STAFF_NAV : PESERTA_NAV)
    // Setelah registrasi ulang, menu Ujian tulis tidak diperlukan lagi.
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role) && !(!staff && registeredAgain && i.to === '/app/ujian')).map((i) => (!staff && registeredAgain && i.to === '/app' ? { ...i, label: 'Beranda' } : i)) }))
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
      {user.mustChange && <ForceChange />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="btn-ghost !px-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><IconMenu2 size={20} /></button>
          <div className="hidden text-sm text-muted lg:block">{staff ? 'Panel pengelola' : 'Portal peserta'}</div>
          <div className="flex items-center gap-3">
            {!staff && <Link to="/app/notifikasi" className="btn-ghost relative !px-2.5" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}><IconBell size={20} />{unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">{unread}</span>}</Link>}
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
            </div>
            <span className="grid size-10 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><Outlet /></main>
      </div>
    </div>
  )
}
