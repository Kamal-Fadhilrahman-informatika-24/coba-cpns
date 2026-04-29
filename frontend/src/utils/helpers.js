/**
 * Frontend helpers — UI utilities only. Zero business logic.
 */

const utils = {
  formatTime(seconds) {
    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.max(0, seconds) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  formatDate(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  },

  formatNumber(n) {
    return (n || 0).toLocaleString('id-ID');
  },

  getDifficultyColor(difficulty) {
    return { easy: '#4ade80', medium: '#facc15', hard: '#f87171', mixed: '#a78bfa' }[difficulty] || '#94a3b8';
  },

  getDifficultyLabel(difficulty) {
    return { easy: 'Mudah', medium: 'Menengah', hard: 'Sulit', mixed: 'Campuran' }[difficulty] || difficulty;
  },

  scoreGrade(score) {
    if (score >= 90) return { grade: 'A+', label: 'Luar Biasa!', color: '#4ade80' };
    if (score >= 80) return { grade: 'A', label: 'Sangat Baik!', color: '#86efac' };
    if (score >= 70) return { grade: 'B', label: 'Baik', color: '#facc15' };
    if (score >= 60) return { grade: 'C', label: 'Cukup', color: '#fb923c' };
    return { grade: 'D', label: 'Perlu Latihan', color: '#f87171' };
  },

  showToast(message, type = 'info', duration = 3000) {
    const existing = document.getElementById('toast-container');
    const container = existing || (() => {
      const el = document.createElement('div');
      el.id = 'toast-container';
      el.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;';
      document.body.appendChild(el);
      return el;
    })();

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const colors = { success: '#4ade80', error: '#f87171', warning: '#facc15', info: '#60a5fa' };

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: #1e293b; color: #f1f5f9; padding: .75rem 1rem;
      border-radius: .5rem; border-left: 3px solid ${colors[type] || colors.info};
      font-size: .875rem; max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,.4);
      animation: slideIn .2s ease; cursor: pointer;
    `;
    toast.innerHTML = `${icons[type] || ''} ${message}`;
    toast.onclick = () => toast.remove();
    container.appendChild(toast);

    setTimeout(() => toast?.remove(), duration);
  }
};

// Make showToast global for backward compatibility
window.showToast = (msg, type, dur) => utils.showToast(msg, type, dur);
window.utils = utils;
