// Texto 3D en relieve sobre la pieza (nombres, fechas, dedicatorias): se crea como una parte nueva
// apoyada en la cara donde haces clic, derecha según la vista y un poco hundida para quedar unida.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export const TEXT_FONTS = [
  { id: 'moderna', label: 'Moderna' },
  { id: 'gruesa', label: 'Gruesa' },
  { id: 'deportiva', label: 'Deportiva (cursiva)' },
  { id: 'clasica', label: 'Clásica (con remates)' },
];
const fonts = new Map();
export function loadFont(id) {
  if (!fonts.has(id)) {
    fonts.set(id, fetch(`fonts/${id}.typeface.json`).then((r) => {
      if (!r.ok) throw new Error('No se pudo cargar la fuente');
      return r.json();
    }).then((j) => new FontLoader().parse(j)));
  }
  return fonts.get(id);
}

// Geometría del texto centrada en el origen: X a la derecha, Y hacia arriba, Z hacia fuera.
// embed: lo que se hunde en la pieza (mm) para que quede bien unido aunque la cara no sea perfecta.
export async function textLocal(text, { font = 'moderna', size = 8, depth = 1.2, embed = 0.3 } = {}) {
  const f = await loadFont(font);
  const g = new TextGeometry(text, { font: f, size, depth: depth + embed, curveSegments: size > 14 ? 8 : 5, bevelEnabled: false });
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!isFinite(b.min.x)) return null; // solo espacios o letras que la fuente no tiene
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -embed);
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = new Float32Array(ng.attributes.position.array);
  g.dispose();
  return { pos, w: b.max.x - b.min.x, h: b.max.y - b.min.y, depth };
}

// Matriz que coloca el texto en el punto de la cara: mirando hacia fuera (normal) y derecho según
// la vista (viewUp = "arriba" de la pantalla en el mundo).
export function textMatrix(point, normal, viewUp) {
  const n = new THREE.Vector3(...normal).normalize();
  let up = new THREE.Vector3(...viewUp);
  up.addScaledVector(n, -up.dot(n));
  if (up.lengthSq() < 1e-6) {
    up = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z);
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
  }
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  return new THREE.Matrix4().makeBasis(right, up, n).setPosition(new THREE.Vector3(...point));
}

export function placeText(local, matrix) {
  const e = matrix.elements, src = local.pos, out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return out;
}
