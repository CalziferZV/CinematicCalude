// Vídeo 360°: la pieza da una vuelta completa con los colores elegidos, para enviarla por
// WhatsApp o redes. Se graba con MediaRecorder: MP4 (H.264) si el navegador lo permite
// (Chrome y Edge recientes) y, si no, WebM.
import { S, BLANK } from './state.js';
import { createTurntable } from './viewer.js';
import { settings as quoteSettings } from './quote.js';

const TYPES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1.4d0028',
  'video/mp4;codecs=avc1.42E028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];
export function videoSupport() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const mime = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  return mime ? { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

function drawCaption(ctx, w, h) {
  const parts = S.parts.filter((p) => p.visible);
  const fils = [];
  for (const p of parts) {
    const f = p.filament || BLANK;
    if (!fils.some((x) => x.f.name === f.name && x.f.hex === f.hex)) fils.push({ f, part: p.name });
  }
  const u = Math.min(w, h) / 1080;
  const barH = Math.round(150 * u);
  const g = ctx.createLinearGradient(0, h - barH * 1.5, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.86)');
  g.addColorStop(1, 'rgba(255,255,255,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h - barH * 1.5, w, barH * 1.5);
  const x0 = Math.round(44 * u);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1d2129';
  ctx.font = `800 ${Math.round(40 * u)}px system-ui, sans-serif`;
  ctx.fillText((S.modelName || 'Tu pieza').replace(/\.[^.]+$/, ''), x0, h - barH + Math.round(38 * u), w - x0 * 2);
  // colores en una fila
  let x = x0;
  const y = h - Math.round(52 * u);
  const sw = Math.round(30 * u);
  ctx.font = `600 ${Math.round(22 * u)}px system-ui, sans-serif`;
  for (const { f } of fils.slice(0, 6)) {
    const label = f.blank ? 'Por elegir' : f.name;
    const tw = ctx.measureText(label).width;
    if (x + sw + 10 * u + tw > w - x0) break;
    ctx.fillStyle = f.blank ? '#ECECEC' : (f.hexes && f.hexes[0]) || f.hex;
    ctx.beginPath();
    ctx.roundRect(x, y - sw + 6 * u, sw, sw, 8 * u);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    ctx.fillStyle = '#3b404a';
    ctx.fillText(label, x + sw + 10 * u, y);
    x += sw + 10 * u + tw + 26 * u;
  }
  const shop = quoteSettings().shopName;
  if (shop) {
    ctx.font = `700 ${Math.round(24 * u)}px system-ui, sans-serif`;
    const tw = ctx.measureText(shop).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(w - tw - 60 * u, 30 * u, tw + 32 * u, 46 * u, 12 * u);
    ctx.fill();
    ctx.fillStyle = '#1d2129';
    ctx.fillText(shop, w - tw - 44 * u, 61 * u);
  }
}

// Graba la vuelta y devuelve { blob, ext } (o null si se cancela)
export async function recordTurntable({ width = 1080, height = 1080, seconds = 8, caption = true, onProgress, signal } = {}) {
  const sup = videoSupport();
  if (!sup) throw new Error('Este navegador no puede grabar vídeo. Usa Chrome o Edge.');
  const tt = createTurntable({ width, height });
  if (!tt) throw new Error('No hay modelo');
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  const fps = 30;
  const frames = Math.max(30, Math.round(seconds * fps));
  const stream = out.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const bps = Math.round(width * height * fps * 0.14); // ≈ 8-9 Mbit/s en 1080p
  const rec = new MediaRecorder(stream, { mimeType: sup.mime, videoBitsPerSecond: bps });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => (rec.onstop = res));
  try {
    // primer fotograma antes de empezar, para que el vídeo no arranque en negro
    ctx.drawImage(tt.render(0), 0, 0);
    if (caption) drawCaption(ctx, width, height);
    rec.start(250);
    let next = performance.now();
    for (let i = 0; i <= frames; i++) {
      if (signal && signal.aborted) break;
      ctx.drawImage(tt.render(i / frames), 0, 0);
      if (caption) drawCaption(ctx, width, height);
      if (track.requestFrame) track.requestFrame();
      if (onProgress) onProgress(i / frames);
      next += 1000 / fps;
      const wait = next - performance.now();
      await new Promise((r) => setTimeout(r, Math.max(0, wait)));
      if (wait < -400) next = performance.now(); // el ordenador va lento: seguimos sin acumular retraso
    }
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    track.stop();
    tt.dispose();
  }
  if (signal && signal.aborted) return null;
  return { blob: new Blob(chunks, { type: sup.mime.split(';')[0] }), ext: sup.ext };
}
