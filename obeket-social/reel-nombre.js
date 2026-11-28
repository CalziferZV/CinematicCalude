// Reel "Escribe su nombre" (1080 × 1920, 18 s): un configurador donde se teclea el nombre letra a letra
// y el adorno 3D cambia en directo, se elige el color, se pulsa "Imprimir", se imprime tumbado en la
// cama (con el relleno visible) y termina con la familia de adornos colgando.
import { THREE, createStage, nameTag, bed, nozzle, placeNozzle, setPrint, contactShadow, loadFont, orbitCam } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 18;
export const SIZE = () => [1080, 1920];

const { tw, show, apply } = createTimeline();
const lerp = (a, b, k) => a + (b - a) * k;
const NAME = CONFIG.nombres[0];
const LETTERS = [...NAME].map((_, i) => 0.9 + i * 0.36);         // cuándo se teclea cada letra
const TAPS = [2.95, 3.75], PRESS = 4.65;                          // toques en los colores y en "Imprimir"
const COLORWAYS = [[0xf5f1e8, 0xc8102e], [0xc8102e, 0xf5f1e8], [0x1f7a4d, 0xf2c14e]];
const P0 = 5.6, P1 = 10.6, L0 = 10.7, L1 = 12.9, F0 = 13.2;
let S, DISP, FLAT, BED, NZ, SH, FAM, TYPED, CARET, PH, CHIPS, TAPEL, BTN, placed = false;

export async function init() {
  document.getElementById('bgs').innerHTML = `<div class="bg bg-cream"></div>`;
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  document.getElementById('fg').innerHTML = `
    <style>
      .cfg{position:absolute;left:90px;right:90px;top:230px;padding:36px 44px 44px;border-radius:44px;background:#fff;box-shadow:0 30px 80px rgba(80,40,0,.13)}
      .cfg h4{font-size:36px;font-weight:800;letter-spacing:-.01em;color:#1d1d1f;margin-bottom:22px}
      .cfg .lbl{font-size:24px;font-weight:800;letter-spacing:.16em;color:#9a9aa0}
      .cfg .field{margin-top:10px;height:104px;border-radius:24px;border:3px solid #ff6a13;display:flex;align-items:center;padding:0 30px;font-size:60px;font-weight:800;letter-spacing:.05em;color:#1d1d1f;background:#fffaf5}
      .cfg .caret{display:inline-block;width:5px;height:62px;background:#ff6a13;margin-left:6px;border-radius:2px}
      .cfg .ph{color:#b9b9bf;font-weight:600;font-size:44px;letter-spacing:0;margin-left:4px}
      .cfg .chips{margin-top:14px;display:flex;gap:26px}
      .cfg .chips b{width:84px;height:84px;border-radius:50%;box-shadow:inset 0 0 0 3px rgba(0,0,0,.08);position:relative;display:flex;align-items:center;justify-content:center}
      .cfg .chips b i{width:26px;height:26px;border-radius:50%}
      .cfg .chips b.on::after{content:'';position:absolute;inset:-11px;border-radius:50%;border:5px solid #ff6a13}
      .cfg .go{margin-top:30px;height:108px;border-radius:28px;background:#ff6a13;color:#fff;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:800;box-shadow:0 18px 40px rgba(255,106,19,.35)}
      .tap{position:absolute;left:0;top:0;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;background:rgba(29,29,31,.16);border:4px solid rgba(29,29,31,.4)}
    </style>
    <div id="card" class="cfg">
      <h4>Personaliza tu adorno</h4>
      <div class="lbl">NOMBRE</div>
      <div class="field"><span id="typed"></span><i id="caret" class="caret"></i><span id="ph" class="ph">Escribe un nombre…</span></div>
      <div class="lbl" style="margin-top:26px">COLOR</div>
      <div class="chips">${COLORWAYS.map((c, i) => `<b id="chip${i}" style="background:${hex(c[0])}"><i style="background:${hex(c[1])}"></i></b>`).join('')}</div>
      <div id="btn" class="go">Imprimir</div>
    </div>
    <div id="tap" class="tap"></div>
    <div id="p1" class="abs center h-l" style="top:300px">Lo imprimimos</div>
    <div id="p2" class="abs center h-l" style="top:410px"><span class="grad">en sus colores</span></div>
    <div id="l1" class="abs center h-l" style="top:300px">Listo para su árbol <span class="emoji">🎄</span></div>
    <div id="f1" class="abs center h-l" style="top:290px">Uno para</div>
    <div id="f2" class="abs center h-l" style="top:400px"><span class="grad">cada uno</span></div>
    <div id="f3" class="abs row" style="top:1430px"><span class="btn">Dinos sus nombres por DM</span></div>
    <div id="f4" class="abs center sub" style="top:1585px;font-size:36px">Pedidos hasta el ${CONFIG.fechaLimite} · ${CONFIG.usuario}</div>`;
  TYPED = document.getElementById('typed'); CARET = document.getElementById('caret'); PH = document.getElementById('ph');
  CHIPS = COLORWAYS.map((_, i) => document.getElementById('chip' + i));
  TAPEL = document.getElementById('tap'); BTN = document.getElementById('btn');

  S = createStage(document.getElementById('gl'), 1080, 1920, 34);
  await loadFont();
  // el adorno que se ve mientras se escribe: uno por cada prefijo del nombre (M, MA, MAR…)
  DISP = [...NAME].map((_, i) => { const g = nameTag(NAME.slice(0, i + 1)); g.scale.setScalar(0.55); g.visible = false; S.scene.add(g); return g; });
  SH = contactShadow(0.9, 0.22); S.scene.add(SH);
  // el que se imprime, tumbado sobre la cama
  BED = bed(2.4, 2.4, CONFIG.marca); S.scene.add(BED);
  FLAT = nameTag(NAME, { plate: COLORWAYS[2][0], letters: COLORWAYS[2][1] }); FLAT.scale.setScalar(0.55); S.scene.add(FLAT);
  NZ = nozzle(); S.scene.add(NZ);
  // la familia colgando de una guirnalda
  const sag = (x) => 1.6 - 0.1 * (1 - (x / 1.4) ** 2);
  const gpts = Array.from({ length: 41 }, (_, i) => { const x = -1.4 + (2.8 * i) / 40; return new THREE.Vector3(x, sag(x), -0.05); });
  const cord = new THREE.MeshStandardMaterial({ color: 0xb3122e, roughness: 0.55 });
  const GAR = new THREE.Group();
  GAR.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gpts), 120, 0.012, 8), cord));
  for (let i = 0; i < 11; i++) { const x = -1.25 + i * 0.25; const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8b54a, metalness: 0.9, roughness: 0.25 })); b.position.set(x, sag(x) - 0.012, -0.05); GAR.add(b); }
  S.scene.add(GAR);
  const fam = [[NAME, COLORWAYS[2], -0.52, 1.3], [CONFIG.nombres[2], COLORWAYS[0], 0.02, 0.78], [CONFIG.nombres[1], COLORWAYS[1], 0.56, 1.14]];
  FAM = fam.map(([n, c, x, y], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const g = nameTag(n, { plate: c[0], letters: c[1] }); g.scale.setScalar(0.42);
    g.position.y = -(g.userData.h - 0.2) * 0.42; pivot.add(g);
    const len = sag(x) - y;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 8), cord);
    str.position.y = len / 2; pivot.add(str);
    pivot.userData.g = g; S.scene.add(pivot); return pivot;
  });
  FAM.gar = GAR;

  show('card', 0.25, 5.1, { y: 40, outY: -60 });
  show('p1', P0, P1, { y: 26 }); show('p2', P0 + 0.3, P1, { y: 26 });
  show('l1', L0 + 0.2, L1 + 0.1, { y: 26 });
  show('f1', F0 + 0.1, null, { y: 26 }); show('f2', F0 + 0.4, null, { y: 26 });
  show('f3', F0 + 1.2, null, { y: 40, s: 0.92 }); show('f4', F0 + 1.5, null, { y: 16 });
}

function colorway(t) { return t < TAPS[0] ? 0 : t < TAPS[1] ? 1 : 2; }

export function renderAt(t) {
  apply(t);
  const cam = S.camera;
  // ── configurador (DOM) ──
  const n = LETTERS.filter((x) => x <= t).length;
  TYPED.textContent = NAME.slice(0, n);
  PH.style.display = n ? 'none' : '';
  CARET.style.opacity = t < PRESS && Math.floor(t * 2.6) % 2 === 0 ? 1 : 0;
  const cw = colorway(t);
  CHIPS.forEach((c, i) => c.classList.toggle('on', i === cw));
  if (!placed) { // colocar el dedo sobre los chips y el botón (ya con las fuentes cargadas)
    const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    TAPEL.userData = { c1: at(CHIPS[1]), c2: at(CHIPS[2]), b: at(BTN) }; placed = true;
  }
  const taps = [[TAPS[0], TAPEL.userData.c1], [TAPS[1], TAPEL.userData.c2], [PRESS, TAPEL.userData.b]];
  let tapO = 0, tapS = 1, tx = 0, ty = 0;
  for (const [tt, [x, y]] of taps) { const d = t - tt; if (d > -0.25 && d < 0.45) { tx = x; ty = y; tapO = d < 0 ? 1 + d * 4 : 1 - d / 0.45; tapS = d < 0 ? 1.15 : 1 - Math.min(d, 0.12) * 1.5; } }
  TAPEL.style.opacity = Math.max(0, tapO); TAPEL.style.transform = `translate(${tx}px, ${ty}px) scale(${tapS.toFixed(3)})`;
  BTN.style.transform = t > PRESS && t < PRESS + 0.18 ? 'scale(0.95)' : '';

  // ── 3D ──
  DISP.forEach((g) => (g.visible = false)); FAM.forEach((p) => (p.visible = false));
  BED.visible = FLAT.visible = false; NZ.visible = false; NZ.userData.trail.visible = false; SH.visible = false; FAM.gar.visible = t >= F0;
  if (t < P0 - 0.35) { // el adorno se actualiza con cada letra
    if (n > 0) {
      const g = DISP[n - 1]; g.visible = true; SH.visible = true; SH.position.set(0, 0, 0);
      const [pl, le] = COLORWAYS[cw]; g.children[0].material.color.set(pl); g.children[1].material.color.set(le);
      setPrint(g, 1);
      const pop = 1 + 0.09 * Math.exp(-(t - LETTERS[n - 1]) * 9);
      const tapPop = 1 + 0.06 * Math.exp(-Math.max(0, t - (cw ? TAPS[cw - 1] : 99)) * 8);
      g.scale.setScalar(0.55 * pop * tapPop);
      g.rotation.y = Math.sin(t * 1.3) * 0.18;
      const out = clamp((t - (P0 - 0.85)) / 0.5);
      g.position.y = -out * 0.4; g.scale.multiplyScalar(1 - out * 0.6);
    }
    orbitCam(cam, [0, 0.24, 0], 4.8, 0.12, 0, 0.36);
  } else if (t < L0) { // se imprime tumbado en la cama
    BED.visible = FLAT.visible = true;
    const p = clamp((t - P0) / (P1 - P0));
    FLAT.rotation.set(-Math.PI / 2, 0, 0); FLAT.position.set(0, 0, 0.15);
    const { cut, box } = setPrint(FLAT, p >= 1 ? 1 : Math.max(0.01, p), 1);
    placeNozzle(NZ, cut, box, t * 1.4, { speed: 3.2, size: 0.42, show: p < 1 ? 1 : 0, piece: FLAT });
    const k = EASE.io(clamp((t - P0 + 0.35) / (P1 - P0 + 0.35)));
    orbitCam(cam, [0, 0.05, -0.09], lerp(5.2, 4.6, k), lerp(0.95, 0.85, k), lerp(-0.3, 0.25, k), 0.3);
  } else if (t < F0) { // se levanta y se pone de pie
    BED.visible = FLAT.visible = true; setPrint(FLAT, 1);
    const k = EASE.io(clamp((t - L0) / (L1 - L0 - 0.6)));
    FLAT.rotation.set(lerp(-Math.PI / 2, 0, k), Math.sin(Math.max(0, t - L0) * 1.4) * 0.25 * k, 0);
    FLAT.position.set(0, k * 0.55, 0.15 * (1 - k));
    const ck = EASE.io(clamp((t - L0) / (L1 - L0)));
    orbitCam(cam, [0, lerp(0.05, 0.8, ck), lerp(-0.09, 0, ck)], lerp(4.6, 5.6, ck), lerp(0.85, 0.14, ck), lerp(0.25, 0, ck), 0.3);
  } else { // la familia de adornos colgando
    FAM.forEach((p, i) => { p.visible = true; setPrint(p.userData.g, 1); p.rotation.z = Math.sin(t * 1.5 + i * 1.3) * 0.07; p.userData.g.rotation.y = Math.sin(t * 0.9 + i) * 0.22; const k = EASE.back(clamp((t - F0 - i * 0.12) / 0.5)); p.scale.setScalar(Math.max(0.001, k)); });
    const k = EASE.out(clamp((t - F0) / 4));
    orbitCam(cam, [0, 0.62, 0], lerp(6.3, 6.0, k), 0.06, 0, 0.12);
  }
  S.render();
}
