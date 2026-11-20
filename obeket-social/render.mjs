// Renderiza reels (MP4 con música) y posts (PNG) fotograma a fotograma con Chromium + ffmpeg.
//   node render.mjs                       -> todo
//   node render.mjs reel-marca            -> solo ese reel
//   node render.mjs reel-navidad --preview 1,5,9   -> fotogramas sueltos en out/preview/
//   node render.mjs posts                 -> todos los posts e historias
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const FPS = +(opt('--fps') || 30);
const REELS = ['reel-marca', 'reel-navidad', 'reel-ultimo-dia'];
const { POSTS } = await import('./posts-list.mjs');
const targets = pos.length ? pos : [...REELS, 'posts'];
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const browser = await playwright.chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(query, w = 1080, h = 1920) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('consola:', m.text()); });
  page.on('pageerror', (e) => console.log('error en la página:', e.message));
  await page.goto(`http://127.0.0.1:${port}/comp.html?${query}`);
  await page.waitForFunction(() => window.ready || window.failed, null, { timeout: 180000 });
  const failed = await page.evaluate(() => window.failed);
  if (failed) throw new Error(failed);
  return page;
}

async function reel(name) {
  const page = await open(`c=${name}`);
  const D = await page.evaluate(() => window.DURATION);
  const prev = opt('--preview');
  if (prev) {
    const dir = path.join(OUT, 'preview'); fs.mkdirSync(dir, { recursive: true });
    for (const t of prev.split(',').map(Number)) {
      await page.evaluate((t) => window.renderAt(t), t);
      await page.screenshot({ path: path.join(dir, `${name}-${String(t).replace('.', '_')}.jpg`), type: 'jpeg', quality: 85 });
    }
    console.log(`vista previa de ${name} en out/preview/`);
    await page.close(); return;
  }
  const wav = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(wav, Buffer.from(await page.evaluate(() => window.music()), 'base64'));
  const silent = path.join(OUT, `${name}-sin-audio.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(D * FPS), t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stdout.write(`\r${name}: ${f}/${frames} fotogramas (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  const mp4 = path.join(OUT, `${name}.mp4`);
  // música normalizada para redes (-14 LUFS, pico -1,5 dBTP), AAC 320k
  const mux = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (mux.status !== 0) throw new Error('ffmpeg falló al unir el audio');
  fs.unlinkSync(silent); fs.unlinkSync(wav);
  console.log(`\r${name}: listo → out/${name}.mp4 (${((Date.now() - t0) / 1000).toFixed(0)} s)        `);
  await page.close();
}

async function posts(only) {
  const dir = path.join(OUT, 'posts'); fs.mkdirSync(dir, { recursive: true });
  for (const p of POSTS) {
    if (only && !only.includes(p.id)) continue;
    const page = await open(`c=posts&id=${p.id}`, p.w, p.h);
    await page.screenshot({ path: path.join(dir, `${p.id}.png`), type: 'png' });
    await page.close();
    console.log(`post ${p.id} → out/posts/${p.id}.png`);
  }
}

try {
  for (const t of targets) {
    if (t === 'posts') await posts(opt('--only')?.split(','));
    else await reel(t);
  }
} finally { await browser.close(); server.close(); }
