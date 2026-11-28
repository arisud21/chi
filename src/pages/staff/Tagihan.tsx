import { IconArrowLeft, IconBellRinging, IconCheck, IconDiscount, IconDownload, IconFileText, IconPencil, IconTrash, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge, Empty, Field, KIND_LABEL, Modal, MoneyInput, PageHeader, Table, dateID, rupiah, useAct, useToast } from '../../components/ui'
import { billMessage, discountsFor, itemsFor, regFeeFor, shortfallOf, summarize, type Summary } from '../../lib/billing'
import { exportPesertaDidikXlsx, exportRincianSiswaXlsx } from '../../lib/exportKeuangan'
import { AngkatanFilter, angkatanKe, cocokAngkatan, useAngkatan } from '../../lib/angkatan'
import { WaButton } from '../../lib/wa'
import { cancelManualPayment, deleteDiscount, recordPayment, recordRegFee, rejectPayment, remindPayment, saveDiscount, setPlanAdmin, useStore, verifyPayment } from '../../lib/store'

const FILTERS: [Summary | 'all', string][] = [['all', 'Semua'], ['due', 'Ada tagihan'], ['confirm', 'Menunggu konfirmasi'], ['paid', 'Lunas'], ['later', 'Belum jatuh tempo']]

function useRemind() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const remind = async (ids: string[]) => {
    setBusy(true)
    const res = await remindPayment(ids)
    setBusy(false)
    if (!res.ok) return toast(res.error, 'err')
    const d = res.data as { sent: number; skipped: number }
    toast(`${d.sent} pengingat terkirim ke akun peserta dan email.${d.skipped ? ` ${d.skipped} dilewati (tidak ada tagihan, atau sudah diingatkan dalam 6 jam terakhir).` : ''}`, d.sent ? 'ok' : 'err')
  }
  return { remind, busy }
}

/** Pembayaran per peserta: apa yang sudah dan belum dibayar, plus pengumuman tagihan ke akun peserta. */
export function Tagihan({ onlyActive = false }: { onlyActive?: boolean }) {
  const s = useStore((x) => x)
  const nav = useNavigate()
  const { remind, busy } = useRemind()
  const toast = useToast()
  const [f, setF] = useState<Summary | 'all'>('all')
  const [q, setQ] = useState('')

  const allRows = s.registrations.map((r) => {
    const items = itemsFor(s, r)
    return { r, user: s.users.find((u) => u.id === r.userId), prog: s.programs.find((p) => p.id === r.programId), items, ke: angkatanKe(s, r), ...summarize(items) }
  }).filter((x) => x.user && (onlyActive ? x.r.stage === 'aktif' && (x.r.status === 'active' || x.r.status === 'completed') : (x.r.status === 'pending_payment' || x.r.status === 'active' || x.r.stage === 'tidak_lulus')))
  const [angkatan, setAngkatan] = useAngkatan()
  const rows = allRows.filter((x) => cocokAngkatan(angkatan, x.ke))
  const shown = rows
    .filter((x) => f === 'all' || x.status === f)
    .filter((x) => !q.trim() || x.user!.name.toLowerCase().includes(q.toLowerCase()) || (x.user!.nik ?? '').includes(q.trim()))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
  const dueRows = shown.filter((x) => x.status === 'due')
  const totals = shown.reduce((t, x) => ({ total: t.total + x.total, paid: t.paid + x.paid, rest: t.rest + x.rest }), { total: 0, paid: 0, rest: 0 })

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {([['Total tagihan', totals.total, 'text-ink'], ['Sudah dibayar', totals.paid, 'text-emerald-700'], ['Belum dibayar', totals.rest, 'text-amber-800']] as const).map(([label, n, cls]) => (
          <div key={label} className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{rupiah(n)}</p></div>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted">Total hanya menghitung tagihan yang nominalnya sudah pasti. Registrasi ulang dan cicilan baru terhitung setelah peserta lulus dan memilih paket.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Cari nama atau NIK" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" />
        <AngkatanFilter values={allRows.map((x) => x.ke)} value={angkatan} onChange={setAngkatan} />
        <select className="input !w-auto" value={f} onChange={(e) => setF(e.target.value as Summary | 'all')} aria-label="Filter pembayaran">
          {FILTERS.map(([k, label]) => <option key={k} value={k}>{label} ({k === 'all' ? rows.length : rows.filter((x) => x.status === k).length})</option>)}
        </select>
        <span className="flex-1" />
        {onlyActive && <button className="btn-ghost" disabled={shown.length === 0} onClick={() => { const n = exportPesertaDidikXlsx(s, shown); toast(`Excel diunduh: ${n.peserta} peserta didik, ${n.pembayaran} catatan pembayaran registrasi.`, 'ok') }}><IconDownload size={18} />Export Excel</button>}
        <button className="btn-primary" disabled={busy || dueRows.length === 0} onClick={() => remind(dueRows.map((x) => x.r.id))}><IconBellRinging size={18} />Umumkan ke {dueRows.length} yang ada tagihan</button>
      </div>

      {shown.length === 0 ? <div className="card"><Empty title="Tidak ada data pembayaran" body="Belum ada pendaftar, atau tidak ada yang cocok dengan filter ini." /></div> : (
        <Table head={['Peserta didik', 'Program', 'Tagihan', 'Dibayar', 'Sisa', 'Status', '']}>
          {shown.map(({ r, user, prog, total, paid, rest, status }) => (
            <tr key={r.id}>
              <td><p className="font-semibold">{user!.name}</p><p className="font-mono text-xs text-muted">{r.code}</p>
                {r.source === 'admin' && <p className="text-xs font-semibold text-brass-600">Impor · dicatat keuangan{s.batches.find((b) => b.id === r.batchId)?.freeRegFee ? ' · bebas biaya pendaftaran' : ''}</p>}
                <DiscountChip regId={r.id} /></td>
              <td>{prog?.title}</td>
              <td className="tabular-nums">{rupiah(total)}</td>
              <td className="tabular-nums text-emerald-700">{rupiah(paid)}</td>
              <td className={`tabular-nums ${rest > 0 ? 'font-semibold text-amber-800' : ''}`}>{rupiah(rest)}</td>
              <td><div className="flex flex-wrap gap-1"><Badge status={status} />{shortfallOf(s, r.id) > 0 && r.stage === 'aktif' && <Badge status="short" />}</div></td>
              <td className="whitespace-nowrap text-right">
                <WaButton compact phone={user!.phone} label="Kirim WA" text={billMessage(s, r, user!.name)} />{' '}
                {status === 'due' && <button className="btn-ghost !min-h-10" disabled={busy} onClick={() => remind([r.id])} aria-label={`Umumkan tagihan ke ${user!.name}`}><IconBellRinging size={16} />Umumkan</button>}{' '}
                <button className="btn-ghost !min-h-10" onClick={() => nav(onlyActive ? `/admin/peserta-didik/${r.id}` : `/admin/pendaftar/${r.id}`)} aria-label={`Rincian pembayaran ${user!.name}`}>Rincian</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

/** Halaman rincian: dari apa total terdiri, apa saja yang sudah dibayar, dan apa saja yang belum. */
export function RincianBayar() {
  const { regId } = useParams()
  const s = useStore((x) => x)
  const { remind, busy } = useRemind()
  const r = s.registrations.find((x) => x.id === regId)
  const user = s.users.find((u) => u.id === r?.userId)
  if (!r || !user) {
    return <><BackLink /><div className="card"><Empty title="Pendaftar tidak ditemukan" body="Data ini tidak ada atau Anda tidak berhak melihatnya." action={<Link to="/admin/pendaftar" className="btn-primary">Kembali</Link>} /></div></>
  }
  const prog = s.programs.find((p) => p.id === r.programId)
  const batch = s.batches.find((b) => b.id === r.batchId)
  const items = itemsFor(s, r)
  const { total, paid, rest, status } = summarize(items)
  const paidItems = items.filter((i) => i.state === 'paid')
  const openItems = items.filter((i) => i.state !== 'paid')
  const paidTotal = paidItems.reduce((t, i) => t + (i.amount ?? 0), 0)
  const openTotal = openItems.reduce((t, i) => t + (i.amount ?? 0), 0)
  const today = new Date().toISOString().slice(0, 10)

  // Dari apa total terdiri: biaya program + biaya tambahan - potongan (yang dicicil). Biaya pendaftaran ditagih terpisah. Rumus sama dengan server.
  const regDue = regFeeFor(s, r)
  const extras = s.feeItems.filter((x) => x.active && (x.userId ? x.userId === r.userId : (!x.programId || x.programId === r.programId)))
  const price = prog?.price ?? r.priceSnapshot
  const credit = s.payments.filter((p) => p.registrationId === r.id && p.kind === 'pendaftaran' && p.status === 'verified').reduce((t, p) => t + p.amountPaid, 0)
  const cuts = discountsFor(s, r.id)
  const otherCuts = cuts.filter((d) => d.target !== 'pendaftaran')
  const regCut = cuts.filter((d) => d.target === 'pendaftaran').reduce((t, d) => t + d.amount, 0)
  const installTotal = s.installments.filter((i) => i.registrationId === r.id).reduce((t, i) => t + i.amount, 0)
  const hasSchedule = installTotal > 0
  const grand = price + extras.reduce((t, x) => t + x.amount, 0)
  const expectedSchedule = Math.max(0, grand - otherCuts.reduce((t, d) => t + d.amount, 0))
  const drifted = hasSchedule && installTotal !== expectedSchedule

  return (
    <>
      <BackLink />
      <PageHeader title={user.name} sub={`${prog?.title ?? ''} · ${r.code}${batch ? ` · ${batch.code}` : ''}`} action={<div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => exportRincianSiswaXlsx(s, { r, user, items, total, paid, rest, status }, `pembayaran-${(r.nip ?? r.code).replace(/[^\w-]+/g, '-')}-${user.name.trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')}-${today}.xlsx`)}><IconDownload size={18} />Ekspor Excel</button>
        <WaButton phone={user.phone} label="Kirim rincian via WhatsApp" text={billMessage(s, r, user.name)} /><Badge status={status} /></div>} />

      {r.stage === 'aktif' && shortfallOf(s, r.id) > 0 && <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900">Pembayaran registrasi ulang masih kurang {rupiah(shortfallOf(s, r.id))} dari minimal {rupiah(s.settings.minReenroll ?? 1000000)}. Peserta sudah diterima keuangan dan perlu segera melunasi. Gunakan tombol Umumkan untuk mengingatkan.</p>}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {([['Total tagihan', total, 'text-ink'], ['Sudah dibayar', paid, 'text-emerald-700'], ['Belum dibayar', rest, 'text-amber-800']] as const).map(([label, n, cls]) => (
          <div key={label} className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{rupiah(n)}</p></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="sudah" className="card overflow-hidden">
          <header className="flex items-baseline justify-between gap-3 border-b border-line bg-emerald-50 px-5 py-3">
            <h2 id="sudah" className="font-bold text-emerald-900">Sudah dibayar</h2>
            <p className="font-bold tabular-nums text-emerald-800">{rupiah(paidTotal)}</p>
          </header>
          {paidItems.length === 0 ? <p className="p-5 text-sm text-muted">Belum ada pembayaran yang dikonfirmasi.</p> : (
            <ul className="divide-y divide-line">
              {paidItems.map((i) => (
                <li key={i.key} className="px-5 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3"><p className="font-semibold">{i.label}</p><p className="font-semibold tabular-nums">{rupiah(i.amount ?? 0)}</p></div>
                  <p className="mt-0.5 text-xs text-muted">
                    {i.note ?? (i.paidOn ? `Transfer ${dateID(i.paidOn)}` : 'Tanpa catatan transfer')}{i.payer ? ` oleh ${i.payer}` : ''}{i.receipt ? ` · kwitansi ${i.receipt}` : ''}
                  </p>
                  {i.proofFileId && <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 underline" href={`/api/files/${i.proofFileId}`} target="_blank" rel="noreferrer"><IconFileText size={14} />Lihat bukti transfer</a>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="belum" className="card overflow-hidden">
          <header className="flex items-baseline justify-between gap-3 border-b border-line bg-amber-50 px-5 py-3">
            <h2 id="belum" className="font-bold text-amber-900">Belum dibayar</h2>
            <p className="font-bold tabular-nums text-amber-900">{rupiah(openTotal)}</p>
          </header>
          {openItems.length === 0 ? <p className="p-5 text-sm text-muted">Semua tagihan sudah lunas.</p> : (
            <ul className="divide-y divide-line">
              {openItems.map((i) => {
                const late = i.state === 'unpaid' && !!i.due && i.due < today
                return (
                  <li key={i.key} className="px-5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold">{i.label}</p><p className="mt-0.5 text-xs text-muted">{i.amount != null ? '' : 'Nominal ditentukan setelah peserta lulus dan memilih paket pembayaran.'}{i.due ? `Jatuh tempo ${dateID(i.due)}` : ''}{late ? <span className="ml-1 font-semibold text-red-700">· terlambat</span> : null}</p></div>
                      <div className="shrink-0 text-right"><p className="font-semibold tabular-nums">{i.amount != null ? rupiah(i.amount) : '-'}</p><div className="mt-1"><Badge status={i.state} /></div></div>
                    </div>
                    {i.state === 'confirm' && <p className="mt-1 text-xs text-muted">Bukti diunggah{i.paidOn ? ` (transfer ${dateID(i.paidOn)})` : ''}. {i.proofFileId && <a className="font-semibold text-brand-600 underline" href={`/api/files/${i.proofFileId}`} target="_blank" rel="noreferrer">Lihat bukti</a>}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          {status === 'due' && <div className="border-t border-line p-4"><button className="btn-primary w-full" disabled={busy} onClick={() => remind([r.id])}><IconBellRinging size={18} />Umumkan tagihan ke akun peserta</button></div>}
        </section>
      </div>

      {r.source === 'admin' && <PencatatanKeuangan regId={r.id} />}
      <PotonganBiaya regId={r.id} />

      <section className="card mt-6 p-5">
        <h2 className="font-bold">Dari apa total ini terdiri</h2>
        <dl className="mt-3 max-w-xl space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt>Biaya pelatihan {prog?.title}</dt><dd className="tabular-nums">{rupiah(price)}</dd></div>
          {extras.map((x) => <div key={x.id} className="flex justify-between gap-3"><dt>{x.name}</dt><dd className="tabular-nums">{rupiah(x.amount)}</dd></div>)}
          <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold"><dt>Total keseluruhan</dt><dd className="tabular-nums">{rupiah(grand)}</dd></div>
          {otherCuts.map((d) => <div key={d.id} className="flex justify-between gap-3 text-sky-800"><dt>Potongan {d.label.toLowerCase()}</dt><dd className="tabular-nums">- {rupiah(d.amount)}</dd></div>)}
          <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-bold"><dt>Ditagih dan dicicil saat registrasi ulang</dt><dd className="tabular-nums text-brand-700">{rupiah(hasSchedule ? installTotal : expectedSchedule)}</dd></div>
        </dl>
        <p className="mt-3 max-w-xl rounded-lg bg-canvas p-3 text-xs text-muted">Biaya pendaftaran berada di luar tagihan ini: {batch?.freeRegFee ? `dibebaskan untuk angkatan ${batch.code}` : credit ? `sudah dibayar ${rupiah(credit)}` : regDue === 0 ? 'dipotong seluruhnya' : `${rupiah(regDue)}, dibayar terpisah`}{regCut > 0 && !batch?.freeRegFee ? ` (setelah potongan ${rupiah(regCut)})` : ''}.</p>
        {drifted && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Jadwal cicilan peserta ini dihitung dengan biaya saat ia memilih paket. Biaya program atau biaya tambahan sudah berubah sejak itu, sehingga total di atas berbeda dari jadwalnya.</p>}
        {!hasSchedule && <p className="mt-3 text-xs text-muted">Peserta belum memilih paket pembayaran, jadi angka ini perkiraan dari biaya saat ini.</p>}
      </section>
    </>
  )
}

/**
 * Khusus peserta didik yang ditambahkan atau diimpor admin: bagian keuangan menetapkan paket biaya registrasi,
 * mencatat pembayaran yang sudah diterima, dan membatalkan catatan yang salah.
 */
function PencatatanKeuangan({ regId }: { regId: string }) {
  const s = useStore((x) => x)
  const act = useAct()
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const r = s.registrations.find((x) => x.id === regId)!
  const batch = s.batches.find((b) => b.id === r.batchId)
  const today = new Date().toISOString().slice(0, 10)
  const insts = s.installments.filter((i) => i.registrationId === r.id)
  const pays = s.payments.filter((p) => p.registrationId === r.id)
  const regPaid = pays.some((p) => p.kind === 'pendaftaran' && p.status === 'verified')
  const instPaid = pays.some((p) => p.installmentId && (p.status === 'verified' || p.status === 'submitted'))
  const manual = pays.filter((p) => p.note && p.status === 'verified').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const plans = s.plans.filter((p) => p.active && (!p.programId || p.programId === r.programId))
  const regDue = regFeeFor(s, r) // 0 bila angkatannya dibebaskan atau dipotong seluruhnya
  const needReg = regDue > 0 && !regPaid
  const restReg = insts.reduce((t, i) => t + i.amount - i.paidAmount, 0)
  const [planId, setPlanId] = useState('')
  const [f, setF] = useState({ kind: (needReg ? 'pendaftaran' : 'registrasi') as 'pendaftaran' | 'registrasi', amount: 0, transferDate: today, payerName: '', note: '' })
  const [cancel, setCancel] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  if (!me || !['super_admin', 'admin_keuangan'].includes(me.role)) return null
  const kinds = [...(needReg ? [['pendaftaran', `Biaya pendaftaran (${rupiah(regDue)})`] as const] : []), ...(insts.length && restReg > 0 ? [['registrasi', `Biaya registrasi (sisa ${rupiah(restReg)})`] as const] : [])]
  const kind = kinds.some(([k]) => k === f.kind) ? f.kind : kinds[0]?.[0]
  return (
    <section className="card mt-6 p-5" aria-labelledby="catat">
      <h2 id="catat" className="font-bold">Pencatatan keuangan</h2>
      <p className="text-sm text-muted">Peserta didik ini ditambahkan atau diimpor admin, jadi pembayarannya dicatat bagian keuangan.{batch?.freeRegFee ? ` Angkatan ${batch.code} dibebaskan dari biaya pendaftaran; biaya registrasi tetap ditagih penuh.` : ''}</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold">1. Paket biaya registrasi</h3>
          {insts.length > 0 && instPaid
            ? <p className="text-sm">Paket: <b>{s.plans.find((p) => p.id === r.planId)?.name ?? 'sudah ditetapkan'}</b>, {insts.length} termin. Paket tidak bisa diganti karena sudah ada pembayaran.</p>
            : (
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(setPlanAdmin(r.id, planId), 'Paket biaya registrasi ditetapkan. Peserta mendapat notifikasi.', () => setPlanId('')) }}>
                <label className="block min-w-56 flex-1"><span className="label">{insts.length ? 'Ganti paket' : 'Pilih paket'}</span>
                  <select className="input" required value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Pilih paket</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </label>
                <button className="btn-primary" disabled={!planId}>Tetapkan</button>
              </form>
            )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold">2. Catat pembayaran yang sudah diterima</h3>
          {!kind ? <p className="text-sm text-muted">{insts.length ? 'Biaya registrasi sudah lunas.' : 'Tetapkan paket biaya registrasi dulu.'}</p> : (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(recordPayment(r.id, { ...f, kind }), 'Pembayaran dicatat dan kwitansi diterbitkan.', () => setF({ ...f, amount: 0, payerName: '', note: '' })) }}>
              <label className="block sm:col-span-2"><span className="label">Jenis</span><select className="input" value={kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="block"><span className="label">Nominal (Rp)</span><MoneyInput required zeroEmpty value={f.amount} onValue={(n) => setF({ ...f, amount: n })} /></label>
              <label className="block"><span className="label">Tanggal bayar</span><input className="input" type="date" required max={today} value={f.transferDate} onChange={(e) => setF({ ...f, transferDate: e.target.value })} /></label>
              <label className="block"><span className="label">Nama pembayar (opsional)</span><input className="input" value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></label>
              <label className="block"><span className="label">Keterangan (opsional)</span><input className="input" placeholder="mis. Tunai di kantor" maxLength={255} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
              <button className="btn-primary sm:col-span-2" disabled={!f.amount}>Catat pembayaran</button>
            </form>
          )}
        </div>
      </div>

      {manual.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-bold">Pembayaran yang dicatat keuangan</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {manual.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                <span><b className="tabular-nums">{rupiah(p.amountPaid)}</b> · {KIND_LABEL[p.kind] ?? p.kind} · {dateID(p.transferDate)}<span className="block text-xs text-muted">{p.note}{p.payerName ? ` · ${p.payerName}` : ''}{p.receiptNo ? ` · kwitansi ${p.receiptNo}` : ''}</span></span>
                <button className="btn-ghost !min-h-9 text-red-700" onClick={() => { setCancel(p.id); setWhy('') }}>Batalkan</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={!!cancel} title="Batalkan catatan pembayaran" onClose={() => setCancel(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(cancelManualPayment(cancel!, why), 'Catatan pembayaran dibatalkan dan cicilan dihitung ulang.', () => setCancel(null)) }}>
          <p className="text-sm text-muted">Catatan tetap tersimpan sebagai dibatalkan untuk jejak audit. Pembagian ke cicilan dihitung ulang.</p>
          <Field label="Alasan (wajib)"><textarea className="input !py-2" rows={3} required value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
          <button className="btn-danger w-full">Batalkan catatan</button>
        </form>
      </Modal>
    </section>
  )
}

/**
 * Khusus pendaftar (daftar sendiri) di menu Pendaftar: keuangan mencatat biaya pendaftaran yang sudah dibayar di luar aplikasi,
 * misalnya tunai di kantor. Hanya biaya pendaftaran; biaya registrasi dan cicilan dicatat di Pembayaran peserta didik.
 */
function CatatBiayaPendaftaran({ regId }: { regId: string }) {
  const s = useStore((x) => x)
  const act = useAct()
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const r = s.registrations.find((x) => x.id === regId)!
  const user = s.users.find((u) => u.id === r.userId)
  const batch = s.batches.find((b) => b.id === r.batchId)
  const fee = regFeeFor(s, r) // sudah dikurangi potongan biaya pendaftaran
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) // tanggal WIB, sama dengan validasi server
  const pays = s.payments.filter((p) => p.registrationId === r.id && p.kind === 'pendaftaran')
  const manual = pays.filter((p) => p.status === 'verified' && p.note && !p.proofFileId)
  const [f, setF] = useState({ amount: fee, transferDate: today, payerName: '', note: '' })
  const [cancel, setCancel] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  if (!me || !['super_admin', 'admin_keuangan'].includes(me.role)) return null

  // Peserta impor admin langsung aktif tanpa tahapan seleksi, jadi aturan tahapnya berbeda.
  const imported = r.source === 'admin'
  const live = imported ? r.stage === 'aktif' && ['active', 'completed'].includes(r.status) : ['pending_payment', 'waiting_verification', 'active'].includes(r.status)
  const verified = pays.some((p) => p.status === 'verified')
  const pending = pays.some((p) => p.status === 'submitted')
  // Alasan formulir tidak ditampilkan; null berarti boleh mencatat.
  const blocked = !live ? 'Pendaftaran ini sudah tidak berjalan (mundur atau kedaluwarsa).'
    : batch?.freeRegFee ? `Angkatan ${batch.code} dibebaskan dari biaya pendaftaran, jadi tidak perlu dicatat.`
    : verified ? null
    : fee === 0 ? 'Biaya pendaftaran sudah dipotong seluruhnya, jadi tidak perlu dicatat.'
    : pending ? 'Pendaftar sudah mengunggah bukti pembayaran. Setujui atau tolak bukti di atas.'
    : !imported && !['data', 'bayar_daftar'].includes(r.stage) ? 'Pendaftar sudah melewati tahap pembayaran pendaftaran.'
    : null
  const canCancel = imported || ['data', 'bayar_daftar', 'ujian'].includes(r.stage)

  return (
    <section className="card mt-6 p-5" aria-labelledby="catat-daftar">
      <h2 id="catat-daftar" className="scroll-mt-24 font-bold">Catat pembayaran pendaftaran (loket keuangan)</h2>
      <p className="text-sm text-muted">Untuk biaya pendaftaran yang dibayar langsung di loket keuangan atau di luar aplikasi. Pendaftar tidak perlu mengunggah bukti. Catatan langsung terverifikasi dan kwitansi terbit.{imported
        ? ' Biaya pendaftaran terpisah dari cicilan biaya pelatihan.'
        : ' Ujian online langsung terbuka. Bila pendaftar belum melengkapi data diri, ujian terbuka setelah data dirinya lengkap tanpa perlu membayar lagi.'}</p>

      {verified ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Biaya pendaftaran sudah lunas.</p>
        : blocked ? <p className="mt-4 rounded-lg bg-canvas p-3 text-sm text-muted">{blocked}</p>
        : (
          <form className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(recordRegFee(r.id, f), 'Pembayaran pendaftaran dicatat dan kwitansi diterbitkan. Pendaftar mendapat notifikasi.', () => setF({ amount: fee, transferDate: today, payerName: '', note: '' })) }}>
            <label className="block"><span className="label">Nominal (Rp)</span><MoneyInput required zeroEmpty value={f.amount} onValue={(n) => setF({ ...f, amount: n })} /></label>
            <label className="block"><span className="label">Tanggal bayar</span><input className="input" type="date" required max={today} value={f.transferDate} onChange={(e) => setF({ ...f, transferDate: e.target.value })} /></label>
            <label className="block"><span className="label">Nama pembayar (opsional)</span><input className="input" placeholder={user?.name} maxLength={120} value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></label>
            <label className="block"><span className="label">Keterangan (opsional)</span><input className="input" placeholder="mis. Tunai di kantor" maxLength={255} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            {f.amount > 0 && f.amount !== fee && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">Nominal berbeda dari biaya pendaftaran {rupiah(fee)} (selisih {rupiah(Math.abs(f.amount - fee))}). Pastikan sesuai uang yang diterima.</p>}
            <button className="btn-primary sm:col-span-2" disabled={!f.amount}>Catat pembayaran pendaftaran</button>
          </form>
        )}

      {manual.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-bold">Dicatat keuangan</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {manual.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                <span><b className="tabular-nums">{rupiah(p.amountPaid)}</b> · dibayar {dateID(p.transferDate)}<span className="block text-xs text-muted">{p.note}{p.payerName ? ` · ${p.payerName}` : ''}{p.receiptNo ? ` · kwitansi ${p.receiptNo}` : ''}</span></span>
                {canCancel && <button className="btn-ghost !min-h-9 text-red-700" onClick={() => { setCancel(p.id); setWhy('') }}>Batalkan</button>}
              </li>
            ))}
          </ul>
          {!canCancel && <p className="mt-2 text-xs text-muted">Pendaftar sudah melewati ujian online, jadi catatan ini tidak bisa dibatalkan lagi.</p>}
        </div>
      )}

      <Modal open={!!cancel} title="Batalkan catatan pembayaran pendaftaran" onClose={() => setCancel(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(cancelManualPayment(cancel!, why), imported ? 'Catatan pembayaran pendaftaran dibatalkan.' : 'Catatan pembayaran pendaftaran dibatalkan. Pendaftar kembali ke tahap pembayaran.', () => setCancel(null)) }}>
          <p className="text-sm text-muted">Catatan tetap tersimpan sebagai dibatalkan untuk jejak audit.{imported ? '' : ' Bila pendaftar sudah di tahap ujian online dan belum mengerjakannya, ia kembali ke tahap pembayaran. Pendaftar mendapat notifikasi.'}</p>
          <Field label="Alasan (wajib, dikirim ke pendaftar)"><textarea className="input !py-2" rows={3} required value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
          <button className="btn-danger w-full">Batalkan catatan</button>
        </form>
      </Modal>
    </section>
  )
}

/** Penanda kecil di daftar: pendaftar ini mendapat potongan biaya. */
export function DiscountChip({ regId }: { regId: string }) {
  const total = useStore((x) => x.discounts.filter((d) => d.registrationId === regId).reduce((t, d) => t + d.amount, 0))
  if (!total) return null
  return <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200"><IconDiscount size={12} />Potongan {rupiah(total)}</span>
}

interface CutForm { editing: boolean; target: string; mode: 'rp' | 'persen'; value: number; reason: string }

/**
 * Potongan biaya untuk satu pendaftar (bagian keuangan): biaya pendaftaran, biaya pelatihan, atau biaya tambahan yang berlaku untuknya.
 * Satu potongan per jenis biaya. Jadwal cicilan yang sudah ada langsung disesuaikan server, dan pendaftar mendapat notifikasi.
 */
function PotonganBiaya({ regId }: { regId: string }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [f, setF] = useState<CutForm | null>(null)
  const [del, setDel] = useState<{ target: string; label: string } | null>(null)
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const r = s.registrations.find((x) => x.id === regId)
  if (!r || !me || !['super_admin', 'admin_keuangan'].includes(me.role)) return null
  const prog = s.programs.find((p) => p.id === r.programId)
  const batch = s.batches.find((b) => b.id === r.batchId)
  const cuts = discountsFor(s, r.id)
  const regPaid = s.payments.some((p) => p.registrationId === r.id && p.kind === 'pendaftaran' && p.status === 'verified')
  const pending = s.payments.some((p) => p.registrationId === r.id && p.status === 'submitted')
  const live = ['pending_payment', 'waiting_verification', 'active'].includes(r.status)
  const extras = s.feeItems.filter((x) => x.active && (x.userId ? x.userId === r.userId : (!x.programId || x.programId === r.programId)))
  // Biaya yang bisa dipotong beserta nominal penuhnya (batas potongan).
  const targets = [
    ...(!batch?.freeRegFee && (!regPaid || cuts.some((d) => d.target === 'pendaftaran')) ? [{ key: 'pendaftaran', label: 'Biaya pendaftaran', base: s.settings.regFee ?? 200_000 }] : []),
    { key: 'pelatihan', label: `Biaya pelatihan ${prog?.title ?? ''}`, base: prog?.price ?? r.priceSnapshot },
    ...extras.map((x) => ({ key: x.id, label: x.name, base: x.amount })),
  ]
  const free = targets.filter((t) => !cuts.some((d) => d.target === t.key))
  const base = f ? targets.find((t) => t.key === f.target)?.base ?? 0 : 0
  const amount = f ? (f.mode === 'persen' ? Math.round((base * Math.min(100, f.value)) / 100) : f.value) : 0
  const total = cuts.reduce((t, d) => t + d.amount, 0)
  const blocked = !live ? 'Pendaftaran ini sudah tidak berjalan atau sudah selesai, jadi potongannya tidak bisa diubah.'
    : pending ? 'Ada bukti pembayaran yang menunggu verifikasi. Setujui atau tolak dulu, lalu atur potongannya.' : null
  const startNew = () => setF({ editing: false, target: free[0]?.key ?? '', mode: 'rp', value: 0, reason: '' })

  return (
    <section className="card mt-6 p-5" aria-labelledby="potongan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="potongan" className="flex items-center gap-2 font-bold"><IconDiscount size={20} className="text-sky-700" />Potongan biaya</h2>
          <p className="text-sm text-muted">Potongan untuk biaya pendaftaran, biaya pelatihan, atau biaya tambahan pendaftar ini. Tagihan dan jadwal cicilannya langsung disesuaikan, dan pendaftar mendapat notifikasi.</p>
        </div>
        {!blocked && free.length > 0 && <button className="btn-primary" onClick={startNew}><IconDiscount size={18} />Beri potongan</button>}
      </div>
      {blocked && <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-muted">{blocked}</p>}
      {cuts.length === 0 ? <p className="mt-3 text-sm text-muted">Belum ada potongan.</p> : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {cuts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span><b>{d.label}</b> · <b className="tabular-nums text-sky-800">- {rupiah(d.amount)}</b><span className="block text-xs text-muted">{d.reason} · {s.users.find((u) => u.id === d.createdBy)?.name ?? 'Keuangan'}, {dateID(d.createdAt)}</span></span>
              {!blocked && <span className="whitespace-nowrap">
                <button className="btn-ghost !min-h-9" aria-label={`Ubah potongan ${d.label}`} onClick={() => setF({ editing: true, target: d.target, mode: 'rp', value: d.amount, reason: d.reason })}><IconPencil size={16} />Ubah</button>
                <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus potongan ${d.label}`} onClick={() => setDel({ target: d.target, label: d.label })}><IconTrash size={16} /></button>
              </span>}
            </li>
          ))}
          <li className="flex justify-between gap-3 bg-canvas px-4 py-2 text-sm font-bold"><span>Total potongan</span><span className="tabular-nums text-sky-800">- {rupiah(total)}</span></li>
        </ul>
      )}

      <Modal open={!!f} title={f?.editing ? 'Ubah potongan biaya' : 'Beri potongan biaya'} onClose={() => setF(null)}>
        {f && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveDiscount(r.id, { target: f.target, amount, reason: f.reason }), 'Potongan disimpan. Tagihan pendaftar sudah disesuaikan.', () => setF(null)) }}>
          <Field label="Biaya yang dipotong">
            <select className="input" required disabled={f.editing} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}>
              {(f.editing ? targets.filter((t) => t.key === f.target) : free).map((t) => <option key={t.key} value={t.key}>{t.label} ({rupiah(t.base)})</option>)}
              {f.editing && !targets.some((t) => t.key === f.target) && <option value={f.target}>{cuts.find((d) => d.target === f.target)?.label}</option>}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <Field label="Bentuk">
              <select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as CutForm['mode'], value: 0 })}><option value="rp">Nominal (Rp)</option><option value="persen">Persen (%)</option></select>
            </Field>
            {f.mode === 'rp'
              ? <Field label="Nominal potongan (Rp)"><MoneyInput required zeroEmpty value={f.value} onValue={(n) => setF({ ...f, value: n })} /></Field>
              : <Field label="Persen potongan"><input className="input" type="number" min={1} max={100} required value={f.value || ''} onChange={(e) => setF({ ...f, value: Math.max(0, Math.min(100, +e.target.value || 0)) })} /></Field>}
          </div>
          {amount > 0 && <p className={`rounded-lg p-2 text-sm ${amount > base ? 'bg-red-50 text-red-900' : 'bg-sky-50 text-sky-900'}`}>{amount > base ? `Potongan melebihi biaya ini (${rupiah(base)}).` : `Potongan ${rupiah(amount)}, sisa biaya ${rupiah(base - amount)}.`}</p>}
          <Field label="Alasan (wajib)" hint="Contoh: beasiswa prestasi, program kerja sama, atau keringanan dari pimpinan."><textarea className="input !py-2" rows={2} required maxLength={255} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <button className="btn-primary w-full" disabled={!f.target || amount < 1 || amount > base}>Simpan potongan</button>
        </form>}
      </Modal>
      <Modal open={!!del} title="Hapus potongan?" onClose={() => setDel(null)}>
        {del && <div className="space-y-4">
          <p className="text-sm">Potongan <b>{del.label}</b> dibatalkan. Tagihan dan jadwal cicilan pendaftar kembali bertambah sebesar potongan ini, dan pendaftar mendapat notifikasi.</p>
          <div className="flex gap-2"><button className="btn-danger" onClick={() => act(deleteDiscount(r.id, del.target), 'Potongan dihapus.', () => setDel(null))}>Ya, hapus</button><button className="btn-ghost" onClick={() => setDel(null)}>Batal</button></div>
        </div>}
      </Modal>
    </section>
  )
}

function BackLink() {
  const fromDidik = useLocation().pathname.startsWith('/admin/peserta-didik')
  return <Link to={fromDidik ? '/admin/peserta-didik' : '/admin/pendaftar'} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"><IconArrowLeft size={16} />Kembali ke {fromDidik ? 'Peserta didik' : 'Pendaftar'}</Link>
}

const PAY_CHIP: Record<string, { label: string; cls: string }> = {
  verified: { label: 'Terverifikasi', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  submitted: { label: 'Menunggu verifikasi', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  rejected: { label: 'Ditolak', cls: 'bg-red-50 text-red-800 ring-red-200' },
}

/**
 * Rincian biaya pendaftaran, khusus untuk calon yang belum menjadi peserta didik. Verifikasi bukti pembayaran pendaftaran dilakukan di sini.
 * Biaya registrasi ulang dan cicilan ada di Rincian peserta didik (menu Peserta didik).
 */
export function RincianPendaftaran() {
  const { regId } = useParams()
  const s = useStore((x) => x)
  const act = useAct()
  const [rej, setRej] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [amts, setAmts] = useState<Record<string, number>>({}) // nominal sesuai bukti yang diubah keuangan, per pembayaran
  const r = s.registrations.find((x) => x.id === regId)
  const user = s.users.find((u) => u.id === r?.userId)
  if (!r || !user) return <><BackLink /><div className="card"><Empty title="Pendaftar tidak ditemukan" body="Data ini tidak ada atau Anda tidak berhak melihatnya." action={<Link to="/admin/pendaftar" className="btn-primary">Kembali</Link>} /></div></>
  const prog = s.programs.find((p) => p.id === r.programId)
  const fee = regFeeFor(s, r) // tarif umum dikurangi potongan; 0 bila angkatannya dibebaskan
  const cut = discountsFor(s, r.id).filter((d) => d.target === 'pendaftaran').reduce((t, d) => t + d.amount, 0)
  const pays = s.payments.filter((p) => p.registrationId === r.id && p.kind === 'pendaftaran').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const verified = pays.find((p) => p.status === 'verified')
  const free = !verified && fee === 0
  const stateLabel = verified ? 'Terverifikasi' : free ? (cut > 0 ? 'Dipotong seluruhnya' : 'Dibebaskan') : pays.some((p) => p.status === 'submitted') ? 'Menunggu verifikasi' : 'Belum bayar'
  return (
    <>
      <BackLink />
      <PageHeader title={user.name} sub={`${prog?.title ?? ''} · ${r.code}`} action={<span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${verified ? PAY_CHIP.verified.cls : free ? 'bg-sky-50 text-sky-800 ring-sky-200' : pays.some((p) => p.status === 'submitted') ? PAY_CHIP.submitted.cls : 'bg-canvas text-ink ring-line'}`}>{stateLabel}</span>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Biaya pendaftaran</p><p className="mt-1 text-2xl font-bold tabular-nums">{free && !cut ? 'Dibebaskan' : rupiah(fee)}</p>{cut > 0 && <p className="text-xs text-sky-800">Setelah potongan {rupiah(cut)} dari {rupiah(s.settings.regFee ?? 200_000)}</p>}</div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Sudah dibayar</p><p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{rupiah(verified?.amountPaid ?? 0)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Belum dibayar</p><p className="mt-1 text-2xl font-bold tabular-nums text-amber-800">{rupiah(verified || free ? 0 : fee)}</p></div>
      </div>
      <section className="card overflow-hidden" aria-labelledby="bukti-daftar">
        <header className="border-b border-line px-5 py-3"><h2 id="bukti-daftar" className="font-bold">Bukti pembayaran pendaftaran</h2></header>
        {pays.length === 0 && free ? <p className="p-5 text-sm text-muted">{cut > 0 ? 'Biaya pendaftaran pendaftar ini dipotong seluruhnya, jadi tidak ada yang perlu dibayar.' : 'Angkatan peserta ini dibebaskan dari biaya pendaftaran.'}</p>
          : pays.length === 0 ? <p className="p-5 text-sm text-muted">Pendaftar belum mengunggah bukti pembayaran pendaftaran. Bila ia sudah membayar langsung di loket keuangan, catat pembayarannya di bagian <a href="#catat-daftar" className="font-semibold text-brand-600 underline">Catat pembayaran pendaftaran</a> di bawah.</p> : (
          <ul className="divide-y divide-line">
            {pays.map((p) => {
              const diff = p.amountPaid - p.amountDue
              return (
                <li key={p.id} className="px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold tabular-nums">{rupiah(p.amountPaid)} <span className="font-normal text-muted">dari tagihan {rupiah(p.amountDue)}</span></p>
                      <p className="mt-0.5 text-xs text-muted">{p.note && !p.proofFileId ? `Dicatat keuangan: ${p.note} · ` : ''}Pengirim {p.payerName} · {p.note && !p.proofFileId ? 'dibayar' : 'transfer'} {dateID(p.transferDate)}{p.receiptNo ? ` · kwitansi ${p.receiptNo}` : ''}</p>
                      {p.status === 'rejected' && p.rejectReason && <p className="mt-1 text-xs text-red-800">Alasan ditolak: {p.rejectReason}</p>}
                      {p.proofFileId && <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 underline" href={`/api/files/${p.proofFileId}`} target="_blank" rel="noreferrer"><IconFileText size={14} />Lihat bukti transfer</a>}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${PAY_CHIP[p.status]?.cls}`}>{PAY_CHIP[p.status]?.label ?? p.status}</span>
                  </div>
                  {p.status === 'submitted' && (
                    <div className="mt-3">
                      {diff !== 0 && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-900">Nominal tidak sama dengan tagihan (selisih {rupiah(Math.abs(diff))}). Periksa bukti sebelum menyetujui.</p>}
                      <label className="mb-3 block max-w-xs"><span className="label">Nominal sesuai bukti transfer (Rp)</span><MoneyInput value={amts[p.id] ?? p.amountPaid} onValue={(n) => setAmts({ ...amts, [p.id]: n })} />
                        <span className="mt-1 block text-xs text-muted">Ubah bila nominal pada bukti berbeda dari yang diunggah pendaftar.</span></label>
                      <div className="flex gap-2">
                        <button className="btn-primary" disabled={(amts[p.id] ?? p.amountPaid) < 1} onClick={() => act(verifyPayment(p.id, amts[p.id] ?? p.amountPaid), 'Pembayaran pendaftaran dikonfirmasi. Peserta mendapat notifikasi dan email.')}><IconCheck size={18} />Setujui</button>
                        <button className="btn-ghost" onClick={() => { setRej(p.id); setReason('') }}><IconX size={18} />Tolak</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <PotonganBiaya regId={r.id} />
      <CatatBiayaPendaftaran regId={r.id} />
      <p className="mt-4 text-xs text-muted">Biaya registrasi ulang dan cicilan tidak ditampilkan di sini. Setelah pendaftar diterima dan registrasi ulangnya terkonfirmasi, rinciannya ada di menu Peserta didik.</p>
      <Modal open={!!rej} title="Tolak pembayaran pendaftaran" onClose={() => setRej(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(rejectPayment(rej!, reason), 'Pembayaran ditolak. Pendaftar diminta unggah ulang.', () => setRej(null)) }}>
          <Field label="Alasan (wajib, dikirim ke pendaftar)"><textarea className="input !py-2" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className="btn-danger w-full">Tolak</button>
        </form>
      </Modal>
    </>
  )
}
