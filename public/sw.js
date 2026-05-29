const CACHE_NAME = 'MyKit-cache-v6';
const STATIC_CACHE = 'MyKit-static-v6';

// Detect the base path at runtime from the service worker's own URL.
// e.g. if sw.js is at /MyKit/sw.js → BASE = "/MyKit"
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

// App shell — always cached on install
const APP_SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.webmanifest',
];

// File extensions considered static/immutable assets
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([CACHE_NAME, STATIC_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !validCaches.has(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Skip blob: and data: — these are in-memory and can't be cached or re-fetched
  if (request.url.startsWith('blob:') || request.url.startsWith('data:')) return;

  const url = new URL(request.url);

  // Skip cross-origin requests (Firebase, Google APIs, CDNs, etc.)
  if (url.origin !== self.location.origin) return;

  // Static assets: cache-first, update in background (stale-while-revalidate)
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        try {
          const cached = await cache.match(request);
          // Fire background fetch; catch network errors so we never resolve to null
          const networkResponse = await fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => null);
          // Return cached version if available, then network, then hard 503
          if (cached) return cached;
          if (networkResponse) return networkResponse;
          return new Response('', { status: 503 });
        } catch (err) {
          const cached = await cache.match(request);
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // Navigation requests (HTML pages): network-first, fallback to cached shell
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) {
            return caches.match(BASE + '/index.html').then((cached) => cached || response);
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(BASE + '/index.html').then((cached) => cached || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || new Response('Not found', { status: 404 }))
      )
  );
});
