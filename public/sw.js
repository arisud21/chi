/* Service worker CHI. Hanya menyimpan berkas statis; data /api tidak pernah disimpan agar nilai dan tagihan selalu terbaru. */
const VERSION = 'chi-v1'
const SHELL = ['/', '/manifest.webmanifest', '/logo.jpg', '/icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const isStatic = (url) => /^\/(assets|icons|landing)\//.test(url.pathname) || /\.(?:png|jpe?g|svg|webp|woff2?|css|js)$/.test(url.pathname)

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads') || url.pathname === '/sw.js') return

  // Halaman: utamakan jaringan, jatuh ke cangkang aplikasi saat offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); return res })
        .catch(() => caches.match('/').then((r) => r ?? new Response('Anda sedang offline. Sambungkan ke internet lalu coba lagi.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))),
    )
    return
  }

  // Berkas statis: pakai simpanan lalu perbarui di latar belakang.
  if (isStatic(url)) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req)
        const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res }).catch(() => hit)
        return hit ?? net
      }),
    )
  }
})
