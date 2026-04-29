/**
 * Auth Page — Login & Register
 */

function init_login() {
  if (window.auth.isLoggedIn()) {
    navigateTo('home');
    return;
  }
  renderNavbar();
}

function init_register() {
  if (window.auth.isLoggedIn()) {
    navigateTo('home');
    return;
  }
  renderNavbar();
}

async function handleLogin(e) {
  e?.preventDefault();
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');

  if (!email || !password) {
    showFieldError(errEl, 'Email dan password wajib diisi');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Masuk...'; }
  if (errEl) errEl.textContent = '';

  try {
    await window.auth.login(email, password);
    utils.showToast('Login berhasil! Selamat datang 👋', 'success');
    navigateTo('home');
  } catch (err) {
    showFieldError(errEl, err.message || 'Login gagal');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}

async function handleRegister(e) {
  e?.preventDefault();
  const username = document.getElementById('reg-username')?.value?.trim();
  const email = document.getElementById('reg-email')?.value?.trim();
  const password = document.getElementById('reg-password')?.value;
  const btn = document.getElementById('btn-register');
  const errEl = document.getElementById('register-error');

  if (!username || !email || !password) {
    showFieldError(errEl, 'Semua field wajib diisi');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Mendaftar...'; }
  if (errEl) errEl.textContent = '';

  try {
    await window.auth.register(username, email, password);
    utils.showToast('Registrasi berhasil! Selamat datang 🎉', 'success');
    navigateTo('home');
  } catch (err) {
    showFieldError(errEl, err.message || 'Registrasi gagal');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Daftar'; }
  }
}

function handleLogout() {
  window.auth.logout();
  window.socketService.disconnect();
  utils.showToast('Logout berhasil', 'info');
  navigateTo('home');
}

function showFieldError(el, message) {
  if (!el) { utils.showToast(message, 'error'); return; }
  el.textContent = message;
  el.style.color = '#f87171';
}

window.init_login = init_login;
window.init_register = init_register;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
