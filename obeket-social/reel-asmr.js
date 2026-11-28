// Reel "Relájate y mira cómo nace" (1080 × 1920, 20 s): timelapse tranquilo de un árbol de Navidad
// imprimiéndose entero sobre la cama de PEI: falda inicial, capa a capa con el relleno visible por
// dentro, contador de capas y la estrella de la punta que se enciende al terminar.
import { THREE, createStage, tree, bed, skirt, nozzle, placeNozzle, parkNozzle, setPrint, starGlow, loadFont } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 20;
export const SIZE = () => [1080, 1920];

const { tw, show, apply } = createTimeline();
const lerp = (a, b, k) => a + (b - a) * k;
const P0 = 1.8, P1 = 15.4;               // la impresión del árbol va de P0 a P1
const LAYER = 0.016;
let S, TREE, BED, SK, NZ, GLOW, H, CNT, BAR;

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg" style="background:radial-gradient(95% 60% at 50% 62%, #2b2119 0%, #110d0a 62%, #050403 100%)"></div>
    <div id="halo" class="abs glow" style="left:40px;top:900px;width:1000px;height:1000px;opacity:.7"></div>`;
  document.getElementById('fg').innerHTML = `
    <div id="k" class="abs center kicker" style="top:250px">Timelapse · Navidad</div>
    <div id="t1" class="abs center h-l white" style="top:310px">Relájate y mira</div>
    <div id="t2" class="abs center h-l" style="top:420px"><span class="gold">cómo nace</span> <span class="emoji">🎄</span></div>
    <div id="cnt" class="abs row" style="top:1545px"><span style="padding:12px 28px;border-radius:999px;background:rgba(0,0,0,.55);font-family:'JetBrains Mono',monospace;font-size:34px;font-weight:600;letter-spacing:.12em;color:rgba(255,255,255,.85)">CAPA <b id="cn" style="color:#ffb27a">0</b> / <span id="ct">0</span></span></div>
    <div id="bar" class="abs" style="left:300px;right:300px;top:1640px;height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden"><i id="bari" style="position:absolute;inset:0;background:#ff8a3d;transform-origin:left;transform:scaleX(0)"></i></div>
    <div id="e1" class="abs center h-l white" style="top:300px">Hecho capa a capa</div>
    <div id="e2" class="abs center h-l" style="top:410px">en <span class="grad">${CONFIG.marca}</span></div>
    <div id="e3" class="abs center sub white" style="top:545px">Pídelo por DM · hasta el ${CONFIG.fechaLimite}</div>`;

  S = createStage(document.getElementById('gl'), 1080, 1920, 34);
  S.scene.environmentIntensity = 0.55;
  S.key.intensity = 1.5; S.rim.intensity = 2.0;
  await loadFont();
  BED = bed(2.6, 2.6, CONFIG.marca); S.scene.add(BED);
  TREE = tree(0x1f8a52); TREE.scale.setScalar(0.8); S.scene.add(TREE);
  H = new THREE.Box3().setFromObject(TREE).max.y;
  SK = skirt(0.84, 0x1f8a52); S.scene.add(SK);
  NZ = nozzle(); S.scene.add(NZ);
  GLOW = starGlow(0xffd27a, 0.6); GLOW.position.set(0, H - 0.16, 0.02); S.scene.add(GLOW);
  CNT = document.getElementById('cn'); BAR = document.getElementById('bari');
  document.getElementById('ct').textContent = Math.round(H / LAYER);

  show('k', 0.3, 5.4, { y: 14 }); show('t1', 0.5, 5.5, { y: 26 }); show('t2', 1.0, 5.6, { y: 26 });
  show('cnt', P0, P1 + 0.3, { y: 16 }); show('bar', P0, P1 + 0.3, { y: 0, blur: 0 });
  show('e1', 16.0, null, { y: 26 }); show('e2', 16.4, null, { y: 26 }); show('e3', 17.0, null, { y: 16 });
}

export function renderAt(t) {
  apply(t);
  const cam = S.camera;
  const p = clamp((t - P0) / (P1 - P0));
  // falda: la primera línea alrededor, antes de empezar la pieza
  const ks = clamp((t - 0.15) / 1.5);
  SK.userData.update(ks, t < P0 ? NZ : null, { size: 0.42 });
  const { cut, box } = setPrint(TREE, t < P0 ? 0 : (p >= 1 ? 1 : Math.max(0.004, p)), 1);
  if (t >= P0 && p < 1) placeNozzle(NZ, cut, box, t * 1.25, { speed: 3.2, size: 0.45, piece: TREE });
  if (t >= P1) {
    const up = EASE.out(clamp((t - P1) / 1.4));
    parkNozzle(NZ, new THREE.Vector3(0.25, H + 0.05 + up * 1.2, 0.1), { size: 0.45, show: 1 - clamp((t - P1 - 0.6) / 0.8) });
  }
  // contador de capas
  const layer = t < P0 ? 0 : Math.round((p >= 1 ? H : cut) / LAYER);
  CNT.textContent = Math.max(0, layer);
  BAR.style.transform = `scaleX(${p.toFixed(4)})`;
  // la estrella de la punta se enciende al terminar
  const g = clamp((t - P1 - 0.3) / 1.2);
  GLOW.userData.set(g * (0.85 + 0.15 * Math.sin(t * 2.2)), t * 0.15);

  // cámara: empieza sobre la cama viendo la falda y se va alejando y subiendo con la impresión
  const T = Math.tan((17 * Math.PI) / 180);
  if (t < P0) {
    const k = EASE.io(t / P0);
    const a = lerp(0.1, 0.35, k), d = lerp(5.0, 5.4, k), ty = 0.62;
    cam.position.set(Math.sin(a) * d, ty + lerp(0.5, 0.42, k) * d * T * 2.2, Math.cos(a) * d);
    cam.lookAt(0, ty, 0);
  } else if (t < P1) {
    const k = (t - P0) / (P1 - P0), e = EASE.io(k);
    const a = 0.35 + k * 2.3, d = lerp(5.4, 7.0, e), ty = lerp(0.62, 0.95, e);
    cam.position.set(Math.sin(a) * d, Math.max(ty, cut) + lerp(0.92, 0.6, e) * d * T * 1.2, Math.cos(a) * d);
    cam.lookAt(0, ty, 0);
  } else {
    const k = EASE.io(clamp((t - P1) / 2.5));
    const a = 2.65 + (t - P1) * 0.1, d = lerp(7.0, 7.4, k), ty = lerp(0.95, 1.12, k);
    cam.position.set(Math.sin(a) * d, lerp(H + 0.6 * 7.0 * T * 1.2, ty + 1.0, k), Math.cos(a) * d);
    cam.lookAt(0, ty, 0);
  }
  S.render();
}
