// Corte en piezas para imprimir por separado: plano libre, tapas cerradas y anclajes
// (pasadores, espigas o imanes) colocados automáticamente según la forma de la sección.
// Trabaja con la malla de triángulos sueltos del estado (9 floats por cara).
import { ShapeUtils, Vector2 } from 'three';
import * as MC from './meshcore.js';

// ------------------------------------------------------------------ vectores y matrices
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// Matrices 4x4 en orden de columnas (como three.js): x' = m0 x + m4 y + m8 z + m12
export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function mat4Mul(a, b) {
  const r = new Array(16);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
    r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
  }
  return r;
}
export function mat4Translate(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
// Inversa de una transformación rígida (giro + traslación)
export function mat4RigidInverse(m) {
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  r[12] = -(r[0] * m[12] + r[4] * m[13] + r[8] * m[14]);
  r[13] = -(r[1] * m[12] + r[5] * m[13] + r[9] * m[14]);
  r[14] = -(r[2] * m[12] + r[6] * m[13] + r[10] * m[14]);
  return r;
}
export const isIdentity = (m) => !m || m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);
// Giro mínimo que lleva el vector unitario a sobre el b
export function mat4RotateTo(a, b) {
  const c = dot(a, b);
  if (c > 1 - 1e-12) return [...IDENTITY];
  let ax;
  if (c < -1 + 1e-12) {
    ax = Math.abs(a[0]) < 0.9 ? normalize(cross(a, [1, 0, 0])) : normalize(cross(a, [0, 1, 0]));
  } else ax = normalize(cross(a, b));
  const ang = Math.acos(clamp(c, -1, 1));
  const s = Math.sin(ang), t = 1 - Math.cos(ang), cs = Math.cos(ang);
  const [x, y, z] = ax;
  return [
    t * x * x + cs, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + cs, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + cs, 0,
    0, 0, 0, 1,
  ];
}
export function applyMat3(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; }

// Base ortonormal del plano (U, V, n) con U × V = n. En planos verticales V apunta hacia arriba.
export function planeBasis(n) {
  let U, V;
  if (Math.abs(n[2]) > 0.9) {
    const d = n[0];
    U = normalize([1 - d * n[0], -d * n[1], -d * n[2]]);
    V = cross(n, U);
  } else {
    const d = n[2];
    V = normalize([-d * n[0], -d * n[1], 1 - d * n[2]]);
    U = cross(V, n);
  }
  return { U, V };
}

// ------------------------------------------------------------------ plano
// Plano: { o: punto, n: normal unitaria }. El lado + es hacia donde apunta n.
export function sectionLines(pos, plane, faceMask = null) {
  const { o, n } = plane;
  const nF = pos.length / 9;
  const out = [];
  const d = [0, 0, 0];
  for (let f = 0; f < nF; f++) {
    if (faceMask && !faceMask(f)) continue;
    const b = f * 9;
    let pc = 0;
    for (let k = 0; k < 3; k++) {
      d[k] = (pos[b + k * 3] - o[0]) * n[0] + (pos[b + k * 3 + 1] - o[1]) * n[1] + (pos[b + k * 3 + 2] - o[2]) * n[2];
      if (d[k] >= 0) pc++;
    }
    if (pc === 0 || pc === 3) continue;
    for (let k = 0; k < 3; k++) {
      const k2 = (k + 1) % 3;
      if ((d[k] >= 0) === (d[k2] >= 0)) continue;
      const t = d[k] / (d[k] - d[k2]);
      const a = b + k * 3, c = b + k2 * 3;
      out.push(pos[a] + t * (pos[c] - pos[a]), pos[a + 1] + t * (pos[c + 1] - pos[a + 1]), pos[a + 2] + t * (pos[c + 2] - pos[a + 2]));
    }
  }
  return new Float32Array(out);
}

// Recorrido de la pieza a lo largo de n: [mín, máx] de la distancia de sus vértices al punto o
export function extentAlong(pos, o, n, faceMask = null) {
  let lo = Infinity, hi = -Infinity;
  const nF = pos.length / 9;
  for (let f = 0; f < nF; f++) {
    if (faceMask && !faceMask(f)) continue;
    for (let k = 0; k < 9; k += 3) {
      const b = f * 9 + k;
      const d = (pos[b] - o[0]) * n[0] + (pos[b + 1] - o[1]) * n[1] + (pos[b + 2] - o[2]) * n[2];
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
  }
  return [lo, hi];
}

// Valores y vectores propios de una matriz simétrica 3x3 (Jacobi). A = [a00, a01, a02, a11, a12, a22]
function eigSym3(A) {
  const a = [[A[0], A[1], A[2]], [A[1], A[3], A[4]], [A[2], A[4], A[5]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1, mx = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > mx) { p = 0; q = 2; mx = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > mx) { p = 1; q = 2; mx = Math.abs(a[1][2]); }
    if (mx < 1e-18) break;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
    for (let k = 0; k < 3; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
    for (let k = 0; k < 3; k++) { const kp = v[k][p], kq = v[k][q]; v[k][p] = c * kp - s * kq; v[k][q] = s * kp + c * kq; }
  }
  return [0, 1, 2].map((i) => ({ value: a[i][i], vector: [v[0][i], v[1][i], v[2][i]] })).sort((x, y) => x.value - y.value);
}

// Plano que separa las partes seleccionadas del resto ("cortar a la selección").
// 1) Si la selección comparte aristas con otras partes: plano que mejor se ajusta a ese borde.
// 2) Si es un cuerpo suelto apoyado en otro: la cara plana por la que se tocan.
// La normal apunta hacia la selección. Devuelve { o, n, planar, rms, how } o null.
export function fitPlaneToParts(pos, topo, faceParts, sel) {
  const { nF, nbr, area, cen, fn } = topo;
  const pts = [];
  let cs = [0, 0, 0], sa = 0;
  for (let f = 0; f < nF; f++) {
    if (!sel.has(faceParts[f])) continue;
    cs = add(cs, scale([cen[f * 3], cen[f * 3 + 1], cen[f * 3 + 2]], area[f]));
    sa += area[f];
    for (let k = 0; k < 3; k++) {
      const g = nbr[f * 3 + k];
      if (g < 0 || sel.has(faceParts[g])) continue;
      const a = (f * 3 + k) * 3, b = (f * 3 + ((k + 1) % 3)) * 3;
      const len = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
      if (!(len > 0)) continue;
      pts.push([pos[a], pos[a + 1], pos[a + 2], len / 2], [pos[b], pos[b + 1], pos[b + 2], len / 2]);
    }
  }
  if (!sa) return null;
  cs = scale(cs, 1 / sa);
  let res = null;
  if (pts.length >= 6) {
    let W = 0;
    const m = [0, 0, 0];
    for (const p of pts) { m[0] += p[0] * p[3]; m[1] += p[1] * p[3]; m[2] += p[2] * p[3]; W += p[3]; }
    const c = scale(m, 1 / W);
    const C = [0, 0, 0, 0, 0, 0];
    for (const p of pts) {
      const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], w = p[3] / W;
      C[0] += x * x * w; C[1] += x * y * w; C[2] += x * z * w; C[3] += y * y * w; C[4] += y * z * w; C[5] += z * z * w;
    }
    const e = eigSym3(C);
    if (e[1].value > 1e-9 * Math.max(e[2].value, 1e-12)) {
      const rms = Math.sqrt(Math.max(0, e[0].value));
      res = { o: c, n: normalize(e[0].vector), rms, planar: rms < Math.max(0.05, topo.diag * 0.002), how: 'borde', pts };
    }
  }
  if (!res) res = contactPlane(pos, topo, faceParts, sel);
  if (!res) return null;
  // ajustar a los ejes si está casi alineado (cortes limpios en modelos con escalones)
  for (let ax = 0; ax < 3; ax++) {
    if (Math.abs(res.n[ax]) > Math.cos((5 * Math.PI) / 180)) {
      const n = [0, 0, 0];
      n[ax] = Math.sign(res.n[ax]);
      res.n = n;
      if (res.pts) {
        const vals = res.pts.map((p) => p[ax]).sort((x, y) => x - y);
        res.o = [...res.o];
        res.o[ax] = vals[vals.length >> 1]; // valor real de un vértice: sin errores de redondeo
      }
      break;
    }
  }
  if (dot(sub(cs, res.o), res.n) < 0) res.n = scale(res.n, -1);
  delete res.pts;
  return res;
}

function contactPlane(pos, topo, faceParts, sel) {
  const { nF, area, cen, fn } = topo;
  const key = (nx, ny, nz, c) => `${Math.round(nx * 40)},${Math.round(ny * 40)},${Math.round(nz * 40)},${Math.round(c * 20)}`;
  const mine = new Map();
  for (let f = 0; f < nF; f++) {
    if (!sel.has(faceParts[f]) || !area[f]) continue;
    const N = [fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]];
    const k = key(N[0], N[1], N[2], N[0] * cen[f * 3] + N[1] * cen[f * 3 + 1] + N[2] * cen[f * 3 + 2]);
    let e = mine.get(k);
    if (!e) mine.set(k, (e = { area: 0, other: 0, N: [0, 0, 0], v: [pos[f * 9], pos[f * 9 + 1], pos[f * 9 + 2]] }));
    e.area += area[f];
    e.N = add(e.N, scale(N, area[f]));
  }
  for (let f = 0; f < nF; f++) {
    if (sel.has(faceParts[f]) || !area[f]) continue;
    const N = [fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]];
    const k = key(-N[0], -N[1], -N[2], -(N[0] * cen[f * 3] + N[1] * cen[f * 3 + 1] + N[2] * cen[f * 3 + 2]));
    const e = mine.get(k);
    if (e) e.other += area[f];
  }
  let best = null, bestA = 0;
  for (const e of mine.values()) {
    const a = Math.min(e.area, e.other);
    if (a > bestA) { bestA = a; best = e; }
  }
  if (!best || bestA < 1e-3) return null;
  return { o: best.v, n: scale(normalize(best.N), -1), rms: 0, planar: true, how: 'contacto' };
}

// ------------------------------------------------------------------ análisis de la sección
// Caras cerca del plano con sus vértices en coordenadas del plano (u, v, d).
function nearFaces(pos, plane, faceMask, range) {
  const { o, n } = plane;
  const { U, V } = planeBasis(n);
  const nF = pos.length / 9;
  const faces = [], cu = [], cv = [], cd = [], nu = [], nv = [];
  for (let f = 0; f < nF; f++) {
    if (faceMask && !faceMask(f)) continue;
    const b = f * 9;
    const x0 = pos[b] - o[0], y0 = pos[b + 1] - o[1], z0 = pos[b + 2] - o[2];
    const x1 = pos[b + 3] - o[0], y1 = pos[b + 4] - o[1], z1 = pos[b + 5] - o[2];
    const x2 = pos[b + 6] - o[0], y2 = pos[b + 7] - o[1], z2 = pos[b + 8] - o[2];
    const d0 = x0 * n[0] + y0 * n[1] + z0 * n[2];
    const d1 = x1 * n[0] + y1 * n[1] + z1 * n[2];
    const d2 = x2 * n[0] + y2 * n[1] + z2 * n[2];
    if (Math.max(d0, d1, d2) < -range || Math.min(d0, d1, d2) > range) continue;
    faces.push(f);
    cu.push(x0 * U[0] + y0 * U[1] + z0 * U[2], x1 * U[0] + y1 * U[1] + z1 * U[2], x2 * U[0] + y2 * U[1] + z2 * U[2]);
    cv.push(x0 * V[0] + y0 * V[1] + z0 * V[2], x1 * V[0] + y1 * V[1] + z1 * V[2], x2 * V[0] + y2 * V[1] + z2 * V[2]);
    cd.push(d0, d1, d2);
    const N = normalize(cross([x1 - x0, y1 - y0, z1 - z0], [x2 - x0, y2 - y0, z2 - z0]));
    nu.push(dot(N, U));
    nv.push(dot(N, V));
  }
  return { U, V, faces, cu, cv, cd, nu, nv };
}

// Segmentos de la sección a distancia `off` del plano, en (u, v), orientados con el material
// a la izquierda (los contornos exteriores giran en sentido antihorario mirando desde +n).
function sliceUV(ctx, off) {
  const { cu, cv, cd, nu, nv } = ctx;
  const out = [];
  for (let i = 0, m = ctx.faces.length; i < m; i++) {
    const j = i * 3;
    const s0 = cd[j] - off >= 0, s1 = cd[j + 1] - off >= 0, s2 = cd[j + 2] - off >= 0;
    if (s0 === s1 && s1 === s2) continue;
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0, first = true;
    for (let k = 0; k < 3; k++) {
      const a = j + k, b = j + ((k + 1) % 3);
      const da = cd[a] - off, db = cd[b] - off;
      if ((da >= 0) === (db >= 0)) continue;
      const t = da / (da - db);
      const x = cu[a] + t * (cu[b] - cu[a]), y = cv[a] + t * (cv[b] - cv[a]);
      if (first) { x1 = x; y1 = y; first = false; } else { x2 = x; y2 = y; }
    }
    // dirección n × N proyectada en el plano = (−N·V, N·U)
    if ((x2 - x1) * -nv[i] + (y2 - y1) * nu[i] < 0) out.push(x2, y2, x1, y1);
    else out.push(x1, y1, x2, y2);
  }
  return out;
}

// Número de vueltas (winding) en el centro de cada píxel: 0 fuera, 1 dentro, 2 si se solapan dos cuerpos.
function rasterWinding(segs, g) {
  const { u0, v0, h, W, H } = g;
  const rowsX = Array.from({ length: H }, () => []);
  const rowsW = Array.from({ length: H }, () => []);
  for (let i = 0; i < segs.length; i += 4) {
    const x1 = segs[i], y1 = segs[i + 1], x2 = segs[i + 2], y2 = segs[i + 3];
    if (y1 === y2) continue;
    const dir = y2 > y1 ? 1 : -1;
    const ylo = Math.min(y1, y2), yhi = Math.max(y1, y2);
    let j0 = Math.ceil((ylo - v0) / h - 0.5), j1 = Math.ceil((yhi - v0) / h - 0.5) - 1;
    if (j0 < 0) j0 = 0;
    if (j1 > H - 1) j1 = H - 1;
    const k = (x2 - x1) / (y2 - y1);
    for (let j = j0; j <= j1; j++) {
      rowsX[j].push(x1 + (v0 + (j + 0.5) * h - y1) * k);
      rowsW[j].push(dir);
    }
  }
  const wind = new Int16Array(W * H);
  for (let j = 0; j < H; j++) {
    const xs = rowsX[j], m = xs.length;
    if (!m) continue;
    const ws = rowsW[j];
    const ord = Array.from({ length: m }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const suf = new Int32Array(m + 1);
    for (let i = m - 1; i >= 0; i--) suf[i] = suf[i + 1] + ws[ord[i]];
    let p = 0;
    const row = j * W;
    for (let i = 0; i < W; i++) {
      const uc = u0 + (i + 0.5) * h;
      while (p < m && xs[ord[p]] <= uc) p++;
      wind[row + i] = suf[p];
    }
  }
  return wind;
}

// Transformada de distancia euclídea exacta (Felzenszwalb): distancia (en píxeles) de cada píxel
// interior al centro del píxel exterior más cercano.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
function edt(mask, W, H) {
  const INF = 1e12;
  const g = new Float64Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = mask[i] ? INF : 0;
  const L = Math.max(W, H);
  const f = new Float64Array(L), d = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    edt1d(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1d(f, W, d, v, z);
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]);
  }
  return out;
}

// Marca como "pared" los píxeles por los que pasa un contorno: así un anclaje no cruza nunca
// el borde entre dos cuerpos que se tocan (aunque juntos formen una sola mancha).
function burnSegments(mask, segs, g) {
  const { u0, v0, h, W, H } = g;
  for (let i = 0; i < segs.length; i += 4) {
    const x1 = (segs[i] - u0) / h, y1 = (segs[i + 1] - v0) / h, x2 = (segs[i + 2] - u0) / h, y2 = (segs[i + 3] - v0) / h;
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
    for (let k = 0; k <= steps; k++) {
      const ix = Math.floor(x1 + ((x2 - x1) * k) / steps), iy = Math.floor(y1 + ((y2 - y1) * k) / steps);
      if (ix >= 0 && iy >= 0 && ix < W && iy < H) mask[iy * W + ix] = 0;
    }
  }
}

// "Mirando" desde el plano hacia dentro de un lado (s = +1 / −1): distancia a la primera superficie
// sobre cada píxel (pared, escalón, otro cuerpo, el fondo de la pieza). Un agujero debe caber antes.
function depthBuffer(ctx, s, g, dmin, dmax) {
  const { u0, v0, h, W, H } = g;
  const buf = new Float32Array(W * H).fill(Infinity);
  const { cu, cv, cd } = ctx;
  const put = (x, y, d) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const p = iy * W + ix;
    if (d < buf[p]) buf[p] = d;
  };
  for (let i = 0, m = ctx.faces.length; i < m; i++) {
    const j = i * 3;
    const d0 = cd[j] * s, d1 = cd[j + 1] * s, d2 = cd[j + 2] * s;
    if (Math.max(d0, d1, d2) <= dmin || Math.min(d0, d1, d2) > dmax) continue;
    const X = [(cu[j] - u0) / h, (cu[j + 1] - u0) / h, (cu[j + 2] - u0) / h];
    const Y = [(cv[j] - v0) / h, (cv[j + 1] - v0) / h, (cv[j + 2] - v0) / h];
    const D = [d0, d1, d2];
    // aristas: también cuentan las caras paralelas a n (no tienen área vista desde el plano)
    for (let k = 0; k < 3; k++) {
      const a = k, b = (k + 1) % 3;
      const steps = Math.max(1, Math.ceil(Math.hypot(X[b] - X[a], Y[b] - Y[a]) * 2));
      for (let q = 0; q <= steps; q++) {
        const t = q / steps;
        const d = D[a] + t * (D[b] - D[a]);
        if (d > dmin && d <= dmax) put(X[a] + t * (X[b] - X[a]), Y[a] + t * (Y[b] - Y[a]), d);
      }
    }
    const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
    if (Math.abs(area) < 1e-9) continue;
    const ix0 = Math.max(0, Math.ceil(Math.min(X[0], X[1], X[2]) - 0.5)), ix1 = Math.min(W - 1, Math.floor(Math.max(X[0], X[1], X[2]) - 0.5));
    const iy0 = Math.max(0, Math.ceil(Math.min(Y[0], Y[1], Y[2]) - 0.5)), iy1 = Math.min(H - 1, Math.floor(Math.max(Y[0], Y[1], Y[2]) - 0.5));
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = iy + 0.5;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = ix + 0.5;
        const w0 = ((X[1] - px) * (Y[2] - py) - (X[2] - px) * (Y[1] - py)) / area;
        const w1 = ((X[2] - px) * (Y[0] - py) - (X[0] - px) * (Y[2] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * d0 + w1 * d1 + w2 * d2;
        if (d > dmin && d <= dmax) { const p = iy * W + ix; if (d < buf[p]) buf[p] = d; }
      }
    }
  }
  return buf;
}

// Analiza dónde caben anclajes:
//  · zona de contacto: material a los dos lados del plano, de un solo cuerpo (sin solapes) y sin
//    cruzar el borde entre dos cuerpos que se tocan;
//  · profundidad libre a cada lado (depthBuffer);
// y con eso, para cada profundidad, el grosor de pared que queda alrededor de cada punto.
export function analyzeCut(pos, plane, { faceMask = null, maxDepth = 18 } = {}) {
  const pl = { o: [...plane.o], n: normalize(plane.n) };
  const ctx = nearFaces(pos, pl, faceMask, maxDepth + 1);
  const { U, V } = ctx;
  const base = { plane: pl, U, V, empty: true, islands: [], areaSection: 0, areaContact: 0 };
  if (!ctx.faces.length) return base;
  const delta = 0.04;
  const segP = sliceUV(ctx, delta), segN = sliceUV(ctx, -delta);
  if (!segP.length || !segN.length) return base;
  let umin = Infinity, vmin = Infinity, umax = -Infinity, vmax = -Infinity;
  for (const s of [segP, segN]) {
    for (let i = 0; i < s.length; i += 2) {
      if (s[i] < umin) umin = s[i]; if (s[i] > umax) umax = s[i];
      if (s[i + 1] < vmin) vmin = s[i + 1]; if (s[i + 1] > vmax) vmax = s[i + 1];
    }
  }
  const L = Math.max(umax - umin, vmax - vmin, 1e-3);
  let h = clamp(L / 300, 0.05, 1.5);
  let margin, W, H;
  const dims = () => { margin = Math.max(2, 4 * h); W = Math.ceil((umax - umin + 2 * margin) / h); H = Math.ceil((vmax - vmin + 2 * margin) / h); };
  dims();
  while (W * H > 160000) { h *= 1.12; dims(); }
  const g = { u0: umin - margin, v0: vmin - margin, h, W, H };
  const N = W * H;
  const wP = rasterWinding(segP, g), wN = rasterWinding(segN, g);
  const contact = new Uint8Array(N);
  let both = 0, nContact = 0;
  for (let i = 0; i < N; i++) {
    if (wP[i] !== 0 && wN[i] !== 0) both++;
    if ((wP[i] === 1 || wP[i] === -1) && (wN[i] === 1 || wN[i] === -1)) { contact[i] = 1; nContact++; }
  }
  burnSegments(contact, segP, g);
  burnSegments(contact, segN, g);
  const px2mm = (e) => {
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = e[i] > 0 ? Math.max(0, (e[i] - 0.5) * h) : 0;
    return out;
  };
  const contactClear = px2mm(edt(contact, W, H));
  // pared disponible a cada profundidad: zona de contacto sin superficies antes de esa profundidad
  const T = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18].filter((t) => t <= maxDepth + 1e-9);
  const fields = {};
  const free = {};
  for (const s of [1, -1]) {
    free[s] = depthBuffer(ctx, s, g, 0.06, maxDepth + 0.5);
    fields[s] = T.map((t) => {
      const mask = new Uint8Array(N);
      for (let i = 0; i < N; i++) mask[i] = contact[i] && free[s][i] >= t ? 1 : 0;
      return px2mm(edt(mask, W, H));
    });
  }
  // islas (zonas de contacto separadas: p. ej. las dos patas de una figura)
  const label = new Int32Array(N).fill(-1);
  const islands = [];
  const queue = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (!contact[s0] || label[s0] >= 0) continue;
    const id = islands.length;
    let qh = 0, qt = 0;
    queue[qt++] = s0;
    label[s0] = id;
    let cnt = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0, best = -1, bestAt = s0;
    while (qh < qt) {
      const p = queue[qh++];
      const i = p % W, j = (p / W) | 0;
      const u = g.u0 + (i + 0.5) * h, v = g.v0 + (j + 0.5) * h;
      cnt++; su += u; sv += v; suu += u * u; svv += v * v; suv += u * v;
      if (contactClear[p] > best) { best = contactClear[p]; bestAt = p; }
      if (i > 0 && contact[p - 1] && label[p - 1] < 0) { label[p - 1] = id; queue[qt++] = p - 1; }
      if (i < W - 1 && contact[p + 1] && label[p + 1] < 0) { label[p + 1] = id; queue[qt++] = p + 1; }
      if (j > 0 && contact[p - W] && label[p - W] < 0) { label[p - W] = id; queue[qt++] = p - W; }
      if (j < H - 1 && contact[p + W] && label[p + W] < 0) { label[p + W] = id; queue[qt++] = p + W; }
    }
    const cu = su / cnt, cv = sv / cnt;
    const a = suu / cnt - cu * cu, b = suv / cnt - cu * cv, c = svv / cnt - cv * cv;
    islands.push({ id, px: cnt, area: cnt * h * h, cu, cv, angle: 0.5 * Math.atan2(2 * b, a - c), maxClear: best, maxAt: bestAt });
  }
  islands.sort((x, y) => y.area - x.area);
  // sección de cada lado (para dibujarla rellena al ver el corte por dentro)
  const secP = new Uint8Array(N), secN = new Uint8Array(N);
  for (let i = 0; i < N; i++) { secP[i] = wP[i] !== 0 ? 1 : 0; secN[i] = wN[i] !== 0 ? 1 : 0; }
  return {
    ...base, empty: !islands.length, g, contact, contactClear, label, islands, T, fieldP: fields[1], fieldN: fields[-1], freeP: free[1], freeN: free[-1], delta, secP, secN,
    areaSection: both * h * h, areaContact: nContact * h * h, size: [umax - umin, vmax - vmin],
  };
}

const depthIndex = (T, d) => { for (let k = 0; k < T.length; k++) if (T[k] >= d - 1e-9) return k; return -1; };
const bottomFor = (d) => Math.max(0.8, 0.12 * d); // material bajo el fondo del agujero
// Pared disponible (mm) en un píxel para agujeros que llegan (fondo incluido) hasta rP en el lado + y rN en el −
function clearAt(an, p, rP, rN) {
  let c = an.contactClear[p];
  if (rP > 0) { const k = depthIndex(an.T, rP); c = k < 0 ? 0 : Math.min(c, an.fieldP[k][p]); }
  if (rN > 0) { const k = depthIndex(an.T, rN); c = k < 0 ? 0 : Math.min(c, an.fieldN[k][p]); }
  return c;
}
export function uvToPixel(an, u, v) {
  const { u0, v0, h, W, H } = an.g;
  const i = Math.floor((u - u0) / h), j = Math.floor((v - v0) / h);
  if (i < 0 || j < 0 || i >= W || j >= H) return -1;
  return j * W + i;
}
function pixelUV(an, p) {
  const { u0, v0, h, W } = an.g;
  return [u0 + ((p % W) + 0.5) * h, v0 + (((p / W) | 0) + 0.5) * h];
}
export function planeToWorld(an, u, v) {
  const { o } = an.plane;
  return add(o, add(scale(an.U, u), scale(an.V, v)));
}
export function worldToPlane(an, P) {
  const r = sub(P, an.plane.o);
  return [dot(r, an.U), dot(r, an.V), dot(r, an.plane.n)];
}

// ------------------------------------------------------------------ anclajes
const DOWELS = [12, 10, 8, 6, 5, 4, 3];
export const MAGNETS = [[12, 3], [10, 3], [10, 2], [8, 3], [8, 2], [6, 3], [6, 2], [5, 2], [4, 2], [3, 2]];
const wallFor = (d) => Math.max(1.2, 0.3 * d);
const mouthChamfer = (d) => Math.min(0.4, 0.1 * d);
const segsFor = (r) => clamp(Math.ceil((2 * Math.PI * r) / 0.5), 24, 72);
const PIN_GAP = 0.4; // hueco al fondo del agujero (el pegamento y los restos no impiden cerrar)

// Qué lleva cada lado del corte para un anclaje: agujero (r = apotema), espiga o nada.
export function connectorFeatures(c) {
  const sides = { 1: null, '-1': null };
  const shape = c.shape === 'square' ? { m: 4, phase: (c.angle || 0) + Math.PI / 4 } : null;
  if (c.type === 'magnet') {
    const r = c.d / 2 + Math.min(c.clearance, 0.1);
    const depth = (c.h || 2) + 0.2;
    for (const s of [1, -1]) sides[s] = { kind: 'hole', r, ch: 0, depth, m: segsFor(r), phase: 0 };
    return sides;
  }
  const ch = mouthChamfer(c.d), r = c.d / 2 + c.clearance;
  const hole = (depth) => ({ kind: 'hole', r, ch, depth, m: shape ? 4 : segsFor(r), phase: shape ? shape.phase : 0 });
  if (c.type === 'plug') {
    const ps = c.pinSide || -1;
    const dh = ps > 0 ? c.depthNeg : c.depthPos;
    sides[-ps] = hole(dh);
    sides[ps] = { kind: 'pin', r: c.d / 2, height: Math.max(1, dh - PIN_GAP), ch: Math.min(0.5, 0.15 * c.d), m: shape ? 4 : segsFor(c.d / 2), phase: shape ? shape.phase : 0 };
    return sides;
  }
  sides[1] = hole(c.depthPos);
  sides[-1] = hole(c.depthNeg);
  return sides;
}
// Radio que ocupa el anclaje en la cara del corte (para comprobar que no toca el borde)
function footprint(ft) {
  if (!ft) return 0;
  if (ft.kind === 'pin') return ft.r;
  return (ft.r + ft.ch) / Math.cos(Math.PI / ft.m);
}
export function connectorRadius(c) {
  const f = connectorFeatures(c);
  return Math.max(footprint(f[1]), footprint(f[-1]));
}

// Pared que queda alrededor de un anclaje (mm). Negativa = se sale de la pieza o no cabe.
export function connectorWall(an, c) {
  const p = uvToPixel(an, c.u, c.v);
  if (p < 0 || !an.contact[p]) return -1;
  const f = connectorFeatures(c);
  let wall = Infinity;
  for (const s of [1, -1]) {
    const ft = f[s];
    if (!ft) continue;
    const reach = ft.kind === 'hole' ? ft.depth + (c.type === 'magnet' ? 0.8 : bottomFor(c.d)) : 0;
    const cl = clearAt(an, p, s > 0 ? reach : 0, s < 0 ? reach : 0);
    wall = Math.min(wall, cl - footprint(ft));
  }
  return wall === Infinity ? an.contactClear[p] : wall;
}

function islandPixels(an, id) {
  const out = [];
  for (let p = 0; p < an.label.length; p++) if (an.label[p] === id) out.push(p);
  return out;
}

// Profundidad máxima (de la lista) en la que cabe el agujero en ese lado
function bestDepth(an, pix, side, need, list, bottom) {
  for (const d0 of list) {
    const d = Math.round(d0 * 2) / 2;
    const k = depthIndex(an.T, d + bottom);
    if (k < 0) continue;
    const F = side > 0 ? an.fieldP[k] : an.fieldN[k];
    for (const p of pix) if (F[p] >= need) return d;
  }
  return 0;
}

// Reparte puntos lo más separados posible (muestreo del punto más lejano): el primero en el
// extremo de la zona y cada siguiente donde más lejos quede de los anteriores.
function pickPoints(an, pix, isl, need, rP, rN, nMax, spacing) {
  const cand = [];
  for (const p of pix) if (clearAt(an, p, rP, rN) >= need) cand.push(p);
  if (!cand.length) return [];
  const xy = cand.map((p) => pixelUV(an, p));
  let first = 0, fd = -1;
  xy.forEach(([u, v], i) => { const d = (u - isl.cu) ** 2 + (v - isl.cv) ** 2; if (d > fd) { fd = d; first = i; } });
  const pts = [first];
  const md = new Float64Array(cand.length).fill(Infinity);
  while (pts.length < nMax) {
    const [lu, lv] = xy[pts[pts.length - 1]];
    let bi = -1, bv = -1;
    for (let i = 0; i < cand.length; i++) {
      const d = (xy[i][0] - lu) ** 2 + (xy[i][1] - lv) ** 2;
      if (d < md[i]) md[i] = d;
      if (md[i] > bv) { bv = md[i]; bi = i; }
    }
    if (bv < spacing * spacing) break;
    pts.push(bi);
  }
  return pts.map((i) => cand[i]);
}
// El punto con más pared alrededor (para un único anclaje: en el centro de la zona)
function bestCenter(an, pix, rP, rN) {
  let best = -1, at = -1;
  for (const p of pix) { const c = clearAt(an, p, rP, rN); if (c > best) { best = c; at = p; } }
  return at;
}

// Anclajes automáticos según la geometría de la sección.
// opts: { type: 'dowel'|'plug'|'magnet'|'none', clearance, size (diámetro fijo) | null, magnet: [d, h] | null }
// - Tamaño: ~30 % del grosor de la zona (pasadores estándar de 3 a 12 mm).
// - Cantidad: 2 por zona (no gira) y más en secciones grandes, lo más separados posible.
// - Profundidad: 1,5 × diámetro por lado, lo que quepa sin tocar paredes, escalones ni otros cuerpos.
// - Si un lado es demasiado fino para un agujero, espigas que salen de ese lado.
export function autoConnectors(an, opts = {}) {
  const type = opts.type || 'dowel';
  const out = { list: [], warnings: [] };
  if (!an || an.empty || type === 'none') return out;
  const clr = opts.clearance ?? 0.15;
  const upSide = an.plane.n[2] >= -1e-6 ? -1 : 1; // pieza cuya cara de corte mira hacia arriba
  let id = 1, plugFallback = false;
  for (const isl of an.islands) {
    if (isl.area < 4) continue;
    const pix = islandPixels(an, isl.id);
    const nMax = clamp(Math.round(Math.sqrt(isl.area) / 25) + 1, 2, 6);
    const thick = 2 * isl.maxClear; // grosor de la zona (círculo inscrito)
    let plan = null, single = null;
    if (type === 'magnet') {
      const mags = opts.magnet ? [opts.magnet] : MAGNETS.filter(([d]) => d <= Math.max(3, 0.45 * thick) + 1e-9);
      for (const [md, mh] of mags) {
        const r = md / 2 + Math.min(clr, 0.1), wall = Math.max(1.2, 0.2 * md), depth = mh + 0.2;
        const need = r / Math.cos(Math.PI / segsFor(r)) + wall;
        if (isl.maxClear < need) continue;
        const reach = depth + 0.8;
        const spacing = Math.max(2.5 * md, 2 * r + 2 * wall);
        let pts = pickPoints(an, pix, isl, need + Math.min(1.5, 0.2 * md), reach, reach, nMax, spacing);
        if (pts.length < Math.min(2, nMax)) pts = pickPoints(an, pix, isl, need, reach, reach, nMax, spacing);
        const P = { D: md, H: mh, dP: depth, dN: depth, rP: reach, rN: reach, kind: 'magnet', ps: upSide };
        if (pts.length >= Math.min(2, nMax)) { plan = { ...P, pts }; break; }
        if (pts.length === 1 && !single) single = { ...P, pts: [bestCenter(an, pix, reach, reach)] };
      }
    } else {
      const sizes = opts.size ? [opts.size] : DOWELS.filter((d) => d <= Math.max(3, 0.3 * thick) + 1e-9);
      // primero pasadores (las dos piezas se imprimen apoyadas en la cara del corte); si en ningún
      // tamaño caben a los dos lados, espigas que salen de la parte fina y entran en la gruesa
      const passes = type === 'dowel' ? ['dowel', 'plug'] : ['plug'];
      for (const mode of passes) {
        for (const D of sizes) {
          const ch = mouthChamfer(D), rh = D / 2 + clr, wall = wallFor(D), bottom = bottomFor(D);
          const need = (rh + ch) / Math.cos(Math.PI / segsFor(rh)) + wall;
          if (isl.maxClear < need) continue;
          const dT = clamp(Math.round(1.5 * D), 4, 15);
          const depths = [dT, dT * 0.75, dT * 0.5, Math.max(2.5, 0.6 * D)];
          const aP = bestDepth(an, pix, 1, need, depths, bottom), aN = bestDepth(an, pix, -1, need, depths, bottom);
          let ps = upSide, dP = 0, dN = 0;
          if (mode === 'dowel') {
            if (!aP || !aN) continue;
            dP = aP; dN = aN;
          } else {
            if (!aP && !aN) continue;
            // la espiga sale de la pieza cuya cara mira hacia arriba, salvo que la otra no admita el agujero
            const holeDepth = (side) => (side > 0 ? aP : aN);
            ps = holeDepth(-upSide) ? upSide : -upSide;
            if (ps < 0) dP = aP; else dN = aN;
          }
          const rP = dP ? dP + bottom : 0, rN = dN ? dN + bottom : 0;
          const spacing = Math.max(2 * (rh + ch) + 2 * wall, 2 * D);
          let pts = pickPoints(an, pix, isl, need + Math.min(1.5, 0.25 * D), rP, rN, nMax, spacing);
          if (pts.length < Math.min(2, nMax)) pts = pickPoints(an, pix, isl, need, rP, rN, nMax, spacing);
          const P = { D, dP, dN, rP, rN, kind: mode, ps };
          if (pts.length >= Math.min(2, nMax)) { plan = { ...P, pts }; break; }
          if (pts.length === 1 && !single) single = { ...P, pts: [bestCenter(an, pix, rP, rN)] };
        }
        if (plan) break;
      }
    }
    if (!plan && single) {
      plan = { ...single, single: true };
      // un solo anclaje: cuadrado para que la pieza no gire, si cabe con las esquinas
      if (plan.kind !== 'magnet') {
        const ch = mouthChamfer(plan.D), rh = plan.D / 2 + clr;
        plan.square = clearAt(an, plan.pts[0], plan.rP, plan.rN) >= (rh + ch) * Math.SQRT2 + 0.8 * wallFor(plan.D);
      }
    }
    if (!plan) {
      if (isl.area >= 10) out.warnings.push(`Una zona de ${Math.round(isl.area)} mm² es demasiado fina para anclajes: pégala directamente.`);
      continue;
    }
    if (type === 'dowel' && plan.kind === 'plug') plugFallback = true;
    for (const p of plan.pts) {
      const [u, v] = pixelUV(an, p);
      out.list.push({
        id: id++, type: plan.kind, u, v, d: plan.D, h: plan.H || 0, depthPos: plan.dP, depthNeg: plan.dN, clearance: clr,
        shape: plan.square ? 'square' : 'round', angle: isl.angle, pinSide: plan.ps, island: isl.id,
      });
    }
  }
  if (plugFallback) out.warnings.push('Un lado es demasiado fino para pasadores: se usan espigas que salen de la parte fina y entran en la gruesa.');
  return out;
}

// Un anclaje puesto a mano en (u, v) con el tamaño indicado; ajusta la profundidad a lo que quepa.
export function manualConnector(an, u, v, opts = {}) {
  const p = uvToPixel(an, u, v);
  if (p < 0 || !an.contact[p]) return null;
  const type = opts.type || 'dowel';
  const clr = opts.clearance ?? 0.15;
  const upSide = an.plane.n[2] >= -1e-6 ? -1 : 1;
  const isl = an.islands.find((x) => x.id === an.label[p]);
  const base = { id: 0, type, u, v, clearance: clr, shape: 'round', angle: isl ? isl.angle : 0, pinSide: upSide, island: isl ? isl.id : -1 };
  if (type === 'magnet') {
    const [md, mh] = opts.magnet || [6, 3];
    return { ...base, d: md, h: mh, depthPos: mh + 0.2, depthNeg: mh + 0.2 };
  }
  const D = opts.size || 5;
  const bottom = bottomFor(D);
  const need = (D / 2 + clr + mouthChamfer(D)) + wallFor(D) * 0.5;
  const dT = clamp(Math.round(1.5 * D), 4, 15);
  const fit = (side) => {
    for (const d of [dT, dT * 0.75, dT * 0.5, Math.max(2.5, 0.6 * D)]) {
      const dd = Math.round(d * 2) / 2;
      if (clearAt(an, p, side > 0 ? dd + bottom : 0, side < 0 ? dd + bottom : 0) >= need) return dd;
    }
    return 0;
  };
  const aP = fit(1), aN = fit(-1);
  if (type === 'plug' || !aP || !aN) {
    // espiga: sale del lado más fino
    const ps = type === 'plug' && aP && aN ? upSide : aP ? -1 : 1;
    const dh = ps < 0 ? aP || Math.max(2.5, Math.round(0.6 * D * 2) / 2) : aN || Math.max(2.5, Math.round(0.6 * D * 2) / 2);
    return { ...base, type: 'plug', d: D, h: 0, depthPos: ps < 0 ? dh : 0, depthNeg: ps > 0 ? dh : 0, pinSide: ps };
  }
  return { ...base, d: D, h: 0, depthPos: aP, depthNeg: aN };
}

// ------------------------------------------------------------------ corte real
class Soup {
  constructor(cap) {
    cap = Math.max(16, cap | 0);
    this.pos = new Float32Array(cap * 9);
    this.part = new Uint16Array(cap);
    this.piece = new Uint16Array(cap);
    this.side = new Int8Array(cap);
    this.cop = new Uint8Array(cap);
    this.n = 0;
  }
  ensure(k) {
    if (this.n + k <= this.part.length) return;
    let cap = this.part.length * 2;
    while (cap < this.n + k) cap *= 2;
    const grow = (A, m) => { const B = new A.constructor(cap * m); B.set(A); return B; };
    this.pos = grow(this.pos, 9);
    this.part = grow(this.part, 1);
    this.piece = grow(this.piece, 1);
    this.side = grow(this.side, 1);
    this.cop = grow(this.cop, 1);
  }
  push(a, b, c, part, piece, side = 0, cop = 0) {
    this.ensure(1);
    const o = this.n * 9, P = this.pos;
    P[o] = a[0]; P[o + 1] = a[1]; P[o + 2] = a[2];
    P[o + 3] = b[0]; P[o + 4] = b[1]; P[o + 5] = b[2];
    P[o + 6] = c[0]; P[o + 7] = c[1]; P[o + 8] = c[2];
    this.part[this.n] = part; this.piece[this.n] = piece; this.side[this.n] = side; this.cop[this.n] = cop;
    this.n++;
  }
  pushRaw(src, so, part, piece, side = 0, cop = 0) {
    this.ensure(1);
    this.pos.set(src.subarray(so, so + 9), this.n * 9);
    this.part[this.n] = part; this.piece[this.n] = piece; this.side[this.n] = side; this.cop[this.n] = cop;
    this.n++;
  }
}
function lexLess(P, a, b) {
  if (P[a] !== P[b]) return P[a] < P[b];
  if (P[a + 1] !== P[b + 1]) return P[a + 1] < P[b + 1];
  return P[a + 2] < P[b + 2];
}
// Punto de corte de una arista, calculado siempre en el mismo orden (las dos caras que la
// comparten obtienen exactamente el mismo punto: la malla queda cerrada).
function edgePt(P, ia, ib, da, db) {
  if (lexLess(P, ib, ia)) { let t = ia; ia = ib; ib = t; t = da; da = db; db = t; }
  const t = da / (da - db);
  return [P[ia] + t * (P[ib] - P[ia]), P[ia + 1] + t * (P[ib + 1] - P[ia + 1]), P[ia + 2] + t * (P[ib + 2] - P[ia + 2])];
}
// Añade un triángulo con la orientación que da la normal esperada
function triOriented(out, a, b, c, expect, part, piece) {
  const nrm = cross(sub(b, a), sub(c, a));
  const l = Math.hypot(nrm[0], nrm[1], nrm[2]);
  if (!(l > 1e-12)) return;
  if (dot(nrm, expect) < 0) out.push(a, c, b, part, piece);
  else out.push(a, b, c, part, piece);
}
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(x, y, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
    t = clamp(t, 0, 1);
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best) best = d;
  }
  return best;
}
// ¿El agujero está dentro del contorno? Se prueba con puntos medios de sus aristas que no caigan
// sobre el borde (un agujero puede tocar el contorno exterior en un vértice)
function holeInside(hole, outer) {
  const m = hole.length;
  const step = Math.max(1, Math.floor(m / 12));
  for (let i = 0; i < m; i += step) {
    const a = hole[i], b = hole[(i + 1) % m];
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    if (distToPoly(x, y, outer) < 1e-7) continue;
    return pointInPoly(x, y, outer);
  }
  return pointInPoly(hole[0][0], hole[0][1], outer);
}
// Parte un contorno cerrado (lista de esquinas) en contornos simples allí donde repite vértice
function splitPinches(loop, key) {
  const out = [];
  const stack = [loop];
  while (stack.length) {
    const L = stack.pop();
    const seen = new Map();
    let cut = null;
    for (let i = 0; i < L.length; i++) {
      const k = key(L[i]);
      if (seen.has(k)) { cut = [seen.get(k), i]; break; }
      seen.set(k, i);
    }
    if (!cut) { out.push(L); continue; }
    const [i, j] = cut;
    stack.push(L.slice(i, j), [...L.slice(0, i), ...L.slice(j)]);
  }
  return out.filter((L) => L.length >= 3);
}
const signedArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
};

// Corta las piezas indicadas por el plano, cierra los cortes con tapas y talla los anclajes.
// mesh = { pos, faceParts, facePiece }. opts = { targetPieces: Set|null, nextPieceId }
// Devuelve { ok, pos, faceParts, facePiece, created: [{ id, kind, from }], placed, warnings, stats }
export function executeCut(mesh, plane, connectors = [], opts = {}) {
  const { pos, faceParts } = mesh;
  const nF = pos.length / 9;
  const facePiece = mesh.facePiece || new Uint16Array(nF);
  const n = normalize(plane.n), o = plane.o;
  const { U, V } = planeBasis(n);
  const targets = opts.targetPieces || null;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) { if (pos[i + a] < lo[a]) lo[a] = pos[i + a]; if (pos[i + a] > hi[a]) hi[a] = pos[i + a]; }
  }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  // vértices a menos de eps del plano cuentan como "sobre el plano" (sin astillas al partir: un punto
  // de corte nunca queda tan cerca de un vértice como para que se suelden); eps2: tolerancia de los bordes
  const eps = Math.max(diag * 5e-6, 5e-5);
  const eps2 = Math.max(diag * 2e-5, 2e-4);
  const warnings = [];

  // 1) clasificar cada cara y partir las que cruzan el plano
  const S = new Soup(nF + 4096);
  const dv = [0, 0, 0];
  for (let f = 0; f < nF; f++) {
    const b = f * 9, part = faceParts[f], pc = facePiece[f];
    if (targets && !targets.has(pc)) { S.pushRaw(pos, b, part, pc); continue; }
    let np = 0, nn = 0;
    for (let k = 0; k < 3; k++) {
      let d = (pos[b + k * 3] - o[0]) * n[0] + (pos[b + k * 3 + 1] - o[1]) * n[1] + (pos[b + k * 3 + 2] - o[2]) * n[2];
      if (Math.abs(d) < eps) d = 0;
      dv[k] = d;
      if (d > 0) np++; else if (d < 0) nn++;
    }
    if (!np && !nn) {
      // cara sobre el plano: es parte de la cara de corte de la pieza que queda detrás de ella
      const N = cross(sub([pos[b + 3], pos[b + 4], pos[b + 5]], [pos[b], pos[b + 1], pos[b + 2]]), sub([pos[b + 6], pos[b + 7], pos[b + 8]], [pos[b], pos[b + 1], pos[b + 2]]));
      S.pushRaw(pos, b, part, pc, dot(N, n) < 0 ? 1 : -1, 1);
      continue;
    }
    if (!nn) { S.pushRaw(pos, b, part, pc, 1); continue; }
    if (!np) { S.pushRaw(pos, b, part, pc, -1); continue; }
    const Vx = (k) => [pos[b + k * 3], pos[b + k * 3 + 1], pos[b + k * 3 + 2]];
    const zi = dv[0] === 0 ? 0 : dv[1] === 0 ? 1 : dv[2] === 0 ? 2 : -1;
    if (zi >= 0) {
      const a = zi, bb = (a + 1) % 3, c = (a + 2) % 3;
      const p = edgePt(pos, b + bb * 3, b + c * 3, dv[bb], dv[c]);
      S.push(Vx(a), Vx(bb), p, part, pc, Math.sign(dv[bb]));
      S.push(Vx(a), p, Vx(c), part, pc, Math.sign(dv[c]));
    } else {
      let a = 0;
      for (let k = 0; k < 3; k++) {
        const s = Math.sign(dv[k]);
        if (Math.sign(dv[(k + 1) % 3]) !== s && Math.sign(dv[(k + 2) % 3]) !== s) a = k;
      }
      const bb = (a + 1) % 3, c = (a + 2) % 3;
      const pab = edgePt(pos, b + a * 3, b + bb * 3, dv[a], dv[bb]);
      const pca = edgePt(pos, b + c * 3, b + a * 3, dv[c], dv[a]);
      S.push(Vx(a), pab, pca, part, pc, Math.sign(dv[a]));
      S.push(pab, Vx(bb), Vx(c), part, pc, Math.sign(dv[bb]));
      S.push(pab, Vx(c), pca, part, pc, Math.sign(dv[bb]));
    }
  }

  // 2) piezas nuevas: las que tienen material a los dos lados se parten en dos
  const cnt = new Map();
  let maxPiece = 0;
  for (let i = 0; i < S.n; i++) {
    if (S.piece[i] > maxPiece) maxPiece = S.piece[i];
    if (!S.side[i]) continue;
    let c = cnt.get(S.piece[i]);
    if (!c) cnt.set(S.piece[i], (c = [0, 0]));
    c[S.side[i] > 0 ? 0 : 1]++;
  }
  let nextPiece = Math.max(opts.nextPieceId || 0, maxPiece + 1);
  const plusId = new Map();
  const created = [];
  for (const [pc, c] of cnt) {
    if (c[0] && c[1]) { plusId.set(pc, nextPiece); created.push({ id: nextPiece, kind: 'body', from: pc, side: 1 }); nextPiece++; }
  }
  if (!plusId.size) return { ok: false, reason: 'El plano no atraviesa la pieza' };
  for (let i = 0; i < S.n; i++) {
    if (S.side[i] && !plusId.has(S.piece[i])) S.side[i] = 0; // pieza entera a un lado: no se toca
    else if (S.side[i] > 0) S.piece[i] = plusId.get(S.piece[i]);
  }

  // 3) bordes abiertos sobre el plano de cada lado -> contornos -> tapas
  const P2 = S.pos.subarray(0, S.n * 9);
  const T2 = MC.buildTopology(P2, S.piece.subarray(0, S.n)); // sin soldar entre piezas
  const { vid, nbr } = T2;
  const cornerUV = (c) => {
    const x = P2[c * 3] - o[0], y = P2[c * 3 + 1] - o[1], z = P2[c * 3 + 2] - o[2];
    return [x * U[0] + y * U[1] + z * U[2], x * V[0] + y * V[1] + z * V[2]];
  };
  const cornerP = (c) => [P2[c * 3], P2[c * 3 + 1], P2[c * 3 + 2]];
  const cornerD = (c) => (P2[c * 3] - o[0]) * n[0] + (P2[c * 3 + 1] - o[1]) * n[1] + (P2[c * 3 + 2] - o[2]) * n[2];
  const capTris = []; // a, b, c, part, piece (planos)
  const stats = { loops: 0, open: 0, offPlane: 0 };
  const polysBySide = { 1: [], '-1': [] };
  for (const s of [1, -1]) {
    const degenerate = (f) => vid[f * 3] === vid[f * 3 + 1] || vid[f * 3 + 1] === vid[f * 3 + 2] || vid[f * 3] === vid[f * 3 + 2];
    const inSide = (f) => f >= 0 && S.side[f] === s && !S.cop[f] && !degenerate(f);
    const hes = [];
    for (let f = 0; f < S.n; f++) {
      if (!inSide(f)) continue;
      for (let k = 0; k < 3; k++) {
        if (inSide(nbr[f * 3 + k])) continue;
        const c0 = f * 3 + k, c1 = f * 3 + ((k + 1) % 3);
        if (Math.abs(cornerD(c0)) > eps2 || Math.abs(cornerD(c1)) > eps2) { stats.offPlane++; continue; }
        hes.push(c0);
      }
    }
    const next = (c0) => { const f = (c0 / 3) | 0; return f * 3 + (((c0 % 3) + 1) % 3); };
    const outMap = new Map();
    hes.forEach((c0, i) => {
      const va = vid[c0];
      let l = outMap.get(va);
      if (!l) outMap.set(va, (l = []));
      l.push(i);
    });
    const used = new Uint8Array(hes.length);
    const loops = [];
    const pending = [];
    for (let i0 = 0; i0 < hes.length; i0++) {
      if (used[i0]) continue;
      used[i0] = 1;
      const loop = [hes[i0]];
      const startV = vid[hes[i0]];
      let cur = hes[i0], closed = false;
      for (let guard = 0; guard <= hes.length; guard++) {
        const c1 = next(cur);
        const vb = vid[c1];
        if (vb === startV) { closed = true; break; }
        let cands = (outMap.get(vb) || []).filter((j) => !used[j]);
        if (!cands.length) break;
        // nunca volver por la misma arista (dos cuerpos que se tocan comparten vértices en el borde)
        if (cands.length > 1) {
          const back = cands.filter((j) => vid[next(hes[j])] === vid[cur]);
          if (back.length && back.length < cands.length) cands = cands.filter((j) => !back.includes(j));
        }
        let pick = cands[0];
        if (cands.length > 1) {
          // varios caminos (dos contornos que se tocan en un punto): el giro más cerrado hacia el material
          const A = cornerUV(cur), B = cornerUV(c1);
          const din = [B[0] - A[0], B[1] - A[1]];
          let best = -Infinity;
          for (const j of cands) {
            const Q = cornerUV(next(hes[j]));
            const dout = [Q[0] - B[0], Q[1] - B[1]];
            const ang = Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]) * s;
            if (ang > best) { best = ang; pick = j; }
          }
        }
        used[pick] = 1;
        loop.push(hes[pick]);
        cur = hes[pick];
      }
      if (closed) {
        // un contorno que pasa dos veces por el mismo vértice (se toca a sí mismo) se parte en dos
        const subs = splitPinches(loop, (c) => vid[c]);
        if (subs.length > 1) {
          for (const sub of subs) pending.push(sub);
          continue;
        }
      }
      addLoop(loop, closed);
    }
    for (const sub of pending) addLoop(sub, true);
    function addLoop(loop, closed) {
      const uv = loop.map(cornerUV);
      if (!closed) {
        const a = uv[0], z = uv[uv.length - 1];
        if (uv.length < 3 || Math.hypot(a[0] - z[0], a[1] - z[1]) > Math.max(0.5, diag * 0.01)) { stats.open++; return; }
      }
      if (uv.length < 3) return;
      const area = signedArea(uv) * s;
      let perim = 0;
      for (let i = 0; i < uv.length; i++) { const a = uv[i], b = uv[(i + 1) % uv.length]; perim += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      if (Math.abs(area) < Math.max(1e-6, perim * 2e-5)) {
        // contorno sin área (el plano roza un vértice): se cierra igualmente, en abanico y en sentido
        // contrario al borde, para que no quede ninguna arista abierta
        const P = loop.map(cornerP), f0 = (loop[0] / 3) | 0;
        for (let i = 1; i < P.length - 1; i++) capTris.push(P[0], P[i + 1], P[i], S.part[f0], S.piece[f0]);
        return;
      }
      // parte dominante a lo largo del contorno (color de la tapa)
      const votes = new Map();
      let pieceVote = new Map();
      loop.forEach((c0, i) => {
        const f = (c0 / 3) | 0;
        const a = uv[i], b = uv[(i + 1) % uv.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        votes.set(S.part[f], (votes.get(S.part[f]) || 0) + L);
        pieceVote.set(S.piece[f], (pieceVote.get(S.piece[f]) || 0) + L);
      });
      const top = (m) => [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
      loops.push({ uv, p3: loop.map(cornerP), area, part: top(votes), piece: top(pieceVote) });
      stats.loops++;
    }
    // exteriores y agujeros (cada agujero al exterior más pequeño que lo contiene, de la misma pieza)
    const outers = loops.filter((l) => l.area > 0).sort((a, b) => a.area - b.area);
    for (const l of outers) l.holes = [];
    for (const h of loops.filter((l) => l.area < 0)) {
      const host = outers.find((ol) => ol.piece === h.piece && holeInside(h.uv, ol.uv));
      if (host) host.holes.push(h);
      else stats.orphanHoles = (stats.orphanHoles || 0) + 1;
    }
    for (const ol of outers) ol.features = [];
    polysBySide[s] = outers;
    if (opts.debugLoops) (stats.debugLoops ||= {})[s] = loops;
  }

  // 4) anclajes: cada uno necesita sitio en la tapa de los dos lados
  const placed = [];
  const extra = []; // triángulos de los anclajes: a, b, c, part, piece
  const dowelPieces = [];
  for (const c of connectors) {
    const feats = connectorFeatures(c);
    const hosts = {};
    let ok = true;
    for (const s of [1, -1]) {
      const ft = feats[s];
      if (!ft) continue;
      const host = polysBySide[s].find((ol) => pointInPoly(c.u, c.v, ol.uv) && !ol.holes.some((h) => pointInPoly(c.u, c.v, h.uv)));
      if (!host) { ok = false; break; }
      const R = footprint(ft);
      const room = Math.min(distToPoly(c.u, c.v, host.uv), ...host.holes.map((h) => distToPoly(c.u, c.v, h.uv)));
      if (room < R + 0.25) { ok = false; break; }
      if (host.features.some((g) => Math.hypot(g.u - c.u, g.v - c.v) < g.R + R + 0.3)) { ok = false; break; }
      hosts[s] = { host, ft, R };
    }
    if (!ok) { warnings.push('Un anclaje no cabía (demasiado cerca del borde o de otro) y se ha quitado.'); continue; }
    for (const s of [1, -1]) if (hosts[s]) hosts[s].host.features.push({ u: c.u, v: c.v, R: hosts[s].R, ft: hosts[s].ft, c, s });
    placed.push(c);
  }

  // 5) triangular las tapas (con los agujeros de los anclajes) y construir los anclajes
  const ringUV = (u, v, m, R, phase) => Array.from({ length: m }, (_, k) => { const a = phase + (2 * Math.PI * k) / m; return [u + Math.cos(a) * R, v + Math.sin(a) * R]; });
  const toWorld = (uv, dist = 0) => [
    o[0] + uv[0] * U[0] + uv[1] * V[0] + dist * n[0],
    o[1] + uv[0] * U[1] + uv[1] * V[1] + dist * n[1],
    o[2] + uv[0] * U[2] + uv[1] * V[2] + dist * n[2],
  ];
  for (const s of [1, -1]) {
    const capN = scale(n, -s);
    for (const ol of polysBySide[s]) {
      const rings = []; // contornos de las tapas: [uv[], p3[]]
      rings.push([ol.uv, ol.p3]);
      for (const h of ol.holes) rings.push([h.uv, h.p3]);
      for (const ft of ol.features) {
        const f = ft.ft;
        const R0 = f.kind === 'pin' ? f.r : (f.r + f.ch) / Math.cos(Math.PI / f.m);
        const uv = ringUV(ft.u, ft.v, f.m, R0, f.phase);
        ft.ring0 = uv.map((q) => toWorld(q));
        rings.push([uv, ft.ring0]);
      }
      const contour = rings[0][0].map((q) => new Vector2(q[0], q[1]));
      const holes = rings.slice(1).map((r) => r[0].map((q) => new Vector2(q[0], q[1])));
      const P3 = rings.flatMap((r) => r[1]);
      let tris;
      try { tris = ShapeUtils.triangulateShape(contour, holes); } catch { tris = []; }
      if (!tris.length) warnings.push('Una tapa no se ha podido cerrar bien.');
      // la orientación se decide una vez por tapa con el triángulo más grande (en 2D): los triángulos
      // casi degenerados (puntos alineados) se conservan para que la malla quede cerrada
      const UV = rings.flatMap((r) => r[0]);
      let big = 0, sign = 1;
      for (const [a, b, c] of tris) {
        const ar = (UV[b][0] - UV[a][0]) * (UV[c][1] - UV[a][1]) - (UV[c][0] - UV[a][0]) * (UV[b][1] - UV[a][1]);
        if (Math.abs(ar) > big) { big = Math.abs(ar); sign = Math.sign(ar); }
      }
      const flip = sign !== -s; // en (u, v) el sentido antihorario da normal +n; la tapa mira hacia −s·n
      for (const [a, b, c] of tris) {
        if (flip) capTris.push(P3[a], P3[c], P3[b], ol.part, ol.piece);
        else capTris.push(P3[a], P3[b], P3[c], ol.part, ol.piece);
      }
      // paredes de agujeros y espigas
      for (const ft of ol.features) {
        const f = ft.ft;
        const into = s; // hacia dentro de la pieza de este lado: s·n
        const cUV = [ft.u, ft.v];
        if (f.kind === 'hole') {
          const R = f.r / Math.cos(Math.PI / f.m);
          const r0 = ft.ring0;
          const r1 = f.ch > 0 ? ringUV(ft.u, ft.v, f.m, R, f.phase).map((q) => toWorld(q, into * f.ch)) : r0;
          const rD = ringUV(ft.u, ft.v, f.m, R, f.phase).map((q) => toWorld(q, into * f.depth));
          const cD = toWorld(cUV, into * f.depth);
          for (let k = 0; k < f.m; k++) {
            const k2 = (k + 1) % f.m;
            const am = f.phase + (2 * Math.PI * (k + 0.5)) / f.m;
            const inward = scale(add(scale(U, Math.cos(am)), scale(V, Math.sin(am))), -1);
            if (f.ch > 0) { triOriented(extra, r0[k], r0[k2], r1[k2], inward, ol.part, ol.piece); triOriented(extra, r0[k], r1[k2], r1[k], inward, ol.part, ol.piece); }
            triOriented(extra, r1[k], r1[k2], rD[k2], inward, ol.part, ol.piece);
            triOriented(extra, r1[k], rD[k2], rD[k], inward, ol.part, ol.piece);
            triOriented(extra, cD, rD[k], rD[k2], scale(n, -into), ol.part, ol.piece);
          }
        } else {
          // espiga: sale de esta pieza hacia la otra (−s·n), con chaflán en la punta
          const out = -s;
          const r0 = ft.ring0;
          const r1 = ringUV(ft.u, ft.v, f.m, f.r, f.phase).map((q) => toWorld(q, out * (f.height - f.ch)));
          const r2 = ringUV(ft.u, ft.v, f.m, f.r - f.ch, f.phase).map((q) => toWorld(q, out * f.height));
          const cT = toWorld(cUV, out * f.height);
          for (let k = 0; k < f.m; k++) {
            const k2 = (k + 1) % f.m;
            const am = f.phase + (2 * Math.PI * (k + 0.5)) / f.m;
            const outward = add(scale(U, Math.cos(am)), scale(V, Math.sin(am)));
            triOriented(extra, r0[k], r0[k2], r1[k2], outward, ol.part, ol.piece);
            triOriented(extra, r0[k], r1[k2], r1[k], outward, ol.part, ol.piece);
            triOriented(extra, r1[k], r1[k2], r2[k2], outward, ol.part, ol.piece);
            triOriented(extra, r1[k], r2[k2], r2[k], outward, ol.part, ol.piece);
            triOriented(extra, cT, r2[k], r2[k2], scale(n, out), ol.part, ol.piece);
          }
        }
      }
    }
  }
  // pasadores sueltos (una pieza cada uno): del fondo de un agujero al del otro, con chaflanes
  for (const c of placed) {
    if (c.type !== 'dowel') continue;
    const feats = connectorFeatures(c);
    const gap = 0.25;
    const z0 = -feats[-1].depth + gap, z1 = feats[1].depth - gap;
    if (z1 - z0 < 2) continue;
    const rd = c.d / 2, chd = Math.min(0.5, 0.12 * c.d);
    const sq = c.shape === 'square';
    const m = sq ? 4 : segsFor(rd), phase = sq ? (c.angle || 0) + Math.PI / 4 : 0;
    const Rc = sq ? rd / Math.cos(Math.PI / 4) : rd;
    const Rch = sq ? (rd - chd) / Math.cos(Math.PI / 4) : rd - chd;
    const ring = (R, z) => ringUV(c.u, c.v, m, R, phase).map((q) => toWorld(q, z));
    const A = ring(Rch, z0), B = ring(Rc, z0 + chd), C = ring(Rc, z1 - chd), D = ring(Rch, z1);
    const cA = toWorld([c.u, c.v], z0), cD = toWorld([c.u, c.v], z1);
    const host = polysBySide[1].find((ol) => ol.features.some((f) => f.c === c)) || polysBySide[-1].find((ol) => ol.features.some((f) => f.c === c));
    const part = host ? host.part : faceParts[0];
    const piece = nextPiece++;
    dowelPieces.push({ id: piece, kind: 'dowel', axis: n, d: c.d, length: z1 - z0 });
    for (let k = 0; k < m; k++) {
      const k2 = (k + 1) % m;
      const am = phase + (2 * Math.PI * (k + 0.5)) / m;
      const outward = add(scale(U, Math.cos(am)), scale(V, Math.sin(am)));
      for (const [X, Y] of [[A, B], [B, C], [C, D]]) {
        triOriented(extra, X[k], X[k2], Y[k2], outward, part, piece);
        triOriented(extra, X[k], Y[k2], Y[k], outward, part, piece);
      }
      triOriented(extra, cA, A[k], A[k2], scale(n, -1), part, piece);
      triOriented(extra, cD, D[k], D[k2], n, part, piece);
    }
  }

  // 6) malla final: caras que no están sobre el plano + tapas + anclajes
  const collapsed = (i) => vid[i * 3] === vid[i * 3 + 1] || vid[i * 3 + 1] === vid[i * 3 + 2] || vid[i * 3] === vid[i * 3 + 2];
  const keepFace = (i) => (!S.cop[i] || !S.side[i]) && !(S.side[i] && collapsed(i));
  let keep = 0;
  for (let i = 0; i < S.n; i++) if (keepFace(i)) keep++;
  const total = keep + capTris.length / 5 + extra.length / 5;
  const outPos = new Float32Array(total * 9);
  const outPart = new Uint16Array(total);
  const outPiece = new Uint16Array(total);
  let w = 0;
  for (let i = 0; i < S.n; i++) {
    if (!keepFace(i)) continue;
    outPos.set(S.pos.subarray(i * 9, i * 9 + 9), w * 9);
    outPart[w] = S.part[i];
    outPiece[w] = S.piece[i];
    w++;
  }
  for (const L of [capTris, extra]) {
    for (let i = 0; i < L.length; i += 5) {
      const o9 = w * 9;
      outPos[o9] = L[i][0]; outPos[o9 + 1] = L[i][1]; outPos[o9 + 2] = L[i][2];
      outPos[o9 + 3] = L[i + 1][0]; outPos[o9 + 4] = L[i + 1][1]; outPos[o9 + 5] = L[i + 1][2];
      outPos[o9 + 6] = L[i + 2][0]; outPos[o9 + 7] = L[i + 2][1]; outPos[o9 + 8] = L[i + 2][2];
      outPart[w] = L[i + 3];
      outPiece[w] = L[i + 4];
      w++;
    }
  }
  if (stats.open) warnings.push('La malla tiene agujeros en la zona del corte: alguna tapa puede quedar abierta.');
  return {
    ok: true, pos: outPos, faceParts: outPart, facePiece: outPiece,
    created: [...created, ...dowelPieces], placed, warnings: [...new Set(warnings)], stats, nextPieceId: nextPiece, debugLoops: stats.debugLoops,
  };
}

// ------------------------------------------------------------------ colocar para imprimir
// Dirección (normal hacia fuera) de la cara plana más grande sobre la que la pieza puede apoyarse:
// tiene que ser un "extremo" (nada sobresale más allá). Las caras con espigas quedan descartadas solas.
export function restDirection(pos, faces) {
  const groups = new Map();
  const faceN = [];
  let size = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) {
    const b = f * 9;
    for (let k = 0; k < 9; k += 3) for (let a = 0; a < 3; a++) { const v = pos[b + k + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const N = cross(sub([pos[b + 3], pos[b + 4], pos[b + 5]], [pos[b], pos[b + 1], pos[b + 2]]), sub([pos[b + 6], pos[b + 7], pos[b + 8]], [pos[b], pos[b + 1], pos[b + 2]]));
    const A = Math.hypot(N[0], N[1], N[2]) / 2;
    if (!(A > 0)) { faceN.push(null); continue; }
    const un = scale(N, 1 / (2 * A));
    faceN.push([un, A]);
    const key = `${Math.round(un[0] * 60)},${Math.round(un[1] * 60)},${Math.round(un[2] * 60)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { area: 0, N: [0, 0, 0] }));
    g.area += A;
    g.N = add(g.N, scale(un, A));
  }
  size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const tol = Math.max(0.05, size * 0.002);
  const cands = [...groups.values()].sort((a, b) => b.area - a.area).slice(0, 14).map((g) => normalize(g.N));
  cands.push([0, 0, -1]);
  const contact = (d) => {
    let sup = -Infinity;
    for (const f of faces) for (let k = 0; k < 9; k += 3) { const b = f * 9 + k; const v = pos[b] * d[0] + pos[b + 1] * d[1] + pos[b + 2] * d[2]; if (v > sup) sup = v; }
    let a = 0;
    faces.forEach((f, i) => {
      const e = faceN[i];
      if (!e || dot(e[0], d) < 0.9995) return; // solo caras de verdad planas (no las facetas de un cilindro)
      const b = f * 9;
      let ok = true;
      for (let k = 0; k < 9; k += 3) if (pos[b + k] * d[0] + pos[b + k + 1] * d[1] + pos[b + k + 2] * d[2] < sup - tol) ok = false;
      if (ok) a += e[1];
    });
    return a;
  };
  const down = contact([0, 0, -1]);
  let best = [0, 0, -1], bestA = down;
  for (const d of cands) {
    const a = contact(d);
    if (a > bestA * 1.0001) { bestA = a; best = d; }
  }
  // si apoyada como está ya tiene casi la misma base, no se gira (respeta la orientación del diseño)
  if (down >= bestA * 0.85) return { dir: [0, 0, -1], area: down };
  return { dir: best, area: bestA };
}

// Volumen encerrado (mm³) por las caras indicadas (todas si faces es null)
export function meshVolume(pos, faces = null) {
  let v = 0;
  const each = (f) => {
    const b = f * 9;
    v += pos[b] * (pos[b + 4] * pos[b + 8] - pos[b + 5] * pos[b + 7]) - pos[b + 1] * (pos[b + 3] * pos[b + 8] - pos[b + 5] * pos[b + 6]) + pos[b + 2] * (pos[b + 3] * pos[b + 7] - pos[b + 4] * pos[b + 6]);
  };
  if (faces) for (const f of faces) each(f);
  else for (let f = 0; f < pos.length / 9; f++) each(f);
  return v / 6;
}

// Busca, a lo largo de la normal y cerca del plano, el sitio más próximo donde quepan bien los
// anclajes (dos o más del tipo pedido). Devuelve { plane, offset, count, list, warnings } o null.
export function searchBetterPlane(pos, plane, { faceMask = null, opts = {}, maxDist = 20 } = {}) {
  const n = normalize(plane.n);
  const [lo, hi] = extentAlong(pos, plane.o, n, faceMask);
  const span = hi - lo;
  const step = Math.max(1, span / 40);
  const lim = Math.min(span * 0.35, maxDist);
  const offs = [0];
  for (let d = step; d <= lim + 1e-9; d += step) offs.push(-d, d);
  const rate = (r) => {
    if (!r.list.length) return 0;
    const fallback = (opts.type || 'dowel') === 'dowel' && r.list.some((c) => c.type === 'plug');
    return (r.list.length >= 2 ? 2 : 1) * (fallback ? 0.6 : 1) * (1 + Math.min(...r.list.map((c) => c.d)) / 12);
  };
  let best = null;
  for (const s of offs) {
    if (s <= lo + 0.5 || s >= hi - 0.5) continue;
    const pl = { o: add(plane.o, scale(n, s)), n };
    const an = analyzeCut(pos, pl, { faceMask });
    if (an.empty) continue;
    const r = autoConnectors(an, opts);
    const score = rate(r);
    if (!best || score > best.score + 1e-9) best = { score, offset: s, plane: pl, count: r.list.length, list: r.list, warnings: r.warnings };
    if (score >= 2 && r.list.length >= 2) break; // el sitio bueno más cercano
  }
  return best && best.score > 0 ? best : null;
}
