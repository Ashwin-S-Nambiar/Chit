const CACHE = 'chit-v1';
const FIREBASE = 'https://www.gstatic.com/firebasejs/12.19.0/';
const SHELL = [
  '/',
  '/index.css',
  '/site.webmanifest',
  '/icon.svg',
  '/js/main.js',
  '/js/db.js',
  '/js/parse.js',
  '/js/qr.js',
  '/js/sheet.js',
  '/js/sound.js',
  '/js/store.js',
  '/js/tip.js',
  '/js/vendor/uqr.js',
  '/fonts/martian-mono-latin.woff2',
  '/fonts/hanken-grotesk-latin.woff2',
  `${FIREBASE}firebase-app.js`,
  `${FIREBASE}firebase-database.js`,
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const pinned = (url) =>
  url.href.startsWith(FIREBASE) || url.pathname.startsWith('/fonts/');

async function fromNetwork(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 3000)),
    ]);
    if (res.ok) cache.put(key ?? request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key ?? request, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (pinned(url)) {
    e.respondWith(caches.match(request).then((hit) => hit ?? fromNetwork(request)));
    return;
  }
  if (url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    e.respondWith(
      url.pathname === '/'
        ? fromNetwork(request, '/')
        : fetch(request).catch(() => caches.match('/')),
    );
    return;
  }
  e.respondWith(fromNetwork(request));
});
