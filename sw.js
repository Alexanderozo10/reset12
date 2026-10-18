// RENOVA · Service Worker
// Red primero para todo lo del propio sitio (así cada publicación se ve al instante)
// y caché como respaldo para abrir sin conexión.
// Al publicar cambios: sube la versión en make_dist.py (o pásala como argumento).
const CACHE_VERSION = 'renova-cache-v18';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icons/agua.png',
  './icons/habitos.png',
  './icons/entreno.png',
  './icons/comi.png',
  './css/app.css?v=18',
  './js/core.js?v=18',
  './js/ui.js?v=18',
  './js/gym-routines.js?v=18',
  './js/gym-session.js?v=18',
  './js/progress.js?v=18',
  './js/dashboard.js?v=18',
  './js/nutrition.js?v=18',
  './js/agenda.js?v=18',
  './js/shortcuts.js?v=18',
  './js/auth.js?v=18'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (_) { /* se descargará cuando haya conexión */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('renova-') && k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok && !(request.mode === 'navigate' && url.search)) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return (await cache.match(request)) ||
        (request.mode === 'navigate' && ((await cache.match('./index.html')) || (await cache.match('./')))) ||
        Response.error();
    }
  })());
});

// Recordatorios (Web Push): muestra la notificación y al tocarla abre RENOVA en la sección indicada
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'RENOVA', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'RENOVA', {
    body: d.body || '', icon: './icon-192.png', badge: './icon-192.png', tag: d.tag || 'renova', renotify: true,
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.registration.scope) && 'navigate' in w) { await w.navigate(url); return w.focus(); } }
    return self.clients.openWindow(url);
  })());
});
