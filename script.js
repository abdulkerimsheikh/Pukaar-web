// ======================================
// Pukaar - Auto Location Build (No Manual Button)
// ======================================
(() => {
  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const FALLBACK_JSON = "json/data.json";
  const RADIUS_DEFAULT = 7000;

  let lastFetchedData = [];
  let map = null;
  let userMarker = null;
  let markers = [];
  let userLocation = null;

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => document.querySelectorAll(s);

  // ===========================
  // Toast utility
  // ===========================
  function showToast(message, variant = "dark") {
    const toastEl = qs("#liveToast");
    const body = qs("#toastMessage");
    if (!toastEl || !body) return alert(message);
    body.textContent = message;
    toastEl.className = `toast align-items-center text-white ${
      variant === "success"
        ? "bg-success"
        : variant === "error"
        ? "bg-danger"
        : "bg-dark"
    } border-0`;
    new bootstrap.Toast(toastEl).show();
  }

  // ===========================
  // Theme toggle
  // ===========================
  (() => {
    const themeBtn = qs("#theme-toggle");
    const saved = localStorage.getItem("pukaar-theme");
    if (saved === "dark") {
      document.body.classList.add("dark");
      if (themeBtn) themeBtn.innerText = "☀️";
    }
    themeBtn?.addEventListener("click", () => {
      document.body.classList.toggle("dark");
      themeBtn.innerText = document.body.classList.contains("dark")
        ? "☀️"
        : "🌙";
      localStorage.setItem(
        "pukaar-theme",
        document.body.classList.contains("dark") ? "dark" : "light"
      );
    });
  })();

  // ===========================
  // Map setup
  // ===========================
  const createEmojiIcon = (emoji, bg = "#0d6efd") =>
    L.divIcon({
      html: `<div class="emoji-marker" style="background:${bg}">${emoji}</div>`,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

  const ICONS = {
    hospital: createEmojiIcon("🏥", "#dc3545"),
    clinic: createEmojiIcon("👨‍⚕️", "#0d6efd"),
    pharmacy: createEmojiIcon("💊", "#198754"),
    foodbank: createEmojiIcon("🍞", "#fd7e14"),
    user: createEmojiIcon("📍", "#0d6efd"),
    default: createEmojiIcon("📍", "#6c757d"),
  };

  function initMap(lat = 24.8607, lng = 67.0011, zoom = 13) {
    if (!map) {
      map = L.map("map", { keyboard: true }).setView([lat, lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
    } else {
      map.setView([lat, lng], zoom);
    }

    if (userMarker) userMarker.setLatLng([lat, lng]);
    else
      userMarker = L.marker([lat, lng], {
        icon: ICONS.user,
        title: "You are here",
      }).addTo(map);

    setTimeout(() => map.invalidateSize(), 200);
  }

  function clearMarkers() {
    markers.forEach((m) => map.removeLayer(m));
    markers = [];
  }

  function addServiceMarkers(services) {
    clearMarkers();
    services.forEach((s) => {
      const type = s.type || "default";
      const icon = ICONS[type] || ICONS.default;
      if (!s.lat || !s.lng) return;
      const popupHtml = `<strong>${s.name}</strong><br>${s.address || ""}${
        s.phone ? `<br>Tel: ${s.phone}` : ""
      }${s.distance ? `<br><small>${s.distance} km</small>` : ""}`;
      const marker = L.marker([s.lat, s.lng], { icon })
        .addTo(map)
        .bindPopup(popupHtml);
      markers.push(marker);
    });
  }

  // ===========================
  // Favorites
  // ===========================
  const getFavorites = () =>
    JSON.parse(localStorage.getItem("favorites") || "[]");
  const saveFavorites = (f) =>
    localStorage.setItem("favorites", JSON.stringify(f));

  function toggleFavorite(uid, item) {
    let favs = getFavorites();
    const idx = favs.findIndex((f) => f.uid === uid);
    if (idx >= 0) {
      favs.splice(idx, 1);
      showToast("Removed from favorites", "info");
    } else {
      favs.push(item);
      showToast("Saved to favorites", "success");
    }
    saveFavorites(favs);
    renderFavoritesModal();
    displayResults(lastFetchedData);
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
            <div class="d-flex flex-column gap-2">
              <a href="tel:${f.phone || "1122"}" class="btn btn-sm btn-success">📞</a>
              <button class="btn btn-sm btn-danger mt-2 remove-fav-btn">Remove</button>
            </div>
          </div>
        </div>`;
      col
        .querySelector(".remove-fav-btn")
        .addEventListener("click", () => toggleFavorite(f.uid, f));
      list.appendChild(col);
    });
  }

  // ===========================
  // Data Fetch
  // ===========================
  async function fetchAndProcessData(lat, lng) {
    let data = [];
    try {
      const overpassData = await fetchFromOverpassCombined(lat, lng);
      data = overpassData?.length
        ? overpassData
        : await (await fetch(FALLBACK_JSON)).json();
    } catch {
      data = await (await fetch(FALLBACK_JSON)).json();
    }

    data.forEach((item, i) => {
      item._uid = `s_${item.id || i}_${item.lat}_${item.lng}`;
      item.distance = userLocation
        ? getDistance(userLocation.lat, userLocation.lng, item.lat, item.lng).toFixed(2)
        : null;
      item.rating = item.rating || (Math.random() * 2 + 3).toFixed(1);
    });

    lastFetchedData = data;
    displayResults(data);
    addServiceMarkers(data);
  }

  async function fetchFromOverpassCombined(lat, lng, radius = RADIUS_DEFAULT) {
    const tagFilters = [
      '["amenity"="hospital"]',
      '["amenity"="clinic"]',
      '["healthcare"="clinic"]',
      '["amenity"="pharmacy"]',
      '["social_facility"="food_bank"]',
    ];
    const query = `[out:json][timeout:25];(node${tagFilters.join(
      ";node"
    )}(around:${radius},${lat},${lng});way${tagFilters.join(
      ";way"
    )}(around:${radius},${lat},${lng});relation${tagFilters.join(
      ";relation"
    )}(around:${radius},${lat},${lng}););out center;`;

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

  // ===========================
  // Results Display
  // ===========================
  function displayResults(services) {
    const container = qs("#results");
    const radar = document.getElementById("resultsLoading");
    if (radar) radar.style.display = "none";

    container.innerHTML = "";
    if (!services.length) {
      qs("#emptyState").classList.remove("d-none");
      return;
    }
    qs("#emptyState").classList.add("d-none");

    services.forEach((s) => {
      const isFav = getFavorites().some((f) => f.uid === s._uid);
      const col = document.createElement("div");
      col.className = "col-12 col-md-6 mb-3";
      col.innerHTML = `
      <div class="card service-card shadow-sm ${s.type}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="service-info">
              <h6 class="fw-semibold mb-1">${s.name}</h6>
              <div class="small">${s.address}</div>
              <div class="rating mt-1">Rating: ${s.rating}</div>
              <div class="distance-text small">Distance: ${s.distance} km</div>
            </div>
            <div class="action-buttons d-flex flex-column align-items-center gap-2">
              ${
                s.phone
                  ? `<a href="tel:${s.phone}" class="btn btn-sm btn-success"><i class="bi bi-telephone-fill"></i></a>`
                  : ""
              }
              <a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank"
                class="btn btn-sm btn-primary"><i class="bi bi-geo-alt-fill"></i></a>
              <button class="btn btn-sm fav-btn ${
                isFav ? "btn-warning" : "btn-outline-warning"
              }">${isFav ? "★" : "☆"}</button>
            </div>
          </div>
        </div>
      </div>`;
      col
        .querySelector(".fav-btn")
        .addEventListener("click", () =>
          toggleFavorite(s._uid, s)
        );
      container.appendChild(col);
    });
  }

  // ===========================
  // Footer + Nav effects
  // ===========================
  function initFooterReveal() {
    const footer = document.querySelector(".pukaar-footer");
    if (!footer) return;
    window.addEventListener("scroll", () => {
      const scrollPos = window.scrollY + window.innerHeight;
      footer.classList.toggle(
        "show",
        scrollPos > document.body.scrollHeight - 200
      );
    });
  }

  // ===========================
  // Auto Geolocation
  // ===========================
  function autoLocate() {
    const radar = document.getElementById("resultsLoading");
    const radarTitle = document.getElementById("radarTitle");
    const radarSubtitle = document.getElementById("radarSubtitle");
    if (radarTitle) radarTitle.textContent = "📍 Requesting location access...";
    radar.style.display = "block";

    if (!navigator.geolocation) {
      showToast("Geolocation not supported by browser.", "error");
      radarTitle.textContent = "Location not supported";
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        initMap(userLocation.lat, userLocation.lng, 13);
        showToast("Location detected ✅", "success");
        radarTitle.textContent = "Fetching nearby services...";
        await fetchAndProcessData(userLocation.lat, userLocation.lng);
      },
      (err) => {
        console.warn(err);
        radarTitle.textContent = "Location access denied";
        radarSubtitle.textContent =
          "You can still search manually or use fallback data.";
        initMap();
        fetchAndProcessData();
        showToast("Using fallback data.", "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  // ===========================
  // Init
  // ===========================
  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    renderFavoritesModal();
    initFooterReveal();
    autoLocate(); // 🔥 automatically request location on load
  });
})();
