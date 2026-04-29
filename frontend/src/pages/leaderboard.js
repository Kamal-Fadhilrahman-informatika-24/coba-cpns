/**
 * Leaderboard Page — live-updating global rankings
 */

let currentSortBy = 'high_score';

async function init_leaderboard() {
  renderNavbar();
  await loadLeaderboard(currentSortBy);

  // Listen for real-time updates from multiplayer matches
  window.addEventListener('leaderboard:updated', () => {
    loadLeaderboard(currentSortBy);
  });
}

async function loadLeaderboard(by = 'high_score') {
  currentSortBy = by;

  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  container.innerHTML = `<div class="loading-pulse" style="text-align:center;padding:2rem;color:#94a3b8;">Memuat...</div>`;

  // Highlight active tab
  document.querySelectorAll('.lb-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.by === by);
  });

  try {
    const { leaderboard } = await window.api.getLeaderboard(by, 20);
    console.log('[leaderboard] Data diterima:', leaderboard);
    renderLeaderboard(leaderboard, by);
  } catch (err) {
    container.innerHTML = `<div style="color:#f87171;text-align:center;padding:2rem;">
      Gagal memuat leaderboard. <button onclick="loadLeaderboard('${by}')" class="btn btn-ghost">Coba Lagi</button>
    </div>`;
  }
}

function renderLeaderboard(data, by) {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  const myUserId = window.auth.getUser()?.id;
  const valueKey = { high_score: 'highScore', total_score: 'totalScore', wins: 'wins' }[by] || 'highScore';
  const valueLabel = { high_score: 'Skor Tertinggi', total_score: 'Total Skor', wins: 'Menang' }[by] || 'Skor';

  if (!data?.length) {
    container.innerHTML = `<div style="text-align:center;padding:2rem;color:#6b7280;">Belum ada data leaderboard.</div>`;
    return;
  }

  const rankEmoji = ['🥇', '🥈', '🥉'];

  container.innerHTML = data.map((entry, i) => {
    const isMe = entry.userId === myUserId;
    const badge = rankEmoji[i] || `#${entry.rank}`;
    const levelLabel = ['', 'Easy', 'Medium', 'Hard'][entry.levelUnlocked] || 'Easy';

    return `
      <div class="lb-row ${isMe ? 'me' : ''} ${i < 3 ? 'top-three' : ''}">
        <div class="lb-rank">${badge}</div>
        <div class="lb-avatar">${entry.avatarUrl
          ? `<img src="${entry.avatarUrl}" alt="avatar">`
          : `<span>${(entry.username || '?')[0].toUpperCase()}</span>`
        }</div>
        <div class="lb-info">
          <div class="lb-username">${entry.username}${isMe ? ' <span class="me-badge">(Kamu)</span>' : ''}</div>
          <div class="lb-meta">
            <span class="lb-level">🏅 ${levelLabel}</span>
            ${entry.totalMatches > 0 ? `<span>⚔️ ${entry.wins}W/${entry.losses}L</span>` : ''}
          </div>
        </div>
        <div class="lb-value">
          <div class="lb-score">${(entry[valueKey] || 0).toLocaleString()}</div>
          <div class="lb-score-label">${valueLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.init_leaderboard = init_leaderboard;
window.loadLeaderboard = loadLeaderboard;
