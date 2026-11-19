// Corte en piezas: tras cortar, cada pieza tiene que quedar cerrada (sin agujeros) y el volumen cuadrar.
// Cortes fijos en las muestras + cortes aleatorios (plano en cualquier dirección, con y sin anclajes).
import fs from 'node:fs';
import * as MC from '../../public/js/meshcore.js';
import * as CUT from '../../public/js/cut.js';
import * as ST from '../../public/js/state.js';

function readSTL(p) {
  const b = fs.readFileSync(p);
  const n = b.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = b.readFloatLE(84 + i * 50 + 12 + k * 4);
  return pos;
}
function openEdges(pos, groups) {
  const t = MC.buildTopology(pos, groups);
  let o = 0;
  for (let f = 0; f < t.nF; f++) {
    const a = t.vid[f * 3], b = t.vid[f * 3 + 1], c = t.vid[f * 3 + 2];
    if (a === b || b === c || a === c) continue;
    for (let k = 0; k < 3; k++) if (t.nbr[f * 3 + k] < 0) o++;
  }
  return o;
}
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  ✗', msg); } };

// 1) cortes fijos con anclajes automáticos
const cases = [
  ['trofeo', { o: [0, 0, 11], n: [0, 0, 1] }, 'dowel', (r) => r.placed.length === 4 && r.placed.every((c) => c.type === 'dowel' && c.d === 8)],
  ['trofeo', { o: [0, 0, 18], n: [0, 0, 1] }, 'dowel', (r) => r.placed.length >= 2],
  ['caja', { o: [0, 0, 20], n: [0, 0, 1] }, 'magnet', (r) => r.placed.length >= 1 && r.placed.every((c) => c.type === 'magnet')],
  ['trofeo', { o: [0, 0, 60], n: [1, 0, 0] }, 'plug', (r) => r.placed.length >= 2],
];
for (const [file, plane, type, expect] of cases) {
  ST.loadMesh(readSTL(`public/samples/${file}.stl`), file);
  const pos = ST.S.mesh.pos;
  const an = CUT.analyzeCut(pos, plane, {});
  const auto = CUT.autoConnectors(an, { type });
  const r = CUT.executeCut({ pos, faceParts: ST.S.mesh.faceParts, facePiece: ST.S.mesh.facePiece }, plane, auto.list, {});
  const open = r.ok ? openEdges(r.pos, r.facePiece) : -1;
  console.log(`${file} n=(${plane.n}) o=(${plane.o}) ${type}: ${r.ok ? `${new Set(r.facePiece).size} piezas, ${r.placed.length} anclajes (${[...new Set(r.placed.map((c) => `${c.type} Ø${c.d}`))].join(', ')}), aristas abiertas ${open}` : r.reason}`);
  check(r.ok && open === 0, `${file}: piezas sin cerrar`);
  check(r.ok && expect(r), `${file}: anclajes inesperados`);
}

// 2) "cortar a la selección": el plano se ajusta al borde entre la Copa y la Columna
ST.loadMesh(readSTL('public/samples/trofeo.stl'), 'trofeo');
ST.autoSegment('smart');
const copa = ST.S.parts.find((p) => p.name === 'Copa');
const fit = CUT.fitPlaneToParts(ST.S.mesh.pos, ST.topo(), ST.S.mesh.faceParts, new Set([copa.id]));
console.log('ajuste a la Copa:', fit && `n=(${fit.n}) z=${fit.o[2].toFixed(2)} plano=${fit.planar}`);
check(fit && fit.n[2] === 1 && fit.planar, 'el ajuste a la selección no es horizontal');
const better = CUT.searchBetterPlane(ST.S.mesh.pos, fit, { opts: { type: 'dowel' } });
console.log('mejor sitio cercano:', better && `${better.offset.toFixed(1)} mm, ${better.count} anclajes`);
check(better && better.count >= 2, 'no encuentra sitio para anclajes cerca de la Copa');

// 3) flujo del estado: cortar, separar, colocar, montar, deshacer
const r1 = ST.cutPieces(better.plane, better.list);
check(r1.ok && ST.pieceCount() === 4, 'cutPieces');
check(ST.explodePieces() && ST.layoutPieces() && ST.assemblePieces() && ST.piecesAssembled(), 'separar / colocar / montar');
check(openEdges(ST.S.mesh.pos, ST.S.mesh.facePiece) === 0, 'piezas abiertas tras moverlas');
for (let i = 0; i < 4; i++) ST.undo();
check(ST.pieceCount() === 1, 'deshacer el corte');

// 4) cortes aleatorios
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let total = 0, conns = 0;
for (const file of ['trofeo', 'caja', 'placa-relieve']) {
  ST.loadMesh(readSTL(`public/samples/${file}.stl`), file);
  const pos = ST.S.mesh.pos;
  const V0 = CUT.meshVolume(pos);
  const bb = ST.topo().bbox;
  for (let i = 0; i < 25; i++) {
    const r = rnd();
    const n = r < 0.3 ? [0, 0, 1] : r < 0.45 ? [1, 0, 0] : CUT.normalize([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
    const o = [bb.minX + rnd() * (bb.maxX - bb.minX), bb.minY + rnd() * (bb.maxY - bb.minY), bb.minZ + rnd() * (bb.maxZ - bb.minZ)];
    if (n[2] === 1 && rnd() < 0.4) o[2] = Math.round(o[2]);
    const plane = { o, n };
    const list = rnd() < 0.5 ? CUT.autoConnectors(CUT.analyzeCut(pos, plane, {}), { type: ['dowel', 'plug', 'magnet'][Math.floor(rnd() * 3)] }).list : [];
    const res = CUT.executeCut({ pos, faceParts: new Uint16Array(pos.length / 9), facePiece: new Uint16Array(pos.length / 9) }, plane, list, {});
    if (!res.ok) continue;
    total++;
    conns += res.placed.length;
    const open = openEdges(res.pos, res.facePiece);
    const V1 = CUT.meshVolume(res.pos);
    const volOk = list.length ? Math.abs(V1 - V0) < V0 * 0.05 : Math.abs(V1 - V0) < Math.max(V0 * 1e-3, 0.5);
    check(open === 0 && volOk, `${file} corte aleatorio #${i}: abiertas ${open}, volumen ${V0.toFixed(1)} → ${V1.toFixed(1)}`);
  }
}
console.log(`${total} cortes aleatorios, ${conns} anclajes`);
if (fails) { console.log(`${fails} fallos`); process.exit(1); }
console.log('corte en piezas: ok');
