/**
 * Socket Service — manages real-time communication via Socket.IO
 * Frontend has NO game logic — only emits events and reacts to server events.
 */

const SOCKET_URL = window.APP_CONFIG?.SOCKET_URL || '';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this._reconnectAttempts = 0;
  }

  connect() {
    if (this.socket?.connected) return this.socket;

    const token = window.api.getToken();

    this.socket = io(SOCKET_URL, {
      auth: { token: token || null },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      console.log('[socket] connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.warn('[socket] disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[socket] connection error:', err.message);
      this._reconnectAttempts++;
    });

    // Global leaderboard updates
    this.socket.on('leaderboard:update', ({ leaderboard }) => {
      window.dispatchEvent(new CustomEvent('leaderboard:updated', { detail: { leaderboard } }));
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  emit(event, data) {
    if (!this.socket?.connected) {
      console.warn('[socket] not connected, cannot emit:', event);
      return false;
    }
    this.socket.emit(event, data);
    return true;
  }

  on(event, handler) {
    this.socket?.on(event, handler);
  }

  off(event, handler) {
    this.socket?.off(event, handler);
  }

  removeListeners(events = []) {
    events.forEach(e => this.socket?.removeAllListeners(e));
  }

  // ─── Typed actions ──────────────────────────────────────────────
  joinMatchmaking(username) {
    return this.emit('matchmaking:join', { username });
  }

  leaveMatchmaking() {
    return this.emit('matchmaking:leave', {});
  }

  submitAnswer(roomId, questionId, answer) {
    return this.emit('match:answer', { roomId, questionId, answer });
  }

  finishMatch(roomId) {
    return this.emit('match:finish', { roomId });
  }
}

window.socketService = new SocketService();
