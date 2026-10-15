/* Service worker — uygulamayı çevrimdışı çalıştırır ve güncellemeleri yönetir.
 * Strateji: önce ağ (her açılışta en yeni sürüm), ağ yoksa önbellek.
 * VERSION değeri build.js tarafından package.json'dan yazılır; değişince eski önbellek silinir. */
const VERSION = '1.0.0';
const CACHE = 'osiloskop-' + VERSION;
const FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// sayfa "Yenile" deyince bekleyen yeni sürüm hemen devreye girer
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
