import { QRCodeSVG } from 'qrcode.react'
import type { Certificate as Cert, Program, User } from '../lib/types'
import { dateID } from './ui'

/** Tampilan sertifikat yang dirender dari data terbit. Cetak lewat dialog browser ("Simpan sebagai PDF"). */
export function CertificateView({ cert, user, program, instName, signerName, signerTitle }: { cert: Cert; user: User; program: Program; instName: string; signerName?: string; signerTitle?: string }) {
  const url = `${location.origin}/verifikasi/${cert.verificationCode}`
  return (
    <div className="print-area aspect-[1.414/1] w-full overflow-hidden rounded-lg border-[10px] border-double border-brass-500 bg-white p-6 text-center text-ink sm:p-10">
      <div className="flex h-full flex-col items-center justify-between">
        <div>
          <p className="font-display text-sm font-bold tracking-[0.25em] text-brass-600 sm:text-base">{instName.toUpperCase()}</p>
          <h3 className="mt-2 font-display text-2xl font-bold sm:text-4xl">Sertifikat Pelatihan</h3>
          <p className="mt-1 text-xs text-muted sm:text-sm">{cert.number}</p>
        </div>
        <div>
          <p className="text-xs text-muted sm:text-sm">diberikan kepada</p>
          <p className="my-1 font-display text-2xl font-bold text-brand-700 sm:text-4xl">{user.name}</p>
          <p className="text-xs sm:text-sm">atas keberhasilan menyelesaikan program <b>{program.title}</b> ({program.durationHours} jam)</p>
        </div>
        <div className="flex w-full items-end justify-between text-left text-[10px] sm:text-xs">
          <div><p className="text-muted">Diterbitkan</p><p className="font-semibold">{dateID(cert.issuedAt)}</p></div>
          <div className="text-center"><p className="font-semibold">{signerTitle ?? 'Kepala Akademik'}</p><p className="mt-5 border-t border-ink pt-1 font-semibold sm:mt-8">{signerName ?? ''}</p></div>
          <div className="flex items-end gap-2">
            <div className="text-right"><p className="text-muted">Kode verifikasi</p><p className="font-mono font-bold">{cert.verificationCode}</p></div>
            <QRCodeSVG value={url} size={56} />
          </div>
        </div>
      </div>
    </div>
  )
}
