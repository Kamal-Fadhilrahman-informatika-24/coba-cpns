const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');

// ─── GET /api/user/profile ────────────────────────────────────────────
router.get('/profile', authenticate, async (req, res) => {
  try {
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, username, email, avatar_url, created_at')
      .eq('id', req.user.id)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const { data: stats } = await supabaseAdmin
      .from('user_stats')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    return res.json({ user, stats: stats || null });
  } catch (err) {
    console.error('[user/profile]', err);
    return res.status(500).json({ error: 'Gagal mengambil profil' });
  }
});

// ─── PATCH /api/user/profile ──────────────────────────────────────────
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username minimal 3 karakter' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('users')
      .update({ username: username.trim() })
      .eq('id', req.user.id)
      .select('id, username, email, avatar_url')
      .single();

    if (error) throw error;
    return res.json({ user: updated });
  } catch (err) {
    console.error('[user/profile PATCH]', err);
    return res.status(500).json({ error: 'Gagal memperbarui profil' });
  }
});

// ─── GET /api/user/stats ──────────────────────────────────────────────
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { data: stats, error: statsErr } = await supabaseAdmin
      .from('user_stats')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (statsErr) throw statsErr;

    const { data: recentHistory } = await supabaseAdmin
      .from('test_history')
      .select('score, accuracy, difficulty, mode, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: bestPerDiff } = await supabaseAdmin
      .from('test_history')
      .select('difficulty, accuracy, score')
      .eq('user_id', req.user.id)
      .eq('mode', 'simulation')
      .order('accuracy', { ascending: false });

    // Compute best per difficulty
    const bests = { easy: null, medium: null, hard: null };
    if (bestPerDiff) {
      for (const row of bestPerDiff) {
        if (!bests[row.difficulty]) bests[row.difficulty] = row;
      }
    }

    return res.json({
      stats: stats || {},
      recentHistory: recentHistory || [],
      bestPerDifficulty: bests
    });
  } catch (err) {
    console.error('[user/stats]', err);
    return res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
});

// ─── GET /api/user/count ──────────────────────────────────────────────
// Returns total registered users — used for "Peserta Aktif" stat on homepage
router.get('/count', async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    console.log('[user/count] totalUsers:', count);
    return res.json({ totalUsers: count || 0 });
  } catch (err) {
    console.error('[user/count]', err);
    return res.status(500).json({ error: 'Gagal mengambil jumlah user', totalUsers: 0 });
  }
});

// ─── GET /api/user/leaderboard ────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 20, by = 'high_score' } = req.query;
    const validSortBy = ['high_score', 'total_score', 'wins'];
    const sortField = validSortBy.includes(by) ? by : 'high_score';
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 5), 100);

    // Step 1 — Ambil user_stats tanpa JOIN (lebih aman, tidak butuh FK terdefinisi)
    const { data: stats, error: statsErr } = await supabaseAdmin
      .from('user_stats')
      .select('user_id, high_score, total_score, wins, losses, total_matches, level_unlocked, easy_best_accuracy, medium_best_accuracy')
      .order(sortField, { ascending: false })
      .limit(limitNum);

    if (statsErr) throw statsErr;

    console.log('[user/leaderboard] stats:', stats);

    if (!stats || stats.length === 0) {
      return res.json({ leaderboard: [], sortBy: sortField });
    }

    // Step 2 — Ambil data users secara terpisah
    const userIds = stats.map(s => s.user_id);
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('users')
      .select('id, username, avatar_url')
      .in('id', userIds);

    if (usersErr) console.error('[user/leaderboard] usersErr:', usersErr);

    console.log('[user/leaderboard] users:', users);

    // Step 3 — Merge manual
    const leaderboard = stats.map((row, index) => {
      const user = (users || []).find(u => u.id === row.user_id);
      return {
        rank: index + 1,
        userId: row.user_id,
        username: user?.username || 'Unknown',
        avatarUrl: user?.avatar_url || null,
        highScore: row.high_score || 0,
        totalScore: row.total_score || 0,
        wins: row.wins || 0,
        losses: row.losses || 0,
        totalMatches: row.total_matches || 0,
        levelUnlocked: row.level_unlocked || 1,
        easyBestAccuracy: row.easy_best_accuracy || 0,
        mediumBestAccuracy: row.medium_best_accuracy || 0
      };
    });

    return res.json({ leaderboard, sortBy: sortField });
  } catch (err) {
    console.error('[user/leaderboard]', err);
    return res.status(500).json({ error: 'Gagal mengambil leaderboard' });
  }
});

// ─── GET /api/user/history ────────────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('test_history')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.json({ history: data || [] });
  } catch (err) {
    console.error('[user/history]', err);
    return res.status(500).json({ error: 'Gagal mengambil riwayat' });
  }
});

module.exports = router;
