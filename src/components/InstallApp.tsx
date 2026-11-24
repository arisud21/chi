import { IconDeviceMobileDown, IconDotsVertical, IconPlus, IconShare2 } from '@tabler/icons-react'
import { useState } from 'react'
import { isIOS, usePwaInstall } from '../lib/pwa'
import { Modal } from './ui'

/** Tombol pasang aplikasi. Android dan Chrome: dialog bawaan. iPhone dan iPad: panduan Tambah ke Layar Utama. */
export function InstallButton({ className = '', label = 'Pasang aplikasi' }: { className?: string; label?: string }) {
  const { canPrompt, install, hidden } = usePwaInstall()
  const [guide, setGuide] = useState(false)
  if (hidden) return null
  const ios = isIOS()
  return (
    <>
      <button type="button" className={className} onClick={() => (canPrompt ? void install() : setGuide(true))}>
        <IconDeviceMobileDown size={18} aria-hidden />{label}
      </button>
      <Modal open={guide} title="Pasang aplikasi CHI" onClose={() => setGuide(false)}>
        {ios ? (
          <ol className="space-y-3 text-sm text-ink">
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">1</span><span>Buka halaman ini di <b>Safari</b> (di Chrome iPhone, ketuk ikon Bagikan lalu lanjut ke langkah berikutnya).</span></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">2</span><span>Ketuk tombol <b>Bagikan</b> <IconShare2 size={16} className="inline align-text-bottom" aria-label="Bagikan" /> di bagian bawah atau atas layar.</span></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">3</span><span>Gulir lalu pilih <b>Tambah ke Layar Utama</b> <IconPlus size={16} className="inline align-text-bottom" aria-hidden />.</span></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">4</span><span>Ketuk <b>Tambah</b>. Ikon CHI muncul di layar utama dan terbuka layar penuh seperti aplikasi.</span></li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm text-ink">
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">1</span><span>Buka menu peramban <IconDotsVertical size={16} className="inline align-text-bottom" aria-label="Menu" /> di pojok kanan atas.</span></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">2</span><span>Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke Layar utama</b>.</span></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700">3</span><span>Konfirmasi dengan <b>Instal</b>. Gunakan Chrome atau Edge bila pilihan itu tidak muncul.</span></li>
          </ol>
        )}
        <button type="button" className="btn-primary mt-5 w-full" onClick={() => setGuide(false)}>Mengerti</button>
      </Modal>
    </>
  )
}
