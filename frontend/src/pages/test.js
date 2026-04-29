/**
 * Test Engine — Simulation Mode
 *
 * ARCHITECTURE (AFTER REFACTOR):
 * - Questions fetched from backend via POST /api/test/start
 * - Answers submitted to backend via POST /api/test/submit
 * - Client never knows correct answers until results are returned by server
 * - No generateLocalQuestions(), no local scoring
 */

let testState = {
  sessionToken: null,    // opaque token for server-side session
  questions: [],         // sanitized (no answers)
  answers: [],
  currentIndex: 0,
  startTime: null,
  timeLimit: 120,
  timerInterval: null,
  difficulty: 'easy',
  answered: false,
  difficultyConfig: {}
};

// ─── Difficulty selection screen ──────────────────────────────────────
async function init_difficulty_select() {
  renderNavbar();

  const container = document.getElementById('difficulty-cards-container');
  if (!container) return;

  // Show loading state
  container.innerHTML = `<div class="loading-pulse" style="text-align:center;padding:2rem;color:#94a3b8;">Memuat konfigurasi...</div>`;

  try {
    const { difficulties } = await window.api.getDifficulties();
    testState.difficultyConfig = difficulties;
    renderDifficultyCards(difficulties);
  } catch (err) {
    container.innerHTML = `<div style="color:#f87171;text-align:center;padding:2rem;">
      ⚠️ Gagal memuat konfigurasi. <button onclick="init_difficulty_select()" class="btn btn-ghost" style="margin-top:.5rem;">Coba Lagi</button>
    </div>`;
  }
}

function renderDifficultyCards(difficulties) {
  const container = document.getElementById('difficulty-cards-container');
  if (!container) return;

  const diffOrder = ['easy', 'medium', 'hard'];
  const icons = { easy: '🟢', medium: '🟡', hard: '🔴' };

  container.innerHTML = diffOrder.map(key => {
    const d = difficulties[key];
    if (!d) return '';

    const isUnlocked = d.unlocked;
    const color = utils.getDifficultyColor(key);

    return `
      <div class="difficulty-card ${isUnlocked ? 'unlocked' : 'locked'}" 
           data-diff="${key}"
           onclick="${isUnlocked ? `selectDifficulty('${key}')` : 'void(0)'}"
           style="border-color: ${isUnlocked ? color : '#374151'}; opacity: ${isUnlocked ? 1 : 0.6}; cursor: ${isUnlocked ? 'pointer' : 'not-allowed'}">
        <div class="diff-icon">${icons[key]}</div>
        <div class="diff-label" style="color:${isUnlocked ? color : '#6b7280'}">${d.label}</div>
        <div class="diff-meta">
          <span>${d.questionCount} soal</span>
          <span>⏱ ${d.timeLimit}s</span>
        </div>
        ${isUnlocked
          ? '<div class="diff-status unlocked-badge">✓ Terbuka</div>'
          : `<div class="diff-status locked-badge">🔒 ${d.unlockRequirement || 'Terkunci'}</div>`
        }
      </div>
    `;
  }).join('');

  // Select first unlocked difficulty
  const firstUnlocked = diffOrder.find(k => difficulties[k]?.unlocked) || 'easy';
  selectDifficulty(firstUnlocked);
}

function selectDifficulty(diff) {
  const config = testState.difficultyConfig[diff];
  if (!config?.unlocked) {
    utils.showToast(`Level ${diff} belum terbuka. ${config?.unlockRequirement || ''}`, 'warning');
    return;
  }
  testState.difficulty = diff;
  store.set('difficulty', diff);

  document.querySelectorAll('.difficulty-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.diff === diff);
  });
}

// ─── Start simulation ─────────────────────────────────────────────────
async function startSimulation() {
  const difficulty = testState.difficulty || store.get('difficulty') || 'easy';
  const btn = document.getElementById('btn-start-sim');

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading-spin">⟳</span> Memuat Soal...'; }

  try {
    // POST /api/test/start → server generates + stores questions, returns sanitized set
    const data = await window.api.startTest(difficulty);

    testState = {
      sessionToken: data.sessionToken,  // opaque — for submission
      questions: data.questions,         // NO answers inside
      answers: new Array(data.questions.length).fill(null),
      currentIndex: 0,
      startTime: Date.now(),
      timeLimit: data.timeLimit,
      timerInterval: null,
      difficulty,
      answered: false,
      difficultyConfig: testState.difficultyConfig
    };

    store.set('currentTest', testState);
    navigateTo('test');
  } catch (err) {
    utils.showToast(err.message || 'Gagal memuat soal. Coba lagi.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Mulai Simulasi'; }
  }
}

// ─── Test in progress ─────────────────────────────────────────────────
function init_test() {
  const test = store.get('currentTest');
  if (!test?.questions?.length || !test.sessionToken) {
    navigateTo('home');
    return;
  }

  // Restore state
  testState = { ...testState, ...test };

  renderNavbar(false);
  renderQuestion(testState.currentIndex);
  startTimer(test);
}

function renderQuestion(index) {
  const test = store.get('currentTest') || testState;
  const q = test.questions[index];
  if (!q) return;

  testState.answered = test.answers[index] !== null;

  const counter = document.getElementById('question-counter');
  if (counter) counter.innerHTML = `Soal <span>${index + 1}</span> / ${test.questions.length}`;

  const progress = document.getElementById('test-progress');
  if (progress) progress.style.width = `${((index + 1) / test.questions.length) * 100}%`;

  const diffBadge = document.getElementById('test-difficulty');
  if (diffBadge) {
    diffBadge.textContent = utils.getDifficultyLabel(test.difficulty);
    diffBadge.style.color = utils.getDifficultyColor(test.difficulty);
  }

  // Sequence display
  const seqContainer = document.getElementById('question-sequence');
  if (seqContainer) {
    seqContainer.innerHTML =
      q.sequence.map((n, i) =>
        `<div class="seq-item">${n}</div>${i < q.sequence.length - 1 ? '<span class="seq-sep">→</span>' : ''}`
      ).join('') + '<span class="seq-sep">→</span><div class="seq-item blank">?</div>';
  }

  // Options (client does NOT know correct answer yet)
  const optContainer = document.getElementById('options-grid');
  if (optContainer) {
    const selectedAnswer = test.answers[index];
    optContainer.innerHTML = q.options.map(opt =>
      `<button class="option-btn ${selectedAnswer === opt ? 'selected' : ''}"
               onclick="selectAnswer(${opt})"
               ${testState.answered ? 'disabled' : ''}>
        ${opt}
      </button>`
    ).join('');
  }

  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  const submitBtn = document.getElementById('btn-submit');
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.style.display = index < test.questions.length - 1 ? 'flex' : 'none';
  if (submitBtn) submitBtn.style.display = index === test.questions.length - 1 ? 'flex' : 'none';
}

function selectAnswer(answer) {
  const test = store.get('currentTest') || testState;
  const idx = test.currentIndex;

  if (test.answers[idx] !== null) return; // already answered

  test.answers[idx] = answer;
  testState.answered = true;
  store.set('currentTest', test);

  // Visual feedback — highlight selected only (no correct/wrong reveal)
  document.querySelectorAll('.option-btn').forEach(btn => {
    const val = parseInt(btn.textContent.trim());
    btn.classList.remove('selected');
    if (val === answer) btn.classList.add('selected');
    btn.disabled = true;
  });

  // Auto-advance
  if (idx < test.questions.length - 1) {
    setTimeout(() => navigateQuestion(1), 500);
  }
}

function navigateQuestion(direction) {
  const test = store.get('currentTest') || testState;
  const newIndex = test.currentIndex + direction;
  if (newIndex < 0 || newIndex >= test.questions.length) return;
  test.currentIndex = newIndex;
  testState.currentIndex = newIndex;
  testState.answered = test.answers[newIndex] !== null;
  store.set('currentTest', test);
  renderQuestion(newIndex);
}

function startTimer(test) {
  const timerEl = document.getElementById('timer-value');
  if (!timerEl) return;

  // Calculate remaining time accounting for time already elapsed
  const elapsed = Math.floor((Date.now() - test.startTime) / 1000);
  let remaining = Math.max(0, test.timeLimit - elapsed);

  if (testState.timerInterval) clearInterval(testState.timerInterval);

  timerEl.textContent = utils.formatTime(remaining);

  testState.timerInterval = setInterval(() => {
    remaining--;
    timerEl.textContent = utils.formatTime(remaining);

    if (remaining <= 10) {
      timerEl.classList.remove('warning');
      timerEl.classList.add('danger');
    } else if (remaining <= 30) {
      timerEl.classList.add('warning');
    }

    if (remaining <= 0) {
      clearInterval(testState.timerInterval);
      submitTest(true);
    }
  }, 1000);
}

// ─── Submit to backend for grading ───────────────────────────────────
async function submitTest(autoSubmit = false) {
  clearInterval(testState.timerInterval);

  const test = store.get('currentTest') || testState;

  if (!autoSubmit) {
    const unanswered = test.answers.filter(a => a === null).length;
    if (unanswered > 0) {
      if (!confirm(`Masih ada ${unanswered} soal belum dijawab. Yakin ingin submit?`)) return;
    }
  }

  const duration = Math.floor((Date.now() - test.startTime) / 1000);
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '⟳ Mengirim...'; }

  try {
    // Server grades everything — returns results WITH correct answers revealed
    const results = await window.api.submitTest(
      test.sessionToken,
      test.answers,
      duration
    );

    // If a new level was unlocked, show notification
    if (results.levelUnlocked) {
      const levelNames = { medium: 'Menengah', hard: 'Sulit' };
      results._levelUnlockedMessage = `🎉 Level ${levelNames[results.levelUnlocked] || results.levelUnlocked} telah terbuka!`;
    }

    store.set('testResults', results);
    store.remove('currentTest');
    navigateTo('results');
  } catch (err) {
    utils.showToast(err.message || 'Gagal submit test. Coba lagi.', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Submit Test'; }
  }
}

window.init_difficulty_select = init_difficulty_select;
window.init_test = init_test;
window.selectDifficulty = selectDifficulty;
window.startSimulation = startSimulation;
window.selectAnswer = selectAnswer;
window.navigateQuestion = navigateQuestion;
window.submitTest = submitTest;
