// Graba el vídeo de presentación fotograma a fotograma (sin saltos ni tirones) y le pone la banda
// sonora sintetizada. Necesita Playwright (Chromium) y ffmpeg.
//
//   node promo/render.mjs                  -> promo/out/filament-studio.mp4 (1080p, 30 fps)
//   node promo/render.mjs --preview        -> promo/out/preview/*.png (fotogramas clave para revisar)
//   node promo/render.mjs --from 35 --to 47 -> solo ese tramo (para probar una escena)
//   node promo/render.mjs --comp reel      -> promo/out/filament-studio-reel.mp4 (vertical 1080×1920 para redes)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'promo', 'out');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 ? +args[i + 1] : d; };
const str = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const FPS = val('--fps', 30);
// composiciones: la presentación (16:9) y el reel vertical para redes (9:16)
const COMPS = {
  video: { page: 'video.html', module: './video.js', w: 1920, h: 1080, name: 'filament-studio', wav: 'banda-sonora.wav', preview: 'preview',
    at: [1.2, 2.6, 4.0, 7.2, 9.4, 13.0, 15.0, 17.5, 22.5, 25.5, 30.5, 33.0, 36.8, 38.2, 41.0, 44.0, 49.0, 51.5, 56.0, 59.0, 63.4, 65.5, 70.0, 74.5, 76.5] },
  reel: { page: 'reel.html', module: './reel.js', w: 1080, h: 1920, name: 'filament-studio-reel', wav: 'banda-sonora-reel.wav', preview: 'preview-reel', lufs: -14,
    at: [0.3, 1.4, 2.6, 3.8, 4.7, 5.6, 6.6, 7.6, 8.6, 9.5, 10.7, 11.4, 12.6, 13.5, 14.6, 15.8, 16.5, 17.9, 18.6, 19.5, 20.6, 21.5, 23.5] },
};
const C = COMPS[str('--comp', 'video')];
if (!C) { console.error('Composición desconocida. Usa --comp video o --comp reel'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// servidor de archivos del proyecto (three.js sale de node_modules)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
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
const browser = await playwright.chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: C.w, height: C.h }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('consola:', m.text()); });
page.on('pageerror', (e) => console.log('error en la página:', e.message));
await page.goto(`http://127.0.0.1:${port}/promo/${C.page}`);
await page.waitForFunction(() => window.ready || window.failed, null, { timeout: 120000 });
const failed = await page.evaluate(() => window.failed);
if (failed) { console.error('No se pudo preparar la composición:', failed); process.exit(1); }
const DURATION = await page.evaluate(async (m) => (await import(m)).DURATION, C.module);

if (flag('--preview')) {
  const dir = path.join(OUT, C.preview);
  fs.mkdirSync(dir, { recursive: true });
  const times = args.includes('--at') ? args[args.indexOf('--at') + 1].split(',').map(Number) : C.at;
  for (const t of times) {
    await page.evaluate((tt) => window.renderAt(tt), t);
    await page.screenshot({ path: path.join(dir, `t${String(t.toFixed(1)).padStart(5, '0')}.png`) });
    process.stdout.write(`${t} `);
  }
  console.log(`\nfotogramas en ${dir}`);
  await browser.close();
  server.close();
  process.exit(0);
}

const from = val('--from', 0), to = val('--to', DURATION);
const wav = path.join(OUT, C.wav);
// volumen de redes: normalización en dos pasadas (mide y aplica una ganancia fija, sin "bombeo")
function normalizeLoudness(src, dst, I = -14, TP = -1.5) {
  const pass = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', `loudnorm=I=${I}:TP=${TP}:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = JSON.parse(pass.stderr.slice(pass.stderr.lastIndexOf('{')));
  const af = `loudnorm=I=${I}:TP=${TP}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '48000', dst]);
  return { from: +m.input_i, to: I };
}
if (!flag('--no-audio')) {
  const b64 = await page.evaluate((d) => window.makeSoundtrack(d), DURATION);
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  if (C.lufs) {
    const tmp = wav.replace(/\.wav$/, '.tmp.wav');
    fs.renameSync(wav, tmp);
    const r = normalizeLoudness(tmp, wav, C.lufs);
    fs.unlinkSync(tmp);
    console.log(`volumen: ${r.from} → ${r.to} LUFS`);
  }
  console.log('banda sonora:', (fs.statSync(wav).size / 1048576).toFixed(1), 'MB');
}
const outFile = path.join(OUT, from === 0 && to === DURATION ? `${C.name}.mp4` : `${C.name}-tramo-${from}-${to}.mp4`);
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  ...(flag('--no-audio') ? [] : ['-ss', String(from), '-t', String(to - from), '-i', wav]),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  ...(flag('--no-audio') ? [] : ['-c:a', 'aac', '-b:a', '192k']),
  '-movflags', '+faststart', '-shortest', outFile,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = (buf) => new Promise((r) => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', r); else r(); });
const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
const t0 = Date.now();
const grab = async () => {
  for (let tries = 0; ; tries++) {
    try { return await page.screenshot({ type: 'jpeg', quality: 94, timeout: 120000 }); }
    catch (e) { if (tries >= 2) throw e; console.log('captura lenta, reintento…'); }
  }
};
for (let i = n0; i < n1; i++) {
  await page.evaluate((tt) => window.renderAt(tt), i / FPS);
  await write(await grab());
  if ((i - n0) % (FPS * 5) === 0) {
    const done = (i - n0) / (n1 - n0);
    process.stdout.write(`${(i / FPS).toFixed(0)} s (${Math.round(done * 100)} %, ${Math.round((Date.now() - t0) / 1000)} s)\n`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
console.log('vídeo:', outFile, (fs.statSync(outFile).size / 1048576).toFixed(1), 'MB en', Math.round((Date.now() - t0) / 1000), 's');
await browser.close();
server.close();
