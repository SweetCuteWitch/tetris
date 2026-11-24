// Офлайн-кеш Brickfall.
// При изменении файлов игры увеличивайте VERSION: так установленные копии узнают об обновлении.
const VERSION = 'v9';
const CACHE = 'brickfall-' + VERSION;
const FILES = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './pwa.js',
  './manifest.webmanifest',
  './icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Скачивает все файлы мимо HTTP-кеша браузера. Если хоть один не скачался — ошибка,
// чтобы в кеше не оказалась смесь старых и новых файлов.
async function downloadAll() {
  const entries = await Promise.all(FILES.map(async f => {
    const res = await fetch(new Request(f, { cache: 'reload' }));
    if (!res.ok) throw new Error(f + ': ' + res.status);
    return [f, res];
  }));
  const cache = await caches.open(CACHE);
  await Promise.all(entries.map(([f, res]) => cache.put(f, res)));
}

self.addEventListener('install', e => {
  // Новая версия ждёт, пока игрок не нажмёт «Обновить» (или пока приложение не закроют).
  e.waitUntil(downloadAll());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('brickfall-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  const msg = e.data || {};
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (msg.type === 'REFRESH') {
    // Принудительно перекачать все файлы текущей версии.
    const port = e.ports[0];
    e.waitUntil(
      downloadAll()
        .then(() => port && port.postMessage({ ok: true }))
        .catch(() => port && port.postMessage({ ok: false }))
    );
  }
});

// Сначала кеш (работает без интернета), сеть — только для того, чего в кеше нет.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const page = await cache.match('./index.html');
        if (page) return page;
      }
      return Response.error();
    }
  })());
});
