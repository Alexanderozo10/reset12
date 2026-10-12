// RENOVA · Service Worker
// Red primero para todo lo del propio sitio (así cada publicación se ve al instante)
// y caché como respaldo para abrir sin conexión.
// Al publicar cambios: sube la versión en make_dist.py (o pásala como argumento).
const CACHE_VERSION = 'renova-cache-v7';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './css/app.css?v=7',
  './js/core.js?v=7',
  './js/ui.js?v=7',
  './js/gym-routines.js?v=7',
  './js/gym-session.js?v=7',
  './js/progress.js?v=7',
  './js/dashboard.js?v=7',
  './js/nutrition.js?v=7',
  './js/agenda.js?v=7',
  './js/auth.js?v=7'
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
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return (await cache.match(request)) ||
        (request.mode === 'navigate' && ((await cache.match('./index.html')) || (await cache.match('./')))) ||
        Response.error();
    }
  })());
});
