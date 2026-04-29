const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Verifies a JWT or Supabase OAuth token.
 * Returns decoded user payload or throws an error.
 */
async function verifyToken(token) {
  // 1. Try our own JWT (email/password login) — algoritma HS256
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    console.log('[auth] decoded user (JWT):', { id: decoded.id, email: decoded.email });
    return { id: decoded.id, email: decoded.email, username: decoded.username, provider: 'jwt' };
  } catch (jwtErr) {
    // Hanya tolak langsung kalau signature benar-benar dimanipulasi (bukan algorithm mismatch)
    // JsonWebTokenError mencakup: invalid signature, invalid algorithm, malformed — kita cek pesannya
    if (jwtErr.name === 'JsonWebTokenError' && jwtErr.message === 'invalid signature') {
      console.log('[auth] Token signature invalid (tampered), menolak');
      throw new Error('Invalid token signature');
    }
    // Semua error lain (expired, algorithm mismatch, dll) → coba Supabase fallback
    console.log('[auth] JWT verify gagal, coba Supabase fallback. Reason:', jwtErr.message);
  }

  // 2. Try Supabase token (Google OAuth / ES256)
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      console.log('[auth] Supabase getUser gagal:', error?.message);
      throw new Error('Token expired or invalid');
    }
    console.log('[auth] decoded user (Supabase):', { id: user.id, email: user.email });
    return { id: user.id, email: user.email, username: user.user_metadata?.full_name, provider: 'supabase' };
  } catch (supErr) {
    throw new Error(supErr.message || 'Token expired or invalid');
  }
}

/**
 * authenticate — required auth. Rejects 401 if no valid token.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token not provided' });
    }

    req.user = await verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Authentication failed' });
  }
};

/**
 * optionalAuth — gracefully attaches user if token present, continues if not.
 */
// Pastikan user ada di tabel `users` (untuk mencegah FK violation)
// Strategi: cek by EMAIL dulu (bukan by ID) untuk menangani kasus
// user sudah ada dengan ID lama (email/password) lalu login via Google OAuth.
// JANGAN update primary key — ini akan merusak semua FK yang menunjuk ke users.id.
// Sebaliknya, kembalikan ID yang sudah ada agar socket.user.id konsisten.
async function ensureUserInTable(user) {
  if (!user?.id || !user?.email || user.provider !== 'supabase') return;
  const email = user.email.toLowerCase();
  try {
    // Step 1: cek berdasarkan email
    const { data: existingByEmail } = await supabaseAdmin
      .from('users')
      .select('id, username, provider')
      .eq('email', email)
      .single();

    if (existingByEmail) {
      // User sudah ada dengan email ini (mungkin registrasi email/password dulu)
      // Pakai ID yang sudah ada — jangan update PK, itu merusak FK
      if (existingByEmail.id !== user.id) {
        console.log(`[auth] Email ${email} sudah ada dengan ID berbeda. Pakai ID lama: ${existingByEmail.id}`);
        // Override socket/req user.id agar konsisten dengan tabel users
        user.id = existingByEmail.id;
      }
      return; // sudah ada, tidak perlu insert
    }

    // Step 2: belum ada sama sekali → insert baru
    console.log(`[auth] User baru (Google OAuth) — insert ke tabel users: ${user.id}`);
    const { error } = await supabaseAdmin.from('users').insert({
      id: user.id,
      email: email,
      username: user.username || email.split('@')[0],
      provider: 'google',
      avatar_url: user.avatar_url || null
    });
    if (error) console.error('[auth] ensureUserInTable insert error:', error);
    else console.log(`[auth] User ${user.id} berhasil diinsert ke tabel users`);
  } catch (err) {
    console.error('[auth] ensureUserInTable error:', err);
  }
}

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('[auth] AUTH HEADER:', authHeader ? authHeader.slice(0, 30) + '...' : 'TIDAK ADA');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = await verifyToken(token);
    // Sync Supabase OAuth user ke tabel users jika belum ada
    await ensureUserInTable(req.user);
  } catch {
    req.user = null;
  }
  return next();
};

module.exports = { authenticate, optionalAuth, verifyToken };
