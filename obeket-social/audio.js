// Bandas sonoras sintetizadas en el navegador (OfflineAudioContext): originales, sin derechos de
// terceros, y cuadradas a 120 BPM (1 tiempo = 0,5 s, 1 compás = 2 s) con los cortes de cada reel.
const SR = 48000;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const N = (name) => { // 'C4', 'F#3', 'Bb5'
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return mtof(12 * (+m[3] + 1) + base);
};

function kit(ctx) {
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -14; out.ratio.value = 3; out.attack.value = 0.01; out.release.value = 0.2;
  const master = ctx.createGain(); master.gain.value = 0.8;
  out.connect(master); master.connect(ctx.destination);
  // reverberación sencilla (convolución con ruido que decae)
  const rev = ctx.createConvolver();
  const len = SR * 2.6, ir = ctx.createBuffer(2, len, SR);
  let s = 3;
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3.2); } }
  rev.buffer = ir;
  const revG = ctx.createGain(); revG.gain.value = 0.32; rev.connect(revG); revG.connect(out);
  const noiseBuf = ctx.createBuffer(1, SR * 2, SR);
  { const d = noiseBuf.getChannelData(0); let q = 11; for (let i = 0; i < d.length; i++) { q = (q * 16807) % 2147483647; d[i] = (q / 2147483647) * 2 - 1; } }
  const env = (g, t, a, peak, d, sus = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); };
  const send = (node, wet = 0.3) => { node.connect(out); if (wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(rev); } };
  const noise = (t, dur) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.start(t, (t * 7.31) % 1, dur); return n; };

  return {
    kick(t, v = 1) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(g, t, 0.003, 0.9 * v, 0.38); o.connect(g); send(g, 0); o.start(t); o.stop(t + 0.5);
    },
    hat(t, v = 0.25, dec = 0.05) {
      const n = noise(t, 0.2), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 7500; env(g, t, 0.001, v, dec);
      n.connect(f); f.connect(g); send(g, 0.05);
    },
    clap(t, v = 0.4) {
      const n = noise(t, 0.4), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.9; env(g, t, 0.002, v, 0.18);
      n.connect(f); f.connect(g); send(g, 0.35);
    },
    sleigh(t, v = 0.12) { // cascabeles: ruido muy agudo + parciales metálicos
      const n = noise(t, 0.25), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 9500; f.Q.value = 1.2; env(g, t, 0.002, v, 0.09);
      n.connect(f); f.connect(g); send(g, 0.2);
      [6100, 7350, 8800].forEach((fr, i) => { const o = ctx.createOscillator(), gg = ctx.createGain(); o.frequency.value = fr + i * 13; env(gg, t + i * 0.006, 0.001, v * 0.08, 0.07); o.connect(gg); send(gg, 0.2); o.start(t); o.stop(t + 0.15); });
    },
    pluck(t, f, dur = 0.3, v = 0.18, bright = 2600) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 1.004;
      lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(320, t + dur);
      env(g, t, 0.004, v, dur); const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); send(g, 0.35);
      o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    },
    bass(t, f, dur = 0.45, v = 0.32) {
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(160, t + dur);
      const sub = ctx.createOscillator(); sub.frequency.value = f; const sg = ctx.createGain(); sg.gain.value = 0.9;
      env(g, t, 0.006, v, dur); o.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g); send(g, 0);
      o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
    },
    pad(t0, t1, freqs, v = 0.05, cutoff = 1100) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.5;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.6); g.gain.setValueAtTime(v, t1 - 0.4); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.3);
      lp.connect(g); send(g, 0.6);
      for (const f of freqs) for (const d of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t0); o.stop(t1 + 0.4); }
    },
    bell(t, f, v = 0.16, dec = 2.2) { // campana FM
      const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      c.frequency.value = f; m.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 3.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + dec * 0.6);
      m.connect(mg); mg.connect(c.frequency);
      env(g, t, 0.002, v, dec); c.connect(g); send(g, 0.45);
      const p = ctx.createOscillator(), pg = ctx.createGain(); p.frequency.value = f * 2.76; env(pg, t, 0.002, v * 0.25, dec * 0.4); p.connect(pg); send(pg, 0.45);
      c.start(t); m.start(t); p.start(t); c.stop(t + dec + 0.2); m.stop(t + dec + 0.2); p.stop(t + dec + 0.2);
    },
    whoosh(t, dur = 0.6, v = 0.18, up = true) {
      const n = noise(t, dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(up ? 300 : 5000, t); f.frequency.exponentialRampToValueAtTime(up ? 6000 : 300, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(g); send(g, 0.4);
    },
    impact(t, v = 0.6) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      env(g, t, 0.004, v, 1.2); o.connect(g); send(g, 0.3); o.start(t); o.stop(t + 1.4);
      const n = noise(t, 0.6), lp = ctx.createBiquadFilter(), ng = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      env(ng, t, 0.002, v * 0.4, 0.5); n.connect(lp); lp.connect(ng); send(ng, 0.6);
    },
    printer(t0, t1, v = 0.022) { // zumbido de motores paso a paso, con cambios de nota
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square'; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
      const steps = [520, 610, 470, 690, 560, 640, 500, 720];
      for (let t = t0, i = 0; t < t1; t += 0.125, i++) o.frequency.setValueAtTime(steps[i % steps.length], t);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.1); g.gain.setValueAtTime(v, t1 - 0.1); g.gain.linearRampToValueAtTime(0.0001, t1);
      o.connect(bp); bp.connect(g); send(g, 0.1); o.start(t0); o.stop(t1 + 0.05);
    },
  };
}

// ── OBEKET (marca): electrónica cálida y con pulso, La menor → Fa → Do → Sol ──────────────
function marca(ctx, D) {
  const k = kit(ctx);
  const chords = [['A2', ['A3', 'C4', 'E4']], ['F2', ['F3', 'A3', 'C4']], ['C3', ['G3', 'C4', 'E4']], ['G2', ['G3', 'B3', 'D4']]];
  const arp = [0, 1, 2, 1, 2, 0, 1, 2];
  k.printer(0.2, 3.9);
  k.pad(0, 4, ['A3', 'E4'].map(N), 0.035, 700);
  for (let bar = 0; bar < Math.ceil(D / 2); bar++) {
    const t = bar * 2, [b, ch] = chords[bar % 4];
    if (t >= D - 0.5) break;
    if (bar >= 2) {
      k.pad(t, t + 2, ch.map(N), 0.04, 1300);
      for (let i = 0; i < 8; i++) k.pluck(t + i * 0.25, N(ch[arp[i]]) * 2, 0.22, i % 2 ? 0.09 : 0.13, bar >= 4 ? 3400 : 2200);
    }
    if (bar >= 2 && t < D - 2.2) {
      for (let i = 0; i < 4; i++) { k.kick(t + i * 0.5); k.hat(t + i * 0.5 + 0.25, 0.2); if (i % 2) k.clap(t + i * 0.5, 0.3); }
      for (let i = 0; i < 4; i++) k.bass(t + i * 0.5 + (i % 2 ? 0.25 : 0), N(b), 0.4);
    } else if (bar < 2) {
      for (let i = 0; i < 8; i++) k.hat(t + i * 0.25, 0.05 + 0.03 * (i % 2), 0.03);
    }
  }
  k.whoosh(3.3, 0.7, 0.2); k.impact(4);
  [8, 12].forEach((t) => k.whoosh(t - 0.6, 0.6, 0.12));
  k.impact(D - 2, 0.5);
  ['A4', 'C5', 'E5', 'A5'].forEach((n, i) => k.bell(D - 2 + i * 0.06, N(n), 0.07, 2.4));
}

// ── Navidad: campanas, cascabeles y un tema original en Do mayor ───────────────────────────
function navidad(ctx, D) {
  const k = kit(ctx);
  const chords = [['C3', ['C4', 'E4', 'G4']], ['A2', ['A3', 'C4', 'E4']], ['F2', ['F3', 'A3', 'C4']], ['G2', ['G3', 'B3', 'D4']]];
  // melodía original (nota, tiempo en compases de 8 corcheas)
  const mel = [
    ['E5', 0], ['G5', 1], ['C6', 2], ['B5', 3.5], ['G5', 4], ['E5', 6],
    ['A5', 8], ['G5', 9], ['E5', 10], ['C5', 11.5], ['D5', 12], ['E5', 14],
    ['F5', 16], ['A5', 17], ['C6', 18], ['B5', 19.5], ['A5', 20], ['F5', 22],
    ['G5', 24], ['F5', 25], ['D5', 26], ['B4', 27.5], ['D5', 28], ['G5', 30],
  ];
  // intro: caja de música
  ['C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'C6'].forEach((n, i) => k.bell(i * 0.25, N(n), 0.08, 1.4));
  k.pad(0, 2, ['C4', 'G4'].map(N), 0.03, 800);
  for (let bar = 1; bar < Math.ceil(D / 2); bar++) {
    const t = bar * 2, [b, ch] = chords[(bar - 1) % 4];
    if (t >= D - 2) break;
    k.pad(t, t + 2, ch.map(N), 0.04, 1200);
    for (let i = 0; i < 8; i++) k.sleigh(t + i * 0.25, i % 2 ? 0.07 : 0.12);
    for (let i = 0; i < 4; i++) { k.kick(t + i * 0.5, i === 0 ? 0.9 : 0.6); k.bass(t + i * 0.5, N(b), 0.42, 0.26); if (i % 2) k.clap(t + i * 0.5, 0.22); }
    if (bar >= 2) {
      const phrase = (bar - 2) % 4;
      for (const [n, pos] of mel) if (Math.floor(pos / 8) === phrase) k.bell(t + (pos % 8) * 0.25, N(n), 0.14, 1.8);
    }
  }
  [2, 10].forEach((t) => { k.whoosh(t - 0.6, 0.6, 0.14); k.impact(t, 0.45); });
  k.whoosh(D - 2.6, 0.6, 0.16);
  k.impact(D - 2, 0.55);
  ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => k.bell(D - 2 + i * 0.07, N(n), 0.1, 2.6));
  k.pad(D - 2, D, ['C4', 'E4', 'G4'].map(N), 0.04, 1500);
}

export async function renderMusic(kind, D) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * D), SR);
  ({ marca, navidad })[kind](ctx, D);
  return ctx.startRendering();
}
