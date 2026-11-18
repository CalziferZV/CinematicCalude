// Núcleo geométrico: topología, segmentación automática, cortes por altura y subdivisión.
// Trabaja con triángulos "sueltos" (Float32Array con 9 floats por cara) para poder
// cortar / subdividir sin restricciones. La topología se reconstruye cuando cambia la malla.

// ------------------------------------------------------------------ topología
// Elimina triángulos degenerados (área ~0 o vértices repetidos).
export function removeDegenerate(pos) {
  const nF = pos.length / 9;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { if (pos[i] < minX) minX = pos[i]; if (pos[i] > maxX) maxX = pos[i]; }
  const keep = [];
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    const a2 = (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
    if (a2 > 0 && Number.isFinite(a2)) keep.push(f);
  }
  if (keep.length === nF) return pos;
  const out = new Float32Array(keep.length * 9);
  keep.forEach((f, i) => out.set(pos.subarray(f * 9, f * 9 + 9), i * 9));
  return out;
}

export function buildTopology(pos) {
  const nF = pos.length / 9;
  const nC = nF * 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const eps = diag * 1e-6;

  // --- soldar vértices (tabla hash de direccionamiento abierto)
  let cap = 1;
  while (cap < nC * 2) cap <<= 1;
  const table = new Int32Array(cap).fill(-1);
  const qv = new Int32Array(nC * 3);
  const vid = new Uint32Array(nC);
  let nV = 0;
  for (let c = 0; c < nC; c++) {
    const qx = Math.round(pos[c * 3] / eps), qy = Math.round(pos[c * 3 + 1] / eps), qz = Math.round(pos[c * 3 + 2] / eps);
    let h = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) & (cap - 1);
    for (;;) {
      const v = table[h];
      if (v === -1) {
        table[h] = nV;
        qv[nV * 3] = qx; qv[nV * 3 + 1] = qy; qv[nV * 3 + 2] = qz;
        vid[c] = nV++;
        break;
      }
      if (qv[v * 3] === qx && qv[v * 3 + 1] === qy && qv[v * 3 + 2] === qz) {
        vid[c] = v;
        break;
      }
      h = (h + 1) & (cap - 1);
    }
  }

  // --- normales, áreas, centroides
  const fn = new Float32Array(nF * 3);
  const area = new Float32Array(nF);
  const cen = new Float32Array(nF * 3);
  let totalArea = 0;
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const ux = pos[o + 3] - ax, uy = pos[o + 4] - ay, uz = pos[o + 5] - az;
    const vx = pos[o + 6] - ax, vy = pos[o + 7] - ay, vz = pos[o + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    area[f] = l / 2;
    totalArea += l / 2;
    if (l > 0) { nx /= l; ny /= l; nz /= l; }
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
    cen[f * 3] = (ax + pos[o + 3] + pos[o + 6]) / 3;
    cen[f * 3 + 1] = (ay + pos[o + 4] + pos[o + 7]) / 3;
    cen[f * 3 + 2] = (az + pos[o + 5] + pos[o + 8]) / 3;
  }
  // --- vecinos por arista (aristas no-manifold: se empareja con la cara de normal más parecida)
  const nbr = new Int32Array(nC).fill(-1);
  let ecap = 1;
  while (ecap < nC * 2) ecap <<= 1;
  const etab = new Int32Array(ecap).fill(-1); // primer half-edge de cada arista
  const enext = new Int32Array(nC).fill(-1); // lista enlazada de half-edges de la misma arista
  const multi = [];
  for (let f = 0; f < nF; f++) {
    const v0 = vid[f * 3], v1 = vid[f * 3 + 1], v2 = vid[f * 3 + 2];
    if (v0 === v1 || v1 === v2 || v0 === v2) continue; // triángulo degenerado
    for (let k = 0; k < 3; k++) {
      const he = f * 3 + k;
      const a = vid[he], b = vid[f * 3 + ((k + 1) % 3)];
      const lo = a < b ? a : b, hi = a < b ? b : a;
      let h = (Math.imul(lo, 2654435761) ^ Math.imul(hi, 40503)) & (ecap - 1);
      for (;;) {
        const o = etab[h];
        if (o === -1) { etab[h] = he; break; }
        const of = (o / 3) | 0, ok = o % 3;
        const oa = vid[o], ob = vid[of * 3 + ((ok + 1) % 3)];
        const olo = oa < ob ? oa : ob, ohi = oa < ob ? ob : oa;
        if (olo === lo && ohi === hi) {
          if (enext[o] === -1 && nbr[o] === -1) {
            // segunda cara de la arista: emparejar directamente
            nbr[o] = f; nbr[he] = of; enext[o] = he;
          } else {
            if (nbr[o] !== -1 && enext[o] !== -1 && !multi.includes(o)) multi.push(o);
            let t = o;
            while (enext[t] !== -1) t = enext[t];
            enext[t] = he;
          }
          break;
        }
        h = (h + 1) & (ecap - 1);
      }
    }
  }
  // aristas con más de 2 caras (sólidos que se tocan): cada cara se empareja con la siguiente
  // cara que se encuentra girando alrededor de la arista hacia el interior de su sólido.
  const P3 = (c) => [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
  for (const head of multi) {
    const list = [];
    for (let t = head; t !== -1; t = enext[t]) list.push(t);
    for (const he of list) nbr[he] = -1;
    const f0 = (list[0] / 3) | 0, k0 = list[0] % 3;
    const A = P3(f0 * 3 + k0), B = P3(f0 * 3 + ((k0 + 1) % 3));
    let u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const ul = Math.hypot(...u) || 1;
    u = u.map((x) => x / ul);
    // dirección perpendicular a la arista hacia el tercer vértice de cada cara
    const info = list.map((he) => {
      const f = (he / 3) | 0, k = he % 3;
      const C = P3(f * 3 + ((k + 2) % 3));
      const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const dp = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
      const d = [w[0] - dp * u[0], w[1] - dp * u[1], w[2] - dp * u[2]];
      const dl = Math.hypot(...d) || 1;
      return { he, f, d: d.map((x) => x / dl), n: [fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]] };
    });
    const angle = (from, to) => {
      const c = [u[1] * from.d[2] - u[2] * from.d[1], u[2] * from.d[0] - u[0] * from.d[2], u[0] * from.d[1] - u[1] * from.d[0]];
      // sentido de giro positivo = hacia el interior (-normal) de la cara 'from'
      const sgn = c[0] * -from.n[0] + c[1] * -from.n[1] + c[2] * -from.n[2] >= 0 ? 1 : -1;
      const x = from.d[0] * to.d[0] + from.d[1] * to.d[1] + from.d[2] * to.d[2];
      const y = sgn * (c[0] * to.d[0] + c[1] * to.d[1] + c[2] * to.d[2]);
      let t = Math.atan2(y, x);
      if (t <= 1e-9) t += Math.PI * 2;
      return t;
    };
    const used = new Set();
    for (const a of info) {
      if (used.has(a.he)) continue;
      let best = null, bestT = Infinity;
      for (const b of info) {
        if (b === a || used.has(b.he) || b.f === a.f) continue;
        const t = angle(a, b);
        if (t < bestT) { bestT = t; best = b; }
      }
      if (best) {
        used.add(a.he); used.add(best.he);
        nbr[a.he] = best.f;
        nbr[best.he] = a.f;
      }
    }
  }
  return {
    nF, nV, vid, nbr, fn, area, cen, totalArea,
    bbox: { minX, minY, minZ, maxX, maxY, maxZ }, diag,
  };
}

// Normales suaves con ángulo de pliegue (para que las curvas se vean lisas y las aristas vivas).
export function smoothNormals(pos, topo, creaseDeg = 32) {
  const { nF, nV, vid, fn, area } = topo;
  const cosT = Math.cos((creaseDeg * Math.PI) / 180);
  const start = new Uint32Array(nV + 1);
  for (let c = 0; c < nF * 3; c++) start[vid[c] + 1]++;
  for (let v = 0; v < nV; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nV);
  const list = new Uint32Array(nF * 3);
  for (let c = 0; c < nF * 3; c++) list[fill[vid[c]]++] = (c / 3) | 0;
  const out = new Float32Array(nF * 9);
  for (let f = 0; f < nF; f++) {
    const fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const v = vid[f * 3 + k];
      let sx = 0, sy = 0, sz = 0;
      for (let i = start[v]; i < start[v + 1]; i++) {
        const g = list[i];
        const gx = fn[g * 3], gy = fn[g * 3 + 1], gz = fn[g * 3 + 2];
        if (fx * gx + fy * gy + fz * gz >= cosT) {
          const w = area[g] + 1e-12;
          sx += gx * w; sy += gy * w; sz += gz * w;
        }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      const o = f * 9 + k * 3;
      out[o] = sx / l; out[o + 1] = sy / l; out[o + 2] = sz / l;
    }
  }
  return out;
}

// ------------------------------------------------------------------ regiones
// Inunda por vecinos mientras accept(f, g) sea true. Devuelve etiquetas y número de regiones.
function flood(topo, accept, mask = null) {
  const { nF, nbr } = topo;
  const label = new Int32Array(nF).fill(-1);
  const stack = new Int32Array(nF);
  let n = 0;
  for (let s = 0; s < nF; s++) {
    if (label[s] !== -1 || (mask && !mask(s))) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = n;
    while (sp) {
      const f = stack[--sp];
      for (let k = 0; k < 3; k++) {
        const g = nbr[f * 3 + k];
        if (g < 0 || label[g] !== -1) continue;
        if (mask && !mask(g)) continue;
        if (!accept(f, g)) continue;
        label[g] = n;
        stack[sp++] = g;
      }
    }
    n++;
  }
  return { label, count: n };
}

export function shells(topo) {
  return flood(topo, () => true);
}

export function regionsByAngle(topo, angleDeg = 28) {
  const cosT = Math.cos((angleDeg * Math.PI) / 180);
  const { fn } = topo;
  return flood(topo, (f, g) => fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2] >= cosT);
}

// Relleno inteligente desde una cara: se expande mientras el ángulo entre caras vecinas
// sea menor que la tolerancia y (opcional) la cara pertenezca a la misma parte.
export function smartFill(topo, seed, angleDeg, faceParts = null) {
  const cosT = Math.cos((angleDeg * Math.PI) / 180);
  const { nF, nbr, fn } = topo;
  const part = faceParts ? faceParts[seed] : -1;
  const seen = new Uint8Array(nF);
  const out = [];
  const stack = [seed];
  seen[seed] = 1;
  while (stack.length) {
    const f = stack.pop();
    out.push(f);
    for (let k = 0; k < 3; k++) {
      const g = nbr[f * 3 + k];
      if (g < 0 || seen[g]) continue;
      if (faceParts && faceParts[g] !== part) continue;
      const d = fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2];
      if (d < cosT) continue;
      seen[g] = 1;
      stack.push(g);
    }
  }
  return out;
}

// Fusiona regiones pequeñas con la vecina con la que comparten más borde.
export function mergeSmallRegions(topo, label, count, minAreaFrac = 0.002, maxRegions = 40) {
  const { nF, nbr, area, totalArea } = topo;
  const parent = new Int32Array(count).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let pass = 0; pass < 12; pass++) {
    const rArea = new Float64Array(count);
    for (let f = 0; f < nF; f++) rArea[find(label[f])] += area[f];
    const roots = [];
    for (let r = 0; r < count; r++) if (find(r) === r) roots.push(r);
    roots.sort((a, b) => rArea[a] - rArea[b]);
    const limit = roots.length > maxRegions ? rArea[roots[roots.length - maxRegions]] : 0;
    const minA = Math.max(totalArea * minAreaFrac, limit);
    const small = new Set(roots.filter((r) => rArea[r] < minA));
    if (!small.size) break;
    // contar bordes compartidos
    const border = new Map();
    for (let f = 0; f < nF; f++) {
      const a = find(label[f]);
      if (!small.has(a)) continue;
      for (let k = 0; k < 3; k++) {
        const g = nbr[f * 3 + k];
        if (g < 0) continue;
        const b = find(label[g]);
        if (a === b) continue;
        const key = a * count + b;
        border.set(key, (border.get(key) || 0) + 1);
      }
    }
    const best = new Map();
    for (const [key, n] of border) {
      const a = Math.floor(key / count), b = key % count;
      const cur = best.get(a);
      if (!cur || n > cur.n || (n === cur.n && rArea[b] > rArea[cur.b])) best.set(a, { b, n });
    }
    let merged = 0;
    for (const r of roots) {
      if (!small.has(r) || !best.has(r)) continue;
      const a = find(r), b = find(best.get(r).b);
      if (a === b) continue;
      if (rArea[a] <= rArea[b]) parent[a] = b; else parent[b] = a;
      merged++;
    }
    if (!merged) break;
  }
  const remap = new Map();
  const out = new Int32Array(nF);
  for (let f = 0; f < nF; f++) {
    const r = find(label[f]);
    if (!remap.has(r)) remap.set(r, remap.size);
    out[f] = remap.get(r);
  }
  return { label: out, count: remap.size };
}

// ------------------------------------------------------------------ estadísticas
export function groupStats(pos, topo, label, count) {
  const st = Array.from({ length: count }, () => ({
    faces: 0, area: 0, vol: 0,
    minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    upArea: 0, cx: 0, cy: 0, cz: 0,
  }));
  const { nF, area, fn, cen } = topo;
  for (let f = 0; f < nF; f++) {
    const s = st[label[f]];
    if (!s) continue;
    s.faces++;
    s.area += area[f];
    s.cx += cen[f * 3] * area[f]; s.cy += cen[f * 3 + 1] * area[f]; s.cz += cen[f * 3 + 2] * area[f];
    if (fn[f * 3 + 2] > 0.95) s.upArea += area[f];
    const o = f * 9;
    for (let k = 0; k < 9; k += 3) {
      const x = pos[o + k], y = pos[o + k + 1], z = pos[o + k + 2];
      if (x < s.minX) s.minX = x; if (x > s.maxX) s.maxX = x;
      if (y < s.minY) s.minY = y; if (y > s.maxY) s.maxY = y;
      if (z < s.minZ) s.minZ = z; if (z > s.maxZ) s.maxZ = z;
    }
    // volumen con signo (teorema de la divergencia)
    s.vol += (pos[o] * (pos[o + 4] * pos[o + 8] - pos[o + 5] * pos[o + 7]) -
      pos[o + 1] * (pos[o + 3] * pos[o + 8] - pos[o + 5] * pos[o + 6]) +
      pos[o + 2] * (pos[o + 3] * pos[o + 7] - pos[o + 4] * pos[o + 6])) / 6;
  }
  for (const s of st) {
    if (s.area > 0) { s.cx /= s.area; s.cy /= s.area; s.cz /= s.area; }
    s.vol = Math.abs(s.vol);
  }
  return st;
}

// ------------------------------------------------------------------ escalones en altura
// Detecta alturas donde hay grandes superficies horizontales (techo de una base, base de una copa...).
export function detectStepLevels(topo, faceMask = null, minFrac = 0.025) {
  const { nF, fn, area, cen, bbox } = topo;
  let minZ = Infinity, maxZ = -Infinity, total = 0;
  for (let f = 0; f < nF; f++) {
    if (faceMask && !faceMask(f)) continue;
    const z = cen[f * 3 + 2];
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    total += area[f];
  }
  const H = maxZ - minZ;
  if (!(H > 0)) return [];
  const bin = Math.max(H / 2000, 1e-4);
  const hist = new Map();
  for (let f = 0; f < nF; f++) {
    if (faceMask && !faceMask(f)) continue;
    const nz = fn[f * 3 + 2];
    if (Math.abs(nz) < 0.97) continue;
    const b = Math.round(cen[f * 3 + 2] / bin);
    hist.set(b, (hist.get(b) || 0) + area[f]);
  }
  const lv = [];
  for (const [b, a] of hist) {
    const z = b * bin;
    if (z <= minZ + H * 0.02 || z >= maxZ - H * 0.02) continue;
    if (a >= total * minFrac) lv.push({ z, a });
  }
  lv.sort((p, q) => p.z - q.z);
  const merged = [];
  for (const l of lv) {
    const last = merged[merged.length - 1];
    if (last && l.z - last.z < H * 0.03) { if (l.a > last.a) { last.z = l.z; last.a = l.a; } }
    else merged.push({ ...l });
  }
  void bbox;
  return merged.slice(0, 8).map((l) => l.z);
}

// ------------------------------------------------------------------ cortes horizontales reales
// Corta los triángulos de las caras filtradas por planos Z = niveles, para que la división
// quede limpia (no en dientes de sierra) aunque la malla tenga triángulos grandes.
function lexLess(pos, a, b) {
  if (pos[a] !== pos[b]) return pos[a] < pos[b];
  if (pos[a + 1] !== pos[b + 1]) return pos[a + 1] < pos[b + 1];
  return pos[a + 2] < pos[b + 2];
}

function edgePoint(P, i, j, z) {
  // punto de corte del segmento i-j con el plano z, calculado siempre en el mismo orden
  if (lexLess(P, j, i)) { const t = i; i = j; j = t; }
  const t = (z - P[i + 2]) / (P[j + 2] - P[i + 2]);
  return [P[i] + t * (P[j] - P[i]), P[i + 1] + t * (P[j + 1] - P[i + 1]), z];
}

function splitTri(tri, z, tol) {
  const d = [tri[2] - z, tri[5] - z, tri[8] - z].map((v) => (Math.abs(v) < tol ? 0 : v));
  const pos = d.filter((v) => v > 0).length, neg = d.filter((v) => v < 0).length;
  if (!pos || !neg) return null;
  const V = (k) => [tri[k * 3], tri[k * 3 + 1], tri[k * 3 + 2]];
  const out = [];
  const T = (a, b, c) => out.push(new Float32Array([...a, ...b, ...c]));
  const zeroIdx = d.findIndex((v) => v === 0);
  if (zeroIdx >= 0) {
    // un vértice sobre el plano: 2 triángulos
    const a = zeroIdx, b = (a + 1) % 3, c = (a + 2) % 3;
    const p = edgePoint(tri, b * 3, c * 3, z);
    T(V(a), V(b), p);
    T(V(a), p, V(c));
    return out;
  }
  // vértice solitario
  let lone;
  for (let k = 0; k < 3; k++) {
    const s = Math.sign(d[k]);
    if (Math.sign(d[(k + 1) % 3]) !== s && Math.sign(d[(k + 2) % 3]) !== s) lone = k;
  }
  const a = lone, b = (a + 1) % 3, c = (a + 2) % 3;
  const pab = edgePoint(tri, a * 3, b * 3, z);
  const pca = edgePoint(tri, c * 3, a * 3, z);
  T(V(a), pab, pca);
  T(pab, V(b), V(c));
  T(pab, V(c), pca);
  return out;
}

export function cutAtLevels(pos, faceParts, levels, faceFilter, diag) {
  const nF = pos.length / 9;
  const tol = diag * 1e-7;
  const outPos = [];
  const outParts = [];
  let extra = 0;
  const keepPos = [];
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    if (!faceFilter(f)) { keepPos.push(f); continue; }
    const zmin = Math.min(pos[o + 2], pos[o + 5], pos[o + 8]);
    const zmax = Math.max(pos[o + 2], pos[o + 5], pos[o + 8]);
    if (!levels.some((z) => z > zmin + tol && z < zmax - tol)) { keepPos.push(f); continue; }
    let tris = [pos.slice(o, o + 9)];
    for (const z of levels) {
      if (!(z > zmin + tol && z < zmax - tol)) continue;
      const next = [];
      for (const t of tris) {
        const s = splitTri(t, z, tol);
        if (s) next.push(...s); else next.push(t);
      }
      tris = next;
    }
    for (const t of tris) { outPos.push(t); outParts.push(faceParts[f]); }
    extra += tris.length;
  }
  const total = keepPos.length + extra;
  const P = new Float32Array(total * 9);
  const FP = new Uint16Array(total);
  let w = 0;
  for (const f of keepPos) { P.set(pos.subarray(f * 9, f * 9 + 9), w * 9); FP[w] = faceParts[f]; w++; }
  for (let i = 0; i < outPos.length; i++) { P.set(outPos[i], w * 9); FP[w] = outParts[i]; w++; }
  return { pos: P, faceParts: FP };
}

// Banda (0..levels.length) de una cara según su centroide. Las caras horizontales justo en
// el nivel se asignan: hacia arriba (techo) a la banda inferior, hacia abajo a la superior.
export function bandOf(cz, nz, levels, tol) {
  let b = 0;
  for (const z of levels) {
    if (cz > z + tol) b++;
    else if (Math.abs(cz - z) <= tol && nz < -0.5) b++;
  }
  return b;
}

// ------------------------------------------------------------------ subdivisión adaptativa
// Divide aristas más largas que maxEdge (sin grietas: la decisión es simétrica por arista).
export function subdivide(pos, faceParts, maxEdge, maxFaces = 2_000_000) {
  let P = pos, FP = faceParts;
  const L2 = maxEdge * maxEdge;
  for (let pass = 0; pass < 6; pass++) {
    const nF = P.length / 9;
    let need = 0;
    const masks = new Uint8Array(nF);
    for (let f = 0; f < nF; f++) {
      const o = f * 9;
      let m = 0;
      for (let k = 0; k < 3; k++) {
        const a = o + k * 3, b = o + ((k + 1) % 3) * 3;
        const dx = P[a] - P[b], dy = P[a + 1] - P[b + 1], dz = P[a + 2] - P[b + 2];
        if (dx * dx + dy * dy + dz * dz > L2) m |= 1 << k;
      }
      masks[f] = m;
      const bits = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
      need += bits === 0 ? 1 : bits + 1;
    }
    if (need === nF) break;
    if (need > maxFaces) break;
    const NP = new Float32Array(need * 9);
    const NFP = new Uint16Array(need);
    let w = 0;
    const put = (a, b, c, part) => { NP.set(a, w * 9); NP.set(b, w * 9 + 3); NP.set(c, w * 9 + 6); NFP[w++] = part; };
    for (let f = 0; f < nF; f++) {
      const o = f * 9, m = masks[f], part = FP[f];
      const V = [P.subarray(o, o + 3), P.subarray(o + 3, o + 6), P.subarray(o + 6, o + 9)];
      if (!m) { NP.set(P.subarray(o, o + 9), w * 9); NFP[w++] = part; continue; }
      const M = (i, j) => new Float32Array([(V[i][0] + V[j][0]) / 2, (V[i][1] + V[j][1]) / 2, (V[i][2] + V[j][2]) / 2]);
      const bits = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
      if (bits === 3) {
        const m01 = M(0, 1), m12 = M(1, 2), m20 = M(2, 0);
        put(V[0], m01, m20, part); put(m01, V[1], m12, part); put(m20, m12, V[2], part); put(m01, m12, m20, part);
      } else if (bits === 1) {
        const k = m === 1 ? 0 : m === 2 ? 1 : 2;
        const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
        const mid = M(a, b);
        put(V[a], mid, V[c], part); put(mid, V[b], V[c], part);
      } else {
        // dos aristas divididas: k = arista NO dividida
        const k = !(m & 1) ? 0 : !(m & 2) ? 1 : 2;
        const a = k, b = (k + 1) % 3, c = (k + 2) % 3; // arista a-b intacta, b-c y c-a divididas
        const mbc = M(b, c), mca = M(c, a);
        put(mbc, V[c], mca, part);
        put(V[a], V[b], mbc, part);
        put(V[a], mbc, mca, part);
      }
    }
    P = NP; FP = NFP;
  }
  return { pos: P, faceParts: FP };
}

// ------------------------------------------------------------------ análisis inteligente
// Devuelve una lista de grupos {name, role, faces:Int32Array|null (label), ...} sobre las caras.
export function smartSegment(pos, topo) {
  const { nF, totalArea, bbox } = topo;
  const H = bbox.maxZ - bbox.minZ;
  const sh = shells(topo);
  const st = groupStats(pos, topo, sh.label, sh.count);
  const label = new Int32Array(nF).fill(-1);
  const groups = [];
  // fragmentos diminutos (triángulos sueltos por errores de malla): unirlos a la pieza más cercana
  for (let i = 0; i < sh.count; i++) {
    const s = st[i];
    if (s.faces > 3 && s.area > totalArea * 0.0005) continue;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < sh.count; j++) {
      const o = st[j];
      if (j === i || o.faces <= 3) continue;
      const dx = Math.max(o.minX - s.cx, 0, s.cx - o.maxX), dy = Math.max(o.minY - s.cy, 0, s.cy - o.maxY), dz = Math.max(o.minZ - s.cz, 0, s.cz - o.maxZ);
      const d = dx * dx + dy * dy + dz * dz - o.area * 1e-9;
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best >= 0) {
      for (let f = 0; f < nF; f++) if (sh.label[f] === i) sh.label[f] = best;
      st[best].faces += s.faces; st[best].area += s.area; st[best].vol += s.vol;
      s.faces = 0; s.area = 0; s.vol = 0;
    }
  }
  const totalVol = st.reduce((s, x) => s + x.vol, 0) || 1;
  const order = st.map((s, i) => i).sort((a, b) => st[b].vol - st[a].vol || st[b].area - st[a].area);
  const notes = [];

  // ---- 1) piezas sueltas pequeñas => texto / detalles
  const smallShells = [];
  const bigShells = [];
  for (const i of order) {
    const s = st[i];
    if (!s.faces) continue;
    const small = s.vol < totalVol * 0.04 && s.area < totalArea * 0.08 && sh.count > 1;
    (small ? smallShells : bigShells).push(i);
  }
  if (smallShells.length >= 3) {
    notes.push(`${smallShells.length} piezas pequeñas sueltas (probablemente letras/texto o detalles)`);
  }

  // ---- 2) base: pieza grande apoyada en la cama, ancha y baja
  let baseShell = -1;
  if (bigShells.length > 1) {
    let best = -1, bestScore = 0;
    for (const i of bigShells) {
      const s = st[i];
      if (s.minZ > bbox.minZ + H * 0.02) continue;
      const foot = (s.maxX - s.minX) * (s.maxY - s.minY);
      const h = s.maxZ - s.minZ;
      const score = foot / Math.max(h, 1e-6);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    baseShell = best;
  }

  const addGroup = (name, role, faceTest) => {
    const id = groups.length;
    let n = 0;
    for (let f = 0; f < nF; f++) if (label[f] === -1 && faceTest(f)) { label[f] = id; n++; }
    if (n) groups.push({ name, role, faces: n });
    else return -1;
    return id;
  };

  // grupos de piezas grandes
  let idx = 1;
  for (const i of bigShells) {
    const s = st[i];
    const h = s.maxZ - s.minZ;
    const w = Math.max(s.maxX - s.minX, s.maxY - s.minY);
    let name, role;
    if (i === baseShell) { name = 'Base'; role = 'base'; }
    else if (bigShells.length === 1) { name = 'Pieza principal'; role = 'figura'; }
    else if (h > w * 1.4) { name = `Figura / columna ${idx++}`; role = 'figura'; }
    else if (h < w * 0.15) { name = `Placa ${idx++}`; role = 'placa'; }
    else { name = `Pieza ${idx++}`; role = 'otro'; }
    const gid = addGroup(name, role, (f) => sh.label[f] === i);
    if (gid >= 0) groups[gid].shell = i;
  }
  // piezas pequeñas: agruparlas todas como "Texto / detalles" si son muchas; si pocas, por separado
  if (smallShells.length >= 3) {
    const set = new Set(smallShells);
    addGroup('Texto / detalles', 'texto', (f) => set.has(sh.label[f]));
  } else {
    let d = 1;
    for (const i of smallShells) addGroup(`Detalle ${d++}`, 'detalle', (f) => sh.label[f] === i);
  }

  // ---- 3) dentro de la pieza principal (si es una sola malla), buscar relieve/texto y escalones
  const mainGroup = groups.findIndex((g) => g.role === 'figura' || g.role === 'base' || g.role === 'otro' || g.role === 'placa');
  const mainShell = bigShells.find((i) => i !== baseShell) ?? bigShells[0];
  void mainGroup;
  if (mainShell !== undefined) {
    const inMain = (f) => sh.label[f] === mainShell;
    // relieve/texto: regiones pequeñas pegadas a un gran plano
    let reliefGid = -1;
    const reliefFaces = detectRelief(pos, topo, inMain);
    if (reliefFaces && reliefFaces.count > 0) {
      reliefGid = groups.length;
      groups.push({ name: 'Texto / relieve', role: 'relieve', faces: reliefFaces.count });
      for (let f = 0; f < nF; f++) if (reliefFaces.mask[f]) label[f] = reliefGid;
      notes.push('Relieve/texto detectado sobre una superficie plana');
    }
  }
  // escalones: en cada pieza grande que no sea la base y sea alta (copa sobre columna, etc.)
  const splits = [];
  for (const i of bigShells) {
    if (i === baseShell) continue;
    const s = st[i];
    const h = s.maxZ - s.minZ;
    if (h < H * 0.3) continue;
    const gid = groups.findIndex((g) => g.shell === i);
    if (gid < 0) continue;
    const lv = detectStepLevels(topo, (f) => sh.label[f] === i && label[f] === gid);
    if (lv.length) {
      splits.push({ group: gid, levels: lv });
      notes.push(`Escalones en «${groups[gid].name}» a Z = ${lv.map((z) => (z - bbox.minZ).toFixed(1)).join(', ')} mm`);
    }
  }
  for (let f = 0; f < nF; f++) if (label[f] === -1) label[f] = 0;
  return { label, groups, notes, splits };
}

// Relieve: regiones (por aristas vivas) pequeñas, cercanas a un gran plano y dentro de su huella.
function detectRelief(pos, topo, mask) {
  const { nF, fn, area, cen, totalArea } = topo;
  const reg = regionsByAngle(topo, 40);
  const st = groupStats(pos, topo, reg.label, reg.count);
  const rNormal = Array.from({ length: reg.count }, () => [0, 0, 0]);
  const rMask = new Uint8Array(reg.count);
  for (let f = 0; f < nF; f++) {
    const r = reg.label[f];
    if (mask(f)) rMask[r] = 1;
    rNormal[r][0] += fn[f * 3] * area[f];
    rNormal[r][1] += fn[f * 3 + 1] * area[f];
    rNormal[r][2] += fn[f * 3 + 2] * area[f];
  }
  // planos grandes
  const planes = [];
  for (let r = 0; r < reg.count; r++) {
    if (!rMask[r]) continue;
    const s = st[r];
    if (s.area < totalArea * 0.06) continue;
    const n = rNormal[r];
    const l = Math.hypot(...n);
    if (l < s.area * 0.97) continue; // no es plano
    const nn = n.map((v) => v / l);
    planes.push({ r, n: nn, d: nn[0] * s.cx + nn[1] * s.cy + nn[2] * s.cz, s });
  }
  // grosor de la pieza detrás de cada plano (para no confundir agujeros pasantes con texto grabado)
  {
    const bbox = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    for (let r = 0; r < reg.count; r++) {
      if (!rMask[r]) continue;
      const q = st[r];
      bbox.minX = Math.min(bbox.minX, q.minX); bbox.minY = Math.min(bbox.minY, q.minY); bbox.minZ = Math.min(bbox.minZ, q.minZ);
      bbox.maxX = Math.max(bbox.maxX, q.maxX); bbox.maxY = Math.max(bbox.maxY, q.maxY); bbox.maxZ = Math.max(bbox.maxZ, q.maxZ);
    }
    const C = [];
    for (const x of [bbox.minX, bbox.maxX]) for (const y of [bbox.minY, bbox.maxY]) for (const z of [bbox.minZ, bbox.maxZ]) C.push([x, y, z]);
    for (const P of planes) P.thick = Math.max(...C.map((c) => -(P.n[0] * c[0] + P.n[1] * c[1] + P.n[2] * c[2] - P.d)));
  }
  if (!planes.length) return null;
  const H = topo.diag;
  const out = new Uint8Array(nF);
  let count = 0;
  const regionsHit = [];
  for (const P of planes) {
    const cand = [];
    for (let r = 0; r < reg.count; r++) {
      if (!rMask[r] || r === P.r) continue;
      const s = st[r];
      if (s.area > totalArea * 0.03) continue;
      // todos los vértices de la región a poca distancia del plano
      const corners = [
        [s.minX, s.minY, s.minZ], [s.maxX, s.maxY, s.maxZ], [s.minX, s.maxY, s.minZ], [s.maxX, s.minY, s.maxZ],
        [s.minX, s.minY, s.maxZ], [s.maxX, s.maxY, s.minZ],
      ];
      let maxD = -Infinity, minD = Infinity;
      for (const c of corners) {
        const dd = P.n[0] * c[0] + P.n[1] * c[1] + P.n[2] * c[2] - P.d;
        if (dd > maxD) maxD = dd; if (dd < minD) minD = dd;
      }
      const lim = H * 0.08;
      if (maxD > lim || minD < -lim) continue;
      if (-minD > P.thick * 0.6) continue; // atraviesa la pieza: agujero, no texto
      if (Math.abs(maxD) < H * 1e-4 && Math.abs(minD) < H * 1e-4) continue; // coplanar
      // dentro de la huella del plano (caja)
      const ps = P.s, m = H * 0.01;
      if (s.cx < ps.minX - m || s.cx > ps.maxX + m || s.cy < ps.minY - m || s.cy > ps.maxY + m || s.cz < ps.minZ - m - lim || s.cz > ps.maxZ + m + lim) continue;
      cand.push(r);
    }
    if (cand.length >= 5) regionsHit.push(...cand);
  }
  if (!regionsHit.length) return null;
  const set = new Set(regionsHit);
  let relArea = 0;
  for (let f = 0; f < nF; f++) if (set.has(reg.label[f]) && mask(f)) { out[f] = 1; count++; relArea += area[f]; }
  if (relArea > totalArea * 0.45) return null; // demasiado: probablemente no es texto
  void cen;
  return { mask: out, count };
}
