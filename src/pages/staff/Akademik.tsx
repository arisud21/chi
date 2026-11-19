import { useState } from 'react'
import { Field, useAct } from '../../components/ui'
import { sendAnnouncement, teachesBatch, useStore } from '../../lib/store'

function useMyBatches() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const batches = s.batches.filter((b) => me.role !== 'instruktur' || teachesBatch(s, me.id, b.id))
  return { s, me, batches }
}

/* ---------------- Pengumuman (EML-4, LRN-5) ---------------- */
export function PengumumanForm() {
  const { s, me, batches } = useMyBatches()
  const act = useAct()
  const [scope, setScope] = useState<'all' | 'program' | 'batch'>(me.role === 'instruktur' ? 'batch' : 'all')
  const [target, setTarget] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const options = scope === 'program' ? s.programs.filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.title })) : batches.map((b) => ({ id: b.id, label: b.code }))
  return (
    <form className="card mb-6 grid gap-3 p-5 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(sendAnnouncement(scope, target || options[0]?.id || '', subject, body), 'Pengumuman masuk antrean email.', () => { setSubject(''); setBody('') }) }}>
      <h2 className="font-bold md:col-span-2">Kirim pengumuman</h2>
      <Field label="Penerima">
        <select className="input" value={scope} onChange={(e) => { setScope(e.target.value as any); setTarget('') }}>
          {me.role !== 'instruktur' && <option value="all">Semua peserta aktif</option>}{me.role !== 'instruktur' && <option value="program">Per program</option>}<option value="batch">Per angkatan</option>
        </select>
      </Field>
      {scope !== 'all' && <Field label="Pilih"><select className="input" value={target || options[0]?.id} onChange={(e) => setTarget(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>}
      <div className="md:col-span-2"><Field label="Subjek"><input className="input" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field></div>
      <div className="md:col-span-2"><Field label="Isi"><textarea className="input !py-2" required rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></Field></div>
      <div className="md:col-span-2"><button className="btn-primary">Kirim ke antrean</button></div>
    </form>
  )
}
