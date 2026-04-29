/**
 * TestSessionStore — Server-side storage for active test sessions.
 *
 * This is the anti-cheat core: questions (with correct answers) are stored
 * server-side only. The client never sees the answers.
 *
 * For production at scale, replace the in-memory Map with a Redis store.
 * The interface stays identical — only the storage backend changes.
 */

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour max per session

class TestSessionStore {
  constructor() {
    // Map<sessionToken, { questions, difficulty, createdAt, userId }>
    this._store = new Map();

    // Cleanup expired sessions every 10 minutes
    setInterval(() => this._evictExpired(), 10 * 60 * 1000);
  }

  /**
   * Create and store a new test session.
   * @returns {string} sessionToken — opaque token sent to client
   */
  create({ questions, difficulty, userId, timeLimit }) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');

    this._store.set(token, {
      questions,     // full questions with answers — NEVER leaves this store
      difficulty,
      userId: userId || null,
      timeLimit,
      createdAt: Date.now(),
      submitted: false
    });

    return token;
  }

  /**
   * Retrieve a session by token.
   * Returns null if not found or expired.
   */
  get(token) {
    const session = this._store.get(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this._store.delete(token);
      return null;
    }
    return session;
  }

  /**
   * Mark session as submitted (prevents double-submission).
   */
  markSubmitted(token) {
    const session = this._store.get(token);
    if (session) {
      session.submitted = true;
      this._store.set(token, session);
    }
  }

  /**
   * Delete a session explicitly.
   */
  delete(token) {
    this._store.delete(token);
  }

  /**
   * Evict sessions older than TTL.
   */
  _evictExpired() {
    const now = Date.now();
    for (const [token, session] of this._store.entries()) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this._store.delete(token);
      }
    }
  }

  get size() {
    return this._store.size;
  }
}

// Singleton — shared across all route handlers
const testSessionStore = new TestSessionStore();
module.exports = { testSessionStore };
