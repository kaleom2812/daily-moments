// Service worker: shows push notifications and routes taps back into the app.
// A push is best-effort: the browser/OS decides if and when it is displayed.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = { title: 'Daily Moments', body: 'Time to capture a moment.', url: '/app' }
  try { d = { ...d, ...event.data.json() } } catch { /* use defaults */ }
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.reminderId || 'reminder',
      data: { url: d.url, reminderId: d.reminderId },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url = '/app', reminderId } = event.notification.data || {}
  const target = reminderId ? `${url}?reminder=${encodeURIComponent(reminderId)}` : url
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(target); return c.focus() }
      return self.clients.openWindow(target)
    }),
  )
})
