/**
 * Socket.IO Matchmaking Handler — Production Grade
 *
 * Matchmaking queue is persisted in Supabase (matchmaking_queue table),
 * not in-memory Map. This makes it horizontally scalable.
 *
 * Active room state is kept in memory (acceptable since rooms are ephemeral,
 * bounded to a single server process during the match). For multi-server
 * deployments, replace activeRooms with a Redis hash.
 */

const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../config/supabase');
const { generateQuestions, sanitizeForClient } = require('../utils/questionGenerator');
const { verifyToken } = require('../middleware/auth');

// ─── In-memory active room state ───────────────────────────────────────
// Key: roomId, Value: RoomState
const activeRooms = new Map();
// Key: userId, Value: socketId (for reverse lookup)
const userSocketMap = new Map();

// ─── Room state shape ──────────────────────────────────────────────────
// {
//   id: string,
//   status: 'waiting'|'countdown'|'active'|'finished',
//   questions: Question[],   // with answers — server only
//   matchDuration: number,   // seconds
//   startTime: number,
//   endTime: number,
//   players: {
//     [userId]: {
//       userId, username, socketId, socket,
//       score, correct, answers: [], finished, finishedAt
//     }
//   }
// }

// ─────────────────────────────────────────────────────────────────────────

// Pastikan user ada di tabel `users` — critical untuk FK di matchmaking_queue
// Cek berdasarkan EMAIL (bukan ID) untuk handle kasus user sudah ada
// dengan ID berbeda (email/password vs Google OAuth).
async function ensureUserInTable(user) {
  if (!user?.id || !user?.email) return;
  const email = user.email.toLowerCase();
  try {
    // Step 1: cek berdasarkan email
    const { data: existingByEmail } = await supabaseAdmin
      .from('users')
      .select('id, provider')
      .eq('email', email)
      .single();

    if (existingByEmail) {
      // Sudah ada — pakai ID yang ada agar FK konsisten
      if (existingByEmail.id !== user.id) {
        console.log(`[socket/auth] Email ${email} sudah ada dengan ID berbeda. Pakai ID lama: ${existingByEmail.id}`);
        user.id = existingByEmail.id; // sinkronkan agar matchmaking_queue pakai ID yang benar
      }
      return;
    }

    // Step 2: belum ada — insert baru
    console.log(`[socket/auth] User ${user.id} belum ada di tabel users — melakukan insert`);
    const { error: insertErr } = await supabaseAdmin.from('users').insert({
      id: user.id,
      email: email,
      username: user.username || email.split('@')[0],
      provider: user.provider === 'supabase' ? 'google' : 'email'
    });
    if (insertErr) console.error('[socket/auth] Gagal insert user ke tabel users:', insertErr);
    else console.log(`[socket/auth] User ${user.id} berhasil diinsert ke tabel users`);
  } catch (err) {
    console.error('[socket/auth] ensureUserInTable error:', err);
  }
}

function setupSocketHandlers(io) {
  // Socket auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.user = null;
      return next();
    }
    try {
      socket.user = await verifyToken(token);
      // Sync user ke tabel users SEBELUM masuk ke handlers
      // Ini mencegah FK violation di matchmaking_queue.user_id
      await ensureUserInTable(socket.user);
    } catch {
      socket.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id} user=${socket.user?.id || 'guest'}`);

    if (socket.user?.id) {
      userSocketMap.set(socket.user.id, socket.id);
    }

    // Debug: log every event from this socket
    socket.onAny((event, ...args) => {
      console.log(`[socket:${socket.id}] event="${event}"`, JSON.stringify(args).slice(0, 200));
    });

    // ─── JOIN MATCHMAKING ──────────────────────────────────────────
    socket.on('matchmaking:join', async ({ username } = {}) => {
      try {
        if (!socket.user) {
          return socket.emit('matchmaking:error', { message: 'Login diperlukan untuk bermain multiplayer' });
        }

        const userId = socket.user.id;
        const displayName = username || socket.user.username || socket.user.email?.split('@')[0] || 'Player';

        // Clean up any stale entry for this user
        await supabaseAdmin
          .from('matchmaking_queue')
          .delete()
          .eq('user_id', userId);

        // Insert into persistent queue
        const { error: insertErr } = await supabaseAdmin
          .from('matchmaking_queue')
          .insert({ user_id: userId, socket_id: socket.id, username: displayName });

        if (insertErr) {
          console.error('[matchmaking:join] insert error', insertErr);
          return socket.emit('matchmaking:error', { message: 'Gagal bergabung ke antrian' });
        }

        // Get queue position
        const { count } = await supabaseAdmin
          .from('matchmaking_queue')
          .select('*', { count: 'exact', head: true });

        socket.emit('matchmaking:waiting', { position: count || 1 });
        console.log(`[matchmaking] user ${userId} joined queue. Queue size ≈ ${count}`);

        // Try to match
        await tryMatch(io, socket);
      } catch (err) {
        console.error('[matchmaking:join]', err);
        socket.emit('matchmaking:error', { message: 'Kesalahan server saat join antrian' });
      }
    });

    // ─── LEAVE MATCHMAKING ──────────────────────────────────────────
    socket.on('matchmaking:leave', async () => {
      if (socket.user?.id) {
        await supabaseAdmin
          .from('matchmaking_queue')
          .delete()
          .eq('user_id', socket.user.id);
      }
      socket.emit('matchmaking:left');
    });

    // ─── SUBMIT ANSWER ──────────────────────────────────────────────
    socket.on('match:answer', ({ roomId, questionId, answer }) => {
      try {
        if (!socket.user) return;

        const room = activeRooms.get(roomId);
        // Block jawaban kalau room tidak active — termasuk kalau sudah 'finished'
        if (!room || room.status !== 'active') return;

        const player = room.players[socket.user.id];
        if (!player || player.finished) return; // block kalau player sudah selesai

        const qIndex = questionId - 1;
        const question = room.questions[qIndex];
        if (!question) return;

        // Prevent re-answering
        if (player.answers[qIndex] !== undefined) return;

        const isCorrect = Number(answer) === Number(question.answer);
        player.answers[qIndex] = answer;

        if (isCorrect) {
          player.correct++;
          // Score: 10 base + time bonus (up to 5 extra)
          const secondsLeft = Math.max(0, Math.floor((room.endTime - Date.now()) / 1000));
          player.score += 10 + Math.floor(secondsLeft / 10);
        }

        // Emit personal feedback (reveals correct answer only to that player)
        socket.emit('match:answerFeedback', {
          questionId,
          isCorrect,
          correctAnswer: question.answer,
          explanation: question.explanation,
          currentScore: player.score
        });

        // Broadcast live score update to entire room
        io.to(roomId).emit('score:update', buildScoreUpdate(room));

        // ─── EARLY FINISH: cek apakah player sudah jawab semua soal ───
        const answeredCount = player.answers.filter(a => a !== undefined).length;
        const totalQuestions = room.questions.length;

        if (answeredCount >= totalQuestions) {
          player.finished = true;
          player.finishedAt = Date.now();

          console.log(`[match:answer] Player ${player.userId} (${player.username}) selesai duluan — ${answeredCount}/${totalQuestions} soal dijawab`);

          // Broadcast ke semua pemain: siapa yang baru selesai
          io.to(roomId).emit('match:playerFinished', {
            userId: player.userId,
            username: player.username,
            score: player.score,
            isEarlyFinish: true
          });

          // Cek apakah semua pemain sudah selesai
          const allFinished = Object.values(room.players).every(p => p.finished);
          if (allFinished) {
            console.log(`[match:answer] Semua pemain selesai — endMatch`);
            endMatch(io, roomId);
          } else {
            // Satu pemain selesai duluan → langsung akhiri match
            // Player lain otomatis berhenti karena room.status akan jadi 'finished'
            console.log(`[match:answer] Satu pemain selesai lebih awal — match dihentikan`);
            io.to(roomId).emit('match:earlyEnd', {
              finishedBy: { userId: player.userId, username: player.username },
              message: `${player.username} telah menyelesaikan semua soal!`
            });
            endMatch(io, roomId);
          }
        }
      } catch (err) {
        console.error('[match:answer]', err);
      }
    });

    // ─── PLAYER FINISHED (manual finish / time up di client) ─────────
    socket.on('match:finish', ({ roomId }) => {
      try {
        if (!socket.user) return;
        const room = activeRooms.get(roomId);
        if (!room || room.status !== 'active') return;

        const player = room.players[socket.user.id];
        if (player && !player.finished) {
          player.finished = true;
          player.finishedAt = Date.now();
          io.to(roomId).emit('match:playerFinished', {
            userId: player.userId,
            username: player.username,
            score: player.score,
            isEarlyFinish: false
          });
        }

        // Jika semua pemain sudah selesai, langsung end
        const allFinished = Object.values(room.players).every(p => p.finished);
        if (allFinished) {
          console.log(`[match:finish] Semua pemain selesai via match:finish — endMatch`);
          endMatch(io, roomId);
        }
      } catch (err) {
        console.error('[match:finish]', err);
      }
    });

    // ─── DISCONNECT ─────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[socket] disconnected: ${socket.id}`);

      if (socket.user?.id) {
        userSocketMap.delete(socket.user.id);

        // Remove from queue if still waiting
        await supabaseAdmin
          .from('matchmaking_queue')
          .delete()
          .eq('user_id', socket.user.id);
      }

      // Handle room abandonment
      for (const [roomId, room] of activeRooms.entries()) {
        const player = Object.values(room.players).find(p => p.socketId === socket.id);
        if (player && room.status === 'active') {
          player.finished = true;
          io.to(roomId).emit('match:playerLeft', {
            userId: player.userId,
            username: player.username
          });
          // Give a 3-second grace period then end
          setTimeout(() => endMatch(io, roomId), 3000);
          break;
        }
      }
    });
  });
}

// ─── Attempt to match two players from the queue ───────────────────────
async function tryMatch(io, triggerSocket) {
  // Use Supabase as the queue — fetch oldest two waiting entries
  const { data: queue, error } = await supabaseAdmin
    .from('matchmaking_queue')
    .select('user_id, socket_id, username, joined_at')
    .order('joined_at', { ascending: true })
    .limit(2);

  if (error || !queue || queue.length < 2) return;

  const [entry1, entry2] = queue;

  // Verify both sockets are still connected
  const socket1 = io.sockets.sockets.get(entry1.socket_id);
  const socket2 = io.sockets.sockets.get(entry2.socket_id);

  // If either socket is dead, clean up and retry
  if (!socket1) {
    await supabaseAdmin.from('matchmaking_queue').delete().eq('user_id', entry1.user_id);
    return;
  }
  if (!socket2) {
    await supabaseAdmin.from('matchmaking_queue').delete().eq('user_id', entry2.user_id);
    return;
  }

  // Remove both from queue atomically
  await supabaseAdmin
    .from('matchmaking_queue')
    .delete()
    .in('user_id', [entry1.user_id, entry2.user_id]);

  // Create match
  const roomId = uuidv4();
  const MATCH_DURATION = 60; // seconds
  // 'mixed' tidak ada di DIFFICULTY_CONFIG — gunakan 'medium' untuk multiplayer
  const questions = generateQuestions(15, 'medium');
  console.log(`[tryMatch] Generated ${questions.length} questions for room ${roomId}`);

  // Validate questions before creating room
  if (!questions || questions.length === 0) {
    console.error('[tryMatch] Failed to generate questions!');
    socket1.emit('matchmaking:error', { message: 'Gagal membuat soal. Coba lagi.' });
    socket2.emit('matchmaking:error', { message: 'Gagal membuat soal. Coba lagi.' });
    return;
  }

  const room = {
    id: roomId,
    status: 'countdown',
    questions,
    matchDuration: MATCH_DURATION,
    startTime: null,
    endTime: null,
    players: {
      [entry1.user_id]: makePlayer(entry1, socket1),
      [entry2.user_id]: makePlayer(entry2, socket2)
    }
  };

  activeRooms.set(roomId, room);

  // Join both sockets to the room
  socket1.join(roomId);
  socket2.join(roomId);

  const matchData = {
    roomId,
    questions: sanitizeForClient(questions),
    matchDuration: MATCH_DURATION
  };

  socket1.emit('matchmaking:matched', {
    ...matchData,
    self: { userId: entry1.user_id, username: entry1.username },
    opponent: { userId: entry2.user_id, username: entry2.username }
  });

  socket2.emit('matchmaking:matched', {
    ...matchData,
    self: { userId: entry2.user_id, username: entry2.username },
    opponent: { userId: entry1.user_id, username: entry1.username }
  });

  console.log(`[matchmaking] room ${roomId} created: ${entry1.username} vs ${entry2.username}`);

  // Countdown 3 → 2 → 1 → GO
  let countdown = 3;
  const countdownTimer = setInterval(() => {
    io.to(roomId).emit('match:countdown', { count: countdown });
    countdown--;
    if (countdown < 0) {
      clearInterval(countdownTimer);
      startMatch(io, roomId, MATCH_DURATION);
    }
  }, 1000);
}

function makePlayer(entry, socket) {
  return {
    userId: entry.user_id,
    username: entry.username,
    socketId: entry.socket_id,
    socket,
    score: 0,
    correct: 0,
    answers: [],
    finished: false,
    finishedAt: null
  };
}

function startMatch(io, roomId, duration) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  room.status = 'active';
  room.startTime = Date.now();
  room.endTime = Date.now() + duration * 1000;

  io.to(roomId).emit('match:start', {
    startTime: room.startTime,
    endTime: room.endTime
  });

  // Auto-end after duration + 2s grace
  setTimeout(() => endMatch(io, roomId), duration * 1000 + 2000);
}

function buildScoreUpdate(room) {
  return {
    players: Object.values(room.players).map(p => ({
      userId: p.userId,
      username: p.username,
      score: p.score,
      correct: p.correct,
      answered: p.answers.filter(a => a !== undefined).length,
      finished: p.finished
    }))
  };
}

async function endMatch(io, roomId) {
  const room = activeRooms.get(roomId);
  if (!room || room.status === 'finished') return;

  room.status = 'finished';
  const players = Object.values(room.players);
  const [p1, p2] = players;

  let winnerId = null;
  if (p1.score > p2.score) winnerId = p1.userId;
  else if (p2.score > p1.score) winnerId = p2.userId;

  const resultPayload = {
    roomId,
    winnerId,
    players: players.map(p => ({
      userId: p.userId,
      username: p.username,
      score: p.score,
      correct: p.correct,
      total: room.questions.length,
      isWinner: p.userId === winnerId
    }))
  };

  io.to(roomId).emit('match:end', resultPayload);

  // Persist results
  try {
    await supabaseAdmin.from('multiplayer_matches').insert({
      room_id: roomId,
      player1_id: p1.userId,
      player2_id: p2.userId,
      player1_score: p1.score,
      player2_score: p2.score,
      winner_id: winnerId,
      duration: room.matchDuration
    });

    for (const player of players) {
      const isWinner = player.userId === winnerId;
      const isDraw = winnerId === null;

      console.log(`[endMatch] Updating stats: userId=${player.userId} score=${player.score} isWinner=${isWinner} isDraw=${isDraw}`);

      // Fetch existing stats row
      const { data: stats, error: fetchErr } = await supabaseAdmin
        .from('user_stats')
        .select('total_score, high_score, total_matches, wins, losses')
        .eq('user_id', player.userId)
        .single();

      if (fetchErr || !stats) {
        // Row belum ada → INSERT baru (user belum pernah main simulasi)
        console.log(`[endMatch] Tidak ada stats untuk userId=${player.userId} — melakukan INSERT baru`);
        const { error: insertErr } = await supabaseAdmin.from('user_stats').insert({
          user_id: player.userId,
          level_unlocked: 1,
          total_score: player.score,
          high_score: player.score,
          total_matches: 1,
          wins: isWinner ? 1 : 0,
          losses: (!isDraw && !isWinner) ? 1 : 0,
          easy_best_accuracy: 0,
          medium_best_accuracy: 0,
          hard_best_accuracy: 0
        });
        if (insertErr) console.error(`[endMatch] INSERT stats error untuk userId=${player.userId}:`, insertErr);
        else console.log(`[endMatch] INSERT stats berhasil untuk userId=${player.userId}`);
      } else {
        // Row sudah ada → UPDATE
        const { error: updateErr } = await supabaseAdmin.from('user_stats').update({
          total_matches: (stats.total_matches || 0) + 1,
          wins: (stats.wins || 0) + (isWinner ? 1 : 0),
          losses: (stats.losses || 0) + (!isDraw && !isWinner ? 1 : 0),
          total_score: (stats.total_score || 0) + player.score,
          high_score: Math.max(stats.high_score || 0, player.score)
        }).eq('user_id', player.userId);
        if (updateErr) console.error(`[endMatch] UPDATE stats error untuk userId=${player.userId}:`, updateErr);
        else console.log(`[endMatch] UPDATE stats berhasil untuk userId=${player.userId}`);
      }

      // Save to test_history
      await supabaseAdmin.from('test_history').insert({
        user_id: player.userId,
        score: player.score,
        correct_answers: player.correct,
        wrong_answers: room.questions.length - player.correct,
        accuracy: Math.round((player.correct / room.questions.length) * 100),
        duration: room.matchDuration,
        difficulty: 'medium',
        mode: 'multiplayer'
      });
    }
  } catch (err) {
    console.error('[endMatch] DB save error:', err);
  }

  // Emit global leaderboard update (setelah stats tersimpan, pakai 2-step merge)
  try {
    const { data: lbStats } = await supabaseAdmin
      .from('user_stats')
      .select('user_id, high_score, wins')
      .order('high_score', { ascending: false })
      .limit(10);

    const lbUserIds = (lbStats || []).map(s => s.user_id);
    const { data: lbUsers } = lbUserIds.length
      ? await supabaseAdmin.from('users').select('id, username').in('id', lbUserIds)
      : { data: [] };

    const leaderboard = (lbStats || []).map(s => ({
      user_id: s.user_id,
      high_score: s.high_score,
      wins: s.wins,
      username: (lbUsers || []).find(u => u.id === s.user_id)?.username || 'Unknown'
    }));

    io.emit('leaderboard:update', { leaderboard });
  } catch (err) {
    console.error('[endMatch] leaderboard update error', err);
  }

  // Cleanup room after 30s
  setTimeout(() => activeRooms.delete(roomId), 30_000);
}

module.exports = { setupSocketHandlers };
