// Genera modelos de ejemplo en public/samples (para probar la app sin archivos propios).
import fs from 'node:fs';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const font = new FontLoader().parse(JSON.parse(fs.readFileSync('node_modules/three/examples/fonts/helvetiker_bold.typeface.json', 'utf8')));
const exp = new STLExporter();
const save = (name, geoms) => {
  const g = mergeGeometries(geoms.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { x.deleteAttribute('uv'); x.deleteAttribute('normal'); return x; }));
  const buf = exp.parse(new THREE.Mesh(g), { binary: true });
  fs.writeFileSync(`public/samples/${name}`, Buffer.from(buf.buffer));
  console.log(name, g.attributes.position.count / 3, 'triángulos');
};
const text = (str, size, depth) => {
  const g = new TextGeometry(str, { font, size, depth, curveSegments: 4, bevelEnabled: false });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, 0);
  return g;
};

// 1) Trofeo: peana cuadrada + columna/copa torneada de una sola malla + texto en relieve en el frente
{
  const plinth = new THREE.BoxGeometry(64, 64, 18, 2, 2, 2);
  plinth.translate(0, 0, 9);
  const top = new THREE.BoxGeometry(52, 52, 4, 2, 2, 1);
  top.translate(0, 0, 20);
  const prof = [
    [0, 22], [16, 22], [16, 25], [9, 27], [6, 31], [5, 34], [5, 58], [8, 62], [13, 64], [9, 66], [17, 74], [23, 88], [25, 104],
    [23, 104], [21, 90], [15, 78], [0, 76],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const lathe = new THREE.LatheGeometry(prof, 72);
  lathe.rotateX(Math.PI / 2); // Y-up -> Z-up
  const t1 = text('CAMPEON', 6, 1.2);
  t1.rotateX(Math.PI / 2);
  t1.translate(0, -32, 11.5);
  const t2 = text('2026', 3.6, 1.2);
  t2.rotateX(Math.PI / 2);
  t2.translate(0, -32, 4.5);
  save('trofeo.stl', [plinth, top, lathe, t1, t2]);
}

// 2) Placa / llavero con texto en relieve
{
  const shape = new THREE.Shape();
  const w = 70, h = 26, r = 6;
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const hole = new THREE.Path();
  hole.absarc(-w / 2 + 7, 0, 3, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const plate = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 10 });
  const t = text('MARIA', 10, 1.6);
  t.translate(5, 0, 3);
  const border = new THREE.ExtrudeGeometry(
    (() => { const s = new THREE.Shape(); s.moveTo(-w / 2 + 14, -h / 2 + 2); s.lineTo(w / 2 - 2, -h / 2 + 2); s.lineTo(w / 2 - 2, -h / 2 + 3.2); s.lineTo(-w / 2 + 14, -h / 2 + 3.2); return s; })(),
    { depth: 0.8, bevelEnabled: false },
  );
  border.translate(0, 0, 3);
  save('llavero.stl', [plate, t, border]);
}

// 3) Pieza con varias partes sueltas (caja + tapa + pomo)
{
  const box = new THREE.BoxGeometry(50, 35, 20, 4, 4, 2); box.translate(0, 0, 10);
  const lid = new THREE.BoxGeometry(50, 35, 4, 4, 4, 1); lid.translate(0, 0, 22);
  const knob = new THREE.SphereGeometry(5, 24, 12); knob.translate(0, 0, 28);
  save('caja.stl', [box, lid, knob]);
}
