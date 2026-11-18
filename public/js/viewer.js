// Visor 3D (three.js): render, selección por clic, pincel, plano de corte, vistas y capturas.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { S, on, topo, normals, filamentOf, BLANK } from './state.js';
import { filamentMaterial, flatMaterial, falseColor } from './materials.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

let renderer, scene, camera, controls, container;
let model = null; // malla visible
let pickMesh = null; // malla invisible para raycast (con BVH)
let boundary = null; // líneas entre partes
let cutPlane = null;
let brushRing = null;
let ground = null;
let grid = null;
let needsRender = true;
let hoverPart = null;
let showBoundaries = true;
let partsOverride = null; // vista de colores falsos

export function init(el) {
  container = el;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // fiel al color de producto
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  setBackground('studio');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;

  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  camera.position.set(160, -220, 160);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.addEventListener('change', () => (needsRender = true));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.35);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(120, -160, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.6;
  scene.add(key);
  scene.userData.key = key;
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.45);
  rim.position.set(-200, 180, 120);
  scene.add(rim);

  ground = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  on('mesh', rebuild);
  on('parts', scheduleRefresh);
  on('selection', scheduleRefresh);
  animate();
}

export function setBackground(kind) {
  const css = getComputedStyle(document.documentElement);
  const bg = kind === 'dark' ? '#1d2026' : kind === 'white' ? '#ffffff' : css.getPropertyValue('--viewport-bg').trim() || '#e9ebef';
  scene.background = new THREE.Color(bg);
  if (grid) grid.material.opacity = kind === 'dark' ? 0.25 : 0.5;
  needsRender = true;
}

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  needsRender = true;
}

let pulse = 0;
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (S.selected.size && model) {
    pulse += 0.06;
    const k = 0.1 + 0.07 * Math.sin(pulse);
    for (const m of model.material) if (m.userData.selected) m.emissiveIntensity = k;
    needsRender = true;
  }
  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}
export const requestRender = () => (needsRender = true);

// ---------------------------------------------------------------- construcción de la malla
function rebuild() {
  if (model) { scene.remove(model); model.geometry.dispose(); }
  if (pickMesh) { pickMesh.geometry.dispose(); pickMesh = null; }
  if (!S.mesh) return;
  const t = topo();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(S.mesh.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals(), 3));
  model = new THREE.Mesh(g, []);
  model.castShadow = true;
  model.receiveShadow = true;
  scene.add(model);

  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(S.mesh.pos, 3));
  const idx = new Uint32Array(t.nF * 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  pg.setIndex(new THREE.BufferAttribute(idx, 1));
  pg.computeBoundsTree();
  pickMesh = new THREE.Mesh(pg, new THREE.MeshBasicMaterial());

  // suelo / sombras / cámara acordes al tamaño
  const bb = t.bbox;
  const size = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, bb.maxZ - bb.minZ);
  const R = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 1.6 + 20;
  ground.scale.setScalar(R);
  if (grid) scene.remove(grid);
  const step = size > 150 ? 20 : size > 60 ? 10 : 5;
  const n = Math.ceil((R * 2) / step);
  grid = new THREE.GridHelper(n * step, n, 0x9aa1ad, 0xc4c9d1);
  grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.position.z = -0.01;
  scene.add(grid);
  const key = scene.userData.key;
  key.position.set(size * 0.9, -size * 1.2, size * 2.2);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -size * 1.5;
  sc.right = sc.top = size * 1.5;
  sc.near = 1;
  sc.far = size * 6;
  sc.updateProjectionMatrix();
  if (!rebuild.keepCamera) fitView('iso', false);
  rebuild.keepCamera = true;
  refreshParts();
}
export function resetCameraOnNextLoad() { rebuild.keepCamera = false; }

// Agrupa varios cambios en un solo refresco por fotograma (pincel fluido en mallas grandes).
let refreshQueued = false;
function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; refreshParts(); });
}
let painting = false;
export function setPainting(v) {
  painting = v;
  if (!v) scheduleRefresh();
}

// Reordena el índice por parte y asigna un material a cada grupo.
function refreshParts() {
  if (!model || !S.mesh) return;
  const fp = S.mesh.faceParts;
  const nF = fp.length;
  const order = S.parts.map((p) => p.id);
  const slot = new Map(order.map((id, i) => [id, i]));
  const counts = new Uint32Array(order.length);
  for (let f = 0; f < nF; f++) counts[slot.get(fp[f]) ?? 0]++;
  const offs = new Uint32Array(order.length);
  for (let i = 1; i < order.length; i++) offs[i] = offs[i - 1] + counts[i - 1];
  const index = new Uint32Array(nF * 3);
  const w = offs.slice();
  for (let f = 0; f < nF; f++) {
    const s = slot.get(fp[f]) ?? 0;
    const o = w[s]++ * 3;
    index[o] = f * 3; index[o + 1] = f * 3 + 1; index[o + 2] = f * 3 + 2;
  }
  const g = model.geometry;
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.clearGroups();
  const mats = [];
  const t = topo();
  const zr = new Map();
  for (let f = 0; f < nF; f++) {
    const z = t.cen[f * 3 + 2];
    const r = zr.get(fp[f]);
    if (!r) zr.set(fp[f], [z, z]); else { if (z < r[0]) r[0] = z; if (z > r[1]) r[1] = z; }
  }
  S.parts.forEach((p, i) => {
    const zRange = (zr.get(p.id) || [t.bbox.minZ, t.bbox.maxZ]).map((v) => Math.round(v * 10) / 10);
    if (!p.visible || !counts[i]) return;
    g.addGroup(offs[i] * 3, counts[i] * 3, mats.length);
    let m;
    if (partsOverride) m = flatMaterial(falseColor(i));
    else m = filamentMaterial(p.filament || BLANK, { zRange });
    const sel = S.selected.has(p.id) || hoverPart === p.id;
    if (sel && !partsOverride) {
      m = m.clone();
      const orig = filamentMaterial(p.filament || BLANK, { zRange });
      if (orig.userData.uniforms) { m.onBeforeCompile = orig.onBeforeCompile; m.customProgramCacheKey = orig.customProgramCacheKey; }
      m.emissive = new THREE.Color(S.selected.has(p.id) ? 0x3d6bff : 0x6f8cff);
      m.emissiveIntensity = S.selected.has(p.id) ? 0.12 : 0.08;
      m.userData.selected = S.selected.has(p.id);
      m.userData.tmp = true;
    }
    mats.push(m);
  });
  for (const old of model.material) if (old.userData.tmp) old.dispose();
  model.material = mats;
  buildBoundaries();
  needsRender = true;
}

function buildBoundaries() {
  if (boundary) { scene.remove(boundary); boundary.geometry.dispose(); boundary = null; }
  if (!showBoundaries || S.parts.length < 2 || partsOverride || painting) return;
  const t = topo();
  const fp = S.mesh.faceParts;
  const P = S.mesh.pos;
  const seg = [];
  for (let f = 0; f < t.nF; f++) {
    for (let k = 0; k < 3; k++) {
      const g = t.nbr[f * 3 + k];
      if (g < 0 || g < f || fp[g] === fp[f]) continue;
      const a = f * 9 + k * 3, b = f * 9 + ((k + 1) % 3) * 3;
      seg.push(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2]);
    }
  }
  if (!seg.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  boundary = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2b2f36, transparent: true, opacity: 0.55, depthTest: true }));
  boundary.renderOrder = 2;
  scene.add(boundary);
}
export function setShowBoundaries(v) { showBoundaries = v; refreshParts(); }

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
export function pick(clientX, clientY) {
  if (!pickMesh) return null;
  const r = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(v, camera);
  const hits = ray.intersectObject(pickMesh);
  // ignorar caras de partes ocultas
  for (const h of hits) {
    const face = Math.floor(h.face.a / 3);
    const part = S.parts.find((p) => p.id === S.mesh.faceParts[face]);
    if (part && !part.visible) continue;
    return { face, point: h.point, normal: h.face.normal.clone(), partId: S.mesh.faceParts[face] };
  }
  return null;
}

export function setHover(partId) {
  if (hoverPart === partId) return;
  hoverPart = partId;
  refreshParts();
}

// Caras dentro del radio del pincel, mirando hacia la cámara.
export function facesInBrush(point, radius) {
  const t = topo();
  const r2 = radius * radius;
  const out = [];
  const cam = camera.position;
  for (let f = 0; f < t.nF; f++) {
    const cx = t.cen[f * 3], cy = t.cen[f * 3 + 1], cz = t.cen[f * 3 + 2];
    const dx = cx - point.x, dy = cy - point.y, dz = cz - point.z;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    const vx = cx - cam.x, vy = cy - cam.y, vz = cz - cam.z;
    if (t.fn[f * 3] * vx + t.fn[f * 3 + 1] * vy + t.fn[f * 3 + 2] * vz > 0) continue;
    out.push(f);
  }
  return out;
}

export function showBrush(point, normal, radius) {
  if (!brushRing) {
    brushRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0x3d6bff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
    );
    brushRing.renderOrder = 5;
    scene.add(brushRing);
  }
  if (!point) { brushRing.visible = false; needsRender = true; return; }
  brushRing.visible = true;
  brushRing.scale.setScalar(radius);
  brushRing.position.copy(point);
  brushRing.lookAt(point.clone().add(normal));
  needsRender = true;
}

export function showCutPlane(z, visible) {
  if (!S.mesh) return;
  const t = topo();
  if (!cutPlane) {
    cutPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: 0xff5a36 }),
    );
    cutPlane.add(edge);
    scene.add(cutPlane);
  }
  cutPlane.visible = visible;
  const w = (t.bbox.maxX - t.bbox.minX) * 1.3 + 10, h = (t.bbox.maxY - t.bbox.minY) * 1.3 + 10;
  cutPlane.scale.set(w, h, 1);
  cutPlane.position.set((t.bbox.maxX + t.bbox.minX) / 2, (t.bbox.maxY + t.bbox.minY) / 2, z);
  needsRender = true;
}

// ---------------------------------------------------------------- vistas
const VIEWS = {
  iso: [0.75, -1, 0.75], front: [0, -1, 0.05], back: [0, 1, 0.05], left: [-1, 0, 0.05], right: [1, 0, 0.05],
  top: [0, -0.001, 1], bottom: [0, 0.001, -1],
};
export function fitView(name = 'iso', animate = true, cam = camera, ctrls = controls) {
  if (!S.mesh) return;
  const t = topo();
  const bb = t.bbox;
  const c = new THREE.Vector3((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2, (bb.minZ + bb.maxZ) / 2);
  const radius = t.diag / 2;
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.12;
  const dir = new THREE.Vector3(...(VIEWS[name] || VIEWS.iso)).normalize();
  const target = c.clone().add(dir.multiplyScalar(dist));
  if (!animate) {
    cam.position.copy(target);
    ctrls.target.copy(c);
    ctrls.update();
    needsRender = true;
    return;
  }
  const from = cam.position.clone(), fromT = ctrls.target.clone();
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 450);
    const e = 1 - Math.pow(1 - k, 3);
    cam.position.lerpVectors(from, target, e);
    ctrls.target.lerpVectors(fromT, c, e);
    ctrls.update();
    needsRender = true;
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

let autoRotate = false;
export function toggleAutoRotate() {
  autoRotate = !autoRotate;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 2.2;
  return autoRotate;
}

// ---------------------------------------------------------------- capturas
// Renderiza la escena con la vista pedida y devuelve un canvas (opcionalmente con etiquetas de partes).
export function capture({ view = 'current', mode = 'real', width = 1280, height = 960, labels = false, transparent = false } = {}) {
  const cam = camera.clone();
  cam.aspect = width / height;
  cam.updateProjectionMatrix();
  const fakeCtrls = { target: controls.target.clone(), update() { cam.lookAt(this.target); } };
  if (view !== 'current') fitView(view, false, cam, fakeCtrls);
  else cam.lookAt(controls.target);
  const prevOverride = partsOverride;
  const prevHover = hoverPart;
  const prevSel = new Set(S.selected);
  hoverPart = null;
  if (mode === 'parts') partsOverride = true;
  S.selected.clear();
  refreshParts();
  const brushVis = brushRing?.visible, cutVis = cutPlane?.visible;
  if (brushRing) brushRing.visible = false;
  if (cutPlane) cutPlane.visible = false;
  const prevBg = scene.background;
  if (transparent) scene.background = null;
  const rt = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const buf = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, buf);
  renderer.setRenderTarget(null);
  rt.dispose();
  scene.background = prevBg;
  if (brushRing) brushRing.visible = brushVis;
  if (cutPlane) cutPlane.visible = cutVis;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) img.data.set(buf.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  ctx.putImageData(img, 0, 0);
  if (labels || mode === 'parts') drawPartLabels(ctx, cam, width, height);
  partsOverride = prevOverride;
  hoverPart = prevHover;
  S.selected = prevSel;
  refreshParts();
  return canvas;
}

function drawPartLabels(ctx, cam, w, h) {
  const t = topo();
  const fp = S.mesh.faceParts;
  const acc = new Map();
  // punto representativo: centroide ponderado de caras visibles hacia la cámara
  for (let f = 0; f < t.nF; f++) {
    const id = fp[f];
    const cx = t.cen[f * 3], cy = t.cen[f * 3 + 1], cz = t.cen[f * 3 + 2];
    const facing = t.fn[f * 3] * (cam.position.x - cx) + t.fn[f * 3 + 1] * (cam.position.y - cy) + t.fn[f * 3 + 2] * (cam.position.z - cz) > 0;
    if (!facing) continue;
    let a = acc.get(id);
    if (!a) acc.set(id, (a = [0, 0, 0, 0]));
    const wgt = t.area[f];
    a[0] += cx * wgt; a[1] += cy * wgt; a[2] += cz * wgt; a[3] += wgt;
  }
  ctx.font = `bold ${Math.round(h / 34)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  S.parts.forEach((p, i) => {
    const a = acc.get(p.id);
    if (!a || !a[3] || !p.visible) return;
    const v = new THREE.Vector3(a[0] / a[3], a[1] / a[3], a[2] / a[3]).project(cam);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const label = `#${p.id}`;
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(x - tw / 2, y - h / 50, tw, h / 25, 6);
    ctx.fill();
    ctx.fillStyle = falseColor(i);
    ctx.fillRect(x - tw / 2, y - h / 50, 5, h / 25);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 2, y + 1);
  });
}

// Vista por capas: oculta todo lo que está por encima de Z (como la vista previa del laminador)
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
export function setClipZ(z) {
  if (z == null) renderer.clippingPlanes = [];
  else { clipPlane.constant = z; renderer.clippingPlanes = [clipPlane]; }
  needsRender = true;
}

export function domElement() { return renderer.domElement; }
export function getControls() { return controls; }
