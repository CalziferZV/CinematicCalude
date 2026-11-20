// Reel corto de urgencia (1080 × 1920, 12 s): "Últimos días para pedir" con la fecha límite.
import { createStage, gift, bauble, loadFont, nozzle, placeNozzle, setPrint, particles, frameCam } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 12;
export const MUSIC = 'navidad';
export const SIZE = () => [1080, 1920];
const { tw, show, bg, apply } = createTimeline();
const punch = (id, tin, tout, extra = {}) => show(id, tin, tout, { y: 0, s: 1.14, blur: 16, dur: 0.38, outDur: 0.2, outY: -12, ...extra });
let S, G, B, NZ, SNOW;
const lerp = (a, b, k) => a + (b - a) * k;
const [dia, ...mes] = CONFIG.fechaLimite.split(' de ');

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg bg-wine"></div><div class="bg bg-pine" id="bgB"></div>
    <div id="halo" class="abs glow goldg" style="left:40px;top:760px;width:1000px;height:1000px"></div>`;
  document.getElementById('fg').innerHTML = `
    <div id="a_pill" class="abs row" style="top:300px;color:#f2c14e"><span class="pill"><i></i>Aviso de Navidad</span></div>
    <div id="a_t" class="abs center h-xxl white" style="top:400px">Últimos<br><span class="gold">días.</span></div>
    <div id="a_s" class="abs center sub white" style="top:730px">para pedir tus regalos impresos en 3D</div>
    <div id="b_cal" class="abs" style="left:340px;top:320px;width:400px;border-radius:44px;overflow:hidden;background:#fff;box-shadow:0 40px 90px rgba(0,0,0,.45);text-align:center">
      <div style="background:#c8102e;color:#fff;font-size:44px;font-weight:800;letter-spacing:.18em;padding:22px 0;text-transform:uppercase">${mes.join(' de ')}</div>
      <div style="font-size:230px;font-weight:800;letter-spacing:-.06em;line-height:1.1;padding:10px 0 24px">${dia}</div>
    </div>
    <div id="b_t" class="abs center h-m white" style="top:860px">Último día para pedir<br>y recibir <span class="gold">antes de Navidad</span></div>
    <div id="b_btn" class="abs row" style="top:1420px"><span class="btn goldb">${CONFIG.contacto}</span></div>
    <div id="b_h" class="abs center handle white" style="top:1580px;opacity:.8">${CONFIG.usuario} · ${CONFIG.marca}</div>`;
  S = createStage(document.getElementById('gl'), 1080, 1920, 26);
  await loadFont();
  G = gift(0xf5f1e8, 0xc8102e); S.scene.add(G);
  B = bauble(0xf2c14e); S.scene.add(B);
  NZ = nozzle(); S.scene.add(NZ);
  SNOW = particles(500, { spread: [7, 9, 3], size: 0.04 }); SNOW.position.set(0, 1.2, -1.2); S.scene.add(SNOW);
  tw('halo', 0, 1, { o: 0, s: 0.7 }, { o: 1, s: 1 }, 'out');
  bg('bgB', 6, null, 0.25);
  show('a_pill', 0.1, 5.8, { y: 16 }); punch('a_t', 0.3, 5.8); show('a_s', 0.8, 5.82, { y: 20 });
  tw('b_cal', 6.05, 0.55, { o: 0, y: -60, r: -8, s: 0.8 }, { o: 1, y: 0, r: -4, s: 1 }, 'back');
  show('b_t', 6.4, null, { y: 30 }); show('b_btn', 7.0, null, { y: 40, s: 0.9 }); show('b_h', 7.3, null, { y: 20 });
}

export function renderAt(t) {
  apply(t);
  const cam = (...a) => frameCam(S.camera, ...a);
  SNOW.userData.update(t, 0.35);
  G.visible = t < 6; B.visible = t >= 6; NZ.visible = false;
  if (t < 6) {
    const p = clamp((t - 0.1) / 3.4);
    G.rotation.y = 0.5 + t * 0.4; G.scale.setScalar(0.8);
    const { cut, box } = setPrint(G, p);
    placeNozzle(NZ, cut, box, t, { speed: 12, show: p < 1 ? 1 : 0 });
    cam(8.2, 0.5, 0.3, 0, 0.9);
  } else {
    const k = EASE.outQ(clamp((t - 6) / 1));
    B.scale.setScalar(lerp(0.3, 0.5, k)); B.rotation.y = t * 0.6; setPrint(B, 1);
    cam(7.6, 0.25, 0.3, 0, 0.4);
  }
  S.render();
}
