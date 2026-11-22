// Service Worker for iPod Classic Simulator PWA
const CACHE_NAME = 'ipod-classic-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/theme-green-creation.jpg',
  './assets/theme-green-deftones.jpg',
  './assets/theme-purple-aurora.jpg',
  './assets/theme-purple-blackhole.jpg',
  './assets/theme-purple-drift.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Pass-through for blob URLs and external CDNs, cache first for local files
  if (e.request.url.startsWith('blob:') || e.request.url.startsWith('data:')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).catch(() => {
        // Fallback for offline navigation
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
