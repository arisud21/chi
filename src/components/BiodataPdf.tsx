import { IconFileTypePdf } from '@tabler/icons-react'

/** Tautan unduh biodata (template data diri) dalam PDF. Server memeriksa hak akses. */
export function BiodataPdf({ userId, name, compact = false }: { userId: string; name?: string; compact?: boolean }) {
  return (
    <a href={`/api/biodata/${userId}/pdf`} target="_blank" rel="noreferrer" className={`btn-ghost ${compact ? '!min-h-9 !px-3' : ''}`}
      aria-label={name ? `Ekspor biodata ${name} ke PDF` : 'Ekspor biodata ke PDF'}>
      <IconFileTypePdf size={compact ? 16 : 18} />{compact ? 'PDF' : 'Ekspor PDF'}
    </a>
  )
}
