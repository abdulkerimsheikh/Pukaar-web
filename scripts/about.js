const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      themeBtn.innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
    });

    // Language Toggle
    const langBtn = document.getElementById('lang-toggle');
    langBtn.addEventListener('click', () => {
      langBtn.innerText = langBtn.innerText === 'اردو' ? 'EN' : 'اردو';
      // optional: implement API translation here
    });

    // Interactive Map
    const map = L.map('map').setView([24.8607, 67.0011], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    L.marker([24.8607, 67.0011]).addTo(map).bindPopup("You are here").openPopup();

    // FAQ Sample Data
    const faqData = [
      {q:"How to find a hospital?", a:"Enable location and search for 'hospital' in the search box."},
      {q:"Can I save favorite services?", a:"Yes! Click the star on any service card."},
      {q:"Does it work offline?", a:"Yes, cached data is available offline."},
      {q:"How to install Pukaar?", a:"Click the 'Add to Home Screen' prompt in your browser."}
    ];

    const faqList = document.getElementById('faqList');
    const faqSearch = document.getElementById('faqSearch');
    function renderFAQ(filter="") {
      faqList.innerHTML = "";
      faqData.filter(item => item.q.toLowerCase().includes(filter.toLowerCase()))
        .forEach((item,i) => {
        faqList.innerHTML += `
          <div class="accordion-item">
            <h2 class="accordion-header" id="heading${i}">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${i}">${item.q}</button>
            </h2>
            <div id="collapse${i}" class="accordion-collapse collapse">
              <div class="accordion-body">${item.a}</div>
            </div>
          </div>`;
      });
    }
    renderFAQ();
    faqSearch.addEventListener('input', e => renderFAQ(e.target.value));

    // Contact Form & Rating
    const contactForm = document.getElementById('contactForm');
    const stars = document.querySelectorAll('#ratingStars .star');
    let selectedRating = 0;

    stars.forEach(star => {
      star.addEventListener('mouseover', () => {
        stars.forEach(s => s.classList.remove('hover'));
        for(let i=0;i<star.dataset.value;i++) stars[i].classList.add('hover');
      });
      star.addEventListener('mouseout', () => {
        stars.forEach(s => s.classList.remove('hover'));
        for(let i=0;i<selectedRating;i++) stars[i].classList.add('selected');
      });
      star.addEventListener('click', () => {
        selectedRating = star.dataset.value;
        stars.forEach(s => s.classList.remove('selected'));
        for(let i=0;i<selectedRating;i++) stars[i].classList.add('selected');
      });
    });

        contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // Collect form data
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const message = document.getElementById('message').value.trim();

      if (!name || !email || !message) {
        alert("Please fill all required fields.");
        return;
      }

      // Simulate AJAX submission (replace with real API endpoint)
      console.log({
        name, email, message, rating: selectedRating
      });

      // Show feedback message
      const feedbackMsg = contactForm.querySelector('.feedback-msg');
      feedbackMsg.style.display = 'block';
      setTimeout(() => { feedbackMsg.style.display = 'none'; contactForm.reset(); selectedRating = 0; stars.forEach(s => s.classList.remove('selected')); }, 3000);
    });

    // Service Worker Registration for PWA
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("../scripts/service-worker.js")
          .then(reg => console.log("✅ Service Worker Registered", reg))
          .catch(err => console.log("❌ SW Registration Failed", err));
      });
    }

    // Prompt user to install PWA
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const installBtn = document.createElement('button');
      installBtn.className = 'btn btn-success position-fixed bottom-0 end-0 m-3';
      installBtn.innerText = '📲 Install Pukaar';
      installBtn.onclick = () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted PWA install');
          } else {
            console.log('User dismissed PWA install');
          }
          deferredPrompt = null;
          installBtn.remove();
        });
      };
      document.body.appendChild(installBtn);
    });



    const wizardSteps = document.querySelectorAll('.wizard-step');
const prevBtn = document.getElementById('prevStep');
const nextBtn = document.getElementById('nextStep');
const stepIndicator = document.getElementById('stepIndicator');
let currentStep = 0;

function updateWizard() {
  wizardSteps.forEach((step, index) => {
    step.classList.toggle('active', index === currentStep);
  });
  stepIndicator.innerText = `Step ${currentStep + 1} of ${wizardSteps.length}`;
  prevBtn.disabled = currentStep === 0;
  nextBtn.innerText = currentStep === wizardSteps.length - 1 ? "Finish ✅" : "Next ➡";
}

// Next button click
nextBtn.addEventListener('click', () => {
  if (currentStep < wizardSteps.length - 1) {
    currentStep++;
    updateWizard();
  } else {
    // Finish clicked
    const modal = bootstrap.Modal.getInstance(document.getElementById('guideModal'));
    modal.hide();
    currentStep = 0;
    updateWizard();
  }
});

// Previous button click
prevBtn.addEventListener('click', () => {
  if (currentStep > 0) {
    currentStep--;
    updateWizard();
  }
});

// Open modal programmatically (optional auto-popup)
document.addEventListener('DOMContentLoaded', () => {
  // Uncomment below line to auto-open guide modal on page load
  // const guideModal = new bootstrap.Modal(document.getElementById('guideModal')); guideModal.show();
  updateWizard();
});

 
