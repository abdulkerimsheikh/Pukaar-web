
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FALLBACK_JSON = "json/data.json";

const RADIUS_DEFAULT = 7000; // meters
let currentLang = "en";
let lastFetchedData = [];
let map = null;
let userMarker = null;
let markers = [];           // array of L.Marker
let markersMap = new Map(); // key -> marker
let isFetching = false;

/* ===========================
   Small helpers
   =========================== */
const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

function showToast(msg, type = "info"){
  const toastEl = qs("#liveToast");
  const body = qs("#toastMessage");
  if(!toastEl || !body) return;
  body.textContent = msg;
  toastEl.className = "toast align-items-center text-white " +
    (type === "success" ? "bg-success" : type === "error" ? "bg-danger" : "bg-dark");
  new bootstrap.Toast(toastEl).show();
}
function escapeHtml(s = "") {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function uid(prefix = "") { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ===========================
   Theme & language toggles
   =========================== */
const themeBtn = qs("#theme-toggle");
if(themeBtn){
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    themeBtn.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";
    localStorage.setItem("pukaar-theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
  const saved = localStorage.getItem("pukaar-theme");
  if(saved === "dark"){ document.body.classList.add("dark"); themeBtn.innerText = "☀️"; }
}
const langBtn = qs("#lang-toggle");
if(langBtn){
  langBtn.addEventListener("click", () => {
    currentLang = currentLang === "en" ? "ur" : "en";
    langBtn.innerText = currentLang === "en" ? "اردو" : "English";
    // refresh results in new language if applicable
    if(lastFetchedData.length) displayResults(lastFetchedData);
  });
}

/* ===========================
   PWA install prompt (basic)
   =========================== */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // optionally show an install button if you have one
});

/* ===========================
   Map + marker icons (emoji DivIcons to avoid image assets)
   =========================== */
function createEmojiIcon(emoji, bg = "#0d6efd"){
  return L.divIcon({
    html: `<div class="emoji-marker" style="background:${bg}">${emoji}</div>`,
    className: "",
    iconSize: [36,36],
    iconAnchor: [18,36]
  });
}
const ICONS = {
  hospital: createEmojiIcon("🏥", "#dc3545"),
  clinic: createEmojiIcon("👨‍⚕️", "#0d6efd"),
  pharmacy: createEmojiIcon("💊", "#198754"),
  foodbank: createEmojiIcon("🍞", "#fd7e14"),
  user: createEmojiIcon("📍", "#0d6efd"),
  default: createEmojiIcon("📍", "#6c757d")
};

function initMap(lat = 24.8607, lng = 67.0011, zoom = 13){
  if(!map){
    map = L.map("map", { keyboard: true }).setView([lat, lng], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
  } else {
    map.setView([lat, lng], zoom);
  }

  // user marker
  if(userMarker){
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.marker([lat,lng], { icon: ICONS.user, title: currentLang === "en" ? "You are here" : "آپ یہاں ہیں" }).addTo(map);
  }

  // ensure map displays properly
  setTimeout(() => { if(map) map.invalidateSize(); }, 200);
}

/* Clear markers */
function clearMarkers(){
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  markersMap.clear();
}

/* Add markers for services and store them keyed for interaction */
function addServiceMarkers(services){
  clearMarkers();
  services.forEach(s => {
    const type = s.type || "default";
    const icon = ICONS[type] || ICONS.default;
    const lat = +s.lat;
    const lng = +s.lng;
    if(!lat || !lng) return;
    const key = `${s.type || 't'}_${s.id || s._uid}`;
    const popupHtml = `<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.address || "")}${s.phone ? `<br>Tel: ${escapeHtml(s.phone)}` : ""}<br>${s.distance ? `<small>${s.distance} km</small>` : ""}`;
    const marker = L.marker([lat,lng], { icon }).addTo(map).bindPopup(popupHtml);
    markers.push(marker);
    markersMap.set(key, marker);
  });
}

/* ===========================
   Favorites (localStorage)
   =========================== */
function getFavorites(){ return JSON.parse(localStorage.getItem("favorites") || "[]"); }
function saveFavorites(favs){ localStorage.setItem("favorites", JSON.stringify(favs)); }
function toggleFavorite(uid, item){
  let favs = getFavorites();
  const idx = favs.findIndex(f => f.uid === uid);
  if(idx >= 0){
    favs.splice(idx,1);
    showToast(currentLang === "en" ? "Removed from favorites" : "پسندیدہ سے ہٹا دیا گیا","info");
  } else {
    favs.push({ uid, name: item.name, address: item.address, phone: item.phone, lat: item.lat, lng: item.lng, type: item.type });
    showToast(currentLang === "en" ? "Saved to favorites" : "محفوظ کیا گیا","success");
  }
  saveFavorites(favs);
  renderFavoritesModal();
}
function renderFavoritesModal(){
  const list = qs("#favoritesList");
  if(!list) return;
  const favs = getFavorites();
  if(favs.length === 0){
    list.innerHTML = `<div class="text-center text-muted w-100 py-4">${currentLang==="en" ? "No favorites saved." : "کوئی پسندیدہ محفوظ نہیں ہے۔"}</div>`;
    return;
  }
  list.innerHTML = favs.map(f => `
    <div class="col-12 col-md-6">
      <div class="card p-2 service-card">
        <div class="card-body d-flex justify-content-between align-items-start">
          <div>
            <h6 class="mb-1">${escapeHtml(f.name)}</h6>
            <div class="small text-muted">${escapeHtml(f.address)}</div>
          </div>
          <div>
            <a href="tel:${f.phone || '#'}" class="btn btn-sm btn-success">Call</a>
            <button class="btn btn-sm btn-danger mt-2" onclick="removeFavorite('${f.uid}')">Remove</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}
function removeFavorite(uid){
  let favs = getFavorites().filter(f => f.uid !== uid);
  saveFavorites(favs);
  renderFavoritesModal();
}

/* ===========================
   UI: Display results (grid)
   =========================== */
function focusOnService(item){
  const key = `${item.type || 't'}_${item.id || item._uid}`;
  const marker = markersMap.get(key);
  if(marker){
    map.setView(marker.getLatLng(), 15, { animate:true });
    marker.openPopup();
  } else if(item.lat && item.lng){
    map.setView([item.lat, item.lng], 15, { animate:true });
  }
}
function displayResults(services){
  const container = qs("#results");
  const empty = qs("#emptyState");
  container.innerHTML = "";
  if(!services || services.length === 0){
    if(empty) empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  services.forEach(s => {
    const uidKey = s.id || s._uid || uid("s_");
    s._uid = uidKey;

    const col = document.createElement("div");
    col.className = "col-12 col-md-6";
    col.innerHTML = `
      <div class="card service-card position-relative">
        ${s.distance ? `<span class="distance-badge">${s.distance} km</span>` : ""}
        <div class="card-body">
          <h6 class="mb-1">${escapeHtml(s.name)}</h6>
          <div class="small text-muted">${escapeHtml(s.address || "")}</div>
          <div class="mt-3 d-flex gap-2">
            <a class="btn btn-sm btn-success" href="tel:${s.phone || '#'}">📞</a>
            <a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${s.lat},${s.lng}">🗺</a>
            <button class="btn btn-sm btn-outline-warning" data-uid="${s._uid}">${isFavorited(s) ? "★" : "☆"}</button>
            <button class="btn btn-sm btn-outline-secondary ms-auto btn-focus">Focus</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(col);

    // focus button
    const focusBtn = col.querySelector(".btn-focus");
    focusBtn.addEventListener("click", () => focusOnService(s));

    // favorite button
    const favBtn = col.querySelector("button[data-uid]");
    favBtn.addEventListener("click", () => {
      toggleFavorite(`${s.type || 't'}_${s.id || s._uid}`, s);
      favBtn.textContent = isFavorited(s) ? "★" : "☆";
    });

    // clicking card body also focuses
    col.querySelector(".card-body").addEventListener("click", (ev) => {
      // avoid clicks on buttons
      if(ev.target.closest("button") || ev.target.closest("a")) return;
      focusOnService(s);
    });
  });
}

function isFavorited(s){
  const uid = `${s.type || 't'}_${s.id || s._uid}`;
  return getFavorites().some(f => f.uid === uid);
}

/* ===========================
   Sorting
   =========================== */
qs("#sortDistance")?.addEventListener("click", () => {
  lastFetchedData.sort((a,b)=> (a.distance||999) - (b.distance||999));
  displayResults(lastFetchedData);
});
qs("#sortRating")?.addEventListener("click", () => {
  lastFetchedData.sort((a,b)=> (b.rating||0) - (a.rating||0));
  displayResults(lastFetchedData);
});

/* ===========================
   Live search suggestions
   =========================== */
const searchInput = qs("#searchInput");
const suggestionsWrap = null; // (not using separate suggestions UI here). Keep search simple.
if(searchInput){
  searchInput.addEventListener("keydown", (e) => { if(e.key === "Enter") findNearby(); });
}

/* ===========================
   Overpass combined fetch
   - nodes/ways/relations
   - returns normalized array with lat,lng,name,type,address,phone,id
   =========================== */
function detectTypeFromTags(tags){
  if(!tags) return "other";
  if(tags.amenity === "hospital") return "hospital";
  if(tags.amenity === "clinic" || tags.healthcare === "clinic" ) return "clinic";
  if(tags.amenity === "doctors") return "clinic";
  if(tags.amenity === "pharmacy") return "pharmacy";
  if(tags.social_facility === "food_bank") return "foodbank";
  if(tags.amenity === "social_facility" || tags.amenity === "charity") {
    // try to detect food bank by tag, else 'foodbank' as fallback for charities
    if(tags.social_facility === "food_bank" || (tags.charity && tags.charity.toLowerCase().includes("food"))) return "foodbank";
    return "foodbank";
  }
  return "other";
}

async function fetchFromOverpassCombined(lat, lng, radius = RADIUS_DEFAULT){
  // Good practice: timeout and compact query
  const tagFilters = [
    '["amenity"="hospital"]',
    '["amenity"="clinic"]',
    '["healthcare"="clinic"]',
    '["amenity"="doctors"]',
    '["amenity"="pharmacy"]',
    '["social_facility"="food_bank"]',
    '["amenity"="social_facility"]',
    '["amenity"="charity"]'
  ];

  let parts = "";
  for(const f of tagFilters){
    parts += `node${f}(around:${radius},${lat},${lng});way${f}(around:${radius},${lat},${lng});relation${f}(around:${radius},${lat},${lng});\n`;
  }

  const query = `[out:json][timeout:25];
  (
    ${parts}
  );
  out center;`;

  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if(!res.ok) throw new Error("Overpass error " + res.status);
    const json = await res.json();
    const elements = json.elements || [];

    // Normalize elements
    const results = elements.map(el => {
      const tags = el.tags || {};
      // for ways/relations center is present
      const latval = el.lat || (el.center && el.center.lat) || el.bounds && el.bounds.minlat;
      const lonval = el.lon || (el.center && el.center.lon) || el.bounds && el.bounds.minlon;
      const type = detectTypeFromTags(tags);
      let addr = "";
      if(tags["addr:street"]) addr += tags["addr:street"];
      if(tags["addr:housenumber"]) addr = (addr ? addr + " " : "") + tags["addr:housenumber"];
      if(tags["addr:city"]) addr = (addr ? addr + ", " : "") + tags["addr:city"];
      if(!addr && tags["addr:place"]) addr = tags["addr:place"];
      if(!addr && tags.vicinity) addr = tags.vicinity;
      const phone = tags.phone || tags["contact:phone"] || tags["phone:mobile"] || "";
      return {
        id: el.id,
        name: tags.name || (type.charAt(0).toUpperCase() + type.slice(1)),
        type,
        address: addr || tags.name || "Unknown address",
        phone,
        lat: latval,
        lng: lonval,
        rawTags: tags
      };
    });

    // dedupe by name+coords
    const dedup = [];
    const seen = new Set();
    for(const r of results){
      const key = `${r.name}__${String(r.lat).slice(0,6)}_${String(r.lng).slice(0,6)}`;
      if(!seen.has(key) && r.lat && r.lng){
        seen.add(key);
        dedup.push(r);
      }
    }
    return dedup;
  } catch (err){
    console.warn("Overpass fetch error:", err);
    return [];
  }
}

/* ===========================
   getDistance (Haversine) in km
   =========================== */
function getDistance(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = (d)=> d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/* ===========================
   Main: findNearby
   - shows spinner/dots, requests geolocation
   - fetches Overpass combined
   - falls back to local JSON
   - computes distances, sorts, displays and markers
   =========================== */
async function findNearby(){
  // prevent multiple concurrent fetches
  if(isFetching) return;
  isFetching = true;

  // UI: show spinner/dots
  qs("#statusMessage").textContent = currentLang === "en" ? "Getting location" : "مقام حاصل کیا جا رہا ہے";
  qs("#loadingSpinner").style.display = "inline-block";
  qs("#dots").style.display = "inline-block";
  qs("#emptyState") && qs("#emptyState").classList.add("d-none");

  if(!navigator.geolocation){
    showToast(currentLang === "en" ? "Geolocation not supported" : "جیو لوکیشن دستیاب نہیں","error");
    qs("#loadingSpinner").style.display = "none";
    qs("#dots").style.display = "none";
    isFetching = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const userLat = pos.coords.latitude;
    const userLng = pos.coords.longitude;

    // update map center & user marker
    initMap(userLat, userLng, 13);

    let data = [];
    try {
      // Attempt Overpass
      const overpass = await fetchFromOverpassCombined(userLat, userLng, RADIUS_DEFAULT);
      data = overpass;
      // if overpass is empty, fallback to local JSON
      if(!data || data.length === 0){
        const local = await fetch(FALLBACK_JSON);
        data = await local.json();
      }
    } catch (err){
      console.warn("Fetch flow failed, trying local JSON", err);
      try {
        const local = await fetch(FALLBACK_JSON);
        data = await local.json();
      } catch (e){
        showToast(currentLang === "en" ? "No data available" : "ڈیٹا دستیاب نہیں","error");
        data = [];
      }
    }

    // compute distances & ratings
    data.forEach(item => {
      if(!item._uid) item._uid = uid("s_");
      if(item.lat && item.lng){
        item.distance = parseFloat(getDistance(userLat, userLng, item.lat, item.lng).toFixed(2));
      } else {
        item.distance = null;
      }
      if(item.rating === undefined) item.rating = (Math.random()*2 + 3).toFixed(1);
      // normalize some types from fallback JSON
      if(item.type === "social_facility" || item.type === "charity") item.type = "foodbank";
      if(!item.type && item.category) item.type = item.category;
    });

    // apply filter from dropdown
    const filter = qs("#filterSelect")?.value;
    let filtered = filter ? data.filter(d => d.type === filter) : data;

    // apply search query
    const q = searchInput?.value?.trim().toLowerCase();
    if(q) filtered = filtered.filter(f => (f.name||"").toLowerCase().includes(q));

    // sort by distance
    filtered.sort((a,b) => (a.distance||999) - (b.distance||999));

    // keep last fetched
    lastFetchedData = filtered;

    // update UI
    displayResults(filtered);
    addServiceMarkers(filtered);

    qs("#statusMessage").textContent = `${filtered.length} ${currentLang==="en" ? "results" : "نتائج"}`;
    qs("#loadingSpinner").style.display = "none";
    qs("#dots").style.display = "none";
    isFetching = false;
  }, (err) => {
    console.warn("geolocation error", err);
    showToast(currentLang === "en" ? "Unable to get location" : "مقام حاصل نہیں ہوا","error");
    qs("#loadingSpinner").style.display = "none";
    qs("#dots").style.display = "none";
    isFetching = false;
  }, { enableHighAccuracy:true, timeout:15000, maximumAge:60000 });
}

/* ===========================
   Helper: filterCategory (from clicking category cards)
   =========================== */
function filterCategory(type){
  const sel = qs("#filterSelect");
  if(sel) sel.value = type;
  findNearby();
}

/* ===========================
   Service worker registration (optional)
   =========================== */
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
   navigator.serviceWorker.register("service-worker.js") // updated path
      .then(reg => console.log("SW registered", reg))
      .catch(err => console.warn("SW failed", err));
  });
}


/* ===========================
   Initialize handlers
   =========================== */
(function initHandlers(){
  // buttons
  qs("#findBtn")?.addEventListener("click", () => findNearby());
  qs("#requestLocationBtn")?.addEventListener("click", () => findNearby());
  qs("#favoritesBtn")?.addEventListener("click", () => renderFavoritesModal());
  qs("#nearestHospitalBtn")?.addEventListener("click", () => filterCategory("hospital"));

  document.addEventListener("DOMContentLoaded", () => {
    initMap();            // start map with default view
    renderFavoritesModal();
  });

  // navbar shrink
  const navbar = document.querySelector(".navbar");
  window.addEventListener("scroll", () => {
    if(window.scrollY > 50) navbar.classList.add("shrink");
    else navbar.classList.remove("shrink");
  });
})();

