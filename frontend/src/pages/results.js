/**
 * Results Page — displays server-computed results.
 * All scoring and grading came from the backend. This is pure rendering.
 */

function init_results() {
  renderNavbar();

  const results = store.get('testResults');
  if (!results) {
    navigateTo('home');
    return;
  }

  // Show level unlock notification if applicable
  if (results._levelUnlockedMessage) {
    setTimeout(() => {
      utils.showToast(results._levelUnlockedMessage, 'success', 5000);
    }, 800);
  }

  renderSummary(results);
  renderDetailedResults(results);
  renderPerformanceChart(results);
}

function renderSummary({ score, correct, wrong, total, accuracy, duration, difficulty }) {
  const grade = utils.scoreGrade(score);

  const scoreEl = document.getElementById('result-score');
  if (scoreEl) scoreEl.textContent = score;

  const gradeEl = document.getElementById('result-grade');
  if (gradeEl) {
    gradeEl.textContent = grade.grade;
    gradeEl.style.color = grade.color;
  }

  const labelEl = document.getElementById('result-grade-label');
  if (labelEl) labelEl.textContent = grade.label;

  const statsMap = {
    'result-correct': `${correct} benar`,
    'result-wrong': `${wrong} salah`,
    'result-total': `${total} soal`,
    'result-accuracy': `${accuracy}%`,
    'result-duration': utils.formatTime(duration),
    'result-difficulty': utils.getDifficultyLabel(difficulty)
  };

  for (const [id, val] of Object.entries(statsMap)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // Circular score ring animation
  const ring = document.getElementById('score-ring-fill');
  if (ring) {
    const circumference = 2 * Math.PI * 54; // r=54
    setTimeout(() => {
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = circumference * (1 - score / 150);
      ring.style.stroke = grade.color;
    }, 200);
  }
}

function renderDetailedResults({ results = [] }) {
  const container = document.getElementById('results-detail-list');
  if (!container) return;

  container.innerHTML = results.map((r, i) => `
    <div class="result-item ${r.isCorrect ? 'correct' : 'wrong'}">
      <div class="result-item-header">
        <span class="result-num">Soal ${i + 1}</span>
        <span class="result-verdict">${r.isCorrect ? '✅ Benar' : '❌ Salah'}</span>
      </div>
      <div class="result-sequence">
        ${r.sequence.map(n => `<span class="seq-chip">${n}</span>`).join('<span style="color:#94a3b8"> → </span>')} → <strong>${r.correctAnswer}</strong>
      </div>
      <div class="result-answers">
        <span>Jawaban kamu: <strong style="color:${r.isCorrect ? '#4ade80' : '#f87171'}">${r.userAnswer ?? 'Tidak dijawab'}</strong></span>
        ${!r.isCorrect ? `<span>Jawaban benar: <strong style="color:#4ade80">${r.correctAnswer}</strong></span>` : ''}
      </div>
      <div class="result-explanation">${r.explanation}</div>
    </div>
  `).join('');
}

function renderPerformanceChart({ correct, wrong, total }) {
  const canvas = document.getElementById('performance-chart');
  if (!canvas || !window.Chart) return;

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Benar', 'Salah'],
      datasets: [{
        data: [correct, wrong],
        backgroundColor: ['#4ade80', '#f87171'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8' } }
      },
      cutout: '65%'
    }
  });
}

function retryTest() {
  const results = store.get('testResults');
  const difficulty = results?.difficulty || 'easy';
  store.set('difficulty', difficulty);
  navigateTo('difficulty-select');
}

function goHome() {
  store.remove('testResults');
  navigateTo('home');
}

function shareResult() {
  const results = store.get('testResults');
  if (!results) return;
  const text = `Saya mendapat skor ${results.score} (${results.accuracy}% akurasi) di NumTest CPNS level ${utils.getDifficultyLabel(results.difficulty)}! 🎯`;
  if (navigator.share) {
    navigator.share({ title: 'NumTest CPNS', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => utils.showToast('Hasil disalin!', 'success'));
  }
}

window.init_results = init_results;
window.retryTest = retryTest;
window.goHome = goHome;
window.shareResult = shareResult;
