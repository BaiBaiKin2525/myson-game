// ネットに つながる ときは かならず さいしんを とりに いく（ふるい ファイルと あたらしい ファイルが まざらない ように）。
// つながらない ときは キャッシュを つかう。ファイルを ふやしたら FILES に たし、VERSION を あげる。
const VERSION = 'g8';
const FILES = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'bridge.js',
  'sprites.js',
  'world.js',
  'ui.js',
  'cutin.js',
  'game.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // cache: 'no-cache'：ブラウザの キャッシュ（GitHub Pages は 10ぷん）に ふるい ファイルが あっても サーバーに たしかめる
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
