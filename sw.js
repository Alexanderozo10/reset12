// RENOVA Service Worker — actualización automática y caché con fallback offline
// Cambia CACHE_VERSION cuando publiques cambios importantes en la aplicación.
const CACHE_VERSION = 'renova-cache-v3-20261013';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // No fallar toda la instalación si algún icono opcional no existe.
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (_) {
        // Se intentará descargar el recurso cuando haya conexión.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('renova-') && key !== CACHE_VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/');

  if (isPage) {
    // Network-first para que las publicaciones nuevas se vean al volver a abrir.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.ok) {
          await cache.put(request, response.clone());
          // Mantener también una copia canónica de index.html.
          if (url.pathname.endsWith('/index.html')) {
            await cache.put('./index.html', response.clone());
          }
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          Response.error();
      }
    })());
    return;
  }

  // Para recursos estáticos: usar caché, y actualizarla cuando hay conexión.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    const networkPromise = fetch(request).then(async response => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      // Actualiza en segundo plano para la próxima visita.
      event.waitUntil(networkPromise.catch(() => {}));
      return cached;
    }
    try {
      return await networkPromise;
    } catch (_) {
      return Response.error();
    }
  })());
});
