/**
 * API Service — Pure HTTP client. Zero business logic.
 * All logic lives on the backend. This file only sends requests and returns responses.
 */

const API_BASE = window.APP_CONFIG?.API_URL || 'http://localhost:3001/api';

class ApiService {
  constructor() {
    this._token = localStorage.getItem('auth_token');
  }

  // ─── Token management ─────────────────────────────────────────────
  setToken(token) {
    this._token = token;
    if (token) localStorage.setItem('auth_token', token);
    else localStorage.removeItem('auth_token');
  }

  getToken() {
    // Selalu baca ulang dari localStorage agar tidak stale setelah login
    const fromStorage = localStorage.getItem('auth_token');
    if (fromStorage && fromStorage !== this._token) {
      this._token = fromStorage;
    }
    return this._token;
  }

  _headers(extra = {}) {
    const token = this.getToken();
    console.log('[api] TOKEN saat request:', token ? token.slice(0, 20) + '...' : 'TIDAK ADA');
    const h = { 'Content-Type': 'application/json', ...extra };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  // ─── Core request ─────────────────────────────────────────────────
  async request(method, path, body = null) {
    const opts = { method, headers: this._headers() };
    if (body !== null) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, opts);
    } catch (networkErr) {
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Server mengembalikan respons tidak valid (${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data?.error || `Request gagal dengan status ${res.status}`);
    }

    return data;
  }

  _get(path) { return this.request('GET', path); }
  _post(path, body) { return this.request('POST', path, body); }
  _patch(path, body) { return this.request('PATCH', path, body); }

  // ─── Auth ─────────────────────────────────────────────────────────
  async register(username, email, password) {
    const data = await this._post('/auth/register', { username, email, password });
    this.setToken(data.token);
    return data;
  }

  async login(email, password) {
    const data = await this._post('/auth/login', { email, password });
    this.setToken(data.token);
    return data;
  }

  async loginGoogle(accessToken) {
    const data = await this._post('/auth/google', { access_token: accessToken });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('user_data');
  }

  async getMe() { return this._get('/auth/me'); }

  // ─── User ─────────────────────────────────────────────────────────
  async getProfile() { return this._get('/user/profile'); }
  async getStats() { return this._get('/user/stats'); }
  async getHistory() { return this._get('/user/history'); }
  async updateProfile(data) { return this._patch('/user/profile', data); }
  async getLeaderboard(by = 'high_score', limit = 20) {
    return this._get(`/user/leaderboard?by=${by}&limit=${limit}`);
  }

  // ─── Test ─────────────────────────────────────────────────────────
  /**
   * Get difficulty configurations + unlock status for current user.
   */
  async getDifficulties() { return this._get('/test/difficulties'); }

  /**
   * Start a test: server generates questions, stores them server-side,
   * returns sanitized questions (NO answers) + opaque sessionToken.
   */
  async startTest(difficulty) {
    return this._post('/test/start', { difficulty });
  }

  /**
   * Submit test: send sessionToken + answers array.
   * Server grades everything — client never knew the answers.
   */
  async submitTest(sessionToken, answers, duration) {
    return this._post('/test/submit', { sessionToken, answers, duration });
  }

  async getTestHistory() { return this._get('/test/history'); }
}

window.api = new ApiService();
