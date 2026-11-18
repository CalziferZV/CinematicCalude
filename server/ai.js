// Asistente IA de modelado / color para impresión 3D (Claude).
// El bucle de herramientas se ejecuta en el navegador: el servidor solo reenvía cada turno
// a la API de Claude (así la clave nunca llega al navegador) y devuelve la respuesta.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { keyFile } from './runtime.js';

const MODEL = process.env.FS_AI_MODEL || 'claude-opus-5-5';

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// Guarda la clave introducida desde la app (archivo .env local) y la activa al momento.
export function saveApiKey(key) {
  const k = String(key || '').trim();
  if (!/^[A-Za-z0-9_\-]{20,300}$/.test(k)) throw new Error('La clave no parece válida (debe empezar por sk-ant-...)');
  let lines = [];
  try { lines = fs.readFileSync(keyFile, 'utf8').split(/\r?\n/); } catch { /* nuevo archivo */ }
  lines = lines.filter((l) => !/^\s*ANTHROPIC_API_KEY\s*=/.test(l) && l.trim() !== '');
  lines.push(`ANTHROPIC_API_KEY=${k}`);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, lines.join('\n') + '\n', { mode: 0o600 });
  process.env.ANTHROPIC_API_KEY = k;
  client = null; // se crea de nuevo con la clave nueva
  return aiStatus();
}

export function aiStatus() {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return { enabled: hasKey, model: MODEL };
}

const SYSTEM = `Eres "Filamento IA", un asistente experto en modelado 3D, impresión 3D multicolor (Bambu Lab AMS, cambios de filamento por capa, pintura multimaterial en Bambu Studio / OrcaSlicer / PrusaSlicer) y diseño de producto.

Trabajas dentro de una aplicación que el usuario usa EN DIRECTO durante videollamadas con sus clientes para personalizar en tiempo real una pieza impresa en 3D (trofeos, placas con texto, llaveros, figuras, piezas técnicas...). La pieza llega "en blanco" y la app permite dividirla en partes y asignar a cada parte un filamento real (marca, línea y color) del catálogo en vivo.

Cómo trabajar:
- Usa las herramientas para inspeccionar la escena (get_scene) y para VER la pieza (capture_view) antes de opinar sobre su forma. Las capturas usan colores falsos por parte con etiquetas numeradas si lo pides con mode "parts".
- Reconoce lo que hay: base/peana, texto o relieve, placa, copa/figura de trofeo, columnas, logotipos, bordes, partes separadas. Pon nombres claros a las partes con rename_parts.
- Si una zona que el cliente quiere de otro color no es una parte independiente, divídela: split_by_height (cortes horizontales, ideales para impresión con cambio de filamento por capa en cualquier impresora), auto_segment (piezas sueltas, regiones por aristas vivas, bandas por altura) o pide al usuario usar el pincel / relleno inteligente si hace falta una selección manual.
- Para colorear busca filamentos reales con search_filaments y aplícalos con set_part_color. Prefiere la marca que el usuario tenga seleccionada salvo que pida otra.
- Da consejos prácticos de impresión: contraste y legibilidad del texto, número de cambios de filamento / purga, Silk vs Matte, combinaciones que quedan premium (p. ej. dorado silk + negro mate en trofeos), alturas de capa para cambios de color, limitaciones del AMS (4 colores por unidad).
- Responde siempre en español, breve y directo: el usuario está en una llamada con su cliente. Tras hacer cambios, resume en 1-3 frases lo que has hecho.`;

const TOOLS = [
  {
    name: 'get_scene',
    description:
      'Devuelve el estado actual: dimensiones del modelo (mm), lista de partes (id, nombre, rol detectado, nº de triángulos, % de superficie, rango de altura Z, caja envolvente, filamento asignado), análisis automático (base, texto/relieve, piezas sueltas) y la marca/categoría activas en el catálogo.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'capture_view',
    description:
      'Renderiza la pieza y devuelve una imagen. mode "real" = colores de filamento asignados; mode "parts" = cada parte en un color falso distinto con su número de id dibujado encima (útil para identificar partes).',
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom', 'current'] },
        mode: { type: 'string', enum: ['real', 'parts'] },
      },
      required: ['view', 'mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_filaments',
    description:
      'Busca colores de filamento reales en el catálogo en vivo. Devuelve hasta 25 coincidencias con marca, línea, categoría, nombre de color y HEX. query admite nombres de color en español o inglés (p. ej. "dorado", "gold", "negro mate").',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        brand: { type: 'string', description: 'id o nombre de marca (bambulab, sunlu, esun, polymaker...). Opcional.' },
        category: { type: 'string', description: 'Categoría, p. ej. "PLA Silk", "PLA Matte", "PETG". Opcional.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_part_color',
    description:
      'Asigna un filamento a una o varias partes. Indica brand + line + color_name tal y como los devolvió search_filaments (preferido), o solo hex para un color libre.',
    input_schema: {
      type: 'object',
      properties: {
        part_ids: { type: 'array', items: { type: 'integer' } },
        brand: { type: 'string' },
        line: { type: 'string' },
        color_name: { type: 'string' },
        hex: { type: 'string' },
      },
      required: ['part_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_parts',
    description: 'Pone nombre (y opcionalmente rol) a partes. Roles: base, texto, relieve, figura, copa, placa, columna, logo, borde, detalle, otro.',
    input_schema: {
      type: 'object',
      properties: {
        parts: {
          type: 'array',
          items: {
            type: 'object',
            properties: { part_id: { type: 'integer' }, name: { type: 'string' }, role: { type: 'string' } },
            required: ['part_id', 'name'],
            additionalProperties: false,
          },
        },
      },
      required: ['parts'],
      additionalProperties: false,
    },
  },
  {
    name: 'split_by_height',
    description:
      'Divide una parte (o todo el modelo si part_id es null) con cortes horizontales a las alturas indicadas en mm medidas desde la base del modelo (Z=0 es la cama). Crea una parte nueva por cada banda.',
    input_schema: {
      type: 'object',
      properties: {
        part_id: { type: ['integer', 'null'] },
        heights_mm: { type: 'array', items: { type: 'number' } },
      },
      required: ['heights_mm'],
      additionalProperties: false,
    },
  },
  {
    name: 'auto_segment',
    description:
      'Re-segmenta todo el modelo automáticamente. "smart" = análisis completo (piezas sueltas + base + texto/relieve); "shells" = una parte por cada cuerpo/pieza suelta; "regions" = regiones separadas por aristas vivas; "heights" = bandas por cambios de sección en altura (escalones). ATENCIÓN: reemplaza las partes y colores actuales.',
    input_schema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['smart', 'shells', 'regions', 'heights'] } },
      required: ['mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'merge_parts',
    description: 'Une varias partes en una sola (se queda con el nombre y color de la primera).',
    input_schema: {
      type: 'object',
      properties: { part_ids: { type: 'array', items: { type: 'integer' } } },
      required: ['part_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_parts',
    description: 'Selecciona/resalta partes en la interfaz para que el usuario y su cliente las vean.',
    input_schema: {
      type: 'object',
      properties: { part_ids: { type: 'array', items: { type: 'integer' } } },
      required: ['part_ids'],
      additionalProperties: false,
    },
  },
];

export async function aiTurn(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('messages vacío');
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: TOOLS,
    messages,
  });
  return {
    content: response.content,
    stop_reason: response.stop_reason,
    stop_details: response.stop_details || null,
    model: response.model,
  };
}

export function aiErrorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Clave de API de Claude no válida. Revisa ANTHROPIC_API_KEY en el archivo .env.';
  if (err instanceof Anthropic.RateLimitError) return 'Límite de uso de la API alcanzado. Espera unos segundos y reintenta.';
  if (err instanceof Anthropic.BadRequestError) return `Petición rechazada por la API: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con la API de Claude (¿sin internet?).';
  if (err instanceof Anthropic.APIError) return `Error de la API de Claude (${err.status}): ${err.message}`;
  return String(err?.message || err);
}
