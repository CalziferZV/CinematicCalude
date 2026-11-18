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
    ST.autoSegment('smart');
    if (S.cleanup) {
      S.notes.unshift(`Se han quitado ${S.cleanup} trocitos sueltos minúsculos que estaban fuera de la pieza (errores del archivo)`);
      renderNotes();
    }
    toast(`${name} cargado · ${S.parts.length} partes detectadas${S.cleanup ? ` · ${S.cleanup} trocitos sueltos eliminados` : ''}`);
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
  if (tool === 'move') syncMove(true);
  else V.stopMove();
  const msg = { select: 'Clic para seleccionar una parte', brush: 'Arrastra sobre la pieza para pintar · botón derecho para girar', fill: 'Clic en una zona para rellenarla', cut: 'Mueve el plano y pulsa «Cortar aquí»', move: S.selected.size ? 'Arrastra las flechas para mover o los aros para girar' : 'Haz clic en la parte que quieras mover' };
  hint(msg[tool]);
}

// Abre/cierra las flechas de mover según la selección
let warnedConnected = false;
function syncMove(fromTool = false) {
  if (S.tool !== 'move' || !S.mesh) return;
  const ids = [...S.selected];
  if (!ids.length) { V.stopMove(); return; }
  V.startMove(ids);
  if (!warnedConnected && ST.partsConnected(ids)) {
    warnedConnected = true;
    toast('Ojo: esta parte está unida a otras. Al moverla se separará de ellas (se puede deshacer).', 5000);
  }
  void fromTool;
}
function setMoveMode(mode) {
  V.setMoveMode(mode);
  document.querySelectorAll('[data-move-mode]').forEach((b) => b.classList.toggle('active', b.dataset.moveMode === mode));
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
    V.setPainting(true);
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
    } else if (S.tool === 'select' || S.tool === 'fill' || S.tool === 'move') {
      if (e.buttons) return;
      const hit = V.pick(e.clientX, e.clientY);
      V.setHover(hit ? hit.partId : null);
    }
  });
}
function onPointerUp(e) {
  if (painting) {
    painting = false;
    V.setPainting(false);
    V.getControls().enabled = true;
    return;
  }
  if (!S.mesh || !downPos || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5;
  downPos = null;
  if (moved || V.isGizmoBusy()) return;
  const hit = V.pick(e.clientX, e.clientY);
  if (S.tool === 'select' || S.tool === 'move') {
    if (!hit) { if (!e.shiftKey) ST.select([]); return; }
    if (S.tool === 'select' && S.activeFilament && (e.altKey || $('clickApply').checked)) {
      ST.setPartFilament([hit.partId], S.activeFilament);
      hint(`${S.activeFilament.name} → ${ST.partById(hit.partId)?.name}`);
      return;
    }
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
  $('btnLayers').addEventListener('click', () => toggleLayers());
  $('layerRange').addEventListener('input', () => updateLayerClip(true));
  $('layerReset').addEventListener('click', () => { $('layerRange').value = 1000; updateLayerClip(false); });

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
        else if (kind === 'compare') EX.exportCompare();
        else if (kind === '3mf') showSlotGuide(EX.export3MF('bambu'), '3mf');
        else if (kind === '3mfpaint') showSlotGuide(EX.export3MF('paint'), '3mfpaint');
        else if (kind === 'obj') showSlotGuide(EX.exportOBJ(), 'obj');
        else if (kind === 'stlzip') EX.exportSTLZip();
        else if (kind === 'sheet') EX.exportSheet();
        else if (kind === 'project') EX.exportProject();
      } catch (e) {
        console.error(e);
        toast(`Error al exportar: ${e.message}`, 5000);
      }
    }),
  );

  // mover / girar
  document.querySelectorAll('[data-move-mode]').forEach((b) => b.addEventListener('click', () => setMoveMode(b.dataset.moveMode)));
  $('moveSnap').addEventListener('change', (e) => V.setMoveSnap(e.target.checked));
  $('btnDropBed').addEventListener('click', () => {
    if (!S.mesh) return;
    const ok = ST.dropToBed([...S.selected]);
    toast(ok ? 'Apoyado en la cama' : 'Ya estaba apoyado en la cama');
  });
  $('btnExplode').addEventListener('click', () => {
    if (!S.mesh) return;
    if (S.parts.length < 2) return toast('Primero divide la pieza en partes');
    busy('Separando partes…', () => {
      ST.explodeParts(0.6);
      V.fitView('iso');
      toast('Partes separadas. Ctrl+Z para volver a juntarlas');
    });
  });

  // guía de colores
  const closeGuide = () => ($('slotModal').hidden = true);
  $('slotClose').addEventListener('click', closeGuide);
  $('slotX').addEventListener('click', closeGuide);
  $('slotModal').addEventListener('click', (e) => { if (e.target.id === 'slotModal') closeGuide(); });
  $('slotCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('slotList').dataset.text || ''); toast('Lista copiada'); } catch { toast('No se pudo copiar'); }
  });

  // modo cliente
  $('btnPresent').addEventListener('click', togglePresent);

  // propuestas
  $('btnSaveVariant').addEventListener('click', () => {
    const n = ST.saveVariant();
    if (n) toast(`Propuesta ${n} guardada. Cambia colores y guarda otra para comparar`);
  });

  // teclado
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('slotModal').hidden) { $('slotModal').hidden = true; return; }
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? ST.redo() : ST.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); ST.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'v') setTool('select');
    else if (k === 'b') setTool('brush');
    else if (k === 'f') setTool('fill');
    else if (k === 'c') setTool('cut');
    else if (k === 'm') setTool('move');
    else if (k === 't' && S.tool === 'move') setMoveMode('translate');
    else if (k === 'r' && S.tool === 'move') setMoveMode('rotate');
    else if (k === 'p') togglePresent();
    else if (k === 'l') toggleLayers();
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

function toggleLayers(force) {
  const on = force ?? $('layerSlider').hidden;
  $('layerSlider').hidden = !on;
  $('btnLayers').classList.toggle('active', on);
  if (!on) V.setClipZ(null);
  else updateLayerClip(false);
}
function updateLayerClip(fromUser) {
  if (!S.mesh || $('layerSlider').hidden) return;
  const b = ST.topo().bbox;
  const H = b.maxZ - b.minZ;
  const v = +$('layerRange').value / 1000;
  const lh = parseFloat($('layerHeight').value) || S.layerHeight || 0.2;
  if (v >= 0.999) { V.setClipZ(null); $('layerLabel').innerHTML = `Todo<br>${Math.ceil(H / lh)} capas`; return; }
  const z = Math.max(lh, Math.round((v * H) / lh) * lh);
  V.setClipZ(b.minZ + z + 1e-4);
  $('layerLabel').innerHTML = `Capa ${Math.round(z / lh)}<br>${z.toFixed(2)} mm`;
  if (fromUser && S.tool === 'cut') setCutZ(z);
}

// ---------------------------------------------------------------- guía: qué color va en cada filamento del laminador
function showSlotGuide(list, kind) {
  const text = [];
  const n = list.length;
  const G = {
    '3mf': {
      title: '3MF para Bambu Studio exportado',
      intro: `El archivo lleva los ${n} colores de cada zona. Al abrirlo, Bambu Studio (versión 2.5 o posterior) te propone crear los filamentos con estos colores:`,
      steps: [
        'Abre el 3MF en Bambu Studio (arrástralo o <b>Archivo → Abrir proyecto</b>). El aviso «El 3mf no es de Bambu Lab, solo se cargan los datos de geometría y color» es normal.',
        `En <b>«Importar modelo: Simplificar colores»</b> comprueba que el <b>recuento de colores</b> sea <b>${n}</b> y pulsa <b>Siguiente</b>.`,
        'En <b>«Coincidencia de filamentos»</b> pulsa <b>«Completar todos los filamentos»</b> para crear filamentos con estos colores exactos (o empareja cada color con tu bobina del AMS) y pulsa <b>Confirmar</b>.',
        'Si no aparece ninguna ventana y la pieza sale de un solo color, tu Bambu Studio es anterior a la 2.5: actualízalo o exporta <b>«3MF pintado»</b> u <b>«OBJ con colores»</b>.',
      ],
    },
    '3mfpaint': {
      title: '3MF pintado exportado',
      intro: 'Cada zona va pintada con el número de filamento de esta lista (OrcaSlicer, Bambu Studio y PrusaSlicer):',
      steps: [
        'Abre el 3MF en OrcaSlicer o Bambu Studio. Si pregunta, acepta cargar la geometría y el color.',
        'En <b>«Filamentos del proyecto»</b> pon en el <b>1, 2, 3…</b> el filamento y color de esta lista (si tienes AMS, elige la bobina correspondiente).',
        'En Bambu Studio 2.5 o posterior es más cómodo <b>«3MF para Bambu Studio»</b>: crea los filamentos con los colores él solo.',
      ],
    },
    obj: {
      title: 'OBJ con colores exportado',
      intro: 'Descomprime el ZIP y deja el .obj y el .mtl juntos. Bambu Studio y OrcaSlicer leen estos colores y te proponen convertirlos en filamentos:',
      steps: [
        'Bambu Studio / OrcaSlicer: <b>Archivo → Importar → Importar 3MF/STL/STEP/SVG/OBJ/AMF</b> y elige el <b>.obj</b>.',
        `En la ventana de colores deja <b>${n}</b> colores y pulsa <b>Siguiente</b>; después <b>«Completar todos los filamentos»</b> (o empareja cada color con tu bobina) y <b>Confirmar</b>.`,
        'Cambia el tipo de filamento (PLA Basic, Matte, Silk…) en «Filamentos del proyecto» si hace falta.',
      ],
    },
  }[kind] || {};
  $('slotTitle').textContent = G.title || 'Exportado';
  $('slotIntro').textContent = G.intro || '';
  $('slotList').innerHTML = list.map((e, i) => {
    const f = e.fil;
    const hex = EX.flatHex(f);
    const label = f.blank ? 'Sin color asignado (elige el que quieras)' : `${f.brandName || ''} · ${f.line || ''} · ${f.name}`;
    const light = parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114 > 150;
    text.push(`Filamento ${i + 1}: ${label} (${hex}${f.code ? `, código ${f.code}` : ''})`);
    return `<div class="slot"><div class="num" style="background:${hex};color:${light ? '#000' : '#fff'}">${i + 1}</div><div class="sw" style="background:${swatchCss(f.blank ? null : f)}"></div><div class="grow"><div class="t1">${escapeHtml(label)}</div><div class="t2">${hex}${f.code ? ` · código ${escapeHtml(f.code)}` : ''} · ${e.parts.map((p) => escapeHtml(p.name)).slice(0, 4).join(', ')}${e.parts.length > 4 ? '…' : ''}</div></div></div>`;
  }).join('');
  $('slotList').dataset.text = text.join('\n');
  $('slotSteps').innerHTML = (G.steps || []).map((x) => `<li>${x}</li>`).join('');
  $('slotModal').hidden = false;
}

// ---------------------------------------------------------------- propuestas A/B/C
function renderVariants() {
  $('variantsBar').hidden = !S.mesh;
  const box = $('variantChips');
  box.innerHTML = '';
  const dirty = ST.variantIsDirty();
  for (const v of S.variants) {
    const el = document.createElement('div');
    const active = v.name === S.activeVariant;
    el.className = 'vchip' + (active ? ' active' : '') + (active && dirty ? ' dirty' : '');
    const fils = [];
    for (const f of Object.values(v.colors)) if (f && !fils.some((x) => x.hex === f.hex && x.name === f.name)) fils.push(f);
    el.title = `Propuesta ${v.name}: ${fils.map((f) => f.name).join(', ') || 'sin colores'}\nClic: aplicar`;
    el.innerHTML = `<span>${v.name}</span><span class="dots">${fils.slice(0, 5).map((f) => `<i style="background:${swatchCss(f)}"></i>`).join('')}</span><button class="upd" title="Guardar los cambios en la propuesta ${v.name}">↻</button><button class="x" title="Borrar la propuesta ${v.name}">×</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.x')) { ST.deleteVariant(v.name); return; }
      if (e.target.closest('.upd')) { ST.updateVariant(v.name); toast(`Propuesta ${v.name} actualizada`); return; }
      ST.applyVariant(v.name);
      hint(`Propuesta ${v.name}`);
    });
    box.appendChild(el);
  }
}

// ---------------------------------------------------------------- autoguardado (por si se recarga la página)
const IDB_NAME = 'filament-studio';
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('autosave');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction('autosave', 'readwrite');
      tx.objectStore('autosave').put(val, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) { console.warn('Autoguardado no disponible', e); }
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    const v = await new Promise((res, rej) => {
      const r = db.transaction('autosave', 'readonly').objectStore('autosave').get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return v;
  } catch { return null; }
}
let autosaveTimer;
function scheduleAutosave() {
  if (!S.mesh) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => idbPut('last', {
    name: S.modelName, pos: S.mesh.pos, faceParts: S.mesh.faceParts, parts: S.parts, nextId: S.nextId, notes: S.notes,
    variants: S.variants, variantSeq: S.variantSeq, savedAt: Date.now(),
  }), 1500);
}
async function offerRecover() {
  const last = await idbGet('last');
  if (!last || !last.pos || S.mesh) return;
  const mins = Math.round((Date.now() - last.savedAt) / 60000);
  const when = mins < 1 ? 'hace un momento' : mins < 60 ? `hace ${mins} min` : mins < 2880 ? `hace ${Math.round(mins / 60)} h` : `hace ${Math.round(mins / 1440)} días`;
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = `↺ Recuperar «${last.name}» (${when})`;
  b.addEventListener('click', () => { V.resetCameraOnNextLoad(); ST.loadProject(last); toast('Trabajo recuperado'); });
  $('recoverBox').appendChild(b);
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
ST.on('mesh', () => { renderParts(); renderNotes(); setCutZ(S.cutZ || 0); updateLayerClip(false); });
let partsQueued = false;
const scheduleParts = () => {
  if (partsQueued) return;
  partsQueued = true;
  requestAnimationFrame(() => { partsQueued = false; renderParts(); });
};
ST.on('parts', scheduleParts);
ST.on('selection', scheduleParts);
ST.on('selection', () => syncMove());
ST.on('parts', () => { renderVariants(); scheduleAutosave(); });
ST.on('mesh', () => { renderVariants(); scheduleAutosave(); });
ST.on('variants', () => { renderVariants(); scheduleAutosave(); });
offerRecover();
initCatalog((fil) => setActive(fil, true));
initAI();
setTool('select');
window.FS = { S, ST, V, EX }; // para depurar desde la consola
