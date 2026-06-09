// Minimal, update-safe service worker.
//
// It exists only so the app stays installable as a PWA. It deliberately does
// NOT cache application code: a new deploy is always fetched fresh, so a stale
// bundle can never be served (which previously caused "old UI after redeploy").
// On activation it also wipes any caches left behind by older SW versions.

const CACHE_PREFIX = 'ai-wa-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Pass-through: let the browser handle every request from the network as usual.
self.addEventListener('fetch', () => {});
