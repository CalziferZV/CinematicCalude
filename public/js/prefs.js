// Preferencias del usuario: favoritos, bobinas que tiene, colores recientes, ajustes del presupuesto...
// Se guardan en el ordenador a través del servidor local (no dependen del puerto ni del navegador)
// y además en localStorage por si el servidor no responde.
const LS_KEY = 'filament-studio-prefs';
let data = {};
let ready = null;
let saveTimer = null;
let dirty = false;
const listeners = new Set();

function readLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export function loadPrefs() {
  if (ready) return ready;
  ready = (async () => {
    const local = readLocal();
    try {
      const r = await fetch('/api/prefs');
      const j = r.ok ? await r.json() : null;
      data = j && typeof j === 'object' && !Array.isArray(j) ? j : local;
    } catch {
      data = local;
    }
    // primera vez con el servidor: subir lo que hubiera en el navegador
    if (!Object.keys(data).length && Object.keys(local).length) {
      data = local;
      save();
    }
    return data;
  })();
  return ready;
}

export function getPref(key, def) {
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : def;
}

export function setPref(key, value) {
  data[key] = value;
  save();
  for (const fn of listeners) {
    try { fn(key, value); } catch (e) { console.error(e); }
  }
}

export function onPrefChange(fn) {
  listeners.add(fn);
}

function save() {
  dirty = true;
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

function flush() {
  if (!dirty) return;
  dirty = false;
  fetch('/api/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => { dirty = true; });
}

// al cerrar la pestaña, guardar lo pendiente
window.addEventListener('pagehide', () => {
  if (!dirty) return;
  try {
    navigator.sendBeacon('/api/prefs', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    dirty = false;
  } catch { /* nada */ }
});
