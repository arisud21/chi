import {
  IconAlertCircle, IconArrowRight, IconCalendarEvent, IconCash, IconChecklist, IconClipboardList, IconCreditCard, IconHourglass,
  IconReceipt, IconSchool, IconUserCheck, IconUsers,
} from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { BarList, ColumnChart, DashHeader, Donut, Kpi, KpiRow, Panel, Progress, TrackerTable, lastMonths, monthOf, rupiahShort, type Datum } from '../../components/dash'
import { Badge, CountUp, Empty, dateID, rupiah } from '../../components/ui'
import { photoOf, seatsTaken, teachesBatch, unattendedSessions, useStore, type State } from '../../lib/store'
import { ROLE_LABEL, type Role, type User } from '../../lib/types'
import { DashboardAkademik } from './DashboardAkademik'
import { InfografisKeuangan } from './InfografisKeuangan'
import { PantauInstruktur } from './PantauInstruktur'

type Todo = { to: string; n: number; label: string }

/** Daftar "Perlu tindakan": tiap baris menuju menu tempat tugas itu diselesaikan. */
export function TodoPanel({ todo, className = '' }: { todo: Todo[]; className?: string }) {
  const open = todo.filter((t) => t.n > 0).length
  return (
    <Panel title="Perlu tindakan" sub={open ? `${open} jenis tugas menunggu` : 'Semua beres'} className={className}>
      {todo.length === 0 ? <p className="text-sm text-muted">Tidak ada tugas untuk role ini.</p> : (
        <ul className="space-y-1.5">
          {todo.map((t, i) => (
            <li key={i}><Link to={t.to} className={`group flex min-h-12 items-center gap-3 rounded-lg border-l-4 px-3 py-2 transition hover:bg-brand-50 ${t.n ? 'border-l-amber-500 bg-amber-50/50' : 'border-l-line bg-canvas'}`}>
              <b className={`w-9 shrink-0 text-xl tabular-nums ${t.n ? 'text-brand-700' : 'text-muted'}`}><CountUp to={t.n} /></b>
              <span className="min-w-0 flex-1 text-sm">{t.label}</span>
              <IconArrowRight size={16} className="shrink-0 text-muted group-hover:text-brand-600" />
            </Link></li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Tugas yang perlu ditindaklanjuti per role. */
function todosFor(s: State, me: User): Todo[] {
  const R = (...a: Role[]) => a
  const toFill = s.batchSubjects.filter((bs) => bs.instructorId === me.id && !s.subjectGrades.some((x) => x.subjectId === bs.subjectId && x.status !== 'draft' && s.registrations.some((r) => r.id === x.registrationId && r.batchId === bs.batchId))).length
  const toValidate = new Set(s.subjectGrades.filter((x) => x.status === 'submitted').map((x) => `${s.registrations.find((r) => r.id === x.registrationId)?.batchId}|${x.subjectId}`)).size
  const submitted = s.payments.filter((p) => p.status === 'submitted')
  const list: (Todo & { role: Role[] })[] = [
    { role: R('super_admin'), to: '/admin/pembayaran', n: submitted.length, label: 'bukti pembayaran menunggu verifikasi' },
    { role: R('admin_keuangan'), to: '/admin/pendaftar?bayar=submitted', n: submitted.filter((p) => p.kind === 'pendaftaran').length, label: 'bukti pembayaran pendaftaran menunggu verifikasi' },
    { role: R('admin_keuangan'), to: '/admin/pembayaran', n: submitted.filter((p) => p.kind !== 'pendaftaran').length, label: 'bukti registrasi ulang dan cicilan menunggu verifikasi' },
    { role: R('super_admin', 'admin_pendaftaran'), to: '/admin/ujian?tab=hasil', n: s.registrations.filter((r) => r.stage === 'menunggu_hasil').length, label: 'pendaftar selesai ujian dan menunggu keputusan lulus' },
    { role: R('super_admin', 'admin_pendaftaran'), to: '/admin/pendaftar?status=registrasi_ulang', n: s.registrations.filter((r) => r.stage === 'registrasi_ulang' && r.status === 'pending_payment').length, label: 'pendaftar lulus yang belum registrasi ulang' },
    { role: R('instruktur'), to: '/admin/data-diri', n: staffMissing(s, me), label: 'isian data diri yang belum lengkap (identitas, pas foto, CV)' },
    { role: R('instruktur'), to: '/admin/absensi', n: unattendedSessions(s, me.id).length, label: 'pertemuan belum diisi absensinya (pertemuan baru tidak bisa ditambah sebelum diisi)' },
    { role: R('instruktur'), to: '/admin/nilai', n: toFill, label: 'mata pelajaran yang nilainya belum disetor ke Akademik' },
    { role: R('super_admin', 'akademik'), to: '/admin/validasi-nilai', n: toValidate, label: 'mata pelajaran menunggu validasi nilai' },
  ]
  return list.filter((t) => t.role.includes(me.role))
}

/** Jumlah isian wajib data diri instruktur yang masih kosong. */
function staffMissing(s: State, me: User) {
  const p = s.staffProfiles.find((x) => x.userId === me.id)
  return [me.nik, me.birthDate, me.phone, p?.birthPlace, p?.gender, p?.marital, p?.religion, p?.address, p?.photoFileId, p?.cvFileId].filter((v) => !v).length
}

/** Pemasukan terverifikasi per bulan (enam bulan terakhir), menurut tanggal transfer. */
function revenueByMonth(s: State, to: string): Datum[] {
  const ver = s.payments.filter((p) => p.status === 'verified')
  return lastMonths().map((m) => {
    const v = ver.filter((p) => monthOf(p.transferDate || p.createdAt) === m.key).reduce((t, p) => t + p.amountPaid, 0)
    return { key: m.key, label: m.label, value: v, to, tip: `${m.label}: ${rupiah(v)} terverifikasi` }
  })
}

const STAGES = [
  ['data', 'Isi data diri'], ['bayar_daftar', 'Bayar pendaftaran'], ['ujian', 'Ujian online'], ['menunggu_hasil', 'Menunggu hasil'],
  ['registrasi_ulang', 'Lulus, belum registrasi ulang'], ['aktif', 'Sudah registrasi ulang'], ['tidak_lulus', 'Tidak lulus'],
] as const

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const todo = todosFor(s, me)
  if (me.role === 'akademik') return <DashboardAkademik todo={<TodoPanel todo={todo} className="xl:col-span-1" />} />
  if (me.role === 'instruktur') return <DashboardInstruktur me={me} todo={todo} />
  if (me.role === 'admin_keuangan') return <DashboardKeuangan todo={todo} />
  return <DashboardPendaftaran me={me} todo={todo} />
}

/** Super Admin dan Admin Pendaftaran: alur penerimaan, angkatan, dan (Super Admin) pemasukan serta pantauan instruktur. */
function DashboardPendaftaran({ me, todo }: { me: User; todo: Todo[] }) {
  const s = useStore((x) => x)
  const isSA = me.role === 'super_admin'
  const live = s.registrations.filter((r) => r.status !== 'expired' && r.status !== 'cancelled')
  const inProcess = live.filter((r) => !['aktif', 'tidak_lulus'].includes(r.stage))
  const thisMonth = monthOf(new Date().toISOString())
  const waitDecision = s.registrations.filter((r) => r.stage === 'menunggu_hasil').length
  const waitReenroll = s.registrations.filter((r) => r.stage === 'registrasi_ulang' && r.status === 'pending_payment').length
  const aktif = s.registrations.filter((r) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed'))
  const openBatches = s.batches.filter((b) => b.status === 'open')
  const seatsOpen = openBatches.reduce((t, b) => t + seatsTaken(s, b.id), 0)
  const quotaOpen = openBatches.reduce((t, b) => t + b.quota, 0)
  const verified = s.payments.filter((p) => p.status === 'verified')
  const revenue = verified.reduce((t, p) => t + p.amountPaid, 0)
  const proofWait = s.payments.filter((p) => p.status === 'submitted').length

  const perMonth: Datum[] = lastMonths().map((m) => {
    const n = s.registrations.filter((r) => monthOf(r.createdAt) === m.key).length
    return { key: m.key, label: m.label, value: n, to: '/admin/pendaftar', tip: `${m.label}: ${n} pendaftar baru` }
  })
  const perStage: Datum[] = STAGES.map(([k, label]) => ({
    key: k, label, to: `/admin/pendaftar?status=${k}`,
    value: s.registrations.filter((r) => r.stage === k && r.status !== 'expired' && (k === 'tidak_lulus' || r.status !== 'cancelled')).length,
  }))
  const perProgram: Datum[] = s.programs.filter((p) => !p.archived).map((p) => {
    const n = aktif.filter((r) => r.programId === p.id).length
    const proc = inProcess.filter((r) => r.programId === p.id).length
    return { key: p.id, label: p.title, value: n, sub: `${proc} pendaftar dalam tahapan`, to: '/admin/peserta', tip: `${p.title}: ${n} peserta didik, ${proc} pendaftar dalam tahapan` }
  }).sort((a, b) => b.value - a.value)
  const tracked = s.batches.filter((b) => b.status === 'open' || b.status === 'running')
    .sort((a, b) => (a.status === b.status ? (a.startDate ?? '').localeCompare(b.startDate ?? '') : a.status === 'open' ? -1 : 1))

  return (
    <>
      <DashHeader title={isSA ? 'Ringkasan operasional' : 'Ringkasan penerimaan'} sub={`${me.name} · ${ROLE_LABEL[me.role]}`} />
      <KpiRow>
        <Kpi to="/admin/pendaftar" icon={IconClipboardList} label="Pendaftar dalam tahapan" value={inProcess.length} note={`${s.registrations.filter((r) => monthOf(r.createdAt) === thisMonth).length} pendaftar baru bulan ini`} />
        <Kpi to="/admin/ujian?tab=hasil" icon={IconHourglass} label="Menunggu keputusan" value={waitDecision} note="Selesai ujian, belum diputuskan" tone={waitDecision ? 'warn' : 'brand'} />
        <Kpi to="/admin/pendaftar?status=registrasi_ulang" icon={IconUserCheck} label="Belum registrasi ulang" value={waitReenroll} note="Sudah lulus seleksi" tone={waitReenroll ? 'warn' : 'brand'} />
        <Kpi to="/admin/peserta" icon={IconSchool} label="Peserta didik" value={aktif.length} note="Sudah registrasi ulang" tone="good" />
        <Kpi to="/admin/program" icon={IconCalendarEvent} label="Angkatan dibuka" value={openBatches.length} note={quotaOpen ? `${seatsOpen} dari ${quotaOpen} kursi terisi` : 'Belum ada kuota'} />
        {isSA && <Kpi to="/admin/dashboard-kas" icon={IconCash} label="Pemasukan terverifikasi" display={rupiah(revenue)} note={`Dari ${verified.length} pembayaran`} tone="good" />}
        {isSA && <Kpi to="/admin/pembayaran" icon={IconCreditCard} label="Bukti menunggu verifikasi" value={proofWait} note="Pendaftaran, registrasi ulang, cicilan" tone={proofWait ? 'warn' : 'brand'} />}
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Pendaftar baru per bulan" sub="Enam bulan terakhir, menurut tanggal registrasi akun." to="/admin/pendaftar" linkLabel="Pendaftar" className="xl:col-span-2">
          <ColumnChart data={perMonth} />
        </Panel>
        <TodoPanel todo={todo} />

        <Panel title="Pendaftar menurut tahap" sub="Klik tahap untuk membuka daftar pendaftarnya." to="/admin/pendaftar" linkLabel="Pendaftar">
          <Donut data={perStage} center={perStage.reduce((t, d) => t + d.value, 0)} centerLabel="registrasi" />
        </Panel>
        <Panel title="Peserta didik per program" sub="Peserta didik yang sudah registrasi ulang." to="/admin/peserta" linkLabel="Peserta didik" className={isSA ? '' : 'xl:col-span-2'}>
          {perProgram.length === 0 ? <Empty title="Belum ada program" body="Program pelatihan muncul di sini setelah dibuat di menu Program dan angkatan." /> : <BarList data={perProgram} />}
        </Panel>
        {isSA && (
          <Panel title="Pemasukan per bulan" sub="Pembayaran terverifikasi, menurut tanggal transfer." to="/admin/dashboard-kas" linkLabel="Dashboard kas">
            <ColumnChart data={revenueByMonth(s, '/admin/dashboard-kas')} format={rupiahShort} />
          </Panel>
        )}

        <Panel title="Angkatan dibuka dan berjalan" sub="Klik baris untuk mengelola angkatan." to="/admin/program" linkLabel="Program dan angkatan" className="xl:col-span-3" flush>
          {tracked.length === 0 ? <Empty title="Tidak ada angkatan dibuka" body="Buat atau buka angkatan di menu Program dan angkatan." /> : (
            <TrackerTable head={['Angkatan', 'Program', 'Mulai', 'Terisi', 'Keterisian', 'Status']} rows={tracked.map((b) => {
              const p = s.programs.find((x) => x.id === b.programId)
              const t = seatsTaken(s, b.id)
              return {
                key: b.id, to: '/admin/program', label: `Kelola angkatan ${b.code}`,
                cells: [b.code, p?.title ?? '-', b.startDate ? dateID(b.startDate) : '-', <span className="tabular-nums">{t}/{b.quota}</span>, <Progress value={t} max={b.quota} warn={t > b.quota} />, <Badge status={b.status} />],
              }
            })} />
          )}
        </Panel>
        {isSA && <PantauInstruktur />}
      </div>
    </>
  )
}

/** Admin Keuangan: bukti yang menunggu, pemasukan, dan infografis pendaftaran serta registrasi ulang. */
function DashboardKeuangan({ todo }: { todo: Todo[] }) {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const sub = s.payments.filter((p) => p.status === 'submitted')
  const verified = s.payments.filter((p) => p.status === 'verified')
  const thisMonth = monthOf(new Date().toISOString())
  const monthRev = verified.filter((p) => monthOf(p.transferDate || p.createdAt) === thisMonth).reduce((t, p) => t + p.amountPaid, 0)
  const lateInst = s.installments.filter((i) => (i.status === 'unpaid' || i.status === 'partial') && i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10)).length
  return (
    <>
      <DashHeader title="Ringkasan keuangan" sub={`${me.name} · ${ROLE_LABEL[me.role]}`} />
      <KpiRow>
        <Kpi to="/admin/pendaftar?bayar=submitted" icon={IconReceipt} label="Bukti pendaftaran" value={sub.filter((p) => p.kind === 'pendaftaran').length} note="Menunggu verifikasi" tone={sub.some((p) => p.kind === 'pendaftaran') ? 'warn' : 'brand'} />
        <Kpi to="/admin/pembayaran" icon={IconCreditCard} label="Bukti registrasi ulang dan cicilan" value={sub.filter((p) => p.kind !== 'pendaftaran').length} note="Menunggu verifikasi" tone={sub.some((p) => p.kind !== 'pendaftaran') ? 'warn' : 'brand'} />
        <Kpi to="/admin/peserta-didik" icon={IconAlertCircle} label="Cicilan lewat jatuh tempo" value={lateInst} note="Belum lunas" tone={lateInst ? 'warn' : 'good'} />
        <Kpi to="/admin/dashboard-kas" icon={IconCash} label="Pemasukan bulan ini" display={rupiah(monthRev)} note="Pembayaran terverifikasi" tone="good" />
        <Kpi to="/admin/dashboard-kas" icon={IconCash} label="Total pemasukan" display={rupiah(verified.reduce((t, p) => t + p.amountPaid, 0))} note={`Dari ${verified.length} pembayaran`} />
      </KpiRow>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Pemasukan per bulan" sub="Pembayaran terverifikasi, menurut tanggal transfer." to="/admin/dashboard-kas" linkLabel="Dashboard kas" className="xl:col-span-2">
          <ColumnChart data={revenueByMonth(s, '/admin/dashboard-kas')} format={rupiahShort} />
        </Panel>
        <TodoPanel todo={todo} />
        <InfografisKeuangan />
      </div>
    </>
  )
}

/** Instruktur: tugas yang tertunda dan rekap kehadiran tiap angkatan yang diajar. */
function DashboardInstruktur({ me, todo }: { me: User; todo: Todo[] }) {
  const s = useStore((x) => x)
  const mine = s.batches.filter((b) => teachesBatch(s, me.id, b.id) && b.status !== 'draft' && b.status !== 'cancelled')
  const mySubjects = s.batchSubjects.filter((bs) => bs.instructorId === me.id && mine.some((b) => b.id === bs.batchId))
  const planned = mySubjects.reduce((t, bs) => t + bs.sessions, 0)
  const made = mySubjects.reduce((t, bs) => t + s.sessions.filter((x) => x.batchId === bs.batchId && x.subjectId === bs.subjectId).length, 0)
  const unatt = unattendedSessions(s, me.id).length
  const students = new Set(s.registrations.filter((r) => mine.some((b) => b.id === r.batchId) && (r.status === 'active' || r.status === 'completed')).map((r) => r.id)).size
  return (
    <>
      <DashHeader title="Ringkasan mengajar" sub={`${me.name} · ${ROLE_LABEL[me.role]}`} photo={photoOf(s, me.id) ? { src: `/api/files/${photoOf(s, me.id)}`, alt: `Foto ${me.name}`, to: '/admin/data-diri' } : undefined} />
      <KpiRow>
        <Kpi to="/admin/absensi?tab=rekap" icon={IconCalendarEvent} label="Angkatan diajar" value={mine.length} note={`${mySubjects.length} mata pelajaran`} />
        <Kpi to="/admin/absensi?tab=rekap" icon={IconUsers} label="Peserta didik" value={students} note="Di angkatan yang Anda ajar" />
        <Kpi to="/admin/pertemuan" icon={IconClipboardList} label="Pertemuan dibuat" value={made} note={`dari ${planned} pertemuan terjadwal`} />
        <Kpi to="/admin/absensi" icon={IconHourglass} label="Belum diabsen" value={unatt} note="Pertemuan tanpa absensi" tone={unatt ? 'warn' : 'good'} />
        <Kpi to="/admin/nilai" icon={IconChecklist} label="Nilai belum disetor" value={todo.find((t) => t.to === '/admin/nilai')?.n ?? 0} note="Mata pelajaran" tone={todo.find((t) => t.to === '/admin/nilai')?.n ? 'warn' : 'good'} />
      </KpiRow>
      <div className="grid gap-5 xl:grid-cols-3">
        <TodoPanel todo={todo} />
        <RekapKehadiran instructorId={me.id} />
      </div>
    </>
  )
}

/** Rekap kehadiran tiap peserta didik di angkatan yang diajar; baris menuju rekap absensi angkatan itu. */
function RekapKehadiran({ instructorId }: { instructorId: string }) {
  const s = useStore((x) => x)
  const mine = s.batches.filter((b) => teachesBatch(s, instructorId, b.id) && b.status !== 'draft' && b.status !== 'cancelled')
  if (mine.length === 0) return <Panel title="Rekap kehadiran" className="xl:col-span-2"><Empty title="Belum ada angkatan" body="Rekap kehadiran muncul setelah Anda ditetapkan sebagai instruktur sebuah angkatan." /></Panel>
  return (
    <div className="space-y-5 xl:col-span-2">
      {mine.map((b) => {
        const p = s.programs.find((x) => x.id === b.programId)
        const people = s.registrations.filter((r) => r.batchId === b.id && (r.status === 'active' || r.status === 'completed'))
        const regIds = new Set(people.map((r) => r.id))
        const sessions = s.sessions.filter((x) => x.batchId === b.id)
        const rec = s.attendances.filter((a) => regIds.has(a.registrationId) && sessions.some((x) => x.id === a.sessionId))
        const held = new Set(rec.map((a) => a.sessionId)).size
        const min = p?.rules.minAttendance ?? 0
        const to = `/admin/absensi?tab=rekap&batch=${b.id}`
        return (
          <Panel key={b.id} title={`Rekap kehadiran ${b.code}`} sub={`${p?.title ?? ''} · ${held} dari ${sessions.length} pertemuan sudah diabsen · minimal hadir ${min}%`} to={to} linkLabel="Rekap absensi" flush>
            {people.length === 0 ? <Empty title="Belum ada peserta" body="Peserta muncul setelah registrasi ulangnya dikonfirmasi dan ditempatkan di angkatan ini." /> : (
              <TrackerTable head={['Peserta didik', 'NIP', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Kehadiran']} rows={people.map((r) => {
                const mineRec = rec.filter((a) => a.registrationId === r.id)
                const n = (st: string) => mineRec.filter((a) => a.status === st).length
                const pct = held > 0 ? Math.round((n('hadir') / held) * 100) : null
                const low = pct !== null && pct < min
                const name = s.users.find((u) => u.id === r.userId)?.name ?? '-'
                return {
                  key: r.id, to, label: `Rekap absensi ${name}`,
                  cells: [name, <span className="font-mono text-xs">{r.nip ?? '-'}</span>, n('hadir'), n('izin'), n('sakit'), <span className={n('alpa') ? 'font-semibold text-red-700' : ''}>{n('alpa')}</span>,
                    pct === null ? <span className="text-muted">Belum ada absensi</span> : <Progress value={n('hadir')} max={held} warn={low} />],
                }
              })} />
            )}
          </Panel>
        )
      })}
    </div>
  )
}
