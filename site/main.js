// Web de Filament Studio: el trofeo en 3D que el visitante colorea, el despiece con los pasadores
// al hacer scroll y el nombre en relieve en vivo. Cada lienzo solo se dibuja cuando se ve.
import { createProduct, FIL } from './product.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const data = fetch('assets/trofeo.json').then((r) => r.json());

// colores reales de Bambu Lab (nombre, línea, HEX y código de la bobina)
const SWATCHES = [
  { name: 'Dorado', line: 'PLA Silk', hex: '#E5B03D', code: '13401', fil: FIL.oroSilk, css: 'linear-gradient(135deg,#fff3c8,#E5B03D 45%,#9c7420)' },
  { name: 'Plateado', line: 'PLA Silk', hex: '#EAECEB', code: '13104', fil: FIL.plataSilk, css: 'linear-gradient(135deg,#ffffff,#D9DCDB 45%,#8a8e93)' },
  { name: 'Cobre', line: 'PLA Silk', hex: '#5E4B3C', code: '13300', fil: { hex: '#9a6440', finish: 'silk' }, css: 'linear-gradient(135deg,#e8b08a,#9a6440 45%,#4a2f1e)' },
  { name: 'Carbón', line: 'PLA Matte', hex: '#000000', code: '11101', fil: FIL.negroMate },
  { name: 'Blanco marfil', line: 'PLA Matte', hex: '#FFFFFF', code: '11100', fil: FIL.blancoMate },
  { name: 'Terracota', line: 'PLA Matte', hex: '#B15533', code: '11203', fil: { hex: '#B15533', finish: 'matte' } },
  { name: 'Rojo', line: 'PLA Basic', hex: '#C12E1F', code: '10200', fil: FIL.rojo },
  { name: 'Azul', line: 'PLA Basic', hex: '#0A2989', code: '10601', fil: { hex: '#0A2989', finish: 'basic' } },
  { name: 'Naranja', line: 'PLA Basic', hex: '#FF6A13', code: '10300', fil: FIL.naranja },
  { name: 'Verde bambú', line: 'PLA Basic', hex: '#00AE42', code: '10501', fil: { hex: '#00AE42', finish: 'basic' } },
];
const PARTS = [['Copa', 'Copa'], ['Columna', 'Columna'], ['Placa', 'Placa'], ['Base', 'Peana'], ['Texto', 'Texto']];
const START = { Copa: 0, Columna: 3, Placa: 0, Base: 3, Texto: 0 }; // índices de SWATCHES

// lienzo con su propio visor, ajustado al tamaño de su caja y pausado fuera de pantalla
async function mount(canvas, frame) {
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const P = await createProduct(canvas, { data: await data, width: Math.max(1, r.width), height: Math.max(1, r.height), pixelRatio: pr, transparent: true });
  let visible = false, raf = 0;
  const loop = (now) => { raf = 0; if (!visible) return; frame(P, now / 1000); P.render(); raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }, { rootMargin: '120px' }).observe(canvas);
  new ResizeObserver(() => { const b = canvas.getBoundingClientRect(); if (b.width > 0 && b.height > 0) P.setSize(b.width, b.height, pr); }).observe(canvas);
  canvas.parentElement.classList.add('ready');
  return P;
}

// ---------------------------------------------------------------- portada: colorea el trofeo
function initHero() {
  const canvas = document.getElementById('heroCanvas');
  const tabs = document.getElementById('partTabs');
  const sw = document.getElementById('swatches');
  const readout = document.getElementById('readout');
  const chosen = { ...START };
  const trans = new Map(); // parte -> { from, to, t0 }
  let part = 'Copa', turn = -0.5, vel = reduce ? 0 : 0.16, dragging = null, lastInteract = -10, P = null;

  tabs.innerHTML = PARTS.map(([id, label]) => `<button type="button" role="tab" data-part="${id}" aria-selected="${id === part}">${label}</button>`).join('');
  sw.innerHTML = SWATCHES.map((s, i) => `<button type="button" class="swatch" role="option" data-i="${i}" title="${s.line} · ${s.name}" aria-label="${s.line} ${s.name}" style="background:${s.css || s.hex}"></button>`).join('');
  const paint = () => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.part === part)));
    sw.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === chosen[part])));
    const s = SWATCHES[chosen[part]];
    const label = PARTS.find((p) => p[0] === part)[1];
    readout.innerHTML = `<b>${label}</b> · Bambu Lab ${s.line} ${s.name} · <span class="mono">${s.hex} · ${s.code}</span>`;
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { part = b.dataset.part; paint(); } });
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    const i = +b.dataset.i;
    if (i === chosen[part]) return;
    trans.set(part, { from: SWATCHES[chosen[part]].fil, to: SWATCHES[i].fil, t0: performance.now() / 1000 });
    chosen[part] = i;
    lastInteract = performance.now() / 1000;
    paint();
  });
  paint();

  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, turn }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) { turn = dragging.turn + (e.clientX - dragging.x) * 0.012; lastInteract = performance.now() / 1000; } });
  const end = () => { dragging = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  let last = 0;
  mount(canvas, (Pp, now) => {
    const dt = last ? Math.min(0.05, now - last) : 0;
    last = now;
    if (!dragging && now - lastInteract > 2.5) turn += vel * dt;
    Pp.setTurn(turn);
    for (const [name] of PARTS) {
      const tr = trans.get(name);
      const k = tr ? ease(clamp((now - tr.t0) / 0.6)) : 1;
      if (tr) Pp.setPartColor(name, tr.from, tr.to, k);
      else Pp.setPartColor(name, SWATCHES[chosen[name]].fil, SWATCHES[chosen[name]].fil, 1);
      if (tr && k >= 1) trans.delete(name);
    }
    const narrow = canvas.clientWidth < 560;
    Pp.setCamera({ az: -38, el: 15, dist: narrow ? 1.12 : 1.0, shiftY: 0.03 });
  }).then((p) => { P = p; }).catch(() => {});
  void P;
}

// ---------------------------------------------------------------- cortar: despiece con el scroll
function initCut() {
  const section = document.getElementById('cortar');
  const canvas = document.getElementById('cutCanvas');
  const steps = [...section.querySelectorAll('.step')];
  const callouts = [...section.querySelectorAll('.callout')];
  const progress = () => {
    const r = section.getBoundingClientRect(), vh = window.innerHeight;
    return clamp((vh * 0.55 - r.top) / Math.max(1, r.height - vh * 0.6));
  };
  const onScroll = () => {
    // el paso activo es el que está más cerca del centro de la pantalla
    const mid = window.innerHeight * 0.55;
    let best = 0, bd = Infinity;
    steps.forEach((s, i) => { const r = s.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = i; } });
    steps.forEach((s, i) => s.classList.toggle('active', i === best));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  mount(canvas, (P, now) => {
    const p = progress();
    // el plano sube por la pieza, se para en los dos cortes y después todo se separa
    const sweep = clamp((p - 0.1) / 0.24);
    const z = sweep < 0.35 ? 11 * ease(sweep / 0.35) : sweep < 0.45 ? 11 : 11 + 57 * ease((sweep - 0.45) / 0.55);
    const alpha = smooth(0.08, 0.14, p) * (1 - smooth(0.36, 0.42, p));
    P.setCut(z, alpha);
    const ex = smooth(0.38, 0.62, p);
    P.setExplode(ex);
    P.setColors({ Base: FIL.negroMate, Columna: FIL.negroMate, Placa: FIL.oroSilk, Texto: FIL.oroSilk, Copa: FIL.oroSilk });
    P.setDowelColor(FIL.naranja);
    const spin = reduce ? 0 : Math.sin(now * 0.25) * 0.08;
    P.setTurn(-0.35 + p * 0.9 + spin);
    P.setCamera({ az: -34, el: 12 + p * 8, dist: 1.25 + ex * 0.42, tz: 52 + ex * 26, shiftY: 0.02 });
    callouts.forEach((c) => (c.style.opacity = String(smooth(0.6, 0.7, p))));
  }).catch(() => {});
}

// ---------------------------------------------------------------- texto 3D en vivo
function initText() {
  const canvas = document.getElementById('textCanvas');
  const input = document.getElementById('nameInput');
  const fonts = document.getElementById('fontTabs');
  let font = 'gruesa', grow = { t0: 0 }, P = null, timer = 0, building = Promise.resolve();
  const rebuild = () => {
    if (!P) return;
    const text = (input.value || ' ').slice(0, 14);
    building = building.then(() => P.buildText(text, { fontUrl: `assets/${font}.typeface.json`, size: 7, depth: 1.4, at: [0, -32, 9], normal: [0, -1, 0], maxWidth: 54 }))
      .then(() => { grow = { t0: performance.now() / 1000 }; })
      .catch(() => {});
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(rebuild, 220); });
  fonts.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    font = b.dataset.font;
    fonts.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    rebuild();
  });
  mount(canvas, (Pp, now) => {
    Pp.setColors({ Base: FIL.negroMate, Columna: FIL.negroMate, Placa: FIL.oroSilk, Texto: FIL.oroSilk, Copa: FIL.oroSilk });
    Pp.setPartVisible('Texto', false);
    Pp.setText(reduce ? 1 : clamp((now - grow.t0) / 1.1), FIL.oroSilk);
    Pp.setTurn(reduce ? 0 : Math.sin(now * 0.4) * 0.12);
    Pp.setCamera({ az: -90, el: 10, dist: 0.62, tz: 13, shiftY: -0.12 });
  }).then((p) => { P = p; rebuild(); }).catch(() => {});
}

initHero();
initCut();
initText();
