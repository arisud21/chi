/*
 * Kanal realtime (Server-Sent Events). Server hanya memberi tahu "ada yang baru"; isinya tetap diambil klien lewat /api/state
 * yang sudah memfilter menurut role, jadi tidak ada data peserta yang lewat kanal ini.
 */
const clients = new Set()

export function addClient(req, res, user) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders?.()
  res.write('retry: 3000\n\n')
  const client = { userId: user.id, role: user.role, res }
  clients.add(client)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => { clearInterval(ping); clients.delete(client) })
}

/** Kirim peristiwa ke pengguna tertentu (users) dan/atau role tertentu (roles, 'semua' berarti semua). Tanpa filter: semua yang terhubung. */
export function push(event, { users, roles } = {}) {
  for (const c of clients) {
    if (users && !users.includes(c.userId)) continue
    if (roles && !roles.includes('semua') && !roles.includes(c.role)) continue
    try { c.res.write(`event: ${event}\ndata: {}\n\n`) } catch { clients.delete(c) }
  }
}
