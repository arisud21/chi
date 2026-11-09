import { IconArrowLeft, IconBellRinging, IconFileText } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Empty, PageHeader, Table, dateID, rupiah, useToast } from '../../components/ui'
import { itemsFor, shortfallOf, summarize, type Summary } from '../../lib/billing'
import { remindPayment, useStore } from '../../lib/store'

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
export function Tagihan() {
  const s = useStore((x) => x)
  const nav = useNavigate()
  const { remind, busy } = useRemind()
  const [f, setF] = useState<Summary | 'all'>('all')
  const [q, setQ] = useState('')

  const rows = s.registrations.map((r) => {
    const items = itemsFor(s, r)
    return { r, user: s.users.find((u) => u.id === r.userId), prog: s.programs.find((p) => p.id === r.programId), items, ...summarize(items) }
  }).filter((x) => x.user && (x.r.status === 'pending_payment' || x.r.status === 'active' || x.r.stage === 'tidak_lulus'))
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
        <select className="input !w-auto" value={f} onChange={(e) => setF(e.target.value as Summary | 'all')} aria-label="Filter pembayaran">
          {FILTERS.map(([k, label]) => <option key={k} value={k}>{label} ({k === 'all' ? rows.length : rows.filter((x) => x.status === k).length})</option>)}
        </select>
        <span className="flex-1" />
        <button className="btn-primary" disabled={busy || dueRows.length === 0} onClick={() => remind(dueRows.map((x) => x.r.id))}><IconBellRinging size={18} />Umumkan ke {dueRows.length} yang ada tagihan</button>
      </div>

      {shown.length === 0 ? <div className="card"><Empty title="Tidak ada data pembayaran" body="Belum ada pendaftar, atau tidak ada yang cocok dengan filter ini." /></div> : (
        <Table head={['Peserta', 'Program', 'Tagihan', 'Dibayar', 'Sisa', 'Status', '']}>
          {shown.map(({ r, user, prog, total, paid, rest, status }) => (
            <tr key={r.id}>
              <td><p className="font-semibold">{user!.name}</p><p className="font-mono text-xs text-muted">{r.code}</p></td>
              <td>{prog?.title}</td>
              <td className="tabular-nums">{rupiah(total)}</td>
              <td className="tabular-nums text-emerald-700">{rupiah(paid)}</td>
              <td className={`tabular-nums ${rest > 0 ? 'font-semibold text-amber-800' : ''}`}>{rupiah(rest)}</td>
              <td><div className="flex flex-wrap gap-1"><Badge status={status} />{shortfallOf(s, r.id) > 0 && r.stage === 'aktif' && <Badge status="short" />}</div></td>
              <td className="whitespace-nowrap text-right">
                {status === 'due' && <button className="btn-ghost !min-h-10" disabled={busy} onClick={() => remind([r.id])} aria-label={`Umumkan tagihan ke ${user!.name}`}><IconBellRinging size={16} />Umumkan</button>}{' '}
                <button className="btn-ghost !min-h-10" onClick={() => nav(`/admin/pendaftar/${r.id}`)} aria-label={`Rincian pembayaran ${user!.name}`}>Rincian</button>
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
    return <><BackLink /><div className="card"><Empty title="Pendaftar tidak ditemukan" body="Data ini tidak ada atau Anda tidak berhak melihatnya." action={<Link to="/admin/pendaftar" className="btn-primary">Kembali ke Pendaftar</Link>} /></div></>
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

  // Dari apa total terdiri: biaya program + biaya tambahan - biaya pendaftaran (yang dicicil).
  const regFee = s.settings.regFee ?? 200000
  const extras = s.feeItems.filter((x) => x.active && (!x.programId || x.programId === r.programId))
  const price = prog?.price ?? r.priceSnapshot
  const credit = items[0]?.state === 'paid' ? (items[0].amount ?? 0) : 0
  const installTotal = s.installments.filter((i) => i.registrationId === r.id).reduce((t, i) => t + i.amount, 0)
  const hasSchedule = installTotal > 0
  const expectedSchedule = Math.max(0, price + extras.reduce((t, x) => t + x.amount, 0) - credit)
  const drifted = hasSchedule && installTotal !== expectedSchedule

  return (
    <>
      <BackLink />
      <PageHeader title={user.name} sub={`${prog?.title ?? ''} · ${r.code}${batch ? ` · ${batch.code}` : ''}`} action={<Badge status={status} />} />

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

      <section className="card mt-6 p-5">
        <h2 className="font-bold">Dari apa total ini terdiri</h2>
        <dl className="mt-3 max-w-xl space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt>Biaya pelatihan {prog?.title}</dt><dd className="tabular-nums">{rupiah(price)}</dd></div>
          {extras.map((x) => <div key={x.id} className="flex justify-between gap-3"><dt>{x.name}</dt><dd className="tabular-nums">{rupiah(x.amount)}</dd></div>)}
          <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold"><dt>Total keseluruhan</dt><dd className="tabular-nums">{rupiah(price + extras.reduce((t, x) => t + x.amount, 0))}</dd></div>
          <div className="flex justify-between gap-3"><dt>Dikurangi biaya pendaftaran{credit ? '' : ' (belum dibayar)'}</dt><dd className="tabular-nums">- {rupiah(credit || regFee)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-bold"><dt>Dicicil saat registrasi ulang</dt><dd className="tabular-nums text-brand-700">{rupiah(hasSchedule ? installTotal : expectedSchedule)}</dd></div>
        </dl>
        {drifted && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Jadwal cicilan peserta ini dihitung dengan biaya saat ia memilih paket. Biaya program atau biaya tambahan sudah berubah sejak itu, sehingga total di atas berbeda dari jadwalnya.</p>}
        {!hasSchedule && <p className="mt-3 text-xs text-muted">Peserta belum memilih paket pembayaran, jadi angka ini perkiraan dari biaya saat ini.</p>}
      </section>
    </>
  )
}

function BackLink() {
  return <Link to="/admin/pendaftar" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"><IconArrowLeft size={16} />Kembali ke Pendaftar</Link>
}
