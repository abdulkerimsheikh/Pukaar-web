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

  // ✅ Toast utility
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

  // ✅ Theme toggle
  (() => {
    const themeBtn = qs("#theme-toggle");
    const saved = localStorage.getItem("pukaar-theme");
    if (saved === "dark") {
      document.body.classList.add("dark");
      themeBtn.innerText = "☀️";
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

  // ✅ Map setup
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
      map = L.map("map").setView([lat, lng], zoom);
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
      if (!s.lat || !s.lng) return;
      const icon = ICONS[s.type] || ICONS.default;
      const popupHtml = `<strong>${s.name}</strong><br>${s.address || ""}${
        s.phone ? `<br>Tel: ${s.phone}` : ""
      }${s.distance ? `<br><small>${s.distance} km</small>` : ""}`;
      const marker = L.marker([s.lat, s.lng], { icon })
        .addTo(map)
        .bindPopup(popupHtml);
      markers.push(marker);
    });
  }

  // ✅ Favorites system with duplicate prevention + animation
  const getFavorites = () =>
    JSON.parse(localStorage.getItem("favorites") || "[]");
  const saveFavorites = (f) =>
    localStorage.setItem("favorites", JSON.stringify(f));

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

  // ✅ Accurate distance
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

  // ✅ Data fetching
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
    addServiceMarkers(data);
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

  // ✅ Display results + favorite button animation
  function displayResults(services) {
    const container = qs("#results");
    const radar = document.getElementById("resultsLoading");
    if (radar) radar.style.display = "none";
    container.innerHTML = "";
    if (!services.length) return;

    services.forEach((s) => {
      const isFav = getFavorites().some((f) => f.uid === s.uid);
      const col = document.createElement("div");
      col.className = "col-12 col-md-6 mb-3";
      col.innerHTML = `
      <div class="card service-card shadow-sm ${s.type}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="fw-semibold mb-1">${s.name}</h6>
              <div class="small">${s.address}</div>
              <div class="rating mt-1">⭐ ${s.rating}</div>
              <div class="distance-text small">📍 ${s.distance} km</div>
            </div>
            <div class="d-flex flex-column gap-2 align-items-center">
              ${
                s.phone
                  ? `<a href="tel:${s.phone}" class="btn btn-sm btn-success"><i class="bi bi-telephone-fill"></i></a>`
                  : ""
              }
              <a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" class="btn btn-sm btn-primary"><i class="bi bi-geo-alt-fill"></i></a>
              <button class="btn btn-sm fav-btn ${
                isFav ? "btn-warning" : "btn-outline-warning"
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

  // ✅ Radar animation fix
  function handleFindNearby() {
    const radar = document.getElementById("resultsLoading");
    const radarCircle = document.querySelector(".radar-circle");
    const statusWrap = document.getElementById("statusWrap");
    const statusMessage = document.getElementById("statusMessage");

    if (radarCircle) radarCircle.classList.add("active");
    radar.style.display = "block";
    statusWrap.style.display = "block";
    statusMessage.textContent = "Detecting your location…";

    if (!navigator.geolocation) {
      showToast("Geolocation not supported.", "error");
      radar.style.display = "none";
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        userLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        initMap(userLocation.lat, userLocation.lng, 13);
        await fetchAndProcessData(userLocation.lat, userLocation.lng);
        radar.style.display = "none";
        statusWrap.style.display = "none";
        radarCircle.classList.remove("active");
        showToast("Location detected ✅", "success");
      },
      async () => {
        showToast("Using fallback data.", "error");
        initMap();
        await fetchAndProcessData(24.8607, 67.0011);
        radar.style.display = "none";
        statusWrap.style.display = "none";
        radarCircle.classList.remove("active");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ✅ Category filter
  function filterCategory(type) {
    const results = lastFetchedData.filter((s) => !type || s.type === type);
    displayResults(results);
    if (results.length && map) {
      map.setView([results[0].lat, results[0].lng], 13);
    }
    showToast(`Filtered by ${type || "all"}`, "success");
  }
  window.filterCategory = filterCategory;

  // ✅ Init all
  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    renderFavoritesModal();
    document.getElementById("findBtn").addEventListener("click", handleFindNearby);
    // preload default Karachi data
    fetchAndProcessData(24.8607, 67.0011);
  });
})();
