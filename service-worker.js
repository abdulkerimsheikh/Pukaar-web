// service-worker.js
const CACHE_NAME = "pukaar-cache-v2";
const OFFLINE_URL = "offline.html";

const ASSETS = [
  "./",
  "./index.html",
  "./about.html",
  "./contact.html",
  "./profile.html",
  "./assets/style.css",
  "./script.js",
  "./json/data.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  OFFLINE_URL
];

// === Install ===
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// === Activate ===
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// === Fetch ===
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // API/network requests use network-first
  if (request.url.includes("overpass-api") || request.url.endsWith("data.json")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For HTML navigation: fallback to offline.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // For static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    )
  );
});
