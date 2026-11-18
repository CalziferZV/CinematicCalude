// Aproxima el HEX a partir del nombre comercial de un color (inglés / español).
// Se usa solo para tiendas que no publican el código HEX.
const NAMES = {
  black: '#1A1A1A', negro: '#1A1A1A', white: '#F5F5F5', blanco: '#F5F5F5', ivory: '#F2EBD3', marfil: '#F2EBD3',
  cream: '#F3E5C8', crema: '#F3E5C8', beige: '#D9C7A3', bone: '#E3DAC9', grey: '#8E8E8E', gray: '#8E8E8E', gris: '#8E8E8E',
  silver: '#C0C0C8', plata: '#C0C0C8', 'dark gray': '#4A4A4A', 'dark grey': '#4A4A4A', 'light gray': '#C8C8C8', 'light grey': '#C8C8C8',
  charcoal: '#36454F', ash: '#9C9C94', red: '#D32F2F', rojo: '#D32F2F', scarlet: '#E0201B', crimson: '#B0172F', burgundy: '#7A1F2B',
  'wine red': '#7A1F2B', granate: '#7A1F2B', maroon: '#6E1A1A', orange: '#F57C00', naranja: '#F57C00', coral: '#FF6F61',
  peach: '#FFB38A', melocoton: '#FFB38A', yellow: '#FBC02D', amarillo: '#FBC02D', lemon: '#FFF176', gold: '#D4AF37', oro: '#D4AF37',
  dorado: '#D4AF37', bronze: '#B08D57', bronce: '#B08D57', copper: '#B87333', cobre: '#B87333', green: '#2E7D32', verde: '#2E7D32',
  'grass green': '#5DA130', lime: '#9CCC65', olive: '#6B6E2E', mint: '#98E0C0', menta: '#98E0C0', teal: '#00897B', turquoise: '#26C6DA',
  turquesa: '#26C6DA', cyan: '#00BCD4', cian: '#00BCD4', blue: '#1E62C8', azul: '#1E62C8', 'sky blue': '#6EC1E4', navy: '#1B2A4A',
  'marino': '#1B2A4A', cobalt: '#0047AB', 'ice blue': '#BFE3F2', purple: '#7B1FA2', morado: '#7B1FA2', violet: '#8E5BD6', violeta: '#8E5BD6',
  lavender: '#B8A1E3', lavanda: '#B8A1E3', lilac: '#C8A2C8', lila: '#C8A2C8', magenta: '#D81B60', pink: '#F48FB1', rosa: '#F48FB1',
  'hot pink': '#FF4FA0', sakura: '#F7C6D4', brown: '#6D4C41', marron: '#6D4C41', chocolate: '#5A3825', coffee: '#6F4E37', cafe: '#6F4E37',
  wood: '#A07850', madera: '#A07850', khaki: '#BDB07A', caqui: '#BDB07A', sand: '#D6C29A', arena: '#D6C29A', terracotta: '#C2603C',
  natural: '#EDE6D6', transparent: '#E8F0F2', clear: '#E8F0F2', transparente: '#E8F0F2', skin: '#E8B796', piel: '#E8B796',
  rainbow: 'RAINBOW', arcoiris: 'RAINBOW',
};
const RAINBOW = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA'];

function hashHex(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return '#' + ((h & 0xffffff) | 0x404040).toString(16).padStart(6, '0').toUpperCase();
}

export function colorNameToHex(name) {
  const n = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const hexMatch = n.match(/#?([0-9a-f]{6})\b/);
  if (hexMatch) return ['#' + hexMatch[1].toUpperCase()];
  const parts = n.split(/\s*(?:\/|&|\+|,| and | y | to )\s*/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const keys = Object.keys(NAMES).sort((a, b) => b.length - a.length);
    const k = keys.find((key) => new RegExp(`\\b${key}\\b`).test(p));
    if (!k) continue;
    if (NAMES[k] === 'RAINBOW') out.push(...RAINBOW);
    else out.push(NAMES[k]);
  }
  return out.length ? out.slice(0, 6) : [hashHex(n)];
}
