// Reel de marca OBEKET (1080 × 1920, 20 s): una pieza naciendo capa a capa, el lema, personalización,
// colores, de 1 a 1.000 unidades y cierre con la marca. Cortes cuadrados con la música (120 BPM).
import { THREE, createStage, vase, nameTag, star, loadFont, nozzle, placeNozzle, setPrint, contactShadow } from './print3d.js';
import { createTimeline, clamp, EASE } from './timeline.js';
import { CONFIG } from './config.js';

export const DURATION = 20;
export const MUSIC = 'marca';
export const SIZE = () => [1080, 1920];

const { tw, show, bg, apply } = createTimeline();
const punch = (id, tin, tout, extra = {}) => show(id, tin, tout, { y: 0, s: 1.14, blur: 16, dur: 0.38, outDur: 0.2, outY: -12, ...extra });
let S, V, TAG, STARS, NZ, SH;
const COLORS = [0xff6a13, 0x1e88e5, 0x2bb673, 0xf2c14e, 0xe63e6d, 0xf5f1e8];

export async function init() {
  document.getElementById('bgs').innerHTML = `
    <div class="bg bg-black"></div>
    <div class="bg bg-dark" id="bgA"></div>
    <div class="bg bg-light" id="bgB"></div>
    <div class="bg bg-warm" id="bgC"></div>
    <div class="bg bg-light" id="bgD"></div>
    <div class="bg bg-dark" id="bgE"></div>
    <div class="bg bg-light" id="bgF"></div>
    <div id="halo" class="abs glow" style="left:40px;top:780px;width:1000px;height:1000px"></div>`;
  document.getElementById('fg').innerHTML = `
    <div id="a_k" class="abs center kicker" style="top:300px">Impresión 3D a medida</div>
    <div id="a_t1" class="abs center h-xl white" style="top:370px">Capa a capa,</div>
    <div id="a_t2" class="abs center h-xl" style="top:500px"><span class="grad">nace tu idea.</span></div>

    <div id="b_t1" class="abs center h-xxl" style="top:290px">Lo imaginas.</div>
    <div id="b_t2" class="abs center h-xxl" style="top:450px"><span class="grad">Lo imprimimos.</span></div>

    <div id="c_k" class="abs center kicker" style="top:300px">100 % personalizado</div>
    <div id="c_t" class="abs center h-xl" style="top:370px">Tu nombre.<br>Tu logo.<br><span class="grad">Tu diseño.</span></div>

    <div id="d_t" class="abs center h-xl" style="top:330px">En el color<br><span class="grad">que quieras.</span></div>
    <div id="d_chips" class="abs row" style="top:1690px;gap:22px">${COLORS.map((c) => `<i style="width:64px;height:64px;border-radius:50%;background:#${c.toString(16).padStart(6, '0')};box-shadow:inset 0 0 0 2px rgba(0,0,0,.12),0 10px 24px rgba(0,0,0,.12)"></i>`).join('')}</div>

    <div id="e_t1" class="abs center h-xl white" style="top:300px">De 1 a <span class="grad">1.000</span></div>
    <div id="e_t2" class="abs center sub white" style="top:445px">unidades, sin pedido mínimo</div>
    <div id="e_chips" class="abs row" style="top:1610px;left:80px;right:80px">
      <span class="chip dark">Regalos</span><span class="chip dark">Decoración</span><span class="chip dark">Repuestos</span><span class="chip dark">Prototipos</span>
    </div>

    <div id="f_brand" class="abs center brand ink" style="top:330px">${CONFIG.marca}</div>
    <div id="f_lema" class="abs center sub" style="top:510px;color:#1d1d1f;font-weight:600">${CONFIG.lema}</div>
    <div id="f_btn" class="abs row" style="top:1430px"><span class="btn">Pide tu presupuesto</span></div>
    <div id="f_h" class="abs center handle" style="top:1590px;color:#6e6e73">${CONFIG.usuario}</div>`;

  const W = 1080, H = 1920;
  S = createStage(document.getElementById('gl'), W, H, 26);
  await loadFont();
  V = vase(); S.scene.add(V);
  TAG = nameTag('TU IDEA', { plate: 0x1d1d1f, letters: 0xff6a13 }); S.scene.add(TAG);
  STARS = [];
  for (let i = 0; i < 9; i++) { const s = star(COLORS[i % COLORS.length], { metal: 0.1 }); s.scale.setScalar(0.42); STARS.push(s); S.scene.add(s); }
  NZ = nozzle(); S.scene.add(NZ);
  SH = contactShadow(1.3, 0.32); S.scene.add(SH);

  // DOM
  tw('halo', 0, 0.8, { o: 0, s: 0.7 }, { o: 1, s: 1 }, 'out'); tw('halo', 3.7, 0.4, { o: 1 }, { o: 0 }, 'in');
  tw('halo', 12, 0.4, { o: 0 }, { o: 1 }, 'out'); tw('halo', 15.7, 0.3, { o: 1 }, { o: 0 }, 'in');
  bg('bgA', 0, 4, 0.01); bg('bgB', 4, 8, 0.2); bg('bgC', 8, 10, 0.2); bg('bgD', 10, 12, 0.2); bg('bgE', 12, 16, 0.2); bg('bgF', 16, null, 0.2);
  show('a_k', 0.15, 3.75, { y: 16 }); show('a_t1', 0.35, 3.8, { y: 30 }); show('a_t2', 1.1, 3.82, { y: 30 });
  punch('b_t1', 4.04, 7.8); punch('b_t2', 4.5, 7.82);
  show('c_k', 8.05, 9.8, { y: 16 }); punch('c_t', 8.1, 9.82);
  punch('d_t', 10.04, 11.8); show('d_chips', 10.3, 11.82, { y: 30 });
  punch('e_t1', 12.04, 15.8); show('e_t2', 12.4, 15.82, { y: 20 }); show('e_chips', 13.6, 15.84, { y: 40 });
  tw('f_brand', 16.05, 0.9, { o: 0, ls: 0.6, blur: 18 }, { o: 1, ls: 0.28, blur: 0 }, 'outQ');
  show('f_lema', 16.5, null, { y: 20 }); show('f_btn', 16.9, null, { y: 40, s: 0.9 }); show('f_h', 17.2, null, { y: 20 });
}

const lerp = (a, b, k) => a + (b - a) * k;
// encuadre: la pieza (centro cy) aparece desplazada 'below' medias alturas por debajo del centro de la pantalla
function cam(dist, cy, below = 0.22, ang = 0, tilt = 0.5) {
  const ty = cy + below * dist * Math.tan((13 * Math.PI) / 180);
  S.camera.position.set(Math.sin(ang) * dist, ty + tilt, Math.cos(ang) * dist);
  S.camera.lookAt(0, ty, 0);
}

export function renderAt(t) {
  apply(t);
  V.visible = t < 8 || (t >= 10 && t < 12) || t >= 16;
  TAG.visible = t >= 8 && t < 10;
  STARS.forEach((s) => (s.visible = t >= 12 && t < 16));
  NZ.visible = false; SH.visible = true;
  V.position.set(0, 0, 0); V.scale.setScalar(1);

  if (t < 4) { // se imprime el jarrón en la oscuridad
    const p = clamp((t - 0.1) / 3.75);
    V.rotation.y = t * 0.5;
    const { cut, box } = setPrint(V, p);
    placeNozzle(NZ, cut, box, t, { speed: 9, show: clamp(t / 0.3) * clamp((3.9 - t) / 0.25) * (p < 1 ? 1 : 0) });
    const k = EASE.io(clamp(t / 4));
    cam(lerp(5.6, 7.4, k), lerp(0.55, 0.8, k), 0.22, 0.2 - k * 0.3, lerp(1.6, 0.6, k));
    SH.visible = false;
  } else if (t < 8) { // terminado, gira sobre fondo claro
    setPrint(V, 1);
    V.rotation.y = t * 0.5;
    const k = EASE.out(clamp((t - 4) / 4));
    cam(lerp(8.2, 7.4, k), 0.8, 0.24, -0.1 + k * 0.15);
  } else if (t < 10) { // nombre / logo
    const p = clamp((t - 8.05) / 1.1);
    TAG.rotation.y = Math.sin((t - 8) * 1.2) * 0.35;
    TAG.position.set(0, 0, 0);
    TAG.scale.setScalar(0.55);
    const { cut, box } = setPrint(TAG, p);
    placeNozzle(NZ, cut, box, t, { speed: 14, show: p < 1 ? clamp((t - 8.05) / 0.15) : 0 });
    cam(7.4, 0.3, 0.3, 0, 0.3);
    SH.scale.setScalar(1.1);
  } else if (t < 12) { // colores
    setPrint(V, 1);
    V.rotation.y = t * 0.6;
    const f = (t - 10) * 3, i = Math.floor(f), k = EASE.io(clamp((f - i) / 0.35));
    const c = new THREE.Color(COLORS[i % COLORS.length]).lerp(new THREE.Color(COLORS[(i + 1) % COLORS.length]), k);
    V.children[0].material.color.copy(c);
    cam(7.4, 0.8, 0.24, 0.1);
  } else if (t < 16) { // de 1 a 1.000: una estrella y luego la cuadrícula
    const one = clamp((t - 12) / 1.2);
    STARS.forEach((s, i) => {
      const gx = (i % 3) - 1, gy = 1 - Math.floor(i / 3);
      const appear = i === 4 ? 1 : EASE.back(clamp((t - 13.2 - i * 0.07) / 0.45));
      s.visible = appear > 0.01;
      s.scale.setScalar(0.42 * Math.max(0.001, appear));
      s.position.set(gx * 0.82, gy * 0.8, 0);
      s.rotation.y = Math.sin(t * 1.4 + i) * 0.45;
      setPrint(s, i === 4 ? one : 1, 1);
    });
    const { cut, box } = setPrint(STARS[4], one);
    placeNozzle(NZ, cut, box, t, { speed: 16, show: one < 1 ? 0.6 : 0 });
    const k = EASE.io(clamp((t - 12.8) / 1.2));
    cam(lerp(6.0, 11.5, k), lerp(0.7, 0.62, k), lerp(0.2, 0.05, k), 0, 0.2);
    SH.visible = false;
  } else { // cierre
    setPrint(V, 1);
    V.children[0].material.color.set(0xff6a13);
    V.rotation.y = t * 0.45;
    const k = EASE.outQ(clamp((t - 16) / 1.2));
    V.scale.setScalar(lerp(0.5, 0.65, k));
    cam(7.4, 0.52, 0.05, 0);
  }
  S.render();
}
