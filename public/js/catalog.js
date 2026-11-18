// Panel de filamentos: marcas, categorías (PLA, PLA Silk, PETG, ASA...), líneas y colores.
import { swatchCss } from './materials.js';

const brands = new Map(); // id -> datos normalizados
let brandList = [];
let current = null;
let category = 'Todas';
let query = '';
let onPick = () => {};
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
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filamentKey(f) {
  return f ? `${f.brand}|${f.line}|${f.name}|${f.hex}` : '';
}

function makeFilament(brand, line, c) {
  return {
    brand: brand.id, brandName: brand.name, line: line.name, category: line.category, finish: line.finish,
    name: c.name, nameEn: c.nameEn, hex: c.hex, hexes: c.hexes, alpha: c.alpha, kind: c.kind, code: c.code, approx: c.approx,
  };
}

function matches(text, q) {
  const h = norm(text);
  return norm(q).split(/\s+/).filter(Boolean).every((tok) => h.includes(tok) || (SYN[tok] || []).some((s) => h.includes(s)));
}

// ---------------------------------------------------------------- red
async function api(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export async function loadBrand(id, force = false) {
  if (!force && brands.has(id)) return brands.get(id);
  const url = id.startsWith('shop:') ? `/api/shop?url=${encodeURIComponent(id.slice(5))}` : `/api/brands/${encodeURIComponent(id)}`;
  const data = await api(url + (force ? (url.includes('?') ? '&' : '?') + 'refresh=1' : ''));
  brands.set(id, data);
  return data;
}

export function loadedBrands() { return [...brands.values()]; }
export function currentBrand() { return current; }

// ---------------------------------------------------------------- UI
export async function initCatalog(pick) {
  onPick = pick;
  for (const id of ['brandSelect', 'colorSearch', 'catChips', 'lineList', 'catStatus', 'btnRefreshCat', 'shopUrl', 'btnShop']) els[id] = document.getElementById(id);
  els.brandSelect.addEventListener('change', () => selectBrand(els.brandSelect.value));
  els.colorSearch.addEventListener('input', () => { query = els.colorSearch.value.trim(); render(); });
  els.btnRefreshCat.addEventListener('click', async () => {
    if (!current) return;
    setStatus({ origin: 'loading' });
    try { await loadBrand(current.id, true); await selectBrand(current.id); } catch (e) { setStatus({ origin: 'error', error: e.message }); }
  });
  els.btnShop.addEventListener('click', addShop);
  els.shopUrl.addEventListener('keydown', (e) => e.key === 'Enter' && addShop());
  try {
    const j = await api('/api/brands');
    brandList = j.brands;
  } catch {
    brandList = [{ id: 'bambulab', name: 'Bambu Lab', featured: true }];
  }
  fillSelect();
  await selectBrand('bambulab');
}

function fillSelect(selected) {
  const feat = brandList.filter((b) => b.featured);
  const rest = brandList.filter((b) => !b.featured && !b.id.startsWith('shop:'));
  const shops = brandList.filter((b) => b.id.startsWith('shop:'));
  const opt = (b) => `<option value="${b.id}">${b.name}</option>`;
  els.brandSelect.innerHTML =
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
    els.lineList.innerHTML = `<div class="empty-cat">No se pudo cargar: ${e.message}</div>`;
    setStatus({ origin: 'error', error: e.message });
    return;
  }
  if (!current.lines.some((l) => l.category === category)) category = 'Todas';
  setStatus(current);
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
    live: 'En vivo', cache: `Actualizado ${ago(d.at)}`, snapshot: 'Sin conexión (copia local)', loading: 'Conectando…', error: 'Error de conexión',
  };
  txt.textContent = map[d.origin] || '';
  el.title = d.source ? `Fuente: ${d.source}${d.error ? `\nAviso: ${d.error}` : ''}` : d.error || '';
}

function render() {
  if (!current) return;
  // chips de categoría
  const counts = new Map();
  let total = 0;
  for (const l of current.lines) {
    const n = l.colors.filter((c) => !query || matches(`${c.name} ${c.nameEn || ''} ${l.name} ${l.category}`, query)).length;
    if (!n) continue;
    counts.set(l.category, (counts.get(l.category) || 0) + n);
    total += n;
  }
  const order = ['PLA Básico', 'PLA Matte', 'PLA Silk', 'PLA+ / Tough', 'PLA Translúcido', 'PLA Especial', 'PLA Glow', 'PLA Wood', 'PLA Fibra (CF/GF)', 'PETG', 'PETG Translúcido', 'ASA', 'ABS', 'TPU / Flexible', 'PC', 'PA / Nylon', 'Otros'];
  const cats = ['Todas', ...order.filter((c) => counts.has(c))];
  if (!cats.includes(category)) category = 'Todas';
  els.catChips.innerHTML = cats
    .map((c) => `<button class="chip${c === category ? ' active' : ''}" data-cat="${c}">${c}<span class="n">${c === 'Todas' ? total : counts.get(c)}</span></button>`)
    .join('');
  els.catChips.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { category = b.dataset.cat; render(); }));

  // líneas y colores
  const lines = current.lines
    .filter((l) => category === 'Todas' || l.category === category)
    .map((l) => ({ l, colors: l.colors.filter((c) => !query || matches(`${c.name} ${c.nameEn || ''} ${l.name} ${l.category}`, query)) }))
    .filter((x) => x.colors.length)
    .sort((a, b) => order.indexOf(a.l.category) - order.indexOf(b.l.category) || a.l.name.localeCompare(b.l.name));
  if (!lines.length) {
    els.lineList.innerHTML = `<div class="empty-cat">${query ? 'Sin resultados para «' + escapeHtml(query) + '»' : 'Esta marca no tiene colores en esta categoría'}</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const { l, colors } of lines) {
    const block = document.createElement('div');
    block.className = 'line-block';
    const temps = l.temps ? ` · ${l.temps.nozzle.join('–')} °C` : '';
    block.innerHTML = `<div class="line-head"><strong>${escapeHtml(l.name)}</strong><span class="muted">${colors.length} colores${temps}${l.url ? ` · <a href="${l.url}" target="_blank" rel="noopener">tienda</a>` : ''}</span></div><div class="color-grid"></div>`;
    const grid = block.querySelector('.color-grid');
    for (const c of colors) {
      const fil = makeFilament(current, l, c);
      const sw = document.createElement('div');
      sw.className = 'swatch' + (filamentKey(fil) === activeKey ? ' active' : '');
      sw.title = `${current.name} · ${l.name}\n${c.name}${c.nameEn && c.nameEn !== c.name ? ` (${c.nameEn})` : ''}\n${c.hexes ? c.hexes.join(' · ') : c.hex}${c.code ? `\nCódigo: ${c.code}` : ''}${c.approx ? '\n(tono aproximado)' : ''}${c.available === false ? '\nAGOTADO en la tienda' : ''}`;
      sw.innerHTML = `<div class="chip-c${c.alpha ? ' trans' : ''}" style="background:${swatchCss(fil)}"></div><div class="lbl">${escapeHtml(c.name)}</div>`;
      if (c.available === false) sw.style.opacity = 0.45;
      sw.addEventListener('click', () => {
        activeKey = filamentKey(fil);
        els.lineList.querySelectorAll('.swatch.active').forEach((x) => x.classList.remove('active'));
        sw.classList.add('active');
        onPick(fil);
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
  if (bid) ids.push(bid);
  else {
    if (current) ids.push(current.id);
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
        if (id === bid || (!bid && current && id === current.id)) score += 0.5;
        scored.push({ score, f: makeFilament(b, l, c) });
        if (scored.length > 600) break;
      }
    }
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((x) => x.f);
}

export async function resolveFilament({ brand, line, color_name: colorName, hex }) {
  const bid = findBrandId(brand) || current?.id || 'bambulab';
  if (colorName) {
    try {
      const b = await loadBrand(bid);
      const lines = b.lines.filter((l) => !line || norm(l.name) === norm(line)) ;
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
