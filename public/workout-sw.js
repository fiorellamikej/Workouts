/* Only public offline-shell assets are cached. No authenticated HTML, API responses,
   Supabase responses, videos, or staff pages enter this cache. */
const CACHE = 'ss-offline-shell-v1';
const ASSETS = ['/offline.html','/offline-workout.css','/offline/client.js','/offline/offline-store.js','/offline/training.js','/offline/exercise-logging.js','/offline/workout-performance.js','/offline/workout-sections.js'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ss-offline-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // A home-screen launch can fall back to the public shell; never cache the online page.
  if (event.request.mode === 'navigate' && !ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html').then(response => response || Response.error())));
    return;
  }
  if (!ASSETS.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname).then(response => response || Response.error())));
});
