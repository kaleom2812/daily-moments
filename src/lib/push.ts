import { supabase } from './supabase'

export type PushState = 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushState(): Promise<PushState> {
  // iOS only exposes Web Push to a site installed to the Home Screen.
  if (isIos() && !isStandalone()) return 'ios-needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission() // must follow a user tap
  if (perm !== 'granted') throw new Error('Notification permission was not granted.')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  })
  const j = sub.toJSON()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: user!.id, endpoint: j.endpoint!, p256dh: j.keys!.p256dh, auth: j.keys!.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error && error.code !== '23505') throw new Error(error.message) // 23505 = already stored
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Ask the server to re-plan today's reminders (after an upload or a settings change).
export const replanReminders = () => supabase.functions.invoke('replan-me')
