// Genera el icono de la app (.ico con imágenes PNG de 16 a 256 px) sin dependencias.
// Diseño: bobina naranja con centro blanco y aro claro, como el logo de la interfaz.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Color (RGBA 0-255) en un punto normalizado (x, y en -1..1) del icono
function sample(x, y) {
  const r = Math.hypot(x, y);
  if (r > 0.98) return null;
  if (r > 0.86) return [255, 211, 184, 255]; // aro claro
  if (r < 0.3) return [255, 255, 255, 255]; // centro blanco
  if (r < 0.36) return [222, 84, 8, 255]; // borde del agujero
  // naranja con luz arriba-izquierda
  const t = Math.min(1, Math.max(0, (x + y) * 0.35 + 0.5));
  const c = mix([255, 142, 66], [232, 86, 4], t);
  // hilos de filamento (anillos suaves)
  const ring = 0.5 + 0.5 * Math.cos(r * Math.PI * 14);
  return [...mix(c, [205, 72, 0], ring * 0.18), 255];
}

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  const ss = size <= 32 ? 6 : 4; // supermuestreo para bordes suaves
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / ss) / size) * 2 - 1;
          const c = sample(x, y);
          if (!c) continue;
          rr += c[0]; gg += c[1]; bb += c[2]; aa += 1;
        }
      }
      const o = (py * size + px) * 4;
      if (aa) {
        out[o] = Math.round(rr / aa);
        out[o + 1] = Math.round(gg / aa);
        out[o + 2] = Math.round(bb / aa);
      }
      out[o + 3] = Math.round((255 * aa) / (ss * ss));
    }
  }
  return out;
}

export function makeIco(sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map((s) => png(s, render(s)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo icono
  header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const e = i * 16;
    dir[e] = s >= 256 ? 0 : s;
    dir[e + 1] = s >= 256 ? 0 : s;
    dir[e + 2] = 0;
    dir[e + 3] = 0;
    dir.writeUInt16LE(1, e + 4); // planos
    dir.writeUInt16LE(32, e + 6); // bits por píxel
    dir.writeUInt32LE(images[i].length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, dir, ...images]);
}

export function makePng(size = 256) {
  return png(size, render(size));
}
