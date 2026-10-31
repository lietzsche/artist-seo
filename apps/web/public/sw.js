// 앱 설치용 서비스 워커. 페이지는 저장하지 않고(항상 최신 내용), 인터넷이 끊겼을 때만 안내 페이지를 보여준다.
const CACHE = "offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  } else if (request.url.endsWith("/icons/icon-192.png")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
