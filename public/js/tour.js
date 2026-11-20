// Tutorial guiado para la gente nueva: resalta cada zona de la app con una tarjeta explicativa.
// Se abre solo la primera vez y siempre desde la ayuda (?). Teclado: → / Intro siguiente, ← atrás, Esc salir.
import { getPref, setPref } from './prefs.js';

const STEPS = [
  {
    title: '👋 Bienvenido a Filament Studio',
    text: 'En un minuto te enseño lo básico: abrir una pieza, ponerle colores reales, presupuestarla, cortarla y mandarla a Bambu Studio.',
    first: true,
  },
  {
    target: '#btnOpen',
    title: 'Abre tu pieza',
    text: 'STL, 3MF, OBJ… o arrástrala a la ventana. En <b>Ejemplos</b> tienes piezas para practicar (para este tutorial he abierto el trofeo).',
  },
  {
    target: '.seg-grid',
    title: 'La app detecta las partes',
    text: '<b>✨ Inteligente</b> separa base, copa, columna, texto, relieves… También por piezas sueltas, por caras o por capas.',
  },
  {
    target: '#partsList',
    title: 'Tus partes, como capas',
    text: 'Clic para seleccionar, doble clic para renombrar, el ojo para ocultar. <kbd>Tab</kbd> salta a la siguiente parte sin color y <kbd>H</kbd> aísla la selección.',
  },
  {
    target: '.panel.right',
    title: 'Colores reales de 87 marcas',
    text: 'Elige marca, tipo y color: se aplica a la parte seleccionada. Busca «dorado silk» o «negro mate». Clic derecho = <b>★ favorito</b>; marca <b>🧵 La tengo</b> en tus bobinas.',
  },
  {
    target: '.tools',
    title: 'Herramientas y teclas',
    text: '<kbd>V</kbd> seleccionar · <kbd>B</kbd> pincel · <kbd>F</kbd> relleno · <kbd>X</kbd> cortar en piezas · <kbd>C</kbd> capas de color · <kbd>M</kbd> mover y girar · <kbd>T</kbd> texto 3D · <kbd>I</kbd> cuentagotas.',
  },
  {
    target: '[data-tool="split"]',
    title: '✂ Cortar con anclajes automáticos',
    text: '¿No cabe en la impresora o la quieres por colores sin AMS? Elige dónde cortar (por ejemplo, <b>a la selección</b>) y la app pone sola los pasadores según el grosor de la pieza.',
  },
  {
    target: '.viewport-wrap',
    title: 'Mueve la pieza',
    text: 'Arrastra para girar, rueda para el zoom y botón derecho para desplazar. <kbd>1</kbd>…<kbd>7</kbd> cambian la vista y <kbd>L</kbd> enseña la pieza por capas, como el laminador.',
    place: 'center',
  },
  {
    target: '#variantsBar',
    title: 'Propuestas A · B · C',
    text: 'Guarda varias combinaciones de colores y cambia entre ellas con un clic delante del cliente.',
  },
  {
    target: '#btnQuote',
    title: 'Presupuesto al instante',
    text: '<kbd>Q</kbd>: peso, tiempo, purga de los cambios de color y precio con tu margen. <b>Copiar mensaje</b> lo deja listo para WhatsApp.',
  },
  {
    target: '#btnPresent',
    title: 'Modo cliente',
    text: '<kbd>P</kbd> oculta los paneles para compartir pantalla en la videollamada: solo la pieza y sus colores.',
  },
  {
    target: '[data-dd="exportMenu"]',
    title: 'Directo a Bambu Studio',
    text: '<b>Abrir en Bambu Studio</b> crea el 3MF con los colores exactos y lo abre. También imagen y vídeo 360° para el cliente, STL por pieza, ficha…',
  },
  {
    target: '#btnAI',
    title: 'Tu asistente IA',
    text: 'Pídele cosas normales: «base en negro mate y texto dorado silk» o «córtala para que quepa en mi A1 mini».',
  },
  {
    target: '#btnHelp',
    title: '¡Listo!',
    text: 'Pulsa <kbd>?</kbd> cuando quieras para ver todos los atajos o repetir este tutorial.',
    last: true,
  },
];

let ui = null;
let idx = 0;
let opts = {};

function build() {
  const block = document.createElement('div');
  block.className = 'tour-block';
  const spot = document.createElement('div');
  spot.className = 'tour-spot none';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  document.body.append(block, spot, card);
  block.addEventListener('click', () => next(1));
  window.addEventListener('resize', place);
  window.addEventListener('keydown', onKey, true);
  ui = { block, spot, card };
}

function onKey(e) {
  if (!ui) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); next(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); next(-1); }
  else e.stopPropagation(); // durante el tutorial no se disparan los atajos de la app
}

const visible = (el) => el && el.offsetParent !== null && el.getClientRects().length > 0;

function render() {
  const s = STEPS[idx];
  const shown = STEPS.filter((x) => !x.optional || visible(document.querySelector(x.target)));
  const pos = shown.indexOf(s);
  ui.card.innerHTML = `
    <div class="tour-step">${pos + 1} / ${shown.length}</div>
    <h4>${s.title}</h4>
    <p>${s.text}</p>
    <div class="tour-foot">
      <div class="tour-dots">${shown.map((x) => `<i class="${x === s ? 'on' : ''}"></i>`).join('')}</div>
      ${s.first ? '<button class="btn small" data-t="skip">Saltar</button>' : '<button class="btn small" data-t="back">Atrás</button>'}
      <button class="btn small primary" data-t="next">${s.first ? 'Empezar' : s.last ? 'Terminar' : 'Siguiente'}</button>
    </div>
    ${s.first || s.last ? '' : '<button class="tour-x" data-t="skip" title="Salir del tutorial (Esc)">✕</button>'}`;
  ui.card.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = b.dataset.t;
    if (t === 'next') next(1);
    else if (t === 'back') next(-1);
    else finish();
  }));
  place();
  setTimeout(() => ui && ui.card.querySelector('[data-t="next"]')?.focus(), 50);
}

function place() {
  if (!ui) return;
  const s = STEPS[idx];
  const el = s.target ? document.querySelector(s.target) : null;
  const card = ui.card;
  const cw = card.offsetWidth || 340, ch = card.offsetHeight || 180;
  const W = window.innerWidth, H = window.innerHeight, m = 14;
  if (!el || !visible(el)) {
    ui.spot.className = 'tour-spot none';
    card.style.left = `${(W - cw) / 2}px`;
    card.style.top = `${(H - ch) / 2}px`;
    return;
  }
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const pad = 6;
  const R = { l: Math.max(4, r.left - pad), t: Math.max(4, r.top - pad), r: Math.min(W - 4, r.right + pad), b: Math.min(H - 4, r.bottom + pad) };
  ui.spot.className = 'tour-spot';
  Object.assign(ui.spot.style, { left: `${R.l}px`, top: `${R.t}px`, width: `${R.r - R.l}px`, height: `${R.b - R.t}px` });
  let x, y;
  if (s.place === 'center') { x = (R.l + R.r - cw) / 2; y = (R.t + R.b - ch) / 2; }
  else if (W - R.r > cw + m * 2) { x = R.r + m; y = R.t; }
  else if (R.l > cw + m * 2) { x = R.l - cw - m; y = R.t; }
  else if (H - R.b > ch + m * 2) { x = R.l; y = R.b + m; }
  else { x = R.l; y = R.t - ch - m; }
  card.style.left = `${Math.min(Math.max(m, x), W - cw - m)}px`;
  card.style.top = `${Math.min(Math.max(m, y), H - ch - m)}px`;
}

function next(dir) {
  let i = idx;
  for (;;) {
    i += dir;
    if (i < 0) return;
    if (i >= STEPS.length) { finish(); return; }
    const s = STEPS[i];
    if (!s.optional || visible(document.querySelector(s.target))) break;
  }
  idx = i;
  if (idx === 1 && opts.ensureModel) opts.ensureModel(); // cargar el ejemplo para ver el resto en acción
  render();
}

function finish() {
  if (!ui) return;
  setPref('tourDone', true);
  window.removeEventListener('resize', place);
  window.removeEventListener('keydown', onKey, true);
  ui.block.remove();
  ui.spot.remove();
  ui.card.remove();
  ui = null;
  if (opts.onDone) opts.onDone();
}

export function startTour(o = {}) {
  if (ui) return;
  opts = o;
  idx = 0;
  build();
  render();
}
export const tourOpen = () => !!ui;
// La primera vez que se abre la app (se puede forzar con ?tour=1 o evitar con ?tour=0)
export function maybeStartTour(o = {}) {
  const q = new URLSearchParams(location.search).get('tour');
  if (q === '0') return;
  if (q === '1' || !getPref('tourDone', false)) startTour(o);
}
