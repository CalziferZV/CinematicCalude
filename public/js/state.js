// Estado de la aplicación: malla, partes, filamentos asignados, selección e historial.
import * as MC from './meshcore.js';

const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
export function emit(ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); }

export const BLANK = Object.freeze({ name: 'Sin asignar', hex: '#ECECEC', finish: 'basic', kind: 'solid', blank: true });

export const S = {
  mesh: null, // { pos: Float32Array, faceParts: Uint16Array, topo, normals }
  parts: [], // { id, name, role, filament, visible }
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
function snapshot() {
  return {
    pos: S.mesh.pos, // los arrays de posiciones se reemplazan, nunca se mutan
    faceParts: S.mesh.faceParts.slice(),
    parts: S.parts.map((p) => ({ ...p })),
    nextId: S.nextId,
  };
}
function restore(s) {
  const geomChanged = s.pos !== S.mesh.pos;
  S.mesh.pos = s.pos;
  S.mesh.faceParts = s.faceParts.slice();
  S.parts = s.parts.map((p) => ({ ...p }));
  S.nextId = s.nextId;
  if (geomChanged) { S.mesh.topo = null; S.mesh.normals = null; }
  for (const id of [...S.selected]) if (!partById(id)) S.selected.delete(id);
  emit(geomChanged ? 'mesh' : 'parts');
  emit('selection');
}
export function checkpoint() {
  if (!S.mesh) return;
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
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
  if (!S.mesh.topo) S.mesh.topo = MC.buildTopology(S.mesh.pos);
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
  S.mesh = { pos: placeOnBed(pos), faceParts: new Uint16Array(pos.length / 9), topo: null, normals: null };
  S.modelName = name;
  S.nextId = 1;
  S.parts = [makePart('Pieza completa', 'otro')];
  S.selected.clear();
  S.notes = [];
  S.variants = [];
  S.activeVariant = null;
  S.variantSeq = 0;
  emit('mesh');
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
  emit('mesh');
}

export function scaleModel(factor) {
  if (!S.mesh || !(factor > 0)) return;
  checkpoint();
  const P = S.mesh.pos.map((v) => v * factor);
  S.mesh.pos = placeOnBed(P);
  S.mesh.topo = null;
  S.mesh.normals = null;
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
}

export function renamePart(id, name, role) {
  const p = partById(id);
  if (!p) return;
  p.name = name || p.name;
  if (role) p.role = role;
  emit('parts');
}

export function toggleVisible(id) {
  const p = partById(id);
  if (p) { p.visible = !p.visible; emit('parts'); }
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
    for (const sp of r.splits || []) {
      const part = groupParts[sp.group];
      if (part) splitByHeightInternal(part.id, sp.levels, true);
    }
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
  const res = MC.cutAtLevels(S.mesh.pos, S.mesh.faceParts, levels, filter, t.diag);
  S.mesh.pos = res.pos;
  S.mesh.faceParts = res.faceParts;
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
  const r = MC.subdivide(S.mesh.pos, S.mesh.faceParts, maxEdge);
  S.mesh.pos = r.pos;
  S.mesh.faceParts = r.faceParts;
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
  };
}

export function loadProject(d) {
  undoStack.length = 0;
  redoStack.length = 0;
  S.mesh = { pos: d.pos, faceParts: d.faceParts, topo: null, normals: null };
  S.modelName = d.name;
  S.parts = d.parts.map((p) => ({ ...p }));
  S.nextId = d.nextId;
  S.notes = d.notes || [];
  S.variants = d.variants || [];
  S.variantSeq = d.variantSeq || S.variants.length;
  S.activeVariant = null;
  S.selected.clear();
  emit('mesh');
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
