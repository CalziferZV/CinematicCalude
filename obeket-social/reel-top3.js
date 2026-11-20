// Reel "Top 3" (1080 × 1920, 18 s): cuenta atrás de regalos; cada uno empieza como un boceto a mano
// sobre papel cuadriculado y se convierte en la pieza impresa. Barra de progreso arriba.
import { createStage, star, bauble, nameTag, loadFont, nozzle, placeNozzle, setPrint, contactShadow, frameCam } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 18;
export const MUSIC = 'top3';
export const SIZE = () => [1080, 1920];

const { tw, show, bg, apply } = createTimeline();
const punch = (id, tin, tout, extra = {}) => show(id, tin, tout, { y: 0, s: 1.14, blur: 16, dur: 0.38, outDur: 0.2, outY: -12, ...extra });
const SEG = [[2.5, 7], [7, 11.5], [11.5, 16]];
let S, ST, BA, TG, NZ, SH, OBJ;

// trazo "a mano": cada línea se dibuja dos veces con un pequeño desplazamiento
const ink = (d, id, extra = '') => `<path id="${id}" d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#2b4c8c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
function starPath(cx, cy, R, r, j = 0) {
  let d = '';
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr + Math.sin(i * 3.1 + j) * 7).toFixed(1)} ${(cy + Math.sin(a) * rr + Math.cos(i * 2.3 + j) * 7).toFixed(1)} `;
  }
  return d;
}
function circlePath(cx, cy, r, j = 0) {
  let d = '';
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2.08 + j; const rr = r + Math.sin(i * 0.9 + j * 5) * 6; d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `; }
  return d;
}
function rrect(x, y, w, h, r) { return `M${x + r} ${y} H${x + w / 2 - 34} A34 34 0 0 1 ${x + w / 2 + 34} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`; }

export async function init() {
  const name = CONFIG.nombres[2];
  document.getElementById('bgs').innerHTML = `
    <div class="bg grid-paper"></div>
    <div class="bg bg-orange" id="bgI"></div>
    <div class="bg bg-orange" id="bgO"></div>`;
  const items = [
    { n: '#3', t: 'Estrella para<br>el árbol', st: 'en tu color favorito', rot: -4 },
    { n: '#2', t: 'Bola de Navidad<br>de diseño', st: 'hecha capa a capa', rot: 3 },
    { n: '#1', t: 'Adorno con<br>su nombre', st: '¡el más pedido! ❤️', rot: -3 },
  ];
  document.getElementById('fg').innerHTML = `
    <div id="prog" class="prog"><i><b id="p0"></b></i><i><b id="p1"></b></i><i><b id="p2"></b></i></div>
    <div id="i_k" class="abs row" style="top:330px"><span class="tt" style="font-size:44px"><span class="emoji">🎄</span> edición Navidad</span></div>
    <div id="i_t" class="abs center" style="top:470px;font-size:300px;font-weight:900;letter-spacing:-.06em;line-height:.9;color:#fff">TOP 3</div>
    <div id="i_s" class="abs center h-m white" style="top:780px;padding:0 80px">regalos impresos en 3D<br>que van a triunfar</div>
    ${items.map((it, i) => `
      <div id="n${i}" class="abs bignum" style="left:80px;top:200px;font-size:280px">${it.n}</div>
      <div id="t${i}" class="abs h-m" style="left:90px;top:470px;font-size:76px">${it.t}</div>
      <div id="h${i}a" class="abs hand" style="left:90px;top:700px;font-size:76px;color:#2b4c8c;transform-origin:left">tu boceto…</div>
      <div id="h${i}b" class="abs hand" style="right:90px;top:700px;font-size:76px;color:#ff6a13;text-align:right">…¡impreso!</div>
      <div id="s${i}" class="abs row" style="top:1560px"><span class="sticker" style="transform:rotate(${it.rot}deg)"><span>${it.st.replace('❤️', '<span class="emoji">❤️</span>')}</span></span></div>`).join('')}
    <svg id="sk" class="abs" style="inset:0" width="1080" height="1920" viewBox="0 0 1080 1920">
      <g id="sk0">${ink(starPath(540, 1180, 300, 125, 0), 'k0a')}${ink(starPath(540, 1180, 296, 128, 1.3), 'k0b', 'opacity=".5"')}</g>
      <g id="sk1">${ink(circlePath(540, 1220, 245, 0), 'k1a')}${ink(circlePath(540, 1220, 240, 1.1), 'k1b', 'opacity=".5"')}
        ${ink('M480 960 L600 960 L605 1000 L475 1000 Z', 'k1c')}${ink(circlePath(540, 930, 30, 0.4), 'k1d')}
        ${ink('M320 1150 Q540 1210 760 1150', 'k1e')}${ink('M310 1280 Q540 1340 770 1280', 'k1f')}</g>
      <g id="sk2">${ink(rrect(300, 1080, 480, 230, 40), 'k2a')}${ink(rrect(306, 1086, 470, 226, 44), 'k2b', 'opacity=".5"')}
        ${ink(circlePath(540, 1080, 16, 0), 'k2c')}
        <text id="k2t" x="540" y="1240" text-anchor="middle" font-family="Caveat" font-weight="700" font-size="150" fill="#2b4c8c">${name}</text></g>
    </svg>
    <div id="o_t" class="abs center h-l white" style="top:330px">¿Cuál es tu<br>favorito?</div>
    <div id="o_n" class="abs row" style="top:640px;gap:30px">${['3', '2', '1'].map((x) => `<span style="width:200px;height:200px;border-radius:40px;background:#fff;color:#ff6a13;font-size:130px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 50px rgba(0,0,0,.18)">${x}</span>`).join('')}</div>
    <div id="o_c" class="abs row" style="top:960px"><span class="tt dark">comenta tu número <span class="emoji">👇</span></span></div>
    <div id="o_f" class="abs center" style="top:1460px;font-size:40px;font-weight:700;color:#fff">Pedidos hasta el ${CONFIG.fechaLimite}</div>
    <div id="o_h" class="abs center" style="top:1530px;font-size:44px;font-weight:800;color:#fff;letter-spacing:.04em">${CONFIG.usuario} · ${CONFIG.marca}</div>`;

  S = createStage(document.getElementById('gl'), 1080, 1920, 26);
  await loadFont();
  ST = star(0xff6a13, { metal: 0.15 }); ST.scale.setScalar(0.66); S.scene.add(ST);
  BA = bauble(0xc8102e); BA.scale.setScalar(0.78); S.scene.add(BA);
  TG = nameTag(name, { plate: 0xffffff, letters: 0x1f7a4d }); TG.scale.setScalar(0.62); S.scene.add(TG);
  OBJ = [ST, BA, TG];
  NZ = nozzle(); S.scene.add(NZ);
  SH = contactShadow(1.2, 0.25); S.scene.add(SH);

  bg('bgI', 0, 2.5, 0.01); punch('i_k', 0.1, 2.3); punch('i_t', 0.3, 2.35); show('i_s', 0.7, 2.38, { y: 30 });
  SEG.forEach(([a, b], i) => {
    show(`n${i}`, a + 0.02, b - 0.2, { x: -120, y: 0, blur: 0, dur: 0.35 });
    show(`t${i}`, a + 0.12, b - 0.18, { x: 80, y: 0, blur: 0, dur: 0.35 });
    show(`h${i}a`, a + 0.3, a + 1.7, { y: 20, blur: 0, dur: 0.3 });
    show(`h${i}b`, a + 1.9, b - 0.2, { y: 20, blur: 0, dur: 0.3, s: 0.8 });
    show(`s${i}`, a + 2.6, b - 0.16, { y: 0, s: 0.4, blur: 0, dur: 0.3 });
    show(`sk${i}`, a, a + 1.75, { y: 0, blur: 0, dur: 0.01, outDur: 0.4 });
    const paths = [['k0a', 'k0b'], ['k1a', 'k1b', 'k1c', 'k1d', 'k1e', 'k1f'], ['k2a', 'k2b', 'k2c']][i];
    paths.forEach((p, j) => tw(p, a + 0.15 + j * 0.12, 0.9, { dash: 1 }, { dash: 0 }, 'io'));
  });
  tw('k2t', 11.5 + 0.9, 0.35, { o: 0 }, { o: 1 });
  bg('bgO', 16, null, 0.01); punch('o_t', 16.05, null);
  ['3', '2', '1'].forEach(() => {}); show('o_n', 16.3, null, { y: 60, s: 0.8, dur: 0.4 });
  show('o_c', 16.6, null, { y: 30 }); show('o_f', 16.9, null, { y: 16 }); show('o_h', 17.0, null, { y: 16 });
}

export function renderAt(t) {
  apply(t);
  const cam = (...a) => frameCam(S.camera, ...a);
  OBJ.forEach((g) => (g.visible = false)); NZ.visible = false; SH.visible = false;
  // barra de progreso
  SEG.forEach(([a, b], i) => { document.getElementById('p' + i).style.transform = `scaleX(${clamp((t - a) / (b - a)).toFixed(4)})`; });
  document.getElementById('prog').style.opacity = t >= 2.5 && t < 16 ? 1 : 0;
  const i = SEG.findIndex(([a, b]) => t >= a && t < b);
  if (i >= 0) {
    const [a] = SEG[i], g = OBJ[i];
    const p = clamp((t - a - 1.5) / 1.4);
    g.visible = p > 0;
    g.rotation.y = i === 2 ? Math.sin((t - a) * 1.4) * 0.35 : (p < 1 ? 0 : (t - a - 2.9) * 1.6);
    const { cut, box } = setPrint(g, p, 1.1);
    placeNozzle(NZ, cut, box, t * 2, { speed: 14, show: p > 0 && p < 1 ? 1 : 0, size: 0.4 });
    SH.visible = p > 0; SH.scale.setScalar(0.9);
    cam(7.6, [0.6, 0.6, 0.3][i], 0.22, 0, 0.15);
  }
  S.render();
}
