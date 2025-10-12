 function loadProfile(){
      // Location
      const savedCity = localStorage.getItem("defaultCity");
      document.getElementById("defaultCity").value = savedCity || "";
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
        alert("✅ Location saved");
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
      alert("✅ Preferences saved");
    }

    // Show favorites in profile page
    function showFavoritesInProfile(){
      const container = document.getElementById("favoritesContainer");
      container.innerHTML = "";
      const favorites = JSON.parse(localStorage.getItem("favorites")) || [];
      if(favorites.length === 0){
        container.innerHTML = "<p>No favorites saved yet.</p>";
        return;
      }
      favorites.forEach(fav => {
        const card = `
          <div class="col-md-6 mb-3">
            <div class="card shadow-sm">
              <div class="card-body">
                <h5 class="card-title">${fav.name}</h5>
                <p class="card-text">${fav.type}</p>
                <a href="tel:${fav.phone}" class="btn btn-success btn-sm">Call</a>
                <button class="btn btn-danger btn-sm mt-2" onclick="removeFavoriteProfile(${fav.id})">❌ Remove</button>
              </div>
            </div>
          </div>
        `;
        container.innerHTML += card;
      });
    }

    function removeFavoriteProfile(id){
      let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
      favorites = favorites.filter(fav => fav.id !== id);
      localStorage.setItem("favorites", JSON.stringify(favorites));
      showFavoritesInProfile();
    }

    // Initial load
    loadProfile();