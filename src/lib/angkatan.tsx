import { useState } from 'react'
import type { State } from './store'
import type { Registration } from './types'

/** Nilai filter: 'all' (semua), 'none' (belum punya angkatan), atau nomor angkatan sebagai string. */
export type AngkatanValue = string

/**
 * Angkatan ke-berapa sebuah pendaftaran, dari angkatan yang ditetapkan admin.
 * null bila belum ditetapkan (pendaftar baru mendapat angkatan setelah lulus seleksi) atau angkatannya belum bernomor.
 */
export function angkatanKe(s: Pick<State, 'batches'>, r: Registration): number | null {
  const b = r.batchId ? s.batches.find((x) => x.id === r.batchId) : undefined
  return b?.angkatan ?? null
}

/** Pilihan yang sedang aktif; awalnya semua angkatan. */
export function useAngkatan(initial: AngkatanValue = 'all'): [AngkatanValue, (v: AngkatanValue) => void] {
  const [v, setV] = useState<AngkatanValue>(initial)
  return [v, setV]
}

export const cocokAngkatan = (value: AngkatanValue, n: number | null) =>
  value === 'all' || (value === 'none' ? n === null : n !== null && String(n) === value)

/** Pilihan angkatan: Angkatan 1, Angkatan 2, dan seterusnya, dengan jumlah data per angkatan. */
export function AngkatanFilter({ values, value, onChange }: { values: (number | null)[]; value: AngkatanValue; onChange: (v: AngkatanValue) => void }) {
  const count = new Map<number, number>()
  let none = 0
  values.forEach((n) => (n === null ? none++ : count.set(n, (count.get(n) ?? 0) + 1)))
  const opts = [...count.keys()].sort((a, b) => a - b)
  return (
    <select className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter angkatan">
      <option value="all">Semua angkatan ({values.length})</option>
      {opts.map((n) => <option key={n} value={String(n)}>Angkatan {n} ({count.get(n)})</option>)}
      {(none > 0 || value === 'none') && <option value="none">Belum ada angkatan ({none})</option>}
    </select>
  )
}
