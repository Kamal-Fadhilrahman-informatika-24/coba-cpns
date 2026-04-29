const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const { testLimiter } = require('../middleware/rateLimiter');
const { supabaseAdmin } = require('../config/supabase');
const {
  generateQuestions,
  sanitizeForClient,
  getDifficultyConfig,
  checkDifficultyUnlocked,
  DIFFICULTY_CONFIG
} = require('../utils/questionGenerator');
const { testSessionStore } = require('../services/testSessionStore');

// ─── GET /api/test/difficulties ───────────────────────────────────────
// Returns difficulty info + unlock status for authenticated user
router.get('/difficulties', optionalAuth, async (req, res) => {
  try {
    const result = {};

    for (const [key, config] of Object.entries(DIFFICULTY_CONFIG)) {
      let unlocked = !config.unlockThreshold; // easy = always unlocked

      if (req.user && config.unlockThreshold) {
        unlocked = await checkDifficultyUnlocked(supabaseAdmin, req.user.id, key);
      }

      result[key] = {
        label: config.label,
        questionCount: config.questionCount,
        timeLimit: config.timeLimit,
        unlocked: req.user ? unlocked : (key === 'easy'), // guests only get easy
        unlockRequirement: config.unlockThreshold
          ? `Raih akurasi ≥ ${config.unlockThreshold.minAccuracy}% di level ${config.unlockThreshold.difficulty}`
          : null
      };
    }

    return res.json({ difficulties: result });
  } catch (err) {
    console.error('[test/difficulties]', err);
    return res.status(500).json({ error: 'Gagal mengambil konfigurasi difficulty' });
  }
});

// ─── POST /api/test/start ─────────────────────────────────────────────
// Generates questions server-side, stores them, returns sanitized version + session token
router.post('/start', optionalAuth, async (req, res) => {
  try {
    const { difficulty = 'easy' } = req.body;
    const validDifficulties = ['easy', 'medium', 'hard'];

    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: `Difficulty tidak valid. Pilih: ${validDifficulties.join(', ')}` });
    }

    // Enforce unlock check for authenticated users
    if (req.user && difficulty !== 'easy') {
      const unlocked = await checkDifficultyUnlocked(supabaseAdmin, req.user.id, difficulty);
      if (!unlocked) {
        const config = DIFFICULTY_CONFIG[difficulty];
        return res.status(403).json({
          error: `Level ${difficulty} belum terbuka`,
          requirement: `Raih akurasi ≥ ${config.unlockThreshold.minAccuracy}% di level ${config.unlockThreshold.difficulty} terlebih dahulu`
        });
      }
    }

    const config = getDifficultyConfig(difficulty);
    const questions = generateQuestions(config.questionCount, difficulty);

    // Store full questions (with answers) server-side
    const sessionToken = testSessionStore.create({
      questions,
      difficulty,
      userId: req.user?.id || null,
      timeLimit: config.timeLimit
    });

    // Only send sanitized questions to client (no answers!)
    return res.json({
      sessionToken,
      questions: sanitizeForClient(questions),
      total: questions.length,
      timeLimit: config.timeLimit,
      difficulty,
      difficultyLabel: config.label
    });
  } catch (err) {
    console.error('[test/start]', err);
    return res.status(500).json({ error: 'Gagal membuat sesi test' });
  }
});

// ─── POST /api/test/submit ────────────────────────────────────────────
// Validates answers server-side against stored session
router.post('/submit', testLimiter, optionalAuth, async (req, res) => {
  try {
    const { sessionToken, answers, duration } = req.body;

    if (!sessionToken || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'sessionToken dan answers wajib ada' });
    }

    // Retrieve session
    const session = testSessionStore.get(sessionToken);
    if (!session) {
      return res.status(410).json({ error: 'Sesi test tidak ditemukan atau sudah kedaluwarsa. Mulai ulang test.' });
    }

    // Global validation — prevent crash if session data is malformed
    if (!session.questions || !Array.isArray(session.questions) || session.questions.length === 0) {
      console.error('[test/submit] session has no questions:', session);
      return res.status(500).json({ error: 'Data sesi tidak valid. Mulai ulang test.' });
    }

    if (session.submitted) {
      return res.status(409).json({ error: 'Test ini sudah disubmit sebelumnya' });
    }

    const { questions, difficulty, userId: sessionUserId, timeLimit } = session;

    // Validate answer count — pad with nulls if fewer answers sent
    if (answers.length > questions.length) {
      return res.status(400).json({
        error: `Terlalu banyak jawaban (${answers.length}) dibanding soal (${questions.length})`
      });
    }
    // Pad missing answers with null (treated as unanswered)
    while (answers.length < questions.length) {
      answers.push(null);
    }

    // ─── SERVER-SIDE GRADING ─────────────────────────────────────
    let correct = 0;
    console.log(`[test/submit] Grading ${questions.length} questions, got ${answers.length} answers`);
    const results = questions.map((q, i) => {
      // Accept null/undefined as "not answered"
      const rawAnswer = answers[i];
      const userAnswer = (rawAnswer === null || rawAnswer === undefined || rawAnswer === '') ? null : rawAnswer;
      // Compare numeric values — null is always wrong
      const isCorrect = userAnswer !== null && Number(userAnswer) === Number(q.answer);
      if (isCorrect) correct++;
      console.log(`  Q${i+1}: userAnswer=${userAnswer} correctAnswer=${q.answer} isCorrect=${isCorrect}`);
      return {
        questionId: q.id,
        sequence: q.sequence,
        userAnswer,
        correctAnswer: q.answer,       // safe to reveal AFTER submission
        explanation: q.explanation,    // safe to reveal AFTER submission
        isCorrect
      };
    });

    const total = questions.length;
    const wrong = total - correct;
    const accuracy = Math.round((correct / total) * 100);
    const score = calculateScore(correct, total, duration || timeLimit, difficulty);

    // Mark session as submitted (prevent replay attacks)
    testSessionStore.markSubmitted(sessionToken);

    // ─── PERSISTENCE ─────────────────────────────────────────────
    let levelUnlocked = null;
    const effectiveUserId = req.user?.id || sessionUserId;

    if (effectiveUserId) {
      console.log(`[test/submit] Menyimpan stats untuk userId=${effectiveUserId} score=${score} accuracy=${accuracy}% difficulty=${difficulty}`);

      // 1. Simpan stats dulu — operasi paling penting, isolasi error-nya sendiri
      try {
        await updateUserStats(effectiveUserId, difficulty, score, accuracy);
        console.log('[test/submit] DONE saving stats');
      } catch (statsErr) {
        console.error('[test/submit] GAGAL simpan user_stats:', statsErr);
      }

      // 2. Level progression — boleh gagal tanpa merusak stats
      try {
        levelUnlocked = await handleLevelProgression(effectiveUserId, difficulty, accuracy);
      } catch (lvlErr) {
        console.error('[test/submit] GAGAL level progression:', lvlErr);
      }

      // 3. Save test history — boleh gagal tanpa merusak stats
      try {
        await supabaseAdmin.from('test_history').insert({
          user_id: effectiveUserId,
          score,
          correct_answers: correct,
          wrong_answers: wrong,
          accuracy,
          duration: duration || timeLimit,
          difficulty,
          mode: 'simulation'
        });
      } catch (histErr) {
        console.error('[test/submit] GAGAL simpan test_history:', histErr);
      }
    } else {
      console.log('[test/submit] Guest user — stats tidak disimpan');
    }

    return res.json({
      score,
      correct,
      wrong,
      total,
      accuracy,
      duration: duration || 0,
      difficulty,
      levelUnlocked, // null or 'medium'/'hard' if newly unlocked
      results
    });
  } catch (err) {
    console.error('[test/submit]', err);
    return res.status(500).json({ error: 'Gagal memproses submit test' });
  }
});

// ─── GET /api/test/history ────────────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('test_history')
      .select('id, score, correct_answers, wrong_answers, accuracy, duration, difficulty, mode, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.json({ history: data });
  } catch (err) {
    console.error('[test/history]', err);
    return res.status(500).json({ error: 'Gagal mengambil riwayat test' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────

function calculateScore(correct, total, duration, difficulty) {
  const accuracy = correct / total;
  const diffMultiplier = { easy: 1.0, medium: 1.25, hard: 1.5 }[difficulty] || 1.0;
  // Time bonus: up to 20 extra points if completed quickly
  // Baseline: total * 12 seconds expected per question
  const expectedTime = total * 12;
  const timeFactor = Math.max(0, 1 - (duration / expectedTime));
  const timeBonus = timeFactor * 20;
  return Math.round(Math.min(150, accuracy * 100 * diffMultiplier + timeBonus));
}

async function handleLevelProgression(userId, difficulty, accuracy) {
  const { data: stats, error: fetchErr } = await supabaseAdmin
    .from('user_stats')
    .select('level_unlocked, easy_best_accuracy, medium_best_accuracy')
    .eq('user_id', userId)
    .single();

  if (fetchErr || !stats) {
    console.log('[handleLevelProgression] Tidak ada stats row untuk userId:', userId, '— skip progression');
    return null;
  }

  let newLevelUnlocked = null;
  const updates = {};

  // Track best accuracy per difficulty
  if (difficulty === 'easy' && accuracy > (stats.easy_best_accuracy || 0)) {
    updates.easy_best_accuracy = accuracy;
    // Unlock medium if ≥ 70%
    if (accuracy >= 70 && stats.level_unlocked < 2) {
      updates.level_unlocked = 2;
      newLevelUnlocked = 'medium';
    }
  }

  if (difficulty === 'medium' && accuracy > (stats.medium_best_accuracy || 0)) {
    updates.medium_best_accuracy = accuracy;
    // Unlock hard if ≥ 80%
    if (accuracy >= 80 && stats.level_unlocked < 3) {
      updates.level_unlocked = 3;
      newLevelUnlocked = 'hard';
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('user_stats').update(updates).eq('user_id', userId);
  }

  return newLevelUnlocked;
}

async function updateUserStats(userId, difficulty, score, accuracy) {
  const { data: stats, error: fetchErr } = await supabaseAdmin
    .from('user_stats')
    .select('total_score, high_score, total_matches')
    .eq('user_id', userId)
    .single();

  if (fetchErr || !stats) {
    // Row belum ada → insert baru (fallback jika ensureUserStats belum dipanggil)
    console.log('[updateUserStats] Tidak ada stats untuk userId:', userId, '— melakukan insert baru');
    const { error: insertErr } = await supabaseAdmin.from('user_stats').insert({
      user_id: userId,
      level_unlocked: 1,
      total_score: score,
      high_score: score,
      total_matches: 1,
      wins: 0,
      losses: 0,
      easy_best_accuracy: difficulty === 'easy' ? accuracy : 0,
      medium_best_accuracy: difficulty === 'medium' ? accuracy : 0,
      hard_best_accuracy: difficulty === 'hard' ? accuracy : 0
    });
    if (insertErr) console.error('[updateUserStats] Insert error:', insertErr);
    return;
  }

  const newHighScore = Math.max(stats.high_score || 0, score);
  const newTotalScore = (stats.total_score || 0) + score;
  const newTotalMatches = (stats.total_matches || 0) + 1;

  const { error: updateErr } = await supabaseAdmin.from('user_stats').update({
    total_score: newTotalScore,
    high_score: newHighScore,
    total_matches: newTotalMatches
  }).eq('user_id', userId);

  if (updateErr) console.error('[updateUserStats] Update error:', updateErr);
  else console.log(`[updateUserStats] userId=${userId} score=${score} highScore=${newHighScore} totalScore=${newTotalScore}`);
}

module.exports = router;
