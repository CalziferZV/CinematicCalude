// Reel de Reyes (1080 × 1920, 18 s): noche en el desierto, la estrella de Oriente baja brillando y se
// imprimen las tres coronas de los Reyes Magos; luego aparecen sus nombres y la fecha límite de Reyes.
import { THREE, createStage, crown, star, nameTag, starGlow, nozzle, placeNozzle, setPrint, contactShadow, loadFont, orbitCam } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 18;
export const SIZE = () => [1080, 1920];

const { tw, show, apply } = createTimeline();
const lerp = (a, b, k) => a + (b - a) * k;
const PRINTS = [[3.3, 5.0], [5.1, 6.8], [6.9, 8.6]];
let S, STAR, GLOW, CROWNS, TAGS, NZ, SKY;

export async function init() {
  let sd = 9; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 80 }, () => `<i data-p="${(r() * 6.28).toFixed(2)}" data-s="${(0.6 + r() * 1.8).toFixed(2)}" style="position:absolute;left:${(r() * 1080).toFixed(0)}px;top:${(r() * 1050).toFixed(0)}px;width:${(2 + r() * 4).toFixed(1)}px;height:${(2 + r() * 4).toFixed(1)}px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.8)"></i>`).join('');
  document.getElementById('bgs').innerHTML = `
    <div class="bg" style="background:radial-gradient(120% 70% at 50% 30%, #22357e 0%, #111d52 45%, #0b1336 75%, #0a1030 100%)"></div>
    <div id="sky" class="abs" style="inset:0">${stars}</div>`;
  document.getElementById('fg').innerHTML = `
    <div id="k" class="abs center kicker gold-k" style="top:250px">Noche de Reyes</div>
    <div id="a1" class="abs center h-l white" style="top:310px">Este año,</div>
    <div id="a2" class="abs center h-l white" style="top:415px">los Reyes Magos…</div>
    <div id="b1" class="abs center h-l white" style="top:310px">…también imprimen</div>
    <div id="b2" class="abs center h-l" style="top:415px"><span class="gold">en 3D</span> <span class="emoji">👑</span></div>
    <div id="c1" class="abs center h-l white" style="top:310px">Coronas, estrellas</div>
    <div id="c2" class="abs center h-l" style="top:415px"><span class="gold">y regalos con nombre</span></div>
    <div id="d1" class="abs center h-l white" style="top:310px">Pedidos para Reyes</div>
    <div id="d2" class="abs center h-l" style="top:415px"><span class="gold">hasta el ${CONFIG.fechaReyes}</span></div>
    <div id="d3" class="abs row" style="top:1440px"><span class="btn goldb">Escríbenos por DM</span></div>
    <div id="d4" class="abs center handle white" style="top:1592px;opacity:.75">${CONFIG.usuario} · ${CONFIG.marca}</div>`;
  SKY = [...document.querySelectorAll('#sky i')];

  S = createStage(document.getElementById('gl'), 1080, 1920, 30);
  S.scene.environmentIntensity = 0.35;
  S.key.color.set(0xffe0a8); S.key.intensity = 2.2; S.key.position.set(0.5, 4, 2.5);
  S.rim.color.set(0x7d95ff); S.rim.intensity = 1.6; S.rim.position.set(-3, 2, -3);
  S.scene.fog = new THREE.Fog(0x0b1336, 7, 20);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x1a2350, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; S.scene.add(ground);
  await loadFont();
  STAR = star(0xf2c14e, { metal: 0.9 }); STAR.scale.setScalar(0.17); S.scene.add(STAR);
  GLOW = starGlow(0xffe2a0, 0.95); S.scene.add(GLOW);
  const sl = new THREE.PointLight(0xffd27a, 0, 6, 1.6); GLOW.add(sl); GLOW.userData.light = sl;
  const defs = [[0xd9a441, [0xc8102e, 0x1e5bd8, 0x1f9a5a], 0, 0.32], [0xd9dde3, [0x1e5bd8, 0x8a2be2, 0x1f9a5a], -0.47, -0.32], [0xb87333, [0x1f9a5a, 0xc8102e, 0xf2c14e], 0.47, -0.32]];
  CROWNS = defs.map(([c, gems, x, z]) => { const g = crown(c, gems, { metal: c === 0xd9dde3 ? 0.9 : 0.85 }); g.scale.setScalar(0.7); g.position.set(x, 0, z); S.scene.add(g); const sh = contactShadow(0.45, 0.45); sh.position.set(x, 0.001, z); S.scene.add(sh); g.userData.sh = sh; return g; });
  TAGS = [['MELCHOR', 0xd9a441, 0x3a2400], ['GASPAR', 0xd9dde3, 0x1e2a5a], ['BALTASAR', 0xb87333, 0xfff1dc]].map(([n, pl, le], i) => {
    const g = nameTag(n, { plate: pl, letters: le });
    g.position.set([0, -0.43, 0.43][i], 0, 0.8); g.rotation.x = -0.3; S.scene.add(g); setPrint(g, 1); return g;
  });
  NZ = nozzle(); S.scene.add(NZ);

  show('k', 0.3, 3.0, { y: 14 }); show('a1', 0.4, 3.05, { y: 26 }); show('a2', 0.8, 3.1, { y: 26 });
  show('b1', 3.3, 8.6, { y: 26 }); show('b2', 3.7, 8.65, { y: 26 });
  show('c1', 8.85, 12.8, { y: 26 }); show('c2', 9.2, 12.85, { y: 26 });
  show('d1', 13.0, null, { y: 26 }); show('d2', 13.35, null, { y: 26 });
  show('d3', 13.9, null, { y: 30, s: 0.92 }); show('d4', 14.2, null, { y: 16 });
}

export function renderAt(t) {
  apply(t);
  SKY.forEach((el) => { el.style.opacity = (0.35 + 0.65 * Math.abs(Math.sin(t * +el.dataset.s + +el.dataset.p))).toFixed(3); });
  // la estrella de Oriente baja y brilla
  const k = EASE.out(clamp(t / 3.2));
  const sy = lerp(1.55, 0.8, k);
  STAR.position.set(0, sy - 0.135, 0.1); STAR.rotation.y = Math.sin(t * 0.8) * 0.35;
  setPrint(STAR, 1);
  GLOW.position.set(0, sy, 0.12);
  GLOW.userData.set((0.25 + 0.75 * k) * (0.9 + 0.1 * Math.sin(t * 2.4)), t * 0.12);
  GLOW.userData.light.intensity = 3.5 * k;
  // coronas, una detrás de otra
  NZ.visible = false; NZ.userData.trail.visible = false;
  CROWNS.forEach((c, i) => {
    const [a, b] = PRINTS[i];
    const p = clamp((t - a) / (b - a));
    c.rotation.y = 0.3 + Math.max(0, t - b) * 0.35 * (i % 2 ? -1 : 1);
    c.userData.sh.visible = p > 0;
    const { cut, box } = setPrint(c, p >= 1 ? 1 : p, 1);
    if (p > 0 && p < 1) placeNozzle(NZ, cut, box, t * 1.5, { speed: 3.2, size: 0.3, piece: c });
  });
  // sus nombres
  TAGS.forEach((g, i) => { const s = EASE.back(clamp((t - 8.9 - i * 0.25) / 0.5)); g.visible = s > 0.001; g.scale.setScalar(0.11 * Math.max(0.001, s)); g.rotation.y = Math.sin(t * 0.9 + i) * 0.12; });
  orbitCam(S.camera, [0, 0.5, 0], lerp(5.7, 5.3, EASE.io(clamp(t / 18))), 0.12, Math.sin(t * 0.22) * 0.12, 0);
  S.render();
}
