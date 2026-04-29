/**
 * Profile Page
 */

async function init_profile() {
  if (!window.auth.isLoggedIn()) {
    navigateTo('login');
    return;
  }

  renderNavbar();
  await loadProfile();
}

async function loadProfile() {
  const container = document.getElementById('profile-content');
  if (!container) return;

  container.innerHTML = `<div class="loading-pulse" style="text-align:center;padding:2rem;color:#94a3b8;">Memuat profil...</div>`;

  try {
    const [profileData, statsData] = await Promise.all([
      window.api.getProfile(),
      window.api.getStats()
    ]);

    renderProfile(profileData.user, statsData.stats, statsData.recentHistory, statsData.bestPerDifficulty);
  } catch (err) {
    container.innerHTML = `<div style="color:#f87171;text-align:center;padding:2rem;">
      Gagal memuat profil. <button onclick="loadProfile()" class="btn btn-ghost">Coba Lagi</button>
    </div>`;
  }
}

function renderProfile(user, stats, recentHistory, bests) {
  const container = document.getElementById('profile-content');
  if (!container) return;

  const levelMap = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  const levelUnlocked = levelMap[stats?.level_unlocked] || 'Easy';

  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">
        ${user.avatar_url
          ? `<img src="${user.avatar_url}" alt="avatar" class="avatar-img">`
          : `<div class="avatar-placeholder">${(user.username || '?')[0].toUpperCase()}</div>`
        }
      </div>
      <div class="profile-info">
        <h2>${user.username}</h2>
        <p class="profile-email">${user.email}</p>
        <p class="profile-since">Bergabung ${utils.formatDate(user.created_at)}</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="editUsername()">✏️ Edit Username</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats?.high_score || 0}</div>
        <div class="stat-label">Skor Tertinggi</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats?.total_score || 0}</div>
        <div class="stat-label">Total Skor</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats?.wins || 0}</div>
        <div class="stat-label">Menang (MP)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats?.total_matches || 0}</div>
        <div class="stat-label">Total Match</div>
      </div>
    </div>

    <div class="level-progress-section">
      <h3>Progress Level</h3>
      <div class="level-bars">
        ${renderLevelBar('easy', bests?.easy, stats?.easy_best_accuracy || 0, 'always unlocked')}
        ${renderLevelBar('medium', bests?.medium, stats?.medium_best_accuracy || 0, 'Butuh 70% di Easy')}
        ${renderLevelBar('hard', bests?.hard, 0, 'Butuh 80% di Medium')}
      </div>
    </div>

    ${recentHistory?.length ? `
    <div class="history-section">
      <h3>Riwayat Terakhir (10 Test)</h3>
      <div class="history-list">
        ${recentHistory.map(h => `
          <div class="history-item">
            <div class="h-diff" style="color:${utils.getDifficultyColor(h.difficulty)}">${utils.getDifficultyLabel(h.difficulty)}</div>
            <div class="h-score">${h.score} pts</div>
            <div class="h-accuracy">${h.accuracy}%</div>
            <div class="h-mode ${h.mode}">${h.mode === 'multiplayer' ? '⚔️ MP' : '📝 Sim'}</div>
            <div class="h-date">${utils.formatDate(h.created_at)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  `;
}

function renderLevelBar(diff, best, bestAccuracy, unlockNote) {
  const colors = { easy: '#4ade80', medium: '#facc15', hard: '#f87171' };
  const labels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const targets = { easy: 100, medium: 70, hard: 80 };
  const pct = Math.min(100, Math.round(bestAccuracy));
  const color = colors[diff];

  return `
    <div class="level-bar-item">
      <div class="lb-header">
        <span style="color:${color}">${labels[diff]}</span>
        <span class="lb-note">${unlockNote}</span>
        <span class="lb-pct">${pct}%</span>
      </div>
      <div class="lb-track">
        <div class="lb-fill" style="width:${pct}%;background:${color}"></div>
        ${targets[diff] && diff !== 'easy' ? `<div class="lb-threshold" style="left:${targets[diff]}%"></div>` : ''}
      </div>
      ${best ? `<div class="lb-best">Terbaik: ${best.score} pts, ${best.accuracy}% akurasi</div>` : '<div class="lb-best">Belum ada data</div>'}
    </div>
  `;
}

async function editUsername() {
  const user = window.auth.getUser();
  const newName = prompt('Username baru:', user?.username || '');
  if (!newName || newName.trim() === user?.username) return;

  try {
    const { user: updated } = await window.api.updateProfile({ username: newName.trim() });
    window.auth.setUser({ ...user, username: updated.username });
    utils.showToast('Username berhasil diperbarui!', 'success');
    await loadProfile();
  } catch (err) {
    utils.showToast(err.message || 'Gagal memperbarui username', 'error');
  }
}

window.init_profile = init_profile;
window.editUsername = editUsername;
