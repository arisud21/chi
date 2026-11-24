import { IconAlertCircle, IconCheck, IconDownload, IconUpload } from '@tabler/icons-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Field, Modal, MoneyInput, PageHeader, Table, dateID, rupiah, useAct } from '../../components/ui'
import { itemsFor, shortfallOf, summarize } from '../../lib/billing'
import { WaButton } from '../../lib/wa'
import { DOC_KINDS, DOC_LABEL, choosePlan, resumeRegistration, submitProof, uploadDocument, useStore } from '../../lib/store'
import type { DocKind, Installment, PayKind, PaymentPlan, Registration, Stage } from '../../lib/types'
import { useMe } from './Peserta'

const ORDER: Stage[] = ['data', 'bayar_daftar', 'ujian', 'menunggu_hasil', 'registrasi_ulang', 'aktif']
const rank = (s: Stage) => (s === 'tidak_lulus' ? ORDER.indexOf('menunggu_hasil') + 1 : ORDER.indexOf(s))

/** Rincian paket: berapa dibayar sekarang dan berapa cicilan sisanya. Rumus sama dengan server. */
export function planPreview(total: number, plan: Pick<PaymentPlan, 'downPayment' | 'installments'>) {
  const n = Math.max(1, plan.installments)
  if (n === 1 || plan.downPayment >= total) return { first: total, count: 0, each: 0 }
  const rest = total - plan.downPayment
  return { first: plan.downPayment, count: n - 1, each: Math.floor(rest / (n - 1)) }
}

/** Unggah bukti transfer untuk satu jenis pembayaran. */
function ProofButton({ reg, kind, amount, installmentId, label, fixed = false }: { reg: Registration; kind: PayKind; amount: number; installmentId?: string; label: string; fixed?: boolean }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [open, setOpen] = useState(false)
  const name = s.users.find((u) => u.id === reg.userId)?.name ?? ''
  const [f, setF] = useState({ payerName: name, transferDate: new Date().toISOString().slice(0, 10), amountPaid: amount, file: null as File | null })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.file) return act(Promise.resolve({ ok: false, error: 'Pilih berkas bukti transfer.' }), '')
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(f.file.type)) return act(Promise.resolve({ ok: false, error: 'Format harus JPG, PNG, atau PDF.' }), '')
    if (f.file.size > 2 * 1024 * 1024) return act(Promise.resolve({ ok: false, error: 'Ukuran berkas maksimal 2 MB.' }), '')
    act(submitProof(reg.id, { kind, installmentId, payerName: f.payerName, transferDate: f.transferDate, amountPaid: f.amountPaid, file: f.file }), 'Bukti terkirim. Menunggu konfirmasi.', () => setOpen(false))
  }
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><IconUpload size={18} />{label}</button>
      <Modal open={open} title="Unggah bukti transfer" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <p className="rounded-lg bg-brand-50 p-3 text-sm">Transfer <b>{rupiah(amount)}</b> ke {s.settings.bankName} <b className="font-mono">{s.settings.bankAccount}</b> a.n. {s.settings.bankHolder}.</p>
          <Field label="Nama pengirim"><input className="input" required value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal transfer"><input className="input" type="date" required value={f.transferDate} onChange={(e) => setF({ ...f, transferDate: e.target.value })} /></Field>
            <Field label="Nominal (Rp)" hint={fixed ? 'Sesuai total biaya pelatihan (paket lunas sekali bayar).' : undefined}><MoneyInput className="read-only:bg-brand-50" required readOnly={fixed} value={f.amountPaid} onValue={(n) => setF({ ...f, amountPaid: n })} /></Field>
          </div>
          <Field label="Bukti transfer" hint="JPG, PNG, atau PDF. Maksimal 2 MB."><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png,.pdf" required onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null })} /></Field>
          <button className="btn-primary w-full">Kirim bukti</button>
        </form>
      </Modal>
    </>
  )
}

function Bank() {
  const st = useStore((x) => x.settings)
  return <p className="mt-2 text-sm">{st.bankName} · <b className="font-mono">{st.bankAccount}</b> a.n. {st.bankHolder}</p>
}

function PaymentState({ reg, kind, installmentId }: { reg: Registration; kind: PayKind; installmentId?: string }) {
  const pays = useStore((x) => x.payments).filter((p) => p.registrationId === reg.id && p.kind === kind && (!installmentId || p.installmentId === installmentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const last = pays[0]
  if (last?.status === 'submitted') return <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm font-medium text-sky-900">Bukti terkirim, menunggu konfirmasi admin atau bagian keuangan.</p>
  if (last?.status === 'rejected') return <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">Bukti sebelumnya ditolak: {last.rejectReason}. Unggah bukti yang benar.</p>
  return null
}

function Step({ n, title, state, children }: { n: number; title: string; state: 'done' | 'now' | 'next'; children?: ReactNode }) {
  const mark = state === 'done' ? 'bg-brand-600 text-white' : state === 'now' ? 'border-2 border-brand-600 bg-white text-brand-700' : 'border border-line bg-canvas text-muted'
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span aria-hidden className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px bg-line last:hidden" />
      <span className={`z-10 grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${mark}`}>{state === 'done' ? <IconCheck size={16} /> : n}</span>
      <div className="min-w-0 flex-1">
        <h2 className={`font-bold ${state === 'next' ? 'text-muted' : ''}`}>{title}</h2>
        {state === 'now' && children && <div className="card mt-2 p-4">{children}</div>}
        {state === 'done' && children && <div className="mt-1 text-sm text-muted">{children}</div>}
      </div>
    </li>
  )
}

function Reenroll({ reg }: { reg: Registration }) {
  const s = useStore((x) => x)
  const act = useAct()
  const prog = s.programs.find((p) => p.id === reg.programId)
  const credit = s.payments.filter((p) => p.registrationId === reg.id && p.kind === 'pendaftaran' && p.status === 'verified').reduce((t, p) => t + p.amountPaid, 0)
  const fullPrice = prog?.price ?? reg.priceSnapshot
  const extras = s.feeItems.filter((x) => x.userId ? x.userId === reg.userId : (!x.programId || x.programId === reg.programId))
  const total = Math.max(0, fullPrice + extras.reduce((t, x) => t + x.amount, 0) - credit)
  const plans = s.plans.filter((p) => !p.programId || p.programId === reg.programId)
  const insts = s.installments.filter((i) => i.registrationId === reg.id).sort((a, b) => a.seq - b.seq)
  const first = insts[0]
  const locked = !!first && first.status !== 'unpaid'
  const min = s.settings.minReenroll ?? 1_000_000
  return (
    <div className="space-y-4">
      <dl className="rounded-xl border border-line bg-canvas p-4 text-sm">
        <div className="flex justify-between gap-3 py-0.5"><dt>Biaya pelatihan</dt><dd className="tabular-nums">{rupiah(fullPrice)}</dd></div>
        {extras.map((x) => <div key={x.id} className="flex justify-between gap-3 py-0.5"><dt>{x.name}</dt><dd className="tabular-nums">{rupiah(x.amount)}</dd></div>)}
        <div className="flex justify-between gap-3 py-0.5"><dt>Dikurangi biaya pendaftaran</dt><dd className="tabular-nums">- {rupiah(credit)}</dd></div>
        <div className="mt-1 flex justify-between gap-3 border-t border-line pt-2 font-bold"><dt>Sisa yang dibayar</dt><dd className="tabular-nums text-brand-700">{rupiah(total)}</dd></div>
      </dl>
      <p className="text-sm">Pilih paket pembayaran. Anda dapat mengganti paket selama pembayaran pertama belum diunggah.</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Paket pembayaran">
        {plans.map((p) => {
          const v = planPreview(total, p)
          const chosen = reg.planId === p.id
          return (
            <button key={p.id} type="button" role="radio" aria-checked={chosen} disabled={locked}
              onClick={() => act(choosePlan(reg.id, p.id), 'Paket dipilih.')}
              className={`min-h-14 rounded-xl border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${chosen ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-brand-200'}`}>
              <span className="block font-semibold">{p.name}</span>
              <span className="text-muted">{v.count === 0 ? `Bayar ${rupiah(v.first)} sekaligus` : `Bayar ${rupiah(v.first)} sekarang, lalu ${v.count} cicilan @ ${rupiah(v.each)}`}</span>
            </button>
          )
        })}
        {plans.length === 0 && <p className="text-sm text-muted">Bagian keuangan belum mengatur paket pembayaran.</p>}
      </div>
      {insts.length > 0 && (
        <Table head={['Pembayaran', 'Nominal', 'Jatuh tempo', 'Status']}>
          {insts.map((i) => <tr key={i.id}><td>{i.seq === 1 ? 'Registrasi ulang' : `Cicilan ${i.seq - 1}`}</td><td className="font-semibold tabular-nums">{rupiah(i.amount)}</td><td>{dateID(i.dueDate)}</td><td><Badge status={i.status} /></td></tr>)}
        </Table>
      )}
      {first && first.status === 'unpaid' && (
        <div>
          <p className="text-sm">Transfer <b>{rupiah(first.amount)}</b>{s.settings.reenrollDue ? `, paling lambat ${dateID(s.settings.reenrollDue)}` : ''}. Minimal registrasi ulang {rupiah(Math.min(min, first.amount))}.</p>
          {insts.length === 1
            ? <p className="mt-1 text-xs text-muted">Paket lunas sekali bayar: nominal yang diunggah sesuai total biaya pelatihan. Bagian keuangan mencocokkannya dengan bukti transfer. Bila nominal pada bukti berbeda, keuangan menyesuaikannya dan kekurangannya menjadi tagihan Anda yang harus dilunasi.</p>
            : <p className="mt-1 text-xs text-muted">Bayar lebih dari itu: kelebihan langsung memotong cicilan berikutnya. Bayar kurang dari minimal: tetap bisa diunggah dan diterima keuangan, tetapi Anda wajib segera melunasi kekurangannya.</p>}
          <Bank />
          <PaymentState reg={reg} kind="registrasi_ulang" installmentId={first.id} />
          <div className="mt-3"><ProofButton reg={reg} kind="registrasi_ulang" amount={first.amount} installmentId={first.id} fixed={insts.length === 1} label="Unggah bukti registrasi ulang" /></div>
        </div>
      )}
      {first && first.status === 'submitted' && <p className="rounded-lg bg-sky-50 p-3 text-sm font-medium text-sky-900">Bukti registrasi ulang terkirim, menunggu konfirmasi.</p>}
      <p className="text-xs text-muted">Peserta yang tidak melakukan registrasi ulang dianggap mengundurkan diri.{s.settings.refundCutoff ? ` Biaya registrasi dikembalikan dengan potongan 50% bila mengundurkan diri sebelum ${dateID(s.settings.refundCutoff)}. Setelah tanggal itu tidak dapat dikembalikan.` : ' Biaya yang sudah dibayarkan tidak dapat dikembalikan.'}</p>
    </div>
  )
}

const DOC_HINT: Record<DocKind, string> = {
  ktp: 'JPG, PNG, atau PDF.', ijazah: 'Ijazah SMA/SMK/sederajat. JPG, PNG, atau PDF.', foto: 'Latar polos. JPG atau PNG.',
  kk: 'JPG, PNG, atau PDF.', buta_warna: 'Dari klinik atau puskesmas. JPG, PNG, atau PDF.',
}

/** Lima berkas yang diunggah setelah registrasi ulang dikonfirmasi. Yang sudah terunggah tidak bisa diganti sendiri. */
function Berkas({ programTitle }: { programTitle: string }) {
  const docs = useStore((x) => x.documents)
  const act = useAct()
  const inputs = useRef<Partial<Record<DocKind, HTMLInputElement | null>>>({})
  const [busy, setBusy] = useState<DocKind | null>(null)
  const [last, setLast] = useState<{ kind: DocKind; file: File } | null>(null)
  const pick = async (kind: DocKind, file: File | undefined) => {
    if (!file) return
    const okTypes = kind === 'foto' ? ['image/jpeg', 'image/png'] : ['image/jpeg', 'image/png', 'application/pdf']
    if (!okTypes.includes(file.type)) return act(Promise.resolve({ ok: false, error: kind === 'foto' ? 'Pas foto harus JPG atau PNG.' : 'Format harus JPG, PNG, atau PDF.' }), '')
    if (file.size > 2 * 1024 * 1024) return act(Promise.resolve({ ok: false, error: 'Ukuran berkas maksimal 2 MB.' }), '')
    // Berkas terakhir mengunci program pilihan, jadi minta konfirmasi dulu.
    if (docs.length === DOC_KINDS.length - 1 && !docs.some((d) => d.kind === kind)) { setLast({ kind, file }); return }
    await send(kind, file)
  }
  const send = async (kind: DocKind, file: File) => {
    setBusy(kind)
    await act(uploadDocument(kind, file), `${DOC_LABEL[kind]} terunggah.`)
    setBusy(null)
    if (inputs.current[kind]) inputs.current[kind]!.value = ''
  }
  const cancelLast = () => { if (last && inputs.current[last.kind]) inputs.current[last.kind]!.value = ''; setLast(null) }
  return (
    <>
    <Modal open={!!last} title="Ini berkas terakhir" onClose={cancelLast}>
      <div className="space-y-3 text-sm">
        <p>Setelah <b>{last ? DOC_LABEL[last.kind] : ''}</b> terunggah, kelima berkas lengkap dan <b>program pilihan Anda tidak dapat diubah lagi</b>.</p>
        <p className="rounded-lg bg-canvas p-3">Program Anda: <b>{programTitle}</b></p>
        <p className="text-muted">Bila ingin mengganti program, batalkan dulu dan hubungi admin pendaftaran.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1" onClick={() => { const l = last!; setLast(null); send(l.kind, l.file) }}>Program sudah benar, unggah</button>
          <button className="btn-ghost" onClick={cancelLast}>Batal</button>
        </div>
      </div>
    </Modal>
    <ul className="divide-y divide-line">
      {DOC_KINDS.map((k) => {
        const d = docs.find((x) => x.kind === k)
        return (
          <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{DOC_LABEL[k]}</p>
              <p className="text-xs text-muted">{d ? <a className="font-semibold text-brand-600 underline" href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer">Lihat berkas</a> : DOC_HINT[k]}</p>
            </div>
            {d
              ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><IconCheck size={18} />Terunggah</span>
              : <>
                <input ref={(el) => { inputs.current[k] = el }} type="file" className="sr-only" tabIndex={-1} aria-label={`Pilih berkas ${DOC_LABEL[k]}`} accept={k === 'foto' ? '.jpg,.jpeg,.png' : '.jpg,.jpeg,.png,.pdf'} onChange={(e) => pick(k, e.target.files?.[0])} />
                <button type="button" className="btn-primary" disabled={busy === k} onClick={() => inputs.current[k]?.click()}><IconUpload size={18} />{busy === k ? 'Mengunggah…' : 'Unggah'}</button>
              </>}
          </li>
        )
      })}
    </ul>
    </>
  )
}

/** Ringkasan di sisi kanan: berapa total, berapa sudah dibayar, dan rincian per item. */
function RingkasanBayar({ reg }: { reg: Registration }) {
  const s = useStore((x) => x)
  const items = itemsFor(s, reg)
  const { total, paid, rest } = summarize(items)
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  return (
    <aside aria-label="Ringkasan pembayaran" className="card order-first p-5 lg:order-last">
      <h2 className="font-bold">Pembayaran saya</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm lg:grid-cols-1">
        <div className="flex flex-col justify-between gap-0.5 lg:flex-row lg:items-baseline"><dt className="text-muted">Total tagihan</dt><dd className="font-semibold tabular-nums">{rupiah(total)}</dd></div>
        <div className="flex flex-col justify-between gap-0.5 lg:flex-row lg:items-baseline"><dt className="text-muted">Sudah dibayar</dt><dd className="font-semibold tabular-nums text-emerald-700">{rupiah(paid)}</dd></div>
        <div className="flex flex-col justify-between gap-0.5 lg:flex-row lg:items-baseline"><dt className="text-muted">Belum dibayar</dt><dd className="font-semibold tabular-nums text-amber-800">{rupiah(rest)}</dd></div>
      </dl>
      <div className="mt-4" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase terbayar">
        <div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand-500" style={{ width: pct + '%' }} /></div>
        <p className="mt-1 text-xs text-muted">{pct}% dari tagihan yang sudah pasti</p>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0"><p className="font-medium">{i.label}</p>{i.due && i.state !== 'paid' && <p className="text-xs text-muted">Jatuh tempo {dateID(i.due)}</p>}</div>
            <div className="shrink-0 text-right"><p className="tabular-nums">{i.amount != null ? rupiah(i.amount) : '-'}</p><div className="mt-0.5"><Badge status={i.state} /></div></div>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Tabel pembayaran biaya pelatihan, selebar halaman. Pembayaran lebih memotong cicilan berikutnya. */
function Cicilan({ reg }: { reg: Registration }) {
  const insts = useStore((x) => x.installments).filter((i) => i.registrationId === reg.id).sort((a, b) => a.seq - b.seq)
  if (!insts.length) return null
  return (
    <section className="card min-w-0 p-5" aria-labelledby="tbl-bayar">
      <h2 id="tbl-bayar" className="font-bold">Pembayaran biaya pelatihan</h2>
      <p className="mb-3 mt-1 text-sm text-muted">Pembayaran yang lebih besar dari tagihan langsung memotong cicilan berikutnya.</p>
      <Table bare head={['Pembayaran', 'Tagihan', 'Dibayar', 'Sisa', 'Jatuh tempo', 'Status', '']}>
        {insts.map((i: Installment) => {
          const rest = i.amount - i.paidAmount
          return (
            <tr key={i.id}>
              <td className="font-semibold">{i.seq === 1 ? 'Registrasi ulang' : `Cicilan ${i.seq - 1}`}</td>
              <td className="tabular-nums">{rupiah(i.amount)}</td>
              <td className="tabular-nums text-emerald-700">{rupiah(i.paidAmount)}</td>
              <td className={`tabular-nums ${rest > 0 ? 'font-semibold text-amber-800' : ''}`}>{rupiah(rest)}</td>
              <td>{dateID(i.dueDate)}</td>
              <td><Badge status={i.status} /><PaymentState reg={reg} kind="cicilan" installmentId={i.id} /></td>
              <td className="text-right">{(i.status === 'unpaid' || i.status === 'partial') && <ProofButton key={`${i.id}-${rest}`} reg={reg} kind="cicilan" amount={rest} installmentId={i.id} label={i.status === 'partial' ? 'Lunasi sisa' : 'Bayar'} />}</td>
            </tr>
          )
        })}
      </Table>
    </section>
  )
}

/** NIP dipecah menjadi tahun masuk, angkatan, kode program, dan nomor urut. */
function NipParts(nip: string) {
  return [['Tahun masuk', nip.slice(0, 4)], ['Angkatan', nip.slice(4, 5)], ['Kode program', nip.slice(5, 6)], ['Nomor urut', nip.slice(6)]] as const
}

/** Beranda peserta setelah registrasi ulang: NIP, pembayaran, dan yang perlu dilakukan untuk memulai kelas. */
function BerandaPeserta({ reg }: { reg: Registration }) {
  const { s, me } = useMe()
  const prog = s.programs.find((p) => p.id === reg.programId)
  const batch = s.batches.find((b) => b.id === reg.batchId)
  const docsDone = DOC_KINDS.every((k) => s.documents.some((d) => d.kind === k))
  const newsPending = useStore((x) => x.news.some((n) => n.eligible && !n.read)) // berita dibaca dulu, baru pengingat program
  const remindKey = `program-reminder-${reg.id}`
  const [remind, setRemind] = useState(() => { if (docsDone) return false; try { return !sessionStorage.getItem(remindKey) } catch { return true } })
  const closeRemind = () => { try { sessionStorage.setItem(remindKey, '1') } catch { /* tanpa penyimpanan, popup muncul lagi saat dibuka ulang */ } setRemind(false) }
  const short = shortfallOf(s, reg.id)
  const firstInst = s.installments.filter((i) => i.registrationId === reg.id).sort((a, b) => a.seq - b.seq)[0]
  return (
    <>
      <Modal open={remind && !newsPending} title="Periksa program pilihan Anda" onClose={closeRemind}>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-canvas p-3">Program yang Anda pilih: <b>{prog?.title}</b></p>
          <p>Sebelum mengunggah berkas, pastikan program ini sudah sesuai. Bila ingin mengubahnya, <b>hubungi admin pendaftaran sekarang</b>.</p>
          <p className="font-medium text-amber-900">Begitu kelima berkas selesai diunggah, program tidak dapat diubah lagi.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" onClick={closeRemind}>Program sudah benar</button>
            <WaButton phone={s.settings.whatsapp} label="Ubah program via WhatsApp" text={`Halo Admin, saya ${me.name} (${reg.code}). Saya ingin mengubah program pilihan saya dari ${prog?.title ?? '-'} sebelum mengunggah berkas.`} />
          </div>
        </div>
      </Modal>
      <PageHeader title={`Halo, ${me.name.split(' ')[0]}`} sub={`${prog?.title ?? ''}${batch ? ` · ${batch.code}` : ''}`} action={<div className="flex flex-wrap items-center gap-2">
        {s.settings.hotline && <WaButton phone={s.settings.hotline} label="Hubungi hotline" text={`Halo Admin Cimahi Hotel Institute, saya ${me.name} (NIP ${reg.nip ?? reg.code}), peserta didik ${prog?.title ?? ''}. Saya ingin bertanya.`} />}
        <Badge status="aktif" /></div>} />

      <section aria-labelledby="nip" className="card mb-6 grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div>
          <h2 id="nip" className="text-xs font-semibold uppercase tracking-wide text-muted">Nomor Induk Peserta (NIP)</h2>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.18em] text-brand-700" aria-label={reg.nip ? `NIP ${reg.nip.split('').join(' ')}` : 'NIP belum terbit'}>{reg.nip ?? 'Diproses'}</p>
        </div>
        {reg.nip
          ? <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">{NipParts(reg.nip).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-mono font-semibold">{v}</dd></div>)}</dl>
          : <p className="text-sm text-muted">NIP diterbitkan admin setelah data program dan angkatan Anda lengkap. Anda akan diberi tahu lewat notifikasi.</p>}
      </section>

      {short > 0 && (
        <div role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm">
          <p className="font-bold text-red-900">Pembayaran registrasi ulang masih kurang {rupiah(short)}</p>
          <p className="mt-1 text-red-900">Minimal registrasi ulang {rupiah(Math.min(s.settings.minReenroll ?? 1_000_000, firstInst?.amount ?? 0))}. Segera lunasi kekurangan ini.</p>
          {firstInst && (firstInst.status === 'unpaid' || firstInst.status === 'partial') && <div className="mt-3"><ProofButton key={short} reg={reg} kind="cicilan" amount={short} installmentId={firstInst.id} label="Lunasi kekurangan" /></div>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Cicilan reg={reg} />
        <RingkasanBayar reg={reg} />
      </div>

      <section aria-labelledby="mulai" className="card mt-6 p-5">
        <h2 id="mulai" className="font-bold">{docsDone ? 'Ruang belajar' : 'Untuk memulai kelas'}</h2>
        {docsDone
          ? <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700"><IconCheck size={16} />Kelima berkas sudah terunggah. Program pilihan terkunci, dan perubahan berkas hanya lewat admin pendaftaran.</p>
          : <>
            <p className="mt-1 text-sm text-muted">Lengkapi berkas dulu. {s.documents.length} dari {DOC_KINDS.length} sudah terunggah.</p>
            <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Program pilihan: <b>{prog?.title}</b>. Program tidak dapat diubah setelah kelima berkas terunggah. Ingin mengubah? Hubungi admin pendaftaran sebelum mengunggah berkas terakhir.</p>
            <div className="mt-3"><Berkas programTitle={prog?.title ?? '-'} /></div>
          </>}
        {docsDone
          ? <Link to="/app/belajar" className="btn-primary mt-4 w-full sm:w-auto">Buka ruang belajar</Link>
          : <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled aria-disabled="true">Buka ruang belajar (unggah semua berkas dulu)</button>}
      </section>
    </>
  )
}

/** Halaman tahapan: satu registrasi, satu langkah aktif. */
export function Tahapan() {
  const { s, me, regs } = useMe()
  const act = useAct()
  const reg = regs.find((r) => r.status === 'pending_payment' || r.status === 'active' || r.status === 'completed') ?? regs[0]
  if (!reg) return <><PageHeader title="Tahapan" /><div className="card p-6 text-sm text-muted">Belum ada registrasi. <Link className="font-semibold text-brand-600" to="/daftar">Lakukan registrasi</Link>.</div></>
  if (reg.stage === 'aktif') return <BerandaPeserta reg={reg} />
  const prog = s.programs.find((p) => p.id === reg.programId)
  const cur = rank(reg.stage)
  const dead = reg.status === 'cancelled' || reg.status === 'expired'
  const st = (i: number): 'done' | 'now' | 'next' => (dead ? (i < cur ? 'done' : 'next') : i < cur ? 'done' : i === cur ? 'now' : 'next')
  const regFee = s.settings.regFee ?? 200_000
  const needsData = !me.profileDone

  return (
    <>
      <PageHeader title="Tahapan penerimaan" sub={`${prog?.title ?? ''} · ${reg.code}`} action={<div className="flex flex-wrap items-center gap-2">
        {s.settings.hotline && <WaButton phone={s.settings.hotline} label="Hubungi hotline" text={`Halo Admin Cimahi Hotel Institute, saya ${me.name} (${reg.code}), pendaftar ${prog?.title ?? 'pelatihan'}. Saya ingin bertanya terkait pendaftaran.`} />}
        <Badge status={dead ? reg.status : reg.stage} /></div>} />
      {reg.canResume && <div role="alert" className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm">
        <IconAlertCircle className="shrink-0 text-red-700" />
        <p className="min-w-0 flex-1">{reg.autoWithdrawn
          ? <><b>Anda telah dinyatakan mengundurkan diri</b> karena tidak melanjutkan proses pendaftaran atau registrasi selama 2 minggu. Keputusan ini dibuat otomatis oleh sistem.</>
          : <><b>Pendaftaran Anda berstatus mundur.</b>{reg.cancelledReason && reg.cancelledReason !== '-' ? ` Alasan tercatat: ${reg.cancelledReason}.` : ''}</>} Anda tetap dapat melanjutkan prosesnya dari tahap terakhir dengan menekan tombol Lanjutkan proses.</p>
        <button className="btn-primary" onClick={() => act(resumeRegistration(reg.id), 'Proses dilanjutkan. Selesaikan tahapan berikutnya dalam 2 minggu.')}>Lanjutkan proses</button>
      </div>}
      {dead && !reg.canResume && <div role="alert" className="mb-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><IconAlertCircle className="shrink-0 text-amber-700" /><p>{reg.status === 'expired' ? 'Registrasi ulang melewati batas waktu, sehingga Anda dianggap mengundurkan diri.' : reg.cancelledReason || 'Registrasi dibatalkan.'} Hubungi admin bila ini keliru.</p></div>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ol className="min-w-0">
        <Step n={1} title="Registrasi" state="done">Akun dibuat {dateID(reg.createdAt)}.</Step>

        <Step n={2} title="Isi data diri" state={needsData ? 'now' : 'done'}>
          {needsData ? <><p className="text-sm">Lengkapi identitas, alamat, dan pendidikan. Setelah itu Anda akan diminta membayar biaya pendaftaran.</p><Link to="/app/data-diri" className="btn-primary mt-3">Isi data diri</Link></> : 'Data diri lengkap.'}
        </Step>

        <Step n={3} title={`Bayar pendaftaran ${rupiah(regFee)}`} state={needsData ? 'next' : st(1)}>
          {reg.stage === 'bayar_daftar' || reg.stage === 'data' ? <>
            <p className="text-sm">Transfer tepat <b>{rupiah(regFee)}</b>, lalu unggah bukti. Tanpa bukti pembayaran, ujian online belum bisa dibuka.</p>
            <Bank />
            <PaymentState reg={reg} kind="pendaftaran" />
            <div className="mt-3"><ProofButton reg={reg} kind="pendaftaran" amount={regFee} label="Unggah bukti pembayaran" /></div>
          </> : 'Pembayaran pendaftaran sudah dikonfirmasi.'}
        </Step>

        <Step n={4} title="Ujian online" state={st(2)}>
          {reg.stage === 'ujian' ? <><p className="text-sm">Ujian dikerjakan di aplikasi. Token diberikan otomatis oleh sistem (berlaku 1 hari), tidak perlu menghubungi admin. Selesaikan ujian agar bisa lanjut ke tahap berikutnya. Soal diambil acak dari bank soal. Nilai tidak ditampilkan ke peserta.</p><Link to="/app/ujian" className="btn-primary mt-3">Buka halaman ujian</Link></> : 'Ujian selesai dikerjakan.'}
        </Step>

        <Step n={5} title="Hasil seleksi" state={reg.stage === 'menunggu_hasil' ? 'now' : reg.stage === 'tidak_lulus' ? 'done' : st(3)}>
          {reg.stage === 'menunggu_hasil' ? <p className="text-sm">Jawaban Anda sudah masuk. Admin akan mengumumkan hasil lewat aplikasi dan email.</p>
            : reg.stage === 'tidak_lulus' ? <p>Anda belum dapat diterima pada batch ini.</p>
            : <span>Dinyatakan lulus dan diterima. <a className="inline-flex items-center gap-1 font-semibold text-brand-600 underline" href={`/api/surat/${reg.id}/pdf`} target="_blank" rel="noreferrer"><IconDownload size={15} />Surat kelulusan</a></span>}
        </Step>

        <Step n={6} title="Registrasi ulang" state={reg.stage === 'tidak_lulus' ? 'next' : st(4)}>
          {reg.stage === 'registrasi_ulang' ? <Reenroll reg={reg} /> : 'Registrasi ulang sudah dikonfirmasi.'}
        </Step>

        <Step n={7} title="Mulai kelas" state="next" />
      </ol>
      <RingkasanBayar reg={reg} />
      </div>
    </>
  )
}
