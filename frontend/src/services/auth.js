/**
 * Auth Service — client-side auth state management only.
 * Actual auth logic is on the backend. This just caches the result.
 */

class AuthService {
  constructor() {
    this._user = this._loadUser();
  }

  _loadUser() {
    try {
      const raw = localStorage.getItem('user_data');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setUser(user) {
    this._user = user;
    if (user) localStorage.setItem('user_data', JSON.stringify(user));
    else localStorage.removeItem('user_data');
  }

  getUser() { return this._user; }

  isLoggedIn() {
    return !!(this._user && window.api.getToken());
  }

  async login(email, password) {
    const data = await window.api.login(email, password);
    this.setUser(data.user);
    return data;
  }

  async register(username, email, password) {
    const data = await window.api.register(username, email, password);
    this.setUser(data.user);
    return data;
  }

  async loginGoogle(accessToken) {
    const data = await window.api.loginGoogle(accessToken);
    this.setUser(data.user);
    return data;
  }

  logout() {
    window.api.logout();
    this.setUser(null);
  }

  async refreshUser() {
    if (!this.isLoggedIn()) return null;
    try {
      const data = await window.api.getMe();
      this.setUser(data.user);
      return data.user;
    } catch {
      // Token may be expired
      this.logout();
      return null;
    }
  }
}

window.auth = new AuthService();
