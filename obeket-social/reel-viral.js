// Reel viral / humor (1080 × 1920, 15 s): "POV: es 24 de diciembre y no tienes regalo", rayado de
// disco, drop, ráfaga de regalos impresos en timelapse con rótulos tipo TikTok y cierre "comenta 🎄".
import { THREE, createStage, gift, nameTag, vase, bauble, tree, loadFont, nozzle, placeNozzle, setPrint, particles, frameCam } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 15;
export const MUSIC = 'viral';
export const SIZE = () => [1080, 1920];

const { tw, show, bg, apply } = createTimeline();
let S, SAD, TAG, VASE, BALL, LOGO, TREE, NZ, CONF, STAGE;
const lerp = (a, b, k) => a + (b - a) * k;
const pop = (id, a, b) => show(id, a, b, { y: 0, s: 0.6, blur: 0, dur: 0.18, outDur: 0.08, outY: 0, outS: 0.9 });
const COLS = [0xff6a13, 0x1e88e5, 0x2bb673, 0xe63e6d, 0xf2c14e];
const SEG = [[3.0, 4.5], [4.5, 6.0], [6.0, 7.5], [7.5, 9.0]]; // ráfaga: 4 regalos de 1,5 s

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg" style="background:radial-gradient(90% 60% at 50% 55%, #9b9ea3 0%, #6b6e73 70%, #4a4c50 100%)"></div>
    <div class="bg" id="bg1" style="background:#ff6a13"></div>
    <div class="bg" id="bg2" style="background:#1e88e5"></div>
    <div class="bg" id="bg3" style="background:#c8102e"></div>
    <div class="bg" id="bg4" style="background:#1d1d1f"></div>
    <div class="bg bg-pine" id="bg5"></div>
    <div class="bg" id="bg6" style="background:radial-gradient(100% 70% at 50% 60%, #fff 0%, #fdf1e6 60%, #f8dcc3 100%)"></div>
    <div class="bg" id="flash" style="background:#fff"></div>`;
  const n = CONFIG.nombres[1];
  document.getElementById('fg').innerHTML = `
    <div id="v1" class="abs row" style="top:330px"><span class="tt">POV: es 24 de diciembre<br>y aún no tienes regalo <span class="emoji">😰</span></span></div>
    <div id="v_q" class="abs center emoji" style="top:560px;font-size:120px">❓</div>
    <div id="v2" class="abs row" style="top:760px"><span class="tt or" style="font-size:110px;padding:20px 50px 26px">tranqui <span class="emoji">😎</span></span></div>
    <div id="c1" class="abs row" style="top:330px"><span class="tt"><span class="emoji">✅</span> con su nombre</span></div>
    <div id="c2" class="abs row" style="top:330px"><span class="tt"><span class="emoji">✅</span> en su color favorito</span></div>
    <div id="c3" class="abs row" style="top:330px"><span class="tt"><span class="emoji">✅</span> para colgar del árbol</span></div>
    <div id="c4" class="abs row" style="top:330px"><span class="tt"><span class="emoji">✅</span> y para la oficina</span></div>
    <div id="tl" class="abs" style="right:70px;top:250px;font-size:30px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.85)">TIMELAPSE ×300</div>
    <div id="v3" class="abs row" style="top:330px"><span class="tt">y nadie más en el mundo<br>tiene uno igual <span class="emoji">🤯</span></span></div>
    <div id="v4" class="abs row" style="top:300px"><span class="tt dark" style="font-size:60px;max-width:980px">comenta <span class="emoji">🎄</span><br>y te decimos cómo pedirlo</span></div>
    <div id="v4b" class="abs center" style="top:500px;font-size:34px;font-weight:700;color:#6e6e73">regalos impresos en 3D · pedidos hasta el ${CONFIG.fechaLimite}</div>
    <div id="v4c" class="abs center emoji" style="top:1440px;font-size:130px">👇</div>
    <div id="v4d" class="abs center" style="top:1610px;font-size:40px;font-weight:800;letter-spacing:.06em;color:#1d1d1f">${CONFIG.usuario}</div>`;

  STAGE = document.getElementById('stage');
  S = createStage(document.getElementById('gl'), 1080, 1920, 26);
  await loadFont();
  SAD = gift(0x8d9096, 0x8d9096); S.scene.add(SAD);
  TAG = nameTag(n, { plate: 0xffffff, letters: 0xff6a13 }); S.scene.add(TAG);
  VASE = vase(); S.scene.add(VASE);
  BALL = bauble(0xf2c14e); S.scene.add(BALL);
  LOGO = nameTag('TU LOGO', { plate: 0xffffff, letters: 0x1d1d1f }); S.scene.add(LOGO);
  TREE = tree(); S.scene.add(TREE);
  NZ = nozzle(); S.scene.add(NZ);
  CONF = particles(380, { spread: [6, 9, 3], size: 0.07, color: 0xf2c14e, seed: 3 }); CONF.position.set(0, 1.5, -0.8); S.scene.add(CONF);

  pop('v1', 0.1, 2.4); show('v_q', 0.6, 2.4, { y: -20, s: 0.5, dur: 0.3, outDur: 0.08 });
  tw('flash', 0, 0.01, { o: 0 }, { o: 0 }); tw('flash', 2.45, 0.05, { o: 0 }, { o: 1 }); tw('flash', 2.5, 0.25, { o: 1 }, { o: 0 }, 'out');
  tw('flash', 8.95, 0.04, { o: 0 }, { o: 0.9 }); tw('flash', 9.0, 0.2, { o: 0.9 }, { o: 0 }, 'out');
  bg('bg1', 2.5, 4.5, 0.01); pop('v2', 2.5, 2.98);
  ['bg1', 'bg2', 'bg3', 'bg4'].forEach((b, i) => { if (i) bg(b, SEG[i][0], SEG[i][1], 0.01); });
  ['c1', 'c2', 'c3', 'c4'].forEach((c, i) => pop(c, SEG[i][0] + 0.02, SEG[i][1] - 0.04));
  show('tl', 3.0, 8.96, { y: 0, blur: 0, dur: 0.1, outDur: 0.05 });
  bg('bg5', 9, 12, 0.01); pop('v3', 9.05, 11.96);
  bg('bg6', 12, null, 0.01); pop('v4', 12.05, null); show('v4b', 12.3, null, { y: 16 });
  show('v4c', 12.5, null, { y: -40, dur: 0.35 }); show('v4d', 12.7, null, { y: 16 });
}

export function renderAt(t) {
  apply(t);
  const cam = (...a) => frameCam(S.camera, ...a);
  [SAD, TAG, VASE, BALL, LOGO, TREE].forEach((g) => (g.visible = false));
  NZ.visible = false; CONF.visible = t >= 9 && t < 12; CONF.userData.update(t, 0.9);
  // golpe de zoom al principio de cada corte + temblor en el drop
  const cuts = [0, 2.5, 3, 4.5, 6, 7.5, 9, 12];
  const last = cuts.filter((c) => c <= t).pop(), dt = t - last;
  const punch = 1 + 0.07 * Math.exp(-dt * 9);
  const shake = t >= 2.5 && t < 3 ? Math.sin(t * 90) * 10 * (1 - (t - 2.5) * 2) : 0;
  const bounce = t >= 12.5 ? Math.abs(Math.sin((t - 12.5) * 5)) * -24 : 0;
  STAGE.style.transform = `translate(${shake.toFixed(1)}px, 0) scale(${punch.toFixed(4)})`;
  document.getElementById('v4c').style.marginTop = `${bounce.toFixed(1)}px`;

  if (t < 3) { // regalo triste, gris, girando despacio
    SAD.visible = true; setPrint(SAD, 1);
    SAD.rotation.y = 0.4 + t * 0.25; SAD.rotation.z = Math.sin(t * 2) * 0.04;
    SAD.scale.setScalar(t < 2.5 ? 0.8 : 0.8 * (1 - (t - 2.5) * 2));
    cam(7.6, 0.5, 0.25, 0, 1.4);
  } else if (t < 9) { // ráfaga en timelapse
    const i = SEG.findIndex(([a, b]) => t >= a && t < b), [a] = SEG[i];
    const g = [TAG, VASE, BALL, LOGO][i]; g.visible = true;
    const p = clamp((t - a) / 0.85);
    g.scale.setScalar([0.6, 0.9, 0.9, 0.55][i]);
    g.rotation.y = (i === 0 || i === 3) ? Math.sin((t - a) * 3) * 0.3 : (t - a) * 2.2;
    if (i === 1) { const f = Math.floor((t - a) * 6) % COLS.length; VASE.children[0].material.color.set(COLS[f]); }
    const { cut, box } = setPrint(g, p, 1.2);
    placeNozzle(NZ, cut, box, t * 3, { speed: 14, show: p < 1 ? 1 : 0, size: 0.45 });
    cam(7.6, [0.3, 0.72, 0.62, 0.3][i], 0.25, 0, 0.5);
  } else if (t < 12) {
    TREE.visible = true; setPrint(TREE, 1);
    TREE.rotation.y = t * 2.4; TREE.scale.setScalar(0.85);
    cam(8.6, 0.85, 0.25, 0, 0.6);
  } else {
    BALL.visible = true; setPrint(BALL, 1);
    BALL.children[0].material.color.set(0xc8102e);
    BALL.rotation.y = t * 0.8; BALL.scale.setScalar(0.7);
    cam(7.6, 0.5, 0.15, 0, 0.5);
  }
  S.render();
}
