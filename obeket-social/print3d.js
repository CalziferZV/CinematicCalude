// Escena 3D común: piezas con líneas de capa reales que se "imprimen" de abajo arriba (corte por
// altura + borde incandescente + boquilla), con luces de estudio. Todo determinista: cada pieza se
// deja en el estado del segundo t, sin animaciones propias.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export { THREE };

export function createStage(canvas, w, h, fov = 28) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb27a, 1.5); rim.position.set(-4, 2.5, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9db8ff, 0.35); fill.position.set(-3, -1, 4); scene.add(fill);
  return { renderer, scene, camera, key, rim, render: () => renderer.render(scene, camera) };
}

// Material de filamento: estrías de capa (color + relieve en el brillo), corte por altura y brillo
// naranja en la capa que se está imprimiendo.
export function printMaterial(color, { rough = 0.42, metal = 0, layer = 0.016, glow = 0xff6a13 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide });
  const u = { uCut: { value: 1e3 }, uLayer: { value: layer }, uGlow: { value: new THREE.Color(glow) }, uGlowAmt: { value: 0 } };
  m.userData.u = u;
  m.customProgramCacheKey = () => 'obeket-print';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCut, uLayer, uGlowAmt; uniform vec3 uGlow; varying vec3 vW;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vW.y > uCut) discard;\nfloat ph = fract(vW.y / uLayer);\nfloat ridge = smoothstep(0.0, 0.3, ph) * smoothstep(1.0, 0.7, ph);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.80, 1.0, ridge);\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.5;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); normal = normalize(normal + upV * cos(ph * 6.2831) * 0.32); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float d = uCut - vW.y; totalEmissiveRadiance += uGlow * uGlowAmt * (smoothstep(0.022, 0.0, d) * 1.4 + smoothstep(0.1, 0.0, d) * 0.12); }');
  };
  return m;
}

// Una pieza imprimible: grupo con altura conocida (de 0 a h en su eje Y local)
function piece(meshes, h) {
  const g = new THREE.Group();
  meshes.forEach((m) => g.add(m));
  g.userData.h = h;
  g.userData.mats = meshes.flatMap((m) => (m.isGroup ? m.children.map((c) => c.material) : [m.material])).filter((x) => x.userData?.u);
  return g;
}

// p: 0 = nada impreso, 1 = pieza completa. glow: intensidad del borde.
export function setPrint(g, p, glow = 1) {
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const cut = p >= 1 ? 1e3 : box.min.y + (box.max.y - box.min.y) * Math.max(0, p) - 1e-4;
  const gl = p >= 1 || p <= 0 ? 0 : glow;
  for (const m of g.userData.mats) { m.userData.u.uCut.value = cut; m.userData.u.uGlowAmt.value = gl; }
  if (p > 0 && p < 1) LAST_PIECE = g;
  return { cut, box };
}

// ── Piezas ────────────────────────────────────────────────────────────────────────────────
export function vase(color = 0xff6a13) {
  const pts = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 60; i++) {
    const y = (i / 60) * 1.6;
    const r = 0.36 + 0.16 * Math.sin(y * 2.4 + 0.4) + 0.05 * Math.sin(y * 6);
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, 220);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const th = Math.atan2(v.z, v.x);
    const k = 1 + 0.07 * Math.cos(9 * th + v.y * 3.2);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  return piece([new THREE.Mesh(geo, printMaterial(color))], 1.6);
}

export function bauble(color = 0xc8102e, { ribs = 14 } = {}) {
  const R = 0.62, pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = -Math.PI / 2 + (i / 64) * Math.PI;
    pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * R), R + Math.sin(a) * R));
  }
  const geo = new THREE.LatheGeometry(pts, 200);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const th = Math.atan2(v.z, v.x);
    const k = 1 + 0.035 * Math.pow(Math.abs(Math.cos((ribs / 2) * th + (v.y - R) * 2.2)), 3);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, printMaterial(color, { rough: 0.32 }));
  const gold = printMaterial(0xe8b54a, { rough: 0.28, metal: 0.85 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 48), gold);
  cap.position.y = 2 * R + 0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 16, 48), gold);
  ring.position.y = 2 * R + 0.19;
  return piece([body, cap, ring], 2 * R + 0.27);
}

export function star(color = 0xe8b54a, { metal = 0.75 } = {}) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.34 : 0.8;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 4 });
  geo.translate(0, 0, -0.09);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  return piece([new THREE.Mesh(geo, printMaterial(color, { rough: 0.3, metal }))], geo.boundingBox.max.y - geo.boundingBox.min.y);
}

export function tree(color = 0x1f7a4d) {
  // abeto en espiral: perfil en dientes de sierra + giro (se imprime sin soportes)
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.14, 0), new THREE.Vector2(0.14, 0.18)];
  const tiers = 5, H = 1.55;
  for (let i = 0; i < tiers; i++) {
    const y0 = 0.18 + (i / tiers) * (H - 0.18), y1 = 0.18 + ((i + 1) / tiers) * (H - 0.18);
    const r0 = 0.72 * (1 - i / tiers) + 0.08;
    pts.push(new THREE.Vector2(r0, y0 + 0.02));
    pts.push(new THREE.Vector2(r0 * 0.42 + 0.03, y1));
  }
  pts.push(new THREE.Vector2(0.0001, H + 0.04));
  const geo = new THREE.LatheGeometry(pts, 7 * 24);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const th = Math.atan2(v.z, v.x) + v.y * 1.4;
    const k = 1 + 0.12 * Math.pow(Math.abs(Math.cos(3.5 * th)), 2) - 0.06;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, printMaterial(color, { rough: 0.5 }));
  const top = star(0xe8b54a).children[0];
  top.scale.setScalar(0.24);
  top.position.y = H - 0.02;
  return piece([body, top], H + 0.4);
}

export function gift(color = 0xc8102e, ribbon = 0xe8b54a) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1, 1, 1, 1), printMaterial(color, { rough: 0.45 }));
  box.position.y = 0.4;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.18, 1.08), printMaterial(color, { rough: 0.45 }));
  lid.position.y = 0.89;
  const rm = printMaterial(ribbon, { rough: 0.3, metal: 0.6 });
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.99, 1.1), rm); r1.position.y = 0.495;
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.99, 0.16), rm); r2.position.y = 0.495;
  const b1 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 16, 40), rm); b1.position.set(-0.15, 1.08, 0); b1.rotation.set(0, 0.3, 0.6);
  const b2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 16, 40), rm); b2.position.set(0.15, 1.08, 0); b2.rotation.set(0, -0.3, -0.6);
  return piece([box, lid, r1, r2, b1, b2], 1.25);
}

let FONT = null;
export async function loadFont() {
  if (FONT) return FONT;
  FONT = await new FontLoader().loadAsync('/node_modules/three/examples/fonts/helvetiker_bold.typeface.json');
  return FONT;
}

// Adorno con nombre: placa redondeada con agujero + letras en relieve de otro color
export function nameTag(name, { plate = 0xf5f1e8, letters = 0xc8102e } = {}) {
  const tg = new TextGeometry(name, { font: FONT, size: 0.36, depth: 0.12, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 });
  tg.computeBoundingBox();
  const tb = tg.boundingBox, tw = tb.max.x - tb.min.x, th = tb.max.y - tb.min.y;
  tg.translate(-tb.min.x - tw / 2, -tb.min.y + 0.2, 0.06);
  const W = tw + 0.5, H = th + 0.4, r = 0.16;
  const s = new THREE.Shape();
  s.moveTo(-W / 2 + r, 0); s.lineTo(W / 2 - r, 0); s.quadraticCurveTo(W / 2, 0, W / 2, r);
  s.lineTo(W / 2, H - r); s.quadraticCurveTo(W / 2, H, W / 2 - r, H);
  s.lineTo(0.2, H); s.absarc(0, H, 0.2, 0, Math.PI, false);
  s.lineTo(-W / 2 + r, H); s.quadraticCurveTo(-W / 2, H, -W / 2, H - r);
  s.lineTo(-W / 2, r); s.quadraticCurveTo(-W / 2, 0, -W / 2 + r, 0);
  const hole = new THREE.Path(); hole.absarc(0, H + 0.02, 0.08, 0, Math.PI * 2, true); s.holes.push(hole);
  const pg = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
  pg.translate(0, 0, -0.04);
  const pm = new THREE.Mesh(pg, printMaterial(plate, { rough: 0.5 }));
  const lm = new THREE.Mesh(tg, printMaterial(letters, { rough: 0.35 }));
  return piece([pm, lm], H + 0.22);
}

// Hotend realista: tubo de filamento, disipador con aletas, bloque calefactor con funda de silicona,
// boquilla de latón y conducto de ventilación con un detalle naranja. El origen es la punta.
export function nozzle() {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232327, metalness: 0.3, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.2 });
  const sock = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.45 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.ConeGeometry(0.045, 0.07, 24), brass, 0, 0.035, 0).rotation.x = Math.PI;      // punta
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6), brass, 0, 0.09, 0);                     // hexágono
  add(new THREE.BoxGeometry(0.24, 0.12, 0.18), alu, 0.03, 0.17, 0);                            // bloque calefactor
  const sk = add(new THREE.BoxGeometry(0.26, 0.135, 0.195), sock, 0.03, 0.17, 0);              // funda de silicona
  sk.material = sock; sk.scale.set(1, 1, 1);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 16), alu, 0, 0.27, 0);                    // garganta
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 32), alu, 0, 0.32 + i * 0.026, 0); // aletas
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 20), alu, 0, 0.42, 0);                      // núcleo del disipador
  const duct = add(new THREE.BoxGeometry(0.34, 0.36, 0.1), dark, 0, 0.44, 0.17);               // conducto + ventilador
  const ring = add(new THREE.TorusGeometry(0.11, 0.012, 12, 40), new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.5, roughness: 0.4 }), 0, 0.44, 0.222);
  add(new THREE.BoxGeometry(0.34, 0.03, 0.102), accent, 0, 0.6, 0.17);                         // franja OBEKET
  add(new THREE.BoxGeometry(0.06, 0.16, 0.06), dark, 0, 0.1, 0.13).rotation.x = -0.5;          // boca de ventilación
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, transparent: true, opacity: 0.85 }), 0, 0.8, 0); // tubo PTFE
  const glow = new THREE.PointLight(0xff8a3a, 0, 0.9, 2); glow.position.y = -0.01; g.add(glow);
  g.rotation.y = Math.PI / 2;
  g.userData.glow = glow;
  // hilo recién extruido (en coordenadas del mundo; se añade a la escena al colocarlo)
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthWrite: false });
  g.userData.trail = new THREE.Mesh(new THREE.BufferGeometry(), trailMat);
  g.userData.trail.frustumCulled = false;
  return g;
}

let LAST_PIECE = null;
const RAY = new THREE.Raycaster();
// punto del contorno exterior de la pieza a la altura y en el ángulo dados
function surfacePoint(piece, cx, cz, y, th, fallback) {
  RAY.set(new THREE.Vector3(cx, y, cz), new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
  RAY.far = 5;
  const hits = RAY.intersectObject(piece, true);
  if (!hits.length) return fallback;
  return hits[hits.length - 1].point;
}

// Coloca la boquilla sobre la capa: recorre el contorno real de la pieza a la altura del corte y deja
// detrás un hilo de filamento incandescente que se enfría.
export function placeNozzle(nz, cut, box, t, { speed = 3, show = 1, size = 0.6, piece = LAST_PIECE } = {}) {
  const trail = nz.userData.trail;
  if (!trail.parent && nz.parent) nz.parent.add(trail);
  nz.visible = trail.visible = show > 0.01;
  nz.userData.glow.intensity = 1.2 * show;
  nz.scale.setScalar(Math.max(0.001, show) * size);
  if (!nz.visible) return;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const th0 = t * Math.min(speed, 3.2);
  const fb0 = new THREE.Vector3(cx + Math.cos(th0) * (box.max.x - box.min.x) * 0.4, cut, cz + Math.sin(th0) * (box.max.z - box.min.z) * 0.4);
  const N = 36, span = 2.4, pts = [];
  let prev = fb0;
  for (let k = 0; k <= N; k++) {
    const th = th0 - (k / N) * span;
    const p = piece ? surfacePoint(piece, cx, cz, cut - 0.004, th, prev) : prev;
    const out = new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize().multiplyScalar(0.006);
    pts.push(p.clone().add(out));
    prev = p;
  }
  nz.position.set(pts[0].x, cut + 0.012, pts[0].z);
  // tubo con degradado: blanco-amarillo junto a la boquilla → naranja → apagado
  trail.geometry.dispose();
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, 0.0085, 6, false);
  const cols = new Float32Array(geo.attributes.position.count * 4), ring = 7;
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const u = Math.floor(i / ring) / (N * 2), hot = Math.pow(1 - u, 1.6);
    cols[i * 4] = 1.0 + 0.8 * hot; cols[i * 4 + 1] = 0.3 + 0.6 * hot * hot; cols[i * 4 + 2] = 0.05 + 0.3 * hot * hot * hot;
    cols[i * 4 + 3] = Math.min(1, hot * 1.4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 4));
  trail.geometry = geo;
}

// Sombra suave en el suelo (disco con degradado)
export function contactShadow(radius = 1, opacity = 0.35) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(0,0,0,${opacity})`); gr.addColorStop(0.5, `rgba(0,0,0,${opacity * 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// Copos de nieve / partículas doradas deterministas
export function particles(n = 400, { spread = [6, 8, 4], color = 0xffffff, size = 0.035, seed = 7 } = {}) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const base = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { base[i * 4] = (rnd() - 0.5) * spread[0]; base[i * 4 + 1] = rnd() * spread[1]; base[i * 4 + 2] = (rnd() - 0.5) * spread[2]; base[i * 4 + 3] = rnd(); }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({ color, size, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.userData.update = (t, fall = 0.25) => {
    for (let i = 0; i < n; i++) {
      const k = base[i * 4 + 3];
      let y = base[i * 4 + 1] - t * fall * (0.6 + k);
      y = ((y % spread[1]) + spread[1]) % spread[1];
      pos[i * 3] = base[i * 4] + Math.sin(t * (0.6 + k) + k * 20) * 0.15;
      pos[i * 3 + 1] = y - spread[1] / 2;
      pos[i * 3 + 2] = base[i * 4 + 2];
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

// Encuadre vertical: la pieza (centro cy) queda 'below' medias alturas por debajo del centro de la pantalla
export function frameCam(camera, dist, cy, below = 0.22, ang = 0, tilt = 0.5) {
  const ty = cy + below * dist * Math.tan(((camera.fov / 2) * Math.PI) / 180);
  camera.position.set(Math.sin(ang) * dist, ty + tilt, Math.cos(ang) * dist);
  camera.lookAt(0, ty, 0);
}
