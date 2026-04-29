const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function ensureUserStats(userId) {
  const { data: existing } = await supabaseAdmin
    .from('user_stats')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (!existing) {
    await supabaseAdmin.from('user_stats').insert({
      user_id: userId,
      level_unlocked: 1,
      total_score: 0,
      high_score: 0,
      total_matches: 0,
      wins: 0,
      losses: 0,
      easy_best_accuracy: 0,
      medium_best_accuracy: 0,
      hard_best_accuracy: 0
    });
  }
}

// ─── POST /api/auth/register ───────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, dan password wajib diisi' });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Username minimal 3 karakter' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid' });
    }

    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        username: username.trim(),
        email: email.toLowerCase(),
        password_hash: hashedPassword,
        provider: 'email'
      })
      .select('id, username, email, created_at')
      .single();

    if (insertError) throw insertError;

    await ensureUserStats(newUser.id);

    const token = generateToken({ id: newUser.id, email: newUser.email, username: newUser.username });

    return res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Registrasi gagal. Coba lagi.' });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, email, password_hash, provider')
      .eq('email', email.toLowerCase())
      .eq('provider', 'email')
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Ensure stats exist (for existing users before schema migration)
    await ensureUserStats(user.id);

    const token = generateToken({ id: user.id, email: user.email, username: user.username });

    return res.json({
      message: 'Login berhasil',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Login gagal. Coba lagi.' });
  }
});

// ─── POST /api/auth/google ─────────────────────────────────────────────
router.post('/google', authLimiter, async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) {
      return res.status(400).json({ error: 'Access token Google diperlukan' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(access_token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token Google tidak valid atau sudah expired' });
    }

    // 1. cek apakah user sudah ada berdasarkan email
const { data: existingUser } = await supabaseAdmin
  .from('users')
  .select('id, username, email, avatar_url')
  .eq('email', user.email.toLowerCase())
  .single();

let dbUser;

if (!existingUser) {
  // 2. kalau belum ada → insert
  const { data: newUser, error: insertErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: user.id,
      username: user.user_metadata?.full_name || user.email.split('@')[0],
      email: user.email.toLowerCase(),
      provider: 'google',
      avatar_url: user.user_metadata?.avatar_url
    })
    .select('id, username, email, avatar_url')
    .single();

  if (insertErr) throw insertErr;

  dbUser = newUser;
} else {
  // 3. kalau sudah ada → pakai data lama (JANGAN UPDATE ID)
  dbUser = existingUser;
}

    await ensureUserStats(dbUser.id);

    return res.json({
      message: 'Login Google berhasil',
      token: access_token,
      user: { id: dbUser.id, username: dbUser.username, email: dbUser.email, avatar_url: dbUser.avatar_url }
    });
  } catch (err) {
    console.error('[auth/google]', err);
    return res.status(500).json({ error: 'Autentikasi Google gagal' });
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
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
    console.error('[auth/me]', err);
    return res.status(500).json({ error: 'Gagal mengambil data user' });
  }
});

module.exports = router;
