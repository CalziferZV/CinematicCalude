// Visor 3D para el cliente: un solo archivo HTML con la pieza, sus colores, las propuestas A/B/C
// y (si quieres) el precio. Se abre en cualquier navegador con internet (three.js sale de jsDelivr).
// Sin JavaScript (la vista previa del iPhone desde WhatsApp) o sin conexión se ve una imagen de la
// pieza con su leyenda y un aviso para abrirlo en el navegador.
import { S, normals, BLANK } from './state.js';
import { capture } from './viewer.js';

const b64 = (arr) => {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
// misma tarjeta que pinta el visor al cambiar de propuesta (aquí, ya escrita en el HTML)
const legendHtml = (parts) => parts.map((p) => {
  const f = p.fil;
  const sw = f.finish === 'silk' ? `linear-gradient(135deg,#fff,${f.hex} 45%,${f.hex})` : f.hex;
  const sub = f.blank ? 'Por elegir' : [f.brand, f.line, f.name].filter(Boolean).join(' · ');
  return `<div class="it"><i style="background:${esc(sw)}"></i><div><b>${esc(p.name)}</b><span>${esc(sub)}</span></div></div>`;
}).join('');
function stillImage() {
  try {
    const c = capture({ view: 'iso', mode: 'real', width: 960, height: 720, transparent: true, grid: false });
    const webp = c.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  } catch { return ''; }
}
const filInfo = (f) => {
  const x = f || BLANK;
  return { name: x.blank ? 'Por elegir' : x.name, brand: x.brandName || '', line: x.line || '', hex: (x.hexes && x.hexes[0]) || x.hex || '#ECECEC', finish: x.finish || 'basic', alpha: x.alpha || 0, blank: !!x.blank };
};

export function buildClientViewer({ shopName = '', price = null, priceNote = '', note = '' } = {}) {
  if (!S.mesh) throw new Error('No hay modelo');
  const P = S.mesh.pos, N = normals(), fp = S.mesh.faceParts;
  const faces = new Map();
  for (let f = 0; f < fp.length; f++) { if (!faces.has(fp[f])) faces.set(fp[f], []); faces.get(fp[f]).push(f); }
  const parts = [];
  for (const p of S.parts) {
    const list = faces.get(p.id);
    if (!list || !p.visible) continue;
    const pos = new Float32Array(list.length * 9), nor = new Int8Array(list.length * 9);
    list.forEach((f, i) => {
      pos.set(P.subarray(f * 9, f * 9 + 9), i * 9);
      for (let j = 0; j < 9; j++) nor[i * 9 + j] = Math.round(N[f * 9 + j] * 127);
    });
    parts.push({ id: p.id, name: p.name, fil: filInfo(p.filament), pos: b64(pos), nor: b64(nor) });
  }
  const variants = S.variants.map((v) => ({ name: v.name, colors: Object.fromEntries(Object.entries(v.colors).map(([id, f]) => [id, filInfo(f)])) }));
  const title = (S.modelName || 'Tu pieza').replace(/\.[^.]+$/, '');
  const data = { title, shopName, price, priceNote, note, date: new Date().toLocaleDateString('es-ES'), parts, variants };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const still = stillImage();
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}${shopName ? ' · ' + esc(shopName) : ''}</title>
<style>
:root{--bg:#f5f5f7;--card:#fff;--ink:#1d1d1f;--muted:#6e6e73;--line:#e2e2e7;--accent:#ff6a13}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#141416;--ink:#f5f5f7;--muted:#a1a1a6;--line:#2a2a2e}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:grid;grid-template-rows:auto 1fr auto;min-height:100%}
header{padding:18px max(16px,env(safe-area-inset-left)) 6px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
h1{margin:0;font-size:26px;letter-spacing:-.03em}header p{margin:2px 0 0;color:var(--muted)}
.price{font-size:26px;font-weight:800;letter-spacing:-.03em}.price small{display:block;font-size:12px;font-weight:500;color:var(--muted);text-align:right}
main{position:relative;min-height:56vh}canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
#still{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;transition:opacity .5s}
.hint,.nojs{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font-size:12px;color:var(--muted);background:var(--card);padding:5px 10px;border-radius:99px;opacity:.9;transition:opacity .4s;pointer-events:none;white-space:nowrap}
.hint{display:none}.v3d .hint{display:block}.js .nojs{display:none}.js.nov3d .nojs{display:block}
.nojs{white-space:normal;text-align:center;max-width:calc(100% - 32px);width:max-content}
footer{padding:12px max(16px,env(safe-area-inset-left)) calc(18px + env(safe-area-inset-bottom));display:grid;gap:12px}
.vars{display:flex;gap:8px;flex-wrap:wrap}.vars button{border:1px solid var(--line);background:var(--card);color:var(--ink);font:700 15px system-ui;border-radius:12px;padding:8px 14px;cursor:pointer}
.vars button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.it{display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 10px}
.it i{width:30px;height:30px;border-radius:9px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}.it b{display:block;font-size:14px}.it span{font-size:12px;color:var(--muted)}
.fine{font-size:12px;color:var(--muted)}
</style>
<script>document.documentElement.classList.add('js');setTimeout(function(){var h=document.documentElement;if(!h.classList.contains('v3d'))h.classList.add('nov3d');},15000);</script>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
</head><body>
<header><div><h1 id="t">${esc(title)}</h1><p id="sub">${esc([shopName, data.date].filter(Boolean).join(' · '))}</p></div><div class="price" id="price"${price ? '' : ' hidden'}>${esc(price || '')}<small>${esc(priceNote || 'precio estimado')}</small></div></header>
<main>${still ? `<img id="still" src="${still}" alt="${esc(title)} con sus colores">` : ''}<canvas id="c" aria-label="Tu pieza en 3D: arrastra para girarla"></canvas><span class="hint">Arrastra para girar · pellizca o rueda para acercar</span><span class="nojs">Para girarla en 3D, abre este archivo en el navegador (Safari, Chrome…) con internet.</span></main>
<footer><div class="vars" id="vars" hidden></div><div class="legend" id="legend">${legendHtml(parts)}</div><p class="fine">Previsualización orientativa con los colores reales del fabricante. Hecho con Filament Studio.</p></footer>
<script id="data" type="application/json">${json}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const D = JSON.parse(document.getElementById('data').textContent);
const $ = (id) => document.getElementById(id);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(120, -160, 260); scene.add(key);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 5000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
controls.addEventListener('start', () => { controls.autoRotate = false; touched = true; document.querySelector('.hint').style.opacity = '0'; });
const dec = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
function matParams(f) {
  const c = new THREE.Color(f.hex);
  if ((c.r + c.g + c.b) < 0.02) c.setRGB(0.04, 0.04, 0.045);
  const p = { color: c, roughness: 0.45, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4, side: THREE.DoubleSide };
  if (f.finish === 'matte') Object.assign(p, { roughness: 0.92, clearcoat: 0 });
  else if (f.finish === 'silk') Object.assign(p, { roughness: 0.22, metalness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.15, sheen: 1, sheenColor: c.clone() });
  else if (f.finish === 'metal') Object.assign(p, { roughness: 0.3, metalness: 0.85 });
  else if (f.finish === 'translucent' || f.alpha) Object.assign(p, { roughness: 0.25, transmission: 0.55, thickness: 3, transparent: true, opacity: 0.92 });
  else if (f.blank) Object.assign(p, { roughness: 0.6, clearcoat: 0 });
  return p;
}
const meshes = new Map();
const box = new THREE.Box3();
for (const p of D.parts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dec(p.pos, Float32Array), 3));
  const n8 = dec(p.nor, Int8Array), n = new Float32Array(n8.length);
  for (let i = 0; i < n8.length; i++) n[i] = n8[i] / 127;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial(matParams(p.fil)));
  scene.add(m); meshes.set(String(p.id), m);
  g.computeBoundingBox(); box.union(g.boundingBox);
}
const sphere = box.getBoundingSphere(new THREE.Sphere());
const R = sphere.radius;
controls.target.copy(sphere.center);
camera.position.copy(sphere.center).add(new THREE.Vector3(0.55, -0.72, 0.42).normalize());
controls.minDistance = R * 1.1; controls.maxDistance = R * 8;
let touched = false;
// encuadre: la esfera que envuelve la pieza cabe entera, a lo alto y a lo ancho, con margen
function fit() {
  if (touched) return;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, (R * 1.12) / Math.sin(Math.min(vf, hf)));
}
function legend(colors) {
  $('legend').innerHTML = D.parts.map((p) => {
    const f = colors ? colors[p.id] || p.fil : p.fil;
    const sw = f.finish === 'silk' ? 'linear-gradient(135deg,#fff,' + f.hex + ' 45%,' + f.hex + ')' : f.hex;
    return '<div class="it"><i style="background:' + sw + '"></i><div><b>' + p.name.replace(/</g, '&lt;') + '</b><span>' + (f.blank ? 'Por elegir' : [f.brand, f.line, f.name].filter(Boolean).join(' · ').replace(/</g, '&lt;')) + '</span></div></div>';
  }).join('');
}
function apply(colors) {
  for (const p of D.parts) {
    const f = colors ? colors[p.id] || p.fil : p.fil;
    const m = meshes.get(String(p.id));
    m.material.dispose(); m.material = new THREE.MeshPhysicalMaterial(matParams(f));
  }
  legend(colors);
}
if (D.variants.length) {
  const v = $('vars'); v.hidden = false;
  v.innerHTML = '<button aria-pressed="true" data-v="">Actual</button>' + D.variants.map((x, i) => '<button aria-pressed="false" data-v="' + i + '">Propuesta ' + x.name + '</button>').join('');
  v.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; v.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); apply(b.dataset.v === '' ? null : D.variants[+b.dataset.v].colors); });
}
legend(null);
function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); fit(); }
new ResizeObserver(resize).observe(canvas); resize();
let first = true;
renderer.setAnimationLoop(() => {
  controls.update(); renderer.render(scene, camera);
  if (first) {
    first = false;
    document.documentElement.classList.remove('nov3d'); document.documentElement.classList.add('v3d');
    const st = $('still'); if (st) { st.style.opacity = '0'; setTimeout(() => st.remove(), 600); }
  }
});
</script></body></html>`;
  return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), name: `${title.replace(/[^\w\-]+/g, '_')}_visor3d.html`, size: html.length, triangles: fp.length };
}
