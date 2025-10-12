 // Initialize Leaflet map
    const map = L.map('map').setView([24.8607, 67.0011], 13); // Default Karachi coordinates

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    async function loadServices() {
      let data = [];
      try {
        const res = await fetch("https://yourapi.com/services");
        data = await res.json();
        console.log("✅ Data from API");
      } catch(err) {
        console.warn("⚠️ API failed, using local JSON", err);
        try {
          const localRes = await fetch("data.json");
          data = await localRes.json();
          console.log("📂 Data from local JSON");
        } catch(err2) {
          alert("❌ No data available");
          return;
        }
      }

      // Get user location
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos => {
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;
          map.setView([userLat, userLng], 14);

          data.forEach(service => {
            service.distance = getDistance(userLat, userLng, service.lat, service.lng).toFixed(2);

            // Pin color based on category
            let pinColor = 'blue';
            if(service.type === 'hospital') pinColor = 'red';
            else if(service.type === 'clinic') pinColor = 'green';
            else if(service.type === 'pharmacy') pinColor = 'purple';
            else if(service.type === 'foodbank') pinColor = 'orange';

            const marker = L.circleMarker([service.lat, service.lng], {
              radius: 8,
              fillColor: pinColor,
              color: '#000',
              weight: 1,
              opacity: 1,
              fillOpacity: 0.8
            }).addTo(map);

            const favorites = JSON.parse(localStorage.getItem("favorites")) || [];
            const isFavorite = favorites.some(fav => fav.id === service.id);

            marker.bindPopup(`
              <b>${service.name}</b><br>
              ${service.address}<br>
              <b>Distance:</b> ${service.distance} km<br>
              <a href="tel:${service.phone}" class="btn btn-success btn-sm">Call</a>
              <a href="https://www.google.com/maps?q=${service.lat},${service.lng}" target="_blank" class="btn btn-primary btn-sm">Directions</a>
              <button class="btn btn-warning btn-sm mt-1" onclick="toggleFavorite(${service.id}, '${service.name}', '${service.type}', '${service.address}', '${service.phone}', ${service.lat}, ${service.lng})">
                ${isFavorite ? "★ Saved" : "☆ Save"}
              </button>
            `);
          });
        });
      } else {
        alert("Geolocation not supported in your browser");
      }
    }

    // Haversine formula
    function getDistance(lat1, lon1, lat2, lon2){
      const R = 6371;
      const dLat = (lat2-lat1) * Math.PI/180;
      const dLon = (lon2-lon1) * Math.PI/180;
      const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
                Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
                Math.sin(dLon/2)*Math.sin(dLon/2);
      const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R*c;
    }

    // Toggle favorite
    function toggleFavorite(id, name, type, address, phone, lat, lng){
      let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
      const exists = favorites.find(item=>item.id===id);
      if(exists) favorites = favorites.filter(item=>item.id!==id);
      else favorites.push({id,name,type,address,phone,lat,lng});
      localStorage.setItem("favorites", JSON.stringify(favorites));
      alert("✅ Favorites updated");
      showFavorites();
      loadServices();
    }

    // Show favorites in modal
    function showFavorites(){
      const favorites = JSON.parse(localStorage.getItem("favorites")) || [];
      const container = document.getElementById("favoritesList");
      container.innerHTML = "";
      if(favorites.length===0){ container.innerHTML="<p>No favorites saved yet.</p>"; return; }
      favorites.forEach(service=>{
        const card = `
          <div class="col-md-6 mb-3">
            <div class="card shadow-sm">
              <div class="card-body">
                <h5 class="card-title">${service.name}</h5>
                <p class="card-text">${service.address}</p>
                <a href="tel:${service.phone}" class="btn btn-success btn-sm">Call</a>
                <a href="https://www.google.com/maps?q=${service.lat},${service.lng}" target="_blank" class="btn btn-primary btn-sm">Directions</a>
                <button class="btn btn-danger btn-sm mt-2" onclick="removeFavorite(${service.id})">❌ Remove</button>
              </div>
            </div>
          </div>`;
        container.innerHTML += card;
      });
    }

    function removeFavorite(id){
      let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
      favorites = favorites.filter(item=>item.id!==id);
      localStorage.setItem("favorites", JSON.stringify(favorites));
      showFavorites();
      loadServices();
    }

    // Load on page start
    loadServices();