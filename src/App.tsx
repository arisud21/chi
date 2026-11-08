import { Route, Routes } from 'react-router-dom'
import { RequireRole } from './components/AppShell'
import { ToastProvider } from './components/ui'
import { useStore } from './lib/store'
import { Belajar, SertifikatSaya } from './pages/peserta/Belajar'
import { DataDiri } from './pages/peserta/DataDiri'
import { Beranda, Katalog, Pendaftaran } from './pages/peserta/Peserta'
import { ForgotPassword, Login, Register, ResetPassword, Verify, VerifyEmailPage } from './pages/public/Auth'
import { Landing, ProgramDetail, PublicLayout } from './pages/public/Public'
import { LandingEditor } from './pages/staff/LandingEditor'
import { Absensi } from './pages/staff/Absensi'
import { TemplateEditor } from './pages/staff/Akademik'
import { Jadwal } from './pages/staff/Jadwal'
import { MataPelajaran } from './pages/staff/MataPelajaran'
import { Pertemuan } from './pages/staff/Pertemuan'
import { PesertaList, Pendaftar } from './pages/staff/PesertaAdmin'
import { Audit, Dashboard, EmailQueue, Nilai, Pembayaran, Pengaturan, Pengguna, ProgramAdmin, SertifikatAdmin } from './pages/staff/Staff'

export default function App() {
  const loaded = useStore((s) => s.loaded)
  if (!loaded) return <div className="grid min-h-dvh place-items-center text-sm text-muted" role="status">Memuat…</div>
  return (
    <ToastProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="program/:slug" element={<ProgramDetail />} />
          <Route path="verifikasi" element={<Verify />} />
          <Route path="verifikasi/:code" element={<Verify />} />
          <Route path="masuk" element={<Login />} />
          <Route path="daftar" element={<Register />} />
          <Route path="lupa-password" element={<ForgotPassword />} />
          <Route path="atur-ulang" element={<ResetPassword />} />
          <Route path="verifikasi-email" element={<VerifyEmailPage />} />
        </Route>
        <Route path="app" element={<RequireRole staff={false} />}>
          <Route index element={<Beranda />} />
          <Route path="katalog" element={<Katalog />} />
          <Route path="pendaftaran" element={<Pendaftaran />} />
          <Route path="data-diri" element={<DataDiri />} />
          <Route path="belajar" element={<Belajar />} />
          <Route path="sertifikat" element={<SertifikatSaya />} />
        </Route>
        <Route path="admin" element={<RequireRole staff />}>
          <Route index element={<Dashboard />} />
          <Route path="program" element={<ProgramAdmin />} />
          <Route path="pendaftar" element={<Pendaftar />} />
          <Route path="peserta" element={<PesertaList />} />
          <Route path="email" element={<EmailQueue />} />
          <Route path="pembayaran" element={<Pembayaran />} />
          <Route path="absensi" element={<Absensi />} />
          <Route path="mapel" element={<MataPelajaran />} />
          <Route path="jadwal" element={<Jadwal />} />
          <Route path="pertemuan" element={<Pertemuan />} />
          <Route path="template" element={<TemplateEditor />} />
          <Route path="nilai" element={<Nilai />} />
          <Route path="sertifikat" element={<SertifikatAdmin />} />
          <Route path="landing" element={<LandingEditor />} />
          <Route path="pengguna" element={<Pengguna />} />
          <Route path="audit" element={<Audit />} />
          <Route path="pengaturan" element={<Pengaturan />} />
        </Route>
        <Route path="*" element={<div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-display text-3xl font-bold">Halaman tidak ditemukan</p><a href="/" className="btn-primary mt-4">Ke beranda</a></div></div>} />
      </Routes>
    </ToastProvider>
  )
}
