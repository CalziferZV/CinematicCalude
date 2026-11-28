// Reel "Así se hace un adorno" (1080 × 1920, 20 s): el proceso en 4 pasos con la misma estrella:
// 1 diseño (alambre CAD que se dibuja), 2 laminado (capas de colores y la sección con el relleno),
// 3 impresión sobre la cama y 4 lista para regalar.
import { THREE, createStage, star, gift, bed, wireOf, nozzle, placeNozzle, setPrint, setSlicer, orbitCam, contactShadow } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 20;
export const SIZE = () => [1080, 1920];

const { tw, show, bg, apply } = createTimeline();
const lerp = (a, b, k) => a + (b - a) * k;
const ST = [2.4, 6.4, 10.6, 15.6];           // inicio de cada paso
const SC = 0.75;                              // escala de la estrella
let S, STAR, W, GRID, BED, NZ, GIFT, SH, STEPS, CNT;

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg" style="background:radial-gradient(90% 60% at 50% 58%, #133a5c 0%, #0a2238 58%, #041120 100%)"></div>
    <div class="bg" style="background-image:linear-gradient(rgba(120,200,255,.06) 2px, transparent 2px),linear-gradient(90deg, rgba(120,200,255,.06) 2px, transparent 2px);background-size:60px 60px"></div>
    <div class="bg bg-dark" id="bgB"></div>
    <div class="bg bg-warm" id="bgC"></div>`;
  const steps = ['Diseño', 'Laminado', 'Impresión', 'Listo'];
  document.getElementById('fg').innerHTML = `
    <style>.stp{display:flex;gap:12px;justify-content:center}.stp span{padding:12px 22px;border-radius:999px;font-size:27px;font-weight:700;color:rgba(255,255,255,.55);border:2px solid rgba(255,255,255,.18)}
    .stp span.on{background:#ff6a13;border-color:#ff6a13;color:#fff}.stp.light span{color:rgba(29,29,31,.45);border-color:rgba(29,29,31,.15)}.stp.light span.on{color:#fff}</style>
    <div id="steps" class="abs stp" style="left:0;right:0;top:225px">${steps.map((s, i) => `<span id="sp${i}">${i + 1} · ${s}</span>`).join('')}</div>
    <div id="i1" class="abs center h-xl white" style="top:330px">Así se hace</div>
    <div id="i2" class="abs center h-l" style="top:470px"><span class="grad">un adorno en 3D</span></div>
    <div id="a1" class="abs center h-l white" style="top:330px">Diseño</div>
    <div id="a2" class="abs center sub white" style="top:445px">Modelamos tu idea en 3D</div>
    <div id="b1" class="abs center h-l white" style="top:330px">Laminado</div>
    <div id="b2" class="abs center sub white" style="top:445px">La dividimos en 20 capas de 0,2 mm</div>
    <div id="cnt" class="abs row" style="top:1545px"><span style="padding:12px 28px;border-radius:999px;background:rgba(0,0,0,.45);font-family:'JetBrains Mono',monospace;font-size:34px;font-weight:600;letter-spacing:.12em;color:rgba(255,255,255,.85)">CAPA <b id="cn" style="color:#7fd8ff">20</b> / 20</span></div>
    <div id="c1" class="abs center h-l white" style="top:330px">Impresión</div>
    <div id="c2" class="abs center sub white" style="top:445px">Capa a capa, con relleno por dentro</div>
    <div id="d1" class="abs center h-l" style="top:330px">Lista para <span class="grad">regalar</span></div>
    <div id="e1" class="abs center h-l" style="top:330px">Tú pones la idea.</div>
    <div id="e2" class="abs center h-l" style="top:440px"><span class="grad">Nosotros, todo lo demás.</span></div>
    <div id="e3" class="abs row" style="top:1440px"><span class="btn">Escríbenos por DM</span></div>
    <div id="e4" class="abs center sub" style="top:1590px;font-size:34px">${CONFIG.usuario} · ${CONFIG.marca}</div>`;
  STEPS = steps.map((_, i) => document.getElementById('sp' + i));
  CNT = document.getElementById('cn');

  S = createStage(document.getElementById('gl'), 1080, 1920, 30);
  STAR = star(0xe8b54a, { metal: 0.45 }); STAR.scale.setScalar(SC); S.scene.add(STAR);
  W = wireOf(STAR, 0x8fe0ff, 20); S.scene.add(W);
  GRID = new THREE.GridHelper(8, 32, 0x3fa9f5, 0x2a6b9c); GRID.material.transparent = true; GRID.material.opacity = 0.35; S.scene.add(GRID);
  BED = bed(2.4, 2.4, CONFIG.marca); S.scene.add(BED);
  NZ = nozzle(); S.scene.add(NZ);
  GIFT = gift(0xc8102e, 0xf2c14e); S.scene.add(GIFT);
  SH = contactShadow(1.1, 0.25); S.scene.add(SH);

  bg('bgB', ST[2], ST[3], 0.4); bg('bgC', ST[3], null, 0.4);
  show('steps', 0.2, ST[3] - 0.1, { y: -10 });
  show('i1', 0.2, ST[0] - 0.15, { y: 26 }); show('i2', 0.5, ST[0] - 0.12, { y: 26 });
  show('a1', ST[0] + 0.05, ST[1] - 0.15, { y: 26 }); show('a2', ST[0] + 0.3, ST[1] - 0.12, { y: 16 });
  show('b1', ST[1] + 0.05, ST[2] - 0.15, { y: 26 }); show('b2', ST[1] + 0.3, ST[2] - 0.12, { y: 16 });
  show('cnt', ST[1] + 0.8, ST[2] - 0.1, { y: 16 });
  show('c1', ST[2] + 0.05, ST[3] - 0.15, { y: 26 }); show('c2', ST[2] + 0.3, ST[3] - 0.12, { y: 16 });
  show('d1', ST[3] + 0.1, 17.6, { y: 26 });
  show('e1', 17.75, null, { y: 26 }); show('e2', 18.05, null, { y: 26 });
  show('e3', 18.4, null, { y: 30, s: 0.92 }); show('e4', 18.7, null, { y: 16 });
}

// estrella de pie (0) o tumbada sobre la cama (1)
function poseStar(k, spin = 0) {
  STAR.rotation.set(-Math.PI / 2 * k, spin, 0);
  STAR.position.set(0, 0.12 * k, 0.58 * k);
  W.position.copy(STAR.position); W.rotation.copy(STAR.rotation); W.scale.copy(STAR.scale);
}

export function renderAt(t) {
  apply(t);
  const cam = S.camera;
  const step = t < ST[0] ? -1 : t < ST[1] ? 0 : t < ST[2] ? 1 : t < ST[3] ? 2 : 3;
  STEPS.forEach((el, i) => el.classList.toggle('on', i === step));
  document.getElementById('steps').classList.toggle('light', step === 3);
  NZ.visible = false; NZ.userData.trail.visible = false;
  GRID.visible = t < ST[2]; BED.visible = t >= ST[2] && t < ST[3]; GIFT.visible = t >= ST[3]; SH.visible = t >= ST[3];
  STAR.scale.setScalar(SC); GIFT.scale.setScalar(0.001);

  if (t < ST[1]) { // intro + 1 · diseño: el alambre se dibuja y gira
    STAR.visible = false; W.visible = true;
    poseStar(0, Math.sin(t * 0.7) * 0.45);
    W.userData.draw(EASE.io(clamp((t - 0.3) / 3.0)), 0.95);
    orbitCam(cam, [0, 0.58, 0], 5.0, 0.2, 0.15, 0.3);
  } else if (t < ST[2]) { // 2 · laminado
    const k = EASE.io(clamp((t - ST[1]) / 0.9));
    poseStar(k, Math.sin(ST[1] * 0.7) * 0.45 * (1 - k));
    W.visible = t < ST[1] + 1.6; W.userData.draw(1, 0.95 * (1 - clamp((t - ST[1] - 0.9) / 0.6)));
    STAR.visible = t >= ST[1] + 0.9;
    setSlicer(STAR, true);
    let p;
    if (t < ST[1] + 1.8) p = EASE.io(clamp((t - ST[1] - 0.9) / 0.9));            // las capas se apilan
    else if (t < ST[1] + 2.9) p = lerp(1, 0.42, EASE.io((t - ST[1] - 1.8) / 1.1)); // se baja el corte: relleno por dentro
    else p = lerp(0.42, 1, EASE.io(clamp((t - ST[1] - 2.9) / 1.1)));
    setPrint(STAR, p >= 0.999 ? 1 : Math.max(0.01, p), 0);
    CNT.textContent = Math.max(1, Math.round(p * 20));
    const ck = EASE.io(clamp((t - ST[1]) / 1.0));
    orbitCam(cam, [0, lerp(0.58, 0.1, ck), 0], lerp(5.0, 6.5, ck), lerp(0.2, 1.0, ck), lerp(0.15, -0.05, ck), 0.22);
  } else if (t < ST[3]) { // 3 · impresión
    STAR.visible = true; W.visible = false; setSlicer(STAR, false); poseStar(1);
    const p = clamp((t - ST[2] - 0.3) / 4.2);
    const { cut, box } = setPrint(STAR, p >= 1 ? 1 : Math.max(0.01, p), 1);
    placeNozzle(NZ, cut, box, t * 1.4, { speed: 3.2, size: 0.4, show: p < 1 ? 1 : 0, piece: STAR });
    const k = EASE.io(clamp((t - ST[2]) / 5));
    orbitCam(cam, [0, 0.08, 0], lerp(6.0, 5.5, k), lerp(0.98, 0.88, k), lerp(-0.2, 0.2, k), 0.3);
  } else { // 4 · lista para regalar
    STAR.visible = true; W.visible = false; setPrint(STAR, 1);
    const k = EASE.io(clamp((t - ST[3]) / 1.2));
    STAR.rotation.set(-Math.PI / 2 * (1 - k), (t - ST[3]) * 0.9, 0);
    STAR.position.set(0, lerp(0.12, 0.66, k), lerp(0.58, 0, k));
    const gk = EASE.back(clamp((t - ST[3] - 0.5) / 0.6));
    GIFT.scale.setScalar(0.48 * Math.max(0.001, gk)); GIFT.rotation.y = 0.6 + (t - ST[3]) * 0.25; GIFT.position.set(0, 0, 0);
    STAR.position.y += 0.02 * Math.sin(t * 2);
    orbitCam(cam, [0, 0.91, 0], lerp(7.6, 8.8, EASE.io(clamp((t - ST[3]) / 4))), 0.12, 0, 0.05);
  }
  S.render();
}
