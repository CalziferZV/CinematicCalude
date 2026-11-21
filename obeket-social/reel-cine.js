// Reel cinematográfico (1080 × 1920, 18 s): bandas de cine, grano, planos macro de la boquilla y de
// las capas, cambio de enfoque, luces de Navidad desenfocadas y casi sin texto.
import { THREE, createStage, bauble, nameTag, tree, star, loadFont, nozzle, placeNozzle, setPrint } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 18;
export const MUSIC = 'cine';
export const SIZE = () => [1080, 1920];

const { tw, show, apply } = createTimeline();
let S, BALL, TAG, TREE, B2, ST, NZ, GL, GRAIN, gctx, gimg;
const lerp = (a, b, k) => a + (b - a) * k;
const sub = (id, a, b) => show(id, a, b, { y: 10, blur: 10, dur: 0.9, outDur: 0.6, outY: -6 });

// luces de Navidad desenfocadas (círculos de bokeh deterministas)
function bokehHTML(n, seed, colors) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let h = '';
  for (let i = 0; i < n; i++) {
    const size = 40 + r() * 150, c = colors[Math.floor(r() * colors.length)];
    h += `<div class="bokeh" data-ph="${(r() * 6.28).toFixed(2)}" data-sp="${(0.3 + r() * 0.8).toFixed(2)}" style="left:${(r() * 1080 - size / 2).toFixed(0)}px;top:${(200 + r() * 1500 - size / 2).toFixed(0)}px;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;background:radial-gradient(circle, ${c} 0%, ${c}88 45%, transparent 70%)"></div>`;
  }
  return h;
}

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg" style="background:radial-gradient(80% 50% at 50% 55%, #1b130d 0%, #070504 70%, #000 100%)"></div>
    <div id="bk" class="abs" style="inset:0">${bokehHTML(26, 5, ['#ffb35c', '#ff7a2a', '#ffd88a', '#ff5b3a'])}</div>`;
  document.getElementById('fg').innerHTML = `
    <div class="abs" style="inset:0;background:radial-gradient(120% 75% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)"></div>
    <canvas id="grain" width="360" height="640" class="abs" style="inset:0;width:1080px;height:1920px;opacity:.10;mix-blend-mode:overlay"></canvas>
    <div id="s1" class="abs center cine-sub" style="top:1430px">Cada capa mide 0,2 milímetros.</div>
    <div id="s2" class="abs center cine-sub" style="top:1430px">Miles de capas…</div>
    <div id="s3" class="abs center cine-sub" style="top:1430px">…para una sola idea.</div>
    <div id="s4" class="abs center cine-sub" style="top:1580px">Su nombre. Su Navidad.</div>
    <div id="card" class="abs" style="inset:0;background:#000"></div>
    <div id="t_brand" class="abs center cine-title" style="top:800px">${CONFIG.marca}</div>
    <div id="t_line" class="abs" style="left:440px;width:200px;top:990px;height:2px;background:#ff6a13"></div>
    <div id="t_sub" class="abs center cine-small" style="top:1030px">Regalos impresos en 3D · Navidad</div>
    <div id="t_h" class="abs center" style="top:1130px;font-size:34px;font-weight:500;letter-spacing:.12em;color:rgba(243,236,226,.55)">${CONFIG.usuario}</div>
    <div id="barT" class="bar" style="top:0"></div><div id="barB" class="bar" style="bottom:0"></div>`;

  S = createStage(document.getElementById('gl'), 1080, 1920, 30);
  S.scene.environmentIntensity = 0.32;
  S.key.intensity = 0.9; S.key.position.set(2, 4, 3);
  S.rim.intensity = 3.2; S.rim.color.set(0xffa04a); S.rim.position.set(-3, 1.5, -2.5);
  const warm = new THREE.PointLight(0xffb35c, 6, 6, 2); warm.position.set(1.5, 1.2, 1.5); S.scene.add(warm);
  await loadFont();
  BALL = bauble(0xb00f28); S.scene.add(BALL);
  TAG = nameTag(CONFIG.nombres[0], { plate: 0xf3ece2, letters: 0xb00f28 }); S.scene.add(TAG);
  TREE = tree(0x1b6b44); TREE.scale.setScalar(0.85); S.scene.add(TREE);
  B2 = bauble(0xd9a441); B2.scale.setScalar(0.42); B2.position.set(-0.7, 0, 0.45); S.scene.add(B2);
  ST = star(0xb00f28, { metal: 0.2 }); ST.scale.setScalar(0.3); ST.position.set(0.72, 0, 0.45); S.scene.add(ST);
  NZ = nozzle(); S.scene.add(NZ);
  GL = document.getElementById('gl');
  GRAIN = document.getElementById('grain'); gctx = GRAIN.getContext('2d'); gimg = gctx.createImageData(360, 640);

  tw('bk', 0, 1.5, { o: 0 }, { o: 0.35 }, 'out');
  tw('bk', 11.6, 1.2, { o: 0.35 }, { o: 1 }, 'io');
  tw('barT', 0, 0.01, { o: 1 }, { o: 1 });
  sub('s1', 0.9, 3.5); sub('s2', 4.4, 5.9); sub('s3', 6.1, 7.7); sub('s4', 9.9, 11.7);
  tw('card', 0, 0.01, { o: 1 }, { o: 1 }); tw('card', 0.0, 0.9, { o: 1 }, { o: 0 }, 'io');
  tw('card', 15.3, 0.5, { o: 0 }, { o: 1 }, 'in');
  tw('t_brand', 15.7, 1.4, { o: 0, ls: 0.6, blur: 20 }, { o: 1, ls: 0.32, blur: 0 }, 'outQ');
  tw('t_line', 16.3, 0.8, { o: 0, s: 0.2 }, { o: 1, s: 1 }, 'outQ');
  show('t_sub', 16.5, null, { y: 14, dur: 0.9 }); show('t_h', 16.9, null, { y: 10, dur: 0.9 });
}

function grain(t) {
  let s = (Math.floor(t * 30) * 7919 + 1) % 2147483647;
  const d = gimg.data;
  for (let i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; const v = (s & 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  gctx.putImageData(gimg, 0, 0);
}

export function renderAt(t) {
  apply(t);
  grain(t);
  document.querySelectorAll('#bk .bokeh').forEach((b) => { b.style.transform = `translateY(${(Math.sin(t * +b.dataset.sp + +b.dataset.ph) * 18).toFixed(1)}px)`; });
  const cam = S.camera;
  BALL.visible = t < 8; TAG.visible = t >= 8 && t < 12; TREE.visible = B2.visible = ST.visible = t >= 12;
  NZ.visible = false;
  let blur = 0;

  if (t < 4) { // macro: la boquilla deposita la capa
    BALL.rotation.y = 0;
    const p = lerp(0.16, 0.66, t / 4);
    const { cut, box } = setPrint(BALL, p, 0.9);
    placeNozzle(NZ, cut, box, t + 0.45, { speed: 3.2, show: 1, size: 0.5, piece: BALL });
    const k = EASE.io(t / 4);
    cam.fov = 30; cam.updateProjectionMatrix();
    cam.position.set(lerp(1.2, 0.7, k), lerp(2.4, 2.35, k), lerp(4.0, 3.65, k));
    cam.lookAt(0, lerp(0.42, 0.62, k), 0);
    blur = lerp(12, 0, EASE.io(clamp((t - 0.1) / 1.3)));
  } else if (t < 8) { // macro rasante sobre las capas terminadas
    setPrint(BALL, 1);
    BALL.rotation.y = 0;
    const k = (t - 4) / 4, a = -0.4 + k * 1.3, y = lerp(0.38, 1.02, EASE.io(k));
    cam.fov = 34; cam.updateProjectionMatrix();
    cam.position.set(Math.cos(a) * 1.15, y, Math.sin(a) * 1.15);
    cam.lookAt(Math.cos(a + 0.5) * 0.3, y + 0.05 * k, Math.sin(a + 0.5) * 0.3);
    blur = t < 4.6 ? lerp(10, 0, EASE.out((t - 4) / 0.6)) : 0;
  } else if (t < 12) { // nombre: del detalle de las letras a la pieza entera
    setPrint(TAG, 1);
    const k = EASE.io((t - 8) / 4);
    TAG.rotation.y = lerp(-0.35, 0.15, k);
    cam.fov = 30; cam.updateProjectionMatrix();
    cam.position.set(lerp(-0.75, 0.1, k), lerp(0.42, 0.62, k), lerp(1.1, 4.4, k));
    cam.lookAt(lerp(-0.55, 0, k), lerp(0.38, 0.5, k), 0);
    blur = t < 9.2 ? lerp(12, 0, EASE.io((t - 8) / 1.2)) : 0;
  } else { // revelación: el conjunto entre luces
    [TREE, B2, ST].forEach((g) => setPrint(g, 1));
    TREE.rotation.y = t * 0.25; B2.rotation.y = -t * 0.3; ST.rotation.y = Math.sin(t) * 0.4;
    const k = EASE.out(clamp((t - 12) / 3.5));
    cam.fov = 28; cam.updateProjectionMatrix();
    const d = lerp(8.6, 7.2, k), a = lerp(0.45, 0.08, k);
    cam.position.set(Math.sin(a) * d, lerp(1.2, 1.5, k), Math.cos(a) * d);
    cam.lookAt(0, 0.72, 0);
    blur = t < 12.8 ? lerp(16, 0, EASE.out((t - 12) / 0.8)) : 0;
  }
  GL.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : '';
  S.render();
}
