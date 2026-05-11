/**
 * auth.js — Supabase Auth + Backend token management
 */

const SUPABASE_URL = 'https://vbaqpreidaszlgeklmzq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiYXFwcmVpZGFzemxnZWtsbXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNDgwMzYsImV4cCI6MjA5MjkyNDAzNn0.Xc5fAx3npuyS83A_YXF6OTytPgr6Ryd3bD_UX3SjT9s';
const BACKEND_URL = '';

export { BACKEND_URL };

// ─── State ────────────────────────────────────────────────────────────────
let _supabase = null;
let _currentUser = null;
let _token = null;
const _listeners = new Set();

function getSupabase() {
  if (_supabase) return _supabase;
  if (typeof window.supabase?.createClient === 'function') {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// ─── Token helpers ────────────────────────────────────────────────────────

export function saveToken(token) {
  localStorage.setItem('authToken', token);
  _token = token;
}

export function getToken() {
  if (_token) return _token;
  _token = localStorage.getItem('authToken');
  return _token;
}

export function clearToken() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
  _token = null;
  _currentUser = null;
}

export function saveUser(user) {
  localStorage.setItem('authUser', JSON.stringify(user));
  _currentUser = user;
}

export function getStoredUser() {
  if (_currentUser) return _currentUser;
  try {
    const raw = localStorage.getItem('authUser');
    if (raw) _currentUser = JSON.parse(raw);
  } catch (_) {}
  return _currentUser;
}

// ─── Auth change listeners ─────────────────────────────────────────────────

export function onAuthChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function notifyListeners(user) {
  _listeners.forEach(fn => fn(user));
}

// ─── API helpers ──────────────────────────────────────────────────────────

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(BACKEND_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Email auth ───────────────────────────────────────────────────────────

export async function loginWithEmail(email, password) {
  const data = await sb.auth.signInWithPassword({
    email,
    password
  });
  saveToken(data.token);
  saveUser(data.user);
  notifyListeners(data.user);
  return data.user;
}

export async function registerWithEmail(username, email, password) {
  const data = await sb.auth.signUp({
    username,
    email,
    password
  });
  saveToken(data.token);
  saveUser(data.user);
  notifyListeners(data.user);
  return data.user;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────

export async function loginWithGoogle() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase SDK tidak tersedia');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  if (error) throw error;
}

// Called after Google OAuth redirect — exchanges Supabase session for backend token
export async function handleGoogleCallback() {
  const sb = getSupabase();
  if (!sb) return null;

  // Check if there's a session (after OAuth redirect)
  const { data: { session }, error } = await sb.auth.getSession();
  if (error || !session) return null;

  const access_token = session.access_token;

  // Exchange with our backend
const user = session.user;

saveUser(user);
notifyListeners(user);

return user;
    body: JSON.stringify({ access_token })
  };

  saveToken(data.token);
  saveUser(data.user);
  notifyListeners(data.user);
  return data.user;
}

// ─── Logout ───────────────────────────────────────────────────────────────

export async function logout() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut().catch(() => {});
  clearToken();
  notifyListeners(null);
}

// ─── Check current session ────────────────────────────────────────────────

export async function checkSession() {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await apiFetch('/api/auth/me');
    const user = data.user;
    saveUser(user);
    notifyListeners(user);
    return user;
  } catch (_) {
    clearToken();
    notifyListeners(null);
    return null;
  }
}

// ─── Init: handle Google OAuth redirect on page load ─────────────────────

export async function initAuth() {
  // Check if coming back from Google OAuth redirect
  const hash = window.location.hash;
  const search = window.location.search;
  if (hash.includes('access_token') || search.includes('code=')) {
    try {
      const user = await handleGoogleCallback();
      if (user) {
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return user;
      }
    } catch (e) {
      console.warn('[auth] Google callback error:', e);
    }
  }
  return checkSession();
}
