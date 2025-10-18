    // scripts/service-worker.js
    const CACHE_NAME = "pukaar-cache-v3";
    const OFFLINE_URL = "offline.html";

    const ASSETS = [
      "./",
      "./index.html",
      "./about.html",
      "./contact.html",
      "./profile.html",
      "./assets/style.css",
      "./scripts/script.js",
      "./scripts/contact.js",
      "./json/data.json",
      "./assets/icons/icon-192.png",
      "./assets/icons/icon-512.png",
      OFFLINE_URL
    ];

    self.addEventListener("install", (event) => {
      event.waitUntil(
        (async () => {
          const cache = await caches.open(CACHE_NAME);
          for (const url of ASSETS) {
            try {
              const res = await fetch(url);
              if (res.ok) await cache.put(url, res);
              else console.warn("Skipped (not ok):", url, res.status);
            } catch (err) {
              console.warn("Skipped (failed fetch):", url, err);
            }
          }
          self.skipWaiting();
        })()
      );
    });


    // === Activate ===
    self.addEventListener("activate", (event) => {
      event.waitUntil(
        caches.keys().then((keys) =>
          Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
          )
        )
      );
      self.clients.claim();
    });

    // === Fetch Handler ===
    self.addEventListener("fetch", (event) => {
      const { request } = event;
      const url = new URL(request.url);

      // Network-first for API/data requests
      if (url.pathname.endsWith("data.json") || url.hostname.includes("overpass-api")) {
        event.respondWith(networkFirst(request));
        return;
      }

      // For navigation requests (HTML pages): use network-first with offline fallback
      if (request.mode === "navigate") {
        event.respondWith(networkFirst(request, true));
        return;
      }

      // Cache-first for static assets (CSS, JS, images)
      event.respondWith(cacheFirst(request));
    });

    // === Strategies ===
    async function cacheFirst(request) {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }
      try {
        const res = await fetch(request);
        // Clone the response before putting it in the cache
        if (res.ok) {
            const copy = res.clone();
            await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      } catch (error) {
        console.error(`Cache-first failed for ${request.url}:`, error);
        return caches.match(OFFLINE_URL);
      }
    }

    async function networkFirst(request, isNavigation = false) {
      try {
        const res = await fetch(request);
        // Clone the response before putting it in the cache
        if (res.ok) {
            const copy = res.clone();
            await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      } catch (error) {
        console.error(`Network-first failed for ${request.url}:`, error);
        const cached = await caches.match(request);
        // For navigation, fallback to a specific offline page
        if (isNavigation) {
            return cached || caches.match(OFFLINE_URL);
        }
        // For other requests, just return the cached version if it exists
        return cached;
      }
    }

    // === Background Sync placeholder (future) ===
    // You can add logic here to sync queued messages
    // from contact.js when a user comes back online.