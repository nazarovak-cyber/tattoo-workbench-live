const CACHE = "tattoo-workbench-assets-v2";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/icon.svg", "/brand-board.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !["/icon.svg", "/brand-board.png"].includes(url.pathname)) return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
