/**
 * theme.js — Dark/Light mode manager
 */

const STORAGE_KEY = 'theme';
const _listeners = new Set();

function getPreferred() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getCurrentTheme() {
  return localStorage.getItem(STORAGE_KEY) || getPreferred();
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
  _listeners.forEach(fn => fn(theme));
}

export function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function onThemeChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function initTheme() {
  applyTheme(getPreferred());
}
