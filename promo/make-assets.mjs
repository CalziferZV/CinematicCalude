// Prepara el trofeo de ejemplo para el vídeo y la web: partes detectadas, cortado en piezas con
// pasadores (como haría la app) y separado por niveles para la animación de "despiece".
// Uso: node promo/make-assets.mjs  ->  promo/assets/trofeo.json
import fs from 'node:fs';
import * as ST from '../public/js/state.js';
import * as CUT from '../public/js/cut.js';

function readSTL(p) {
  const b = fs.readFileSync(p);
  const n = b.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = b.readFloatLE(84 + i * 50 + 12 + k * 4);
  return pos;
}
const S = ST.S;
ST.loadMesh(readSTL('public/samples/trofeo.stl'), 'trofeo');
ST.autoSegment('smart');
// corte 1: la peana a 11 mm (4 pasadores Ø8)
const p1 = { o: [0, 0, 11], n: [0, 0, 1] };
ST.cutPieces(p1, CUT.autoConnectors(CUT.analyzeCut(S.mesh.pos, p1, {}), { type: 'dowel' }).list);
// corte 2: "a la selección" en la copa, en el mejor sitio cercano
const copa = S.parts.find((p) => p.name === 'Copa');
const targets = ST.piecesOfParts([copa.id]);
const mask = (f) => targets.has(S.mesh.facePiece[f]);
const fit = CUT.fitPlaneToParts(S.mesh.pos, ST.topo(), S.mesh.faceParts, new Set([copa.id]));
const best = CUT.searchBetterPlane(S.mesh.pos, { o: fit.o, n: fit.n }, { faceMask: mask, opts: { type: 'dowel' } });
ST.cutPieces(best.plane, best.list, { targetPieces: targets });
const cuts = [p1.o[2], best.plane.o[2]].sort((a, b) => a - b);
console.log('cortes en z =', cuts.map((z) => z.toFixed(1)).join(', '), '· piezas', S.pieces.length);

// geometría por (pieza, parte) con normales suaves
const P = S.mesh.pos, N = ST.normals(), fp = S.mesh.faceParts, fpc = S.mesh.facePiece;
const groups = new Map();
for (let f = 0; f < fp.length; f++) {
  const k = `${fpc[f]}:${fp[f]}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}
const b64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
const out = { name: 'trofeo', parts: S.parts.map((p) => ({ id: p.id, name: p.name, role: p.role })), pieces: [], groups: [], cuts };
// despiece: cada cuerpo sube por niveles; los pasadores quedan en medio de las dos piezas que unen
const bodies = [], zr = new Map();
for (let f = 0; f < fpc.length; f++) {
  const r = zr.get(fpc[f]) || [Infinity, -Infinity];
  for (let k = 2; k < 9; k += 3) { r[0] = Math.min(r[0], P[f * 9 + k]); r[1] = Math.max(r[1], P[f * 9 + k]); }
  zr.set(fpc[f], r);
}
for (const pc of S.pieces) if (pc.kind === 'body') bodies.push(pc.id);
bodies.sort((a, b) => zr.get(a)[0] - zr.get(b)[0]);
const GAP = 24;
const level = new Map(bodies.map((id, i) => [id, i * GAP]));
for (const pc of S.pieces) {
  const r = zr.get(pc.id);
  let dz;
  if (pc.kind === 'body') dz = level.get(pc.id);
  else {
    const zc = (r[0] + r[1]) / 2;
    const i = cuts.findIndex((z) => Math.abs(z - zc) < 12);
    dz = (i + 0.5) * GAP;
  }
  out.pieces.push({ id: pc.id, kind: pc.kind, z: [r[0], r[1]], explode: [0, 0, dz], d: pc.d || 0 });
}
for (const [k, faces] of groups) {
  const [piece, part] = k.split(':').map(Number);
  const pos = new Float32Array(faces.length * 9), nor = new Int8Array(faces.length * 9);
  faces.forEach((f, i) => {
    pos.set(P.subarray(f * 9, f * 9 + 9), i * 9);
    for (let j = 0; j < 9; j++) nor[i * 9 + j] = Math.round(N[f * 9 + j] * 127);
  });
  out.groups.push({ piece, part, pos: b64(pos), nor: b64(nor) });
}
fs.writeFileSync('promo/assets/trofeo.json', JSON.stringify(out));
console.log('promo/assets/trofeo.json', (fs.statSync('promo/assets/trofeo.json').size / 1024).toFixed(0), 'KB ·', out.groups.length, 'grupos ·', fp.length, 'triángulos');
console.log(out.pieces.map((p) => `${p.id} ${p.kind} z ${p.z.map((v) => v.toFixed(0)).join('–')} ↑${p.explode[2]}`).join(' | '));
