// ======================================
// Pukaar - Main Script (Final Clean Build)
// ======================================
(() => {
  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const FALLBACK_JSON = "json/data.json";
  const RADIUS_DEFAULT = 7000;

  let lastFetchedData = [];
  let map = null;
  let userMarker = null;
  let markers = [];
  let isFetching = false;
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
  // Leaflet map setup
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
  // Favorites (localStorage)
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
  // Utility
  // ===========================
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function setLoadingState(isLoading, message = "") {
    isFetching = isLoading;
    qs("#loadingSpinner").style.display = isLoading ? "inline-block" : "none";
    qs("#statusMessage").textContent = isLoading
      ? message || "Loading..."
      : "Allow location for best results.";
  }

  // ===========================
  // Find nearby services
  // ===========================
  async function findNearby() {
    if (isFetching) return;
    setLoadingState(true, "Getting your location...");

    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser.", "error");
      setLoadingState(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      handleGeolocationSuccess,
      handleGeolocationError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  async function handleGeolocationSuccess(pos) {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    initMap(userLocation.lat, userLocation.lng, 13);
    setLoadingState(true, "Fetching data...");
    await fetchAndProcessData(userLocation.lat, userLocation.lng);
    setLoadingState(false, `${lastFetchedData.length} results found`);
    qs("#requestLocationBtn").style.display = "none";
  }

  async function handleGeolocationError(err) {
    console.error("Geolocation Error:", err);
    setLoadingState(false);
    showToast("Unable to get location. Using default data.", "error");
    initMap();
    await fetchAndProcessData();
    qs("#requestLocationBtn").style.display = "inline-block";
  }

  async function fetchAndProcessData(lat, lng) {
    let data = [];
    try {
      const overpassData = await fetchFromOverpassCombined(lat, lng);
      if (overpassData && overpassData.length > 0) {
        data = overpassData;
      } else {
        data = await (await fetch(FALLBACK_JSON)).json();
        showToast("Using fallback data. Overpass API may be down.", "info");
      }
    } catch (e) {
      console.error("Data fetch failed:", e);
      data = await (await fetch(FALLBACK_JSON)).json();
      showToast("Failed to get data. Using fallback.", "error");
    }

    data.forEach((item, index) => {
      item._uid = `s_${item.id || index}_${item.lat || 0}_${item.lng || 0}`;
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
    let query = `[out:json][timeout:25];(node${tagFilters.join(
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
      address: el.tags["addr:street"] || el.tags["addr:full"] || "Unknown address",
      phone: el.tags.phone || "",
      lat: el.lat || el.center?.lat,
      lng: el.lon || el.center?.lon,
    }));
  }

  function displayResults(services) {
    const container = qs("#results");
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

      // This is the updated card template
col.innerHTML = `
      <div class="card p-2 service-card shadow-sm">
        <div class="card-body d-flex justify-content-between align-items-start">
          <div class="me-2">
            <h6 class="mb-1">${s.name}</h6>
            <div class="small text-muted">${s.address}</div>
            <div class="small mt-2 text-warning">★ ${s.rating}</div>
          </div>

          <div class="d-flex flex-column align-items-center gap-2">
            <a href="tel:${s.phone || "1122"}" class="btn btn-sm btn-success">📞</a>
            <a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" class="btn btn-sm btn-primary">🗺</a>
            <button class="btn btn-sm ${
              isFav ? "btn-warning" : "btn-outline-warning"
            } fav-btn">${isFav ? "★" : "☆"}</button>
            <div class="distance-badge">${s.distance} km</div>
          </div>
        </div>
      </div>`;

      col.querySelector(".fav-btn").addEventListener("click", () =>
        toggleFavorite(s._uid, {
          uid: s._uid,
          id: s.id,
          name: s.name,
          address: s.address,
          phone: s.phone,
          lat: s.lat,
          lng: s.lng,
          type: s.type,
        })
      );
      container.appendChild(col);
    });
  }

  function filterAndSortResults() {
    let filtered = lastFetchedData;
    const query = qs("#searchInput").value.toLowerCase();
    const filterType = qs("#filterSelect").value;
    const sortDistanceBtn = qs("#sortDistance");
    const sortRatingBtn = qs("#sortRating");

    if (query) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.address.toLowerCase().includes(query)
      );
    }

    if (filterType) {
      filtered = filtered.filter((s) => s.type === filterType);
    }

    if (sortDistanceBtn.classList.contains("active")) {
      filtered.sort((a, b) => a.distance - b.distance);
    } else if (sortRatingBtn.classList.contains("active")) {
      filtered.sort((a, b) => b.rating - a.rating);
    }

    displayResults(filtered);
    addServiceMarkers(filtered);
  }

  function filterCategory(type) {
    qs("#filterSelect").value = type;
    filterAndSortResults();
  }
  window.filterCategory = filterCategory; // Make global

  // ===========================
  // Footer reveal animation
  // ===========================
  function initFooterReveal() {
    const footer = document.querySelector(".pukaar-footer");
    if (!footer) return;
    window.addEventListener("scroll", () => {
      const scrollPos = window.scrollY + window.innerHeight;
      if (scrollPos > document.body.scrollHeight - 200) {
        footer.classList.add("show");
      } else {
        footer.classList.remove("show");
      }
    });
  }

  // ===========================
  // Service worker
  // ===========================
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register('service-worker.js');
    });
  }

  // ===========================
  // Navbar underline animation
  // ===========================
  function initNavUnderline() {
    const nav = qs("#navLinks");
    const underline = document.querySelector(".nav-underline");
    if (!nav || !underline) return;
    const links = qsa(".nav-link");
    function moveUnderline(el) {
      const rect = el.getBoundingClientRect();
      underline.style.width = `${rect.width}px`;
      underline.style.left = `${el.offsetLeft}px`;
      underline.style.opacity = 1;
    }
    links.forEach((link) => {
      link.addEventListener("mouseenter", () => moveUnderline(link));
      link.addEventListener("mouseleave", () => (underline.style.opacity = 0));
      link.addEventListener("click", () => {
        links.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        moveUnderline(link);
      });
    });
  }

  // ===========================
  // Init and Event Listeners
  // ===========================
  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    initNavUnderline();
    renderFavoritesModal();
    initFooterReveal();
    findNearby(); // Initial fetch on load
  });

  qs("#findBtn")?.addEventListener("click", filterAndSortResults);
  qs("#searchInput")?.addEventListener("input", filterAndSortResults);
  qs("#filterSelect")?.addEventListener("change", filterAndSortResults);
  qs("#sortDistance")?.addEventListener("click", () => {
    qs("#sortDistance").classList.add("active");
    qs("#sortRating").classList.remove("active");
    filterAndSortResults();
  });
  qs("#sortRating")?.addEventListener("click", () => {
    qs("#sortRating").classList.add("active");
    qs("#sortDistance").classList.remove("active");
    filterAndSortResults();
  });
  qs("#requestLocationBtn")?.addEventListener("click", findNearby);
})();