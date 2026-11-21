// Renderiza reels (MP4 con música) y posts (PNG) fotograma a fotograma con Chromium + ffmpeg.
//   node render.mjs                       -> todo
//   node render.mjs reel-marca            -> solo ese reel
//   node render.mjs reel-navidad --preview 1,5,9   -> fotogramas sueltos en out/preview/
//   node render.mjs posts                 -> todos los posts e historias
//   node render.mjs reel-cine --solo-audio -> vuelve a mezclar solo la banda sonora (soundtracks.mjs)
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
const REELS = ['reel-marca', 'reel-navidad', 'reel-ultimo-dia', 'reel-cine', 'reel-viral', 'reel-top3'];
const { POSTS } = await import('./posts-list.mjs');
const { SOUNDTRACKS } = await import('./soundtracks.mjs');
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
  mux(name, silent, D);
  fs.unlinkSync(silent);
  console.log(`\r${name}: listo → out/${name}.mp4 (${((Date.now() - t0) / 1000).toFixed(0)} s)        `);
  await page.close();
}

// Mezcla la banda sonora real (soundtracks.mjs) y la une al vídeo: música + efectos, normalizado
// para redes (-14 LUFS, pico -1,5 dBTP), AAC 320k.
function mux(name, video, D) {
  const st = SOUNDTRACKS[name];
  if (!st) throw new Error(`No hay banda sonora para ${name} en soundtracks.mjs`);
  const items = [...st.m, ...st.s];
  const args = ['-y', '-loglevel', 'error', '-i', video];
  const chains = [];
  items.forEach((it, i) => {
    args.push('-i', path.join(ROOT, it.f));
    const from = it.from || 0, dur = it.dur ?? 30, at = Math.max(0, it.at), ms = Math.round(at * 1000);
    let c = `[${i + 1}:a]atrim=start=${from}:duration=${dur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=${it.gain ?? 1}`;
    if (it.fin) c += `,afade=t=in:st=0:d=${it.fin}`;
    if (it.fout) c += `,afade=t=out:st=${Math.max(0, dur - it.fout)}:d=${it.fout}`;
    c += `,adelay=${ms}|${ms}[a${i}]`;
    chains.push(c);
  });
  const mix = `${items.map((_, i) => `[a${i}]`).join('')}amix=inputs=${items.length}:normalize=0:dropout_transition=0,atrim=duration=${D},alimiter=limit=0.9,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]`;
  const tmp = path.join(OUT, `${name}-mix.mp4`);
  const r = spawnSync('ffmpeg', [...args, '-filter_complex', [...chains, mix].join(';'), '-map', '0:v', '-map', '[out]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-t', String(D), '-movflags', '+faststart', tmp], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg falló al mezclar el audio');
  fs.renameSync(tmp, path.join(OUT, `${name}.mp4`));
}

// Solo vuelve a mezclar el audio de un reel ya renderizado (sin regrabar la imagen)
async function remix(name) {
  const mp4 = path.join(OUT, `${name}.mp4`);
  const D = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).stdout.toString().trim();
  const vid = path.join(OUT, `${name}-video.mp4`);
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-map', '0:v', '-c', 'copy', vid]);
  mux(name, vid, Math.round(D * 100) / 100);
  fs.unlinkSync(vid);
  console.log(`${name}: audio nuevo → out/${name}.mp4`);
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
    else if (args.includes('--solo-audio')) await remix(t);
    else await reel(t);
  }
} finally { await browser.close(); server.close(); }
