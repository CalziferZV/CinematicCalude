// Genera las fuentes del texto 3D (formato typeface de three.js) con tildes, ñ, ¿¡ y €,
// a partir de fuentes libres instaladas (Inter: OFL · DejaVu: licencia libre de Bitstream Vera).
// Uso: node scripts/make-fonts.mjs
import fs from 'node:fs';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

const FONTS = [
  { id: 'moderna', name: 'Moderna (Inter Display Bold)', file: '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf' },
  { id: 'gruesa', name: 'Gruesa (Inter Display Black)', file: '/usr/share/fonts/opentype/inter/InterDisplay-Black.otf' },
  { id: 'deportiva', name: 'Deportiva (Inter Display Black Italic)', file: '/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf' },
  { id: 'clasica', name: 'Clásica (DejaVu Serif Bold)', file: '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf' },
];
let chars = '';
for (let c = 32; c < 127; c++) chars += String.fromCharCode(c);
for (let c = 0xa1; c <= 0xff; c++) chars += String.fromCharCode(c);
chars += '€“”‘’–—•…™ŒœŠšŽžŸ';

function volume(g) {
  const p = g.toNonIndexed().attributes.position.array;
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    v += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  }
  return v / 6;
}

for (const f of FONTS) {
  const buf = fs.readFileSync(f.file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  // probar las dos orientaciones de contorno: la buena deja hueco en la «O»
  let best = null;
  for (const reversed of [false, true]) {
    const L = new TTFLoader();
    L.reversed = reversed;
    const json = L.parse(ab);
    const glyphs = {};
    for (const ch of chars) if (json.glyphs[ch]) glyphs[ch] = json.glyphs[ch];
    const data = { ...json, glyphs, familyName: f.name };
    const font = new FontLoader().parse(data);
    const vO = volume(new TextGeometry('O', { font, size: 10, depth: 1, curveSegments: 6, bevelEnabled: false }));
    const vI = volume(new TextGeometry('I', { font, size: 10, depth: 1, curveSegments: 6, bevelEnabled: false }));
    // con hueco, la O tiene bastante menos material que un disco macizo de su tamaño
    const g = new TextGeometry('O', { font, size: 10, depth: 1, curveSegments: 6, bevelEnabled: false });
    g.computeBoundingBox();
    const b = g.boundingBox;
    const solidDisc = Math.PI * ((b.max.x - b.min.x) / 2) * ((b.max.y - b.min.y) / 2);
    const ok = vO > 0 && vO < solidDisc * 0.8 && vI > 0;
    console.log(`${f.id} reversed=${reversed}: vol O ${vO.toFixed(1)} (disco ${solidDisc.toFixed(1)}), I ${vI.toFixed(1)} -> ${ok ? 'bien' : 'mal'}`);
    if (ok && !best) best = data;
  }
  if (!best) throw new Error(`No sale bien la fuente ${f.id}`);
  const missing = [...'áéíóúÁÉÍÓÚñÑüÜ¿¡€'].filter((c) => !best.glyphs[c]);
  fs.writeFileSync(`public/fonts/${f.id}.typeface.json`, JSON.stringify(best));
  console.log(`  -> public/fonts/${f.id}.typeface.json ${(fs.statSync(`public/fonts/${f.id}.typeface.json`).size / 1024).toFixed(0)} KB, ${Object.keys(best.glyphs).length} letras${missing.length ? ', faltan ' + missing.join('') : ''}`);
}
