// Ciencia del color: diferencia de color tal como la percibe el ojo (CIEDE2000).
// Se usa para encontrar el color equivalente de otra marca o de las bobinas que ya tienes.
const labCache = new Map();

export function hexToLab(hex) {
  const h = String(hex || '#000000').replace('#', '').slice(0, 6).padEnd(6, '0');
  const hit = labCache.get(h);
  if (hit) return hit;
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin(parseInt(h.slice(0, 2), 16)), g = lin(parseInt(h.slice(2, 4), 16)), b = lin(parseInt(h.slice(4, 6), 16));
  // sRGB -> XYZ (D65), normalizado al blanco de referencia
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((t * 24389) / 27 + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  const lab = [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  labCache.set(h, lab);
  return lab;
}

// CIEDE2000 (Sharma, Wu y Dalal, 2005)
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const p7 = (v) => Math.pow(v, 7);
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(p7(Cm) / (p7(Cm) + p7(25))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (a, b) => {
    if (a === 0 && b === 0) return 0;
    const t = Math.atan2(b, a) / rad;
    return t >= 0 ? t : t + 360;
  };
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hpm = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hpm - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(p7(Cpm) / (p7(Cpm) + p7(25)));
  const Sl = 1 + (0.015 * Math.pow(Lpm - 50, 2)) / Math.sqrt(20 + Math.pow(Lpm - 50, 2));
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

export const deltaE = (hexA, hexB) => deltaE2000(hexToLab(hexA), hexToLab(hexB));

// Qué significa la diferencia para una persona (2,3 ≈ la mínima diferencia que se nota)
export function deltaLabel(d) {
  if (d < 2.3) return 'idéntico a la vista';
  if (d < 5) return 'muy parecido';
  if (d < 10) return 'parecido';
  return 'aproximado';
}

// Familia de material (para no proponer un PETG como equivalente de un PLA)
export function materialFamily(f) {
  const t = `${(f && f.category) || ''} ${(f && f.line) || ''}`;
  if (/PETG|PCTG|\bPET\b/i.test(t)) return 'PETG';
  if (/\bASA\b/i.test(t)) return 'ASA';
  if (/\bABS\b/i.test(t)) return 'ABS';
  if (/TPU|TPE|Flex/i.test(t)) return 'TPU';
  if (/\bPC\b/.test(t)) return 'PC';
  if (/\bPA\d*\b|Nylon|PPA/i.test(t)) return 'PA';
  if (/PLA/i.test(t)) return 'PLA';
  return 'Otros';
}
