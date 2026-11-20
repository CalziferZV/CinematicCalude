// Visor del producto para el vídeo y la web: el trofeo de ejemplo de Filament Studio con
// filamentos reales (mate, silk…), cortado en piezas con sus pasadores y animable:
// colores con transición, despiece, giro, plano de corte y texto 3D en relieve.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// Filamentos usados en las escenas (HEX de Bambu Lab)
export const FIL = {
  blanco: { hex: '#ECECEC', finish: 'blank' },
  blancoMate: { hex: '#F4F3EE', finish: 'matte' },
  negroMate: { hex: '#1F1F21', finish: 'matte' },
  oroSilk: { hex: '#E5B03D', finish: 'silk' },
  plataSilk: { hex: '#D9DCDB', finish: 'silk' },
  rojo: { hex: '#C12E1F', finish: 'basic' },
  azul: { hex: '#0A2CA5', finish: 'basic' },
  naranja: { hex: '#FF6A13', finish: 'basic' },
  marfil: { hex: '#E8DDC7', finish: 'matte' },
  cobreSilk: { hex: '#B86F45', finish: 'silk' },
};

function params(fil) {
  const p = { roughness: 0.45, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4, sheen: 0 };
  if (fil.finish === 'matte') Object.assign(p, { roughness: 0.92, clearcoat: 0 });
  else if (fil.finish === 'silk') Object.assign(p, { roughness: 0.24, metalness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.15, sheen: 1 });
  else if (fil.finish === 'blank') Object.assign(p, { roughness: 0.62, clearcoat: 0 });
  return p;
}
function makeMaterial(fil) {
  const c = new THREE.Color(fil.hex);
  const p = params(fil);
  return new THREE.MeshPhysicalMaterial({ color: c, ...p, sheenColor: c.clone(), sheenRoughness: 0.3, side: THREE.DoubleSide });
}
// Mezcla dos filamentos (color y acabado) para las transiciones
function blendInto(mat, a, b, k) {
  const ca = new THREE.Color(a.hex), cb = new THREE.Color(b.hex);
  mat.color.copy(ca).lerp(cb, k);
  mat.sheenColor.copy(mat.color);
  const pa = params(a), pb = params(b);
  for (const key of ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'sheen']) mat[key] = pa[key] + (pb[key] - pa[key]) * k;
}

const dec = (b64, Type) => {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Type(u8.buffer);
};

export async function createProduct(canvas, { data, dataUrl, width = 1280, height = 720, pixelRatio = 1, transparent = true, shadows = true } = {}) {
  if (!data) data = await (await fetch(dataUrl)).json();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const camera = new THREE.PerspectiveCamera(28, width / height, 1, 5000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(110, -150, 260);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.6;
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -140; sc.right = sc.top = 140; sc.near = 10; sc.far = 700;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  rim.position.set(-200, 180, 140);
  scene.add(rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 96), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.receiveShadow = true;
  ground.position.z = -0.05;
  scene.add(ground);

  // modelo: una raíz que gira, una por pieza (para el despiece) y una malla por parte
  const root = new THREE.Group();
  scene.add(root);
  const pieces = new Map();
  for (const pc of data.pieces) {
    const g = new THREE.Group();
    g.userData = pc;
    root.add(g);
    pieces.set(pc.id, g);
  }
  const partMats = new Map(); // id de parte -> { mat, fil }
  const roleOf = new Map(data.parts.map((p) => [p.id, p]));
  for (const p of data.parts) partMats.set(p.id, { mat: makeMaterial(FIL.blanco), fil: FIL.blanco });
  const dowelMat = makeMaterial(FIL.naranja);
  const meshes = [];
  for (const g of data.groups) {
    const pos = dec(g.pos, Float32Array), nor8 = dec(g.nor, Int8Array);
    const nor = new Float32Array(nor8.length);
    for (let i = 0; i < nor8.length; i += 3) {
      const x = nor8[i], y = nor8[i + 1], z = nor8[i + 2], l = Math.hypot(x, y, z) || 1;
      nor[i] = x / l; nor[i + 1] = y / l; nor[i + 2] = z / l;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const pieceGroup = pieces.get(g.piece);
    const isDowel = pieceGroup.userData.kind === 'dowel';
    const m = new THREE.Mesh(geo, isDowel ? dowelMat : partMats.get(g.part).mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData = { part: g.part, role: roleOf.get(g.part)?.role, name: roleOf.get(g.part)?.name, dowel: isDowel };
    pieceGroup.add(m);
    meshes.push(m);
  }
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // el modelo gira sobre su eje vertical, centrado en X/Y
  for (const g of pieces.values()) g.position.set(-center.x, -center.y, 0);
  const pieceBase = new Map([...pieces].map(([id, g]) => [id, g.position.clone()]));

  // plano de corte (para la escena de cortar)
  const cutPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff6a13, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  cutPlane.scale.set(size.x * 1.5, size.y * 1.5, 1);
  cutPlane.renderOrder = 10;
  scene.add(cutPlane);
  const cutEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0 }));
  cutEdge.scale.copy(cutPlane.scale);
  scene.add(cutEdge);

  // texto 3D (para la escena del nombre): letras sueltas que salen una a una
  let textGroup = null;
  const textMat = makeMaterial(FIL.oroSilk);
  const fontCache = new Map();
  async function buildText(str, { fontUrl, size: s = 6, depth = 1.4, at = [0, -32, 9], normal = [0, -1, 0], maxWidth = Infinity } = {}) {
    if (!fontCache.has(fontUrl)) fontCache.set(fontUrl, fetch(fontUrl).then((r) => r.json()).then((j) => new FontLoader().parse(j)));
    const font = await fontCache.get(fontUrl);
    if (textGroup) {
      const old = textGroup.userData.holder || textGroup;
      root.remove(old);
      textGroup.traverse((o) => o.geometry && o.geometry.dispose());
    }
    // ajustar el tamaño para que quepa en el ancho disponible
    let adv = 0;
    for (const ch of str) adv += (font.data.glyphs[ch] || font.data.glyphs['?'] || { ha: 0 }).ha;
    if (adv > 0 && (s * adv) / font.data.resolution > maxWidth) s = (maxWidth * font.data.resolution) / adv;
    textGroup = new THREE.Group();
    const scale = s / font.data.resolution;
    let x = 0;
    const letters = [];
    for (const ch of str) {
      const glyph = font.data.glyphs[ch] || font.data.glyphs['?'];
      if (ch !== ' ') {
        const g = new TextGeometry(ch, { font, size: s, depth: depth + 0.3, curveSegments: 6, bevelEnabled: false });
        g.translate(x, 0, -0.3);
        const m = new THREE.Mesh(g, textMat);
        m.castShadow = true;
        letters.push(m);
        textGroup.add(m);
      }
      x += glyph.ha * scale;
    }
    // centrar y orientar sobre la cara (X a la derecha, Y arriba, Z hacia fuera)
    const bb = new THREE.Box3().setFromObject(textGroup);
    for (const m of letters) m.geometry.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0);
    for (const m of letters) {
      // pivote de cada letra en su base para "crecer" desde la superficie
      m.geometry.computeBoundingBox();
    }
    const n = new THREE.Vector3(...normal).normalize();
    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(up, n).normalize();
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.makeBasis(right, up, n).setPosition(new THREE.Vector3(at[0] - center.x, at[1] - center.y, at[2]));
    holder.add(textGroup);
    root.add(holder);
    textGroup.userData.letters = letters;
    textGroup.userData.holder = holder;
    textGroup.visible = false;
    return { count: letters.length, size: s, width: x };
  }

  const api = {
    renderer, scene, camera, root, size, center, meshes,
    parts: data.parts,
    // colores: { rol | nombre de parte: filamento }; k = 0..1 mezcla desde el estado "from"
    setColors(to, from = null, k = 1) {
      for (const p of data.parts) {
        const e = partMats.get(p.id);
        const b = to[p.name] || to[p.role] || to['*'] || FIL.blanco;
        const a = from ? from[p.name] || from[p.role] || from['*'] || FIL.blanco : b;
        blendInto(e.mat, a, b, Math.max(0, Math.min(1, k)));
      }
    },
    setPartColor(nameOrRole, a, b, k) {
      for (const p of data.parts) {
        if (p.name !== nameOrRole && p.role !== nameOrRole) continue;
        blendInto(partMats.get(p.id).mat, a, b, Math.max(0, Math.min(1, k)));
      }
    },
    setDowelColor(fil) { blendInto(dowelMat, fil, fil, 1); },
    setDowelsVisible(v) { for (const m of meshes) if (m.userData.dowel) m.visible = v; },
    setPartVisible(nameOrRole, v) { for (const m of meshes) if (m.userData.name === nameOrRole || m.userData.role === nameOrRole) m.visible = v; },
    // despiece 0..1 (cada pieza sube a su nivel)
    setExplode(k) {
      for (const [id, g] of pieces) {
        const e = g.userData.explode;
        const b = pieceBase.get(id);
        g.position.set(b.x + e[0] * k, b.y + e[1] * k, b.z + e[2] * k);
      }
    },
    setTurn(rad) { root.rotation.z = rad; },
    // cámara en órbita: azimut y elevación en grados, distancia relativa al tamaño, objetivo (z)
    setCamera({ az = -35, el = 18, dist = 1, tz = null, fov = 28, shiftX = 0, shiftY = 0 } = {}) {
      const R = Math.max(size.x, size.y, size.z) * 2.9 * dist;
      const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
      const target = new THREE.Vector3(0, 0, tz ?? size.z * 0.48);
      camera.fov = fov;
      camera.position.set(target.x + Math.cos(e) * Math.cos(a) * R, target.y + Math.cos(e) * Math.sin(a) * R, target.z + Math.sin(e) * R);
      camera.lookAt(target);
      camera.setViewOffset(width, height, -shiftX * width, -shiftY * height, width, height);
      camera.updateProjectionMatrix();
    },
    setCut(z, alpha) {
      cutPlane.position.set(0, 0, z);
      cutEdge.position.set(0, 0, z);
      cutPlane.material.opacity = 0.32 * alpha;
      cutEdge.material.opacity = 0.9 * alpha;
      cutPlane.visible = cutEdge.visible = alpha > 0.001;
    },
    buildText,
    // texto: k = 0..1 aparición letra a letra (cada letra crece desde la superficie)
    setText(k, fil = FIL.oroSilk) {
      if (!textGroup) return;
      blendInto(textMat, fil, fil, 1);
      const L = textGroup.userData.letters;
      textGroup.visible = k > 0.001;
      L.forEach((m, i) => {
        const t = Math.max(0, Math.min(1, k * (L.length + 2) - i));
        const e = 1 - Math.pow(1 - t, 3);
        m.scale.set(1, 1, Math.max(0.001, e));
        m.visible = t > 0.001;
      });
    },
    setSize(w, h, pr = pixelRatio) { renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; width = w; height = h; camera.updateProjectionMatrix(); },
    render() { renderer.render(scene, camera); },
  };
  api.setCamera();
  api.setCut(0, 0);
  return api;
}
