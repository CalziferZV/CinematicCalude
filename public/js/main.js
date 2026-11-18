// Punto de entrada: conecta la interfaz con el estado, el visor, el catálogo y la IA.
import * as ST from './state.js';
import * as V from './viewer.js';
import * as MC from './meshcore.js';
import { initCatalog, filamentKey, setActiveKey, escapeHtml } from './catalog.js';
import { loadFile, parseBuffer } from './loaders.js';
import * as EX from './exporters.js';
import { initAI } from './ai.js';
import { swatchCss } from './materials.js';

const { S } = ST;
const $ = (id) => document.getElementById(id);
const ROLE_LABEL = { base: 'base', texto: 'texto', relieve: 'relieve', figura: 'figura', copa: 'copa', placa: 'placa', columna: 'columna', logo: 'logo', borde: 'borde', detalle: 'detalle' };

// ---------------------------------------------------------------- utilidades UI
let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
let hintTimer;
function hint(msg, ms = 2200) {
  const h = $('hint');
  h.textContent = msg;
  h.classList.add('show');
  clearTimeout(hintTimer);
  if (ms) hintTimer = setTimeout(() => h.classList.remove('show'), ms);
}
function loading(on, text = 'Procesando…') {
  $('loading').hidden = !on;
  $('loadingText').textContent = text;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function busy(text, fn) {
  loading(true, text);
  await nextFrame();
  try { return await fn(); } catch (e) { console.error(e); toast(`Error: ${e.message}`, 5000); } finally { loading(false); }
}

// ---------------------------------------------------------------- carga de modelos
async function openFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  await busy(`Cargando ${file.name}…`, async () => {
    const buf = await file.arrayBuffer();
    if (ext === 'fsproj' || ext === 'json') {
      const d = EX.parseProject(buf);
      V.resetCameraOnNextLoad();
      ST.loadProject(d);
      toast(`Proyecto «${d.name}» abierto`);
      return;
    }
    const { pos, name } = await parseBuffer(buf, ext, file.name);
    V.resetCameraOnNextLoad();
    ST.loadMesh(pos, name);
    await nextFrame();
    const notes = ST.autoSegment('smart');
    toast(`${name} cargado · ${S.parts.length} partes detectadas`);
    void notes;
  });
}
async function openSample(name) {
  await busy(`Cargando ejemplo…`, async () => {
    const r = await fetch(`samples/${name}`);
    const file = new File([await r.blob()], name);
    await openFile(file);
  });
}

// ---------------------------------------------------------------- partes
function renderParts() {
  const list = $('partsList');
  $('emptyState').hidden = !!S.mesh;
  $('fileName').textContent = S.mesh ? S.modelName : 'Sin modelo';
  if (!S.mesh) { list.innerHTML = '<div class="empty-small">Abre un modelo para empezar</div>'; return; }
  const areas = ST.partAreas();
  const total = ST.topo().totalArea;
  $('partsCount').textContent = `(${S.parts.length})`;
  list.innerHTML = '';
  for (const p of S.parts) {
    const f = p.filament || ST.BLANK;
    const el = document.createElement('div');
    el.className = 'part' + (S.selected.has(p.id) ? ' selected' : '') + (p.visible ? '' : ' hidden-part');
    el.dataset.id = p.id;
    const pct = ((100 * (areas.get(p.id) || 0)) / total).toFixed(1);
    el.innerHTML = `
      <div class="sw" style="background:${swatchCss(p.filament)}"></div>
      <div class="info">
        <div class="name">${escapeHtml(p.name)}${ROLE_LABEL[p.role] ? `<span class="role">${ROLE_LABEL[p.role]}</span>` : ''}</div>
        <div class="sub">${f.blank ? 'Sin color' : escapeHtml(`${f.brandName || ''} ${f.line || ''} · ${f.name}`)} · ${pct}%</div>
      </div>
      <button class="eye" title="Mostrar / ocultar">${p.visible ? '👁' : '◌'}</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.eye')) { ST.toggleVisible(p.id); return; }
      if (e.target.closest('input')) return;
      ST.select([p.id], e.shiftKey || e.ctrlKey || e.metaKey);
    });
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.eye')) return;
      const nameEl = el.querySelector('.name');
      const inp = document.createElement('input');
      inp.className = 'rename';
      inp.value = p.name;
      nameEl.replaceWith(inp);
      inp.focus();
      inp.select();
      const done = (save) => { if (save && inp.value.trim()) ST.renamePart(p.id, inp.value.trim()); else renderParts(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); });
      inp.addEventListener('blur', () => done(true));
    });
    el.addEventListener('mouseenter', () => V.setHover(p.id));
    el.addEventListener('mouseleave', () => V.setHover(null));
    list.appendChild(el);
  }
  renderPalette();
  renderPresentBar();
  renderStats();
  renderNotes();
}

function renderNotes() {
  $('segNotes').innerHTML = (S.notes || []).map((n) => `<div>${escapeHtml(n)}</div>`).join('');
}

function renderPalette() {
  const el = $('projectPalette');
  const used = new Map();
  for (const p of S.parts) {
    if (!p.filament) continue;
    const k = filamentKey(p.filament);
    if (!used.has(k)) used.set(k, { f: p.filament, ids: [] });
    used.get(k).ids.push(p.id);
  }
  if (!used.size) { el.innerHTML = '<span class="muted">Aún no hay colores asignados</span>'; return; }
  el.innerHTML = '';
  let i = 1;
  for (const { f, ids } of used.values()) {
    const b = document.createElement('div');
    b.className = 'pal';
    b.title = `${f.brandName} · ${f.line} · ${f.name} (${f.hex})\nClic: seleccionar las partes con este color`;
    b.innerHTML = `<i style="background:${swatchCss(f)}"></i><span>${i++}. ${escapeHtml(f.name)}</span>`;
    b.addEventListener('click', () => { ST.select(ids); setActive(f, false); });
    el.appendChild(b);
  }
}

function renderPresentBar() {
  const bar = $('presentBar');
  bar.innerHTML = S.parts
    .filter((p) => p.visible)
    .map((p) => {
      const f = p.filament || ST.BLANK;
      return `<div class="pi"><i style="background:${swatchCss(p.filament)}"></i><div><b>${escapeHtml(p.name)}</b><span>${f.blank ? 'Por elegir' : escapeHtml(`${f.brandName} ${f.line} · ${f.name}`)}</span></div></div>`;
    })
    .join('');
}

function renderStats() {
  if (!S.mesh) return;
  const t = ST.topo();
  const b = t.bbox;
  let open = 0;
  for (let i = 0; i < t.nbr.length; i++) if (t.nbr[i] < 0) open++;
  $('modelStats').innerHTML = `Tamaño: ${(b.maxX - b.minX).toFixed(1)} × ${(b.maxY - b.minY).toFixed(1)} × ${(b.maxZ - b.minZ).toFixed(1)} mm<br>Triángulos: ${t.nF.toLocaleString('es-ES')}${open ? ` · <span title="Aristas abiertas: la malla tiene agujeros">⚠ ${open} aristas abiertas</span>` : ' · malla cerrada ✓'}`;
  const cz = $('cutZ');
  cz.max = (b.maxZ - b.minZ).toFixed(2);
}

// ---------------------------------------------------------------- color activo
function setActive(fil, applyToSelection = true) {
  S.activeFilament = fil;
  setActiveKey(filamentKey(fil));
  $('activeFil').innerHTML = `<div class="big" style="background:${swatchCss(fil)}"></div><div><div class="t1">${escapeHtml(fil.name)}</div><div class="t2">${escapeHtml(`${fil.brandName} · ${fil.line}`)}<br>${fil.hexes ? fil.hexes.join(' · ') : fil.hex}${fil.code ? ` · ${fil.code}` : ''}</div></div>`;
  if (applyToSelection && S.mesh) {
    if (S.selected.size) {
      ST.setPartFilament([...S.selected], fil);
      toast(`${fil.name} aplicado a ${S.selected.size === 1 ? ST.partById([...S.selected][0])?.name : S.selected.size + ' partes'}`);
    } else hint('Color activo listo: haz clic en una parte para aplicarlo, o usa el pincel / relleno', 3000);
  }
}

// ---------------------------------------------------------------- herramientas
function setTool(tool) {
  S.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  document.querySelectorAll('[data-opts]').forEach((d) => (d.hidden = d.dataset.opts !== tool));
  V.showBrush(null);
  V.showCutPlane(S.cutZ, tool === 'cut' && !!S.mesh);
  V.setHover(null);
  const msg = { select: 'Clic para seleccionar una parte', brush: 'Arrastra sobre la pieza para pintar · botón derecho para girar', fill: 'Clic en una zona para rellenarla', cut: 'Mueve el plano y pulsa «Cortar aquí»' };
  hint(msg[tool]);
}

function paintTarget() {
  if (S.selected.size === 1) return [...S.selected][0];
  const fil = S.activeFilament;
  const p = ST.newPart(fil ? `${fil.name}` : `Parte ${S.nextId}`, fil);
  ST.select([p.id]);
  return p.id;
}

let painting = false;
let paintPart = null;
let downPos = null;

function onPointerDown(e) {
  downPos = { x: e.clientX, y: e.clientY };
  if (!S.mesh || e.button !== 0) return;
  if (S.tool === 'brush') {
    const hit = V.pick(e.clientX, e.clientY);
    if (!hit) return;
    V.getControls().enabled = false;
    ST.checkpoint();
    paintPart = paintTarget();
    painting = true;
    paintAt(hit);
  }
}
function paintAt(hit) {
  const faces = V.facesInBrush(hit.point, S.brushRadius);
  faces.push(hit.face);
  ST.assignFaces(faces, paintPart);
}
let moveRaf = 0;
function onPointerMove(e) {
  if (!S.mesh) return;
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0;
    if (S.tool === 'brush') {
      const hit = V.pick(e.clientX, e.clientY);
      V.showBrush(hit?.point, hit?.normal, S.brushRadius);
      if (painting && hit) paintAt(hit);
    } else if (S.tool === 'select' || S.tool === 'fill') {
      if (e.buttons) return;
      const hit = V.pick(e.clientX, e.clientY);
      V.setHover(hit ? hit.partId : null);
    }
  });
}
function onPointerUp(e) {
  if (painting) {
    painting = false;
    V.getControls().enabled = true;
    return;
  }
  if (!S.mesh || !downPos || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5;
  downPos = null;
  if (moved) return;
  const hit = V.pick(e.clientX, e.clientY);
  if (S.tool === 'select') {
    if (!hit) { if (!e.shiftKey) ST.select([]); return; }
    ST.select([hit.partId], e.shiftKey || e.ctrlKey || e.metaKey);
    const p = ST.partById(hit.partId);
    if (p) hint(`${p.name}${S.activeFilament ? ' · elige un color o pulsa «Aplicar a selección»' : ' · elige un color a la derecha'}`);
  } else if (S.tool === 'fill' && hit) {
    const faces = MC.smartFill(ST.topo(), hit.face, S.fillAngle, $('fillSamePart').checked ? S.mesh.faceParts : null);
    ST.checkpoint();
    const target = paintTarget();
    if (target === hit.partId && faces.length) {
      // rellenar dentro de la parte seleccionada = separar esa zona en una parte nueva
      const fil = S.activeFilament;
      const np = ST.newPart(fil ? fil.name : `Zona ${S.nextId}`, fil);
      ST.assignFaces(faces, np.id);
      ST.select([np.id]);
    } else ST.assignFaces(faces, target);
    hint(`Relleno: ${faces.length} caras`);
  }
}

function snapZ(z) {
  if (!$('layerSnap').checked) return z;
  const lh = parseFloat($('layerHeight').value) || 0.2;
  return Math.round(z / lh) * lh;
}
function setCutZ(z, from) {
  if (!S.mesh) return;
  const b = ST.topo().bbox;
  z = Math.min(Math.max(z, 0), b.maxZ - b.minZ);
  S.cutZ = z;
  if (from !== 'range') $('cutZ').value = z;
  if (from !== 'num') $('cutZNum').value = z.toFixed(2);
  V.showCutPlane(b.minZ + z, S.tool === 'cut');
}

// ---------------------------------------------------------------- eventos
function bind() {
  $('btnOpen').addEventListener('click', () => $('fileInput').click());
  $('btnOpen2').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => { closeMenus(); openSample(b.dataset.sample); }));

  // arrastrar y soltar
  const vp = document.querySelector('.viewport-wrap');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('dropZone').classList.add('show'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropZone').classList.remove('show'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('dropZone').classList.remove('show');
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  void vp;

  // menús
  document.querySelectorAll('[data-dd]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = $(b.dataset.dd);
      const open = m.classList.contains('open');
      closeMenus();
      if (!open) m.classList.add('open');
    }),
  );
  document.addEventListener('click', closeMenus);

  // historial
  $('btnUndo').addEventListener('click', ST.undo);
  $('btnRedo').addEventListener('click', ST.redo);
  ST.on('history', () => { $('btnUndo').disabled = !ST.canUndo(); $('btnRedo').disabled = !ST.canRedo(); });

  // segmentación
  document.querySelectorAll('[data-seg]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!S.mesh) return toast('Primero abre un modelo');
      busy('Analizando la pieza…', () => {
        ST.autoSegment(b.dataset.seg);
        toast(`${S.parts.length} partes`);
      });
    }),
  );

  // partes
  $('btnNewPart').addEventListener('click', () => {
    if (!S.mesh) return;
    const fil = S.activeFilament;
    const p = ST.newPart(fil ? fil.name : `Parte ${S.nextId}`, fil);
    ST.select([p.id]);
    setTool('brush');
    toast('Parte nueva creada: píntala con el pincel o el relleno');
    renderParts();
  });
  $('btnMerge').addEventListener('click', () => {
    if (S.selected.size < 2) return toast('Selecciona 2 o más partes (Mayús+clic)');
    ST.mergeParts([...S.selected]);
  });
  $('btnDeletePart').addEventListener('click', () => {
    if (!S.selected.size) return toast('Selecciona una parte');
    for (const id of [...S.selected]) ST.deletePart(id);
  });

  // herramientas
  document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('brushRadius').addEventListener('input', (e) => { S.brushRadius = +e.target.value; $('brushRadiusOut').textContent = `${S.brushRadius} mm`; });
  $('fillAngle').addEventListener('input', (e) => { S.fillAngle = +e.target.value; $('fillAngleOut').textContent = `${S.fillAngle}°`; });
  $('cutZ').addEventListener('input', (e) => setCutZ(snapZ(+e.target.value), 'range'));
  $('cutZNum').addEventListener('change', (e) => setCutZ(+e.target.value, 'num'));
  $('layerHeight').addEventListener('change', (e) => { S.layerHeight = parseFloat(e.target.value) || 0.2; setCutZ(snapZ(S.cutZ)); });
  $('btnCut').addEventListener('click', () => {
    if (!S.mesh) return;
    const b = ST.topo().bbox;
    const target = S.selected.size === 1 ? [...S.selected][0] : null;
    busy('Cortando…', () => {
      const created = ST.splitByHeight(target, [b.minZ + S.cutZ]);
      if (created.length) { ST.select(created); toast('Pieza cortada: la parte de arriba queda seleccionada, elige su color'); }
      else toast('Esa altura no atraviesa la parte seleccionada');
      V.showCutPlane(ST.topo().bbox.minZ + S.cutZ, true);
    });
  });
  $('btnAutoLevels').addEventListener('click', () => {
    if (!S.mesh) return;
    const t = ST.topo();
    const target = S.selected.size === 1 ? [...S.selected][0] : null;
    const levels = MC.detectStepLevels(t, target == null ? null : (f) => S.mesh.faceParts[f] === target);
    if (!levels.length) return toast('No se encontraron escalones claros');
    busy('Cortando por escalones…', () => {
      const created = ST.splitByHeight(target, levels);
      toast(`${created.length} cortes en Z = ${levels.map((z) => (z - t.bbox.minZ).toFixed(1)).join(', ')} mm`);
    });
  });

  // modelo
  document.querySelectorAll('[data-rot]').forEach((b) => b.addEventListener('click', () => { ST.rotateModel(b.dataset.rot, 90); V.fitView('iso'); }));
  $('btnScale').addEventListener('click', () => {
    if (!S.mesh) return;
    const t = ST.topo();
    const h = (t.bbox.maxZ - t.bbox.minZ).toFixed(1);
    const v = prompt(`Escala en % (100 = igual). También puedes escribir la altura final en mm, p. ej. "120mm". Altura actual: ${h} mm`, '100');
    if (!v) return;
    const f = /mm$/i.test(v.trim()) ? parseFloat(v) / parseFloat(h) : parseFloat(v.replace(',', '.')) / 100;
    if (f > 0) { ST.scaleModel(f); V.fitView('iso'); }
  });
  $('btnSubdivide').addEventListener('click', () => {
    if (!S.mesh) return;
    const size = parseFloat($('subdivSize').value);
    busy('Subdividiendo malla…', () => {
      const before = S.mesh.faceParts.length;
      ST.subdivideMesh(size);
      toast(`Malla subdividida: ${before.toLocaleString('es-ES')} → ${S.mesh.faceParts.length.toLocaleString('es-ES')} triángulos`);
    });
  });
  $('showBoundaries').addEventListener('change', (e) => V.setShowBoundaries(e.target.checked));
  $('bgSelect').addEventListener('change', (e) => V.setBackground(e.target.value));

  // vistas
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => V.fitView(b.dataset.view)));
  $('btnSpin').addEventListener('click', (e) => e.currentTarget.classList.toggle('active', V.toggleAutoRotate()));

  // visor
  const canvas = V.domElement();
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', () => { V.showBrush(null); V.setHover(null); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // color activo
  $('btnApplyActive').addEventListener('click', () => {
    if (!S.activeFilament) return toast('Primero elige un color');
    if (!S.selected.size) return toast('Selecciona una o más partes');
    setActive(S.activeFilament, true);
  });

  // exportar
  document.querySelectorAll('[data-export]').forEach((b) =>
    b.addEventListener('click', async () => {
      closeMenus();
      if (!S.mesh) return toast('No hay modelo');
      const kind = b.dataset.export;
      try {
        if (kind === 'png') EX.exportPNG();
        else if (kind === 'copy') { await EX.copyPNG(); toast('Imagen copiada: pégala en el chat de la videollamada'); }
        else if (kind === '3mf') { const n = EX.export3MF(); toast(`3MF exportado con ${n} filamentos pintados`); }
        else if (kind === 'stlzip') EX.exportSTLZip();
        else if (kind === 'sheet') EX.exportSheet();
        else if (kind === 'project') EX.exportProject();
      } catch (e) {
        console.error(e);
        toast(`Error al exportar: ${e.message}`, 5000);
      }
    }),
  );

  // modo cliente
  $('btnPresent').addEventListener('click', togglePresent);

  // teclado
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? ST.redo() : ST.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); ST.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'v') setTool('select');
    else if (k === 'b') setTool('brush');
    else if (k === 'f') setTool('fill');
    else if (k === 'c') setTool('cut');
    else if (k === 'p') togglePresent();
    else if (k === 'escape') ST.select([]);
    else if (k === '[' || k === ']') {
      S.brushRadius = Math.max(0.5, Math.min(30, S.brushRadius * (k === ']' ? 1.25 : 0.8)));
      S.brushRadius = Math.round(S.brushRadius * 2) / 2;
      $('brushRadius').value = S.brushRadius;
      $('brushRadiusOut').textContent = `${S.brushRadius} mm`;
      hint(`Pincel: ${S.brushRadius} mm`);
    } else if (k === 'delete' && S.selected.size) for (const id of [...S.selected]) ST.deletePart(id);
    else if ('1234567'.includes(k)) V.fitView(['iso', 'front', 'back', 'left', 'right', 'top', 'bottom'][+k - 1]);
  });
}

function closeMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
}
function togglePresent() {
  document.body.classList.toggle('present');
  $('btnPresent').classList.toggle('active', document.body.classList.contains('present'));
  V.showBrush(null);
  V.showCutPlane(S.cutZ, false);
  setTimeout(() => V.requestRender(), 50);
}

// ---------------------------------------------------------------- arranque
V.init($('viewport'));
bind();
ST.on('mesh', () => { renderParts(); renderNotes(); setCutZ(S.cutZ || 0); });
ST.on('parts', renderParts);
ST.on('selection', renderParts);
initCatalog((fil) => setActive(fil, true));
initAI();
setTool('select');
window.FS = { S, ST, V, EX }; // para depurar desde la consola
