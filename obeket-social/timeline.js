// Piezas comunes de las composiciones de vídeo: línea de tiempo determinista (el estado de cada
// elemento en el segundo t se calcula, no se anima) y conversión de audio a WAV.
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const EASE = {
  lin: (k) => k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  outQ: (k) => 1 - Math.pow(1 - k, 5),
  in: (k) => k * k * k,
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};

export function createTimeline() {
  const TL = new Map(); // elemento -> tweens
  const el = (x) => (typeof x === 'string' ? document.getElementById(x) : x);
  function tw(target, t0, dur, from, to, ease = 'out') {
    const e = el(target);
    if (!e) throw new Error(`No existe el elemento ${target}`);
    if (!TL.has(e)) TL.set(e, []);
    TL.get(e).push({ t0, dur, from, to, ease });
  }
  // entra (se enfoca y se coloca) y sale
  function show(target, tin, tout, { y = 40, x = 0, blur = 12, dur = 0.6, outDur = 0.3, s = 1, outY = -24, outS = 1 } = {}) {
    tw(target, tin, dur, { o: 0, y, x, blur, s }, { o: 1, y: 0, x: 0, blur: 0, s: 1 }, 'outQ');
    if (tout != null) tw(target, tout, outDur, { o: 1, y: 0, blur: 0, s: 1 }, { o: 0, y: outY, blur: 8, s: outS }, 'in');
  }
  function bg(target, tin, tout, d = 0.4) {
    tw(target, tin - d / 2, d, { o: 0 }, { o: 1 }, 'io');
    if (tout != null) tw(target, tout - d / 2, d, { o: 1 }, { o: 0 }, 'io');
  }
  function apply(t) {
    for (const [e, list] of TL) {
      const st = {};
      for (const x of list) {
        const k = clamp((t - x.t0) / x.dur);
        for (const p in x.to) {
          if (t < x.t0) { if (!(p in st)) st[p] = x.from[p]; }
          else st[p] = x.from[p] + (x.to[p] - x.from[p]) * EASE[x.ease](k);
        }
      }
      const o = st.o ?? 1;
      e.style.opacity = o;
      if (e.tagName !== 'CANVAS') e.style.visibility = o < 0.002 ? 'hidden' : 'visible'; // el lienzo WebGL nunca se oculta
      const tf = [];
      if (st.x || st.y) tf.push(`translate3d(${(st.x || 0).toFixed(2)}px, ${(st.y || 0).toFixed(2)}px, 0)`);
      if (st.r) tf.push(`rotate(${st.r.toFixed(3)}deg)`);
      if (st.s != null && st.s !== 1) tf.push(`scale(${st.s.toFixed(4)})`);
      e.style.transform = tf.join(' ');
      e.style.filter = st.blur > 0.05 ? `blur(${st.blur.toFixed(2)}px)` : '';
      if (st.ls != null) e.style.letterSpacing = `${st.ls.toFixed(4)}em`;
      if (st.dash != null) e.setAttribute('stroke-dashoffset', st.dash.toFixed(2));
      if (st.sc != null) e.setAttribute('transform', `scale(${st.sc.toFixed(4)})`);
    }
  }
  return { tw, show, bg, apply };
}

// AudioBuffer -> WAV 16 bits estéreo en base64 (con el pico a -1 dB)
export function wavBase64(buf) {
  const sr = buf.sampleRate, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
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
}
