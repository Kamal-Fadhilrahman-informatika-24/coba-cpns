/**
 * Simple key-value store backed by sessionStorage.
 * Used for transient in-page state (current test session, etc.)
 * Clears automatically when the browser tab is closed.
 */
const store = {
  get(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage full */ }
  },
  remove(key) {
    sessionStorage.removeItem(key);
  },
  clear() {
    sessionStorage.clear();
  }
};

window.store = store;
