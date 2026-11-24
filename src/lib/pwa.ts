import { useSyncExternalStore } from 'react'

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

/** iPhone, iPad, dan iPadOS yang menyamar sebagai Mac. Di semua peramban iOS, pemasangan lewat menu Bagikan. */
export const isIOS = () =>
  typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Dipanggil sekali saat aplikasi dimulai: daftarkan service worker dan tangkap tawaran pasang dari peramban. */
export function initPwa() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit() })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function usePwaInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false)
  const done = useSyncExternalStore(subscribe, () => installed, () => false)
  const install = async () => {
    if (!deferred) return false
    const ev = deferred
    deferred = null; emit()
    await ev.prompt()
    return (await ev.userChoice).outcome === 'accepted'
  }
  return { canPrompt, install, hidden: done || isStandalone() }
}
