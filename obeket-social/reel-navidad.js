// Reel de la campaña de Navidad (1080 × 1920, 22 s): una bola que se imprime bajo la nieve, adornos
// con nombre, árbol y estrella, ideas de regalo y llamada a la acción con fecha límite.
import { THREE, createStage, bauble, nameTag, tree, star, gift, loadFont, nozzle, placeNozzle, setPrint, contactShadow, particles, frameCam } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 22;
export const MUSIC = 'navidad';
export const SIZE = () => [1080, 1920];

const { tw, show, bg, apply } = createTimeline();
const punch = (id, tin, tout, extra = {}) => show(id, tin, tout, { y: 0, s: 1.14, blur: 16, dur: 0.38, outDur: 0.2, outY: -12, ...extra });
let S, BALL, TAGS, TREE, GIFT, B2, T2, ST2, NZ, SH, SNOW, GOLD;
const lerp = (a, b, k) => a + (b - a) * k;

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg bg-black"></div>
    <div class="bg bg-pine" id="bgA"></div>
    <div class="bg bg-cream" id="bgB"></div>
    <div class="bg bg-wine" id="bgC"></div>
    <div class="bg bg-cream" id="bgD"></div>
    <div class="bg bg-pine" id="bgE"></div>
    <div id="halo" class="abs glow goldg" style="left:40px;top:760px;width:1000px;height:1000px"></div>`;
  document.getElementById('fg').innerHTML = `
    <div id="a_k" class="abs center kicker gold-k" style="top:300px">${CONFIG.marca} · Navidad</div>
    <div id="a_t1" class="abs center h-xl white" style="top:370px">Esta Navidad,</div>
    <div id="a_t2" class="abs center h-xl" style="top:500px"><span class="gold">regala algo único.</span></div>

    <div id="b_k" class="abs center kicker" style="top:300px;color:#c8102e">Adornos personalizados</div>
    <div id="b_t" class="abs center h-xl" style="top:370px">Con su <span style="color:#c8102e">nombre.</span></div>
    <div id="b_s" class="abs center sub" style="top:510px">Para cada persona de la familia</div>

    <div id="c_t" class="abs center h-xl white" style="top:330px">Decora tu<br><span class="gold">Navidad.</span></div>
    <div id="c_s" class="abs center sub white" style="top:600px">Árboles, estrellas y bolas impresas en 3D</div>

    <div id="d_t" class="abs center h-xl" style="top:300px">Ideas de <span style="color:#c8102e">regalo</span></div>
    <div id="d_chips" class="abs row" style="top:1600px;left:70px;right:70px;gap:16px">
      <span class="chip"><i style="background:#c8102e"></i>Adornos con nombre</span><span class="chip"><i style="background:#1f7a4d"></i>Llaveros</span>
      <span class="chip"><i style="background:#f2c14e"></i>Figuras</span><span class="chip"><i></i>Lámparas</span><span class="chip"><i style="background:#1d1d1f"></i>Regalos de empresa</span>
    </div>

    <div id="e_pill" class="abs row" style="top:300px;color:#f2c14e"><span class="pill"><i></i>Pide antes del ${CONFIG.fechaLimite}</span></div>
    <div id="e_t" class="abs center h-xl white" style="top:410px">Llega a tiempo<br>para <span class="gold">Navidad.</span></div>
    <div id="e_btn" class="abs row" style="top:1400px"><span class="btn goldb">${CONFIG.contacto}</span></div>
    <div id="e_h" class="abs center handle white" style="top:1560px;opacity:.8">${CONFIG.usuario}</div>`;

  S = createStage(document.getElementById('gl'), 1080, 1920, 26);
  await loadFont();
  BALL = bauble(0xc8102e); S.scene.add(BALL);
  const tagColors = [[0xf5f1e8, 0xc8102e], [0xc8102e, 0xf5f1e8], [0x1f7a4d, 0xf2c14e]];
  TAGS = CONFIG.nombres.slice(0, 3).map((n, i) => { const g = nameTag(n, { plate: tagColors[i][0], letters: tagColors[i][1] }); S.scene.add(g); return g; });
  TREE = tree(); S.scene.add(TREE);
  GIFT = gift(); S.scene.add(GIFT);
  B2 = bauble(0xf2c14e); B2.children.forEach((m) => {}); S.scene.add(B2);
  T2 = tree(); S.scene.add(T2);
  ST2 = star(0xc8102e, { metal: 0.1 }); S.scene.add(ST2);
  NZ = nozzle(); S.scene.add(NZ);
  SH = contactShadow(1.3, 0.3); S.scene.add(SH);
  SNOW = particles(500, { spread: [7, 9, 3], size: 0.04 }); SNOW.position.set(0, 1.2, -1.2); S.scene.add(SNOW);
  GOLD = particles(260, { spread: [7, 9, 3], size: 0.05, color: 0xf2c14e, seed: 31 }); GOLD.position.set(0, 1.2, -1.2); S.scene.add(GOLD);

  tw('halo', 0, 1, { o: 0, s: 0.7 }, { o: 1, s: 1 }, 'out'); tw('halo', 5.7, 0.4, { o: 1 }, { o: 0 }, 'in');
  tw('halo', 10, 0.4, { o: 0 }, { o: 1 }, 'out'); tw('halo', 13.7, 0.4, { o: 1 }, { o: 0 }, 'in');
  tw('halo', 18, 0.4, { o: 0 }, { o: 1 }, 'out');
  bg('bgA', 0, 6, 0.01); bg('bgB', 6, 10, 0.2); bg('bgC', 10, 14, 0.2); bg('bgD', 14, 18, 0.2); bg('bgE', 18, null, 0.2);
  show('a_k', 0.15, 5.75, { y: 16 }); show('a_t1', 0.4, 5.8, { y: 30 }); punch('a_t2', 2.0, 5.82);
  show('b_k', 6.05, 9.8, { y: 16 }); punch('b_t', 6.1, 9.82); show('b_s', 6.5, 9.84, { y: 20 });
  punch('c_t', 10.04, 13.8); show('c_s', 10.5, 13.82, { y: 20 });
  punch('d_t', 14.04, 17.8);
  ['d_chips'].forEach((id) => show(id, 15.2, 17.84, { y: 40 }));
  show('e_pill', 18.1, null, { y: 20 }); punch('e_t', 18.3, null); show('e_btn', 18.9, null, { y: 40, s: 0.9 }); show('e_h', 19.2, null, { y: 20 });
}

export function renderAt(t) {
  apply(t);
  const cam = (...a) => frameCam(S.camera, ...a);
  BALL.visible = t < 6; TAGS.forEach((g) => (g.visible = false)); TREE.visible = t >= 10 && t < 14; GIFT.visible = t >= 14 && t < 18;
  B2.visible = T2.visible = ST2.visible = t >= 18;
  NZ.visible = false; SH.visible = true;
  SNOW.visible = t < 6 || t >= 18; GOLD.visible = t >= 10 && t < 14;
  SNOW.userData.update(t, 0.3); GOLD.userData.update(t, 0.15);

  if (t < 6) {
    const p = clamp((t - 0.1) / 3.6);
    BALL.rotation.y = t * 0.5;
    const { cut, box } = setPrint(BALL, p);
    placeNozzle(NZ, cut, box, t, { speed: 9, show: clamp(t / 0.3) * (p < 1 ? 1 : 0) });
    const k = EASE.io(clamp(t / 6));
    cam(lerp(6.4, 7.6, k), lerp(0.55, 0.75, k), 0.24, 0.25 - k * 0.4, lerp(1.4, 0.5, k));
    SH.visible = false;
  } else if (t < 10) {
    const i = Math.min(2, Math.floor((t - 6) / 1.333)), t0 = 6 + i * 1.333;
    const g = TAGS[i]; g.visible = true;
    const p = clamp((t - t0 - 0.03) / 0.5);
    g.scale.setScalar(0.62);
    g.rotation.y = Math.sin((t - t0) * 1.6 - 0.6) * 0.3;
    const { cut, box } = setPrint(g, p);
    placeNozzle(NZ, cut, box, t, { speed: 16, show: p < 1 ? 1 : 0, size: 0.45 });
    cam(7.4, 0.32, 0.28, 0, 0.3);
  } else if (t < 14) {
    const p = clamp((t - 10.05) / 2.4);
    TREE.rotation.y = t * 0.45; TREE.scale.setScalar(0.82);
    const { cut, box } = setPrint(TREE, p);
    placeNozzle(NZ, cut, box, t, { speed: 11, show: p < 1 ? 1 : 0 });
    const k = EASE.io(clamp((t - 10) / 4));
    cam(lerp(8.6, 9.4, k), 0.8, 0.2, 0.3 - k * 0.5, 0.5);
    SH.visible = false;
  } else if (t < 18) {
    const p = clamp((t - 14.05) / 1.9);
    GIFT.rotation.y = 0.6 + t * 0.35;
    GIFT.scale.setScalar(0.85);
    const { cut, box } = setPrint(GIFT, p);
    placeNozzle(NZ, cut, box, t, { speed: 12, show: p < 1 ? 1 : 0 });
    cam(7.6, 0.6, 0.18, 0, 1.0);
  } else {
    const k = EASE.outQ(clamp((t - 18) / 1.2));
    T2.scale.setScalar(0.62); T2.position.set(0, 0, -0.3); T2.rotation.y = t * 0.4; setPrint(T2, 1);
    B2.scale.setScalar(0.42); B2.position.set(-0.62, 0, 0.35); B2.rotation.y = -t * 0.5; setPrint(B2, 1);
    ST2.scale.setScalar(0.32); ST2.position.set(0.62, 0, 0.35); ST2.rotation.y = Math.sin(t * 1.2) * 0.5; setPrint(ST2, 1);
    cam(lerp(7.6, 8.6, k), 0.5, 0.02, 0, 0.6);
    SH.visible = false;
  }
  S.render();
}
