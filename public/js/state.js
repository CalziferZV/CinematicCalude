// Estado de la aplicación: malla, partes, filamentos asignados, selección e historial.
import * as MC from './meshcore.js';
import * as CUT from './cut.js';

const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
export function emit(ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); }

export const BLANK = Object.freeze({ name: 'Sin asignar', hex: '#ECECEC', finish: 'basic', kind: 'solid', blank: true });

export const S = {
  mesh: null, // { pos: Float32Array, faceParts: Uint16Array, facePiece: Uint16Array, topo, normals }
  parts: [], // { id, name, role, filament, visible }
  // piezas físicas (tras cortar): { id, kind: 'body'|'dowel', M: matriz desde la posición montada | null, d, length }
  pieces: [{ id: 0, kind: 'body', M: null }],
  nextPieceId: 1,
  selected: new Set(),
  activeFilament: null,
  tool: 'select',
  brushRadius: 3,
  fillAngle: 20,
  cutZ: 0,
  layerHeight: 0.2,
  modelName: '',
  notes: [],
  nextId: 1,
  variants: [], // propuestas de color: { name, colors: { partId: filamento|null } }
  activeVariant: null,
  variantSeq: 0,
};

// ---------------------------------------------------------------- historial
const undoStack = [];
const redoStack = [];
const copyPieces = (list) => list.map((p) => ({ ...p, M: p.M ? [...p.M] : null }));
function snapshot() {
  return {
    pos: S.mesh.pos, // los arrays de posiciones se reemplazan, nunca se mutan
    faceParts: S.mesh.faceParts.slice(),
    facePiece: S.mesh.facePiece.slice(),
    pieces: copyPieces(S.pieces),
    nextPieceId: S.nextPieceId,
    parts: S.parts.map((p) => ({ ...p })),
    nextId: S.nextId,
  };
}
function restore(s) {
  const geomChanged = s.pos !== S.mesh.pos;
  const piecesChanged = S.pieces.length !== s.pieces.length || s.facePiece.length !== S.mesh.facePiece.length;
  S.mesh.pos = s.pos;
  S.mesh.faceParts = s.faceParts.slice();
  S.mesh.facePiece = s.facePiece.slice();
  S.pieces = copyPieces(s.pieces);
  S.nextPieceId = s.nextPieceId;
  // mostrar/ocultar es solo de vista: deshacer no vuelve a ocultar ni a mostrar partes
  const vis = new Map(S.parts.map((p) => [p.id, p.visible]));
  S.parts = s.parts.map((p) => ({ ...p, visible: vis.has(p.id) ? vis.get(p.id) : true }));
  S.nextId = s.nextId;
  if (geomChanged) { S.mesh.topo = null; S.mesh.normals = null; }
  for (const id of [...S.selected]) if (!partById(id)) S.selected.delete(id);
  emit(geomChanged ? 'mesh' : 'parts');
  if (geomChanged || piecesChanged) emit('pieces');
  emit('selection', { restore: true });
}
// Memoria máxima del historial: en modelos enormes cada paso guarda una copia de la malla,
// así que se descartan los pasos más antiguos para no agotar la memoria del navegador.
const HISTORY_MAX_STEPS = 60;
const HISTORY_MAX_BYTES = 384 * 1024 * 1024;
function historyBytes() {
  const arrays = new Set();
  let bytes = 0;
  for (const st of [...undoStack, ...redoStack]) {
    bytes += st.faceParts.byteLength + st.facePiece.byteLength;
    if (st.pos !== S.mesh.pos) arrays.add(st.pos);
  }
  for (const a of arrays) bytes += a.byteLength;
  return bytes;
}
export function checkpoint() {
  if (!S.mesh) return;
  undoStack.push(snapshot());
  redoStack.length = 0;
  while (undoStack.length > HISTORY_MAX_STEPS || (undoStack.length > 3 && historyBytes() > HISTORY_MAX_BYTES)) undoStack.shift();
  emit('history');
}
export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  emit('history');
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  emit('history');
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

// ---------------------------------------------------------------- malla
export function topo() {
  if (!S.mesh) return null;
  if (!S.mesh.topo) S.mesh.topo = MC.buildTopology(S.mesh.pos, S.pieces.length > 1 ? S.mesh.facePiece : null);
  return S.mesh.topo;
}
export function normals() {
  if (!S.mesh.normals) S.mesh.normals = MC.smoothNormals(S.mesh.pos, topo());
  return S.mesh.normals;
}

// Coloca el modelo apoyado en la cama (Z=0) y centrado en X/Y.
function placeOnBed(pos) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i]; if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1]; if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= minZ; }
  return pos;
}

export function loadMesh(pos, name) {
  undoStack.length = 0;
  redoStack.length = 0;
  pos = MC.removeDegenerate(pos);
  const clean = MC.removeStrayFragments(pos);
  pos = clean.pos;
  S.mesh = { pos: placeOnBed(pos), faceParts: new Uint16Array(pos.length / 9), facePiece: new Uint16Array(pos.length / 9), topo: null, normals: null };
  S.pieces = [{ id: 0, kind: 'body', M: null }];
  S.nextPieceId = 1;
  S.modelName = name;
  S.nextId = 1;
  S.parts = [makePart('Pieza completa', 'otro')];
  S.selected.clear();
  S.notes = [];
  S.variants = [];
  S.activeVariant = null;
  S.variantSeq = 0;
  S.cleanup = clean.removed;
  emit('mesh');
  emit('pieces');
  emit('variants');
  emit('selection');
  emit('history');
}

export function rotateModel(axis, deg) {
  if (!S.mesh) return;
  checkpoint();
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const P = S.mesh.pos.slice();
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (axis === 'x') { P[i + 1] = y * c - z * s; P[i + 2] = y * s + z * c; }
    else if (axis === 'y') { P[i] = x * c + z * s; P[i + 2] = -x * s + z * c; }
    else { P[i] = x * c - y * s; P[i + 1] = x * s + y * c; }
  }
  S.mesh.pos = placeOnBed(P);
  S.mesh.topo = null;
  S.mesh.normals = null;
  for (const pc of S.pieces) pc.M = null;
  emit('mesh');
}

export function scaleModel(factor) {
  scaleModelXYZ(factor, factor, factor);
}
// Escala por eje (fx, fy, fz). Con los tres iguales se mantiene la proporción.
export function scaleModelXYZ(fx, fy, fz) {
  if (!S.mesh || !(fx > 0 && fy > 0 && fz > 0)) return;
  if (Math.abs(fx - 1) < 1e-9 && Math.abs(fy - 1) < 1e-9 && Math.abs(fz - 1) < 1e-9) return;
  checkpoint();
  const P = S.mesh.pos.slice();
  for (let i = 0; i < P.length; i += 3) { P[i] *= fx; P[i + 1] *= fy; P[i + 2] *= fz; }
  S.mesh.pos = placeOnBed(P);
  S.mesh.topo = null;
  S.mesh.normals = null;
  for (const pc of S.pieces) pc.M = null;
  emit('mesh');
}

// ---------------------------------------------------------------- partes
function makePart(name, role = 'otro', filament = null) {
  return { id: S.nextId++, name, role, filament, visible: true };
}
export function partById(id) { return S.parts.find((p) => p.id === id); }
export function partIndexMap() {
  const m = new Map();
  S.parts.forEach((p, i) => m.set(p.id, i));
  return m;
}
export function filamentOf(partId) {
  const p = partById(partId);
  return (p && p.filament) || BLANK;
}

export function newPart(name, filament = null, role = 'otro') {
  const p = makePart(name || `Parte ${S.nextId}`, role, filament);
  S.parts.push(p);
  return p;
}

export function assignFaces(faces, partId) {
  const fp = S.mesh.faceParts;
  let changed = 0;
  for (const f of faces) if (fp[f] !== partId) { fp[f] = partId; changed++; }
  if (changed) { cleanupEmpty(); emit('parts'); }
  return changed;
}

export function partFaceCounts() {
  const counts = new Map();
  const fp = S.mesh.faceParts;
  for (let i = 0; i < fp.length; i++) counts.set(fp[i], (counts.get(fp[i]) || 0) + 1);
  return counts;
}

export function partAreas() {
  const t = topo();
  const a = new Map();
  const fp = S.mesh.faceParts;
  for (let f = 0; f < fp.length; f++) a.set(fp[f], (a.get(fp[f]) || 0) + t.area[f]);
  return a;
}

function cleanupEmpty() {
  const counts = partFaceCounts();
  const before = S.parts.length;
  S.parts = S.parts.filter((p) => counts.get(p.id));
  if (S.parts.length !== before) for (const id of [...S.selected]) if (!partById(id)) S.selected.delete(id);
}

export function setPartFilament(ids, filament) {
  checkpoint();
  for (const id of ids) { const p = partById(id); if (p) p.filament = filament ? { ...filament } : null; }
  emit('parts');
  emit('filament', ids); // el visor deja de "latir" en las partes que ya tienen color
}

export function renamePart(id, name, role, { history = true } = {}) {
  const p = partById(id);
  if (!p) return;
  const newName = name || p.name;
  if (newName === p.name && (!role || role === p.role)) return;
  if (history) checkpoint(); // renombrar también se puede deshacer
  p.name = newName;
  if (role) p.role = role;
  emit('parts');
}
// Varios nombres de una vez (la IA): un solo paso de deshacer
export function renameParts(list) {
  const changes = (list || []).filter((x) => {
    const p = partById(x.part_id);
    return p && ((x.name && x.name !== p.name) || (x.role && x.role !== p.role));
  });
  if (!changes.length) return;
  checkpoint();
  for (const x of changes) renamePart(x.part_id, x.name, x.role, { history: false });
}

export function toggleVisible(id) {
  const p = partById(id);
  if (p) { p.visible = !p.visible; emit('parts'); }
}
// Visibilidad de varias partes a la vez (aislar / ver todo)
export function setVisibility(map) {
  let changed = false;
  for (const p of S.parts) {
    if (!map.has(p.id)) continue;
    const v = !!map.get(p.id);
    if (p.visible !== v) { p.visible = v; changed = true; }
  }
  if (changed) emit('parts');
}

export function mergeParts(ids) {
  if (ids.length < 2) return;
  checkpoint();
  const keep = ids[0];
  const set = new Set(ids.slice(1));
  const fp = S.mesh.faceParts;
  for (let i = 0; i < fp.length; i++) if (set.has(fp[i])) fp[i] = keep;
  S.parts = S.parts.filter((p) => !set.has(p.id));
  S.selected = new Set([keep]);
  emit('parts');
  emit('selection');
}

export function deletePart(id) {
  // "Eliminar" una parte = devolver sus caras a la parte vecina más grande
  if (S.parts.length < 2) return;
  checkpoint();
  const t = topo();
  const fp = S.mesh.faceParts;
  const votes = new Map();
  for (let f = 0; f < fp.length; f++) {
    if (fp[f] !== id) continue;
    for (let k = 0; k < 3; k++) {
      const g = t.nbr[f * 3 + k];
      if (g >= 0 && fp[g] !== id) votes.set(fp[g], (votes.get(fp[g]) || 0) + 1);
    }
  }
  let target = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (target === undefined) target = S.parts.find((p) => p.id !== id).id;
  for (let f = 0; f < fp.length; f++) if (fp[f] === id) fp[f] = target;
  S.parts = S.parts.filter((p) => p.id !== id);
  S.selected.delete(id);
  emit('parts');
  emit('selection');
}

export function select(ids, additive = false) {
  // misma selección que ya había: no se avisa (evita redibujar la lista, p. ej. al hacer doble clic para renombrar)
  if (!additive && ids.length === S.selected.size && ids.every((id) => S.selected.has(id))) return;
  if (!additive) S.selected.clear();
  for (const id of ids) {
    if (additive && S.selected.has(id)) S.selected.delete(id);
    else S.selected.add(id);
  }
  emit('selection');
}

// ---------------------------------------------------------------- segmentación
export function autoSegment(mode) {
  if (!S.mesh) return;
  checkpoint();
  const t = topo();
  const pos = S.mesh.pos;
  // conservar colores por nombre/rol si se re-segmenta
  S.nextId = 1;
  S.parts = [];
  S.notes = [];
  let label, groups;
  if (mode === 'shells') {
    const r = MC.shells(t);
    const st = MC.groupStats(pos, t, r.label, r.count);
    label = r.label;
    groups = st.map((s, i) => ({ name: `Pieza ${i + 1}`, role: 'otro', area: s.area }));
    S.notes.push(`${r.count} piezas sueltas`);
  } else if (mode === 'regions') {
    const r0 = MC.regionsByAngle(t, 30);
    const r = MC.mergeSmallRegions(t, r0.label, r0.count, 0.004, 30);
    label = r.label;
    groups = Array.from({ length: r.count }, (_, i) => ({ name: `Región ${i + 1}`, role: 'otro' }));
    S.notes.push(`${r.count} regiones separadas por aristas vivas`);
  } else if (mode === 'heights') {
    const levels = MC.detectStepLevels(t);
    S.mesh.faceParts.fill(0);
    S.parts = [makePart('Pieza completa', 'otro')];
    S.mesh.faceParts.fill(S.parts[0].id);
    if (levels.length) {
      splitByHeightInternal(S.parts[0].id, levels, true);
      S.notes.push(`Bandas por altura en Z = ${levels.map((z) => z.toFixed(1)).join(', ')} mm`);
    } else S.notes.push('No se han encontrado escalones claros: usa la herramienta Cortar para elegir la altura.');
    emit('mesh');
    emit('selection');
    return S.notes;
  } else {
    const r = MC.smartSegment(pos, t);
    label = r.label;
    groups = r.groups;
    S.notes.push(...r.notes);
    applyLabels(label, groups);
    // aplicar los escalones detectados (cortes reales de triángulos)
    const groupParts = r.groups.map((g, i) => S.parts.find((p) => p.name === g.name && p.role === g.role) || S.parts[i]);
    const splitSets = [];
    for (const sp of r.splits || []) {
      const part = groupParts[sp.group];
      if (!part) continue;
      const created = splitByHeightInternal(part.id, sp.levels, true);
      if (created.length) splitSets.push([part.id, ...created]); // de abajo arriba
    }
    refineNames(splitSets);
    sortPartsByHeight();
    if (S.parts.length < 2) S.notes.push('Pieza de una sola malla sin divisiones evidentes: usa Cortar, Pincel o Relleno para crear partes.');
    S.selected.clear();
    emit('mesh');
    emit('selection');
    return S.notes;
  }
  applyLabels(label, groups);
  S.selected.clear();
  emit('parts');
  emit('selection');
  return S.notes;
}

// Nombres claros tras dividir por escalones: Copa, Columna, Pie... según la forma de cada banda.
function refineNames(splitSets) {
  const hasBase = S.parts.some((p) => p.role === 'base' && p.name === 'Base');
  const box = (id) => {
    const b = partsBBox([id]);
    return { w: Math.max(b.maxX - b.minX, b.maxY - b.minY), h: b.maxZ - b.minZ, z: b.minZ };
  };
  for (const ids of splitSets) {
    const dims = ids.map(box);
    const wMax = Math.max(...dims.map((d) => d.w));
    ids.forEach((id, i) => {
      const p = partById(id);
      if (!p || (p.role === 'base' && p.name === 'Base')) return; // banda de abajo de una pieza única
      const d = dims[i];
      const below = dims[i - 1];
      let name, role;
      if (i === ids.length - 1) {
        if (hasBase && below && d.w >= below.w * 1.2) { name = 'Copa'; role = 'copa'; }
        else { name = hasBase ? 'Figura' : 'Parte superior'; role = 'figura'; }
      } else if (d.h >= d.w * 0.9 && d.w <= wMax * 0.8) { name = 'Columna'; role = 'columna'; }
      else if (d.h < d.w * 0.45) { name = i === 0 ? 'Pie' : 'Anillo'; role = 'detalle'; }
      else { name = 'Cuerpo'; role = 'otro'; }
      p.name = name;
      p.role = role;
    });
  }
  // pieza principal sin dividir: nombre según su forma
  for (const p of S.parts) {
    if (p.name !== 'Pieza principal') continue;
    const d = box(p.id);
    if (d.h < d.w * 0.15) { p.name = 'Placa'; p.role = 'placa'; }
    else if (d.h > d.w * 1.4) { p.name = 'Figura'; p.role = 'figura'; }
  }
  // nombres repetidos: se numeran de abajo arriba
  const byName = new Map();
  for (const p of S.parts) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(p);
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    list.map((p) => [p, box(p.id).z]).sort((a, b) => a[1] - b[1]).forEach(([p], i) => (p.name = `${name} ${i + 1}`));
  }
}

// Ordena la lista como "capas": lo más alto arriba (el texto/relieve justo encima de su soporte).
function sortPartsByHeight() {
  const t = topo();
  const z = new Map();
  const fp = S.mesh.faceParts;
  for (let f = 0; f < fp.length; f++) {
    const id = fp[f];
    const a = z.get(id) || [0, 0];
    a[0] += t.cen[f * 3 + 2] * t.area[f]; a[1] += t.area[f];
    z.set(id, a);
  }
  const zc = (p) => { const a = z.get(p.id); return a && a[1] ? a[0] / a[1] : 0; };
  S.parts.sort((a, b) => zc(b) - zc(a));
}

function applyLabels(label, groups) {
  S.parts = groups.map((g) => makePart(g.name, g.role));
  const fp = S.mesh.faceParts;
  for (let f = 0; f < fp.length; f++) fp[f] = S.parts[label[f]] ? S.parts[label[f]].id : S.parts[0].id;
  cleanupEmpty();
}

// ---------------------------------------------------------------- cortes por altura
function splitByHeightInternal(partId, levelsAbs, autoName) {
  const t = topo();
  const levels = [...new Set(levelsAbs)].sort((a, b) => a - b);
  const filter = partId == null ? () => true : (f) => S.mesh.faceParts[f] === partId;
  const res = MC.cutAtLevels(S.mesh.pos, S.mesh.faceParts, levels, filter, t.diag, S.mesh.facePiece);
  S.mesh.pos = res.pos;
  S.mesh.faceParts = res.faceParts;
  S.mesh.facePiece = res.facePiece;
  S.mesh.topo = null;
  S.mesh.normals = null;
  const t2 = topo();
  const tol = t2.diag * 1e-5;
  // agrupar por parte original y banda
  const targets = partId == null ? S.parts.map((p) => p.id) : [partId];
  const created = [];
  for (const pid of targets) {
    const base = partById(pid);
    const bandParts = new Map();
    const fp = S.mesh.faceParts;
    const bands = new Map();
    for (let f = 0; f < fp.length; f++) {
      if (fp[f] !== pid) continue;
      const b = MC.bandOf(t2.cen[f * 3 + 2], t2.fn[f * 3 + 2], levels, tol);
      bands.set(b, (bands.get(b) || 0) + 1);
    }
    const used = [...bands.keys()].sort((a, b) => a - b);
    if (used.length < 2) continue;
    used.forEach((b, i) => {
      if (i === 0) { bandParts.set(b, pid); return; }
      const lo = b === 0 ? 0 : levels[b - 1];
      const generic = autoName && (base.name === 'Pieza completa' || base.name === 'Pieza principal');
      const name = generic ? bandName(i, used.length) : autoName ? `${base.name} (${i === used.length - 1 ? 'superior' : 'medio ' + i})` : `${base.name} · ${lo.toFixed(1)} mm+`;
      const np = newPart(name, base.filament, i === used.length - 1 ? 'figura' : 'otro');
      bandParts.set(b, np.id);
      created.push(np.id);
    });
    if (autoName && (base.name === 'Pieza completa' || base.name === 'Pieza principal')) { base.name = bandName(0, used.length); base.role = 'base'; }
    else if (autoName) base.name = `${base.name} (inferior)`;
    for (let f = 0; f < fp.length; f++) {
      if (fp[f] !== pid) continue;
      const b = MC.bandOf(t2.cen[f * 3 + 2], t2.fn[f * 3 + 2], levels, tol);
      fp[f] = bandParts.get(b);
    }
  }
  return created;
}
function bandName(i, n) {
  if (i === 0) return 'Base';
  if (i === n - 1) return n === 2 ? 'Parte superior' : 'Parte superior';
  return `Cuerpo ${i}`;
}

export function splitByHeight(partId, heights) {
  if (!S.mesh || !heights.length) return [];
  checkpoint();
  const created = splitByHeightInternal(partId, heights, false);
  emit('mesh');
  return created;
}

export function subdivideMesh(maxEdge) {
  if (!S.mesh) return;
  checkpoint();
  const r = MC.subdivide(S.mesh.pos, S.mesh.faceParts, maxEdge, undefined, S.mesh.facePiece);
  S.mesh.pos = r.pos;
  S.mesh.faceParts = r.faceParts;
  S.mesh.facePiece = r.facePiece;
  S.mesh.topo = null;
  S.mesh.normals = null;
  emit('mesh');
}

// Resumen usado por la IA y por la ficha del cliente.
export function sceneSummary() {
  if (!S.mesh) return { loaded: false };
  const t = topo();
  const areas = partAreas();
  const counts = partFaceCounts();
  const fp = S.mesh.faceParts;
  const bb = new Map();
  for (let f = 0; f < fp.length; f++) {
    const id = fp[f];
    let b = bb.get(id);
    if (!b) bb.set(id, (b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
    const o = f * 9;
    for (let k = 0; k < 9; k += 3) {
      for (let a = 0; a < 3; a++) {
        const v = S.mesh.pos[o + k + a];
        if (v < b[a]) b[a] = v;
        if (v > b[a + 3]) b[a + 3] = v;
      }
    }
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    loaded: true,
    model: S.modelName,
    size_mm: { x: r1(t.bbox.maxX - t.bbox.minX), y: r1(t.bbox.maxY - t.bbox.minY), z: r1(t.bbox.maxZ - t.bbox.minZ) },
    triangles: t.nF,
    analysis_notes: S.notes,
    parts: S.parts.map((p) => {
      const b = bb.get(p.id) || [0, 0, 0, 0, 0, 0];
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        visible: p.visible,
        selected: S.selected.has(p.id),
        triangles: counts.get(p.id) || 0,
        surface_pct: r1((100 * (areas.get(p.id) || 0)) / t.totalArea),
        z_range_mm: [r1(b[2]), r1(b[5])],
        bbox_mm: { x: [r1(b[0]), r1(b[3])], y: [r1(b[1]), r1(b[4])] },
        filament: p.filament
          ? { brand: p.filament.brandName, line: p.filament.line, color: p.filament.name, hex: p.filament.hex }
          : 'sin asignar (blanco)',
      };
    }),
    ...(S.pieces.length > 1
      ? { print_pieces: piecesSummary().map((pc) => ({ id: pc.id, name: pc.name, kind: pc.kind === 'dowel' ? 'pasador' : 'pieza', parts: pc.parts, size_mm: pc.size.map(r1) })) }
      : {}),
  };
}

export function loadProject(d) {
  undoStack.length = 0;
  redoStack.length = 0;
  const nF = d.pos.length / 9;
  const fpc = d.facePiece && d.facePiece.length === nF ? d.facePiece : new Uint16Array(nF);
  S.mesh = { pos: d.pos, faceParts: d.faceParts, facePiece: fpc, topo: null, normals: null };
  const ids = [...new Set(fpc)];
  S.pieces = d.pieces && d.pieces.length ? copyPieces(d.pieces).filter((p) => ids.includes(p.id)) : [];
  for (const id of ids) if (!S.pieces.some((p) => p.id === id)) S.pieces.push({ id, kind: 'body', M: null });
  S.nextPieceId = Math.max(d.nextPieceId || 0, ...ids) + 1;
  S.modelName = d.name;
  S.parts = d.parts.map((p) => ({ ...p }));
  S.nextId = d.nextId;
  S.notes = d.notes || [];
  S.variants = d.variants || [];
  S.variantSeq = d.variantSeq || S.variants.length;
  S.activeVariant = null;
  S.selected.clear();
  emit('mesh');
  emit('pieces');
  emit('variants');
  emit('selection');
  emit('history');
}

// ---------------------------------------------------------------- propuestas (A/B/C...)
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function currentColors() {
  return Object.fromEntries(S.parts.map((p) => [p.id, p.filament ? { ...p.filament } : null]));
}
export function saveVariant() {
  if (!S.mesh) return null;
  const name = LETTERS[S.variantSeq++ % 26];
  S.variants.push({ name, colors: currentColors() });
  S.activeVariant = name;
  emit('variants');
  return name;
}
export function updateVariant(name) {
  const v = S.variants.find((x) => x.name === name);
  if (!v) return;
  v.colors = currentColors();
  S.activeVariant = name;
  emit('variants');
}
export function applyVariant(name) {
  const v = S.variants.find((x) => x.name === name);
  if (!v) return;
  checkpoint();
  for (const p of S.parts) if (p.id in v.colors) p.filament = v.colors[p.id] ? { ...v.colors[p.id] } : null;
  S.activeVariant = name;
  emit('parts');
  emit('filament', S.parts.map((p) => p.id));
  emit('variants');
}
export function deleteVariant(name) {
  S.variants = S.variants.filter((x) => x.name !== name);
  if (S.activeVariant === name) S.activeVariant = null;
  emit('variants');
}
// ¿Los colores actuales coinciden con la propuesta activa?
export function variantIsDirty() {
  const v = S.variants.find((x) => x.name === S.activeVariant);
  if (!v) return false;
  return S.parts.some((p) => {
    const a = v.colors[p.id] || null, b = p.filament || null;
    return (a && a.hex) !== (b && b.hex) || (a && a.name) !== (b && b.name);
  });
}

// ---------------------------------------------------------------- mover / girar partes
// m = matriz 4x4 en orden de columnas (como three.js) que se aplica a los vértices de esas partes.
function applyMatrix(P, set, m) {
  const fp = S.mesh.faceParts;
  for (let f = 0; f < fp.length; f++) {
    if (!set.has(fp[f])) continue;
    for (let k = 0; k < 9; k += 3) {
      const o = f * 9 + k;
      const x = P[o], y = P[o + 1], z = P[o + 2];
      P[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
      P[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      P[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
  }
}
function geometryChanged() {
  S.mesh.topo = null;
  S.mesh.normals = null;
  emit('mesh');
}
export function transformParts(ids, m) {
  if (!S.mesh || !ids.length) return;
  checkpoint();
  const P = S.mesh.pos.slice();
  const set = new Set(ids);
  applyMatrix(P, set, m);
  S.mesh.pos = P;
  if (S.pieces.length > 1) {
    // piezas que se han movido enteras: se apunta el movimiento (para «Montar» después)
    const whole = new Map();
    const fp = S.mesh.faceParts, fpc = S.mesh.facePiece;
    for (let f = 0; f < fp.length; f++) {
      const id = fpc[f], st = whole.get(id) ?? true;
      whole.set(id, st && set.has(fp[f]));
    }
    for (const pc of S.pieces) if (whole.get(pc.id)) pc.M = CUT.mat4Mul(m, pc.M || CUT.IDENTITY);
  }
  geometryChanged();
}
const translation = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// Caja envolvente de unas partes (o de todo el modelo)
export function partsBBox(ids) {
  const set = ids && ids.length ? new Set(ids) : null;
  const b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  const P = S.mesh.pos, fp = S.mesh.faceParts;
  for (let f = 0; f < fp.length; f++) {
    if (set && !set.has(fp[f])) continue;
    for (let k = 0; k < 9; k += 3) {
      const o = f * 9 + k;
      if (P[o] < b.minX) b.minX = P[o]; if (P[o] > b.maxX) b.maxX = P[o];
      if (P[o + 1] < b.minY) b.minY = P[o + 1]; if (P[o + 1] > b.maxY) b.maxY = P[o + 1];
      if (P[o + 2] < b.minZ) b.minZ = P[o + 2]; if (P[o + 2] > b.maxZ) b.maxZ = P[o + 2];
    }
  }
  return b;
}

// Baja las partes hasta apoyarlas en la cama (Z = 0)
export function dropToBed(ids) {
  if (!S.mesh) return;
  const list = ids && ids.length ? ids : S.parts.map((p) => p.id);
  const b = partsBBox(list);
  if (!Number.isFinite(b.minZ) || Math.abs(b.minZ) < 1e-6) return false;
  transformParts(list, translation(0, 0, -b.minZ));
  return true;
}

// ¿Alguna de estas partes comparte aristas con otra parte? (al moverla se separará)
export function partsConnected(ids) {
  const set = new Set(ids);
  const t = topo();
  const fp = S.mesh.faceParts;
  for (let f = 0; f < fp.length; f++) {
    if (!set.has(fp[f])) continue;
    for (let k = 0; k < 3; k++) {
      const g = t.nbr[f * 3 + k];
      if (g >= 0 && !set.has(fp[g])) return true;
    }
  }
  return false;
}

// Vista "separada": aparta cada parte del centro (en horizontal) para verlas sueltas
export function explodeParts(factor = 0.6) {
  if (!S.mesh || S.parts.length < 2) return false;
  const t = topo();
  const fp = S.mesh.faceParts;
  const acc = new Map();
  for (let f = 0; f < fp.length; f++) {
    const a = acc.get(fp[f]) || [0, 0, 0];
    a[0] += t.cen[f * 3] * t.area[f]; a[1] += t.cen[f * 3 + 1] * t.area[f]; a[2] += t.area[f];
    acc.set(fp[f], a);
  }
  const cx = (t.bbox.minX + t.bbox.maxX) / 2, cy = (t.bbox.minY + t.bbox.maxY) / 2;
  const size = Math.max(t.bbox.maxX - t.bbox.minX, t.bbox.maxY - t.bbox.minY);
  checkpoint();
  const P = S.mesh.pos.slice();
  let i = 0;
  for (const p of S.parts) {
    const a = acc.get(p.id);
    if (!a || !a[2]) continue;
    let dx = a[0] / a[2] - cx, dy = a[1] / a[2] - cy;
    const len = Math.hypot(dx, dy);
    if (len < size * 0.02) {
      // parte centrada: repartir en círculo para que no se queden encima unas de otras
      const ang = (i++ / S.parts.length) * Math.PI * 2;
      dx = Math.cos(ang) * size * 0.3; dy = Math.sin(ang) * size * 0.3;
    }
    applyMatrix(P, new Set([p.id]), translation(dx * factor, dy * factor, 0));
  }
  S.mesh.pos = P;
  geometryChanged();
  return true;
}

// ---------------------------------------------------------------- añadir geometría (texto 3D)
// Añade triángulos como una parte nueva (en la pieza indicada) y la deja seleccionada.
export function addGeometryPart(add, { name = 'Texto', role = 'texto', filament = null, piece = 0 } = {}) {
  if (!S.mesh || !add || !add.length) return null;
  checkpoint();
  const n0 = S.mesh.pos.length / 9, n1 = add.length / 9;
  const P = new Float32Array((n0 + n1) * 9);
  P.set(S.mesh.pos);
  P.set(add, n0 * 9);
  const part = makePart(name, role, filament ? { ...filament } : null);
  S.parts.push(part);
  const FP = new Uint16Array(n0 + n1);
  FP.set(S.mesh.faceParts);
  FP.fill(part.id, n0);
  const FPC = new Uint16Array(n0 + n1);
  FPC.set(S.mesh.facePiece);
  FPC.fill(piece, n0);
  S.mesh.pos = P;
  S.mesh.faceParts = FP;
  S.mesh.facePiece = FPC;
  S.mesh.topo = null;
  S.mesh.normals = null;
  S.selected = new Set([part.id]);
  emit('mesh');
  emit('selection');
  return part;
}

// ---------------------------------------------------------------- piezas (cortar para imprimir por separado)
export const pieceById = (id) => S.pieces.find((p) => p.id === id);
export const pieceCount = () => S.pieces.length;

// Caras de cada pieza: Map(id -> Int32Array)
export function facesByPiece() {
  const fpc = S.mesh.facePiece;
  const counts = new Map();
  for (let f = 0; f < fpc.length; f++) counts.set(fpc[f], (counts.get(fpc[f]) || 0) + 1);
  const out = new Map();
  for (const [id, c] of counts) out.set(id, new Int32Array(c));
  const w = new Map();
  for (let f = 0; f < fpc.length; f++) {
    const id = fpc[f], i = w.get(id) || 0;
    out.get(id)[i] = f;
    w.set(id, i + 1);
  }
  return out;
}

// Piezas que contienen alguna de estas partes
export function piecesOfParts(ids) {
  const set = new Set(ids);
  const out = new Set();
  const fp = S.mesh.faceParts, fpc = S.mesh.facePiece;
  for (let f = 0; f < fp.length; f++) if (set.has(fp[f])) out.add(fpc[f]);
  return out;
}

function applyPieceMatrices(P, mats) {
  const fpc = S.mesh.facePiece;
  for (let f = 0; f < fpc.length; f++) {
    const m = mats.get(fpc[f]);
    if (!m) continue;
    for (let k = 0; k < 9; k += 3) {
      const o = f * 9 + k;
      const x = P[o], y = P[o + 1], z = P[o + 2];
      P[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
      P[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      P[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
  }
}
function prunePieces() {
  const ids = new Set(S.mesh.facePiece);
  S.pieces = S.pieces.filter((p) => ids.has(p.id));
  for (const id of ids) if (!pieceById(id)) S.pieces.push({ id, kind: 'body', M: null });
}

// Corta por el plano (con tapas y anclajes). Devuelve el resultado de CUT.executeCut.
export function cutPieces(plane, connectors = [], { targetPieces = null } = {}) {
  if (!S.mesh) return { ok: false, reason: 'Primero abre un modelo' };
  const res = CUT.executeCut({ pos: S.mesh.pos, faceParts: S.mesh.faceParts, facePiece: S.mesh.facePiece }, plane, connectors, { targetPieces, nextPieceId: S.nextPieceId });
  if (!res.ok) return res;
  checkpoint();
  S.mesh.pos = res.pos;
  S.mesh.faceParts = res.faceParts;
  S.mesh.facePiece = res.facePiece;
  const firstBody = res.created.find((c) => c.kind === 'body');
  for (const c of res.created) {
    const parent = pieceById(c.from != null ? c.from : firstBody ? firstBody.from : -1);
    S.pieces.push({ id: c.id, kind: c.kind, M: parent && parent.M ? [...parent.M] : null, ...(c.kind === 'dowel' ? { d: c.d, length: Math.round(c.length * 10) / 10, axis: [...c.axis] } : {}) });
  }
  S.nextPieceId = res.nextPieceId;
  prunePieces();
  S.mesh.topo = null;
  S.mesh.normals = null;
  cleanupEmpty();
  emit('mesh');
  emit('pieces');
  emit('selection');
  return res;
}

// Mueve piezas enteras (y apunta el movimiento para poder volver a montarlas)
export function transformPieces(mats, { animate = true } = {}) {
  if (!S.mesh || !mats.size) return;
  checkpoint();
  if (animate) emit('pieceAnim', { from: S.mesh.pos, facePiece: S.mesh.facePiece, deltas: mats });
  const P = S.mesh.pos.slice();
  applyPieceMatrices(P, mats);
  S.mesh.pos = P;
  for (const [id, m] of mats) {
    const pc = pieceById(id);
    if (!pc) continue;
    const M = CUT.mat4Mul(m, pc.M || CUT.IDENTITY);
    pc.M = CUT.isIdentity(M) ? null : M;
  }
  geometryChanged();
}

// Centro (por área) y caja de cada pieza con las posiciones P
function pieceStats(P, groups) {
  const out = new Map();
  for (const [id, faces] of groups) {
    let ax = 0, ay = 0, az = 0, A = 0;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const f of faces) {
      const o = f * 9;
      const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
      const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      ax += ((P[o] + P[o + 3] + P[o + 6]) / 3) * a; ay += ((P[o + 1] + P[o + 4] + P[o + 7]) / 3) * a; az += ((P[o + 2] + P[o + 5] + P[o + 8]) / 3) * a;
      A += a;
      for (let k = 0; k < 9; k += 3) for (let c = 0; c < 3; c++) { const v = P[o + k + c]; if (v < b[c]) b[c] = v; if (v > b[c + 3]) b[c + 3] = v; }
    }
    out.set(id, { c: A ? [ax / A, ay / A, az / A] : [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], b });
  }
  return out;
}

// Vista separada: cada pieza se aparta del centro (desde la posición montada) para ver el encaje
export function explodePieces() {
  if (!S.mesh || S.pieces.length < 2) return false;
  const groups = facesByPiece();
  const P = S.mesh.pos.slice();
  const inv = new Map();
  for (const pc of S.pieces) if (pc.M) inv.set(pc.id, CUT.mat4RigidInverse(pc.M));
  applyPieceMatrices(P, inv); // posición montada
  const st = pieceStats(P, groups);
  const all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const { b } of st.values()) for (let c = 0; c < 3; c++) { all[c] = Math.min(all[c], b[c]); all[c + 3] = Math.max(all[c + 3], b[c + 3]); }
  const center = [(all[0] + all[3]) / 2, (all[1] + all[4]) / 2, (all[2] + all[5]) / 2];
  const size = Math.max(all[3] - all[0], all[4] - all[1], all[5] - all[2]);
  const gap = Math.min(60, Math.max(14, size * 0.3));
  let maxD = 1e-9;
  for (const { c } of st.values()) maxD = Math.max(maxD, Math.hypot(c[0] - center[0], c[1] - center[1], c[2] - center[2]));
  const E = new Map();
  for (const [id, { c }] of st) {
    const d = [c[0] - center[0], c[1] - center[1], c[2] - center[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    const k = L > 1e-6 ? (gap * L) / maxD / L : 0;
    E.set(id, CUT.mat4Translate(d[0] * k, d[1] * k, d[2] * k));
  }
  // apoyar el conjunto en la cama
  let minZ = Infinity;
  for (const [id, { b }] of st) minZ = Math.min(minZ, b[2] + E.get(id)[14]);
  checkpoint();
  for (const [id, m] of E) m[14] -= minZ - all[2];
  const deltas = new Map();
  for (const [id, m] of E) { const pc = pieceById(id); deltas.set(id, pc && pc.M ? CUT.mat4Mul(m, CUT.mat4RigidInverse(pc.M)) : m); }
  emit('pieceAnim', { from: S.mesh.pos, facePiece: S.mesh.facePiece, deltas });
  applyPieceMatrices(P, E);
  S.mesh.pos = P;
  for (const pc of S.pieces) { const m = E.get(pc.id); pc.M = m && !CUT.isIdentity(m) ? m : null; }
  geometryChanged();
  return true;
}

// Vuelve a montar las piezas como estaban al cortar
export function assemblePieces() {
  if (!S.mesh) return false;
  const mats = new Map();
  for (const pc of S.pieces) if (pc.M && !CUT.isIdentity(pc.M)) mats.set(pc.id, CUT.mat4RigidInverse(pc.M));
  if (!mats.size) return false;
  checkpoint();
  emit('pieceAnim', { from: S.mesh.pos, facePiece: S.mesh.facePiece, deltas: mats });
  const P = S.mesh.pos.slice();
  applyPieceMatrices(P, mats);
  S.mesh.pos = P;
  for (const pc of S.pieces) pc.M = null;
  geometryChanged();
  return true;
}

// Colocación para imprimir: cada pieza tumbada sobre su cara plana más grande (la del corte, salvo que
// lleve espigas) y todas repartidas en la cama sin tocarse. Devuelve las matrices (no cambia nada).
export function printLayoutMatrices(P = S.mesh.pos, gap = 8) {
  const groups = facesByPiece();
  const items = [];
  for (const [id, faces] of groups) {
    const meta = pieceById(id);
    let dir;
    if (meta && meta.kind === 'dowel' && meta.axis) {
      // pasadores de pie: su eje (girado como esté ahora la pieza) en vertical
      dir = meta.M ? CUT.normalize(CUT.applyMat3(meta.M, meta.axis)) : meta.axis;
      if (dir[2] > 0) dir = [-dir[0], -dir[1], -dir[2]];
    } else dir = CUT.restDirection(P, faces).dir;
    const R = CUT.mat4RotateTo(dir, [0, 0, -1]);
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const f of faces) {
      for (let k = 0; k < 9; k += 3) {
        const o = f * 9 + k;
        const v = CUT.applyMat3(R, [P[o], P[o + 1], P[o + 2]]);
        for (let c = 0; c < 3; c++) { if (v[c] < b[c]) b[c] = v[c]; if (v[c] > b[c + 3]) b[c + 3] = v[c]; }
      }
    }
    items.push({ id, R, b, w: b[3] - b[0], d: b[4] - b[1], dowel: meta && meta.kind === 'dowel' });
  }
  // estantería: primero las piezas grandes, los pasadores al final
  items.sort((a, b) => (a.dowel - b.dowel) || b.w * b.d - a.w * a.d);
  const area = items.reduce((s, it) => s + (it.w + gap) * (it.d + gap), 0);
  const rowMax = Math.max(...items.map((it) => it.w), Math.sqrt(area) * 1.2);
  let x = 0, y = 0, rowH = 0, maxX = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > rowMax) { x = 0; y += rowH + gap; rowH = 0; }
    it.x = x; it.y = y;
    x += it.w + gap;
    rowH = Math.max(rowH, it.d);
    maxX = Math.max(maxX, it.x + it.w);
  }
  const cx = maxX / 2, cy = (y + rowH) / 2;
  const mats = new Map();
  for (const it of items) mats.set(it.id, CUT.mat4Mul(CUT.mat4Translate(it.x - it.b[0] - cx, it.y - it.b[1] - cy, -it.b[2]), it.R));
  return mats;
}
export function layoutPieces() {
  if (!S.mesh || S.pieces.length < 2) return false;
  transformPieces(printLayoutMatrices());
  return true;
}
// Posiciones para exportar: si las piezas siguen montadas (se solaparían en el laminador), colocadas para imprimir
export function exportPositions() {
  if (!S.mesh || S.pieces.length < 2 || S.pieces.some((p) => p.M)) return S.mesh.pos;
  const P = S.mesh.pos.slice();
  applyPieceMatrices(P, printLayoutMatrices(P));
  return P;
}
export const piecesAssembled = () => S.pieces.every((p) => !p.M);

// Lista de piezas para la interfaz y la IA
export function piecesSummary() {
  if (!S.mesh) return [];
  const groups = facesByPiece();
  const fp = S.mesh.faceParts, P = S.mesh.pos;
  const st = pieceStats(P, groups);
  // dónde está cada pieza en el modelo montado (arriba, izquierda...) para distinguir las mitades
  const PA = S.pieces.some((p) => p.M) ? P.slice() : P;
  if (PA !== P) {
    const inv = new Map();
    for (const pc of S.pieces) if (pc.M) inv.set(pc.id, CUT.mat4RigidInverse(pc.M));
    applyPieceMatrices(PA, inv);
  }
  const sa = PA === P ? st : pieceStats(PA, groups);
  const all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const { b } of sa.values()) for (let c = 0; c < 3; c++) { all[c] = Math.min(all[c], b[c]); all[c + 3] = Math.max(all[c + 3], b[c + 3]); }
  const where = (id) => {
    const c = sa.get(id).c, w = [];
    const rel = (k) => (c[k] - (all[k] + all[k + 3]) / 2) / Math.max(all[k + 3] - all[k], 1e-6);
    if (Math.abs(rel(2)) > 0.12) w.push(rel(2) > 0 ? 'arriba' : 'abajo');
    if (Math.abs(rel(0)) > 0.12) w.push(rel(0) > 0 ? 'der.' : 'izq.');
    if (Math.abs(rel(1)) > 0.12) w.push(rel(1) > 0 ? 'detrás' : 'delante');
    return w.join(' ');
  };
  const out = [];
  let num = 0;
  for (const pc of S.pieces) {
    const faces = groups.get(pc.id);
    if (!faces) continue;
    const areas = new Map();
    for (const f of faces) {
      const o = f * 9;
      const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
      const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      areas.set(fp[f], (areas.get(fp[f]) || 0) + Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx));
    }
    const names = [...areas.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => partById(id)?.name).filter(Boolean);
    const b = st.get(pc.id).b;
    const pos = pc.kind === 'dowel' ? '' : where(pc.id);
    const name = pc.kind === 'dowel' ? `Pasador Ø${pc.d} × ${pc.length} mm` : `Pieza ${++num}${pos ? ` · ${pos}` : ''}`;
    out.push({
      id: pc.id, kind: pc.kind, name, parts: names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : ''), faces: faces.length,
      size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], volume: Math.abs(CUT.meshVolume(P, faces)), d: pc.d, length: pc.length,
    });
  }
  return out;
}
