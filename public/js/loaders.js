// Carga de archivos 3D -> Float32Array de triángulos (9 floats por cara, Z hacia arriba).
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as fflate from 'three/addons/libs/fflate.module.js';

// Lector 3MF propio: soporta los 3MF de Bambu Studio / OrcaSlicer / PrusaSlicer
// (objetos en archivos separados, componentes y transformaciones de la placa).
function parse3MF(buf) {
  const zip = fflate.unzipSync(new Uint8Array(buf));
  const files = {};
  for (const k of Object.keys(zip)) if (/\.model$/i.test(k)) files['/' + k.replace(/^\//, '')] = zip[k];
  const mainPath = Object.keys(files).find((k) => /^\/3D\/3dmodel\.model$/i.test(k)) || Object.keys(files)[0];
  if (!mainPath) throw new Error('3MF sin modelo');
  const docs = {};
  const getDoc = (path) => {
    if (!docs[path]) {
      const key = Object.keys(files).find((k) => k.toLowerCase() === path.toLowerCase());
      if (!key) return null;
      docs[path] = new DOMParser().parseFromString(new TextDecoder().decode(files[key]), 'application/xml');
    }
    return docs[path];
  };
  const parseM = (t) => {
    if (!t) return null;
    const v = t.trim().split(/\s+/).map(Number);
    return v.length === 12 ? v : null;
  };
  // matriz 3MF (fila) -> compuesta
  const mul = (a, b) => {
    // aplica a y luego b: p' = (p*a)*b ; representadas como [m00..m32]
    if (!a) return b; if (!b) return a;
    const A = [[a[0], a[1], a[2], 0], [a[3], a[4], a[5], 0], [a[6], a[7], a[8], 0], [a[9], a[10], a[11], 1]];
    const B = [[b[0], b[1], b[2], 0], [b[3], b[4], b[5], 0], [b[6], b[7], b[8], 0], [b[9], b[10], b[11], 1]];
    const C = A.map((r) => [0, 1, 2, 3].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j] + r[3] * B[3][j]));
    return [C[0][0], C[0][1], C[0][2], C[1][0], C[1][1], C[1][2], C[2][0], C[2][1], C[2][2], C[3][0], C[3][1], C[3][2]];
  };
  const chunks = [];
  const emit = (path, id, m, depth = 0) => {
    if (depth > 8) return;
    const doc = getDoc(path);
    if (!doc) return;
    const obj = [...doc.getElementsByTagName('object')].find((o) => o.getAttribute('id') === id);
    if (!obj) return;
    const mesh = obj.getElementsByTagName('mesh')[0];
    if (mesh) {
      const vs = mesh.getElementsByTagName('vertex');
      const V = new Float64Array(vs.length * 3);
      for (let i = 0; i < vs.length; i++) {
        let x = +vs[i].getAttribute('x'), y = +vs[i].getAttribute('y'), z = +vs[i].getAttribute('z');
        if (m) { const nx = x * m[0] + y * m[3] + z * m[6] + m[9], ny = x * m[1] + y * m[4] + z * m[7] + m[10], nz = x * m[2] + y * m[5] + z * m[8] + m[11]; x = nx; y = ny; z = nz; }
        V[i * 3] = x; V[i * 3 + 1] = y; V[i * 3 + 2] = z;
      }
      const ts = mesh.getElementsByTagName('triangle');
      const out = new Float32Array(ts.length * 9);
      for (let i = 0; i < ts.length; i++) {
        const a = +ts[i].getAttribute('v1'), b = +ts[i].getAttribute('v2'), c = +ts[i].getAttribute('v3');
        out.set([V[a * 3], V[a * 3 + 1], V[a * 3 + 2], V[b * 3], V[b * 3 + 1], V[b * 3 + 2], V[c * 3], V[c * 3 + 1], V[c * 3 + 2]], i * 9);
      }
      chunks.push(out);
    }
    for (const comp of obj.getElementsByTagName('component')) {
      const cpath = comp.getAttribute('p:path') || comp.getAttribute('path') || path;
      emit(cpath, comp.getAttribute('objectid'), mul(parseM(comp.getAttribute('transform')), m), depth + 1);
    }
  };
  const main = getDoc(mainPath);
  const items = [...main.getElementsByTagName('item')];
  for (const it of items) emit(it.getAttribute('p:path') || mainPath, it.getAttribute('objectid'), parseM(it.getAttribute('transform')));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const pos = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { pos.set(c, o); o += c.length; }
  return pos;
}

function geometryToTris(geom, matrix) {
  let g = geom;
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position;
  const out = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (matrix) v.applyMatrix4(matrix);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  // si el determinante es negativo (espejo), invertir el orden de los vértices
  if (matrix && matrix.determinant() < 0) {
    for (let f = 0; f < out.length; f += 9) {
      for (let k = 0; k < 3; k++) { const t = out[f + 3 + k]; out[f + 3 + k] = out[f + 6 + k]; out[f + 6 + k] = t; }
    }
  }
  return out;
}

function objectToTris(obj) {
  obj.updateMatrixWorld(true);
  const chunks = [];
  obj.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) chunks.push(geometryToTris(o.geometry, o.matrixWorld));
  });
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function yUpToZUp(pos) {
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1], z = pos[i + 2];
    pos[i + 1] = -z;
    pos[i + 2] = y;
  }
  return pos;
}

export async function loadFile(file) {
  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();
  const buf = await file.arrayBuffer();
  return parseBuffer(buf, ext, name);
}

export function parseBuffer(buf, ext, name = 'modelo') {
  let pos;
  switch (ext) {
    case 'stl':
      pos = geometryToTris(new STLLoader().parse(buf));
      break;
    case 'obj':
      pos = yUpToZUp(objectToTris(new OBJLoader().parse(new TextDecoder().decode(buf))));
      break;
    case '3mf':
      try { pos = parse3MF(buf); } catch (e) { console.warn('3MF propio falló, usando el de three.js', e); pos = null; }
      if (!pos || !pos.length) pos = objectToTris(new ThreeMFLoader().parse(buf));
      break;
    case 'ply':
      pos = geometryToTris(new PLYLoader().parse(buf));
      break;
    case 'glb':
    case 'gltf':
      return new Promise((resolve, reject) => {
        new GLTFLoader().parse(buf, '', (gltf) => resolve({ pos: yUpToZUp(objectToTris(gltf.scene)), name }), reject);
      });
    default:
      throw new Error(`Formato no soportado: .${ext}`);
  }
  if (!pos.length) throw new Error('El archivo no contiene triángulos');
  return { pos, name };
}
