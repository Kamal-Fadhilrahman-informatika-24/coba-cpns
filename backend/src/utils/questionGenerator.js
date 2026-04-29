/**
 * Question Generator — BACKEND ONLY
 *
 * This module is the single source of truth for all test questions.
 * Correct answers are NEVER sent to the client.
 * Questions are stored server-side (in-memory map) per session token.
 */

const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────
// Pattern generators
// ─────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GENERATORS = {
  arithmetic: () => {
    const start = rand(2, 30);
    const diff = rand(2, 15) * (Math.random() < 0.2 ? -1 : 1);
    const seq = Array.from({ length: 6 }, (_, i) => start + i * diff);
    const answer = start + 6 * diff;
    return {
      sequence: seq,
      answer,
      explanation: `Pola aritmatika: setiap suku ${diff > 0 ? 'bertambah' : 'berkurang'} ${Math.abs(diff)}. Suku ke-7 = ${seq[5]} ${diff > 0 ? '+' : ''} ${diff} = ${answer}.`
    };
  },

  geometric: () => {
    const start = rand(1, 4);
    const ratio = rand(2, 3);
    const seq = Array.from({ length: 6 }, (_, i) => start * Math.pow(ratio, i));
    const answer = start * Math.pow(ratio, 6);
    return {
      sequence: seq,
      answer,
      explanation: `Pola geometri: setiap suku dikali ${ratio}. Suku ke-7 = ${seq[5]} × ${ratio} = ${answer}.`
    };
  },

  increasingDiff: () => {
    const start = rand(1, 10);
    const diffStart = rand(2, 6);
    const step = rand(1, 3);
    const seq = [start];
    let d = diffStart;
    for (let i = 0; i < 5; i++) {
      seq.push(seq[seq.length - 1] + d);
      d += step;
    }
    const answer = seq[seq.length - 1] + d;
    const diffs = seq.slice(1).map((v, i) => v - seq[i]);
    return {
      sequence: seq,
      answer,
      explanation: `Pola selisih bertingkat: selisih antar suku adalah ${diffs.join(', ')},... (bertambah ${step} setiap langkah). Suku ke-7 = ${seq[5]} + ${d} = ${answer}.`
    };
  },

  fibonacci: () => {
    const a = rand(1, 8);
    const b = rand(a + 1, a + 10);
    const seq = [a, b];
    for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
    const answer = seq[seq.length - 1] + seq[seq.length - 2];
    return {
      sequence: seq,
      answer,
      explanation: `Pola Fibonacci: setiap suku = jumlah dua suku sebelumnya. ${seq[4]} + ${seq[5]} = ${answer}.`
    };
  },

  alternating: () => {
    const startA = rand(2, 15);
    const diffA = rand(2, 6);
    const startB = rand(10, 30);
    const diffB = rand(3, 8);
    const seq = [];
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) seq.push(startA + (i / 2) * diffA);
      else seq.push(startB + Math.floor(i / 2) * diffB);
    }
    const answer = startA + 3 * diffA;
    return {
      sequence: seq,
      answer,
      explanation: `Pola selang-seling: barisan A = [${startA}, ${startA + diffA}, ${startA + 2 * diffA},...] (bertambah ${diffA}), barisan B = [${startB}, ${startB + diffB},...] (bertambah ${diffB}). Suku ke-7 = ${answer}.`
    };
  },

  squares: () => {
    const offset = rand(0, 20);
    const seq = Array.from({ length: 6 }, (_, i) => (i + 1) * (i + 1) + offset);
    const answer = 49 + offset;
    return {
      sequence: seq,
      answer,
      explanation: `Pola kuadrat: suku ke-n = n²${offset > 0 ? ' + ' + offset : ''}. Suku ke-7 = 7² + ${offset} = 49 + ${offset} = ${answer}.`
    };
  },

  mixedMultAdd: () => {
    const start = rand(1, 5);
    const mult = rand(2, 3);
    const add = rand(-3, 8);
    const seq = [start];
    for (let i = 0; i < 5; i++) seq.push(seq[seq.length - 1] * mult + add);
    const answer = seq[seq.length - 1] * mult + add;
    return {
      sequence: seq,
      answer,
      explanation: `Pola kombinasi: setiap suku × ${mult} ${add >= 0 ? '+ ' + add : '- ' + Math.abs(add)}. Suku ke-7 = ${seq[5]} × ${mult} ${add >= 0 ? '+ ' + add : '- ' + Math.abs(add)} = ${answer}.`
    };
  },

  primes: () => {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    const startIdx = rand(0, 5);
    const seq = primes.slice(startIdx, startIdx + 6);
    const answer = primes[startIdx + 6];
    return {
      sequence: seq,
      answer,
      explanation: `Barisan bilangan prima. Setelah ${seq[5]}, bilangan prima berikutnya adalah ${answer}.`
    };
  },

  cubes: () => {
    const offset = rand(0, 5);
    const seq = Array.from({ length: 6 }, (_, i) => Math.pow(i + 1, 3) + offset);
    const answer = Math.pow(7, 3) + offset;
    return {
      sequence: seq,
      answer,
      explanation: `Pola kubik: suku ke-n = n³${offset > 0 ? ' + ' + offset : ''}. Suku ke-7 = 7³ + ${offset} = 343 + ${offset} = ${answer}.`
    };
  },

  triangular: () => {
    // Triangular numbers: 1, 3, 6, 10, 15, 21, ...
    const seq = Array.from({ length: 6 }, (_, i) => (i + 1) * (i + 2) / 2);
    const answer = 7 * 8 / 2;
    return {
      sequence: seq,
      answer,
      explanation: `Bilangan segitiga: suku ke-n = n(n+1)/2. Suku ke-7 = 7×8/2 = ${answer}.`
    };
  },

  powerOfTwo: () => {
    const start = rand(1, 3);
    const seq = Array.from({ length: 6 }, (_, i) => start * Math.pow(2, i));
    const answer = start * Math.pow(2, 6);
    return {
      sequence: seq,
      answer,
      explanation: `Pola pangkat 2: setiap suku dikali 2. Suku ke-7 = ${seq[5]} × 2 = ${answer}.`
    };
  }
};

// Difficulty → allowed generators + distractor logic
const DIFFICULTY_CONFIG = {
  easy: {
    generators: ['arithmetic', 'geometric', 'squares', 'powerOfTwo'],
    questionCount: 10,
    timeLimit: 90,
    distractorRange: [-3, -2, -1, 1, 2, 3],
    label: 'Easy',
    unlockThreshold: null // always unlocked
  },
  medium: {
    generators: ['increasingDiff', 'fibonacci', 'alternating', 'squares', 'triangular', 'primes'],
    questionCount: 15,
    timeLimit: 120,
    distractorRange: [-5, -4, -3, -2, 2, 3, 4, 5],
    label: 'Medium',
    unlockThreshold: { difficulty: 'easy', minAccuracy: 70 }
  },
  hard: {
    generators: ['mixedMultAdd', 'increasingDiff', 'fibonacci', 'cubes', 'primes'],
    questionCount: 20,
    timeLimit: 150,
    distractorRange: [-8, -6, -4, -3, 3, 4, 6, 8, 10, -10],
    label: 'Hard',
    unlockThreshold: { difficulty: 'medium', minAccuracy: 80 }
  }
};

/**
 * Generate distractors that look plausible but are wrong.
 */
function generateDistractors(answer, distractorRange, count = 3) {
  const distractors = new Set();
  let attempts = 0;
  while (distractors.size < count && attempts < 50) {
    attempts++;
    const offset = distractorRange[rand(0, distractorRange.length - 1)];
    const candidate = answer + offset;
    if (candidate !== answer && candidate > 0 && !distractors.has(candidate)) {
      distractors.add(candidate);
    }
  }
  // Fallback if not enough distractors
  let fallback = answer + 1;
  while (distractors.size < count) {
    if (fallback !== answer) distractors.add(fallback);
    fallback++;
  }
  return [...distractors];
}

/**
 * Generate a full question set for a given difficulty.
 * Returns questions WITH answers (for server-side storage).
 * NEVER send full questions to the client.
 */
function generateQuestions(count, difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  const genNames = config.generators;

  return Array.from({ length: count }, (_, idx) => {
    const genName = genNames[rand(0, genNames.length - 1)];
    const generated = GENERATORS[genName]();
    const distractors = generateDistractors(generated.answer, config.distractorRange);
    const options = shuffle([generated.answer, ...distractors]);

    return {
      id: idx + 1,
      sessionId: uuidv4(), // unique per question for integrity
      type: genName,
      sequence: generated.sequence,
      answer: generated.answer,       // ← SERVER ONLY
      explanation: generated.explanation,
      options,
      difficulty
    };
  });
}

/**
 * Format sequence as a human-readable question string.
 * Ensures frontend always has a ready-to-display question text.
 */
function formatQuestion(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) return 'Soal tidak tersedia';
  return sequence.join(', ') + ', ?';
}

/**
 * Strip server-only fields before sending to client.
 * Adds `question` field — DATA CONTRACT: always present, never undefined.
 */
function sanitizeForClient(questions) {
  return questions.map(q => ({
    id: q.id,
    type: q.type,
    sequence: q.sequence,
    question: formatQuestion(q.sequence),   // ← always a string, never undefined
    options: q.options,
    difficulty: q.difficulty
    // NO answer, NO explanation, NO sessionId
  }));
}

/**
 * Get difficulty config (for time limits, etc.)
 */
function getDifficultyConfig(difficulty) {
  return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
}

/**
 * Check if a difficulty is unlocked for a user based on their best scores.
 */
async function checkDifficultyUnlocked(supabaseAdmin, userId, difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty];
  if (!config || !config.unlockThreshold) return true; // easy is always unlocked

  const { difficulty: reqDiff, minAccuracy } = config.unlockThreshold;

  // Find best accuracy in required difficulty
  const { data, error } = await supabaseAdmin
    .from('test_history')
    .select('accuracy')
    .eq('user_id', userId)
    .eq('difficulty', reqDiff)
    .eq('mode', 'simulation')
    .order('accuracy', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return false;
  return data.accuracy >= minAccuracy;
}

module.exports = {
  generateQuestions,
  sanitizeForClient,
  getDifficultyConfig,
  checkDifficultyUnlocked,
  DIFFICULTY_CONFIG
};
