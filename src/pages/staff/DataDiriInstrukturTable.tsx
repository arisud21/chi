import { IconPhoto } from '@tabler/icons-react'
import { BiodataPdf } from '../../components/BiodataPdf'
import { Empty, Table, dateID } from '../../components/ui'
import { useStore } from '../../lib/store'
import { MARITAL_LABEL, type User } from '../../lib/types'

const link = (fileId: string, text: string) => <a className="font-semibold text-brand-600 underline" href={`/api/files/${fileId}`} target="_blank" rel="noreferrer">{text}</a>

/** Super Admin: isian data diri setiap instruktur dan tautan berkasnya, dalam satu tabel. */
export function DataDiriInstrukturTable({ users }: { users: User[] }) {
  const s = useStore((x) => x)
  const list = users.filter((u) => u.role === 'instruktur')
  if (list.length === 0) return <div className="card"><Empty title="Tidak ada instruktur" body="Ubah filter atau kata pencarian, atau tambah akun instruktur lewat tombol Pengelola baru." /></div>
  return (
    <Table head={['Foto', 'Nama lengkap dan gelar', 'NIK', 'Tempat, tanggal lahir', 'Jenis kelamin', 'Status perkawinan', 'Agama', 'Alamat', 'HP', 'E-mail', 'CV', 'Sertifikat pendukung', 'Diperbarui', 'Biodata']}>
      {list.map((u) => {
        const p = s.staffProfiles.find((x) => x.userId === u.id)
        const certs = s.staffCerts.filter((c) => c.userId === u.id)
        const ttl = [p?.birthPlace, u.birthDate ? dateID(u.birthDate) : ''].filter(Boolean).join(', ')
        return (
          <tr key={u.id} className="align-top">
            <td>{p?.photoFileId
              ? <a href={`/api/files/${p.photoFileId}`} target="_blank" rel="noreferrer" aria-label={`Buka foto ${u.name}`}><img src={`/api/files/${p.photoFileId}`} alt={`Foto ${u.name}`} className="h-14 w-11 rounded-md object-cover ring-1 ring-line" /></a>
              : <span className="grid h-14 w-11 place-items-center rounded-md bg-canvas text-muted" aria-label="Belum ada foto"><IconPhoto size={18} /></span>}</td>
            <td className="min-w-44 font-semibold">{u.name}{!u.active && <span className="block text-xs font-normal text-muted">Akun nonaktif</span>}</td>
            <td className="font-mono text-xs">{u.nik || '-'}</td>
            <td className="min-w-36">{ttl || '-'}</td>
            <td>{p?.gender === 'L' ? 'Laki-laki' : p?.gender === 'P' ? 'Perempuan' : '-'}</td>
            <td>{p?.marital ? MARITAL_LABEL[p.marital] : '-'}</td>
            <td>{p?.religion || '-'}</td>
            <td className="min-w-56 whitespace-pre-line">{p?.address || '-'}</td>
            <td className="whitespace-nowrap">{u.phone || '-'}</td>
            <td>{u.email}</td>
            <td>{p?.cvFileId ? link(p.cvFileId, 'Lihat CV') : <span className="text-muted">Belum ada</span>}</td>
            <td className="min-w-48">{certs.length
              ? <ol className="list-decimal space-y-0.5 pl-4">{certs.map((c) => <li key={c.id}>{link(c.fileId, c.label)}</li>)}</ol>
              : <span className="text-muted">Tidak ada</span>}</td>
            <td className="whitespace-nowrap text-xs text-muted">{p?.updatedAt ? dateID(p.updatedAt) : 'Belum diisi'}</td>
            <td><BiodataPdf compact userId={u.id} name={u.name} /></td>
          </tr>
        )
      })}
    </Table>
  )
}
