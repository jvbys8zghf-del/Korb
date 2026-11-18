// Korb – Service Worker: App offline verfügbar machen, Mitteilungen anzeigen.
// Bei jeder Änderung an App-Dateien VERSION erhöhen, dann bekommen alle Geräte den Hinweis „Neue Version“.
const VERSION = 'korb-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/store.js', './js/backend.js', './js/config.js', './js/idb.js', './js/logic.js', './js/catalog.js',
  './js/dom.js', './js/home.js', './js/sheets.js', './js/onboarding.js', './js/push.js',
  './vendor/supabase-2.118.0.js', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Nur eigene Dateien aus dem Cache. Anfragen an Supabase gehen immer ins Netz.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'Korb', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Korb', {
    body: data.body || '', tag: data.tag || 'korb', icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: data.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => 'focus' in c);
    return win ? win.focus() : self.clients.openWindow(e.notification.data?.url || './');
  }));
});
