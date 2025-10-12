/* ===========================
   Profile & Settings JS
   =========================== */

// Toast helper
function showToast(message, type = 'success'){
  const toastContainer = document.getElementById('liveToastContainer');
  if(!toastContainer){
    const container = document.createElement('div');
    container.id = 'liveToastContainer';
    container.className = 'position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = 1300;
    document.body.appendChild(container);
  }

  const toastHTML = `
    <div class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="polite" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = toastHTML;
  const toastEl = tempDiv.firstElementChild;
  document.getElementById('liveToastContainer').appendChild(toastEl);
  new bootstrap.Toast(toastEl).show();
}

// Helper for phone fallback
function getPhone(fav){ return fav.phone || '1122'; }

// Load profile data
function loadProfile(){
  // Location
  const savedCity = (localStorage.getItem("defaultCity") || "").trim();
  document.getElementById("defaultCity").value = savedCity;
  document.getElementById("savedLocation").innerText = savedCity ? "Saved Location: " + savedCity : "";

  // Preferences
  const prefs = JSON.parse(localStorage.getItem("preferredCategories")) || [];
  document.getElementById("prefHospital").checked = prefs.includes("hospital");
  document.getElementById("prefClinic").checked = prefs.includes("clinic");
  document.getElementById("prefPharmacy").checked = prefs.includes("pharmacy");
  document.getElementById("prefFoodbank").checked = prefs.includes("foodbank");

  // Favorites
  showFavoritesInProfile();
}

// Save location
function saveLocation(){
  const city = document.getElementById("defaultCity").value.trim();
  if(city){
    localStorage.setItem("defaultCity", city);
    document.getElementById("savedLocation").innerText = "Saved Location: " + city;
    showToast("✅ Location saved");
  } else {
    showToast("⚠️ Please enter a city name", "warning");
  }
}

// Save preferred categories
function savePreferences(){
  const prefs = [];
  if(document.getElementById("prefHospital").checked) prefs.push("hospital");
  if(document.getElementById("prefClinic").checked) prefs.push("clinic");
  if(document.getElementById("prefPharmacy").checked) prefs.push("pharmacy");
  if(document.getElementById("prefFoodbank").checked) prefs.push("foodbank");
  localStorage.setItem("preferredCategories", JSON.stringify(prefs));
  showToast("✅ Preferences saved");
}

// Display favorites in profile
function showFavoritesInProfile(){
  const container = document.getElementById("favoritesContainer");
  container.innerHTML = "";
  const favorites = JSON.parse(localStorage.getItem("favorites")) || [];
  if(favorites.length === 0){
    container.innerHTML = "<p>No favorites saved yet.</p>";
    return;
  }

  let html = '';
  favorites.forEach(fav => {
    const phone = getPhone(fav);
    html += `
      <div class="col-12 col-sm-6 mb-3">
        <div class="card shadow-sm">
          <div class="card-body d-flex justify-content-between align-items-start">
            <div>
              <h5 class="card-title">${fav.name}</h5>
              <p class="card-text text-muted">${fav.type}</p>
            </div>
            <div class="d-flex flex-column gap-2">
              <a href="tel:${phone}" class="btn btn-success btn-sm" aria-label="Call ${fav.name}">📞 Call</a>
              <button class="btn btn-danger btn-sm mt-2" aria-label="Remove ${fav.name}" onclick="removeFavoriteProfile(${fav.id})">❌ Remove</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Remove favorite
function removeFavoriteProfile(id){
  let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
  favorites = favorites.filter(fav => fav.id !== id);
  localStorage.setItem("favorites", JSON.stringify(favorites));
  showFavoritesInProfile();
  showToast("✅ Favorite removed", "info");
}

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
});


