import { IconBrandWhatsapp } from '@tabler/icons-react'

/** Nomor Indonesia ke format internasional tanpa plus (0812... atau 812... menjadi 62812...). Null bila bukan nomor yang masuk akal. */
export function waNumber(phone?: string): string | null {
  let d = (phone ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return /^\d{9,15}$/.test(d) ? d : null
}

export const waLink = (phone: string | undefined, text: string) => {
  const n = waNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

const SIGN = '\n\nSalam,\nAdmin Cimahi Hotel Institute'

/** Pesan awal menurut tahap pendaftaran. Admin masih bisa mengubah isinya di WhatsApp sebelum mengirim. */
export function stageMessage(name: string, stage: string): string {
  const first = name.split(' ')[0]
  const body: Record<string, string> = {
    data: 'Kami melihat data diri Anda di aplikasi pendaftaran belum lengkap. Mohon dilengkapi agar proses pendaftaran bisa dilanjutkan.',
    bayar_daftar: 'Data diri Anda sudah lengkap. Silakan lakukan pembayaran biaya pendaftaran dan unggah bukti pembayarannya di aplikasi.',
    ujian: 'Pembayaran pendaftaran Anda sudah kami terima. Ujian online sudah dapat diikuti melalui aplikasi; token diberikan otomatis oleh sistem.',
    menunggu_hasil: 'Ujian online Anda sudah kami terima. Hasil seleksi akan diumumkan melalui aplikasi.',
    registrasi_ulang: 'Selamat, Anda dinyatakan lulus dan diterima. Silakan unduh surat kelulusan di aplikasi, lalu lakukan registrasi ulang sebelum batas waktu.',
    aktif: 'Kami ingin menyampaikan informasi terkait kegiatan Anda sebagai peserta didik.',
    tidak_lulus: 'Kami ingin menyampaikan informasi terkait hasil seleksi Anda.',
  }
  return `Halo ${first}, ${body[stage] ?? 'kami ingin menyampaikan informasi terkait pendaftaran Anda.'}${SIGN}`
}

/** Pesan awal untuk pendaftar yang mundur: menanyakan kendalanya dan mengajak melanjutkan proses. */
export function withdrawnMessage(name: string, auto: boolean): string {
  const first = name.split(' ')[0]
  const why = auto ? 'tercatat mengundurkan diri karena belum ada kelanjutan proses selama 2 minggu' : 'tercatat mengundurkan diri'
  return `Halo ${first}, pendaftaran Anda di Cimahi Hotel Institute ${why}. Apakah ada kendala yang bisa kami bantu? Bila masih berminat, Anda dapat melanjutkan prosesnya dengan menekan tombol Lanjutkan proses di aplikasi pendaftaran, atau balas pesan ini agar kami bantu.${SIGN}`
}

/** Tombol yang membuka percakapan WhatsApp dengan pesan awal. Nonaktif bila nomor tidak valid. */
export function WaButton({ phone, text, label = 'WhatsApp', compact = false }: { phone?: string; text: string; label?: string; compact?: boolean }) {
  const href = waLink(phone, text)
  const cls = `btn-ghost ${compact ? '!min-h-9' : ''} text-emerald-700`
  if (!href) return <span className={`${cls} cursor-not-allowed opacity-50`} title="Nomor telepon belum ada atau tidak valid" aria-disabled="true"><IconBrandWhatsapp size={18} />{label}</span>
  return <a className={cls} href={href} target="_blank" rel="noreferrer" aria-label={`${label}: buka percakapan di WhatsApp`}><IconBrandWhatsapp size={18} />{label}</a>
}
