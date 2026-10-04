/* Daali Register — Service Worker
 * Offline-first PWA:
 *  - Navigations & app code: network-first (fresh code when online), cache fallback (offline)
 *  - Fonts / icons / manifest: cache-first (immutable assets)
 * After the first online visit the whole app works without internet.
 * Base-path aware: the app can be hosted under a sub-path (GitHub Pages) —
 * the prefix is derived from the SW registration scope at runtime.
 */
const CACHE = 'daali-v10';
const BP = new URL(self.registration.scope).pathname.replace(/\/$/, ''); // '' or '/daali-register'
const PRECACHE = [BP + '/', BP + '/manifest.json', BP + '/icons/icon-192.png', BP + '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(pathname) {
  return (
    pathname.startsWith(BP + '/fonts/') ||
    pathname.startsWith(BP + '/icons/') ||
    pathname === BP + '/favicon.ico'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // ignore requests outside our scope (e.g. other apps on the same origin)
  if (BP && !url.pathname.startsWith(BP + '/') && url.pathname !== BP) return;

  // Immutable assets → cache first
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations & code → network first, cache fallback (offline)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match(BP + '/');
          return Response.error();
        })
      )
  );
});
