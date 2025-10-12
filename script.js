/* script.js - Consolidated, cleaned-up and PWA-banner enabled script
   - Replace existing script.js with this file
   - Make sure your HTML has the necessary IDs/classes referenced below
*/

(() => {
  // ====== Config & state ======
  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const FALLBACK_JSON = "json/data.json";
  const RADIUS_DEFAULT = 7000; // meters
  let currentLang = "en";
  let lastFetchedData = [];
  let map = null;
  let userMarker = null;
  let markers = []; // L.Marker[]
  let markersMap = new Map(); // key -> marker
  let isFetching = false;
  let deferredPrompt = null;

  // PWA banner settings
  const PWA_SNOOZE_KEY = "pwa-banner-snooze"; // stores timestamp
  const PWA_SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours

  // ====== Helpers ======
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  function uid(prefix = "") { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function escapeHtml(s = "") {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Toast helper using your #liveToast element
  function showToast(message, variant = "dark") {
    const toastEl = qs("#liveToast");
    const body = qs("#toastMessage");
    if(!toastEl || !body) {
      // fallback alert
      console[variant === "bg-danger" ? "error" : "log"](message);
      return;
    }
    body.textContent = message;
    // set classes
    toastEl.className = `toast align-items-center text-white ${variant === "success" ? "bg-success" : variant === "error" ? "bg-danger" : "bg-dark"} border-0`;
    new bootstrap.Toast(toastEl).show();
  }

  // ====== Theme & language toggles ======
  (function initThemeLang() {
    const themeBtn = qs("#theme-toggle");
    const saved = localStorage.getItem("pukaar-theme");
    if(saved === "dark") {
      document.body.classList.add("dark");
      if(themeBtn) themeBtn.innerText = "☀️";
    }
    if(themeBtn) {
      themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        themeBtn.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";
        localStorage.setItem("pukaar-theme", document.body.classList.contains("dark") ? "dark" : "light");
      });
    }

    const langBtn = qs("#lang-toggle");
    if(langBtn){
      langBtn.addEventListener("click", () => {
        currentLang = currentLang === "en" ? "ur" : "en";
        langBtn.innerText = currentLang === "en" ? "اردو" : "English";
        if(lastFetchedData.length) displayResults(lastFetchedData);
      });
    }
  })();

  // ====== Map & icons ======
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

    if(userMarker){
      userMarker.setLatLng([lat, lng]);
    } else {
      userMarker = L.marker([lat, lng], { icon: ICONS.user, title: currentLang === "en" ? "You are here" : "آپ یہاں ہیں" }).addTo(map);
    }

    setTimeout(() => { if(map) map.invalidateSize(); }, 200);
  }

  function clearMarkers(){
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    markersMap.clear();
  }

  function addServiceMarkers(services){
    clearMarkers();
    services.forEach(s => {
      const type = s.type || "default";
      const icon = ICONS[type] || ICONS.default;
      const lat = +s.lat;
      const lng = +s.lng;
      if(!lat || !lng) return;
      const key = `${s.type || 't'}_${s.id || s._uid}`;
      const popupHtml = `<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.address || "")}${s.phone ? `<br>Tel: ${escapeHtml(s.phone)}` : ""}${s.distance ? `<br><small>${s.distance} km</small>` : ""}`;
      const marker = L.marker([lat,lng], { icon }).addTo(map).bindPopup(popupHtml);
      markers.push(marker);
      markersMap.set(key, marker);
    });
  }

  // ====== Favorites (localStorage) ======
  function getFavorites(){ return JSON.parse(localStorage.getItem("favorites") || "[]"); }
  function saveFavorites(favs){ localStorage.setItem("favorites", JSON.stringify(favs)); }

  function toggleFavorite(uid, itemObj){
    let favs = getFavorites();
    const idx = favs.findIndex(f => f.uid === uid);
    if(idx >= 0){
      favs.splice(idx,1);
      saveFavorites(favs);
      renderFavoritesModal();
      showToast(currentLang === "en" ? "Removed from favorites" : "پسندیدہ سے ہٹا دیا گیا","info");
    } else {
      favs.push({ uid, id: itemObj.id || null, name: itemObj.name, address: itemObj.address, phone: itemObj.phone, lat: itemObj.lat, lng: itemObj.lng, type: itemObj.type });
      saveFavorites(favs);
      renderFavoritesModal();
      showToast(currentLang === "en" ? "Saved to favorites" : "محفوظ کیا گیا","success");
    }
  }

  function renderFavoritesModal(){
    const list = qs('#favoritesList');
    if(!list) return;
    const favs = getFavorites();
    if(favs.length === 0){
      list.innerHTML = `<div class="text-center text-muted w-100 py-4">${currentLang==="en" ? "No favorites saved." : "کوئی پسندیدہ محفوظ نہیں ہے۔"}</div>`;
      return;
    }
    list.innerHTML = '';
    favs.forEach(f => {
      const phone = f.phone || '1122';
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';
      col.innerHTML = `
        <div class="card p-2 service-card">
          <div class="card-body d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-1">${escapeHtml(f.name)}</h6>
              <div class="small text-muted">${escapeHtml(f.address)}</div>
            </div>
            <div class="d-flex flex-column gap-2">
              <a href="tel:${phone}" class="btn btn-sm btn-success" aria-label="Call ${escapeHtml(f.name)}">📞</a>
              <button class="btn btn-sm btn-danger mt-2 remove-fav-btn">Remove</button>
            </div>
          </div>
        </div>
      `;
      // attach remove handler:
      col.querySelector('.remove-fav-btn').addEventListener('click', () => {
        removeFavorite(f.uid);
      });
      list.appendChild(col);
    });
  }

  function removeFavorite(uid){
    let favs = getFavorites().filter(f => f.uid !== uid);
    saveFavorites(favs);
    renderFavoritesModal();
  }

  // ====== UI: results and interaction ======
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
    if(!container) return;
    container.innerHTML = "";
    const empty = qs("#emptyState");
    const favorites = getFavorites();

    if(!services || services.length === 0){
      if(empty) empty.classList.remove('d-none');
      const meta = qs('#resultsMeta'); if(meta) meta.textContent = '—';
      return;
    }
    if(empty) empty.classList.add('d-none');
    const meta = qs('#resultsMeta'); if(meta) meta.textContent = `${services.length} ${currentLang==='en' ? 'results' : 'نتائج'}`;

    services.forEach(s => {
      const uidKey = `${s.type || 't'}_${s.id || s._uid}`;
      const isFav = favorites.some(f => f.uid === uidKey);
      const phone = s.phone || '1122';

      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';
      const card = document.createElement('div');
      card.className = 'card p-2 service-card position-relative';

      if(s.distance) {
        const badge = document.createElement('span');
        badge.className = 'distance-badge';
        badge.textContent = `${s.distance} km`;
        card.appendChild(badge);
      }

      const cardBody = document.createElement('div');
      cardBody.className = 'card-body d-flex justify-content-between align-items-start';

      const left = document.createElement('div');
      left.innerHTML = `<h6 class="mb-1">${escapeHtml(s.name)}</h6><div class="small text-muted">${escapeHtml(s.address)}</div><div class="small mt-2">Rating: ${s.rating || 'N/A'}</div>`;

      const right = document.createElement('div');
      right.className = 'd-flex flex-column gap-2';

      const callBtn = document.createElement('a');
      callBtn.className = 'btn btn-sm btn-success';
      callBtn.href = `tel:${phone}`;
      callBtn.setAttribute('aria-label', `Call ${s.name}`);
      callBtn.textContent = '📞';

      const mapsBtn = document.createElement('a');
      mapsBtn.className = 'btn btn-sm btn-primary';
      mapsBtn.target = '_blank';
      mapsBtn.rel = 'noopener';
      mapsBtn.href = `https://www.google.com/maps?q=${s.lat},${s.lng}`;
      mapsBtn.setAttribute('aria-label', `Map ${s.name}`);
      mapsBtn.textContent = '🗺';

      const favBtn = document.createElement('button');
      favBtn.className = isFav ? 'btn btn-sm btn-warning' : 'btn btn-sm btn-outline-warning';
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = currentLang === 'en' ? (isFav ? 'Remove favorite' : 'Add favorite') : (isFav ? 'ہٹائیں' : 'محفوظ کریں');
      favBtn.addEventListener('click', () => {
        toggleFavorite(uidKey, { id: s.id, name: s.name, address: s.address, phone: phone, lat: s.lat, lng: s.lng, type: s.type });
        // flip local UI quickly:
        favBtn.className = favBtn.className.includes('outline') ? 'btn btn-sm btn-warning' : 'btn btn-sm btn-outline-warning';
        favBtn.textContent = favBtn.textContent === '☆' ? '★' : '☆';
      });

      // clicking card focuses marker
      card.addEventListener('click', (ev) => {
        // ignore clicks on the buttons
        if(ev.target === callBtn || ev.target === mapsBtn || ev.target === favBtn) return;
        focusOnService(s);
      });

      right.appendChild(callBtn);
      right.appendChild(mapsBtn);
      right.appendChild(favBtn);

      cardBody.appendChild(left);
      cardBody.appendChild(right);
      card.appendChild(cardBody);
      col.appendChild(card);
      container.appendChild(col);
    });
  }

  // ====== Sorting handlers (use lastFetchedData) ======
  function attachSortHandlers(){
    qs("#sortDistance")?.addEventListener("click", () => {
      lastFetchedData.sort((a,b)=> (a.distance||999) - (b.distance||999));
      displayResults(lastFetchedData);
    });
    qs("#sortRating")?.addEventListener("click", () => {
      lastFetchedData.sort((a,b)=> (b.rating||0) - (a.rating||0));
      displayResults(lastFetchedData);
    });
  }

  // ====== Overpass + fetch normalization ======
  function detectTypeFromTags(tags){
    if(!tags) return "other";
    if(tags.amenity === "hospital") return "hospital";
    if(tags.amenity === "clinic" || tags.healthcare === "clinic") return "clinic";
    if(tags.amenity === "doctors") return "clinic";
    if(tags.amenity === "pharmacy") return "pharmacy";
    if(tags.social_facility === "food_bank") return "foodbank";
    if(tags.amenity === "social_facility" || tags.amenity === "charity") {
      if(tags.social_facility === "food_bank" || (tags.charity && tags.charity.toLowerCase().includes("food"))) return "foodbank";
      return "foodbank";
    }
    return "other";
  }

  async function fetchFromOverpassCombined(lat, lng, radius = RADIUS_DEFAULT){
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

    const query = `[out:json][timeout:25];(${parts});out center;`;
    const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;

    try {
      const res = await fetch(url);
      if(!res.ok) throw new Error("Overpass error " + res.status);
      const json = await res.json();
      const elements = json.elements || [];

      const results = elements.map(el => {
        const tags = el.tags || {};
        const latval = el.lat || (el.center && el.center.lat) || (el.bounds && el.bounds.minlat);
        const lonval = el.lon || (el.center && el.center.lon) || (el.bounds && el.bounds.minlon);
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

      // dedupe by name + rounded coords
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
    } catch (err) {
      console.warn("Overpass fetch error:", err);
      return [];
    }
  }

  // ====== Distance helper (Haversine) ======
  function getDistance(lat1, lon1, lat2, lon2){
    const R = 6371;
    const toRad = (d)=> d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // ====== Main: findNearby ======
  async function findNearby(){
    if(isFetching) return;
    isFetching = true;
    qs("#statusMessage") && (qs("#statusMessage").textContent = currentLang === "en" ? "Getting location" : "مقام حاصل کیا جا رہا ہے");
    qs("#loadingSpinner") && (qs("#loadingSpinner").style.display = "inline-block");
    qs("#dots") && (qs("#dots").style.display = "inline-block");
    qs("#emptyState") && qs("#emptyState").classList.add("d-none");

    if(!navigator.geolocation){
      showToast(currentLang === "en" ? "Geolocation not supported" : "جیو لوکیشن دستیاب نہیں","error");
      qs("#loadingSpinner") && (qs("#loadingSpinner").style.display = "none");
      qs("#dots") && (qs("#dots").style.display = "none");
      isFetching = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      initMap(userLat, userLng, 13);

      let data = [];
      try {
        const overpass = await fetchFromOverpassCombined(userLat, userLng, RADIUS_DEFAULT);
        data = overpass;
        if(!data || data.length === 0){
          const local = await fetch(FALLBACK_JSON);
          data = await local.json();
        }
      } catch (err) {
        console.warn("Fetch flow failed, trying local JSON", err);
        try {
          const local = await fetch(FALLBACK_JSON);
          data = await local.json();
        } catch (e) {
          showToast(currentLang === "en" ? "No data available" : "ڈیٹا دستیاب نہیں","error");
          data = [];
        }
      }

      data.forEach(item => {
        if(!item._uid) item._uid = uid("s_");
        if(item.lat && item.lng){
          item.distance = parseFloat(getDistance(userLat, userLng, item.lat, item.lng).toFixed(2));
        } else {
          item.distance = null;
        }
        if(item.rating === undefined) item.rating = (Math.random()*2 + 3).toFixed(1);
        if(item.type === "social_facility" || item.type === "charity") item.type = "foodbank";
        if(!item.type && item.category) item.type = item.category;
      });

      const filter = qs("#filterSelect")?.value;
      let filtered = filter ? data.filter(d => d.type === filter) : data;
      const q = qs("#searchInput")?.value?.trim().toLowerCase();
      if(q) filtered = filtered.filter(f => (f.name||"").toLowerCase().includes(q));
      filtered.sort((a,b) => (a.distance||999) - (b.distance||999));

      lastFetchedData = filtered;
      displayResults(filtered);
      addServiceMarkers(filtered);

      qs("#statusMessage") && (qs("#statusMessage").textContent = `${filtered.length} ${currentLang==="en" ? "results" : "نتائج"}`);
      qs("#loadingSpinner") && (qs("#loadingSpinner").style.display = "none");
      qs("#dots") && (qs("#dots").style.display = "none");
      isFetching = false;
    }, (err) => {
      console.warn("geolocation error", err);
      showToast(currentLang === "en" ? "Unable to get location" : "مقام حاصل نہیں ہوا","error");
      qs("#loadingSpinner") && (qs("#loadingSpinner").style.display = "none");
      qs("#dots") && (qs("#dots").style.display = "none");
      isFetching = false;
    }, { enableHighAccuracy:true, timeout:15000, maximumAge:60000 });
  }

  // ====== Category filter helper ======
  function filterCategory(type){
    const sel = qs("#filterSelect");
    if(sel) sel.value = type;
    findNearby();
  }

  // ====== Service worker registration ======
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js")
        .then(reg => console.log("SW registered", reg))
        .catch(err => console.warn("SW failed", err));
    });
  }

  // ====== PWA banner (create and manage) ======
  function shouldShowPWABanner(){
    // if user dismissed in last 24h -> skip
    try {
      const ts = parseInt(localStorage.getItem(PWA_SNOOZE_KEY) || "0", 10);
      if(Date.now() - ts < PWA_SNOOZE_MS) return false;
    } catch(e){}
    // if already installed (display-mode standalone) skip
    if(window.matchMedia('(display-mode: standalone)').matches) return false;
    // fallback: show
    return true;
  }

  // build a banner element (returns DOM node)
  function createPWABanner(){
    const wrap = document.createElement('div');
    wrap.id = 'pwaBanner';
    wrap.style.position = 'fixed';
    wrap.style.left = '12px';
    wrap.style.right = '12px';
    wrap.style.bottom = '18px';
    wrap.style.zIndex = 1400;
    wrap.style.maxWidth = '720px';
    wrap.style.margin = '0 auto';
    wrap.style.borderRadius = '12px';
    wrap.style.boxShadow = '0 10px 30px rgba(2,6,23,0.18)';
    wrap.style.overflow = 'hidden';
    wrap.style.backdropFilter = 'blur(6px)';
    wrap.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(250,250,250,0.92))';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '12px';
    wrap.style.padding = '12px 14px';

    // content
    const textWrap = document.createElement('div');
    textWrap.style.flex = '1';
    textWrap.innerHTML = `<div style="font-weight:700; color:#0b1220;">Add Pukaar to your home screen for faster access.</div>
                          <div style="font-size:.85rem; color:#44505a; margin-top:4px;">Works offline & loads faster — tap Add Now to install.</div>`;

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.alignItems = 'center';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm btn-primary';
    addBtn.id = 'pwa-add-btn';
    addBtn.textContent = 'Add Now';

    const laterBtn = document.createElement('button');
    laterBtn.className = 'btn btn-sm btn-outline-secondary';
    laterBtn.id = 'pwa-later-btn';
    laterBtn.textContent = 'Later';

    const closeX = document.createElement('button');
    closeX.className = 'btn btn-sm btn-link';
    closeX.style.color = '#6c757d';
    closeX.style.fontSize = '18px';
    closeX.textContent = '✕';
    closeX.title = 'Close';

    actions.appendChild(addBtn);
    actions.appendChild(laterBtn);
    actions.appendChild(closeX);

    wrap.appendChild(textWrap);
    wrap.appendChild(actions);

    // event hooks:
    addBtn.addEventListener('click', async () => {
      // if we have deferredPrompt (Chrome/Edge), show it
      if(deferredPrompt){
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if(choice.outcome === 'accepted'){
          showToast("✅ Pukaar installed!", "success");
        } else {
          showToast("ℹ️ Installation dismissed", "info");
        }
        deferredPrompt = null;
        removePWABanner();
      } else {
        // iOS fallback or unsupported - show a small instructions modal
        showIOSInstallGuide();
      }
    });
    laterBtn.addEventListener('click', () => {
      localStorage.setItem(PWA_SNOOZE_KEY, Date.now().toString());
      removePWABanner();
      showToast(currentLang === "en" ? "We'll remind you later" : "بعد میں یاد دلائیں گے", "info");
    });
    closeX.addEventListener('click', () => {
      localStorage.setItem(PWA_SNOOZE_KEY, Date.now().toString());
      removePWABanner();
    });

    return wrap;
  }

  function showPWABannerIfNeeded(){
    if(!shouldShowPWABanner()) return;
    // If already present, don't duplicate
    if(qs("#pwaBanner")) return;
    const banner = createPWABanner();
    document.body.appendChild(banner);
    // small entrance animation
    banner.animate([{ transform:'translateY(20px)', opacity:0 }, { transform:'translateY(0)', opacity:1 }], { duration:320, easing:'cubic-bezier(.2,.8,.2,1)' });
  }

  function removePWABanner(){
    const el = qs("#pwaBanner");
    if(!el) return;
    el.animate([{ opacity:1 }, { opacity:0 }], { duration:200 }).onfinish = () => el.remove();
  }

  // For iOS instruction modal
  function showIOSInstallGuide(){
    // Simple alert fallback (you can replace with a modal)
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if(!isIOS){
      showToast("Install not available on this browser", "error");
      return;
    }
    // show friendly instructions:
    const msg = currentLang === "en"
      ? "To add Pukaar to your home screen: tap the Share icon (bottom of Safari) → Add to Home Screen."
      : "Pukaar کو ہوم اسکرین پر شامل کرنے کے لیے: شیئر بٹن (Safari کے نیچے) → Add to Home Screen منتخب کریں۔";
    alert(msg);
    // consider snoozing after showing
    localStorage.setItem(PWA_SNOOZE_KEY, Date.now().toString());
    removePWABanner();
  }

  // handle beforeinstallprompt and show banner
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // prevent automatic mini-prompt
    deferredPrompt = e;
    // only show banner when user has not snoozed and not already installed
    if(shouldShowPWABanner()){
      showPWABannerIfNeeded();
    }
  });

  // hide banner if app is installed
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    removePWABanner();
    showToast("✅ Pukaar installed!", "success");
  });

  // detect iOS where beforeinstallprompt doesn't exist; show instructions banner (optional)
  function maybeShowIOSBannerOnLoad(){
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if(isIOS && !isStandalone && shouldShowPWABanner()){
      showPWABannerIfNeeded();
    }
  }

  // ====== Misc UI polish: floating underline nav effect ======
  function initNavUnderline(){
    const nav = qs("#navLinks");
    const underline = document.querySelector(".nav-underline");
    if(!nav || !underline) return;
    const links = nav.querySelectorAll(".nav-link");
    function moveUnderline(el) {
      const rect = el.getBoundingClientRect();
      underline.style.width = `${rect.width}px`;
      underline.style.left = `${el.offsetLeft}px`;
      underline.style.opacity = 1;
    }
    links.forEach(link => {
      link.addEventListener("mouseenter", () => moveUnderline(link));
      link.addEventListener("mouseleave", () => underline.style.opacity = 0);
      link.addEventListener("click", () => {
        links.forEach(l => l.classList.remove("active"));
        link.classList.add("active");
        moveUnderline(link);
      });
    });
  }

  // ====== Initialization wiring ======
  function initHandlers(){
    qs("#findBtn")?.addEventListener("click", () => findNearby());
    qs("#requestLocationBtn")?.addEventListener("click", () => findNearby());
    qs("#favoritesBtn")?.addEventListener("click", () => renderFavoritesModal());
    // category card clicks are inline in HTML via onclick="filterCategory('...')", but ensure global is present:
    window.filterCategory = filterCategory;

    attachSortHandlers();
    initNavUnderline();

    document.addEventListener("DOMContentLoaded", () => {
      initMap();
      renderFavoritesModal();
      // show PWA banner for iOS if needed
      maybeShowIOSBannerOnLoad();
    });

    // navbar shrink
    const navbar = document.querySelector(".navbar");
    window.addEventListener("scroll", () => {
      if(!navbar) return;
      if(window.scrollY > 50) navbar.classList.add("shrink");
      else navbar.classList.remove("shrink");
    });

    // Expose some functions for inline HTML usage if needed
    window.findNearby = findNearby;
    window.toggleFavorite = toggleFavorite; // note: displayResults uses closure version, but expose anyway
    window.renderFavoritesModal = renderFavoritesModal;
  }

  // run init
  initHandlers();
  // show pwa banner if (a) beforeinstallprompt already fired before script loaded (rare) or (b) iOS detection:
  setTimeout(() => showPWABannerIfNeeded(), 600);

  // expose some debugging if needed
  window.__pukaar = {
    findNearby,
    initMap,
    fetchFromOverpassCombined,
    getFavorites
  };

})();
