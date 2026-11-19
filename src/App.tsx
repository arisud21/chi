import { Navigate, Route, Routes } from 'react-router-dom'
import { OnlyRoles, RequireRole } from './components/AppShell'
import { ToastProvider } from './components/ui'
import { useStore } from './lib/store'
import { Belajar, MataKuliah } from './pages/peserta/Belajar'
import { Laporan } from './pages/peserta/Laporan'
import { DataDiri } from './pages/peserta/DataDiri'
import { Magang } from './pages/peserta/Magang'
import { Tahapan } from './pages/peserta/Tahapan'
import { Notifikasi, UjianSaya } from './pages/peserta/Ujian'
import { Biaya, UjianAdmin } from './pages/staff/Penerimaan'
import { CekStatus, ForgotPassword, Login, Register, ResetPassword } from './pages/public/Auth'
import { ChiTodayDetail, ChiTodayPage } from './pages/public/ChiToday'
import { Landing, ProfilPage, ProgramDetail, ProgramPage, PublicLayout, StrukturPage } from './pages/public/Public'
import { LandingEditor } from './pages/staff/LandingEditor'
import { ChiTodayAdmin } from './pages/staff/ChiToday'
import { Absensi } from './pages/staff/Absensi'
import { Jadwal } from './pages/staff/Jadwal'
import { MataPelajaran } from './pages/staff/MataPelajaran'
import { Pertemuan } from './pages/staff/Pertemuan'
import { EditDataPeserta, PesertaDidik, PesertaList, Pendaftar } from './pages/staff/PesertaAdmin'
import { RincianBayar, RincianPendaftaran } from './pages/staff/Tagihan'
import { Berita } from './pages/staff/Berita'
import { Penempatan } from './pages/staff/Penempatan'
import { BobotSkala } from './pages/staff/BobotSkala'
import { ValidasiNilai } from './pages/staff/ValidasiNilai'
import { SuratKelulusan } from './pages/staff/SuratKelulusan'
import { ArsipNilai } from './pages/staff/ArsipNilai'
import { TranskripAkhir } from './pages/staff/TranskripAkhir'
import { ManajemenKas } from './pages/staff/ManajemenKas'
import { DashboardKas } from './pages/staff/DashboardKas'
import { TranskripSaya } from './pages/peserta/TranskripAkhir'
import { Audit, Dashboard, EmailQueue, Nilai, Pembayaran, Pengaturan, Pengguna, ProgramAdmin } from './pages/staff/Staff'

/** Rincian dari menu Pendaftar: admin keuangan melihat biaya pendaftaran saja; peran lain tetap melihat rincian lengkap. */
function RincianPendaftar() {
  const role = useStore((s) => s.users.find((u) => u.id === s.sessionUserId)?.role)
  return role === 'admin_keuangan' ? <RincianPendaftaran /> : <RincianBayar />
}

export default function App() {
  const loaded = useStore((s) => s.loaded)
  if (!loaded) return <div className="grid min-h-dvh place-items-center text-sm text-muted" role="status">Memuat…</div>
  return (
    <ToastProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="program/:slug" element={<ProgramDetail />} />
          <Route path="profil" element={<ProfilPage />} />
          <Route path="struktur-organisasi" element={<StrukturPage />} />
          <Route path="program-pelatihan" element={<ProgramPage />} />
          <Route path="chi-today" element={<ChiTodayPage />} />
          <Route path="chi-today/:slug" element={<ChiTodayDetail />} />
          <Route path="cek-status" element={<CekStatus />} />
          {/* Tautan lama "Cek sertifikat" (landing page, QR di sertifikat lama) diarahkan ke cek status peserta. */}
          <Route path="verifikasi/*" element={<Navigate to="/cek-status" replace />} />
          <Route path="masuk" element={<Login />} />
          <Route path="daftar" element={<Register />} />
          <Route path="lupa-password" element={<ForgotPassword />} />
          <Route path="atur-ulang" element={<ResetPassword />} />
        </Route>
        <Route path="app" element={<RequireRole staff={false} />}>
          <Route index element={<Tahapan />} />
          <Route path="ujian" element={<UjianSaya />} />
          <Route path="notifikasi" element={<Notifikasi />} />
          <Route path="data-diri" element={<DataDiri />} />
          <Route path="belajar" element={<Belajar />} />
          <Route path="laporan" element={<Laporan />} />
          <Route path="belajar/:batchId/:subjectId" element={<MataKuliah />} />
          <Route path="magang" element={<Magang />} />
          <Route path="transkrip" element={<TranskripSaya />} />
        </Route>
        <Route path="admin" element={<RequireRole staff />}>
          <Route index element={<Dashboard />} />
          <Route path="program" element={<ProgramAdmin />} />
          <Route path="pendaftar" element={<Pendaftar />} />
          <Route path="pendaftar/:regId" element={<OnlyRoles roles={['super_admin', 'admin_keuangan']}><RincianPendaftar /></OnlyRoles>} />
          <Route path="peserta-didik/:regId" element={<OnlyRoles roles={['super_admin', 'admin_keuangan']}><RincianBayar /></OnlyRoles>} />
          <Route path="peserta" element={<PesertaList />} />
          <Route path="peserta-didik" element={<OnlyRoles roles={['super_admin', 'admin_keuangan']}><PesertaDidik /></OnlyRoles>} />
          <Route path="surat" element={<SuratKelulusan />} />
          <Route path="penempatan" element={<OnlyRoles roles={['super_admin', 'akademik']}><Penempatan /></OnlyRoles>} />
          <Route path="berita" element={<Berita />} />
          <Route path="peserta/:userId/data" element={<EditDataPeserta />} />
          <Route path="email" element={<EmailQueue />} />
          <Route path="pembayaran" element={<OnlyRoles roles={['super_admin', 'admin_keuangan']}><Pembayaran /></OnlyRoles>} />
          <Route path="biaya" element={<Biaya />} />
          <Route path="ujian" element={<UjianAdmin />} />
          <Route path="absensi" element={<Absensi />} />
          <Route path="mapel" element={<MataPelajaran />} />
          <Route path="jadwal" element={<Jadwal />} />
          <Route path="pertemuan" element={<OnlyRoles roles={['instruktur']}><Pertemuan /></OnlyRoles>} />
          <Route path="nilai" element={<OnlyRoles roles={['instruktur']}><Nilai /></OnlyRoles>} />
          <Route path="arsip-nilai" element={<OnlyRoles roles={['instruktur']}><ArsipNilai /></OnlyRoles>} />
          <Route path="transkrip-akhir" element={<OnlyRoles roles={['super_admin', 'akademik']}><TranskripAkhir /></OnlyRoles>} />
          <Route path="kas" element={<OnlyRoles roles={['super_admin', 'admin_keuangan']}><ManajemenKas /></OnlyRoles>} />
          <Route path="dashboard-kas" element={<OnlyRoles roles={['super_admin', 'admin_keuangan']}><DashboardKas /></OnlyRoles>} />
          <Route path="validasi-nilai" element={<OnlyRoles roles={['super_admin', 'akademik']}><ValidasiNilai /></OnlyRoles>} />
          <Route path="bobot-nilai" element={<OnlyRoles roles={['super_admin', 'akademik']}><BobotSkala /></OnlyRoles>} />
          <Route path="landing" element={<LandingEditor />} />
          <Route path="chi-today" element={<OnlyRoles roles={['super_admin']}><ChiTodayAdmin /></OnlyRoles>} />
          <Route path="pengguna" element={<Navigate to="/admin/pengguna/pengelola" replace />} />
          <Route path="pengguna/pengelola" element={<OnlyRoles roles={['super_admin']}><Pengguna kind="pengelola" /></OnlyRoles>} />
          <Route path="pengguna/siswa" element={<OnlyRoles roles={['super_admin']}><Pengguna kind="siswa" /></OnlyRoles>} />
          <Route path="audit" element={<Audit />} />
          <Route path="pengaturan" element={<Pengaturan />} />
        </Route>
        <Route path="*" element={<div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-display text-3xl font-bold">Halaman tidak ditemukan</p><a href="/" className="btn-primary mt-4">Ke beranda</a></div></div>} />
      </Routes>
    </ToastProvider>
  )
}
