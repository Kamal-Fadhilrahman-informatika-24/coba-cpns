/**
 * soundManager.js — Web Audio API Sound System
 * Generates all sounds programmatically — no external files needed.
 */

class SoundManager {
  constructor() {
    this._ctx = null;
    this._muted = localStorage.getItem('soundMuted') === 'true';
    this._volume = parseFloat(localStorage.getItem('soundVolume') || '0.5');
    this._enabled = false;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    this._enabled = true;
    return this._ctx;
  }

  get muted() { return this._muted; }
  get volume() { return this._volume; }

  setMuted(val) {
    this._muted = val;
    localStorage.setItem('soundMuted', val);
  }

  setVolume(val) {
    this._volume = Math.max(0, Math.min(1, val));
    localStorage.setItem('soundVolume', this._volume);
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  _play(fn) {
    if (this._muted) return;
    try {
      const ctx = this._getCtx();
      fn(ctx, this._volume);
    } catch (e) {
      // Audio not supported or blocked — silently fail
    }
  }

  // ─── UI Sounds ───────────────────────────────────────────────────────

  click() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(800, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
      g.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.06);
    });
  }

  hover() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(1200, ctx.currentTime);
      g.gain.setValueAtTime(vol * 0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.04);
    });
  }

  // ─── Test Sounds ─────────────────────────────────────────────────────

  testStart() {
    this._play((ctx, vol) => {
      const times = [0, 0.15, 0.3];
      const freqs = [523, 659, 784]; // C E G
      times.forEach((t, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = freqs[i];
        g.gain.setValueAtTime(vol * 0.4, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.15);
      });
    });
  }

  countdown() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square';
      o.frequency.value = 440;
      g.gain.setValueAtTime(vol * 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.12);
    });
  }

  countdownFinal() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square';
      o.frequency.value = 880;
      g.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.22);
    });
  }

  timesUp() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(400, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.5);
      g.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.65);
    });
  }

  // ─── Answer Sounds ───────────────────────────────────────────────────

  correct() {
    this._play((ctx, vol) => {
      [0, 0.1].forEach((t, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = i === 0 ? 523 : 784;
        g.gain.setValueAtTime(vol * 0.4, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.18);
      });
    });
  }

  wrong() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square';
      o.frequency.setValueAtTime(220, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.2);
    });
  }

  // ─── Multiplayer Sounds ──────────────────────────────────────────────

  matchFound() {
    this._play((ctx, vol) => {
      const freqs = [392, 523, 659, 784];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = f;
        const t = i * 0.1;
        g.gain.setValueAtTime(vol * 0.35, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.18);
      });
    });
  }

  victory() {
    this._play((ctx, vol) => {
      const melody = [523, 523, 523, 392, 523, 659, 784];
      const durs   = [0.12, 0.06, 0.06, 0.12, 0.12, 0.12, 0.25];
      let time = 0;
      melody.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(vol * 0.4, ctx.currentTime + time);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + durs[i]);
        o.start(ctx.currentTime + time);
        o.stop(ctx.currentTime + time + durs[i] + 0.02);
        time += durs[i] + 0.02;
      });
    });
  }

  defeat() {
    this._play((ctx, vol) => {
      const freqs = [330, 294, 262];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        const t = i * 0.18;
        o.frequency.value = f;
        g.gain.setValueAtTime(vol * 0.35, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.28);
      });
    });
  }

  levelUp() {
    this._play((ctx, vol) => {
      const freqs = [523, 659, 784, 1047];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        const t = i * 0.08;
        o.frequency.value = f;
        g.gain.setValueAtTime(vol * 0.4, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.22);
      });
    });
  }

  notification() {
    this._play((ctx, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(vol * 0.25, ctx.currentTime);
      g.gain.setValueAtTime(vol * 0.25, ctx.currentTime + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.22);
    });
  }
}

export const soundManager = new SoundManager();
export default soundManager;
