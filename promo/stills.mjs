// Imágenes fijas del trofeo para la web (se ven mientras carga el 3D o si el navegador no tiene WebGL)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const shots = [
  ['site/assets/trofeo.png', { w: 1600, h: 1000, cam: { az: -38, el: 15, dist: 1.0, shiftY: 0.03, turn: -0.5 } }],
  ['site/assets/despiece.png', { w: 960, h: 1200, explode: 1, cam: { az: -34, el: 18, dist: 1.67, tz: 78, shiftY: 0.02, turn: 0.4 } }],
];
for (const [file, opt] of shots) {
  const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h } });
  await page.goto(`http://127.0.0.1:${server.address().port}/promo/stills.html`);
  await page.waitForFunction(() => window.ready);
  const url = await page.evaluate((o) => window.still(o), opt);
  fs.writeFileSync(path.join(ROOT, file), Buffer.from(url.split(',')[1], 'base64'));
  console.log(file, (fs.statSync(path.join(ROOT, file)).size / 1024).toFixed(0), 'KB');
  await page.close();
}
await browser.close();
server.close();
