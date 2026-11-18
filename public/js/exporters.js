// Exportaciones: 3MF pintado, STL por color, imagen para el cliente, ficha y proyecto.
import * as fflate from 'three/addons/libs/fflate.module.js';
import { S, topo, BLANK, sceneSummary, emit } from './state.js';
import { capture } from './viewer.js';
import { swatchCss } from './materials.js';
import { filamentKey } from './catalog.js';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const baseName = () => (S.modelName || 'modelo').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_');
const filLabel = (f) => (f.blank ? 'Sin asignar (blanco)' : `${f.brandName ? f.brandName + ' · ' : ''}${f.line ? f.line + ' · ' : ''}${f.name}`);

// Lista de filamentos distintos usados en el proyecto, en orden de partes.
// Las partes sin color van siempre en el último hueco (filamento N).
export function usedFilaments() {
  const list = [];
  const keyOf = new Map();
  const counts = new Map();
  const t = topo();
  for (let f = 0; f < S.mesh.faceParts.length; f++) counts.set(S.mesh.faceParts[f], (counts.get(S.mesh.faceParts[f]) || 0) + t.area[f]);
  const keyFor = (p) => ((p.filament || BLANK).blank ? 'blank' : filamentKey(p.filament));
  for (const pass of ['color', 'blank']) {
    for (const p of S.parts) {
      if (!counts.get(p.id)) continue;
      const k = keyFor(p);
      if ((k === 'blank') !== (pass === 'blank')) continue;
      if (!keyOf.has(k)) { keyOf.set(k, list.length); list.push({ fil: p.filament || BLANK, parts: [], area: 0 }); }
      const e = list[keyOf.get(k)];
      e.parts.push(p);
      e.area += counts.get(p.id);
    }
  }
  return { list, indexOfPart: (p) => keyOf.get(keyFor(p)) };
}

// Color "plano" de un filamento para formatos que solo admiten un color por zona.
export function flatHex(fil) {
  return ((fil.hexes && fil.hexes[0]) || fil.hex || '#ECECEC').slice(0, 7).toUpperCase();
}

// Vértices soldados (sin repetir) para formatos indexados (3MF, OBJ).
function weldedVertices(t, P) {
  const vpos = new Float64Array(t.nV * 3);
  const seen = new Uint8Array(t.nV);
  for (let c = 0; c < t.nF * 3; c++) {
    const v = t.vid[c];
    if (seen[v]) continue;
    seen[v] = 1;
    vpos[v * 3] = P[c * 3]; vpos[v * 3 + 1] = P[c * 3 + 1]; vpos[v * 3 + 2] = P[c * 3 + 2];
  }
  return vpos;
}

// Cambios de filamento por capa (si las partes son bandas horizontales apiladas).
export function layerChanges(layerH = S.layerHeight || 0.2) {
  const t = topo();
  const fp = S.mesh.faceParts;
  const { indexOfPart } = usedFilaments();
  const ranges = new Map();
  for (let f = 0; f < fp.length; f++) {
    const part = S.parts.find((p) => p.id === fp[f]);
    if (!part) continue;
    const fi = indexOfPart(part);
    const o = f * 9;
    const zmin = Math.min(S.mesh.pos[o + 2], S.mesh.pos[o + 5], S.mesh.pos[o + 8]);
    const zmax = Math.max(S.mesh.pos[o + 2], S.mesh.pos[o + 5], S.mesh.pos[o + 8]);
    const r = ranges.get(fi) || [Infinity, -Infinity];
    r[0] = Math.min(r[0], zmin); r[1] = Math.max(r[1], zmax);
    ranges.set(fi, r);
  }
  const arr = [...ranges.entries()].sort((a, b) => a[1][0] - b[1][0]);
  const eps = t.diag * 1e-4;
  for (let i = 1; i < arr.length; i++) if (arr[i][1][0] < arr[i - 1][1][1] - eps) return null; // se solapan: no es por capas
  return arr.slice(1).map(([fi, r]) => ({ filamentIndex: fi, z: r[0], layer: Math.round(r[0] / layerH) + 1 }));
}

// ---------------------------------------------------------------- 3MF
function paintCode(state) {
  if (state <= 0) return '';
  if (state < 3) return (state << 2).toString(16).toUpperCase();
  return (state - 3).toString(16).toUpperCase() + 'C';
}

export function export3MF() {
  const t = topo();
  const P = S.mesh.pos;
  const { list, indexOfPart } = usedFilaments();
  const partSlot = new Map(S.parts.map((p) => [p.id, indexOfPart(p)]));
  const vpos = weldedVertices(t, P);
  // colocar dentro de la cama (vale para A1 mini, A1, P1, X1) y con la base en Z = 0
  const off = [90, 90, -t.bbox.minZ];
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n');
  out.push(`<metadata name="Title">${escXml(baseName())}</metadata>\n<metadata name="Application">Filament Studio</metadata>\n<resources>\n`);
  // grupo de colores: un color por filamento (en el mismo orden que la pintura: filamento 1, 2, 3...)
  out.push('<m:colorgroup id="1">\n');
  for (const e of list) out.push(`<m:color color="${flatHex(e.fil)}FF"/>\n`);
  out.push('</m:colorgroup>\n');
  out.push(`<object id="2" type="model" name="${escXml(baseName())}" pid="1" pindex="0">\n<mesh>\n<vertices>\n`);
  const vs = [];
  for (let v = 0; v < t.nV; v++) vs.push(`<vertex x="${(vpos[v * 3] + off[0]).toFixed(5)}" y="${(vpos[v * 3 + 1] + off[1]).toFixed(5)}" z="${(vpos[v * 3 + 2] + off[2]).toFixed(5)}"/>`);
  out.push(vs.join('\n'));
  out.push('\n</vertices>\n<triangles>\n');
  const ts = [];
  for (let f = 0; f < t.nF; f++) {
    const a = t.vid[f * 3], b = t.vid[f * 3 + 1], c = t.vid[f * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const slot = partSlot.get(S.mesh.faceParts[f]) ?? 0;
    const code = paintCode(slot + 1);
    ts.push(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="1" p1="${slot}" paint_color="${code}" slic3rpe:mmu_segmentation="${code}"/>`);
  }
  out.push(ts.join('\n'));
  out.push('\n</triangles>\n</mesh>\n</object>\n</resources>\n<build>\n<item objectid="2" printable="1"/>\n</build>\n</model>\n');
  const enc = new TextEncoder();
  const files = {
    '[Content_Types].xml': enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="txt" ContentType="text/plain"/></Types>'),
    '_rels/.rels': enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': enc.encode(out.join('')),
    'Metadata/filamentos.txt': enc.encode(sheetText()),
  };
  const zip = fflate.zipSync(files, { level: 6 });
  download(new Blob([zip], { type: 'model/3mf' }), `${baseName()}_color.3mf`);
  return list;
}

// ---------------------------------------------------------------- OBJ con colores (OBJ + MTL)
// Bambu Studio y OrcaSlicer importan los colores de un OBJ y los convierten en filamentos.
export function exportOBJ() {
  const t = topo();
  const P = S.mesh.pos;
  const { list, indexOfPart } = usedFilaments();
  const partSlot = new Map(S.parts.map((p) => [p.id, indexOfPart(p)]));
  const vpos = weldedVertices(t, P);
  const name = baseName();
  const ascii = (str) => String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  const matName = (i) => `F${i + 1}_${ascii(list[i].fil.blank ? 'sin_color' : list[i].fil.name) || 'color'}`;
  const obj = [`# Filament Studio - ${name}`, `# Filamentos: ${list.map((e, i) => `${i + 1}=${filLabel(e.fil)}`).join(' | ')}`, `mtllib ${name}.mtl`, `o ${name}`];
  const minZ = t.bbox.minZ;
  for (let v = 0; v < t.nV; v++) obj.push(`v ${vpos[v * 3].toFixed(5)} ${vpos[v * 3 + 1].toFixed(5)} ${(vpos[v * 3 + 2] - minZ).toFixed(5)}`);
  const bySlot = list.map(() => []);
  for (let f = 0; f < t.nF; f++) {
    const a = t.vid[f * 3], b = t.vid[f * 3 + 1], c = t.vid[f * 3 + 2];
    if (a === b || b === c || a === c) continue;
    bySlot[partSlot.get(S.mesh.faceParts[f]) ?? 0].push(`f ${a + 1} ${b + 1} ${c + 1}`);
  }
  bySlot.forEach((faces, i) => {
    if (!faces.length) return;
    obj.push(`usemtl ${matName(i)}`);
    obj.push(...faces);
  });
  const mtl = [`# Filament Studio - colores de ${name}`];
  list.forEach((e, i) => {
    const h = flatHex(e.fil);
    const rgb = [1, 3, 5].map((k) => (parseInt(h.slice(k, k + 2), 16) / 255).toFixed(4)).join(' ');
    mtl.push('', `# Filamento ${i + 1}: ${filLabel(e.fil)} ${h}`, `newmtl ${matName(i)}`, `Kd ${rgb}`, 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', 'illum 1');
  });
  const readme = `OBJ CON COLORES - ${name}\r\n\r\n1. Descomprime este ZIP (deja el .obj y el .mtl juntos en la misma carpeta).\r\n2. En Bambu Studio / OrcaSlicer: Archivo > Importar > selecciona ${name}.obj\r\n3. El programa detecta los colores y te pregunta cómo convertirlos en filamentos.\r\n\r\n${sheetText().replace(/\n/g, '\r\n')}\r\n`;
  const enc = new TextEncoder();
  const zip = fflate.zipSync({
    [`${name}.obj`]: enc.encode(obj.join('\n') + '\n'),
    [`${name}.mtl`]: enc.encode(mtl.join('\n') + '\n'),
    'LEEME.txt': enc.encode('\ufeff' + readme),
  }, { level: 6 });
  download(new Blob([zip], { type: 'application/zip' }), `${name}_obj_color.zip`);
  return list;
}

function escXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

// ---------------------------------------------------------------- STL por color
export function exportSTLZip() {
  const { list, indexOfPart } = usedFilaments();
  const P = S.mesh.pos;
  const fp = S.mesh.faceParts;
  const slot = new Map(S.parts.map((p) => [p.id, indexOfPart(p)]));
  const files = {};
  list.forEach((e, i) => {
    const faces = [];
    for (let f = 0; f < fp.length; f++) if (slot.get(fp[f]) === i) faces.push(f);
    const buf = new ArrayBuffer(84 + faces.length * 50);
    const dv = new DataView(buf);
    dv.setUint32(80, faces.length, true);
    faces.forEach((f, j) => {
      const o = 84 + j * 50;
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, P[f * 9 + k], true);
    });
    const nm = `${String(i + 1).padStart(2, '0')}_${filLabel(e.fil)}`.replace(/[^\w\-]+/g, '_').slice(0, 80);
    files[`${nm}.stl`] = new Uint8Array(buf);
  });
  files['LEEME_filamentos.txt'] = new TextEncoder().encode(sheetText() + '\n\nCómo usarlo: importa todos los STL a la vez en tu laminador y, cuando pregunte, cárgalos como UN objeto de varias partes. Asigna a cada parte el filamento indicado en su nombre.\n');
  download(new Blob([fflate.zipSync(files, { level: 6 })], { type: 'application/zip' }), `${baseName()}_por_color.zip`);
}

// ---------------------------------------------------------------- ficha de texto
export function sheetText() {
  const sum = sceneSummary();
  const { list } = usedFilaments();
  const lines = [];
  lines.push(`FICHA DE FILAMENTOS — ${S.modelName || 'modelo'}`);
  lines.push(`Fecha: ${new Date().toLocaleString('es-ES')}`);
  lines.push(`Tamaño: ${sum.size_mm.x} × ${sum.size_mm.y} × ${sum.size_mm.z} mm`);
  lines.push('');
  lines.push('FILAMENTOS (orden para el laminador / AMS):');
  list.forEach((e, i) => {
    const pct = (100 * e.area) / topo().totalArea;
    lines.push(`  ${i + 1}. ${filLabel(e.fil)}  ${e.fil.hex || ''}${e.fil.code ? `  (código ${e.fil.code})` : ''}  — ${pct.toFixed(0)}% de la superficie`);
  });
  lines.push('');
  lines.push('PARTES:');
  for (const p of sum.parts) lines.push(`  · ${p.name}: ${typeof p.filament === 'string' ? p.filament : `${p.filament.brand} ${p.filament.line} ${p.filament.color}`}`);
  const lc = layerChanges();
  if (lc && lc.length) {
    lines.push('');
    lines.push(`CAMBIO DE FILAMENTO POR CAPA (altura de capa ${S.layerHeight} mm) — válido para cualquier impresora:`);
    for (const c of lc) lines.push(`  · Capa ${c.layer} (Z = ${c.z.toFixed(2)} mm) → filamento ${c.filamentIndex + 1}: ${filLabel(list[c.filamentIndex].fil)}`);
  }
  return lines.join('\n');
}
export function exportSheet() {
  download(new Blob([sheetText()], { type: 'text/plain;charset=utf-8' }), `${baseName()}_filamentos.txt`);
}

// ---------------------------------------------------------------- imagen para el cliente
export function clientImage() {
  const W = 1800, H = 1100, side = 520;
  const render = capture({ view: 'current', width: W - side, height: H });
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(render, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(W - side, 0, side, H);
  ctx.fillStyle = '#e3e5ea';
  ctx.fillRect(W - side, 0, 2, H);
  const x0 = W - side + 40;
  ctx.fillStyle = '#1d2129';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText((S.modelName || 'Tu pieza').replace(/\.[^.]+$/, ''), x0, 70, side - 80);
  ctx.fillStyle = '#7a808c';
  ctx.font = '20px system-ui, sans-serif';
  const sum = sceneSummary();
  ctx.fillText(`${sum.size_mm.x} × ${sum.size_mm.y} × ${sum.size_mm.z} mm · ${new Date().toLocaleDateString('es-ES')}`, x0, 104);
  let y = 160;
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#7a808c';
  ctx.fillText('COLORES ELEGIDOS', x0, y);
  y += 26;
  const visible = S.parts.filter((p) => p.visible);
  const rowH = Math.min(86, (H - y - 70) / Math.max(visible.length, 1));
  for (const p of visible) {
    const f = p.filament || BLANK;
    drawSwatch(ctx, f, x0, y, rowH - 18);
    ctx.fillStyle = '#1d2129';
    ctx.font = `600 ${Math.min(22, rowH * 0.3)}px system-ui, sans-serif`;
    ctx.fillText(p.name, x0 + rowH, y + rowH * 0.3, side - rowH - 60);
    ctx.fillStyle = '#5b6170';
    ctx.font = `${Math.min(18, rowH * 0.24)}px system-ui, sans-serif`;
    ctx.fillText(filLabel(f), x0 + rowH, y + rowH * 0.58, side - rowH - 60);
    y += rowH;
  }
  ctx.fillStyle = '#b0b4bc';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Previsualización orientativa · colores reales del fabricante', x0, H - 30);
  return c;
}
function drawSwatch(ctx, f, x, y, s) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, 10);
  ctx.clip();
  const hexes = f.hexes && f.hexes.length > 1 ? f.hexes : null;
  if (hexes) {
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    hexes.forEach((h, i) => g.addColorStop(i / (hexes.length - 1), h));
    ctx.fillStyle = g;
  } else if (f.finish === 'silk' || f.finish === 'metal') {
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, f.hex);
    g.addColorStop(1, f.hex);
    ctx.fillStyle = g;
  } else ctx.fillStyle = f.hex;
  ctx.fillRect(x, y, s, s);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, 10);
  ctx.stroke();
  void swatchCss;
}
// Imagen con todas las propuestas lado a lado (para que el cliente elija).
export function compareImage() {
  const vs = S.variants;
  if (!vs.length) throw new Error('Guarda al menos una propuesta (botón «+ Guardar»)');
  const cols = Math.min(vs.length, 3), rows = Math.ceil(vs.length / cols);
  const CW = 760, RH = 560, LH = 230, HEAD = 96;
  const c = document.createElement('canvas');
  c.width = cols * CW;
  c.height = HEAD + rows * (RH + LH);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1d2129';
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillText(`${(S.modelName || 'Tu pieza').replace(/\.[^.]+$/, '')} — propuestas de color`, 36, 60, c.width - 72);
  const saved = S.parts.map((p) => p.filament);
  vs.forEach((v, i) => {
    const x = (i % cols) * CW, y = HEAD + Math.floor(i / cols) * (RH + LH);
    for (const p of S.parts) if (p.id in v.colors) p.filament = v.colors[p.id];
    const img = capture({ view: 'current', width: CW, height: RH });
    ctx.drawImage(img, x, y);
    ctx.fillStyle = '#ff6a13';
    ctx.beginPath();
    ctx.roundRect(x + 20, y + 20, 64, 64, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(v.name, x + 52, y + 66);
    ctx.textAlign = 'left';
    let ly = y + RH + 24;
    const list = S.parts.filter((p) => p.visible);
    const max = Math.min(list.length, 6);
    const rowH = (LH - 30) / Math.max(max, 1);
    for (const p of list.slice(0, max)) {
      const f = p.filament || BLANK;
      drawSwatch(ctx, f, x + 28, ly, Math.min(rowH - 8, 30));
      ctx.fillStyle = '#1d2129';
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.fillText(p.name, x + 70, ly + 13, CW - 100);
      ctx.fillStyle = '#5b6170';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(filLabel(f), x + 70, ly + 31, CW - 100);
      ly += rowH;
    }
    if (list.length > max) { ctx.fillStyle = '#7a808c'; ctx.fillText(`+ ${list.length - max} partes más`, x + 70, ly + 10); }
    ctx.fillStyle = '#e3e5ea';
    ctx.fillRect(x + CW - 1, y, 1, RH + LH);
  });
  S.parts.forEach((p, i) => (p.filament = saved[i]));
  emit('parts'); // restaura el render normal
  return c;
}
export function exportCompare() {
  compareImage().toBlob((b) => download(b, `${baseName()}_propuestas.png`), 'image/png');
}

export function exportPNG() {
  clientImage().toBlob((b) => download(b, `${baseName()}_propuesta.png`), 'image/png');
}
export async function copyPNG() {
  const blob = await new Promise((r) => clientImage().toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// ---------------------------------------------------------------- proyecto
function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
export function exportProject() {
  const data = {
    app: 'filament-studio', version: 1, name: S.modelName, nextId: S.nextId, notes: S.notes,
    parts: S.parts, variants: S.variants, variantSeq: S.variantSeq, pos: toB64(new Uint8Array(S.mesh.pos.buffer.slice(0))), faceParts: toB64(new Uint8Array(S.mesh.faceParts.buffer.slice(0))),
  };
  const json = new TextEncoder().encode(JSON.stringify(data));
  download(new Blob([fflate.gzipSync(json)], { type: 'application/octet-stream' }), `${baseName()}.fsproj`);
}
export function parseProject(buf) {
  let u8 = new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = fflate.gunzipSync(u8);
  const d = JSON.parse(new TextDecoder().decode(u8));
  if (d.app !== 'filament-studio') throw new Error('No es un proyecto de Filament Studio');
  return {
    name: d.name, nextId: d.nextId, notes: d.notes || [], parts: d.parts, variants: d.variants || [], variantSeq: d.variantSeq || 0,
    pos: new Float32Array(fromB64(d.pos).buffer), faceParts: new Uint16Array(fromB64(d.faceParts).buffer),
  };
}
