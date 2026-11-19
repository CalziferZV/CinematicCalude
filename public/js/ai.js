// Asistente IA: chat + ejecución local de las herramientas que pide Claude.
import * as ST from './state.js';
import { capture, fitView } from './viewer.js';
import { searchFilaments, resolveFilament, currentBrand, escapeHtml, ownedSpools } from './catalog.js';
import { computeQuote } from './quote.js';
import { falseColor } from './materials.js';

let messages = [];
let busy = false;
let enabled = false;
const $ = (id) => document.getElementById(id);

export async function initAI() {
  $('btnAI').addEventListener('click', () => {
    $('aiPanel').hidden = !$('aiPanel').hidden;
    if (!$('aiPanel').hidden) $('aiInput').focus();
  });
  $('aiClose').addEventListener('click', () => ($('aiPanel').hidden = true));
  $('aiClear').addEventListener('click', () => { messages = []; $('aiMessages').innerHTML = ''; greet(); });
  $('aiForm').addEventListener('submit', (e) => { e.preventDefault(); send(); });
  $('aiInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('aiQuick').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('aiInput').value = b.textContent; send(); }));
  try {
    const s = await (await fetch('/api/ai/status')).json();
    enabled = s.enabled;
    $('aiModel').textContent = enabled ? s.model : 'desactivada';
  } catch { enabled = false; }
  greet();
}

function greet() {
  if (enabled) {
    addMsg('bot', 'Hola 👋 Soy tu asistente de diseño y color. Puedo ver la pieza, detectar base / texto / partes, dividirla y aplicar filamentos reales. ¿Qué quiere tu cliente?');
    return;
  }
  addMsg('bot', 'La IA está desactivada. Para activarla pega aquí tu clave de la API de Claude (se consigue en console.anthropic.com). Se guarda solo en este ordenador. El resto de la app funciona sin IA.');
  const box = document.createElement('form');
  box.className = 'ai-key';
  box.innerHTML = '<input type="password" placeholder="sk-ant-..." autocomplete="off" /><button class="btn primary">Activar IA</button>';
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = box.querySelector('input').value.trim();
    if (!key) return;
    box.querySelector('button').disabled = true;
    try {
      const r = await fetch('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      enabled = j.enabled;
      $('aiModel').textContent = j.model;
      box.remove();
      addMsg('bot', '✅ Clave guardada. IA activada.');
      greet();
    } catch (err) {
      addMsg('err', err.message);
      box.querySelector('button').disabled = false;
    }
  });
  $('aiMessages').appendChild(box);
}

function addMsg(kind, text, img) {
  const d = document.createElement('div');
  d.className = `msg ${kind}`;
  d.innerHTML = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  if (img) { const i = new Image(); i.src = img; d.appendChild(i); }
  $('aiMessages').appendChild(d);
  $('aiMessages').scrollTop = 1e9;
  return d;
}
function typing(on) {
  let t = $('aiTyping');
  if (on && !t) {
    t = document.createElement('div');
    t.id = 'aiTyping';
    t.className = 'msg bot';
    t.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    $('aiMessages').appendChild(t);
    $('aiMessages').scrollTop = 1e9;
  } else if (!on && t) t.remove();
}

// Permite que otras partes de la app abran el chat con una petición
export function ask(text) {
  $('aiPanel').hidden = false;
  $('aiInput').value = text;
  send();
}

async function send() {
  const text = $('aiInput').value.trim();
  if (!text || busy) return;
  if (!enabled) { addMsg('err', 'IA desactivada: pega tu clave en el campo de arriba para activarla.'); return; }
  $('aiInput').value = '';
  addMsg('user', text);
  const startLen = messages.length;
  messages.push({ role: 'user', content: [{ type: 'text', text }] });
  busy = true;
  $('aiSend').disabled = true;
  try {
    for (let i = 0; i < 16; i++) {
      typing(true);
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
      const j = await r.json();
      typing(false);
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      // guardar el contenido tal cual (incluidos bloques de razonamiento) para el siguiente turno
      messages.push({ role: 'assistant', content: j.content });
      for (const b of j.content) if (b.type === 'text' && b.text.trim()) addMsg('bot', b.text.trim());
      if (j.stop_reason === 'refusal') { addMsg('err', 'La IA no ha podido responder a esta petición.'); break; }
      if (j.stop_reason === 'pause_turn') continue;
      if (j.stop_reason !== 'tool_use') break;
      const results = [];
      for (const b of j.content) {
        if (b.type !== 'tool_use') continue;
        let content, isError = false;
        try {
          content = await runTool(b.name, b.input || {});
        } catch (e) {
          content = `Error: ${e.message}`;
          isError = true;
        }
        results.push({ type: 'tool_result', tool_use_id: b.id, content, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    typing(false);
    addMsg('err', e.message);
    // descartar el turno incompleto para poder seguir conversando
    messages.length = startLen;
  } finally {
    busy = false;
    $('aiSend').disabled = false;
  }
}

const TOOL_LABEL = {
  get_scene: 'Revisando la escena…', capture_view: 'Mirando la pieza…', search_filaments: 'Buscando filamentos…',
  set_part_color: 'Aplicando color…', rename_parts: 'Nombrando partes…', split_by_height: 'Cortando por altura…',
  auto_segment: 'Detectando partes…', merge_parts: 'Uniendo partes…', select_parts: 'Seleccionando…',
};

async function runTool(name, input) {
  addMsg('tool', `· ${TOOL_LABEL[name] || name}`);
  const S = ST.S;
  if (!S.mesh && name !== 'search_filaments') throw new Error('No hay ningún modelo cargado todavía.');
  switch (name) {
    case 'get_scene': {
      const sum = ST.sceneSummary();
      sum.catalog = { active_brand: currentBrand()?.name || null };
      try {
        const q = computeQuote();
        if (q) {
          sum.estimate = {
            filament_g: Math.round(q.grams + q.purgeGrams), purge_g: Math.round(q.purgeGrams), color_changes: q.changes,
            print_time_h: +q.hours.toFixed(2), price_eur: q.price, price_includes_vat: q.settings.vat > 0,
          };
        }
      } catch { /* sin presupuesto */ }
      const spools = ownedSpools();
      if (spools.length) sum.my_spools = spools.slice(0, 80).map((f) => `${f.brandName} ${f.line} · ${f.name} ${f.hex}`);
      return JSON.stringify(sum);
    }
    case 'capture_view': {
      const canvas = capture({ view: input.view || 'iso', mode: input.mode || 'real', width: 1024, height: 768 });
      const url = canvas.toDataURL('image/jpeg', 0.85);
      const legend = input.mode === 'parts'
        ? 'Leyenda (color falso → parte): ' + S.parts.map((p, i) => `#${p.id} ${p.name} = ${falseColor(i)}`).join('; ')
        : 'Colores reales asignados: ' + S.parts.map((p) => `#${p.id} ${p.name} = ${p.filament ? p.filament.name + ' ' + p.filament.hex : 'sin asignar'}`).join('; ');
      return [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: url.split(',')[1] } },
        { type: 'text', text: legend },
      ];
    }
    case 'search_filaments': {
      const r = await searchFilaments(input, 25);
      return JSON.stringify(r.map((f) => ({ brand: f.brandName, line: f.line, category: f.category, color_name: f.name, color_en: f.nameEn, hex: f.hex, multicolor: f.hexes })));
    }
    case 'set_part_color': {
      const fil = await resolveFilament(input);
      if (!fil) throw new Error('No encuentro ese filamento. Usa search_filaments primero.');
      const ids = (input.part_ids || []).filter((id) => ST.partById(id));
      if (!ids.length) throw new Error('Ninguna de esas partes existe.');
      ST.setPartFilament(ids, fil);
      return `Asignado ${fil.brandName} ${fil.line} "${fil.name}" (${fil.hex}) a las partes ${ids.join(', ')}.`;
    }
    case 'rename_parts': {
      ST.renameParts(input.parts || []);
      return 'Partes renombradas.';
    }
    case 'split_by_height': {
      const created = ST.splitByHeight(input.part_id ?? null, (input.heights_mm || []).map(Number).filter((n) => !Number.isNaN(n)));
      return `Corte hecho. Partes nuevas: ${created.join(', ') || 'ninguna (la altura no atraviesa la parte)'}. Escena: ${JSON.stringify(ST.sceneSummary().parts.map((p) => ({ id: p.id, name: p.name, z: p.z_range_mm })))}`;
    }
    case 'auto_segment': {
      const notes = ST.autoSegment(input.mode || 'smart');
      return `Hecho. ${notes.join('. ')}. Partes: ${JSON.stringify(ST.sceneSummary().parts.map((p) => ({ id: p.id, name: p.name, role: p.role, surface_pct: p.surface_pct, z: p.z_range_mm })))}`;
    }
    case 'merge_parts': {
      ST.mergeParts(input.part_ids || []);
      return 'Partes unidas.';
    }
    case 'select_parts': {
      ST.select(input.part_ids || []);
      if (input.part_ids?.length) fitView('iso');
      return 'Seleccionadas.';
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
