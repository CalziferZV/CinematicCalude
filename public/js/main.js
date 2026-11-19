// Punto de entrada: conecta la interfaz con el estado, el visor, el catálogo y la IA.
import * as ST from './state.js';
import * as V from './viewer.js';
import * as MC from './meshcore.js';
import { initCatalog, filamentKey, setActiveKey, escapeHtml, isFavorite, isOwned, toggleFavorite, toggleOwned, pushRecent, equivalents, ownedSpools } from './catalog.js';
import { loadFile, parseBuffer } from './loaders.js';
import * as EX from './exporters.js';
import { initAI } from './ai.js';
import { swatchCss } from './materials.js';
import * as Q from './quote.js';
import { recordTurntable, videoSupport } from './video.js';
import { onPrefChange, loadPrefs, getPref, setPref } from './prefs.js';

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
    isolated = null;
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
let renamePending = false;
function renderParts() {
  const list = $('partsList');
  // renombrando una parte: no redibujar hasta terminar (se perdería lo que se está escribiendo)
  if (list.querySelector('input.rename')) { renamePending = true; return; }
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
    el.title = `${p.name}${ROLE_LABEL[p.role] ? ` (${ROLE_LABEL[p.role]})` : ''}\n${f.blank ? 'Sin color' : `${f.brandName || ''} · ${f.line || ''} · ${f.name}`}\n${pct}% de la superficie`;
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
      let finished = false;
      const done = (save) => {
        if (finished) return;
        finished = true;
        const v = inp.value.trim();
        inp.remove(); // fuera el cuadro de texto antes de redibujar la lista
        renamePending = false;
        if (save && v && v !== p.name) ST.renamePart(p.id, v);
        renderParts();
      };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); });
      inp.addEventListener('blur', () => done(true));
    });
    el.addEventListener('mouseenter', () => V.setHover(p.id));
    el.addEventListener('mouseleave', () => V.setHover(null));
    list.appendChild(el);
  }
  if (scrollToSelection) {
    scrollToSelection = false;
    list.querySelector('.part.selected')?.scrollIntoView({ block: 'nearest' });
  }
  $('btnIsolate').classList.toggle('active', !!isolated);
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
  const haveSpools = ownedSpools().length > 0;
  for (const { f, ids } of used.values()) {
    const b = document.createElement('div');
    b.className = 'pal';
    const missing = haveSpools && !isOwned(f);
    b.title = `${f.brandName} · ${f.line} · ${f.name} (${f.hex})${missing ? '\n⚠ No está en «Mis bobinas»' : ''}\nClic: seleccionar las partes con este color`;
    b.innerHTML = `<i style="background:${swatchCss(f)}"></i><span>${i++}. ${escapeHtml(f.name)}${missing ? ' <em class="miss">⚠</em>' : ''}</span>`;
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
  pushRecent(fil);
  setActiveKey(filamentKey(fil));
  renderActiveExtras(fil);
  $('activeFil').innerHTML = `<div class="big" style="background:${swatchCss(fil)}"></div><div><div class="t1">${escapeHtml(fil.name)}</div><div class="t2">${escapeHtml(`${fil.brandName} · ${fil.line}`)}<br>${fil.hexes ? fil.hexes.join(' · ') : fil.hex}${fil.code ? ` · ${fil.code}` : ''}</div></div>`;
  if (applyToSelection && S.mesh) {
    if (S.selected.size) {
      ST.setPartFilament([...S.selected], fil);
      toast(`${fil.name} aplicado a ${S.selected.size === 1 ? ST.partById([...S.selected][0])?.name : S.selected.size + ' partes'}`);
    } else hint('Color activo listo: haz clic en una parte para aplicarlo, o usa el pincel / relleno', 3000);
  }
}

// Debajo del color activo: favorito, "la tengo" y colores equivalentes de otras marcas / tus bobinas
let eqToken = 0;
function renderActiveExtras(fil) {
  const box = $('activeExtras');
  if (!fil || fil.blank) { box.innerHTML = ''; return; }
  const fav = isFavorite(fil), own = isOwned(fil);
  box.innerHTML = `<div class="ae-toggles">
      <button class="btn small fav${fav ? ' on' : ''}" id="aeFav" title="Favoritos: siempre a mano encima del catálogo (también con clic derecho en cualquier color)">${fav ? '★ Favorito' : '☆ Favorito'}</button>
      <button class="btn small${own ? ' on' : ''}" id="aeOwn" title="Márcalo si tienes esta bobina en el taller: aparecerá en «Mis bobinas»">${own ? '🧵 La tengo ✓' : '🧵 La tengo'}</button>
    </div><div class="ae-eq" id="aeEq"></div>`;
  // al cambiar la lista, onPrefChange vuelve a dibujar este bloque y la paleta
  $('aeFav').addEventListener('click', () => {
    const on = toggleFavorite(fil);
    toast(on ? `★ ${fil.name} añadido a favoritos` : `${fil.name} quitado de favoritos`);
  });
  $('aeOwn').addEventListener('click', () => {
    const on = toggleOwned(fil);
    toast(on ? `🧵 ${fil.name} añadida a «Mis bobinas»` : `${fil.name} quitada de «Mis bobinas»`);
  });
  const token = ++eqToken;
  equivalents(fil).then(({ mine, others }) => {
    const el = $('aeEq');
    if (token !== eqToken || !el) return;
    const all = [];
    const item = (x, mineCls) => {
      all.push(x.f);
      return `<button class="eq${mineCls ? ' mine' : ''}" data-i="${all.length - 1}" title="${escapeHtml(`${x.f.brandName} · ${x.f.line} · ${x.f.name} (${x.f.hex})\nDiferencia de color ΔE ${x.d.toFixed(1)}: ${x.label}\nClic: usar este color`)}"><i style="background:${swatchCss(x.f)}"></i><span class="eq-n">${escapeHtml(`${x.f.brandName} · ${x.f.name}`)}</span><span class="eq-d">${x.label}</span></button>`;
    };
    let html = '';
    if (!own && mine.length) html += `<div class="ae-t">🧵 Lo más parecido que tienes</div><div class="eq-list">${mine.map((x) => item(x, true)).join('')}</div>`;
    if (others.length) html += `<div class="ae-t"${html ? ' style="margin-top:6px"' : ''}>Equivalentes en otras marcas</div><div class="eq-list">${others.map((x) => item(x, false)).join('')}</div>`;
    el.innerHTML = html;
    el.querySelectorAll('.eq').forEach((b) => b.addEventListener('click', () => setActive(all[+b.dataset.i], true)));
  }).catch(() => {});
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

// Cuentagotas: el siguiente clic en la pieza copia el color de esa parte
let eyedrop = false;
function setEyedrop(on) {
  eyedrop = on && !!S.mesh;
  document.body.classList.toggle('eyedrop', eyedrop);
  if (eyedrop) hint('Cuentagotas: haz clic en una parte para copiar su color (Esc para cancelar)', 4000);
}
function eyedropAt(hit) {
  setEyedrop(false);
  const p = hit && ST.partById(hit.partId);
  if (!p) return;
  if (!p.filament) { hint(`«${p.name}» aún no tiene color`); return; }
  setActive(p.filament, false);
  toast(`💧 Color copiado de «${p.name}»: ${p.filament.name}. Selecciona otra parte y pulsa «Aplicar a selección» (o Alt+clic)`, 4200);
}

// Aislar: ver solo la selección (vuelve a pulsar para ver todo como estaba)
let isolated = null;
function toggleIsolate() {
  if (!S.mesh) return;
  if (isolated) {
    ST.setVisibility(isolated);
    isolated = null;
    hint('Mostrando todas las partes');
    renderParts();
    return;
  }
  if (!S.selected.size) return toast('Selecciona la parte (o partes) que quieres ver sola');
  isolated = new Map(S.parts.map((p) => [p.id, p.visible]));
  ST.setVisibility(new Map(S.parts.map((p) => [p.id, S.selected.has(p.id)])));
  hint('Viendo solo la selección · H o «Aislar» para ver todo');
  renderParts();
}

// Tab: saltar a la siguiente parte sin color (Mayús+Tab: la anterior)
let scrollToSelection = false;
function selectNextUncolored(dir = 1) {
  if (!S.mesh) return;
  const order = S.parts.filter((p) => p.visible);
  if (!order.length) return;
  const pending = order.filter((p) => !p.filament);
  const pool = new Set((pending.length ? pending : order).map((p) => p.id));
  const cur = [...S.selected][0];
  let idx = order.findIndex((p) => p.id === cur);
  if (idx < 0) idx = dir > 0 ? -1 : order.length;
  for (let step = 1; step <= order.length; step++) {
    const p = order[(((idx + dir * step) % order.length) + order.length) % order.length];
    if (!pool.has(p.id)) continue;
    scrollToSelection = true;
    ST.select([p.id]);
    hint(pending.length ? `${p.name} · quedan ${pending.length} ${pending.length === 1 ? 'parte' : 'partes'} sin color` : `${p.name} · todas las partes tienen color ✓`, 2600);
    return;
  }
}

function paintTarget() {
  if (S.selected.size === 1) return [...S.selected][0];
  const fil = S.activeFilament;
  const p = ST.newPart(fil ? `${fil.name}` : `Parte ${S.nextId}`, fil);
  ST.select([p.id]);
  if (fil) V.settleSelection(); // ya pinta con su color: que se vea el color real
  return p.id;
}

let painting = false;
let paintPart = null;
let downPos = null;

function onPointerDown(e) {
  downPos = { x: e.clientX, y: e.clientY };
  if (!S.mesh || e.button !== 0) return;
  if (S.tool === 'brush' && !eyedrop) {
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
    if (S.tool === 'brush' && !eyedrop) {
      const hit = V.pick(e.clientX, e.clientY);
      V.showBrush(hit?.point, hit?.normal, S.brushRadius);
      if (painting && hit) paintAt(hit);
    } else if (eyedrop || S.tool === 'select' || S.tool === 'fill' || S.tool === 'move') {
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
  if (eyedrop) { eyedropAt(hit); return; }
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
      if (fil) V.settleSelection();
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
    if (fil) V.settleSelection();
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
  $('layerHeight').addEventListener('change', (e) => {
    S.layerHeight = parseFloat(e.target.value) || 0.2;
    setCutZ(snapZ(S.cutZ));
    Q.saveSettings({ layerHeight: S.layerHeight }); // misma altura de capa para el presupuesto y las líneas
    V.setLayerLines($('layerLines').checked, S.layerHeight);
  });
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
  $('btnScale').addEventListener('click', openScaleDialog);
  ['scX', 'scY', 'scZ'].forEach((id, axis) => $(id).addEventListener('input', () => scaleFromAxis(axis, $(id).value)));
  $('scP').addEventListener('input', () => {
    const k = parseFloat(String($('scP').value).replace(',', '.')) / 100;
    if (k > 0) setScaleFactors([k, k, k], 'scP');
  });
  $('scLock').addEventListener('change', () => { if ($('scLock').checked) setScaleFactors([scaleF[2], scaleF[2], scaleF[2]]); });
  document.querySelectorAll('[data-scp]').forEach((b) => b.addEventListener('click', () => { const k = +b.dataset.scp / 100; setScaleFactors([k, k, k]); }));
  $('scApply').addEventListener('click', applyScale);
  $('scaleModal').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyScale(); } });
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
  $('layerLines').addEventListener('change', (e) => {
    setPref('layerLines', e.target.checked);
    V.setLayerLines(e.target.checked, S.layerHeight);
    if (e.target.checked) hint('Acércate a la pieza para ver las líneas de capa', 3000);
  });
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
        if (kind === 'openbambu' || kind === 'openorca') await openInSlicer(kind === 'openbambu' ? 'bambu' : 'orca');
        else if (kind === 'video') openVideoDialog();
        else if (kind === 'png') EX.exportPNG();
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

  // vídeo 360°
  $('videoStart').addEventListener('click', startVideo);
  const cancelVideo = () => { if (videoAbort) videoAbort.abort(); else $('videoModal').hidden = true; };
  $('videoCancel').addEventListener('click', cancelVideo);
  $('videoCancel0').addEventListener('click', cancelVideo);
  $('videoX').addEventListener('click', cancelVideo);

  // presupuesto
  $('btnQuote').addEventListener('click', () => toggleQuote());
  $('quoteClose').addEventListener('click', () => toggleQuote(false));
  $('priceChip').addEventListener('click', () => toggleQuote(true));
  $('qShowClient').addEventListener('change', (e) => Q.saveSettings({ showClient: e.target.checked }));
  $('qCopy').addEventListener('click', async () => {
    const q = lastQuote || (S.mesh && Q.computeQuote());
    if (!q) return toast('Abre un modelo primero');
    try { await navigator.clipboard.writeText(Q.clientMessage(q)); toast('Mensaje copiado: pégalo en WhatsApp'); } catch { toast('No se pudo copiar'); }
  });

  // atajos, cuentagotas, aislar
  $('btnHelp').addEventListener('click', () => ($('helpModal').hidden = false));
  $('btnEyedrop').addEventListener('click', () => setEyedrop(!eyedrop));
  $('btnIsolate').addEventListener('click', toggleIsolate);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ($(b.dataset.close).hidden = true)));
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m && m.id !== 'videoModal') m.hidden = true; }));

  // propuestas
  $('btnSaveVariant').addEventListener('click', () => {
    const n = ST.saveVariant();
    if (n) toast(`Propuesta ${n} guardada. Cambia colores y guarda otra para comparar`);
  });

  // teclado
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = [...document.querySelectorAll('.modal')].reverse().find((m) => !m.hidden);
      if (open) { if (open.id !== 'videoModal') open.hidden = true; return; }
      if (eyedrop) { setEyedrop(false); return; }
    }
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if ([...document.querySelectorAll('.modal')].some((m) => !m.hidden)) return;
      e.preventDefault();
      selectNextUncolored(e.shiftKey ? -1 : 1);
      return;
    }
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
    else if (k === 'i') setEyedrop(!eyedrop);
    else if (k === 'h') toggleIsolate();
    else if (k === 's') openScaleDialog();
    else if (k === 'q') toggleQuote();
    else if (k === '?') $('helpModal').hidden = false;
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

// ---------------------------------------------------------------- abrir en el laminador
async function openInSlicer(slicer) {
  const name = slicer === 'bambu' ? 'Bambu Studio' : 'OrcaSlicer';
  await busy(`Abriendo ${name}…`, async () => {
    const r = await EX.openInSlicer(slicer);
    const where = r.file ? `Guardado en: ${r.file}` : '';
    if (r.launched === 'slicer') toast(`Abriendo ${name}… ${where}`, 6000);
    else if (r.launched === 'default') toast(`No encuentro ${name} instalado: lo abro con el programa predeterminado. ${where}`, 8000);
    else toast(`No encuentro ${name}: te abro la carpeta con el archivo. ${where}`, 8000);
    showSlotGuide(r.list, slicer === 'bambu' ? '3mf' : '3mfpaint', r);
  });
}

// ---------------------------------------------------------------- vídeo 360°
let videoAbort = null;
function openVideoDialog() {
  const sup = videoSupport();
  if (!sup) return toast('Este navegador no puede grabar vídeo. Abre la app en Chrome o Edge.', 5000);
  $('videoOpts').hidden = false;
  $('videoProgress').hidden = true;
  $('videoStart').textContent = `● Grabar ${sup.ext.toUpperCase()}`;
  $('videoModal').hidden = false;
}
async function startVideo() {
  const [w, h] = $('videoFormat').value.split('x').map(Number);
  const seconds = +$('videoSecs').value;
  $('videoOpts').hidden = true;
  $('videoProgress').hidden = false;
  $('videoBar').style.width = '0%';
  $('videoText').textContent = 'Grabando la vuelta… no cambies de pestaña hasta que termine.';
  videoAbort = new AbortController();
  try {
    const r = await recordTurntable({
      width: w, height: h, seconds, caption: $('videoCaption').checked, signal: videoAbort.signal,
      onProgress: (k) => { $('videoBar').style.width = `${Math.round(k * 100)}%`; },
    });
    if (!r) { toast('Vídeo cancelado'); return; }
    const base = (S.modelName || 'modelo').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob);
    a.download = `${base}_360.${r.ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast(r.ext === 'mp4' ? `Vídeo listo (${(r.blob.size / 1048576).toFixed(1)} MB): envíalo por WhatsApp` : 'Vídeo listo en WebM. Si WhatsApp no lo acepta como vídeo, envíalo como documento.', 6000);
  } catch (e) {
    console.error(e);
    toast(`No se pudo grabar el vídeo: ${e.message}`, 6000);
  } finally {
    videoAbort = null;
    $('videoModal').hidden = true;
  }
}

// ---------------------------------------------------------------- presupuesto instantáneo
let quoteTimer = 0;
let lastQuote = null;
function scheduleQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(updateQuote, 250);
}
function updateQuote() {
  try { lastQuote = S.mesh ? Q.computeQuote() : null; } catch (e) { console.error(e); lastQuote = null; }
  const chip = $('priceChip');
  chip.hidden = !lastQuote;
  if (lastQuote) chip.innerHTML = Q.chipHtml(lastQuote);
  if (!$('quotePanel').hidden) Q.renderPanel($('quoteBody'), lastQuote);
  const set = Q.settings();
  $('qShowClient').checked = !!set.showClient;
  document.body.classList.toggle('show-price', !!set.showClient);
}
function toggleQuote(force) {
  const on = force ?? $('quotePanel').hidden;
  $('quotePanel').hidden = !on;
  $('btnQuote').classList.toggle('active', on);
  if (on) { clearTimeout(quoteTimer); updateQuote(); }
}

// ---------------------------------------------------------------- tamaño en mm
let scaleBase = [1, 1, 1];
let scaleF = [1, 1, 1];
function openScaleDialog() {
  if (!S.mesh) return toast('Primero abre un modelo');
  const b = ST.topo().bbox;
  scaleBase = [b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ];
  $('scLock').checked = true;
  setScaleFactors([1, 1, 1]);
  $('scaleModal').hidden = false;
  setTimeout(() => { $('scZ').focus(); $('scZ').select(); }, 30);
}
function scaleFromAxis(axis, value) {
  const v = parseFloat(String(value).replace(',', '.'));
  if (!(v > 0)) return;
  const k = v / scaleBase[axis];
  if ($('scLock').checked) setScaleFactors([k, k, k], ['scX', 'scY', 'scZ'][axis]);
  else { const f = scaleF.slice(); f[axis] = k; setScaleFactors(f, ['scX', 'scY', 'scZ'][axis]); }
}
let scaleRaf = 0;
function setScaleFactors(f, skip) {
  scaleF = f;
  ['scX', 'scY', 'scZ'].forEach((id, i) => { if (id !== skip) $(id).value = +(scaleBase[i] * f[i]).toFixed(1); });
  const uniform = Math.abs(f[0] - f[1]) < 1e-6 && Math.abs(f[1] - f[2]) < 1e-6;
  if (skip !== 'scP') $('scP').value = uniform ? +(f[0] * 100).toFixed(1) : '';
  cancelAnimationFrame(scaleRaf);
  scaleRaf = requestAnimationFrame(() => {
    const size = scaleBase.map((v, i) => v * f[i]);
    const max = Math.max(...size);
    let html = '';
    try {
      const q = Q.computeQuote({ scale: f });
      if (q) html = `Con este tamaño: <b>${Q.eur(q.price)}</b> · ${Q.grams(q.grams + q.purgeGrams)} · ${Q.duration(q.hours)}${lastQuote && Math.abs(q.price - lastQuote.price) > 0.001 ? ` <span class="muted">(ahora ${Q.eur(lastQuote.price)})</span>` : ''}`;
    } catch (e) { console.error(e); }
    if (max > 256) html += '<br>⚠ Más de 256 mm: no cabe en la cama de una Bambu Lab X1, P1 o A1 (habría que partirla).';
    else if (max > 180) html += '<br>Ojo: más de 180 mm no cabe en una A1 mini.';
    $('scQuote').innerHTML = html;
  });
}
function applyScale() {
  const f = scaleF;
  $('scaleModal').hidden = true;
  if (f.some((v) => !(v > 0)) || f.every((v) => Math.abs(v - 1) < 1e-6)) return;
  busy('Cambiando el tamaño…', () => {
    ST.scaleModelXYZ(f[0], f[1], f[2]);
    V.fitView('iso');
    const b = ST.topo().bbox;
    toast(`Nuevo tamaño: ${(b.maxX - b.minX).toFixed(1)} × ${(b.maxY - b.minY).toFixed(1)} × ${(b.maxZ - b.minZ).toFixed(1)} mm`);
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
function showSlotGuide(list, kind, opened = null) {
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
  $('slotTitle').textContent = opened ? `Abriendo en ${opened.slicer}` : G.title || 'Exportado';
  $('slotIntro').textContent = (opened && opened.file ? `Archivo guardado en ${opened.file}. ` : '') + (G.intro || '');
  $('slotList').innerHTML = list.map((e, i) => {
    const f = e.fil;
    const hex = EX.flatHex(f);
    const label = f.blank ? 'Sin color asignado (elige el que quieras)' : `${f.brandName || ''} · ${f.line || ''} · ${f.name}`;
    const light = parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114 > 150;
    text.push(`Filamento ${i + 1}: ${label} (${hex}${f.code ? `, código ${f.code}` : ''})`);
    return `<div class="slot"><div class="num" style="background:${hex};color:${light ? '#000' : '#fff'}">${i + 1}</div><div class="sw" style="background:${swatchCss(f.blank ? null : f)}"></div><div class="grow"><div class="t1">${escapeHtml(label)}</div><div class="t2">${hex}${f.code ? ` · código ${escapeHtml(f.code)}` : ''} · ${e.parts.map((p) => escapeHtml(p.name)).slice(0, 4).join(', ')}${e.parts.length > 4 ? '…' : ''}</div></div></div>`;
  }).join('');
  $('slotList').dataset.text = text.join('\n');
  const steps = (G.steps || []).slice();
  if (opened && steps.length) {
    const n = escapeHtml(opened.slicer);
    steps[0] = opened.launched === 'slicer'
      ? `${n} se está abriendo con el archivo (puede tardar unos segundos). ${kind === '3mf' ? 'El aviso «El 3mf no es de Bambu Lab, solo se cargan los datos de geometría y color» es normal.' : ''}`
      : opened.launched === 'default'
        ? `No he encontrado ${n} instalado en su carpeta habitual: el archivo se ha abierto con el programa que Windows usa para los .3mf. Si no es ${n}, ábrelo desde ${n} con <b>Archivo → Abrir proyecto</b>.`
        : `Te he abierto la carpeta con el archivo: arrástralo a la ventana de ${n}.`;
  }
  $('slotSteps').innerHTML = steps.map((x) => `<li>${x}</li>`).join('');
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
  b.addEventListener('click', () => { isolated = null; V.resetCameraOnNextLoad(); ST.loadProject(last); toast('Trabajo recuperado'); });
  $('recoverBox').appendChild(b);
}

function closeMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
}
function togglePresent() {
  document.body.classList.toggle('present');
  const on = document.body.classList.contains('present');
  $('btnPresent').classList.toggle('active', on);
  V.setPresentMode(on); // el cliente ve los colores reales, sin contornos ni brillos
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
initCatalog((fil) => setActive(fil, true), { notify: toast });
loadPrefs().then(() => {
  // altura de capa compartida (presupuesto, cortes, líneas de capa) y líneas de capa guardadas
  S.layerHeight = Q.settings().layerHeight || 0.2;
  $('layerHeight').value = S.layerHeight;
  $('layerLines').checked = !!getPref('layerLines', false);
  V.setLayerLines($('layerLines').checked, S.layerHeight);
  updateQuote();
});
ST.on('parts', scheduleQuote);
ST.on('mesh', scheduleQuote);
onPrefChange((k) => {
  if (k === 'quote' || k === 'spools') scheduleQuote();
  // favorito / bobina cambiados desde el catálogo (clic derecho): refrescar el color activo y la paleta
  if ((k === 'favorites' || k === 'spools') && S.activeFilament) renderActiveExtras(S.activeFilament);
  if (k === 'spools') renderPalette();
  if (k === 'quote') {
    const lh = Q.settings().layerHeight;
    if (lh > 0 && Math.abs(lh - S.layerHeight) > 1e-9) {
      S.layerHeight = lh;
      $('layerHeight').value = lh;
      V.setLayerLines($('layerLines').checked, lh);
    }
  }
});
initAI();
setTool('select');
window.FS = { S, ST, V, EX, Q, VID: { recordTurntable, videoSupport } }; // para depurar desde la consola
