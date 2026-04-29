/**
 * Navbar Component
 */

function renderNavbar(showTimer = true) {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const isLoggedIn = window.auth.isLoggedIn();
  const user = window.auth.getUser();

  navbar.innerHTML = `
    <div class="nav-brand" onclick="navigateTo('home')" style="cursor:pointer">
      <span class="brand-icon">🎯</span>
      <span class="brand-text">NumTest <span class="brand-sub">CPNS</span></span>
    </div>
    <nav class="nav-links">
      <a onclick="navigateTo('home')" class="nav-link">Beranda</a>
      <a onclick="navigateTo('difficulty-select')" class="nav-link">Simulasi</a>
      <a onclick="navigateTo('multiplayer')" class="nav-link">Multiplayer</a>
      <a onclick="navigateTo('leaderboard')" class="nav-link">Peringkat</a>
    </nav>
    <div class="nav-auth">
      ${isLoggedIn ? `
        <a onclick="navigateTo('profile')" class="nav-user">
          ${user?.avatar_url
            ? `<img src="${user.avatar_url}" alt="avatar" class="nav-avatar">`
            : `<span class="nav-avatar-placeholder">${(user?.username || '?')[0].toUpperCase()}</span>`
          }
          <span>${user?.username || 'User'}</span>
        </a>
        <button class="btn btn-ghost btn-sm" onclick="handleLogout()">Keluar</button>
      ` : `
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('login')">Masuk</button>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('register')">Daftar</button>
      `}
    </div>
    <button class="nav-hamburger" onclick="toggleNavMobile()" id="nav-hamburger">☰</button>
  `;
}

function toggleNavMobile() {
  const links = document.querySelector('.nav-links');
  links?.classList.toggle('open');
}

window.renderNavbar = renderNavbar;
window.toggleNavMobile = toggleNavMobile;
