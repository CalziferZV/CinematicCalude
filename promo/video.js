// Composición del vídeo de presentación: línea de tiempo determinista (renderAt(t) deja la escena
// exactamente como está en el segundo t) para grabarla fotograma a fotograma, y banda sonora
// sintetizada con Web Audio (makeSoundtrack) para que el vídeo no dependa de música con derechos.
import { createProduct, FIL } from './product.js';

export const DURATION = 78;
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const EASE = {
  lin: (k) => k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  outQ: (k) => 1 - Math.pow(1 - k, 5),
  in: (k) => k * k * k,
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};

// ---------------------------------------------------------------- línea de tiempo
const TL = new Map(); // elemento -> tweens ordenados
function tw(el, t0, dur, from, to, ease = 'out') {
  const e = typeof el === 'string' ? $(el) : el;
  if (!TL.has(e)) TL.set(e, []);
  TL.get(e).push({ t0, dur, from, to, ease });
}
// aparece (sube y se enfoca) y desaparece
function show(el, tin, tout, { y = 40, blur = 12, dur = 0.8, outDur = 0.5, s = 1, outY = -30 } = {}) {
  tw(el, tin, dur, { o: 0, y, blur, s }, { o: 1, y: 0, blur: 0, s: 1 }, 'outQ');
  if (tout != null) tw(el, tout, outDur, { o: 1, y: 0, blur: 0 }, { o: 0, y: outY, blur: 8 }, 'in');
}
function bg(id, tin, tout, d = 0.6) {
  tw(id, tin - d / 2, d, { o: 0 }, { o: 1 }, 'io');
  if (tout != null) tw(id, tout - d / 2, d, { o: 1 }, { o: 0 }, 'io');
}
function apply(t) {
  for (const [el, list] of TL) {
    const st = {};
    for (const x of list) {
      const k = clamp((t - x.t0) / x.dur);
      for (const p in x.to) {
        if (t < x.t0) { if (!(p in st)) st[p] = x.from[p]; }
        else st[p] = x.from[p] + (x.to[p] - x.from[p]) * EASE[x.ease](k);
      }
    }
    const o = st.o ?? 1;
    el.style.opacity = o;
    if (el.tagName !== 'CANVAS') el.style.visibility = o < 0.002 ? 'hidden' : 'visible'; // el lienzo WebGL nunca se oculta (evita bloqueos al capturar)
    const tf = [];
    if (st.x || st.y) tf.push(`translate3d(${(st.x || 0).toFixed(2)}px, ${(st.y || 0).toFixed(2)}px, 0)`);
    if (st.rx) tf.push(`perspective(1600px) rotateX(${st.rx.toFixed(3)}deg)`);
    if (st.s != null && st.s !== 1) tf.push(`scale(${st.s.toFixed(4)})`);
    el.style.transform = tf.join(' ');
    el.style.filter = st.blur > 0.05 ? `blur(${st.blur.toFixed(2)}px)` : '';
    if (st.ls != null) el.style.letterSpacing = `${st.ls.toFixed(4)}em`;
    if (st.dash != null) el.setAttribute('stroke-dashoffset', st.dash.toFixed(2));
    if (st.sc != null) el.setAttribute('transform', `scale(${st.sc.toFixed(4)})`);
  }
}

// ---------------------------------------------------------------- escenas
function build() {
  // 1 · intro (0 – 5,5)
  tw('ring', 0.35, 1.3, { dash: 264 }, { dash: 0 }, 'io');
  tw('ringFill', 1.45, 0.45, { o: 0 }, { o: 1 }, 'out');
  tw('dot', 1.55, 0.6, { sc: 0 }, { sc: 1 }, 'back');
  tw('logo', 0.2, 0.6, { o: 0, s: 0.85 }, { o: 1, s: 1 }, 'outQ');
  tw('logo', 4.8, 0.6, { o: 1, s: 1 }, { o: 0, s: 0.9 }, 'in');
  const title = $('title');
  [...'Filament Studio'].forEach((ch, i) => {
    const sp = document.createElement('span');
    sp.textContent = ch === ' ' ? ' ' : ch;
    sp.style.display = 'inline-block';
    title.appendChild(sp);
    tw(sp, 1.9 + i * 0.045, 0.7, { o: 0, y: 40, blur: 10 }, { o: 1, y: 0, blur: 0 }, 'outQ');
  });
  tw(title, 1.9, 1.8, { ls: 0.06 }, { ls: -0.045 }, 'outQ');
  tw(title, 4.8, 0.6, { o: 1, y: 0 }, { o: 0, y: -20 }, 'in');
  show('tagline', 3.0, 4.8, { y: 20 });

  // 2 · frases (5,5 – 11)
  bg('bgWhite', 5.6, 11);
  show('l1', 6.0, 10.4);
  show('l2', 7.0, 10.45);
  show('l3', 8.0, 10.5, { s: 0.94 });

  // 3 · producto (11 – 21)
  bg('bgLight', 11, 21);
  show('p3t', 11.6, 20.4);
  show('p3s', 12.1, 20.45, { y: 24 });
  show('p3c1', 13.0, 20.5, { y: 20, blur: 6 });
  show('p3c2', 14.4, 20.55, { y: 20, blur: 6 });
  show('p3c3', 15.9, 20.6, { y: 20, blur: 6 });
  show('p3b', 16.8, 20.6, { y: 16, blur: 4 });

  // 4 · la app (21 – 28,5)
  bg('bgDark', 21, 28.5);
  show('p4t', 21.4, 27.9);
  show('p4s', 21.9, 27.95, { y: 20 });
  tw('p4w', 21.5, 1.6, { o: 0, y: 160, rx: 22, s: 0.9 }, { o: 1, y: 0, rx: 0, s: 1 }, 'outQ');
  tw('p4w', 23.1, 4.8, { s: 1 }, { s: 1.035 }, 'lin');
  tw('p4w', 27.8, 0.6, { o: 1 }, { o: 0 }, 'in');

  // 5 · presupuesto (28,5 – 35,5)
  bg('bgWhite', 28.5, 35.5);
  show('p5k', 28.9, 34.9, { y: 20 });
  show('p5p', 29.1, 34.95, { y: 30, s: 0.96 });
  show('p5c', 30.5, 35.0, { y: 20 });
  show('p5s', 31.1, 35.0, { y: 20 });
  tw('p5i', 29.4, 1.2, { o: 0, x: 120, s: 0.96 }, { o: 1, x: 0, s: 1 }, 'outQ');
  tw('p5i', 30.6, 4.2, { y: 0 }, { y: -18 }, 'lin');
  tw('p5i', 34.8, 0.6, { o: 1 }, { o: 0 }, 'in');

  // 6 · cortar (35,5 – 47)
  bg('bgDark', 35.5, 47);
  show('p6t', 35.9, 46.4, { s: 0.92 });
  show('p6s', 37.0, 46.45, { y: 24 });
  show('p6c', 41.6, 46.5, { y: 20 });
  show('p6k2', 42.6, 46.5, { y: 16, blur: 6 });
  show('p6k1', 43.0, 46.5, { y: 16, blur: 6 });

  // 7 · texto 3D (47 – 54)
  bg('bgLight', 47, 54);
  show('p7t', 47.4, 53.5);
  show('p7s', 48.0, 53.55, { y: 20 });

  // 8 · IA (54 – 61,5)
  bg('bgAI', 54, 61.5);
  show('p8t', 54.3, 61.0);
  show('p8chat', 54.6, 61.05, { y: 30 });
  tw('p8a', 56.5, 0.4, { o: 0 }, { o: 1 });
  tw('p8b', 57.0, 0.4, { o: 0 }, { o: 1 });
  tw('p8r', 57.7, 0.6, { o: 0, y: 16 }, { o: 1, y: 0 }, 'outQ');

  // 9 · Bambu Studio (61,5 – 67,5)
  bg('bgWhite', 61.5, 67.5);
  show('p9t', 61.9, 67.0);
  show('p9s', 62.4, 67.0, { y: 20 });
  show('p9b', 62.7, 67.05, { y: 20 });
  tw('p9cur', 62.9, 0.6, { o: 0 }, { o: 1 });
  tw('p9cur', 63.0, 0.8, { x: 260, y: 180 }, { x: 0, y: 0 }, 'io');
  tw('p9b', 63.85, 0.12, { s: 1 }, { s: 0.95 }, 'out');
  tw('p9b', 63.97, 0.25, { s: 0.95 }, { s: 1 }, 'out');
  tw('p9cur', 66.9, 0.4, { o: 1 }, { o: 0 });
  tw('p9l', 64.1, 0.9, { o: 0, x: 80, s: 0.97 }, { o: 1, x: 0, s: 1 }, 'outQ');
  tw('p9l', 67.0, 0.5, { o: 1 }, { o: 0 }, 'in');
  ['s1', 's2', 's3'].forEach((id, i) => tw(id, 64.4 + i * 0.25, 0.6, { o: 0, x: 30 }, { o: 1, x: 0 }, 'outQ'));

  // 10 · rejilla (67,5 – 72,5)
  bg('bgBlack2', 67.5, 72.5);
  show('p10t', 67.8, 72.0);
  [...$('grid').children].forEach((el, i) => {
    tw(el, 68.2 + i * 0.11, 0.8, { o: 0, y: 50, s: 0.94, blur: 8 }, { o: 1, y: 0, s: 1, blur: 0 }, 'outQ');
    tw(el, 72.0, 0.45, { o: 1 }, { o: 0 }, 'in');
  });

  // 11 · cierre (72,5 – 78)
  bg('bgLight2', 72.5, null);
  show('p11t', 73.2, null, { y: 50, s: 0.96 });
  show('p11s', 73.9, null, { y: 24 });
  show('p11f', 74.6, null, { y: 16 });
  tw('fadeOut', 77.1, 0.9, { o: 0 }, { o: 1 }, 'io');

  // lienzo 3D
  const gl = 'gl';
  tw(gl, 11.2, 0.9, { o: 0, s: 0.97 }, { o: 1, s: 1 }, 'outQ');
  tw(gl, 20.4, 0.6, { o: 1 }, { o: 0 }, 'in');
  tw(gl, 36.0, 0.8, { o: 0 }, { o: 1 }, 'out');
  tw(gl, 46.6, 0.4, { o: 1 }, { o: 0 }, 'in');
  tw(gl, 47.3, 0.7, { o: 0 }, { o: 1 }, 'out');
  tw(gl, 53.5, 0.5, { o: 1 }, { o: 0 }, 'in');
  tw(gl, 54.6, 0.7, { o: 0 }, { o: 1 }, 'out');
  tw(gl, 61.0, 0.5, { o: 1 }, { o: 0 }, 'in');
  tw(gl, 72.9, 0.9, { o: 0, s: 0.97 }, { o: 1, s: 1 }, 'outQ');
}

// textos que dependen del tiempo (contador, escritura)
function dynamic(t) {
  const k = EASE.out(clamp((t - 29.3) / 1.5));
  $('p5p').textContent = `${(13 * k).toFixed(2).replace('.', ',')} €`;
  const msg = 'Pon la copa en dorado silk, que quede premium';
  const n = Math.round(clamp((t - 55.0) / 1.4) * msg.length);
  const caret = t > 54.8 && t < 56.6 && Math.floor(t * 2.4) % 2 === 0 ? '<span class="caret"></span>' : '';
  $('p8u').innerHTML = msg.slice(0, n) + caret;
}

// ---------------------------------------------------------------- producto 3D
let P = null;
const BASE = { Base: FIL.negroMate, Columna: FIL.negroMate, Placa: FIL.oroSilk, Texto: FIL.oroSilk, Copa: FIL.plataSilk };
function colorsAt(t) {
  // escena 3: se colorea parte a parte; escena 8: la IA cambia la copa a oro
  const steps = [['Base', FIL.negroMate, 13.0], ['Columna', FIL.negroMate, 13.5], ['Placa', FIL.oroSilk, 14.4], ['Texto', FIL.oroSilk, 14.9], ['Copa', FIL.plataSilk, 15.9]];
  for (const [name, fil, ts] of steps) P.setPartColor(name, FIL.blanco, fil, t < 21 ? EASE.io(clamp((t - ts) / 0.9)) : 1);
  if (t > 54) P.setPartColor('Copa', FIL.plataSilk, FIL.oroSilk, EASE.io(clamp((t - 57.3) / 0.9)));
}
function glState(t) {
  colorsAt(t);
  P.setDowelColor(FIL.naranja);
  P.setPartVisible('Texto', !(t > 47 && t < 54));
  P.setText(0);
  P.setCut(0, 0);
  P.setExplode(0);
  if (t < 28) {
    const k = t - 11;
    P.setCamera({ az: -40 + k * 1.2, el: 14, dist: 1.02 - k * 0.012, shiftX: 0.17, shiftY: 0.02 });
    P.setTurn(k * 0.28);
  } else if (t < 47) {
    const k = t - 35.5;
    // plano que sube por la pieza y se para en cada corte; luego el despiece
    let z = 0, a = 0;
    if (t >= 37.0 && t < 40.4) {
      a = clamp((t - 37.0) / 0.3) * (1 - clamp((t - 40.0) / 0.4));
      if (t < 38.0) z = 11 * EASE.io(clamp((t - 37.0) / 1.0));
      else if (t < 38.4) z = 11;
      else z = 11 + (68 - 11) * EASE.io(clamp((t - 38.4) / 1.2));
    }
    P.setCut(z, a);
    const ex = EASE.io(clamp((t - 40.2) / 2.0));
    P.setExplode(ex);
    P.setCamera({ az: -34 + k * 4.2, el: 12 + k * 0.7, dist: 1.2 + ex * 0.44, tz: 52 + ex * 26, shiftX: 0.2, shiftY: 0.03 });
    P.setTurn(0);
  } else if (t < 54) {
    const k = t - 47;
    P.setCamera({ az: -90 + Math.sin(k * 0.35) * 6, el: 9, dist: 0.6 - k * 0.006, tz: 13, shiftY: -0.1 });
    P.setTurn(0);
    P.setText(clamp((t - 48.4) / 1.8));
  } else if (t < 62) {
    const k = t - 54;
    P.setCamera({ az: -30 + k * 1.5, el: 14, dist: 1.0, shiftX: 0.2 });
    P.setTurn(k * 0.2);
  } else {
    const k = t - 72.5;
    P.setCamera({ az: -36 + k * 3.2, el: 12, dist: 1.62, shiftY: 0.09 });
    P.setTurn(k * 0.15);
  }
}

// ---------------------------------------------------------------- arranque
window.renderAt = (t) => {
  apply(t);
  dynamic(t);
  // el 3D solo se dibuja cuando se ve (el render por software es lo más lento de grabar)
  if (P && parseFloat($('gl').style.opacity || '0') > 0.001) { glState(t); P.render(); }
  return true;
};
async function start() {
  build();
  $('imgApp').src = 'assets/app.png';
  $('imgQuote').src = 'assets/quote.png';
  const imgs = [...document.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; })));
  P = await createProduct($('gl'), { dataUrl: 'assets/trofeo.json', width: 1920, height: 1080, transparent: true });
  await P.buildText('MARÍA', { fontUrl: '../public/fonts/gruesa.typeface.json', size: 7, depth: 1.4, at: [0, -32, 9], normal: [0, -1, 0] });
  await Promise.all(imgs);
  await document.fonts.ready;
  window.renderAt(0);
  window.ready = true;
}
start().catch((e) => { console.error(e); window.failed = String(e); });

// ---------------------------------------------------------------- banda sonora
const SCENES = [5.5, 11, 21, 28.5, 35.5, 47, 54, 61.5, 67.5, 72.5];
window.makeSoundtrack = async (D = DURATION) => {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(D * sr), sr);
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 1.5);
  master.gain.setValueAtTime(0.9, D - 2.4);
  master.gain.linearRampToValueAtTime(0, D);
  // reverberación: ruido que se apaga
  const rev = ctx.createConvolver();
  const len = sr * 3.4, ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  rev.buffer = ir;
  const revG = ctx.createGain(); revG.gain.value = 0.32;
  rev.connect(revG).connect(master);
  const noise = ctx.createBuffer(1, sr * 2, sr);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const bpm = 96, beat = 60 / bpm, bar = beat * 4;
  const prog = [[48, 55, 59, 62, 64], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 62]];
  const roots = [36, 33, 29, 31];
  // colchón de acordes
  for (let t = 0, ci = 0; t < D; t += bar * 2, ci++) {
    const chord = prog[ci % 4], dur = bar * 2 + 0.8;
    for (const m of chord) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.032, t + 1.4);
      g.gain.setValueAtTime(0.032, t + dur - 1.2);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(t < 11 ? 650 : 1100, t);
      for (const det of [-8, 0, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.8);
      }
      lp.connect(g); g.connect(master); g.connect(rev);
    }
    // bajo
    if (t >= 10.5) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = mtof(roots[ci % 4]);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.08); g.gain.exponentialRampToValueAtTime(0.05, t + bar * 2);
      g.gain.linearRampToValueAtTime(0, t + bar * 2 + 0.2);
      o.connect(g).connect(master); o.start(t); o.stop(t + bar * 2 + 0.3);
    }
  }
  // arpegio suave (pulsos de color)
  for (let t = 11, i = 0; t < 72; t += beat / 2, i++) {
    const ci = Math.floor(t / (bar * 2)) % 4, chord = prog[ci];
    const m = chord[[0, 2, 4, 3, 1, 3, 2, 4][i % 8]] + 12;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(m);
    const v = (t > 28 ? 0.05 : 0.035) * (i % 2 ? 0.7 : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    o.connect(g); g.connect(master); g.connect(rev);
    o.start(t); o.stop(t + 0.45);
  }
  // pulso: bombo suave y charles desde la escena de la app
  for (let t = 21; t < 72; t += beat) {
    const bi = Math.round((t - 21) / beat);
    if (bi % 2 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(118, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
    }
    if (t >= 28.5) {
      const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 7500;
      const th = t + beat / 2;
      g.gain.setValueAtTime(0.0001, th); g.gain.exponentialRampToValueAtTime(0.05, th + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, th + 0.07);
      s.connect(hp).connect(g).connect(master); s.start(th, Math.random()); s.stop(th + 0.08);
    }
  }
  // transiciones: "whoosh" antes de cada escena y golpe grave al entrar
  for (const ts of SCENES) {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, ts - 0.9); bp.frequency.exponentialRampToValueAtTime(4200, ts);
    g.gain.setValueAtTime(0.0001, ts - 0.9); g.gain.exponentialRampToValueAtTime(0.14, ts - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.25);
    s.connect(bp).connect(g); g.connect(master); g.connect(rev);
    s.start(ts - 0.9); s.stop(ts + 0.3);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(70, ts); o.frequency.exponentialRampToValueAtTime(34, ts + 1.1);
    og.gain.setValueAtTime(0.0001, ts); og.gain.exponentialRampToValueAtTime(0.3, ts + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, ts + 1.3);
    o.connect(og).connect(master); o.start(ts); o.stop(ts + 1.4);
  }
  // campanilla del logo
  for (const [tt, m] of [[1.6, 76], [1.75, 83], [1.9, 88]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.09, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.2);
    o.connect(g); g.connect(master); g.connect(rev); o.start(tt); o.stop(tt + 2.3);
  }
  const buf = await ctx.startRendering();
  // WAV 16 bits estéreo
  const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const W = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  W(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); W(8, 'WAVE'); W(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); W(36, 'data'); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0.89 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true);
  }
  const u8 = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
