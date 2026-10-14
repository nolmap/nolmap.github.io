/*
 * 놀맵 서비스 워커
 * - 놀맵 페이지와 데이터는 항상 인터넷에서 먼저 받아요 (관리자 페이지에서 고친 내용이 바로 보이게).
 * - 인터넷이 끊겼을 때만 마지막으로 받아 둔 화면을 보여줘요. 그것도 없으면 offline.html.
 * - 사진·아이콘은 한 번 받으면 저장해 두고 써요.
 * - 다른 사이트(카카오 지도, Worker API 등)는 건드리지 않아요.
 */
const VERSION = 'nolmap-v1';
const SHELL = ['./', 'index.html', 'hours.js', 'places.json', 'offline.html', 'images/logo.png', 'manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // 외부 사이트는 그대로
  if (url.pathname.endsWith('/admin.html')) return;           // 관리자 페이지는 저장하지 않음

  const isImage = /\.(png|jpe?g|webp|gif|ico)$/i.test(url.pathname);
  if (isImage) {
    // 사진: 저장해 둔 게 있으면 바로, 없으면 받아서 저장
    event.respondWith(
      caches.open(VERSION).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // 페이지·데이터: 인터넷 먼저, 안 되면 저장본
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) caches.open(VERSION).then(cache => cache.put(req, res.clone()));
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('offline.html');
        return Response.error();
      })
  );
});
