     
     (() => {
    const theme = localStorage.getItem("pukaar-theme");
    if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark-preload");
    }
  })();
     (() => {
        const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
        const FALLBACK_JSON = "json/data.json";
        const RADIUS_DEFAULT = 7000;

        let lastFetchedData = [];
        let userLocation = null;

        const qs = (s) => document.querySelector(s);


        function showToast(message, variant = "dark") {
          const toastEl = qs("#liveToast");
          const body = qs("#toastMessage");
          if (!toastEl || !body) return alert(message);
          body.textContent = message;
          toastEl.className = `toast align-items-center text-white ${variant === "success"
            ? "bg-success"
            : variant === "error"
              ? "bg-danger"
              : "bg-dark"
            } border-0`;
          new bootstrap.Toast(toastEl).show();
        }


        // 🌓 Modern theme toggle
        const toggleBtn = document.getElementById("theme-toggle");
        const savedTheme = localStorage.getItem("pukaar-theme");

        // Apply saved or system preference
        if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
          document.body.classList.add("dark");
        }

        // Toggle theme on click
        toggleBtn.addEventListener("click", () => {
          document.body.classList.toggle("dark");
          const isDark = document.body.classList.contains("dark");
          localStorage.setItem("pukaar-theme", isDark ? "dark" : "light");
        });



        const getFavorites = () =>
          JSON.parse(localStorage.getItem("favorites") || "[]");
        const saveFavorites = (f) =>
          localStorage.setItem("favorites", JSON.stringify(f));

        function updateFavoritesCount() {
          const count = getFavorites().length;
          const badge = document.getElementById('favCountBadge');
          if (badge) badge.textContent = count;
        }


        function toggleFavorite(uid, item, btn) {
          let favs = getFavorites();
          const exists = favs.some((f) => f.uid === uid);
          if (exists) {
            favs = favs.filter((f) => f.uid !== uid);
            showToast("Removed from favorites", "info");
            btn.classList.remove("btn-warning");
            btn.classList.add("btn-outline-warning");
            btn.innerHTML = "☆";
          } else {
            favs.push(item);
            showToast("Added to favorites", "success");
            btn.classList.add("btn-warning", "pulse");
            btn.classList.remove("btn-outline-warning");
            btn.innerHTML = "★";
            setTimeout(() => btn.classList.remove("pulse"), 800);
          }
          saveFavorites(favs);
          renderFavoritesModal();
          updateFavoritesCount();

        }

        function renderFavoritesModal() {
          const list = qs("#favoritesList");
          if (!list) return;
          const favs = getFavorites();
          list.innerHTML = favs.length
            ? ""
            : `<div class="text-center text-muted w-100 py-4">No favorites saved.</div>`;
          favs.forEach((f) => {
            const col = document.createElement("div");
            col.className = "col-12 col-md-6";
            col.innerHTML = `
              <div class="card p-2 service-card">
                <div class="card-body d-flex justify-content-between align-items-start">
                  <div>
                    <h6>${f.name}</h6>
                    <div class="small text-muted">${f.address || "Unknown address"}</div>
                  </div>
                  <button class="btn btn-sm btn-danger">Remove</button>
                </div>
              </div>`;
            col.querySelector("button").addEventListener("click", () => {
              toggleFavorite(f.uid, f, document.createElement("button"));
            });
            list.appendChild(col);
          });
        }


        function getDistance(lat1, lon1, lat2, lon2) {
          const R = 6371;
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLon = ((lon2 - lon1) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return (R * c).toFixed(2);
        }


        async function fetchAndProcessData(lat, lng) {
          let data = [];
          try {
            const overpassData = await fetchFromOverpass(lat, lng);
            data = overpassData.length
              ? overpassData
              : await (await fetch(FALLBACK_JSON)).json();
          } catch {
            data = await (await fetch(FALLBACK_JSON)).json();
          }

          data.forEach((item, i) => {
            item.uid = `s_${item.id || i}_${item.lat}_${item.lng}`;
            const base = userLocation || { lat: lat, lng: lng };
            item.distance = getDistance(base.lat, base.lng, item.lat, item.lng);
            item.rating = item.rating || (Math.random() * 2 + 3).toFixed(1);
          });

          lastFetchedData = data;
          displayResults(data);
        }

        async function fetchFromOverpass(lat, lng, radius = RADIUS_DEFAULT) {
          const filters = [
            '["amenity"="hospital"]',
            '["amenity"="clinic"]',
            '["healthcare"="clinic"]',
            '["amenity"="pharmacy"]',
            '["social_facility"="food_bank"]',
          ];
          const query = `[out:json][timeout:25];
            (node${filters.join(";node")}(around:${radius},${lat},${lng});
            way${filters.join(";way")}(around:${radius},${lat},${lng});
            relation${filters.join(";relation")}(around:${radius},${lat},${lng}););
            out center;`;

          const res = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
          const json = await res.json();
          return (json.elements || []).map((el) => ({
            id: el.id,
            name: el.tags.name || "Unnamed",
            type: el.tags.amenity || el.tags.healthcare || "other",
            address:
              el.tags["addr:street"] || el.tags["addr:full"] || "Unknown address",
            phone: el.tags.phone || "",
            lat: el.lat || el.center?.lat,
            lng: el.lon || el.center?.lon,
          }));
        }


        function displayResults(services) {
          const container = qs("#results");
          const radar = document.getElementById("resultsLoading");
          if (radar) radar.style.display = "none";
          container.innerHTML = "";
          if (!services.length) return;

          services.forEach((s) => {
            const isFav = getFavorites().some((f) => f.uid === s.uid);
            const col = document.createElement("div");
            col.className = "col-12 col-md-6 col-lg-4 mb-3";
            col.innerHTML = `
            <div class="card service-card shadow-sm ${s.type}">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 class="fw-semibold mb-1">${s.name}</h6>
                    <div class="small">${s.address}</div>
                    <div class="rating mt-1">Rating ${s.rating}</div>
                    <div class="distance-text small">Distance ${s.distance} km</div>
                  </div>
                  <div class="d-flex flex-column gap-2 align-items-center">
                    ${s.phone
                ? `<a href="tel:${s.phone}" class="btn btn-sm btn-success"><i class="bi bi-telephone-fill"></i></a>`
                : ""
              }
                    <a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" class="btn btn-sm btn-primary"><i class="bi bi-geo-alt-fill"></i></a>
                    <button class="btn btn-sm fav-btn ${isFav ? "btn-warning" : "btn-outline-warning"
              }">${isFav ? "★" : "☆"}</button>
                  </div>
                </div>
              </div>
            </div>`;
            const btn = col.querySelector(".fav-btn");
            btn.addEventListener("click", () => toggleFavorite(s.uid, s, btn));
            container.appendChild(col);
          });
        }


        function handleFindNearby() {
    const radar = document.getElementById("resultsLoading");
    const radarCircle = document.querySelector(".radar-circle");
    const statusWrap = document.getElementById("statusWrap");
    const statusMessage = document.getElementById("statusMessage");

    if (radarCircle) radarCircle.classList.add("active");
    if (radar) radar.style.display = "block";
    if (statusWrap) statusWrap.style.display = "block";
    if (statusMessage) statusMessage.textContent = "Detecting your location…";

    if (!navigator.geolocation) {
      showToast("Geolocation not supported.", "error");
      if (radar) radar.style.display = "none";
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        userLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        await fetchAndProcessData(userLocation.lat, userLocation.lng);
        if (radar) radar.style.display = "none";
        if (statusWrap) statusWrap.style.display = "none";
        if (radarCircle) radarCircle.classList.remove("active");
        showToast("Location detected ", "success");
      },
      async () => {
        showToast("Using fallback data.", "error");
        await fetchAndProcessData(24.8607, 67.0011);
        if (radar) radar.style.display = "none";
        if (statusWrap) statusWrap.style.display = "none";
        if (radarCircle) radarCircle.classList.remove("active");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }



        function filterCategory(type) {
          const results = lastFetchedData.filter((s) => !type || s.type === type);
          displayResults(results);
          showToast(`Filtered by ${type || "all"}`, "success");
        }
        window.filterCategory = filterCategory;


        document.addEventListener("DOMContentLoaded", () => {
          renderFavoritesModal();
          document.getElementById("findBtn").addEventListener("click", handleFindNearby);
          fetchAndProcessData(24.8607, 67.0011);
        });
      })();

    // ====== PWA Install Banner (Fixed) ======
    let deferredPrompt;

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;

      const banner = document.getElementById("pwaBanner");
      if (banner && !localStorage.getItem("pwaBannerShown")) {
        banner.classList.remove("d-none");
      }
    });

    document.addEventListener("DOMContentLoaded", () => {
      const banner = document.getElementById("pwaBanner");
      const installBtn = document.getElementById("pwaInstallBtn");
      const closeBtn = document.getElementById("pwaCloseBtn");

      if (!banner || !installBtn || !closeBtn) return;

      installBtn.addEventListener("click", async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice.outcome === "accepted") {
            showToast("✅ Pukaar installed successfully!", "success");
          } else {
            showToast("Install dismissed", "info");
          }
          deferredPrompt = null;
        }
        banner.classList.add("d-none");
        localStorage.setItem("pwaBannerShown", "true");
      });

      closeBtn.addEventListener("click", () => {
        banner.classList.add("d-none");
        localStorage.setItem("pwaBannerShown", "true");
      });
    });



      // ===== Update theme-color meta dynamically =====
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      const updateThemeMeta = () => {
        const isDark = document.body.classList.contains('dark');
        themeMeta.setAttribute('content', isDark ? '#0b0f14' : '#ffffff');
      };
      updateThemeMeta();

      document.addEventListener("DOMContentLoaded", () => {
        const toggleThemeBtn = document.getElementById('theme-toggle');
        if (toggleThemeBtn) toggleThemeBtn.addEventListener('click', updateThemeMeta);
      });

      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('service-worker.js')

            .then(reg => console.log('✅ Service Worker registered:', reg.scope))
            .catch(err => console.error('❌ Service Worker failed:', err));
        });
      }

