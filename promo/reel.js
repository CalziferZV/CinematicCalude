// Reel vertical para redes (1080 × 1920, 24 s): gancho, colores reales, precio y unidades, cortar,
// nombre en relieve, Bambu Studio y cierre. Mismo sistema que el vídeo grande: renderAt(t) deja la
// escena exactamente como está en el segundo t, y la música (120 BPM) va cuadrada con los cortes.
import { createProduct, FIL } from './product.js';
import { clamp, EASE, createTimeline, wavBase64 } from './timeline.js';

export const DURATION = 24;
const $ = (id) => document.getElementById(id);
const { tw, show, bg, apply } = createTimeline();
const SCENES = [2, 6, 10, 14, 17, 20]; // cada cambio de escena cae en un tiempo del compás

// entrada "de golpe" para los titulares (grande y desenfocado -> en su sitio)
const punch = (id, tin, tout, extra = {}) => show(id, tin, tout, { y: 0, s: 1.14, blur: 16, dur: 0.38, outDur: 0.2, outY: -12, ...extra });

function build() {
  // 1 · gancho (0 – 2)
  punch('h1', 0.08, 1.78);
  punch('h2', 0.45, 1.8);
  show('h3', 1.0, 1.82, { y: 24, dur: 0.45, outDur: 0.2 });

  // 2 · colores reales (2 – 6)
  bg('bgColors', 2, 6, 0.3);
  punch('c_t', 2.04, 5.8);
  show('c_s', 2.22, 5.82, { y: 20, dur: 0.45 });
  show('c_chip', 2.45, 5.84, { y: 36, dur: 0.4 });

  // 3 · precio y unidades (6 – 10)
  bg('bgPrice', 6, 10, 0.3);
  show('q_k', 6.04, 9.8, { y: 20, dur: 0.4 });
  punch('q_p', 6.1, 9.82);
  show('q_s', 7.0, 9.84, { y: 34, dur: 0.45 });
  show('q_u', 7.85, 9.86, { y: 140, s: 0.96, blur: 6, dur: 0.55 });

  // 4 · cortar (10 – 14)
  bg('bgCut', 10, 14, 0.3);
  punch('k_t', 10.04, 13.8);
  punch('k_t2', 10.3, 13.82);
  show('k_c1', 12.25, 13.84, { y: 30, dur: 0.4 });
  show('k_c2', 12.5, 13.86, { y: 30, dur: 0.4 });

  // 5 · nombre en relieve (14 – 17)
  bg('bgName', 14, 17, 0.3);
  punch('n_t', 14.04, 16.8);
  punch('n_t2', 14.28, 16.82);

  // 6 · Bambu Studio (17 – 20)
  bg('bgBambu', 17, 20, 0.3);
  punch('b_t', 17.04, 19.8);
  punch('b_t2', 17.22, 19.82);
  show('b_btn', 17.45, 19.84, { y: 30, dur: 0.45 });
  tw('b_cur', 17.7, 0.25, { o: 0 }, { o: 1 });
  tw('b_cur', 17.72, 0.55, { x: 220, y: 300 }, { x: 0, y: 0 }, 'io');
  tw('b_cur', 19.6, 0.2, { o: 1 }, { o: 0 });
  tw('b_btnIn', 18.3, 0.08, { s: 1 }, { s: 0.93 }, 'out');
  tw('b_btnIn', 18.38, 0.24, { s: 0.93 }, { s: 1 }, 'out');
  show('b_slots', 18.45, 19.86, { y: 90, s: 0.97, blur: 6, dur: 0.5 });
  ['s1', 's2', 's3'].forEach((id, i) => tw(id, 18.6 + i * 0.15, 0.45, { o: 0, x: 40 }, { o: 1, x: 0 }, 'outQ'));

  // 7 · cierre (20 – 24): sin fundido a negro, para que el bucle de las redes enlace con el gancho
  bg('bgOutro', 20, null, 0.3);
  tw('o_logo', 20.05, 0.4, { o: 0, s: 0.8 }, { o: 1, s: 1 }, 'outQ');
  tw('o_ring', 20.1, 0.8, { dash: 264 }, { dash: 0 }, 'io');
  tw('o_fill', 20.85, 0.35, { o: 0 }, { o: 1 }, 'out');
  tw('o_dot', 20.95, 0.5, { sc: 0 }, { sc: 1 }, 'back');
  show('o_t', 20.35, null, { y: 30, s: 1.06, blur: 12, dur: 0.5 });
  show('o_s', 20.8, null, { y: 20, dur: 0.45 });
  show('o_f', 21.4, null, { y: 14, dur: 0.45 });

  // lienzo 3D: se ve en colores, cortar, nombre y cierre (fundidos cortos para tapar los saltos de cámara)
  tw('gl', 1.85, 0.4, { o: 0, s: 0.95 }, { o: 1, s: 1 }, 'outQ');
  tw('gl', 5.78, 0.22, { o: 1 }, { o: 0 }, 'in');
  tw('gl', 10.0, 0.35, { o: 0, s: 0.96 }, { o: 1, s: 1 }, 'outQ');
  tw('gl', 13.8, 0.2, { o: 1 }, { o: 0 }, 'in');
  tw('gl', 14.02, 0.3, { o: 0, s: 0.97 }, { o: 1, s: 1 }, 'outQ');
  tw('gl', 16.8, 0.2, { o: 1 }, { o: 0 }, 'in');
  tw('gl', 20.15, 0.5, { o: 0, s: 0.95 }, { o: 1, s: 1 }, 'outQ');
}

// ---------------------------------------------------------------- textos que cambian con el tiempo
const silk = (hex) => `linear-gradient(135deg, #fff 0%, ${hex} 42%, ${hex} 70%, rgba(0,0,0,0.35) 100%)`;
const CHIP = [
  [2.5, 'Carbón', 'PLA Matte', '#1F1F21'],
  [3.0, 'Dorado', 'PLA Silk', silk('#E5B03D')],
  [4.5, 'Plateado', 'PLA Silk', silk('#D9DCDB')],
  [5.0, 'Rojo', 'PLA Basic', '#C12E1F'],
  [5.5, 'Dorado', 'PLA Silk', silk('#E5B03D')],
];
const money = (v) => `${v.toFixed(2).replace('.', ',')} €`;
function dynamic(t) {
  let c = CHIP[0];
  for (const x of CHIP) if (t >= x[0]) c = x;
  $('c_name').textContent = c[1];
  $('c_line').textContent = c[2];
  $('c_sw').style.background = c[3];
  const pulse = 1 + 0.07 * (1 - EASE.out(clamp((t - c[0]) / 0.28)));
  $('c_chip').firstElementChild.style.transform = t >= c[0] ? `scale(${pulse.toFixed(4)})` : '';
  $('q_p').textContent = money(13 * EASE.out(clamp((t - 6.2) / 1.2)));
  $('q_up').innerHTML = `${money(13 - 5 * EASE.io(clamp((t - 8.35) / 0.65)))}<small>/ unidad</small>`;
}

// ---------------------------------------------------------------- producto 3D
let P = null;
const GOLD = FIL.oroSilk, BLACK = FIL.negroMate, SILVER = FIL.plataSilk;
function colorsAt(t) {
  if (t < 6.2) {
    // se colorea parte a parte, a tiempo con la música, y la copa prueba plateado y rojo
    const steps = [['Base', BLACK, 2.5], ['Columna', BLACK, 2.75], ['Placa', GOLD, 3.0], ['Texto', GOLD, 3.25], ['Copa', GOLD, 3.5]];
    for (const [name, fil, ts] of steps) P.setPartColor(name, FIL.blanco, fil, EASE.out(clamp((t - ts) / 0.22)));
    for (const [a, b, ts] of [[GOLD, SILVER, 4.5], [SILVER, FIL.rojo, 5.0], [FIL.rojo, GOLD, 5.5]]) {
      if (t >= ts) P.setPartColor('Copa', a, b, EASE.out(clamp((t - ts) / 0.2)));
    }
  } else P.setColors({ Base: BLACK, Columna: BLACK, Placa: GOLD, Texto: GOLD, Copa: GOLD });
}
function glState(t) {
  colorsAt(t);
  P.setDowelColor(FIL.naranja);
  P.setPartVisible('Texto', !(t > 14 && t < 17));
  P.setText(0);
  P.setCut(0, 0);
  P.setExplode(0);
  if (t < 10) {
    const k = t - 2;
    P.setCamera({ az: -38 + k * 4, el: 13, dist: 2.0 - k * 0.035, shiftY: 0.02 });
    P.setTurn(-0.3 + k * 0.35);
  } else if (t < 14) {
    const k = t - 10;
    // el plano sube, se para en el primer corte, sigue hasta el segundo y todo se separa
    let z = 0, a = 0;
    if (t >= 10.4 && t < 12.0) {
      a = clamp((t - 10.4) / 0.15) * (1 - clamp((t - 11.75) / 0.2));
      if (t < 10.9) z = 11 * EASE.io(clamp((t - 10.4) / 0.5));
      else if (t < 11.05) z = 11;
      else z = 11 + 57 * EASE.io(clamp((t - 11.05) / 0.7));
    }
    P.setCut(z, a);
    const ex = EASE.io(clamp((t - 11.8) / 1.1));
    P.setExplode(ex);
    P.setCamera({ az: -30 + k * 5, el: 12 + k * 1.5, dist: 2.3 + ex * 0.8, tz: 52 + ex * 24, shiftY: -0.02 });
    P.setTurn(0);
  } else if (t < 17) {
    const k = t - 14;
    P.setCamera({ az: -90 + Math.sin(k * 0.6) * 5, el: 10, dist: 0.98 - k * 0.012, tz: 9, shiftY: -0.08 });
    P.setTurn(0);
    P.setText(clamp((t - 14.5) / 1.2));
  } else {
    const k = t - 20;
    P.setCamera({ az: -36 + k * 4, el: 12, dist: 2.25, shiftY: 0.03 });
    P.setTurn(k * 0.25);
  }
}

// ---------------------------------------------------------------- arranque
window.renderAt = (t) => {
  apply(t);
  dynamic(t);
  if (P && parseFloat($('gl').style.opacity || '0') > 0.001) { glState(t); P.render(); }
  return true;
};
async function start() {
  build();
  P = await createProduct($('gl'), { dataUrl: 'assets/trofeo.json', width: 1080, height: 1920, transparent: true });
  await P.buildText('MARÍA', { fontUrl: '../public/fonts/gruesa.typeface.json', size: 7, depth: 1.4, at: [0, -32, 9], normal: [0, -1, 0] });
  await document.fonts.ready;
  window.renderAt(0);
  window.ready = true;
}
start().catch((e) => { console.error(e); window.failed = String(e); });

// ---------------------------------------------------------------- música (120 BPM, la menor)
window.makeSoundtrack = async (D = DURATION) => {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(D * sr), sr);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  const master = ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(0.9, 0);
  master.gain.setValueAtTime(0.9, D - 1.3);
  master.gain.linearRampToValueAtTime(0, D);
  const rev = ctx.createConvolver();
  const len = sr * 2.2, ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  rev.buffer = ir;
  const revG = ctx.createGain(); revG.gain.value = 0.28;
  rev.connect(revG).connect(master);
  const noise = ctx.createBuffer(1, sr * 2, sr);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const beat = 0.5, bar = 2;
  const CH = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [50, 55, 59, 62]]; // Lam · Fa · Do · Sol
  const ROOT = [45, 41, 36, 43];
  const chordAt = (t) => Math.floor(t / bar) % 4;
  const DROP = 2, END = 20; // el ritmo va del gancho al cierre

  const blip = (t, f0, f1, dur, vol, type = 'sine', wet = false) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
  const boom = (t, vol = 0.4) => blip(t, 72, 30, 1.1, vol);
  const whoosh = (ts, len = 0.45, vol = 0.13) => {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, ts - len); bp.frequency.exponentialRampToValueAtTime(5000, ts);
    g.gain.setValueAtTime(0.0001, ts - len); g.gain.exponentialRampToValueAtTime(vol, ts - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.12);
    s.connect(bp).connect(g); g.connect(master); g.connect(rev);
    s.start(ts - len); s.stop(ts + 0.15);
  };

  // colchón de acordes: cerrado en el gancho, se abre en el golpe y "bombea" con el bombo
  for (let t = 0; t < D; t += bar) {
    const chord = CH[chordAt(t)];
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0, t);
    pad.gain.linearRampToValueAtTime(0.026, t + 0.05);
    if (t >= DROP && t < END) for (let b = t; b < t + bar - 1e-6; b += beat) { pad.gain.setValueAtTime(0.008, b); pad.gain.linearRampToValueAtTime(0.026, b + 0.3); }
    pad.gain.setValueAtTime(0.026, t + bar - 0.02);
    pad.gain.linearRampToValueAtTime(0, t + bar + (t + bar >= D ? 0 : 0.25));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.8;
    if (t < DROP) { lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(1400, t + bar); }
    else lp.frequency.setValueAtTime(t >= END ? 1500 : 2200, t);
    for (const m of chord) for (const det of [-9, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + bar + 0.3);
    }
    lp.connect(pad); pad.connect(master); pad.connect(rev);
  }
  // gancho: subida de ruido y tono hasta el golpe
  {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(400, 0.1); bp.frequency.exponentialRampToValueAtTime(7000, DROP - 0.02);
    g.gain.setValueAtTime(0.0001, 0.1); g.gain.exponentialRampToValueAtTime(0.12, DROP - 0.03); g.gain.linearRampToValueAtTime(0, DROP);
    s.connect(bp).connect(g); g.connect(master);
    s.start(0.1); s.stop(DROP + 0.05);
    for (let t = 0.1, i = 0; t < DROP - 0.1; t += beat / 2, i++) burst(t, { f: 9000, dur: 0.03, vol: 0.02 + i * 0.004 });
  }
  boom(DROP, 0.5);
  burst(DROP, { f: 3500, dur: 1.4, vol: 0.12, wet: true });
  // bombo, palmas, charles y bajo
  for (let t = DROP; t < END - 1e-6; t += beat) {
    blip(t, 150, 45, 0.3, 0.55);
    const bi = Math.round((t - DROP) / beat);
    if (t >= 6 && bi % 2 === 1) for (const dt of [0, 0.011, 0.022]) burst(t + dt, { type: 'bandpass', f: 1600, q: 0.9, dur: 0.16, vol: 0.13, wet: true });
    burst(t + beat / 2, { f: 8500, dur: 0.05, vol: 0.06 });
    if (t >= 10 && t < 14) for (const dt of [beat / 4, (3 * beat) / 4]) burst(t + dt, { f: 9500, dur: 0.03, vol: 0.03 });
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    const tb = t + beat / 2;
    o.type = 'sawtooth'; o.frequency.value = mtof(ROOT[chordAt(t)]);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, tb); lp.frequency.exponentialRampToValueAtTime(220, tb + 0.2);
    g.gain.setValueAtTime(0.0001, tb); g.gain.exponentialRampToValueAtTime(0.16, tb + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tb + 0.22);
    o.connect(lp).connect(g).connect(master); o.start(tb); o.stop(tb + 0.25);
  }
  // arpegio brillante en los colores y en el cierre
  for (const [a, b] of [[2, 6], [20, 23.2]]) {
    for (let t = a, i = 0; t < b - 1e-6; t += beat / 4, i++) {
      const chord = CH[chordAt(t)];
      const m = chord[[0, 1, 2, 3, 2, 1][i % 6]] + 12;
      blip(t, mtof(m), mtof(m) * 0.998, 0.18, i % 4 === 0 ? 0.045 : 0.03, 'triangle', true);
    }
  }
  // cada color que se aplica suena
  [2.5, 2.75, 3.0, 3.25, 3.5, 4.5, 5.0, 5.5].forEach((t, i) => blip(t, 900 + i * 90, 1700 + i * 120, 0.09, 0.07, 'sine', true));
  // contador del precio y campanilla al llegar
  for (let t = 6.2, i = 0; t < 7.38; t += 0.05, i++) blip(t, 600 + i * 38, 640 + i * 38, 0.035, 0.025, 'square');
  for (const [f, v] of [[1318.5, 0.11], [1975.5, 0.07]]) blip(7.42, f, f, 0.9, v, 'sine', true);
  // unidades: entra la tarjeta y el precio baja
  whoosh(7.95, 0.3, 0.07);
  burst(8.35, { type: 'bandpass', f: 3200, f1: 500, q: 1.4, dur: 0.6, vol: 0.06 });
  blip(9.0, 1046.5, 1046.5, 0.5, 0.06, 'sine', true);
  // corte: el plano pasa y las piezas se separan
  burst(10.4, { type: 'highpass', f: 1500, f1: 6000, dur: 0.5, vol: 0.05 });
  burst(11.05, { type: 'highpass', f: 1500, f1: 7000, dur: 0.7, vol: 0.06 });
  boom(11.8, 0.32);
  burst(11.8, { type: 'bandpass', f: 600, f1: 2400, q: 0.8, dur: 0.5, vol: 0.08, wet: true });
  [12.25, 12.5].forEach((t) => blip(t, 1400, 2100, 0.08, 0.05, 'sine', true));
  // letras del nombre
  [0, 1, 2, 3, 4].forEach((i) => blip(14.5 + (1.2 * i) / 7, 950 - i * 40, 320, 0.07, 0.1));
  // clic en «Abrir en Bambu Studio» y filas que entran
  burst(18.3, { f: 2500, dur: 0.02, vol: 0.12 });
  blip(18.3, 220, 90, 0.08, 0.2);
  [18.6, 18.75, 18.9].forEach((t, i) => blip(t, 1200 + i * 200, 1600 + i * 200, 0.07, 0.04, 'sine', true));
  // transiciones
  for (const ts of SCENES) { whoosh(ts); if (ts !== DROP) boom(ts, ts === END ? 0.45 : 0.22); }
  // campanilla del logo
  for (const [tt, m] of [[20.9, 76], [21.05, 83], [21.2, 88]]) blip(tt, mtof(m), mtof(m), 2.2, 0.08, 'sine', true);
  return wavBase64(await ctx.startRendering());
};
