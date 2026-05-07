// Reactive localStorage store
const STORAGE_KEY = 'mdtools_v1';
const MAX_HISTORY = 50;

const defaults = {
  sidebarCollapsed: false,
  theme: null, // null = follow system
  flavor: 'gfm',
  history: [],
  pasteOptions: { smartTypo: false, prettify: true },
  splitView: 'split', // 'split' | 'left' | 'right'
};

let _data = { ...defaults };
const _listeners = new Map();

function _save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch {}
}

function _load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    _data = { ...defaults, ...saved };
  } catch {}
}

function _notify(key) {
  _listeners.get(key)?.forEach(fn => { try { fn(_data[key]); } catch {} });
  _listeners.get('*')?.forEach(fn => { try { fn(key, _data[key]); } catch {} });
}

_load();

export const store = {
  get(key, def) {
    const v = _data[key];
    return v === undefined ? def : v;
  },

  set(key, value) {
    _data[key] = value;
    _save();
    _notify(key);
  },

  subscribe(key, fn) {
    if (!_listeners.has(key)) _listeners.set(key, []);
    _listeners.get(key).push(fn);
    return () => {
      const arr = _listeners.get(key);
      if (arr) { const i = arr.indexOf(fn); if (i > -1) arr.splice(i, 1); }
    };
  },

  // History helpers
  pushHistory(entry) {
    // FNV-1a hash for dedup
    const hash = fnv1a(entry.markdown || '');
    let history = (_data.history || []).filter(h => h.hash !== hash);
    history.unshift({ ...entry, hash, ts: Date.now() });
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    this.set('history', history);
  },

  getHistory() {
    return (_data.history || []).slice().sort((a, b) => b.ts - a.ts);
  },

  clearHistory() {
    this.set('history', []);
  },
};

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}
