const form = document.getElementById('feedbackForm');
    const alertBox = document.getElementById('feedbackAlert');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        name: form.name.value,
        email: form.email.value,
        serviceType: form.serviceType.value,
        message: form.message.value,
        timestamp: new Date().toISOString()
      };

      try {
        // Try API first
        const res = await fetch('https://yourapi.com/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!res.ok) throw new Error('API failed');

        alertBox.className = 'alert alert-success';
        alertBox.textContent = '✅ Feedback submitted successfully!';
        alertBox.classList.remove('d-none');

      } catch (err) {
        console.log('API failed, saving locally', err);

        // Offline fallback: save in localStorage
        const localFeedback = JSON.parse(localStorage.getItem('feedback')) || [];
        localFeedback.push(data);
        localStorage.setItem('feedback', JSON.stringify(localFeedback));

        alertBox.className = 'alert alert-warning';
        alertBox.textContent = '⚠ Saved locally. Will sync when online.';
        alertBox.classList.remove('d-none');
      }

      // Reset form
      form.reset();
    });