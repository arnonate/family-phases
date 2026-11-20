// Family Phases service worker: shows pushes and opens the app on tap.
// No offline caching — the app is live data all the way down.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  // iOS revokes push permission from apps that receive a push without
  // showing a notification, so always show one.
  e.waitUntil(self.registration.showNotification(data.title || 'Family Phases', {
    body: data.body || '',
    tag: data.tag,
    renotify: !!data.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/dashboard' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/dashboard', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (win) {
      await win.focus();
      // navigate() only works on pages this worker controls
      try { return await win.navigate(url); } catch {}
    }
    return self.clients.openWindow(url);
  })());
});
