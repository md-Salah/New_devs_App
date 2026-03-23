// Restored utility for managing AppContext-related local cache
// Provides simple helpers to save/restore last-known AppContext state

const KEY = 'appContext:lastState';

export function saveAppContextState(state: any) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function getAppContextState<T = any>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearAppContextState() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

