// scripts/service-worker.js
const CACHE_NAME = "pukaar-cache-v1";

// Assets to precache (app shell)
const assetsToCache = [
  "../templates/index.html",
  "../templates/about.html",
  "../templates/contact.html",
  "../templates/offline.html",
  "../assets/style.css",
  "../scripts/script.js",
  "../json/manifest.json",
  "../json/data.json",
  "../assets/icons/favicon.png",
  "../assets/icons/icon-192.png",
  "../assets/icons/icon-512.png"
];

// Install: precache assets
self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(assetsToCache))
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  const url = new URL(req.url);

  // Network-first for API or JSON
  if (url.pathname.includes("/services") || url.pathname.endsWith("data.json")) {
    evt.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets
  evt.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((res) => {
            if (req.method === "GET") {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => {
            // Offline fallback for navigation
            if (req.headers.get("accept")?.includes("text/html")) {
              return caches.match("../templates/offline.html");
            }
          })
      );
    })
  );
});
