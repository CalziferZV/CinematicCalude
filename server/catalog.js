// Catálogo de filamentos conectado a fuentes en vivo.
//  - Bambu Lab: base de colores oficial publicada por Bambu Lab en el repositorio de Bambu Studio
//    (los mismos códigos HEX que usa el AMS / Bambu Studio).
//  - Resto de marcas: SpoolmanDB (base abierta y mantenida por la comunidad con +80 fabricantes:
//    Sunlu, eSun, Polymaker, Elegoo, Prusament, Overture, Jayo, Eryone, Creality, Anycubic, ...).
//  - Tiendas Shopify (opcional): se puede leer cualquier tienda Shopify (products.json) en vivo.
// Todo se cachea en memoria + disco, y si no hay internet se usa una instantánea incluida.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, '..', 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot', 'catalog.json.gz');

const BAMBU_URL =
  'https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/filaments_color_codes.json';
const SPOOLMAN_LIST_URL = 'https://api.github.com/repos/Donkie/SpoolmanDB/contents/filaments';
const SPOOLMAN_RAW = 'https://raw.githubusercontent.com/Donkie/SpoolmanDB/main/filaments/';

const TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

// Lista de respaldo de fabricantes de SpoolmanDB (si GitHub API no responde).
const FALLBACK_IDS = ['3dfuel','3dhojor','3djake','3do','3dprintingcanada','3dxtech','AmazonBasics','AzureFilm','NTHGrillon','Numakers','abaflex','addnorth','ambrosia','ameleis','anycubic','artillery','aurapol','bambulab','biqu','catyarn','cc3d','chckx','closin','cr3d','creality','dasfilament','deeplee','devildesign','elegoo','eryone','esun','extrudr','fiberlogy','filamentunger','fillamentum','flashforge','formfutura','fusion','geeetech','gembird','gst3d','hatchbox','inland','inslogic','jayo','kexcelled','kingroon','l3d','landu','ldo','lovoon','marswork','matter3dinc','nobufil','novtau','overture','patroneg','polarfilament','polymaker','printedsolid','professionallab','protopasta','prusament','qiditech','r3d','ratrig','redlinefilament','renkforce','rosa3d','siddament','smartfil','snapmaker','soleyin','spectrum','sunlu','tecbears','tectonic3d','teqstone','tinmorry','unitak3d','verbatim','voolt3d','voxelpla','winkle','xzn','ziro3d','zyltech'];

// ---------------------------------------------------------------- utilidades
async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'filament-studio/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normHex(h) {
  if (!h) return null;
  let s = String(h).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{8}$/i.test(s) || /^[0-9a-f]{6}$/i.test(s)) return '#' + s.toUpperCase();
  return null;
}

// Categorías que se muestran como pestañas en la interfaz.
export const CATEGORY_ORDER = [
  'PLA Básico',
  'PLA Matte',
  'PLA Silk',
  'PLA+ / Tough',
  'PLA Translúcido',
  'PLA Especial',
  'PLA Glow',
  'PLA Wood',
  'PLA Fibra (CF/GF)',
  'PETG',
  'PETG Translúcido',
  'ASA',
  'ABS',
  'TPU / Flexible',
  'PC',
  'PA / Nylon',
  'Otros',
];

export function categorize(material, lineName) {
  const t = `${material || ''} ${lineName || ''}`.toLowerCase();
  if (/support|soporte|pva|bvoh|hips/.test(t)) return 'Otros';
  if (/tpu|tpe|flex|\b\d{2}a\b/.test(t)) return 'TPU / Flexible';
  if (/petg|pctg|\bpet\b|pet-/.test(t)) {
    if (/transl|transp|clear/.test(t)) return 'PETG Translúcido';
    return 'PETG';
  }
  if (/asa/.test(t)) return 'ASA';
  if (/abs/.test(t)) return 'ABS';
  if (/\bpc\b|pc-|pc\+|polycarb/.test(t)) return 'PC';
  if (/\bpa\d*|nylon|ppa|paht|\bpps/.test(t)) return 'PA / Nylon';
  if (/wood|madera/.test(t)) return 'PLA Wood';
  if (/pla/.test(t)) {
    if (/silk|seda|satin/.test(t)) return 'PLA Silk';
    if (/glow|lumin/.test(t)) return 'PLA Glow';
    if (/wood|madera/.test(t)) return 'PLA Wood';
    if (/-cf|\bcf\b|carbon|-gf|\bgf\b/.test(t)) return 'PLA Fibra (CF/GF)';
    if (/transl|transp|clear|crystal/.test(t)) return 'PLA Translúcido';
    if (/marble|sparkle|galaxy|metal|glitter|rainbow|\bdual|\btri\b|tri-?colou?r|multi|gradient|dynamic|palette|starlight|mystic|magic|aero/.test(t))
      return 'PLA Especial';
    if (/matte|mate/.test(t)) return 'PLA Matte';
    if (/\+|plus|tough|pro\b|hs|hyper|high.?speed|pure|lite/.test(t)) return 'PLA+ / Tough';
    return 'PLA Básico';
  }
  return 'Otros';
}

// Acabado visual (lo usa el visor 3D para simular el material).
export function finishOf(material, lineName, extra = {}) {
  const t = `${material || ''} ${lineName || ''} ${extra.finish || ''} ${extra.pattern || ''}`.toLowerCase();
  if (extra.glow || /glow|lumin/.test(t)) return 'glow';
  if (/silk|seda|satin/.test(t)) return 'silk';
  if (/metal/.test(t)) return 'metal';
  if (/sparkle|glitter|galaxy|starlight/.test(t)) return 'sparkle';
  if (/marble/.test(t)) return 'marble';
  if (/wood|madera/.test(t)) return 'wood';
  if (extra.translucent || /transl|transp|clear|crystal/.test(t)) return 'translucent';
  if (/-cf|\bcf\b|carbon|-gf|\bgf\b/.test(t)) return 'carbon';
  if (/matte|mate|aero/.test(t)) return 'matte';
  if (/tpu|flex/.test(t)) return 'satin';
  return 'basic';
}

// ---------------------------------------------------------------- Bambu Lab
function normalizeBambu(json) {
  const byLine = new Map();
  for (const c of json.data || []) {
    const lineName = c.fila_type || 'Otros';
    if (!byLine.has(lineName)) byLine.set(lineName, []);
    const hexes = (c.fila_color || []).map(normHex).filter(Boolean);
    if (!hexes.length) continue;
    const names = c.fila_color_name || {};
    const kind = c.fila_color_type === '渐变色' ? 'gradient' : c.fila_color_type === '多拼色' ? 'multi' : 'solid';
    const alpha = hexes[0].length === 9 ? parseInt(hexes[0].slice(7, 9), 16) / 255 : 1;
    byLine.get(lineName).push({
      name: names.es || names.en || c.color_code,
      nameEn: names.en || '',
      hex: hexes[0].slice(0, 7),
      hexes: hexes.length > 1 ? hexes.map((h) => h.slice(0, 7)) : undefined,
      alpha: alpha < 0.99 ? +alpha.toFixed(2) : undefined,
      kind,
      code: c.fila_color_code,
      filamentId: c.fila_id,
    });
  }
  const lines = [];
  for (const [name, colors] of byLine) {
    lines.push({
      id: slug(name),
      name,
      material: name.split(/[\s-]/)[0],
      category: categorize(name.split(' ')[0], name),
      finish: finishOf('', name, { translucent: colors.some((c) => c.alpha) }),
      colors,
    });
  }
  return {
    id: 'bambulab',
    name: 'Bambu Lab',
    source: 'Bambu Lab (base oficial de colores de Bambu Studio)',
    sourceUrl: 'https://github.com/bambulab/BambuStudio',
    shop: 'https://store.bambulab.com/collections/filament',
    official: true,
    lines,
  };
}

// ---------------------------------------------------------------- SpoolmanDB
function normalizeSpoolman(id, json) {
  const lines = [];
  for (const f of json.filaments || []) {
    const base = String(f.name || '')
      .replace(/\{color_name\}/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s\-–]+$/, '')
      .trim();
    const material = f.material || '';
    let lineName = base && !base.toLowerCase().startsWith(material.toLowerCase()) ? `${material} ${base}` : base || material;
    if (f.finish && !lineName.toLowerCase().includes(f.finish.toLowerCase()) && f.finish !== 'glossy')
      lineName += ` ${f.finish[0].toUpperCase()}${f.finish.slice(1)}`;
    lineName = lineName.trim();
    const colors = [];
    for (const c of f.colors || []) {
      const hexes = (c.hexes || (c.hex ? [c.hex] : [])).map(normHex).filter(Boolean).map((h) => h.slice(0, 7));
      if (!hexes.length) continue;
      const kind = hexes.length > 1 ? (f.multi_color_direction === 'longitudinal' ? 'gradient' : 'multi') : 'solid';
      colors.push({
        name: c.name,
        hex: hexes[0],
        hexes: hexes.length > 1 ? hexes : undefined,
        alpha: f.translucent || c.translucent ? 0.7 : undefined,
        kind,
      });
    }
    if (!colors.length) continue;
    // agrupar líneas con el mismo nombre
    const existing = lines.find((l) => l.name === lineName);
    if (existing) {
      for (const c of colors) if (!existing.colors.some((e) => e.name === c.name && e.hex === c.hex)) existing.colors.push(c);
      continue;
    }
    lines.push({
      id: slug(lineName),
      name: lineName,
      material,
      category: categorize(material, lineName),
      finish: finishOf(material, lineName, { finish: f.finish, pattern: f.pattern, glow: f.glow, translucent: f.translucent }),
      temps: f.extruder_temp_range ? { nozzle: f.extruder_temp_range, bed: f.bed_temp_range } : undefined,
      colors,
    });
  }
  return {
    id,
    name: json.manufacturer || id,
    source: 'SpoolmanDB (base abierta de filamentos)',
    sourceUrl: `https://github.com/Donkie/SpoolmanDB/blob/main/filaments/${id}.json`,
    lines,
  };
}

// ---------------------------------------------------------------- caché
const mem = new Map(); // key -> {at, data, origin}

function cacheFile(key) {
  return path.join(CACHE_DIR, `${slug(key)}.json`);
}
function readDisk(key) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'));
    return raw;
  } catch {
    return null;
  }
}
function writeDisk(key, entry) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(key), JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

let snapshot = null;
function loadSnapshot() {
  if (snapshot) return snapshot;
  try {
    snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAPSHOT_FILE)).toString('utf8'));
  } catch {
    snapshot = { brands: {}, brandList: [], at: null };
  }
  return snapshot;
}

async function cached(key, loader, { force = false } = {}) {
  const now = Date.now();
  let entry = mem.get(key) || readDisk(key);
  if (entry && !force && now - entry.at < TTL_MS) {
    mem.set(key, entry);
    return { ...entry, origin: entry.origin === 'live' ? 'cache' : entry.origin };
  }
  try {
    const data = await loader();
    entry = { at: now, data, origin: 'live' };
    mem.set(key, entry);
    writeDisk(key, entry);
    return entry;
  } catch (err) {
    if (entry) return { ...entry, origin: 'cache', error: String(err.message || err) };
    throw err;
  }
}

// ---------------------------------------------------------------- API pública
const PREFERRED = ['bambulab', 'sunlu', 'esun', 'polymaker', 'elegoo', 'prusament', 'overture', 'jayo', 'eryone', 'creality', 'anycubic'];

function prettyName(id) {
  const known = {
    bambulab: 'Bambu Lab', esun: 'eSun', sunlu: 'Sunlu', polymaker: 'Polymaker', elegoo: 'Elegoo', prusament: 'Prusament',
    '3djake': '3DJake', '3dxtech': '3DXTech', '3dfuel': '3D-Fuel', AmazonBasics: 'Amazon Basics', cc3d: 'CC3D',
    ldo: 'LDO', l3d: 'L3D', r3d: 'R3D', gst3d: 'GST3D', fusion: 'Fusion Filaments', qiditech: 'QIDI Tech', biqu: 'BIQU',
  };
  return known[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

export async function getBrandList({ force = false } = {}) {
  let ids;
  let origin = 'live';
  let at = Date.now();
  try {
    const r = await cached(
      'spoolman-list',
      async () => {
        const list = await fetchJson(SPOOLMAN_LIST_URL);
        if (!Array.isArray(list)) throw new Error('Respuesta inesperada de GitHub');
        return list.filter((f) => f.name.endsWith('.json')).map((f) => f.name.replace(/\.json$/, ''));
      },
      { force },
    );
    ids = r.data;
    origin = r.origin;
    at = r.at;
  } catch {
    const snap = loadSnapshot();
    ids = snap.brandList.length > 1 ? snap.brandList : FALLBACK_IDS;
    origin = 'snapshot';
    at = snap.at;
  }
  const all = ['bambulab', ...ids.filter((i) => i !== 'bambulab')];
  all.sort((a, b) => {
    const pa = PREFERRED.indexOf(a);
    const pb = PREFERRED.indexOf(b);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return prettyName(a).localeCompare(prettyName(b));
  });
  return {
    origin,
    at,
    brands: all.map((id) => ({ id, name: prettyName(id), featured: PREFERRED.includes(id) })),
    categories: CATEGORY_ORDER,
  };
}

export async function getBrand(id, { force = false } = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Marca no válida');
  try {
    const r = await cached(
      `brand-${id}`,
      async () => {
        if (id === 'bambulab') return normalizeBambu(await fetchJson(BAMBU_URL));
        return normalizeSpoolman(id, await fetchJson(SPOOLMAN_RAW + encodeURIComponent(id) + '.json'));
      },
      { force },
    );
    return { ...r.data, origin: r.origin, at: r.at, error: r.error };
  } catch (err) {
    const snap = loadSnapshot();
    if (snap.brands[id]) return { ...snap.brands[id], origin: 'snapshot', at: snap.at, error: String(err.message || err) };
    throw err;
  }
}

// ---------------------------------------------------------------- tiendas Shopify
// Lee cualquier tienda Shopify en vivo (products.json) y extrae los colores de las variantes.
// El HEX se aproxima a partir del nombre del color (las tiendas no publican el HEX).
import { colorNameToHex } from './colornames.js';

export async function getShopifyStore(storeUrl, { force = false } = {}) {
  let u;
  try {
    u = new URL(storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`);
  } catch {
    throw new Error('URL de tienda no válida');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('URL de tienda no válida');
  const host = u.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || host.endsWith('.local')) throw new Error('Host no permitido');
  const r = await cached(
    `shop-${host}`,
    async () => {
      const products = [];
      for (let page = 1; page <= 6; page++) {
        const j = await fetchJson(`https://${host}/products.json?limit=250&page=${page}`);
        if (!j.products || !j.products.length) break;
        products.push(...j.products);
        if (j.products.length < 250) break;
      }
      if (!products.length) throw new Error('La tienda no expone products.json (¿no es Shopify?)');
      const lines = [];
      for (const p of products) {
        const title = p.title || '';
        const text = `${title} ${p.product_type || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
        if (!/filament|filamento|pla|petg|abs|asa|tpu/.test(text)) continue;
        if (/printer|impresora|nozzle|hotend|dryer|secador|plate|bed\b/.test(title.toLowerCase())) continue;
        const colorIdx = (p.options || []).findIndex((o) => /colou?r|color|颜色|farbe|couleur/i.test(o.name));
        const colors = [];
        const seen = new Set();
        for (const v of p.variants || []) {
          let cname = colorIdx >= 0 ? v[`option${colorIdx + 1}`] : v.title;
          if (!cname || /^default title$/i.test(cname)) cname = title;
          if (!cname || seen.has(cname)) continue;
          seen.add(cname);
          const hexes = colorNameToHex(cname);
          colors.push({
            name: cname,
            hex: hexes[0],
            hexes: hexes.length > 1 ? hexes : undefined,
            kind: hexes.length > 1 ? 'multi' : 'solid',
            approx: true,
            available: v.available,
            price: v.price,
          });
        }
        if (!colors.length) continue;
        lines.push({
          id: slug(title),
          name: title,
          material: (title.match(/PLA\+?|PETG|ABS|ASA|TPU|PC|PA\d*|Nylon/i) || ['?'])[0].toUpperCase(),
          category: categorize('', title),
          finish: finishOf('', title),
          url: `https://${host}/products/${p.handle}`,
          colors,
        });
      }
      return {
        id: `shop:${host}`,
        name: host.replace(/^www\.|^store\.|^us\.|^eu\./g, ''),
        source: `Tienda Shopify en vivo (${host}) — HEX aproximado por nombre`,
        sourceUrl: `https://${host}`,
        lines,
      };
    },
    { force },
  );
  return { ...r.data, origin: r.origin, at: r.at };
}

// ---------------------------------------------------------------- instantánea
export async function buildSnapshot() {
  const list = await getBrandList({ force: true });
  const brands = {};
  for (const b of list.brands) {
    try {
      const d = await getBrand(b.id, { force: true });
      delete d.origin;
      delete d.at;
      delete d.error;
      brands[b.id] = d;
      process.stdout.write('.');
    } catch (e) {
      console.warn(`\n${b.id}: ${e.message}`);
    }
  }
  const out = { at: Date.now(), brandList: list.brands.map((b) => b.id), brands };
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, zlib.gzipSync(JSON.stringify(out), { level: 9 }));
  return out;
}
