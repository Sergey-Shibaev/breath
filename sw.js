// Service worker: приложение открывается без интернета.
// Стратегия: сначала отдаём сохранённую копию (мгновенный запуск), а в фоне скачиваем свежую —
// она появится при следующем открытии. При изменении списка файлов увеличьте номер версии.
const VERSION = 'dyhanie-v1';

const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'figure.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'backgrounds/registry.js',
  'backgrounds/host.js',
  'backgrounds/bubbles.js',
  'backgrounds/sea.js',
  'backgrounds/clouds.js',
  'backgrounds/aurora.js',
  'backgrounds/fireflies.js',
  'backgrounds/underwater.js',
  'sound/engine.js',
  'sound/bell.js',
  'sound/ladder.js',
  'sound/tone.js',
  'sound/wave.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const ownFile = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ownFile && !font) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: ownFile });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      const response = await fresh;
      if (response) return response;
      // нет сети и нет копии: для перехода на страницу отдаём главный экран
      if (request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }),
  );
});
