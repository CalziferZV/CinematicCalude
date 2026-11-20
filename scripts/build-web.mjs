// Monta la versión web de Filament Studio (sin servidor) en dist/web, para abrirla con un enlace:
//   node scripts/build-web.mjs
// - la interfaz de public/ tal cual; three.js y three-mesh-bvh se cargan de cdn.jsdelivr.net con la versión
//   exacta instalada (con --vendor se copian al lado los módulos que usa, para alojarla sin depender del CDN)
// - el catálogo de filamentos de la copia incluida en la app (data/snapshot y lo ya descargado en data/cache)
// - scripts/web/shim.js: responde en el navegador a lo que la app le pide al servidor local
// Deja también dist/web/files.json (la lista de archivos para publicarla) y dist/web/preview.html
// (la página con su esqueleto completo, para probarla en local con cualquier servidor estático).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'web');
const PUB = path.join(ROOT, 'public');
const NM = path.join(ROOT, 'node_modules');
const posix = (p) => p.split(path.sep).join('/');
const VENDOR = process.argv.includes('--vendor');
const version = (pkg) => JSON.parse(fs.readFileSync(path.join(NM, pkg, 'package.json'), 'utf8')).version;
const CDN = {
  three: `https://cdn.jsdelivr.net/npm/three@${version('three')}/`,
  bvh: `https://cdn.jsdelivr.net/npm/three-mesh-bvh@${version('three-mesh-bvh')}/`,
};

fs.rmSync(OUT, { recursive: true, force: true });
const files = {}; // ruta publicada -> archivo
const put = (rel, data) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
  files[rel] = f;
};
const copy = (src, rel) => put(rel, fs.readFileSync(src));

// 1 · interfaz. Las piezas de ejemplo van como JSON (base64): claude.ai no sirve archivos .stl y
//     el adaptador las devuelve a la app como si fueran el STL
for (const dir of ['js', 'fonts']) {
  for (const f of fs.readdirSync(path.join(PUB, dir))) copy(path.join(PUB, dir, f), `${dir}/${f}`);
}
for (const f of fs.readdirSync(path.join(PUB, 'samples'))) {
  put(`samples/${f}.json`, JSON.stringify({ name: f, base64: fs.readFileSync(path.join(PUB, 'samples', f)).toString('base64') }));
}

// 2 · three.js y three-mesh-bvh (solo con --vendor): se siguen los import desde los módulos de la app
const bare = (spec) => {
  if (spec === 'three') return path.join(NM, 'three/build/three.module.js');
  if (spec.startsWith('three/addons/')) return path.join(NM, 'three/examples/jsm', spec.slice('three/addons/'.length));
  if (spec === 'three-mesh-bvh') return path.join(NM, 'three-mesh-bvh/build/index.module.js');
  return null;
};
const IMPORTS = /(?:^|[;\s])(?:import|export)\s*(?:[\w*{}\s,$]*?\sfrom\s*)?['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const seen = new Set();
function trace(file) {
  if (seen.has(file) || !fs.existsSync(file)) return;
  seen.add(file);
  for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORTS)) {
    const spec = m[1] || m[2];
    const dep = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : bare(spec);
    if (dep) trace(dep);
  }
}
for (const f of fs.readdirSync(path.join(PUB, 'js'))) trace(path.join(PUB, 'js', f));
const vendor = [...seen].filter((f) => f.startsWith(NM));
if (VENDOR) for (const f of vendor) copy(f, `vendor/${posix(path.relative(NM, f))}`);

// 3 · catálogo de filamentos: la copia incluida, sin pedir nada a internet
globalThis.fetch = async () => { throw new Error('sin conexión'); };
const C = await import('../server/catalog.js');
const list = await C.getBrandList();
const brands = {};
for (const b of list.brands) {
  try {
    const { error, origin, ...d } = await C.getBrand(b.id);
    if (Array.isArray(d.lines)) brands[b.id] = d;
  } catch { /* esa marca no está en la copia */ }
}
const nColors = Object.values(brands).reduce((n, d) => n + d.lines.reduce((k, l) => k + l.colors.length, 0), 0);
put('api/catalog.json', JSON.stringify({ at: C.getAllBrands().at, list: { ...list, origin: 'snapshot' }, brands }));

// 4 · adaptador para el navegador
copy(path.join(ROOT, 'scripts/web/shim.js'), 'web.js');

// 5 · página: index.html sin su esqueleto (claude.ai pone el suyo al publicar), con los estilos dentro,
//     el mapa de módulos con rutas relativas y el adaptador antes que la app
const css = `${fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'scripts/web/web.css'), 'utf8')}`;
const PILL =
  '<span class="web-pill" title="Versión para probar en el navegador. Abrir directamente en Bambu Studio y el asistente IA están en la versión de Windows.">Versión web</span>';
const swaps = [
  [/<!doctype html>\s*/i, ''],
  [/<html[^>]*>\s*/i, ''],
  [/\s*<\/html>\s*$/i, '\n'],
  [/<head>\s*/i, ''],
  [/\s*<\/head>/i, ''],
  [/<body>\s*/i, ''],
  [/\s*<\/body>/i, ''],
  [/\s*<meta charset[^>]*>/i, ''],
  [/\s*<meta name="viewport"[^>]*>/i, ''],
  [/\s*<link rel="icon"[^>]*>/i, ''],
  [/<link rel="stylesheet" href="styles.css" \/>/, () => `<style>\n${css}</style>`],
  ...(VENDOR
    ? [[/"\/vendor\//g, '"./vendor/']]
    : [[/"\/vendor\/three\//g, `"${CDN.three}`], [/"\/vendor\/three-mesh-bvh\//g, `"${CDN.bvh}`]]),
  [/(<script type="importmap">[\s\S]*?<\/script>)/, '$1\n  <script src="web.js"></script>'],
  [/(<div class="brand"><span class="logo"><\/span>Filament&nbsp;Studio<\/div>)/, `$1\n    ${PILL}`],
];
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
for (const [re, to] of swaps) {
  if (!re.test(html)) throw new Error(`index.html ha cambiado: no encuentro ${re}`);
  re.lastIndex = 0;
  html = html.replace(re, to);
}
html = html.trimStart();
if (html.indexOf('<title>') > 8000) throw new Error('El <title> tiene que ir en los primeros 8 KB');
put('index.html', html);

// Para probar en local: la misma página con un esqueleto como el de claude.ai
fs.writeFileSync(
  path.join(OUT, 'preview.html'),
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>' +
    `</head><body>${html}</body></html>`,
);

// Lista para publicar: ruta publicada -> archivo
const manifest = {};
for (const [rel, f] of Object.entries(files)) if (rel !== 'index.html') manifest[rel] = posix(path.relative(ROOT, f));
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(manifest, null, 1));

const size = Object.values(files).reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`Versión web en ${posix(path.relative(ROOT, OUT))}: ${Object.keys(files).length} archivos, ${(size / 1048576).toFixed(1)} MB`);
console.log(`  three.js y three-mesh-bvh: ${VENDOR ? `${vendor.length} módulos copiados` : `de ${CDN.three} y ${CDN.bvh}`}`);
console.log(`  catálogo: ${Object.keys(brands).length} marcas y ${nColors} colores`);
