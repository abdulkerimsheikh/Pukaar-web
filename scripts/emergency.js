 async function loadEmergencyContacts(){
      let data = [];
      try{
        const res = await fetch("https://yourapi.com/emergency");
        data = await res.json();
        console.log("✅ Data from API");
      }catch(err){
        console.warn("⚠️ API failed, using local JSON", err);
        try{
          const localRes = await fetch("emergency.json");
          data = await localRes.json();
          console.log("📂 Data from local JSON");
        }catch(err2){
          alert("❌ No data available");
          return;
        }
      }

      // Filter by category
      const filter = document.getElementById("filterSelect").value;
      let filtered = data;
      if(filter){
        filtered = data.filter(item => item.type === filter);
      }

      // Search by name/type
      const search = document.getElementById("searchInput").value.toLowerCase();
      if(search){
        filtered = filtered.filter(item => 
          item.name.toLowerCase().includes(search) || item.type.toLowerCase().includes(search)
        );
      }

      displayEmergency(filtered);
    }

    function displayEmergency(contacts){
      const container = document.getElementById("emergencyList");
      container.innerHTML = "";

      if(contacts.length === 0){
        container.innerHTML = "<p>No contacts found.</p>";
        return;
      }

      const favorites = JSON.parse(localStorage.getItem("favorites")) || [];

      contacts.forEach(contact=>{
        const isFavorite = favorites.some(fav => fav.id === contact.id);

        const card = `
          <div class="col-md-6">
            <div class="card emergency-card shadow-sm">
              <div class="card-body">
                <h5 class="card-title">${contact.name}</h5>
                <p class="card-text">${contact.type}</p>
                <p><strong>Number:</strong> ${contact.phone}</p>
                <a href="tel:${contact.phone}" class="btn btn-success btn-sm">Call</a>
                <button class="btn btn-warning btn-sm mt-2" onclick="toggleFavorite(${contact.id}, '${contact.name}', '${contact.type}', '', '${contact.phone}', 0,0)">
                  ${isFavorite ? "★ Saved" : "☆ Save"}
                </button>
              </div>
            </div>
          </div>
        `;
        container.innerHTML += card;
      });
    }

    // Toggle favorite
    function toggleFavorite(id,name,type,address,phone,lat,lng){
      let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
      const exists = favorites.find(item=>item.id===id);
      if(exists) favorites = favorites.filter(item=>item.id!==id);
      else favorites.push({id,name,type,address,phone,lat,lng});
      localStorage.setItem("favorites", JSON.stringify(favorites));
      alert("✅ Favorites updated");
      showFavorites();
      loadEmergencyContacts();
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
                <p class="card-text">${service.type}</p>
                <a href="tel:${service.phone}" class="btn btn-success btn-sm">Call</a>
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
      loadEmergencyContacts();
    }

    // Load contacts on page load
    loadEmergencyContacts();