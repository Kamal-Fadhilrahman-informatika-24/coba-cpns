/**
 * Home Page
 */

function init_home() {
  renderNavbar();
  animateCounters();
  updateModeCards();
}

function animateCounters() {
  const counters = [
    { id: 'stat-questions', target: 500, suffix: '+' },
    { id: 'stat-users', target: 10000, suffix: '+' },
    { id: 'stat-accuracy', target: 94, suffix: '%' }
  ];

  counters.forEach(({ id, target, suffix }) => {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = target / 40;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = Math.floor(current).toLocaleString('id-ID') + suffix;
      if (current >= target) clearInterval(timer);
    }, 40);
  });
}

function updateModeCards() {
  const isLoggedIn = window.auth.isLoggedIn();
  const mpLoginRequired = document.getElementById('mp-login-required');
  if (mpLoginRequired) mpLoginRequired.style.display = isLoggedIn ? 'none' : 'flex';
}

function startPractice() {
  navigateTo('difficulty-select', { mode: 'simulation' });
}

function startMultiplayer() {
  if (!window.auth.isLoggedIn()) {
    showModal({
      title: 'LOGIN DIPERLUKAN',
      body: 'Kamu harus login terlebih dahulu untuk bermain multiplayer.',
      actions: [
        { label: 'Login Sekarang', class: 'btn-primary', action: () => { closeModal(); navigateTo('login'); } },
        { label: 'Batal', class: 'btn-ghost', action: closeModal }
      ]
    });
    return;
  }
  navigateTo('multiplayer');
}

function viewLeaderboard() {
  navigateTo('leaderboard');
}

function showModal({ title, body, actions = [] }) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-actions').innerHTML = actions.map((a, i) =>
    `<button class="btn ${a.class}" onclick="_modalActions[${i}].action()">${a.label}</button>`
  ).join('');

  window._modalActions = actions;
  overlay.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
  window._modalActions = [];
}

window.init_home = init_home;
window.startPractice = startPractice;
window.startMultiplayer = startMultiplayer;
window.viewLeaderboard = viewLeaderboard;
window.showModal = showModal;
window.closeModal = closeModal;
