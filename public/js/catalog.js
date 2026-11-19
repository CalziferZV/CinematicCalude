// Panel de filamentos: marcas, categorías (PLA, PLA Silk, PETG, ASA...), líneas y colores.
// Además: colores favoritos y recientes, "Mis bobinas" (los colores que tienes en el taller),
// búsqueda en todas las marcas a la vez y equivalencias de color entre marcas.
import { swatchCss } from './materials.js';
import { loadPrefs, getPref, setPref, onPrefChange } from './prefs.js';
import { deltaE, deltaLabel, materialFamily } from './colorsci.js';

const brands = new Map(); // id -> datos normalizados
let brandList = [];
let current = null;
let category = 'Todas';
let query = '';
let searchAll = false;
let onPick = () => {};
let notify = () => {};
let activeKey = null;
const els = {};

const SYN = {
  dorado: ['gold', 'oro'], oro: ['gold'], negro: ['black', 'charcoal', 'carbon', 'carbón', 'onyx', 'obsidian'], blanco: ['white', 'ivory', 'marfil', 'bone', 'hueso'], rojo: ['red'], azul: ['blue'], verde: ['green'],
  amarillo: ['yellow'], naranja: ['orange'], morado: ['purple', 'violet'], violeta: ['violet', 'purple'], rosa: ['pink'],
  gris: ['gray', 'grey'], plata: ['silver'], plateado: ['silver'], marron: ['brown'], cobre: ['copper'], bronce: ['bronze'],
  mate: ['matte'], seda: ['silk'], transparente: ['translucent', 'clear', 'transparent'], translucido: ['translucent'],
  madera: ['wood'], marmol: ['marble'], brilla: ['glow'], fluorescente: ['glow', 'neon'], celeste: ['sky', 'light blue', 'cyan'],
  granate: ['burgundy', 'maroon', 'wine'], beige: ['beige', 'ivory', 'cream'], turquesa: ['turquoise', 'teal'], lila: ['lilac', 'lavender'],
  multicolor: ['rainbow', 'dual', 'tri', 'multi', 'gradient'], degradado: ['gradient', 'rainbow'], bicolor: ['dual'],
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ORDER = ['PLA Básico', 'PLA Matte', 'PLA Silk', 'PLA+ / Tough', 'PLA Translúcido', 'PLA Especial', 'PLA Glow', 'PLA Wood', 'PLA Fibra (CF/GF)', 'PETG', 'PETG Translúcido', 'ASA', 'ABS', 'TPU / Flexible', 'PC', 'PA / Nylon', 'Otros'];
const catIndex = (c) => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };

export function filamentKey(f) {
  return f ? `${f.brand}|${f.line}|${f.name}|${f.hex}` : '';
}

function makeFilament(brand, line, c) {
  if (c._fil) return { ...c._fil };
  return {
    brand: brand.id, brandName: brand.name, line: line.name, category: line.category, finish: line.finish,
    name: c.name, nameEn: c.nameEn, hex: c.hex, hexes: c.hexes, alpha: c.alpha, kind: c.kind, code: c.code, approx: c.approx,
  };
}

function matches(text, q) {
  const h = norm(text);
  return norm(q).split(/\s+/).filter(Boolean).every((tok) => h.includes(tok) || (SYN[tok] || []).some((s) => h.includes(s)));
}

// ---------------------------------------------------------------- listas del usuario
const LIST_MAX = { recent: 14, favorites: 300, spools: 600 };

// Copia ligera de un filamento para guardarla en las preferencias
export function slimFilament(f) {
  const o = {};
  for (const k of ['brand', 'brandName', 'line', 'category', 'finish', 'name', 'nameEn', 'hex', 'hexes', 'alpha', 'kind', 'code', 'approx']) if (f[k] !== undefined) o[k] = f[k];
  return o;
}
function userList(name) {
  const v = getPref(name, []);
  return Array.isArray(v) ? v : [];
}
const keySet = (name) => new Set(userList(name).map(filamentKey));
export const isFavorite = (f) => !!f && !f.blank && keySet('favorites').has(filamentKey(f));
export const isOwned = (f) => !!f && !f.blank && keySet('spools').has(filamentKey(f));
export const ownedSpools = () => userList('spools');

// Añade o quita un filamento de una lista. Devuelve true si queda dentro.
export function toggleInList(name, f) {
  if (!f || f.blank) return false;
  const k = filamentKey(f);
  const arr = userList(name).slice();
  const i = arr.findIndex((x) => filamentKey(x) === k);
  if (i >= 0) arr.splice(i, 1);
  else arr.unshift(slimFilament(f));
  setPref(name, arr.slice(0, LIST_MAX[name] || 500));
  return i < 0;
}
export const toggleFavorite = (f) => toggleInList('favorites', f);
export const toggleOwned = (f) => toggleInList('spools', f);

export function pushRecent(f) {
  if (!f || f.blank) return;
  const k = filamentKey(f);
  const arr = userList('recent').filter((x) => filamentKey(x) !== k);
  arr.unshift(slimFilament(f));
  setPref('recent', arr.slice(0, LIST_MAX.recent));
}

// Marcas "virtuales" con tus listas: Mis bobinas y Favoritos
function virtualBrand(id) {
  const mine = id === '@mine';
  const byLine = new Map();
  for (const f of userList(mine ? 'spools' : 'favorites')) {
    const ln = `${f.brandName || 'Otra marca'} · ${f.line || 'Sin línea'}`;
    if (!byLine.has(ln)) byLine.set(ln, { id: ln, name: ln, category: f.category || 'Otros', finish: f.finish, colors: [] });
    byLine.get(ln).colors.push({ name: f.name, nameEn: f.nameEn, hex: f.hex, hexes: f.hexes, alpha: f.alpha, kind: f.kind, code: f.code, approx: f.approx, _fil: f });
  }
  return {
    id, name: mine ? 'Mis bobinas' : 'Favoritos', virtual: true,
    source: mine ? 'Tus bobinas: se guardan en este ordenador' : 'Tus colores favoritos: se guardan en este ordenador',
    lines: [...byLine.values()],
  };
}

// ---------------------------------------------------------------- red
async function api(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export async function loadBrand(id, force = false) {
  if (id.startsWith('@')) return virtualBrand(id);
  if (!force && brands.has(id)) return brands.get(id);
  const url = id.startsWith('shop:') ? `/api/shop?url=${encodeURIComponent(id.slice(5))}` : `/api/brands/${encodeURIComponent(id)}`;
  const data = await api(url + (force ? (url.includes('?') ? '&' : '?') + 'refresh=1' : ''));
  brands.set(id, data);
  return data;
}

export function loadedBrands() { return [...brands.values()]; }
export function currentBrand() { return current && !current.virtual ? current : brands.get('bambulab') || null; }

// Todas las marcas de una vez (lo ya descargado + la copia local incluida en la app)
let allBrands = null;
let allLoading = null;
export function loadAllBrands() {
  if (allBrands) return Promise.resolve(allBrands);
  if (!allLoading) {
    allLoading = api('/api/catalog/all')
      .then((j) => j.brands)
      .catch(() => [])
      .then((list) => {
        // lo descargado en esta sesión (más reciente) manda sobre la copia
        const map = new Map(list.map((b) => [b.id, b]));
        for (const b of brands.values()) if (!b.id.startsWith('shop:')) map.set(b.id, b);
        allBrands = [...map.values()];
        return allBrands;
      })
      .finally(() => { allLoading = null; });
  }
  return allLoading;
}
const featured = () => new Set(brandList.filter((b) => b.featured).map((b) => b.id));

// ---------------------------------------------------------------- equivalencias
// Colores más parecidos en tus bobinas y en otras marcas (misma familia de material).
export async function equivalents(fil, { limit = 4 } = {}) {
  if (!fil || fil.blank) return { mine: [], others: [] };
  const hex = (fil.hexes && fil.hexes[0]) || fil.hex;
  const fam = materialFamily(fil);
  const key = filamentKey(fil);
  const feat = featured();
  const score = (f, brandId) => {
    const d = deltaE(hex, f.hex);
    let s = d;
    if (materialFamily(f) !== fam) s += 12;
    if ((f.finish || 'basic') !== (fil.finish || 'basic')) s += 4;
    if (brandId && !feat.has(brandId)) s += 1.5; // preferir marcas fáciles de conseguir
    return { f, d, s, label: deltaLabel(d) };
  };
  const mine = ownedSpools()
    .filter((f) => filamentKey(f) !== key && !(f.hexes && f.hexes.length > 1))
    .map((f) => score(f))
    .filter((x) => x.d < 15)
    .sort((a, b) => a.s - b.s)
    .slice(0, 2);
  const all = await loadAllBrands();
  const best = new Map(); // la mejor coincidencia por marca, para variar
  for (const b of all) {
    if (b.id === fil.brand) continue;
    for (const l of b.lines) {
      for (const c of l.colors) {
        if (!c.hex || (c.hexes && c.hexes.length > 1)) continue;
        const r = score(makeFilament(b, l, c), b.id);
        const prev = best.get(b.id);
        if (!prev || r.s < prev.s) best.set(b.id, r);
      }
    }
  }
  const others = [...best.values()].filter((x) => x.d < 20).sort((a, b) => a.s - b.s).slice(0, limit);
  return { mine, others };
}

// ---------------------------------------------------------------- UI
export async function initCatalog(pick, opts = {}) {
  onPick = pick;
  notify = opts.notify || notify;
  for (const id of ['brandSelect', 'colorSearch', 'catChips', 'lineList', 'catStatus', 'btnRefreshCat', 'shopUrl', 'btnShop', 'quickColors', 'searchAll']) els[id] = document.getElementById(id);
  await loadPrefs();
  searchAll = !!getPref('searchAll', false);
  if (els.searchAll) {
    els.searchAll.checked = searchAll;
    els.searchAll.addEventListener('change', () => {
      searchAll = els.searchAll.checked;
      setPref('searchAll', searchAll);
      render();
    });
  }
  els.brandSelect.addEventListener('change', () => selectBrand(els.brandSelect.value));
  els.colorSearch.addEventListener('input', () => { query = els.colorSearch.value.trim(); render(); });
  els.btnRefreshCat.addEventListener('click', async () => {
    if (!current || current.virtual) return;
    setStatus({ origin: 'loading' });
    try {
      await loadBrand(current.id, true);
      allBrands = null;
      await selectBrand(current.id);
    } catch (e) { setStatus({ origin: 'error', error: e.message }); }
  });
  els.btnShop.addEventListener('click', addShop);
  els.shopUrl.addEventListener('keydown', (e) => e.key === 'Enter' && addShop());
  onPrefChange((key) => {
    if (key === 'favorites' || key === 'spools') {
      fillSelect(els.brandSelect.value);
      if (current && current.virtual) current = virtualBrand(current.id);
      render();
    }
    if (key === 'favorites' || key === 'recent' || key === 'spools') renderQuick();
  });
  try {
    const j = await api('/api/brands');
    brandList = j.brands;
  } catch {
    brandList = [{ id: 'bambulab', name: 'Bambu Lab', featured: true }];
  }
  fillSelect();
  renderQuick();
  await selectBrand('bambulab');
}

function fillSelect(selected) {
  const feat = brandList.filter((b) => b.featured);
  const rest = brandList.filter((b) => !b.featured && !b.id.startsWith('shop:'));
  const shops = brandList.filter((b) => b.id.startsWith('shop:'));
  const opt = (b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`;
  const nMine = userList('spools').length, nFav = userList('favorites').length;
  els.brandSelect.innerHTML =
    `<optgroup label="Tus listas"><option value="@mine">🧵 Mis bobinas (${nMine})</option><option value="@fav">★ Favoritos (${nFav})</option></optgroup>` +
    `<optgroup label="Destacadas">${feat.map(opt).join('')}</optgroup>` +
    (shops.length ? `<optgroup label="Tiendas añadidas">${shops.map(opt).join('')}</optgroup>` : '') +
    `<optgroup label="Todas las marcas (${rest.length + feat.length})">${rest.map(opt).join('')}</optgroup>`;
  if (selected) els.brandSelect.value = selected;
}

async function addShop() {
  const url = els.shopUrl.value.trim();
  if (!url) return;
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const id = `shop:${host}`;
  setStatus({ origin: 'loading' });
  try {
    const data = await loadBrand(id, true);
    if (!brandList.some((b) => b.id === id)) brandList.push({ id, name: `${data.name} (tienda)`, featured: false });
    fillSelect(id);
    await selectBrand(id);
  } catch (e) {
    setStatus({ origin: 'error', error: e.message });
    alert(`No se pudo leer la tienda: ${e.message}`);
  }
}

export async function selectBrand(id) {
  els.brandSelect.value = id;
  els.lineList.innerHTML = '<div class="empty-cat">Cargando colores…</div>';
  setStatus({ origin: 'loading' });
  try {
    current = await loadBrand(id);
  } catch (e) {
    els.lineList.innerHTML = `<div class="empty-cat">No se pudo cargar: ${escapeHtml(e.message)}</div>`;
    setStatus({ origin: 'error', error: e.message });
    return;
  }
  if (!current.lines.some((l) => l.category === category)) category = 'Todas';
  setStatus(current.virtual ? { origin: 'local', source: current.source } : current);
  render();
}

function ago(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

function setStatus(d) {
  const el = els.catStatus;
  el.className = 'cat-status ' + (d.origin || '');
  const txt = el.querySelector('.txt');
  const map = {
    live: 'En vivo', cache: `Actualizado ${ago(d.at)}`, snapshot: 'Sin conexión (copia local)', loading: 'Conectando…', error: 'Error de conexión', local: 'En este ordenador', all: 'Todas las marcas',
  };
  txt.textContent = map[d.origin] || '';
  el.title = d.source ? `Fuente: ${d.source}${d.error ? `\nAviso: ${d.error}` : ''}` : d.error || '';
}

// Colores favoritos y usados hace poco, siempre a mano encima del catálogo
function renderQuick() {
  const box = els.quickColors;
  if (!box) return;
  const rows = [
    ['★', 'Favoritos', userList('favorites').slice(0, 16)],
    ['↺', 'Recientes', userList('recent')],
  ].filter((r) => r[2].length);
  if (!rows.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '';
  const owned = keySet('spools');
  for (const [icon, title, list] of rows) {
    const row = document.createElement('div');
    row.className = 'quick-row';
    row.innerHTML = `<span class="qr-t" title="${title}">${icon}</span>`;
    for (const f of list) {
      const b = document.createElement('button');
      b.className = 'qsw' + (filamentKey(f) === activeKey ? ' active' : '') + (owned.has(filamentKey(f)) ? ' owned' : '');
      b.style.background = swatchCss(f);
      b.title = `${f.brandName || ''} · ${f.line || ''}\n${f.name}${owned.has(filamentKey(f)) ? '\n🧵 La tienes' : ''}${title === 'Favoritos' ? '\nClic derecho: quitar de favoritos' : ''}`;
      b.addEventListener('click', () => pickFilament({ ...f }));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (title === 'Favoritos') { toggleFavorite(f); notify(`${f.name} quitado de favoritos`); }
      });
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}

function pickFilament(fil) {
  activeKey = filamentKey(fil);
  els.lineList.querySelectorAll('.swatch.active').forEach((x) => x.classList.remove('active'));
  onPick(fil);
}

// Bloques a mostrar: [{ brand, line, colors }]
function visibleBlocks() {
  if (searchAll && query && !(current && current.virtual)) {
    if (!allBrands) {
      loadAllBrands().then(() => render());
      return null; // cargando
    }
    const out = [];
    let total = 0;
    for (const b of allBrands) {
      for (const l of b.lines) {
        const colors = l.colors.filter((c) => matches(`${c.name} ${c.nameEn || ''} ${l.name} ${l.category} ${b.name}`, query));
        if (!colors.length) continue;
        out.push({ brand: b, line: { ...l, name: `${b.name} · ${l.name}` }, rawLine: l, colors });
        total += colors.length;
        if (total > 600) break;
      }
      if (total > 600) break;
    }
    return out;
  }
  return current.lines.map((l) => ({
    brand: current,
    line: l,
    rawLine: l,
    colors: l.colors.filter((c) => !query || matches(`${c.name} ${c.nameEn || ''} ${l.name} ${l.category}`, query)),
  }));
}

function render() {
  if (!current) return;
  const blocks = visibleBlocks();
  if (!blocks) {
    els.lineList.innerHTML = '<div class="empty-cat">Buscando en todas las marcas…</div>';
    return;
  }
  const globalMode = searchAll && query && !current.virtual;
  setStatus(globalMode ? { origin: 'all', source: `${allBrands.length} marcas (copia local + lo descargado)` } : current.virtual ? { origin: 'local', source: current.source } : current);
  // chips de categoría
  const counts = new Map();
  let total = 0;
  for (const x of blocks) {
    if (!x.colors.length) continue;
    const cat = x.line.category || 'Otros';
    counts.set(cat, (counts.get(cat) || 0) + x.colors.length);
    total += x.colors.length;
  }
  const cats = ['Todas', ...ORDER.filter((c) => counts.has(c))];
  if (!cats.includes(category)) category = 'Todas';
  els.catChips.innerHTML = cats
    .map((c) => `<button class="chip${c === category ? ' active' : ''}" data-cat="${c}">${c}<span class="n">${c === 'Todas' ? total : counts.get(c)}</span></button>`)
    .join('');
  els.catChips.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { category = b.dataset.cat; render(); }));

  // líneas y colores
  const list = blocks
    .filter((x) => x.colors.length && (category === 'Todas' || (x.line.category || 'Otros') === category))
    .sort((a, b) => (globalMode ? 0 : catIndex(a.line.category) - catIndex(b.line.category) || a.line.name.localeCompare(b.line.name)));
  if (!list.length) {
    const empty = current.virtual
      ? current.id === '@mine'
        ? 'Aún no has marcado bobinas. Elige un color y pulsa <b>🧵 La tengo</b> en «Color activo».'
        : 'Aún no tienes favoritos. Clic derecho en un color (o la ☆ de «Color activo») para añadirlo.'
      : query ? 'Sin resultados para «' + escapeHtml(query) + '»' + (searchAll ? '' : '. Prueba a marcar «Buscar en todas las marcas».') : 'Esta marca no tiene colores en esta categoría';
    els.lineList.innerHTML = `<div class="empty-cat">${empty}</div>`;
    return;
  }
  const favs = keySet('favorites');
  const owned = keySet('spools');
  const frag = document.createDocumentFragment();
  for (const { brand, line: l, rawLine, colors } of list) {
    const block = document.createElement('div');
    block.className = 'line-block';
    const temps = l.temps ? ` · ${l.temps.nozzle.join('–')} °C` : '';
    block.innerHTML = `<div class="line-head"><strong>${escapeHtml(l.name)}</strong><span class="muted">${colors.length} colores${temps}${l.url ? ` · <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">tienda</a>` : ''}</span></div><div class="color-grid"></div>`;
    const grid = block.querySelector('.color-grid');
    for (const c of colors) {
      const fil = makeFilament(brand, rawLine, c);
      const k = filamentKey(fil);
      const sw = document.createElement('div');
      sw.className = 'swatch' + (k === activeKey ? ' active' : '') + (owned.has(k) ? ' owned' : '') + (favs.has(k) ? ' fav' : '');
      sw.title = `${fil.brandName} · ${fil.line}\n${c.name}${c.nameEn && c.nameEn !== c.name ? ` (${c.nameEn})` : ''}\n${c.hexes ? c.hexes.join(' · ') : c.hex}${c.code ? `\nCódigo: ${c.code}` : ''}${c.approx ? '\n(tono aproximado)' : ''}${c.available === false ? '\nAGOTADO en la tienda' : ''}${owned.has(k) ? '\n🧵 La tienes' : ''}\nClic derecho: ${favs.has(k) ? 'quitar de' : 'añadir a'} favoritos`;
      sw.innerHTML = `<div class="chip-c${c.alpha ? ' trans' : ''}" style="background:${swatchCss(fil)}"></div><div class="lbl">${escapeHtml(c.name)}</div>${owned.has(k) ? '<i class="b-own" title="La tienes"></i>' : ''}${favs.has(k) ? '<i class="b-fav">★</i>' : ''}`;
      if (c.available === false) sw.style.opacity = 0.45;
      sw.addEventListener('click', () => {
        els.lineList.querySelectorAll('.swatch.active').forEach((x) => x.classList.remove('active'));
        sw.classList.add('active');
        activeKey = k;
        onPick(fil);
      });
      sw.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const on = toggleFavorite(fil);
        notify(on ? `★ ${fil.name} añadido a favoritos` : `${fil.name} quitado de favoritos`);
      });
      grid.appendChild(sw);
    }
    frag.appendChild(block);
  }
  els.lineList.innerHTML = '';
  els.lineList.appendChild(frag);
}

export function setActiveKey(k) {
  activeKey = k;
  render();
  renderQuick();
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------------------------------------------------------------- búsqueda (para la IA)
function findBrandId(name) {
  if (!name) return null;
  const n = norm(name).replace(/\s+/g, '');
  const b = brandList.find((x) => norm(x.id) === n || norm(x.name).replace(/\s+/g, '') === n) ||
    brandList.find((x) => norm(x.name).replace(/\s+/g, '').includes(n) || n.includes(norm(x.id)));
  return b ? b.id : null;
}

export async function searchFilaments({ query: q = '', brand, category: cat } = {}, limit = 25) {
  const ids = [];
  const bid = findBrandId(brand);
  const cur = currentBrand();
  if (bid) ids.push(bid);
  else {
    if (cur) ids.push(cur.id);
    if (!ids.includes('bambulab')) ids.push('bambulab');
    for (const id of brands.keys()) if (!ids.includes(id)) ids.push(id);
  }
  const nq = norm(q).trim();
  const alts = [nq, ...(SYN[nq] || [])];
  const scored = [];
  for (const id of ids) {
    let b;
    try { b = await loadBrand(id); } catch { continue; }
    for (const l of b.lines) {
      if (cat && !matches(`${l.category} ${l.name}`, cat)) continue;
      for (const c of l.colors) {
        if (q && !matches(`${c.name} ${c.nameEn || ''} ${l.name} ${l.category}`, q)) continue;
        const n1 = norm(c.name), n2 = norm(c.nameEn);
        let score = 0;
        if (alts.some((a) => n1 === a || n2 === a)) score = 3;
        else if (alts.some((a) => n1.startsWith(a) || n2.startsWith(a))) score = 2;
        else if (alts.some((a) => n1.includes(a) || n2.includes(a))) score = 1;
        if (id === bid || (!bid && cur && id === cur.id)) score += 0.5;
        if (isOwned(makeFilament(b, l, c))) score += 0.75; // mejor si ya la tienes
        scored.push({ score, f: makeFilament(b, l, c) });
        if (scored.length > 600) break;
      }
    }
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((x) => x.f);
}

export async function resolveFilament({ brand, line, color_name: colorName, hex }) {
  const bid = findBrandId(brand) || currentBrand()?.id || 'bambulab';
  if (colorName) {
    try {
      const b = await loadBrand(bid);
      const lines = b.lines.filter((l) => !line || norm(l.name) === norm(line));
      const pool = lines.length ? lines : b.lines.filter((l) => !line || matches(l.name, line));
      for (const l of pool.length ? pool : b.lines) {
        const c = l.colors.find((x) => norm(x.name) === norm(colorName) || norm(x.nameEn) === norm(colorName)) ||
          l.colors.find((x) => matches(`${x.name} ${x.nameEn || ''}`, colorName));
        if (c) return makeFilament(b, l, c);
      }
    } catch { /* sin conexión */ }
  }
  if (hex && /^#?[0-9a-f]{6}$/i.test(hex)) {
    const h = hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    return { brand: 'custom', brandName: 'Color libre', line: line || 'Personalizado', category: '', finish: /silk/i.test(line || '') ? 'silk' : /matte|mate/i.test(line || '') ? 'matte' : 'basic', name: colorName || h, hex: h, kind: 'solid' };
  }
  return null;
}
