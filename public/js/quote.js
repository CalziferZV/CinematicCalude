// Presupuesto instantáneo: peso de filamento por color, purga de los cambios de color,
// tiempo de impresión, coste y precio para el cliente. Es una estimación a partir de la
// geometría (el laminador dará la cifra exacta), pensada para responder en la llamada.
import { S, topo, BLANK } from './state.js';
import { getPref, setPref } from './prefs.js';
import { filamentKey, isOwned, ownedSpools } from './catalog.js';
import { materialFamily } from './colorsci.js';

// €/kg orientativos por tipo de filamento (se pueden cambiar en los ajustes)
export const DEFAULT_PRICES = {
  'PLA Básico': 20, 'PLA Matte': 22, 'PLA Silk': 26, 'PLA+ / Tough': 22, 'PLA Translúcido': 24, 'PLA Especial': 28, 'PLA Glow': 30,
  'PLA Wood': 28, 'PLA Fibra (CF/GF)': 35, PETG: 21, 'PETG Translúcido': 22, ASA: 26, ABS: 21, 'TPU / Flexible': 32, PC: 35, 'PA / Nylon': 45, Otros: 25,
};
const DENSITY = { PLA: 1.24, PETG: 1.27, ASA: 1.07, ABS: 1.04, TPU: 1.21, PC: 1.2, PA: 1.14, Otros: 1.24 };

export const DEFAULTS = {
  infill: 15, // % de relleno
  walls: 0.8, // mm de paredes / techo / suelo (≈ 2 perímetros)
  gramsPerHour: 25, // velocidad media de la impresora (g/h)
  purgeGrams: 0.5, // g de purga por cada cambio de color (incluye torre de purga)
  changeSecs: 45, // segundos por cambio de color con AMS
  machineRate: 1, // €/hora de máquina (luz + desgaste)
  setupFee: 2, // € fijos de preparación
  margin: 50, // % de margen sobre el coste
  vat: 0, // % de IVA (0 = sin IVA)
  round: 0.5, // redondeo del precio final (€)
  minPrice: 5, // precio mínimo (€)
  layerHeight: 0.2, // mm
  bed: 256, // mm de cama de la impresora (X1, P1, A1: 256 · A1 mini: 180)
  showClient: false, // enseñar el precio al cliente
  shopName: '', // nombre del taller (imágenes y vídeos)
  prices: {},
};

export function settings() {
  const q = getPref('quote', {}) || {};
  return { ...DEFAULTS, ...q, prices: { ...DEFAULT_PRICES, ...(q.prices || {}) } };
}
export function saveSettings(patch) {
  const cur = getPref('quote', {}) || {};
  const next = { ...cur, ...patch };
  if (patch.prices) next.prices = { ...(cur.prices || {}), ...patch.prices };
  setPref('quote', next);
}

const catOf = (f) => (f && f.category && DEFAULT_PRICES[f.category] !== undefined ? f.category : f && !f.blank ? guessCategory(f) : 'PLA Básico');
function guessCategory(f) {
  const fam = materialFamily(f);
  if (fam === 'PLA') return f.finish === 'silk' ? 'PLA Silk' : f.finish === 'matte' ? 'PLA Matte' : 'PLA Básico';
  return { PETG: 'PETG', ASA: 'ASA', ABS: 'ABS', TPU: 'TPU / Flexible', PC: 'PC', PA: 'PA / Nylon' }[fam] || 'Otros';
}
function density(f) {
  if (f && f.category === 'PLA Fibra (CF/GF)') return 1.29;
  return DENSITY[f && !f.blank ? materialFamily(f) : 'PLA'] || 1.24;
}

// ---------------------------------------------------------------- unidades
// Pedidos de varias copias (los trofeos de un equipo, recuerdos de una boda…). Las copias que
// caben juntas en la cama comparten cada cambio de color, así que la purga se paga por cama.
let qty = 1;
const qtyListeners = new Set();
export const getQty = () => qty;
export const onQty = (fn) => qtyListeners.add(fn);
export function setQty(n) {
  const v = Math.max(1, Math.min(9999, Math.round(parseFloat(String(n).replace(',', '.')) || 1)));
  if (v === qty) return;
  qty = v;
  for (const fn of qtyListeners) { try { fn(v); } catch (e) { console.error(e); } }
}
// copias que caben en la cama en rejilla, con 8 mm entre ellas (si no cabe, va sola)
export function perPlate(size, bed) {
  const gap = 8, b = Math.max(50, +bed || 256);
  const [x, y] = size;
  if (!(x > 0 && y > 0) || x > b || y > b) return 1;
  return Math.max(1, Math.floor((b + gap) / (x + gap)) * Math.floor((b + gap) / (y + gap)));
}

// ---------------------------------------------------------------- cálculo
// scale: [fx, fy, fz] para ver el precio con otro tamaño sin aplicarlo.
// units: número de copias del pedido (por defecto, las elegidas en el panel).
// Todo lo que devuelve (gramos, horas, costes, price) es del pedido entero; unit es el precio por copia.
export function computeQuote({ scale = [1, 1, 1], units = qty } = {}) {
  if (!S.mesh || !S.parts.length) return null;
  const set = settings();
  const t = topo();
  const P = S.mesh.pos, fp = S.mesh.faceParts, nF = fp.length;
  const [sx, sy, sz] = scale;
  // filamentos usados (las partes sin color cuentan como un filamento más)
  const partFil = new Map();
  const fils = [];
  const filIndex = new Map();
  for (const p of S.parts) {
    const f = p.filament || BLANK;
    const k = f.blank ? 'blank' : filamentKey(f);
    if (!filIndex.has(k)) { filIndex.set(k, fils.length); fils.push({ fil: f, key: k, area: 0, parts: [] }); }
    partFil.set(p.id, filIndex.get(k));
    fils[filIndex.get(k)].parts.push(p.name);
  }
  const nFil = fils.length;
  // volumen (teorema de la divergencia) y superficie de cada color, con la escala aplicada
  let vol = 0, area = 0;
  const lh = Math.max(0.04, +set.layerHeight || S.layerHeight || 0.2);
  const z0 = t.bbox.minZ * sz;
  const H = (t.bbox.maxZ - t.bbox.minZ) * sz;
  const nL = Math.max(1, Math.ceil(H / lh - 1e-6));
  const present = new Uint8Array(nFil * nL);
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    const x1 = P[o] * sx, y1 = P[o + 1] * sy, z1 = P[o + 2] * sz;
    const x2 = P[o + 3] * sx, y2 = P[o + 4] * sy, z2 = P[o + 5] * sz;
    const x3 = P[o + 6] * sx, y3 = P[o + 7] * sy, z3 = P[o + 8] * sz;
    vol += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6;
    const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1, vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
    const a = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const fi = partFil.get(fp[f]) ?? 0;
    fils[fi].area += a;
    area += a;
    // capas en las que aparece este color
    const zl = Math.min(z1, z2, z3) - z0, zh = Math.max(z1, z2, z3) - z0;
    const l0 = Math.max(0, Math.min(nL - 1, Math.floor(zl / lh + 1e-6)));
    const l1 = Math.max(0, Math.min(nL - 1, Math.floor(zh / lh - 1e-6)));
    const row = fi * nL;
    for (let l = l0; l <= l1; l++) present[row + l] = 1;
  }
  vol = Math.abs(vol);
  if (!(vol > 0)) vol = area * 0.5; // malla abierta extraña: estimación mínima
  const size = [(t.bbox.maxX - t.bbox.minX) * sx, (t.bbox.maxY - t.bbox.minY) * sy, (t.bbox.maxZ - t.bbox.minZ) * sz];
  const n = Math.max(1, Math.round(units) || 1);
  const fit = perPlate(size, set.bed);
  const onPlate = Math.min(n, fit);
  const plates = Math.ceil(n / onPlate);
  // material: piel (paredes) de cada color + relleno interior repartido por superficie
  let shellTotal = 0;
  for (const e of fils) shellTotal += e.area * set.walls;
  const shellScale = shellTotal > vol ? vol / shellTotal : 1; // piezas finas: macizas
  const interior = Math.max(0, vol - shellTotal * shellScale);
  let grams = 0;
  for (const e of fils) {
    const share = area > 0 ? e.area / area : 1 / nFil;
    e.volume = (e.area * set.walls * shellScale + interior * (set.infill / 100) * share) * n; // mm³ del pedido
    e.grams = (e.volume / 1000) * density(e.fil);
    e.category = catOf(e.fil);
    e.pricePerKg = +set.prices[e.category] || DEFAULT_PRICES[e.category] || 25;
    e.cost = (e.grams * e.pricePerKg) / 1000;
    e.owned = !e.fil.blank && isOwned(e.fil);
    grams += e.grams;
  }
  // cambios de color capa a capa (el laminador empieza cada capa con el último color de la anterior)
  let changes = 0, prev = null, multiLayers = 0;
  for (let l = 0; l < nL; l++) {
    const cur = [];
    for (let i = 0; i < nFil; i++) if (present[i * nL + l]) cur.push(i);
    if (!cur.length) continue;
    if (cur.length > 1) multiLayers++;
    if (!prev) changes += cur.length - 1;
    else changes += cur.some((i) => prev.includes(i)) ? cur.length - 1 : cur.length;
    prev = cur;
  }
  const purgeGrams = changes * set.purgeGrams * plates; // cada cama purga una vez por cambio, lleve las copias que lleve
  const avgPrice = grams > 0 ? fils.reduce((s, e) => s + e.grams * e.pricePerKg, 0) / grams : 25;
  const hours = (grams + purgeGrams * 0.25) / Math.max(1, set.gramsPerHour) + (changes * plates * set.changeSecs) / 3600;
  const material = fils.reduce((s, e) => s + e.cost, 0);
  const purge = (purgeGrams * avgPrice) / 1000;
  const machine = hours * set.machineRate;
  const setup = +set.setupFee || 0;
  const cost = material + purge + machine + setup;
  const marginAmt = cost * (set.margin / 100);
  const beforeVat = cost + marginAmt;
  const vatAmt = beforeVat * (set.vat / 100);
  const raw = beforeVat + vatAmt;
  const r = +set.round > 0 ? +set.round : 0.01;
  // se redondea el precio por copia (el total es copias × unidad) y el mínimo vale para el pedido
  let unit = Math.ceil(raw / n / r - 1e-9) * r;
  let price = unit * n;
  if (price < (+set.minPrice || 0)) { price = +set.minPrice; unit = price / n; }
  let open = 0;
  for (let i = 0; i < t.nbr.length; i++) if (t.nbr[i] < 0) open++;
  return {
    settings: set, volume: vol, area, fils, grams, purgeGrams, changes, layers: nL, multiLayers, hours,
    costs: { material, purge, machine, setup, cost, margin: marginAmt, vat: vatAmt }, price, raw, open, size,
    qty: n, unit, fit, onPlate, plates,
  };
}

// ---------------------------------------------------------------- formato
export const eur = (v) => (Number.isFinite(v) ? v : 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export function grams(g) {
  if (!Number.isFinite(g)) return '—';
  return g < 10 ? `${g.toLocaleString('es-ES', { maximumFractionDigits: 1 })} g` : `${Math.round(g).toLocaleString('es-ES')} g`;
}
export function duration(h) {
  if (!Number.isFinite(h)) return '—';
  const m = Math.max(1, Math.round(h * 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
const mm = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const num = (v) => (+v).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const filName = (f) => (f.blank ? 'Sin color (por elegir)' : `${f.brandName || ''} ${f.line || ''} · ${f.name}`.trim());

// Resumen corto para el chip del visor
export function chipHtml(q) {
  return `≈ ${grams(q.grams + q.purgeGrams)} · ${duration(q.hours)} · <b>${q.qty > 1 ? `${q.qty} × ${eur(q.unit)}` : eur(q.price)}</b>`;
}
export const plural = (k, one, many) => `${k.toLocaleString('es-ES')} ${k === 1 ? one : many}`;

// Mensaje listo para pegar en WhatsApp
export function clientMessage(q) {
  const name = (S.modelName || 'tu pieza').replace(/\.[^.]+$/, '');
  const lines = [`*Presupuesto · ${name}*`, `Tamaño: ${q.size.map(mm).join(' × ')} mm`, 'Colores:'];
  for (const p of S.parts) {
    const f = p.filament || BLANK;
    lines.push(`• ${p.name}: ${f.blank ? 'por elegir' : `${f.brandName || ''} ${f.line || ''} · ${f.name}`.trim()}`);
  }
  lines.push(`Peso aprox.: ${grams(q.grams + q.purgeGrams)} · Tiempo de impresión aprox.: ${duration(q.hours)}${q.plates > 1 ? ` (${q.plates} tandas)` : ''}`);
  const vat = q.settings.vat > 0 ? ' (IVA incluido)' : '';
  if (q.qty > 1) lines.push(`*Precio: ${q.qty} unidades × ${eur(q.unit)} = ${eur(q.price)}*${vat}`);
  else lines.push(`*Precio: ${eur(q.price)}*${vat}`);
  if (q.settings.shopName) lines.push('', q.settings.shopName);
  return lines.join('\n');
}

// Texto para la ficha (TXT)
export function sheetLines(q) {
  const c = q.costs;
  const out = ['PRESUPUESTO (estimación a partir de la geometría):'];
  if (q.qty > 1) out.push(`  Unidades: ${q.qty} (${plural(q.onPlate, 'copia', 'copias')} por cama, ${plural(q.plates, 'tanda', 'tandas')}) · precio por unidad ${eur(q.unit)}`);
  out.push(`  Peso de las piezas: ${grams(q.grams)} · purga de ${q.changes} cambios de color${q.plates > 1 ? ` × ${q.plates} tandas` : ''}: ${grams(q.purgeGrams)}`);
  out.push(`  Tiempo aproximado: ${duration(q.hours)} · ${q.layers} capas de ${num(q.settings.layerHeight)} mm`);
  for (const e of q.fils) out.push(`  · ${filName(e.fil)}: ${grams(e.grams)} (${eur(e.cost)})`);
  out.push(`  Material ${eur(c.material)} + purga ${eur(c.purge)} + máquina ${eur(c.machine)} + preparación ${eur(c.setup)} = coste ${eur(c.cost)}`);
  out.push(`  Margen ${q.settings.margin} %: ${eur(c.margin)}${q.settings.vat ? ` · IVA ${q.settings.vat} %: ${eur(c.vat)}` : ''}`);
  out.push(`  PRECIO PARA EL CLIENTE: ${eur(q.price)}${q.qty > 1 ? ` (${q.qty} unidades × ${eur(q.unit)})` : ''}`);
  return out;
}

// ---------------------------------------------------------------- panel
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const FIELDS = [
  ['h', 'Impresión'],
  ['infill', 'Relleno', '%', 0, 100, 1],
  ['walls', 'Paredes, suelo y techo', 'mm', 0.2, 5, 0.1],
  ['layerHeight', 'Altura de capa', 'mm', 0.04, 0.6, 0.02],
  ['gramsPerHour', 'Velocidad media de tu impresora', 'g/h', 2, 300, 1],
  ['bed', 'Cama de tu impresora (A1 mini: 180)', 'mm', 100, 600, 1],
  ['h', 'Cambios de color (AMS)'],
  ['purgeGrams', 'Purga por cambio', 'g', 0, 5, 0.05],
  ['changeSecs', 'Tiempo por cambio', 's', 0, 600, 1],
  ['h', 'Precio'],
  ['machineRate', 'Coste de máquina', '€/h', 0, 50, 0.1],
  ['setupFee', 'Preparación fija', '€', 0, 500, 0.5],
  ['margin', 'Margen', '%', 0, 1000, 5],
  ['vat', 'IVA', '%', 0, 30, 1],
  ['minPrice', 'Precio mínimo', '€', 0, 1000, 1],
  ['round', 'Redondear a', '€', 0, 10, 0.1],
];

export function renderPanel(body, q) {
  if (!q) {
    body.innerHTML = '<div class="muted">Abre un modelo para calcular el presupuesto.</div>';
    return;
  }
  // Resultados (se rehacen siempre) y ajustes (solo cuando cambian los tipos de filamento,
  // para no quitarte el cursor mientras escribes)
  let res = body.querySelector('.qp-res');
  let det = body.querySelector('details.qp-settings');
  let qrow = body.querySelector('.qp-qty');
  if (!res || !det || !qrow) {
    body.innerHTML = `<div class="qp-qty"><label for="qQty">Unidades</label><div class="stepper"><button type="button" data-step="-1" aria-label="Una unidad menos" title="Una menos">−</button><input id="qQty" type="number" min="1" max="9999" step="1" value="1" inputmode="numeric" /><button type="button" data-step="1" aria-label="Una unidad más" title="Una más">+</button></div><span class="qp-plate muted"></span></div><div class="qp-res"></div><details class="qp-settings"><summary>Ajustes del presupuesto</summary><div class="qs-grid"></div></details>`;
    res = body.querySelector('.qp-res');
    det = body.querySelector('details.qp-settings');
    qrow = body.querySelector('.qp-qty');
    det.open = !!renderPanel.open;
    det.addEventListener('toggle', () => (renderPanel.open = det.open));
    const inp = qrow.querySelector('input');
    qrow.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) setQty(qty + +b.dataset.step); });
    // mientras escribes no se pisa lo que llevas; al confirmar (Intro o salir) se aplica
    const commit = () => { delete inp.dataset.dirty; setQty(inp.value); inp.value = qty; };
    inp.addEventListener('input', () => (inp.dataset.dirty = '1'));
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); inp.select(); } });
  }
  const qin = qrow.querySelector('input');
  if (!qin.dataset.dirty) qin.value = q.qty;
  qrow.querySelector('.qp-plate').textContent = q.qty > 1
    ? `${plural(q.onPlate, 'copia', 'copias')} por cama · ${plural(q.plates, 'tanda', 'tandas')}`
    : q.fit > 1 ? `caben ${q.fit} por cama` : '';
  const s = q.settings, c = q.costs;
  const haveSpools = ownedSpools().length > 0;
  const rows = q.fils
    .slice()
    .sort((a, b) => b.grams - a.grams)
    .map((e) => {
      const sw = e.fil.blank ? '#ECECEC' : e.fil.hex;
      const warn = haveSpools && !e.fil.blank && !e.owned ? '<div class="warn">⚠ No está en «Mis bobinas»</div>' : '';
      return `<tr><td><i style="background:${esc(sw)}"></i>${esc(filName(e.fil))}${warn}</td><td class="r">${grams(e.grams)}</td><td class="r">${eur(e.cost)}</td></tr>`;
    })
    .join('');
  res.innerHTML = `
    <div class="qp-price"><div class="big">${eur(q.price)}</div><div class="sub">${q.qty > 1 ? `<b>${q.qty} × ${eur(q.unit)}</b><br>` : ''}${s.vat > 0 ? `IVA ${s.vat} % incluido` : 'sin IVA'}<br>coste ${eur(c.cost)}</div></div>
    <div class="qp-stats">
      <div><b>${grams(q.grams + q.purgeGrams)}</b><span>filamento</span></div>
      <div><b>${duration(q.hours)}</b><span>impresión</span></div>
      <div><b>${q.changes}</b><span>${q.plates > 1 ? 'cambios por tanda' : 'cambios de color'}</span></div>
    </div>
    <table class="qp-table">${rows}</table>
    <div class="qp-break">
      <div><span>Material (${grams(q.grams)})</span><span>${eur(c.material)}</span></div>
      <div><span>Purga (${q.changes} cambios × ${num(s.purgeGrams)} g${q.plates > 1 ? ` × ${q.plates} tandas` : ''})</span><span>${eur(c.purge)}</span></div>
      <div><span>Máquina (${duration(q.hours)} × ${eur(s.machineRate)}/h)</span><span>${eur(c.machine)}</span></div>
      <div><span>Preparación</span><span>${eur(c.setup)}</span></div>
      <div><span>Margen ${s.margin} %</span><span>${eur(c.margin)}</span></div>
      ${s.vat > 0 ? `<div><span>IVA ${s.vat} %</span><span>${eur(c.vat)}</span></div>` : ''}
      <div class="tot"><span>${q.qty > 1 ? `Total (${q.qty} unidades)` : 'Precio para el cliente'}</span><span>${eur(q.price)}</span></div>
      ${q.qty > 1 ? `<div class="unit"><span>Por unidad</span><span>${eur(q.unit)}</span></div>` : ''}
    </div>
    <div class="qp-note">Estimación con relleno ${num(s.infill)} % y paredes de ${num(s.walls)} mm sobre ${q.size.map(mm).join(' × ')} mm. ${q.multiLayers ? `${q.multiLayers} capas llevan varios colores. ` : ''}${q.open ? 'La malla tiene agujeros: el peso es menos preciso. ' : ''}${q.qty > 1 && q.onPlate > 1 ? 'Las copias de una misma cama comparten la purga de cada cambio de color. ' : ''}El laminador dará la cifra exacta.</div>`;

  const usedCats = [...new Set(q.fils.filter((e) => !e.fil.blank).map((e) => e.category))];
  const sig = usedCats.join('|');
  const grid = det.querySelector('.qs-grid');
  if (grid.dataset.sig === sig && grid.childElementCount) return;
  if (grid.contains(document.activeElement)) return; // escribiendo: se actualiza después
  grid.dataset.sig = sig;
  const field = ([k, label, unit, min, max, step]) =>
    k === 'h' ? `<h5>${esc(label)}</h5>` : `<label>${esc(label)} <span class="muted">(${unit})</span></label><input type="number" data-q="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}" />`;
  const priceInputs = usedCats.map((cat) => `<label>${esc(cat)}</label><input type="number" data-price="${esc(cat)}" min="0" max="500" step="0.5" value="${s.prices[cat]}" title="€ por kg" />`).join('');
  grid.innerHTML = `
    ${FIELDS.map(field).join('')}
    ${usedCats.length ? `<h5>Precio del filamento (€/kg)</h5>${priceInputs}` : ''}
    <h5>Tu taller</h5>
    <label class="full">Nombre (aparece en las imágenes, vídeos y mensajes)</label>
    <input class="full" type="text" data-qtext="shopName" maxlength="60" placeholder="p. ej. Impresiones Lucía 3D" value="${esc(s.shopName)}" />`;
  grid.querySelectorAll('[data-q]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (Number.isFinite(v)) saveSettings({ [inp.dataset.q]: Math.min(+inp.max, Math.max(+inp.min, v)) });
    }),
  );
  grid.querySelectorAll('[data-price]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (Number.isFinite(v) && v >= 0) saveSettings({ prices: { [inp.dataset.price]: v } });
    }),
  );
  grid.querySelectorAll('[data-qtext]').forEach((inp) => inp.addEventListener('change', () => saveSettings({ [inp.dataset.qtext]: inp.value.trim() })));
}
