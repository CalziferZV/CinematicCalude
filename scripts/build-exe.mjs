// Construye el ejecutable de Windows "FilamentStudio.exe" (no necesita tener Node.js instalado).
//
//   1) Empaqueta la interfaz (three.js incluido) y el servidor con esbuild.
//   2) Genera un paquete Node SEA con todos los recursos incrustados (interfaz, ejemplos, catálogo sin conexión).
//   3) Descarga el node.exe oficial de la MISMA versión de Node (verificando su SHA-256),
//      le pone el icono y los datos de Filament Studio, y le inyecta el paquete.
//   4) Crea dist/FilamentStudio-Windows.zip con el .exe y unas instrucciones.
//
// Uso:   npm run build:exe
//        npm run build:exe -- --linux     (además crea build/filament-studio-linux para probarlo en Linux)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import * as ResEdit from 'resedit';
import { inject } from 'postject';
import { zipSync, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { makeIco, makePng } from './exe/icon.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const ASSETS = path.join(BUILD, 'assets');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache');
const NODE_VERSION = process.version; // el paquete SEA debe ejecutarse con la misma versión de Node que lo genera
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const step = (m) => console.log(`\n> ${m}`);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

// ---------------------------------------------------------------- 0) carpetas
fs.rmSync(BUILD, { recursive: true, force: true });
for (const d of [path.join(ASSETS, 'public', 'samples'), path.join(ASSETS, 'data', 'snapshot'), DIST, CACHE]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- 1) interfaz
step('Empaquetando la interfaz');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'public/js/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  outfile: path.join(ASSETS, 'public/app.js'),
  logLevel: 'warning',
});
let html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace('<script type="module" src="js/main.js"></script>', '<script type="module" src="app.js"></script>');
if (!html.includes('src="app.js"') || html.includes('importmap')) throw new Error('No se pudo adaptar index.html');
fs.writeFileSync(path.join(ASSETS, 'public/index.html'), html);
fs.copyFileSync(path.join(ROOT, 'public/styles.css'), path.join(ASSETS, 'public/styles.css'));
for (const f of fs.readdirSync(path.join(ROOT, 'public/samples'))) {
  fs.copyFileSync(path.join(ROOT, 'public/samples', f), path.join(ASSETS, 'public/samples', f));
}
// fuentes del texto 3D
fs.mkdirSync(path.join(ASSETS, 'public/fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'public/fonts'))) {
  fs.copyFileSync(path.join(ROOT, 'public/fonts', f), path.join(ASSETS, 'public/fonts', f));
}
fs.copyFileSync(path.join(ROOT, 'data/snapshot/catalog.json.gz'), path.join(ASSETS, 'data/snapshot/catalog.json.gz'));
fs.writeFileSync(path.join(ASSETS, 'public/favicon.ico'), makeIco([16, 32, 48]));

// ---------------------------------------------------------------- 2) servidor
step('Empaquetando el servidor');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'scripts/exe/main.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  keepNames: true,
  legalComments: 'none',
  outfile: path.join(BUILD, 'server.cjs'),
  logLevel: 'warning',
  logOverride: { 'empty-import-meta': 'silent' },
});

// ---------------------------------------------------------------- 3) paquete SEA
step('Generando el paquete con los recursos incrustados');
const assets = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else assets[path.relative(ASSETS, p).split(path.sep).join('/')] = p;
  }
})(ASSETS);
const seaConfig = {
  main: path.join(BUILD, 'server.cjs'),
  output: path.join(BUILD, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false, // obligatorio al generar para otra plataforma
  assets,
};
fs.writeFileSync(path.join(BUILD, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', path.join(BUILD, 'sea-config.json')], { stdio: 'inherit' });
const blob = fs.readFileSync(seaConfig.output);
console.log(`  ${Object.keys(assets).length} recursos, paquete de ${mb(blob.length)}`);

// ---------------------------------------------------------------- 4) node.exe oficial
step(`Descargando Node.js ${NODE_VERSION} para Windows (nodejs.org)`);
const zipName = `node-${NODE_VERSION}-win-x64.zip`;
const zipPath = path.join(CACHE, zipName);
const sums = await (await fetch(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`)).text();
const expected = sums.split('\n').find((l) => l.endsWith(`  ${zipName}`))?.split(/\s+/)[0];
if (!expected) throw new Error(`No hay ${zipName} en nodejs.org`);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
if (!fs.existsSync(zipPath) || sha(fs.readFileSync(zipPath)) !== expected) {
  const r = await fetch(`https://nodejs.org/dist/${NODE_VERSION}/${zipName}`);
  if (!r.ok) throw new Error(`Descarga fallida: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (sha(buf) !== expected) throw new Error('El archivo descargado no coincide con el SHA-256 oficial');
  fs.writeFileSync(zipPath, buf);
}
console.log(`  SHA-256 verificado: ${expected.slice(0, 16)}...`);
const prefix = `node-${NODE_VERSION}-win-x64/`;
const files = unzipSync(fs.readFileSync(zipPath), { filter: (f) => f.name === `${prefix}node.exe` || f.name === `${prefix}LICENSE` });
const nodeExe = files[`${prefix}node.exe`];
const nodeLicense = files[`${prefix}LICENSE`];
if (!nodeExe) throw new Error('node.exe no encontrado en el ZIP');

// ---------------------------------------------------------------- 5) inyectar la app (flujo oficial de Node SEA)
step('Incrustando la app en node.exe');
const exePath = path.join(BUILD, 'FilamentStudio.exe');
fs.writeFileSync(exePath, nodeExe);
await inject(exePath, 'NODE_SEA_BLOB', blob, { sentinelFuse: FUSE });

// ---------------------------------------------------------------- 6) icono y datos del programa
step('Poniendo icono y datos de Filament Studio');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true }); // la firma de Node ya no sería válida
const res = ResEdit.NtExecutableResource.from(exe);
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const iconFile = ResEdit.Data.IconFile.from(makeIco());
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  groups[0]?.id ?? 1,
  groups[0]?.lang ?? 1033,
  iconFile.icons.map((i) => i.data),
);
const [vMaj, vMin, vPatch] = pkg.version.split('.').map((n) => parseInt(n, 10) || 0);
for (const vi of ResEdit.Resource.VersionInfo.fromEntries(res.entries)) {
  vi.setFileVersion(vMaj, vMin, vPatch, 0);
  vi.setProductVersion(vMaj, vMin, vPatch, 0);
  for (const lang of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(lang, {
      FileDescription: 'Filament Studio',
      ProductName: 'Filament Studio',
      CompanyName: 'Filament Studio',
      InternalName: 'FilamentStudio',
      OriginalFilename: 'FilamentStudio.exe',
      FileVersion: pkg.version,
      ProductVersion: pkg.version,
      LegalCopyright: 'Incluye Node.js (licencia MIT)',
      Comments: 'Personalizador de color para impresion 3D',
    });
  }
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));

// ---------------------------------------------------------------- 7) comprobaciones del .exe final
step('Comprobando el ejecutable');
{
  const bin = fs.readFileSync(exePath);
  const check = (ok, msg) => { if (!ok) throw new Error(`Comprobación fallida: ${msg}`); console.log(`  OK  ${msg}`); };
  check(bin.includes(Buffer.from(`${FUSE}:1`)), 'interruptor SEA activado');
  const chk = ResEdit.NtExecutable.from(bin);
  const entries = ResEdit.NtExecutableResource.from(chk).entries;
  const seaRes = entries.find((e) => e.type === 10 && String(e.id).toUpperCase() === 'NODE_SEA_BLOB');
  check(seaRes && Buffer.from(seaRes.bin).equals(blob), 'paquete de la app incrustado e intacto');
  check(ResEdit.Resource.IconGroupEntry.fromEntries(entries).length > 0, 'icono de Filament Studio');
  // secciones contiguas y dentro de la imagen
  const secs = chk.getAllSections().map((s) => s.info).sort((x, y) => x.virtualAddress - y.virtualAddress);
  const align = chk.getSectionAlignment();
  const up = (v) => Math.ceil(v / align) * align;
  for (let i = 1; i < secs.length; i++) check(secs[i].virtualAddress >= up(secs[i - 1].virtualAddress + secs[i - 1].virtualSize), `sección ${secs[i].name} sin solapes`);
}
console.log(`  ${path.relative(ROOT, exePath)} (${mb(fs.statSync(exePath).size)})`);

if (args.has('--linux')) {
  step('Creando binario de prueba para Linux');
  const linuxPath = path.join(BUILD, 'filament-studio-linux');
  fs.copyFileSync(process.execPath, linuxPath);
  fs.chmodSync(linuxPath, 0o755);
  await inject(linuxPath, 'NODE_SEA_BLOB', blob, { sentinelFuse: FUSE });
  console.log(`  ${path.relative(ROOT, linuxPath)}`);
}

// ---------------------------------------------------------------- 8) ZIP para repartir
step('Creando el ZIP');
const crlf = (s) => '﻿' + s.replace(/\r?\n/g, '\r\n');
const readme = `FILAMENT STUDIO ${pkg.version}
================================

1. Haz doble clic en FilamentStudio.exe.
   Se abre una ventana negra (el motor de la app) y el navegador con la aplicación.
   No cierres la ventana negra mientras uses la app: al cerrarla, la app se detiene.

2. Si Windows muestra "Windows protegió su PC":
   pulsa "Más información" y después "Ejecutar de todas formas".
   Aparece porque el programa es nuevo y no está firmado con un certificado de pago.
   Para que no salga: ANTES de descomprimir, clic derecho sobre el ZIP > Propiedades >
   marca "Desbloquear" > Aceptar, y después descomprime.

3. Asistente IA (opcional): abre el panel "✦ IA" dentro de la app y pega tu clave
   de la API de Claude (se consigue en console.anthropic.com). Se guarda solo en tu ordenador.

- No hace falta instalar nada (Node.js ya va dentro del .exe).
- Funciona sin internet con una copia del catálogo; con internet, los colores se actualizan en vivo.
- La caché del catálogo y la clave de la IA se guardan en %LOCALAPPDATA%\\FilamentStudio
`;
const zip = zipSync(
  {
    'FilamentStudio/FilamentStudio.exe': [new Uint8Array(fs.readFileSync(exePath)), { level: 9 }],
    'FilamentStudio/LEEME.txt': new TextEncoder().encode(crlf(readme)),
    'FilamentStudio/LICENCIA-Node.js.txt': nodeLicense || new TextEncoder().encode('Node.js - licencia MIT - https://github.com/nodejs/node/blob/main/LICENSE'),
  },
  { level: 6 },
);
const zipOut = path.join(DIST, 'FilamentStudio-Windows.zip');
fs.writeFileSync(zipOut, zip);
fs.writeFileSync(path.join(DIST, 'icono.png'), makePng(256));
console.log(`  ${path.relative(ROOT, zipOut)} (${mb(zip.length)})`);
console.log('\nListo.');
