// Vídeo explicativo vertical (1080 × 1920, 35 s): qué es Filament Studio y sus funciones, con la app
// real. Las capturas salen de promo/capture-app.mjs (con la posición de cada botón) y aquí se animan
// como una grabación de pantalla: cámara que se acerca a lo importante, cursor y clics.
import { clamp, EASE, createTimeline, wavBase64 } from './timeline.js';

export const DURATION = 35;
const $ = (id) => document.getElementById(id);
const { tw, show, apply } = createTimeline();
const W = 1040, H = 650, UIW = 1600, UIH = 1000, BASE = W / UIW; // ventana de la app en el vídeo
let SH = null; // capturas y marcas

// ---------------------------------------------------------------- pasos
const STEPS = [
  { a: 5.2, b: 9.6, title: 'Abre tu pieza.', sub: 'STL, 3MF u OBJ. Detecta sola sus partes.' },
  { a: 9.6, b: 14.6, title: 'Colores reales.', sub: '6.663 filamentos de 87 marcas.' },
  { a: 14.6, b: 18.8, title: 'Precio al momento.', sub: 'Peso, tiempo, purga y tu margen.' },
  { a: 18.8, b: 23.4, title: 'Córtala.', sub: 'Anclajes automáticos para unir las piezas.' },
  { a: 23.4, b: 27.4, title: 'Texto 3D.', sub: 'Escribe su nombre y haz clic en la pieza.' },
  { a: 27.4, b: 31.2, title: 'A Bambu Studio.', sub: 'El 3MF lleva cada color en su sitio.' },
];
const stepAt = (t) => { let k = -1; STEPS.forEach((s, i) => { if (t >= s.a - 0.15) k = i; }); return k; };

// ---------------------------------------------------------------- cámara, capturas y cursor
const camMoves = [], curMoves = [], clicks = [], shotsAt = [];
const mark = (shot, m) => SH.shots[shot].marks[m];
const ctr = (r) => ({ u: r.x + r.w / 2, v: r.y + r.h / 2 });
const union = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const FULL = { cx: UIW / 2, cy: UIH / 2, z: 1 };
function focus(r, pad = 1.2, zmax = 2.4) {
  const s = Math.min(W / (pad * r.w), H / (pad * r.h));
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, z: Math.max(1, Math.min(zmax, s / BASE)) };
}
const cam = (t0, dur, to) => camMoves.push({ t0, dur, to });
const cur = (t0, dur, p) => curMoves.push({ t0, dur, to: p });
const click = (t) => clicks.push(t);
const shotAt = (t, name) => shotsAt.push({ t, name });
function follow(moves, t, start, keys) {
  let st = { ...start };
  for (const m of moves) {
    if (t <= m.t0) break;
    const k = EASE.io(clamp((t - m.t0) / m.dur));
    const nx = {};
    for (const key of keys) nx[key] = st[key] + (m.to[key] - st[key]) * k;
    st = nx;
    if (k < 1) break;
  }
  return st;
}

function build() {
  // intro: la pregunta
  tw('i_logo', 0.1, 0.4, { o: 0, s: 0.8 }, { o: 1, s: 1 }, 'outQ');
  tw('i_ring', 0.15, 0.7, { dash: 264 }, { dash: 0 }, 'io');
  tw('i_fill', 0.8, 0.3, { o: 0 }, { o: 1 }, 'out');
  tw('i_dot', 0.9, 0.45, { sc: 0 }, { sc: 1 }, 'back');
  tw('i_logo', 2.15, 0.25, { o: 1, s: 1 }, { o: 0, s: 0.9 }, 'in');
  show('i_q1', 0.35, 2.2, { y: 30, dur: 0.5, outDur: 0.22 });
  show('i_q2', 0.6, 2.25, { y: 30, s: 1.04, dur: 0.55, outDur: 0.22 });

  // la respuesta y la app
  show('a_t', 2.45, 4.95, { y: 40, blur: 12, dur: 0.6, outDur: 0.25 });
  tw('win', 2.7, 0.8, { o: 0, y: 200, s: 0.94 }, { o: 1, y: 0, s: 1 }, 'outQ');
  tw('win', 31.0, 0.5, { o: 1, y: 0, s: 1 }, { o: 0, y: 140, s: 0.96 }, 'in');
  tw('dots', 5.2, 0.4, { o: 0 }, { o: 1 });
  tw('dots', 30.95, 0.3, { o: 1 }, { o: 0 });
  shotAt(0, 's06_colores');
  cam(2.7, 2.2, { ...focus(grow(mark('s06_colores', 'view'), -120), 1.0, 1.6) });

  // rótulos de cada paso (el texto cambia mientras están ocultos)
  for (const s of STEPS) {
    show('st_badge', s.a, s.b - 0.3, { y: 0, s: 0.6, blur: 0, dur: 0.4, outDur: 0.22, outY: 0 });
    show('st_title', s.a + 0.06, s.b - 0.28, { y: 26, dur: 0.45, outDur: 0.22 });
    show('st_sub', s.a + 0.18, s.b - 0.26, { y: 20, dur: 0.45, outDur: 0.22 });
  }

  // cursor visible solo cuando trabaja
  const vis = [[5.6, 7.45], [9.7, 11.8], [14.7, 17.6], [18.9, 21.4], [24.35, 25.45], [27.6, 29.45]];
  vis.forEach(([a, b]) => { tw('cursor', a, 0.2, { o: 0 }, { o: 1 }); tw('cursor', b, 0.2, { o: 1 }, { o: 0 }); });

  // 1 · abrir
  shotAt(5.2, 's01_vacio');
  cam(5.0, 0.6, FULL);
  cur(5.55, 0.01, ctr(mark('s01_vacio', 'card')));
  cur(5.7, 0.6, ctr(mark('s01_vacio', 'samples')));
  cam(5.75, 0.6, focus(union(mark('s02_ejemplos', 'menu'), mark('s01_vacio', 'samples')), 1.25, 2.2));
  click(6.35); shotAt(6.45, 's02_ejemplos');
  cur(6.6, 0.4, ctr(mark('s02_ejemplos', 'trofeo')));
  click(7.05); shotAt(7.15, 's03_partes');
  cam(7.3, 0.9, focus(grow(mark('s03_partes', 'parts'), 6), 1.12, 2.3));
  // 2 · colores reales
  cam(9.4, 0.6, focus(mark('s03_partes', 'parts'), 1.15, 2.0));
  cur(9.75, 0.45, ctr(mark('s03_partes', 'copa')));
  click(10.25); shotAt(10.35, 's04_buscar');
  cam(10.5, 0.7, focus(union(mark('s04_buscar', 'search'), grow(mark('s04_buscar', 'swatch'), 40)), 1.2, 2.2));
  cur(10.8, 0.6, ctr(mark('s04_buscar', 'swatch')));
  click(11.45); shotAt(11.55, 's05_copa');
  cam(11.8, 0.9, focus(grow(mark('s05_copa', 'view'), -120), 1.0, 1.6));
  shotAt(12.9, 's06_colores');
  // 3 · presupuesto
  cam(14.55, 0.6, FULL);
  cur(14.75, 0.55, ctr(mark('s07_presupuesto', 'btn')));
  click(15.35); shotAt(15.45, 's07_presupuesto');
  cam(15.6, 0.8, focus(mark('s07_presupuesto', 'panel'), 1.08, 2.2));
  cur(16.4, 0.6, ctr(mark('s07_presupuesto', 'copy')));
  click(17.05);
  // 4 · cortar
  shotAt(18.8, 's06_colores');
  cam(18.75, 0.6, FULL);
  cur(18.95, 0.4, ctr(mark('s08_cortar', 'tool')));
  click(19.4); shotAt(19.5, 's08_cortar');
  cam(19.6, 0.7, focus({ x: 590, y: 100, w: 400, h: 590 }, 1.0, 1.8));
  cam(20.35, 0.6, focus(grow(mark('s08_cortar', 'apply'), 110), 1.15, 2.0));
  cur(20.4, 0.55, ctr(mark('s08_cortar', 'apply')));
  click(21.05); shotAt(21.15, 's09_piezas');
  cam(21.3, 0.9, focus({ x: 590, y: 60, w: 400, h: 640 }, 1.0, 1.8));
  // 5 · texto 3D
  shotAt(23.45, 's10_texto');
  cam(23.4, 0.7, focus(grow(mark('s10_texto', 'input'), 30), 1.3, 2.4));
  const ck = mark('s10_texto', 'click');
  cam(24.3, 0.8, { cx: ck.x, cy: ck.y - 80, z: 1.9 });
  cur(24.35, 0.01, { u: ck.x - 160, v: ck.y - 70 });
  cur(24.45, 0.5, { u: ck.x, v: ck.y });
  click(25.0); shotAt(25.1, 's11_nombre');
  cam(25.6, 1.4, { cx: ck.x, cy: ck.y - 140, z: 1.6 });
  // 6 · Bambu Studio
  cam(27.35, 0.6, FULL);
  cur(27.65, 0.45, ctr(mark('s12_exportar', 'menu')));
  click(28.15); shotAt(28.25, 's12_exportar');
  cam(28.3, 0.6, focus(union(grow(mark('s12_exportar', 'bambu'), 12), grow(mark('s12_exportar', 'mf'), 12)), 1.5, 2.2));
  cur(28.6, 0.4, ctr(mark('s12_exportar', 'mf')));
  click(29.05); shotAt(29.15, 's13_ranuras');
  cam(29.3, 0.7, focus(mark('s13_ranuras', 'modal'), 1.06, 2.0));

  // cierre
  tw('o_logo', 31.4, 0.4, { o: 0, s: 0.8 }, { o: 1, s: 1 }, 'outQ');
  tw('o_ring', 31.45, 0.75, { dash: 264 }, { dash: 0 }, 'io');
  tw('o_fill', 32.15, 0.3, { o: 0 }, { o: 1 }, 'out');
  tw('o_dot', 32.25, 0.45, { sc: 0 }, { sc: 1 }, 'back');
  show('o_t', 31.6, null, { y: 30, s: 1.05, blur: 12, dur: 0.5 });
  show('o_s', 32.0, null, { y: 20, dur: 0.45 });
  show('o_f1', 32.3, null, { y: 24, dur: 0.45 });
  show('o_f2', 32.5, null, { y: 24, dur: 0.45 });
  tw('o_soon', 32.9, 0.55, { o: 0, s: 0.86, blur: 8 }, { o: 1, s: 1, blur: 0 }, 'back');
  show('o_by', 33.4, null, { y: 16, dur: 0.45 });
}

// ---------------------------------------------------------------- lo que se calcula en cada fotograma
const imgs = new Map();
function dynamic(t) {
  // rótulo del paso actual
  const k = stepAt(t);
  if (k >= 0) {
    $('st_badge').textContent = String(k + 1);
    $('st_title').textContent = STEPS[k].title;
    $('st_sub').textContent = STEPS[k].sub;
  }
  // puntos de progreso
  [...$('dots').children].forEach((d, i) => {
    const on = clamp((t - (STEPS[i].a - 0.1)) / 0.35) * (1 - clamp((t - (STEPS[i].b - 0.1)) / 0.35));
    d.style.width = `${(14 + 34 * EASE.io(on)).toFixed(1)}px`;
    d.style.background = on > 0.5 ? '#ff6a13' : t > STEPS[i].b ? '#a1a1a6' : '#d2d2d7';
  });
  // capturas: la actual entra fundiéndose sobre la anterior
  let ci = 0;
  shotsAt.forEach((s, i) => { if (t >= s.t) ci = i; });
  const curShot = shotsAt[ci], prev = shotsAt[ci - 1];
  for (const [name, img] of imgs) {
    let o = 0, z = 0;
    if (name === curShot.name) { o = ci === 0 ? 1 : EASE.out(clamp((t - curShot.t) / 0.25)); z = 2; }
    else if (prev && name === prev.name) { o = 1; z = 1; }
    img.style.opacity = o;
    img.style.zIndex = z;
  }
  // cámara
  const c = follow(camMoves, t, FULL, ['cx', 'cy', 'z']);
  const s = BASE * c.z, hw = W / (2 * s), hh = H / (2 * s);
  const cx = Math.min(UIW - hw, Math.max(hw, c.cx)), cy = Math.min(UIH - hh, Math.max(hh, c.cy));
  const tx = W / 2 - cx * s, ty = H / 2 - cy * s;
  const tf = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})`;
  for (const img of imgs.values()) img.style.transform = tf;
  // cursor y clic
  const p = follow(curMoves, t, { u: 800, v: 500 }, ['u', 'v']);
  let press = 1, ring = null;
  for (const ct of clicks) {
    const d = t - ct;
    if (d >= -0.06 && d < 0.14) press = 0.86;
    if (d >= 0 && d < 0.45) ring = d / 0.45;
  }
  const x = p.u * s + tx, y = p.v * s + ty;
  $('cursor').style.left = `${x.toFixed(1)}px`;
  $('cursor').style.top = `${y.toFixed(1)}px`;
  $('cursor').style.transform = press !== 1 ? `scale(${press})` : '';
  const rp = $('ripple');
  rp.style.left = `${x.toFixed(1)}px`;
  rp.style.top = `${y.toFixed(1)}px`;
  rp.style.opacity = ring == null ? 0 : (1 - ring).toFixed(3);
  rp.style.transform = ring == null ? 'scale(0.3)' : `scale(${(0.3 + 0.9 * EASE.out(ring)).toFixed(3)})`;
}

// ---------------------------------------------------------------- arranque
window.renderAt = (t) => { apply(t); dynamic(t); return true; };
async function start() {
  SH = await (await fetch('assets/explica/shots.json')).json();
  const layer = $('cursorLayer');
  for (const [name, s] of Object.entries(SH.shots)) {
    const img = new Image();
    img.src = s.file;
    img.alt = '';
    $('win').insertBefore(img, layer);
    imgs.set(name, img);
  }
  layer.style.cssText = 'position:absolute;inset:0;z-index:5';
  build();
  await Promise.all([...imgs.values()].map((im) => im.decode()));
  await document.fonts.ready;
  window.renderAt(0);
  window.ready = true;
}
start().catch((e) => { console.error(e); window.failed = String(e); });

// ---------------------------------------------------------------- música: ligera, 100 BPM, Do mayor
window.makeSoundtrack = async (D = DURATION) => {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(D * sr), sr);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 0.4);
  master.gain.setValueAtTime(0.9, D - 1.6);
  master.gain.linearRampToValueAtTime(0, D);
  const rev = ctx.createConvolver();
  const len = sr * 2.6, ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
  rev.buffer = ir;
  const revG = ctx.createGain(); revG.gain.value = 0.3;
  rev.connect(revG).connect(master);
  const noise = ctx.createBuffer(1, sr * 2, sr);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const beat = 0.6, bar = beat * 4;
  const CH = [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]]; // Do · Sol · Lam · Fa
  const chordAt = (t) => Math.floor(t / bar) % 4;
  const blip = (t, f0, f1, dur, vol, type = 'sine', wet = false) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); if (wet) g.connect(rev);
    o.start(t); o.stop(t + dur + 0.02);
  };
  const burst = (t, { type = 'highpass', f = 8000, q = 0.7, dur = 0.05, vol = 0.05, wet = false, f1 = null } = {}) => {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g); g.connect(master); if (wet) g.connect(rev);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  };
  const whoosh = (ts, len = 0.4, vol = 0.08) => {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(400, ts - len); bp.frequency.exponentialRampToValueAtTime(4500, ts);
    g.gain.setValueAtTime(0.0001, ts - len); g.gain.exponentialRampToValueAtTime(vol, ts - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.12);
    s.connect(bp).connect(g); g.connect(master); g.connect(rev);
    s.start(ts - len); s.stop(ts + 0.15);
  };
  // acordes cálidos
  for (let t = 0; t < D; t += bar) {
    const chord = CH[chordAt(t)];
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0, t);
    pad.gain.linearRampToValueAtTime(0.02, t + 0.4);
    pad.gain.setValueAtTime(0.02, t + bar - 0.1);
    pad.gain.linearRampToValueAtTime(0, t + bar + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 1300;
    for (const m of chord) for (const det of [-7, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + bar + 0.5);
    }
    lp.connect(pad); pad.connect(master); pad.connect(rev);
  }
  // bajo suave y "marimba" en corcheas
  for (let t = 0, i = 0; t < D - 1.2; t += beat / 2, i++) {
    const chord = CH[chordAt(t)];
    if (t >= 2.4 && i % 2 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = mtof(chord[0] - 12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.9);
      o.connect(g).connect(master); o.start(t); o.stop(t + beat);
    }
    if (t >= 2.4) {
      const m = chord[[1, 2, 3, 2, 1, 3, 2, 3][i % 8]] + 12;
      blip(t, mtof(m), mtof(m), 0.32, i % 2 ? 0.035 : 0.05, 'sine', true);
      blip(t, mtof(m) * 4, mtof(m) * 4, 0.06, 0.008, 'triangle');
    }
  }
  // ritmo ligero durante los pasos
  for (let t = 5.2; t < 31.2; t += beat) {
    const bi = Math.round((t - 5.2) / beat);
    if (bi % 2 === 0) blip(t, 120, 48, 0.25, 0.32);
    if (t >= 9.6 && bi % 2 === 1) for (const dt of [0, 0.012]) burst(t + dt, { type: 'bandpass', f: 1800, q: 0.9, dur: 0.12, vol: 0.07, wet: true });
    for (const dt of [beat / 2]) burst(t + dt, { f: 9000, dur: 0.04, vol: 0.035 });
  }
  // clics del cursor
  for (const ct of clicks) { burst(ct, { f: 3000, dur: 0.018, vol: 0.09 }); blip(ct, 1900, 1200, 0.035, 0.05); }
  // transiciones y detalles
  for (const ts of [2.45, ...STEPS.map((s) => s.a), 31.2]) whoosh(ts);
  for (const [tt, m] of [[0.9, 76], [1.05, 83], [1.2, 88]]) blip(tt, mtof(m), mtof(m), 1.8, 0.06, 'sine', true);
  for (const [f, v] of [[1318.5, 0.08], [1975.5, 0.05]]) blip(15.55, f, f, 0.8, v, 'sine', true);
  blip(25.12, 900, 300, 0.08, 0.08);
  for (const [tt, m] of [[32.25, 76], [32.4, 83], [32.55, 88]]) blip(tt, mtof(m), mtof(m), 2.0, 0.07, 'sine', true);
  for (const [f, v] of [[1760, 0.05], [2637, 0.035]]) blip(32.92, f, f, 1.1, v, 'sine', true);
  return wavBase64(await ctx.startRendering());
};
