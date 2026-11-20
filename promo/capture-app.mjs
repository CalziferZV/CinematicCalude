// Capturas de la app real para el vídeo explicativo: cada paso (abrir, colores, presupuesto,
// cortar, texto, Bambu Studio) a 1600 × 1000 con 1,5 veces más píxeles, y la posición de los botones
// y paneles de cada captura (promo/assets/explica/shots.json) para colocar el cursor y los zooms.
// Necesita la app en marcha:  FS_NO_BROWSER=1 node server/server.js   y después   node promo/capture-app.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'promo', 'assets', 'explica');
const TMP = path.join(ROOT, 'promo', 'out', 'explica-png');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
const URL = (process.env.FS_URL || 'http://localhost:5173') + '/?tour=0';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('error en la app:', e.message));
const shots = {};
const rect = async (sel) => {
  const el = typeof sel === 'string' ? await page.$(sel) : sel;
  if (!el) return null;
  const b = await el.boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
};
async function shot(name, marks = {}, { toast = false, hover = false } = {}) {
  if (!hover) await page.mouse.move(1599, 999); // sin hover
  // los avisos de abajo solo salen donde aportan (p. ej. «5 partes detectadas»)
  await page.evaluate((show) => { const t = document.getElementById('toast'); if (t) t.style.visibility = show ? '' : 'hidden'; }, toast);
  await page.waitForTimeout(350);
  const png = path.join(TMP, `${name}.png`);
  await page.screenshot({ path: png, timeout: 180000 });
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.visibility = ''; });
  const jpg = path.join(OUT, `${name}.jpg`);
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '2', jpg]);
  const m = {};
  for (const [k, v] of Object.entries(marks)) m[k] = Array.isArray(v) ? { x: v[0], y: v[1], w: 0, h: 0 } : await rect(v);
  shots[name] = { file: `assets/explica/${name}.jpg`, marks: m };
  console.log(name, Object.keys(m).join(', '));
}
const partRow = async (name) => {
  const i = await page.evaluate((n) => window.FS.S.parts.findIndex((p) => p.name === n), name);
  return (await page.$$('#partsList .part'))[i];
};
// clic desde la propia página: con una parte sin color seleccionada el visor "late" (se redibuja sin
// parar) y, con el 3D por software a esta resolución, los clics de Playwright esperan demasiado
const jsClick = (h) => page.evaluate((el) => el.click(), h);
const pickSwatch = async (re) => {
  const all = await page.$$('#lineList .swatch');
  for (const h of all) { const t = (await h.getAttribute('title')) || ''; if (re.test(t)) return h; }
  return all[0];
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
// 1 · abrir
await shot('s01_vacio', { open: '#btnOpen', samples: '[data-dd="samplesMenu"]', card: '#emptyState .empty-card' });
await page.click('[data-dd="samplesMenu"]');
await page.waitForTimeout(250);
await shot('s02_ejemplos', { trofeo: '#samplesMenu [data-sample="trofeo.stl"]', menu: '#samplesMenu' });
await page.click('#samplesMenu [data-sample="trofeo.stl"]');
await page.waitForFunction(() => window.FS && window.FS.S.parts.some((p) => p.name === 'Copa'), null, { timeout: 120000 });
await page.waitForTimeout(900);
await shot('s03_partes', { parts: '#partsList', view: '.viewport-wrap', copa: await partRow('Copa'), toast: '#toast' }, { toast: true });
// 2 · colores reales
await (await partRow('Copa')).click();
await page.waitForTimeout(400);
await page.fill('#colorSearch', 'dorado');
await page.waitForTimeout(700);
const dorado = await pickSwatch(/Silk[^\n]*\n\s*Dorado/i);
await shot('s04_buscar', { search: '#colorSearch', swatch: dorado, panel: '.panel.right', copa: await partRow('Copa') });
await jsClick(dorado);
await page.waitForTimeout(800);
await shot('s05_copa', { view: '.viewport-wrap', panel: '.panel.right', copa: await partRow('Copa') });
// resto de colores (como lo haría el usuario, aquí directo)
await page.evaluate(async () => {
  const { S, ST } = window.FS;
  const by = (n) => S.parts.find((p) => p.name === n).id;
  const oro = S.parts.find((p) => p.name === 'Copa').filament;
  const C = await import('/js/catalog.js');
  const negro = (await C.searchFilaments({ query: 'carbón', brand: 'bambulab' })).find((f) => f.line === 'PLA Matte');
  ST.setPartFilament([by('Base'), by('Columna')], negro);
  ST.setPartFilament([by('Placa'), by('Texto')], oro);
  ST.select([]);
});
await page.fill('#colorSearch', '');
await page.waitForTimeout(800);
await shot('s06_colores', { parts: '#partsList', view: '.viewport-wrap' });
// 3 · presupuesto
await page.click('#btnQuote');
await page.waitForTimeout(700);
await shot('s07_presupuesto', { btn: '#btnQuote', panel: '#quotePanel', copy: '#qCopy' });
await page.click('#quoteClose');
await page.waitForTimeout(300);
// 4 · cortar: a la selección (la copa), con los anclajes automáticos
await (await partRow('Copa')).click();
await page.waitForTimeout(300);
await page.keyboard.press('x');
await page.waitForTimeout(900);
await page.selectOption('#connType', 'dowel'); // pasadores (los más claros de ver)
await page.waitForTimeout(900);
// «Mejor sitio»: baja el corte unos milímetros hasta donde caben los pasadores
await jsClick(await page.$('#btnSplitBetter'));
await page.waitForTimeout(3500);
await shot('s08_cortar', { tool: '[data-tool="split"]', info: '#splitInfo', apply: '#btnSplitApply', view: '.viewport-wrap' });
await page.click('#btnSplitApply');
await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 60000 });
await page.waitForTimeout(600);
await page.click('#btnPiecesExplode');
await page.waitForTimeout(1600);
await page.evaluate(() => window.FS.V.fitView('iso', false));
await page.waitForTimeout(500);
await shot('s09_piezas', { pieces: '#piecesBox', explode: '#btnPiecesExplode', view: '.viewport-wrap' });
// vuelve a montar las piezas para el resto
await page.click('#btnPiecesAssemble');
await page.waitForTimeout(1400);
// 5 · texto en relieve en la peana
await page.keyboard.press('Escape');
// por detrás la peana está libre (delante ya lleva «CAMPEÓN 2026»)
await page.evaluate(() => window.FS.V.fitView('back', false));
await page.waitForTimeout(500);
await page.keyboard.press('t');
await page.waitForTimeout(300);
await page.fill('#txtValue', 'MARÍA');
await page.dispatchEvent('#txtValue', 'input');
await page.waitForTimeout(400);
const vbox = await (await page.$('#viewport canvas')).boundingBox();
const tx = vbox.x + vbox.width * 0.5, ty = vbox.y + vbox.height * 0.8;
await page.mouse.move(tx, ty);
await page.waitForTimeout(500);
await shot('s10_texto', { input: '#txtValue', view: '.viewport-wrap', click: [Math.round(tx), Math.round(ty)] }, { hover: true });
await page.mouse.click(tx, ty);
await page.waitForTimeout(700);
// color dorado para el texto nuevo
await page.fill('#colorSearch', 'dorado');
await page.waitForTimeout(700);
await jsClick(await pickSwatch(/Silk[^\n]*\n\s*Dorado/i));
await page.waitForTimeout(500);
await page.fill('#colorSearch', '');
await page.evaluate(() => window.FS.ST.select([]));
await page.waitForTimeout(600);
await shot('s11_nombre', { view: '.viewport-wrap', click: [Math.round(tx), Math.round(ty)] });
// 6 · Bambu Studio
await page.keyboard.press('Escape');
await page.evaluate(() => window.FS.V.fitView('iso', false));
await page.waitForTimeout(400);
await page.click('[data-dd="exportMenu"]');
await page.waitForTimeout(300);
await shot('s12_exportar', { menu: '[data-dd="exportMenu"]', bambu: '[data-export="openbambu"]', mf: '[data-export="3mf"]' });
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="3mf"]')]);
await dl.path();
await page.waitForSelector('#slotModal:not([hidden])');
await page.waitForTimeout(500);
await shot('s13_ranuras', { list: '#slotList', modal: '#slotModal .modal-card' });
fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ w: 1600, h: 1000, shots }, null, 1));
console.log('capturas en', OUT);
await browser.close();
