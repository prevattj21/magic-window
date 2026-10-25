// Offline support. Network first, so every deploy shows up straight away;
// the cache is only used when the phone is offline.
const CACHE = 'magic-window-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './src/main.js', './src/util.js', './src/frames.js',
  './src/eras/rome.js', './src/eras/constantinople.js', './src/eras/newyork.js', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
