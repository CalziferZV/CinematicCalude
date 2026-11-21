// Punto de entrada: conecta la interfaz con el estado, el visor, el catálogo y la IA.
import * as ST from './state.js';
import * as V from './viewer.js';
import * as MC from './meshcore.js';
import * as CUT from './cut.js';
import { initCatalog, filamentKey, setActiveKey, escapeHtml, isFavorite, isOwned, toggleFavorite, toggleOwned, pushRecent, equivalents, ownedSpools } from './catalog.js';
import { loadFile, parseBuffer } from './loaders.js';
import * as EX from './exporters.js';
import { initAI } from './ai.js';
import { swatchCss } from './materials.js';
import * as Q from './quote.js';
import { recordTurntable, videoSupport } from './video.js';
import { onPrefChange, loadPrefs, getPref, setPref } from './prefs.js';
import { startTour, maybeStartTour, tourOpen } from './tour.js';
import * as TXT from './text3d.js';

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
  if (!applyToSelection || !S.mesh) return;
  if (S.tool === 'brush' || S.tool === 'fill') {
    // pintando, elegir otro color es cambiar de pincel: lo ya pintado se queda como está
    hint(`Pintando en ${fil.name}: va a su propia capa · «Aplicar a selección» cambia la parte seleccionada`, 3500);
    return;
  }
  applyToSelection_(fil);
}
function applyToSelection_(fil) {
  if (S.selected.size) {
    ST.setPartFilament([...S.selected], fil);
    toast(`${fil.name} aplicado a ${S.selected.size === 1 ? ST.partById([...S.selected][0])?.name : S.selected.size + ' partes'}`);
  } else hint('Color activo listo: haz clic en una parte para aplicarlo, o usa el pincel / relleno', 3000);
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
  if (tool === 'split') enterSplit();
  else leaveSplit();
  if (tool === 'text') refreshTextPreview();
  else V.setTextPreview(null);
  const msg = { select: 'Clic para seleccionar una parte', brush: 'Arrastra sobre la pieza para pintar · botón derecho para girar', fill: 'Clic en una zona para rellenarla', cut: 'Capas: mueve el plano y pulsa «Cortar aquí» para dividir el color por altura', move: S.selected.size ? 'Arrastra las flechas para mover o los aros para girar' : 'Haz clic en la parte que quieras mover', split: 'Coloca el plano (flecha, aros o botones) y pulsa «✂ Cortar aquí»', text: 'Escribe el texto y haz clic en la pieza donde quieras ponerlo' };
  hint(msg[tool], 3500);
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

// A qué parte van las caras que se pintan con el pincel o el relleno: a la capa del color activo.
//  - si la parte seleccionada ya es de ese color (o no hay color activo), se sigue pintando en ella
//  - una parte vacía recién creada con «+ Nueva parte» se queda con el color activo
//  - si no, va a la capa que ya se pintó antes con ese color o a una parte nueva con él
// Así, pintar en negro después de pintar el collar en rosa crea otra capa y el collar sigue rosa.
const paintLayers = new Map(); // color -> parte que se creó al pintar con él
const sameColor = (a, b) => filamentKey(a) === filamentKey(b);
function paintTarget() {
  const fil = S.activeFilament;
  const sel = S.selected.size === 1 ? ST.partById([...S.selected][0]) : null;
  if (sel && (!fil || sameColor(sel.filament, fil))) return sel.id;
  if (sel && !sel.filament && !ST.partFaceCounts().get(sel.id)) {
    sel.filament = { ...fil };
    ST.emit('parts');
    ST.emit('filament', [sel.id]);
    paintLayers.set(filamentKey(fil), sel.id);
    return sel.id;
  }
  if (fil) {
    const prev = ST.partById(paintLayers.get(filamentKey(fil)));
    if (prev && prev.visible && sameColor(prev.filament, fil)) {
      ST.select([prev.id]);
      return prev.id;
    }
  }
  const p = ST.newPart(fil ? `${fil.name}` : `Parte ${S.nextId}`, fil);
  if (fil) paintLayers.set(filamentKey(fil), p.id);
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
    } else if (S.tool === 'text' && !eyedrop) {
      if (e.buttons) { V.moveTextPreview(null); return; }
      const hit = V.pick(e.clientX, e.clientY);
      V.moveTextPreview(hit && TXTS.local ? TXT.textMatrix([hit.point.x, hit.point.y, hit.point.z], [hit.normal.x, hit.normal.y, hit.normal.z], V.viewUp()) : null);
    } else if (eyedrop || S.tool === 'select' || S.tool === 'fill' || S.tool === 'move' || S.tool === 'split') {
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
  if (S.tool === 'split' && !eyedrop && splitClick(e)) return;
  const hit = V.pick(e.clientX, e.clientY);
  if (S.tool === 'text' && !eyedrop) { placeTextAt(hit); return; }
  if (eyedrop) { eyedropAt(hit); return; }
  if (S.tool === 'select' || S.tool === 'move' || S.tool === 'split') {
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

// ---------------------------------------------------------------- cortar en piezas (plano libre + anclajes automáticos)
const SPL = { plane: null, ref: null, an: null, conns: [], warnings: [], note: '', targets: null, timer: 0, raf: 0, mesh: null };
const DOWEL_SIZES = [3, 4, 5, 6, 8, 10, 12];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fmtMM = (v) => (Math.round(v * 10) / 10).toLocaleString('es-ES');

function splitOpts() {
  const type = $('connType').value;
  const sz = $('connSize').value;
  const opts = { type, clearance: parseFloat($('connFit').value) || 0.15 };
  if (type === 'magnet') opts.magnet = sz ? sz.split('x').map(Number) : null;
  else opts.size = sz ? +sz : null;
  return opts;
}
function fillConnSizes() {
  const type = $('connType').value;
  const sel = $('connSize');
  const prev = sel.value;
  const list = type === 'magnet' ? CUT.MAGNETS.map(([d, h]) => [`${d}x${h}`, `${d} × ${h} mm`]) : DOWEL_SIZES.map((d) => [String(d), `Ø${d} mm`]);
  sel.innerHTML = '<option value="">Auto</option>' + list.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  sel.disabled = type === 'none';
  $('connFit').disabled = type === 'none' || type === 'magnet';
}
// Qué se corta: las piezas de la selección (si ya hay varias piezas) o todo
function splitTargetsNow() {
  if (!S.mesh || ST.pieceCount() < 2 || !S.selected.size) return null;
  return ST.piecesOfParts([...S.selected]);
}
function splitMask() {
  const t = SPL.targets;
  if (!t || !S.mesh) return null;
  const fpc = S.mesh.facePiece;
  return (f) => t.has(fpc[f]);
}
function splitBox() {
  const mask = splitMask(), P = S.mesh.pos;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let f = 0, n = P.length / 9; f < n; f++) {
    if (mask && !mask(f)) continue;
    for (let k = 0; k < 9; k += 3) for (let a = 0; a < 3; a++) { const v = P[f * 9 + k + a]; if (v < b[a]) b[a] = v; if (v > b[a + 3]) b[a + 3] = v; }
  }
  return b;
}
// Lados del plano en palabras (para los mensajes)
function sideWords(n) {
  if (Math.abs(n[2]) > 0.7) return n[2] > 0 ? ['arriba', 'abajo'] : ['abajo', 'arriba'];
  return ['lado de la flecha', 'otro lado'];
}

// Coloca el plano: 'sel' (justo en el borde de la selección), 'z' horizontal, 'x' / 'y' verticales
function placeSplitPlane(kind) {
  if (!S.mesh) return;
  SPL.targets = splitTargetsNow();
  SPL.note = '';
  let plane = null;
  if (kind === 'sel') {
    if (!S.selected.size) {
      toast('Selecciona primero la parte que quieres separar (clic en ella) y vuelve a pulsar «A la selección»', 4500);
      kind = 'z';
    } else {
      const fit = CUT.fitPlaneToParts(S.mesh.pos, ST.topo(), S.mesh.faceParts, new Set(S.selected));
      const names = [...S.selected].map((id) => ST.partById(id)?.name).filter(Boolean).join(', ');
      if (fit) {
        // el mismo plano, con el centro a la altura de la selección (ahí aparece la flecha)
        const sb = ST.partsBBox([...S.selected]);
        const cs = [(sb.minX + sb.maxX) / 2, (sb.minY + sb.maxY) / 2, (sb.minZ + sb.maxZ) / 2];
        const d = vdot([cs[0] - fit.o[0], cs[1] - fit.o[1], cs[2] - fit.o[2]], fit.n);
        plane = { o: [cs[0] - d * fit.n[0], cs[1] - d * fit.n[1], cs[2] - d * fit.n[2]], n: fit.n };
        SPL.note = fit.planar ? `Corte ajustado al borde de «${names}».` : `El borde de «${names}» no es plano: el corte es una aproximación.`;
      } else {
        toast(`No encuentro dónde se une «${names}» con el resto: pongo un corte horizontal`, 4500);
        kind = 'z';
      }
    }
  }
  if (!plane) {
    const b = splitBox();
    plane = { o: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], n: kind === 'x' ? [1, 0, 0] : kind === 'y' ? [0, 1, 0] : [0, 0, 1] };
  }
  setSplitPlane(plane, { resetRef: true, show: true });
}
function setSplitPlane(plane, { resetRef = false, show = false, fromGizmo = false } = {}) {
  SPL.plane = { o: [...plane.o], n: CUT.normalize(plane.n) };
  if (resetRef || !SPL.ref) {
    SPL.ref = { o: [...SPL.plane.o], n: [...SPL.plane.n] };
    const [lo, hi] = CUT.extentAlong(S.mesh.pos, SPL.ref.o, SPL.ref.n, splitMask());
    $('splitOff').min = lo.toFixed(2);
    $('splitOff').max = hi.toFixed(2);
  }
  syncSplitSlider();
  if (show || !V.getSplitPlane()) V.showSplit(SPL.plane, { onChange: onSplitGizmo });
  else if (!fromGizmo) V.setSplitPlane(SPL.plane);
  updateSplitLines();
  scheduleSplitAnalysis();
}
function syncSplitSlider() {
  const p = SPL.plane, r = SPL.ref;
  const off = vdot([p.o[0] - r.o[0], p.o[1] - r.o[1], p.o[2] - r.o[2]], r.n);
  $('splitOff').value = off;
  $('splitOffNum').value = off.toFixed(1);
  // en cortes horizontales, la altura desde la cama
  $('splitOffOut').textContent = Math.abs(p.n[2]) > 0.999 ? `a ${fmtMM(p.o[2] - ST.topo().bbox.minZ)} mm de la cama` : '';
}
function moveSplitTo(off) {
  if (!S.mesh) return;
  if (!SPL.plane) placeSplitPlane('z');
  const r = SPL.ref;
  setSplitPlane({ o: [r.o[0] + r.n[0] * off, r.o[1] + r.n[1] * off, r.o[2] + r.n[2] * off], n: r.n });
}
function onSplitGizmo(plane, { final }) {
  const tilted = vdot(plane.n, SPL.ref ? SPL.ref.n : plane.n) < 0.99999;
  SPL.plane = { o: plane.o, n: plane.n };
  if (final) { setSplitPlane(plane, { resetRef: tilted, fromGizmo: true }); return; }
  if (!tilted) syncSplitSlider();
  V.setSplitPreview({ connectors: [] });
  V.setSplitFill(null);
  updateSplitLines();
}
function updateSplitLines() {
  if (SPL.raf) return;
  SPL.raf = requestAnimationFrame(() => {
    SPL.raf = 0;
    if (!SPL.plane || !S.mesh) return;
    V.setSplitPreview({ lines: CUT.sectionLines(S.mesh.pos, SPL.plane, splitMask()) });
  });
}
function scheduleSplitAnalysis(delay = 140) {
  clearTimeout(SPL.timer);
  V.setSplitPreview({ connectors: [] });
  V.setSplitFill(null);
  SPL.timer = setTimeout(() => runSplitAnalysis(), delay);
}
function runSplitAnalysis() {
  clearTimeout(SPL.timer);
  if (!SPL.plane || !S.mesh || S.tool !== 'split') return;
  SPL.an = CUT.analyzeCut(S.mesh.pos, SPL.plane, { faceMask: splitMask() });
  const r = CUT.autoConnectors(SPL.an, splitOpts());
  SPL.conns = r.list;
  SPL.warnings = r.warnings;
  renderSplitPreview();
  renderSplitInfo();
}
function renderSplitPreview() {
  const an = SPL.an;
  V.setSplitFill(an);
  if (!an || an.empty) { V.setSplitPreview({ connectors: [] }); return; }
  V.setSplitPreview({
    connectors: SPL.conns.map((c) => {
      const f = CUT.connectorFeatures(c);
      const segs = [];
      for (const s of [1, -1]) {
        const ft = f[s];
        if (!ft) continue;
        if (ft.kind === 'hole') segs.push({ from: 0, to: s * ft.depth, R: (ft.r + ft.ch) / Math.cos(Math.PI / ft.m), m: ft.m, phase: ft.phase });
        else segs.push({ from: 0, to: -s * ft.height, R: ft.r * 0.92, m: ft.m, phase: ft.phase });
      }
      return { c: CUT.planeToWorld(an, c.u, c.v), n: an.plane.n, U: an.U, V: an.V, segs, kind: c.type, ok: CUT.connectorWall(an, c) >= 0.6 };
    }),
  });
}
function renderSplitInfo() {
  const box = $('splitInfo');
  const items = [];
  const an = SPL.an;
  if (!SPL.plane) {
    $('splitOffOut').textContent = '';
    box.innerHTML = '<div>Elige dónde cortar: ◎ a la selección, horizontal o vertical (o arrastra la flecha).</div>';
    $('btnSplitApply').disabled = true;
    return;
  }
  if (SPL.note) items.push(`<div>${escapeHtml(SPL.note)}</div>`);
  if (!an || an.empty) {
    items.push('<div class="warn">El plano no atraviesa la pieza: muévelo hasta que corte el modelo.</div>');
    box.innerHTML = items.join('');
    $('btnSplitApply').disabled = true;
    return;
  }
  $('btnSplitApply').disabled = false;
  const tgt = SPL.targets ? (SPL.targets.size === 1 ? 'solo la pieza de la selección' : `${SPL.targets.size} piezas`) : 'toda la pieza';
  items.push(`<div>Sección de ${Math.round(an.areaSection).toLocaleString('es-ES')} mm² · se corta ${tgt}</div>`);
  const [sp, sn] = sideWords(an.plane.n);
  const groups = new Map();
  for (const c of SPL.conns) {
    const k = `${c.type}|${c.d}|${c.h}|${c.shape}|${c.depthPos}|${c.depthNeg}|${c.pinSide}`;
    const g = groups.get(k) || { c, n: 0, wall: Infinity };
    g.n++;
    g.wall = Math.min(g.wall, CUT.connectorWall(an, c));
    groups.set(k, g);
  }
  for (const { c, n, wall } of groups.values()) {
    const sq = c.shape === 'square' ? ' cuadrado' + (n > 1 ? 's' : '') : '';
    let txt;
    if (c.type === 'magnet') txt = `${n} ${n > 1 ? 'imanes' : 'imán'} de ${c.d} × ${c.h} mm (huecos de ${fmtMM(c.d + 0.2)} × ${fmtMM(c.h + 0.2)} mm a cada lado)`;
    else if (c.type === 'plug') {
      const from = c.pinSide > 0 ? sp : sn;
      txt = `${n} ${n > 1 ? 'espigas' : 'espiga'}${sq} Ø${c.d} de ${fmtMM(Math.max(c.depthPos, c.depthNeg) - 0.4)} mm (salen de la pieza de ${from})`;
    } else txt = `${n} ${n > 1 ? 'pasadores' : 'pasador'}${sq} Ø${c.d} · ${fmtMM(c.depthPos)} mm ${sp} y ${fmtMM(c.depthNeg)} mm ${sn}`;
    items.push(`<div class="${wall >= 0.6 ? 'ok' : 'warn'}">${txt} · pared ${wall >= 0.6 ? '≥ ' + fmtMM(wall) : 'fina: ' + fmtMM(Math.max(0, wall))} mm</div>`);
  }
  if (!SPL.conns.length && $('connType').value !== 'none' && !SPL.warnings.length) items.push('<div class="warn">No caben anclajes aquí. Prueba «🔎 Mejor sitio» o pega las piezas.</div>');
  for (const w of SPL.warnings) items.push(`<div class="warn">${escapeHtml(w)}</div>`);
  if (SPL.warnings.some((w) => /fina/.test(w))) items.push('<div>Consejo: «🔎 Mejor sitio» busca cerca una zona más gruesa.</div>');
  box.innerHTML = items.join('');
}

// Clic en la cara del corte: añadir o quitar un anclaje. Devuelve true si el clic era para eso.
function splitClick(e) {
  if (!SPL.plane || !SPL.an || SPL.an.empty) return false;
  const hp = V.pickSplitPlane(e.clientX, e.clientY);
  if (!hp || hp.blocked) return false;
  const [u, v] = CUT.worldToPlane(SPL.an, hp.point);
  const p = CUT.uvToPixel(SPL.an, u, v);
  if (p < 0 || !SPL.an.contact[p]) return false;
  const near = SPL.conns.findIndex((c) => Math.hypot(c.u - u, c.v - v) < CUT.connectorRadius(c) + 1);
  if (near >= 0) {
    SPL.conns.splice(near, 1);
    hint('Anclaje quitado');
  } else {
    const o = splitOpts();
    if (o.type === 'none') { hint('Elige arriba un tipo de anclaje'); return true; }
    const ref = SPL.conns.find((c) => c.type !== 'magnet');
    const magRef = SPL.conns.find((c) => c.type === 'magnet');
    const c = CUT.manualConnector(SPL.an, u, v, { ...o, size: o.size || (ref ? ref.d : 5), magnet: o.magnet || (magRef ? [magRef.d, magRef.h] : [6, 3]) });
    if (!c) { hint('Haz clic dentro de la cara del corte'); return true; }
    if (SPL.conns.some((k) => Math.hypot(k.u - c.u, k.v - c.v) < CUT.connectorRadius(k) + CUT.connectorRadius(c) + 0.5)) { hint('Demasiado cerca de otro anclaje'); return true; }
    c.id = Date.now();
    SPL.conns.push(c);
    const wall = CUT.connectorWall(SPL.an, c);
    hint(wall < 0.6 ? `Ojo: aquí la pared queda muy fina (${fmtMM(Math.max(0, wall))} mm)` : 'Anclaje añadido', 3000);
  }
  renderSplitPreview();
  renderSplitInfo();
  return true;
}

async function applySplit() {
  if (!S.mesh) return;
  if (!SPL.plane || !SPL.an || SPL.an.empty) return toast('Coloca el plano atravesando la pieza');
  await busy('Cortando…', () => {
    const r = ST.cutPieces(SPL.plane, SPL.conns, { targetPieces: SPL.targets });
    if (!r.ok) return toast(r.reason || 'No se ha podido cortar', 4000);
    const bodies = r.created.filter((c) => c.kind === 'body').length + 1;
    const dowels = r.created.filter((c) => c.kind === 'dowel').length;
    const pins = r.placed.filter((c) => c.type === 'plug').length, mags = r.placed.filter((c) => c.type === 'magnet').length;
    SPL.plane = null;
    SPL.an = null;
    SPL.conns = [];
    SPL.note = '';
    $('splitClip').checked = false;
    V.hideSplit();
    renderSplitInfo();
    renderPieces();
    const extra = dowels ? ` + ${dowels} pasadores` : pins ? ` con ${pins} espigas` : mags ? ` con huecos para ${mags} imanes` : '';
    toast(`Cortado en ${bodies} piezas${extra}. «✣ Separar» para ver el encaje · «⤓ Colocar para imprimir» para el laminador`, 7000);
    if (r.warnings.length) setTimeout(() => toast(r.warnings.join(' '), 6000), 7200);
  });
}

// Busca cerca del plano una zona donde quepan mejor los anclajes (más gruesa, sin escalones)
async function findBetterSplit() {
  if (!S.mesh || !SPL.plane) return toast('Primero coloca el plano');
  const o = splitOpts();
  if (o.type === 'none') return toast('Elige un tipo de anclaje');
  const best = await busy('Buscando la mejor zona para los anclajes…', () => CUT.searchBetterPlane(S.mesh.pos, SPL.plane, { faceMask: splitMask(), opts: o }));
  if (!best) return toast('No encuentro cerca ninguna zona donde quepan anclajes: prueba otro corte o pega las piezas', 5000);
  if (Math.abs(best.offset) < 1e-6) { runSplitAnalysis(); return toast('Este ya es el mejor sitio cercano'); }
  SPL.note = '';
  setSplitPlane(best.plane);
  toast(`Corte movido ${best.offset > 0 ? '+' : '−'}${fmtMM(Math.abs(best.offset))} mm: aquí caben ${best.count} anclajes`, 4500);
}

function enterSplit() {
  if (!S.mesh) return;
  if (!$('layerSlider').hidden) toggleLayers(false); // la vista por capas también recorta: una cosa u otra
  if (SPL.plane) { V.showSplit(SPL.plane, { onChange: onSplitGizmo }); updateSplitLines(); scheduleSplitAnalysis(0); }
  else placeSplitPlane(S.selected.size ? 'sel' : 'z');
  renderPieces();
}
function leaveSplit() {
  clearTimeout(SPL.timer);
  V.hideSplit();
}

// Lista de piezas para imprimir
function renderPieces() {
  const box = $('piecesBox');
  if (!S.mesh || ST.pieceCount() < 2) { box.hidden = true; return; }
  box.hidden = false;
  const list = ST.piecesSummary();
  const bodies = list.filter((p) => p.kind !== 'dowel'), dowels = list.filter((p) => p.kind === 'dowel');
  const dg = new Map();
  for (const d of dowels) dg.set(d.name, (dg.get(d.name) || 0) + 1);
  $('piecesCount').textContent = `(${bodies.length}${dowels.length ? ` + ${dowels.length} pasadores` : ''})`;
  const fit = (p) => {
    const m = Math.max(...p.size);
    return m > 256 ? ' · <span class="warn-t">⚠ más de 256 mm</span>' : m > 180 ? ' · no cabe en A1 mini' : '';
  };
  $('piecesList').innerHTML =
    bodies.map((p) => `<div class="piece-row"><i></i><div class="pr-info"><b>${escapeHtml(p.name)}</b><div class="pr-sub" title="${escapeHtml(p.parts)}">${p.size.map((v) => Math.round(v)).join(' × ')} mm${fit(p)} · ${escapeHtml(p.parts)}</div></div></div>`).join('') +
    [...dg.entries()].map(([name, n]) => `<div class="piece-row"><i class="dowel"></i><div class="pr-info"><b>${n} × ${escapeHtml(name)}</b><div class="pr-sub">imprímelos de pie · se pegan con cola</div></div></div>`).join('');
  $('btnPiecesAssemble').disabled = ST.piecesAssembled();
}

// ---------------------------------------------------------------- texto 3D
const TXTS = { local: null, token: 0 };
function textOpts() {
  return { font: $('txtFont').value || 'moderna', size: parseFloat($('txtSize').value) || 8, depth: parseFloat($('txtDepth').value) || 1.2 };
}
async function refreshTextPreview() {
  const token = ++TXTS.token;
  const text = $('txtValue').value.trim();
  if (!text) { TXTS.local = null; V.setTextPreview(null); return; }
  try {
    const local = await TXT.textLocal(text, textOpts());
    if (token !== TXTS.token) return;
    TXTS.local = local;
    V.setTextPreview(local ? local.pos : null);
    if (!local) hint('Esa fuente no tiene esas letras');
  } catch (e) { console.error(e); toast('No se pudo preparar el texto'); }
}
function placeTextAt(hit) {
  const text = $('txtValue').value.trim();
  if (!text) { $('txtValue').focus(); return hint('Escribe primero el texto'); }
  if (!hit) return hint('Haz clic sobre la pieza');
  if (!TXTS.local) return;
  const m = TXT.textMatrix([hit.point.x, hit.point.y, hit.point.z], [hit.normal.x, hit.normal.y, hit.normal.z], V.viewUp());
  const pos = TXT.placeText(TXTS.local, m);
  const part = ST.addGeometryPart(pos, { name: `Texto «${text.length > 18 ? text.slice(0, 17) + '…' : text}»`, role: 'texto', filament: S.activeFilament, piece: S.mesh.facePiece[hit.face] });
  if (!part) return;
  setTool('select');
  if (S.activeFilament) V.settleSelection();
  toast(`Texto añadido (${fmtMM(TXTS.local.w)} × ${fmtMM(TXTS.local.h)} mm)${S.activeFilament ? '' : ': elige su color a la derecha'} · Ctrl+Z para quitarlo`, 4000);
}

// ---------------------------------------------------------------- tutorial
const tourOpts = { ensureModel: () => { if (!S.mesh) openSample('trofeo.stl'); } };

// ---------------------------------------------------------------- eventos
function bind() {
  $('btnTour').addEventListener('click', () => { $('helpModal').hidden = true; startTour(tourOpts); });
  $('txtFont').innerHTML = TXT.TEXT_FONTS.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
  const onTxt = () => {
    $('txtSizeOut').textContent = `${fmtMM(+$('txtSize').value)} mm`;
    $('txtDepthOut').textContent = `${fmtMM(+$('txtDepth').value)} mm`;
    if (S.tool === 'text') refreshTextPreview();
  };
  ['txtValue', 'txtSize', 'txtDepth'].forEach((id) => $(id).addEventListener('input', onTxt));
  $('txtFont').addEventListener('change', onTxt);
  $('txtValue').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('txtValue').blur(); hint('Ahora haz clic en la pieza donde quieras el texto'); } });
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
  // cortar en piezas
  fillConnSizes();
  document.querySelectorAll('[data-plane]').forEach((b) => b.addEventListener('click', () => {
    if (!S.mesh) return toast('Primero abre un modelo');
    if (S.tool !== 'split') setTool('split');
    placeSplitPlane(b.dataset.plane);
  }));
  $('splitOff').addEventListener('input', (e) => moveSplitTo(+e.target.value));
  $('splitOffNum').addEventListener('change', (e) => moveSplitTo(parseFloat(String(e.target.value).replace(',', '.')) || 0));
  document.querySelectorAll('[data-split-mode]').forEach((b) => b.addEventListener('click', () => {
    V.setSplitMode(b.dataset.splitMode);
    document.querySelectorAll('[data-split-mode]').forEach((x) => x.classList.toggle('active', x === b));
  }));
  $('splitClip').addEventListener('change', (e) => V.setSplitClip(e.target.checked ? -1 : 0));
  $('connType').addEventListener('change', () => { fillConnSizes(); setPref('connType', $('connType').value); runSplitAnalysis(); });
  $('connSize').addEventListener('change', () => runSplitAnalysis());
  $('connFit').addEventListener('change', () => { setPref('connFit', $('connFit').value); runSplitAnalysis(); });
  $('btnSplitApply').addEventListener('click', applySplit);
  $('btnSplitAuto').addEventListener('click', () => { if (!SPL.plane) return toast('Primero coloca el plano'); runSplitAnalysis(); hint('Anclajes recalculados'); });
  $('btnSplitBetter').addEventListener('click', findBetterSplit);
  $('btnPiecesExplode').addEventListener('click', () => busy('Separando piezas…', () => { if (ST.explodePieces()) { V.fitView('iso'); toast('Piezas separadas: así encajan. «⊞ Montar» para juntarlas'); } }));
  $('btnPiecesAssemble').addEventListener('click', () => busy('Montando…', () => { if (ST.assemblePieces()) { V.fitView('iso'); toast('Piezas montadas'); } else toast('Ya están montadas'); }));
  $('btnPiecesLayout').addEventListener('click', () => busy('Colocando para imprimir…', () => {
    if (ST.layoutPieces()) { V.fitView('iso'); toast('Piezas tumbadas por su cara plana y repartidas: así irán al laminador', 4500); }
  }));

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
    applyToSelection_(S.activeFilament);
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
        else if (kind === 'viewer') {
          const r = EX.exportClientViewer();
          const mb = r.size / 1048576;
          toast(`Visor 3D guardado (${mb < 1 ? Math.max(1, Math.round(mb * 1024)) + ' KB' : mb.toFixed(1) + ' MB'}): mándaselo al cliente y lo abre en el navegador para girar la pieza${S.variants.length ? ' y comparar las propuestas' : ''}.${r.triangles > 400000 ? ' Ojo: la pieza es muy detallada y el archivo pesa.' : ''}`, 6500);
        }
        else if (kind === 'png') EX.exportPNG();
        else if (kind === 'copy') { await EX.copyPNG(); toast('Imagen copiada: pégala en el chat de la videollamada'); }
        else if (kind === 'compare') EX.exportCompare();
        else if (kind === '3mf') showSlotGuide(EX.export3MF('bambu'), '3mf');
        else if (kind === '3mfpaint') showSlotGuide(EX.export3MF('paint'), '3mfpaint');
        else if (kind === 'obj') showSlotGuide(EX.exportOBJ(), 'obj');
        else if (kind === 'stlzip') EX.exportSTLZip();
        else if (kind === 'stlpieces') { if (ST.pieceCount() < 2) toast('Aún no hay piezas: córtala primero con ✂ Cortar'); else EX.exportPiecesZip(); }
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
    if (tourOpen()) return;
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
    else if (k === 'x') setTool('split');
    else if (k === 'm') setTool('move');
    else if (k === 't' && S.tool === 'move') setMoveMode('translate');
    else if (k === 't') { setTool('text'); setTimeout(() => $('txtValue').select(), 30); }
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
    if (r.launched === 'web') {
      if (!r.saved) return;
      toast(`Versión web: ábrelo tú en ${name} (el 3MF va dentro del ZIP). En la versión de Windows se abre solo.`, 8000);
    } else if (r.launched === 'slicer') toast(`Abriendo ${name}… ${where}`, 6000);
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
    if (!(await EX.saveFile(r.blob, `${base}_360.${r.ext}`))) return;
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
      const money = (x) => (x.qty > 1 ? `${x.qty} × ${Q.eur(x.unit)}` : Q.eur(x.price));
      if (q) html = `Con este tamaño: <b>${money(q)}</b> · ${Q.grams(q.grams + q.purgeGrams)} · ${Q.duration(q.hours)}${lastQuote && Math.abs(q.price - lastQuote.price) > 0.001 ? ` <span class="muted">(ahora ${money(lastQuote)})</span>` : ''}`;
    } catch (e) { console.error(e); }
    if (max > 256) html += '<br>⚠ Más de 256 mm: no cabe en la cama de una Bambu Lab X1, P1 o A1. Pártela con ✂ Cortar (tecla X): pone los anclajes sola.';
    else if (max > 180) html += '<br>Ojo: más de 180 mm no cabe en una A1 mini (se puede partir con ✂ Cortar, tecla X).';
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
  if (ST.pieceCount() > 1 && steps.length) {
    const nb = ST.piecesSummary().filter((p) => p.kind !== 'dowel').length, nd = ST.pieceCount() - nb;
    const what = `${nb} piezas${nd ? ` y ${nd} pasadores` : ''}`;
    steps.push(kind === 'obj'
      ? `Las ${what} van en un mismo objeto: en el laminador, clic derecho → <b>Dividir → En objetos</b> para colocarlas por separado.`
      : `Las ${what} llegan como objetos separados${ST.piecesAssembled() ? ', ya tumbadas por la cara del corte' : ''}. Si no caben en tu cama, pulsa <b>Organizar (A)</b> o repártelas en varias placas.`);
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
    facePiece: S.mesh.facePiece, pieces: S.pieces, nextPieceId: S.nextPieceId,
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
  V.setSplitVisible(!on && S.tool === 'split' && !!SPL.plane);
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
ST.on('pieces', () => renderPieces());
ST.on('mesh', () => {
  renderPieces();
  if (S.mesh !== SPL.mesh) {
    // otro modelo: el plano anterior ya no vale
    SPL.mesh = S.mesh;
    SPL.plane = null;
    SPL.an = null;
    SPL.conns = [];
    SPL.note = '';
    V.hideSplit();
    if (S.tool === 'split' && S.mesh) placeSplitPlane('z');
    else renderSplitInfo();
    return;
  }
  if (S.tool === 'split' && SPL.plane && S.mesh) setSplitPlane(SPL.plane, { resetRef: true });
});
ST.on('selection', () => {
  // al cambiar la selección cambian las piezas que se cortarían
  if (S.tool !== 'split' || !SPL.plane) return;
  const t = splitTargetsNow();
  const same = (a, b) => (!a && !b) || (a && b && a.size === b.size && [...a].every((x) => b.has(x)));
  if (same(t, SPL.targets)) return;
  SPL.targets = t;
  updateSplitLines();
  scheduleSplitAnalysis();
});
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
  const ct = getPref('connType', 'dowel'), cf = getPref('connFit', '0.15');
  if ([...$('connType').options].some((o) => o.value === ct)) $('connType').value = ct;
  if ([...$('connFit').options].some((o) => o.value === cf)) $('connFit').value = cf;
  fillConnSizes();
  V.setLayerLines($('layerLines').checked, S.layerHeight);
  updateQuote();
  // tutorial la primera vez (con el trofeo de ejemplo para verlo en acción)
  setTimeout(() => maybeStartTour(tourOpts), 700);
});
ST.on('parts', scheduleQuote);
ST.on('mesh', scheduleQuote);
Q.onQty(() => { clearTimeout(quoteTimer); updateQuote(); });
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
window.FS = { S, ST, V, EX, Q, CUT, SPL, VID: { recordTurntable, videoSupport }, toast }; // para depurar desde la consola (y avisos de la versión web)
