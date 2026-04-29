/**
 * Multiplayer Page — Matchmaking + Real-time Game
 *
 * Client role: emit user actions, react to server events.
 * Server role: manage queue, generate questions, validate answers, update scores.
 */

let mpState = {
  phase: 'idle',
  roomId: null,
  questions: [],      // sanitized — NO answers
  players: {},
  myUserId: null,
  currentIndex: 0,
  answers: [],
  score: 0,
  timerInterval: null,
  endTime: null,
  answered: false
};

function init_multiplayer() {
  if (!window.auth.isLoggedIn()) {
    showModal({
      title: 'LOGIN DIPERLUKAN',
      body: 'Kamu harus login untuk bermain multiplayer.',
      actions: [
        { label: 'Login', class: 'btn-primary', action: () => { closeModal(); navigateTo('login'); } },
        { label: 'Batal', class: 'btn-ghost', action: () => { closeModal(); navigateTo('home'); } }
      ]
    });
    return;
  }

  renderNavbar();
  setMpPhase('idle');

  window.socketService.connect();
  setupSocketListeners();
}

function setupSocketListeners() {
  const s = window.socketService;
  const user = window.auth.getUser();
  mpState.myUserId = user?.id;

  s.removeListeners([
    'matchmaking:waiting', 'matchmaking:matched', 'matchmaking:error', 'matchmaking:left',
    'match:countdown', 'match:start', 'score:update', 'match:answerFeedback',
    'match:end', 'match:playerLeft', 'match:playerFinished'
  ]);

  s.on('matchmaking:waiting', ({ position }) => {
    setMpPhase('waiting');
    const el = document.getElementById('queue-position');
    if (el) el.textContent = position;
  });

  s.on('matchmaking:matched', (data) => {
    mpState.roomId = data.roomId;
    mpState.questions = data.questions;
    mpState.answers = new Array(data.questions.length).fill(null);
    mpState.currentIndex = 0;
    mpState.score = 0;
    mpState.answered = false;
    mpState.isFinished = false;

    mpState.players = {
      [data.self.userId]: { ...data.self, score: 0, correct: 0, answered: 0, isMe: true },
      [data.opponent.userId]: { ...data.opponent, score: 0, correct: 0, answered: 0, isMe: false }
    };

    setMpPhase('matched');
    renderMatchedScreen(data);
  });

  s.on('matchmaking:error', ({ message }) => {
    utils.showToast(message, 'error');
    setMpPhase('idle');
  });

  s.on('matchmaking:left', () => setMpPhase('idle'));

  s.on('match:countdown', ({ count }) => {
    const el = document.getElementById('countdown-number');
    if (el) {
      el.textContent = count > 0 ? count : 'MULAI!';
      el.style.animation = 'none';
      void el.offsetHeight; // reflow
      el.style.animation = '';
    }
    if (count <= 0) {
      setTimeout(() => {
        document.getElementById('countdown-overlay')?.classList.add('hidden');
      }, 800);
    }
  });

  s.on('match:start', ({ endTime }) => {
    mpState.endTime = endTime;
    setMpPhase('active');
    renderMpQuestion(0);
    startMpTimer(endTime);
  });

  // Real-time score update from server
  s.on('score:update', ({ players }) => {
    players.forEach(p => {
      if (mpState.players[p.userId]) {
        mpState.players[p.userId].score = p.score;
        mpState.players[p.userId].correct = p.correct;
        mpState.players[p.userId].answered = p.answered;
      }
    });
    renderScoreboard();
  });

  // Server reveals correct answer after submission
  s.on('match:answerFeedback', ({ questionId, isCorrect, correctAnswer, explanation, currentScore }) => {
    mpState.score = currentScore;
    const qIdx = questionId - 1;

    // Color the options
    document.querySelectorAll('.mp-option-btn').forEach(btn => {
      const val = parseInt(btn.dataset.value);
      if (val === correctAnswer) btn.classList.add('correct');
      else if (val === mpState.answers[qIdx] && !isCorrect) btn.classList.add('wrong');
    });

    // Brief explanation toast
    const msg = isCorrect ? `✅ Benar! +${currentScore - (mpState.score - (isCorrect ? 10 : 0))} poin` : `❌ Jawaban benar: ${correctAnswer}`;
    utils.showToast(msg, isCorrect ? 'success' : 'error', 2000);

    // Show explanation briefly
    const expEl = document.getElementById('mp-explanation');
    if (expEl) {
      expEl.textContent = explanation;
      expEl.classList.remove('hidden');
    }

    // Auto-advance
    if (qIdx < mpState.questions.length - 1) {
      setTimeout(() => {
        expEl?.classList.add('hidden');
        navigateMpQuestion(qIdx + 1);
      }, 1200);
    } else {
      setTimeout(() => {
        window.socketService.finishMatch(mpState.roomId);
      }, 1200);
    }
  });

  s.on('match:playerFinished', ({ username, isEarlyFinish }) => {
    utils.showToast(`${username} selesai menjawab semua soal!`, 'info', 2000);
  });

  // Dipanggil saat satu pemain menyelesaikan semua soal → match langsung dihentikan
  s.on('match:earlyEnd', ({ finishedBy, message }) => {
    console.log('[mp] match:earlyEnd — match dihentikan lebih awal oleh:', finishedBy.username);
    mpState.isFinished = true;
    clearInterval(mpState.timerInterval);

    // Tampilkan notifikasi ke semua pemain
    utils.showToast(message || `${finishedBy.username} menyelesaikan semua soal!`, 'warning', 4000);

    // Disable semua input — match sudah selesai
    document.querySelectorAll('.mp-option-btn').forEach(btn => { btn.disabled = true; });

    // Tampilkan indikator visual bahwa match sedang diakhiri
    const timerEl = document.getElementById('mp-timer');
    if (timerEl) timerEl.textContent = 'Match selesai...';
  });

  s.on('match:playerLeft', ({ username }) => {
    utils.showToast(`${username} meninggalkan pertandingan`, 'warning');
  });

  s.on('match:end', (result) => {
    clearInterval(mpState.timerInterval);
    setMpPhase('ended');
    renderMatchResult(result);
  });
}

function joinMatchmaking() {
  const user = window.auth.getUser();
  window.socketService.joinMatchmaking(user?.username || user?.email?.split('@')[0] || 'Player');
}

function leaveMatchmaking() {
  window.socketService.leaveMatchmaking();
  setMpPhase('idle');
}

function renderMatchedScreen(data) {
  setMpPhase('countdown');
  const overlay = document.getElementById('countdown-overlay');
  if (overlay) overlay.classList.remove('hidden');

  const oppName = document.getElementById('opponent-name');
  if (oppName) oppName.textContent = data.opponent.username;
}

function renderMpQuestion(index) {
  mpState.currentIndex = index;
  mpState.answered = mpState.answers[index] !== null;

  const q = mpState.questions[index];
  if (!q) return;

  const counter = document.getElementById('mp-question-counter');
  if (counter) counter.textContent = `${index + 1} / ${mpState.questions.length}`;

  const progress = document.getElementById('mp-progress');
  if (progress) progress.style.width = `${((index + 1) / mpState.questions.length) * 100}%`;

  const seqEl = document.getElementById('mp-sequence');
  if (seqEl) {
    seqEl.innerHTML = q.sequence.map((n, i) =>
      `<span class="seq-chip">${n}</span>${i < q.sequence.length - 1 ? '<span class="seq-sep">→</span>' : ''}`
    ).join('') + '<span class="seq-sep">→</span><span class="seq-chip blank">?</span>';
  }

  const optsEl = document.getElementById('mp-options');
  if (optsEl) {
    optsEl.innerHTML = q.options.map(opt =>
      `<button class="mp-option-btn ${mpState.answers[index] === opt ? 'selected' : ''}"
               data-value="${opt}"
               onclick="submitMpAnswer(${opt})"
               ${mpState.answered ? 'disabled' : ''}>
        ${opt}
      </button>`
    ).join('');
  }

  const expEl = document.getElementById('mp-explanation');
  if (expEl) expEl.classList.add('hidden');
}

function navigateMpQuestion(index) {
  mpState.answered = mpState.answers[index] !== null;
  renderMpQuestion(index);
}

function submitMpAnswer(answer) {
  if (mpState.answered) return;
  if (mpState.isFinished) return; // match sudah selesai — block input

  const idx = mpState.currentIndex;
  mpState.answers[idx] = answer;
  mpState.answered = true;

  // Disable options immediately
  document.querySelectorAll('.mp-option-btn').forEach(btn => {
    btn.disabled = true;
    if (parseInt(btn.dataset.value) === answer) btn.classList.add('selected');
  });

  // Send to server — server validates + emits answerFeedback
  window.socketService.submitAnswer(mpState.roomId, idx + 1, answer);
}

function renderScoreboard() {
  const container = document.getElementById('mp-scoreboard');
  if (!container) return;

  const players = Object.values(mpState.players);
  container.innerHTML = players.map(p => `
    <div class="score-row ${p.isMe ? 'me' : ''}">
      <span class="score-name">${p.isMe ? '👤 ' : ''}${p.username}</span>
      <span class="score-answered">${p.answered || 0}/${mpState.questions.length}</span>
      <span class="score-pts">${p.score} pts</span>
    </div>
  `).join('');
}

function startMpTimer(endTime) {
  const timerEl = document.getElementById('mp-timer');
  if (!timerEl) return;

  if (mpState.timerInterval) clearInterval(mpState.timerInterval);

  mpState.timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    timerEl.textContent = utils.formatTime(remaining);

    if (remaining <= 10) timerEl.classList.add('danger');
    else if (remaining <= 20) timerEl.classList.add('warning');

    if (remaining <= 0) {
      clearInterval(mpState.timerInterval);
      window.socketService.finishMatch(mpState.roomId);
    }
  }, 500);
}

function renderMatchResult(result) {
  const container = document.getElementById('mp-result-container');
  if (!container) return;

  const myPlayer = result.players.find(p => p.userId === mpState.myUserId);
  const opponent = result.players.find(p => p.userId !== mpState.myUserId);
  const isDraw = !result.winnerId;
  const iWon = result.winnerId === mpState.myUserId;

  container.innerHTML = `
    <div class="mp-result">
      <div class="mp-result-header ${iWon ? 'win' : isDraw ? 'draw' : 'lose'}">
        <div class="result-emoji">${iWon ? '🏆' : isDraw ? '🤝' : '😞'}</div>
        <div class="result-verdict">${iWon ? 'KAMU MENANG!' : isDraw ? 'SERI!' : 'KAMU KALAH'}</div>
      </div>
      <div class="mp-score-comparison">
        <div class="player-score me">
          <div class="ps-name">Kamu</div>
          <div class="ps-score">${myPlayer?.score || 0}</div>
          <div class="ps-detail">${myPlayer?.correct || 0}/${result.players[0]?.total || 0} benar</div>
        </div>
        <div class="vs-badge">VS</div>
        <div class="player-score opp">
          <div class="ps-name">${opponent?.username || 'Lawan'}</div>
          <div class="ps-score">${opponent?.score || 0}</div>
          <div class="ps-detail">${opponent?.correct || 0}/${result.players[0]?.total || 0} benar</div>
        </div>
      </div>
      <div class="mp-result-actions">
        <button class="btn btn-primary" onclick="rematch()">Main Lagi</button>
        <button class="btn btn-ghost" onclick="navigateTo('home')">Beranda</button>
      </div>
    </div>
  `;
}

function rematch() {
  mpState = {
    phase: 'idle', roomId: null, questions: [], players: {},
    myUserId: window.auth.getUser()?.id, currentIndex: 0,
    answers: [], score: 0, timerInterval: null, endTime: null, answered: false
  };
  setMpPhase('idle');
  setupSocketListeners();
}

function setMpPhase(phase) {
  mpState.phase = phase;
  const phases = ['idle', 'waiting', 'matched', 'countdown', 'active', 'ended'];
  phases.forEach(p => {
    const el = document.getElementById(`mp-phase-${p}`);
    if (el) el.classList.toggle('hidden', p !== phase);
  });
}

window.init_multiplayer = init_multiplayer;
window.joinMatchmaking = joinMatchmaking;
window.leaveMatchmaking = leaveMatchmaking;
window.submitMpAnswer = submitMpAnswer;
window.rematch = rematch;
