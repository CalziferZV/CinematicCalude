// Monta un post estático de posts-list.mjs: fondo, textos, piezas 3D y pie con la marca.
import { createStage, vase, bauble, star, tree, gift, nameTag, loadFont, nozzle, placeNozzle, setPrint, contactShadow, particles, frameCam } from './print3d.js';
import { POSTS } from './posts-list.mjs';
import { CONFIG } from './config.js';

let P, S, render;
export const SIZE = (q) => { P = POSTS.find((x) => x.id === q.get('id')); return [P.w, P.h]; };
const fill = (s) => s.replace(/\{fecha\}/g, CONFIG.fechaLimite).replace(/\{usuario\}/g, CONFIG.usuario).replace(/\{marca\}/g, CONFIG.marca).replace(/\{contacto\}/g, CONFIG.contacto);

export async function init(q, w, h) {
  const glow = P.glow ? `<div class="abs glow ${P.glow === 'gold' ? 'goldg' : ''}" style="left:${w / 2 - 480}px;top:${h * 0.62 - 480}px;width:960px;height:960px"></div>` : '';
  document.getElementById('bgs').innerHTML = `<div class="bg ${P.bg}"></div>${glow}`;
  const ink = P.dark ? '#f7f5f2' : '#1d1d1f', mut = P.dark ? 'rgba(255,255,255,.65)' : '#6e6e73';
  const foot = P.story ? '' : `
    <div class="abs logo-mark" style="left:90px;bottom:70px;color:${ink};font-size:30px"><b></b>${CONFIG.marca}</div>
    <div class="abs" style="right:90px;bottom:76px;font-size:28px;font-weight:600;color:${mut}">${CONFIG.usuario}</div>`;
  const page = P.page ? `<div class="abs" style="right:90px;top:112px;font-size:28px;font-weight:700;color:${mut};letter-spacing:.08em">${P.page}</div>` : '';
  document.getElementById('fg').innerHTML = `<style>
    .num{display:inline-flex;align-items:center;justify-content:center;width:110px;height:110px;border-radius:32px;border:4px solid #ff6a13;color:#ff6a13;font-size:50px;font-weight:800;letter-spacing:-.02em}
    .num.red{border-color:#c8102e;color:#c8102e}.num.gold-n{border-color:#f2c14e;color:#f2c14e}</style>${fill(P.html)}${page}${foot}`;

  S = createStage(document.getElementById('gl'), w, h, 26);
  await loadFont();
  for (const o of P.objs) {
    const color = o.color;
    const text = o.text?.match(/^n(\d)$/) ? CONFIG.nombres[+o.text[1]] : o.text;
    const g = { vase: () => vase(color), bauble: () => bauble(color), star: () => star(color, { metal: o.metal ?? 0.7 }), tree: () => tree(),
      gift: () => gift(color, o.ribbon), tag: () => nameTag(text, { plate: o.plate, letters: o.letters }) }[o.make]();
    if (color != null && o.make === 'vase') g.children[0].material.color.set(color);
    g.scale.setScalar(o.scale ?? 1);
    g.position.set(o.x || 0, o.y || 0, o.z || 0);
    g.rotation.y = o.rot || 0;
    S.scene.add(g);
    const { cut, box } = setPrint(g, o.print ?? 1);
    if (P.nozzle && o.print < 1) { const nz = nozzle(); S.scene.add(nz); placeNozzle(nz, cut, box, 1.1, {}); }
  }
  if (P.shadow) { const sh = contactShadow(1.4, 0.3); S.scene.add(sh); }
  if (P.snow) { const sn = particles(320, { spread: [7, 9, 3], size: 0.04 }); sn.position.set(0, 1.2, -1.4); sn.userData.update(3.3); S.scene.add(sn); }
  frameCam(S.camera, ...P.cam);
}

export function renderAt() { S.render(); }
