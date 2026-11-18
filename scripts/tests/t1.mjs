import fs from 'node:fs';
import * as S from '/home/user/CinematicCalude/public/js/state.js';
function readSTL(p){const b=fs.readFileSync(p);const n=b.readUInt32LE(80);const pos=new Float32Array(n*9);for(let i=0;i<n;i++){for(let k=0;k<9;k++)pos[i*9+k]=b.readFloatLE(84+i*50+12+k*4)}return pos}
for (const f of ['trofeo','llavero','caja']) {
  S.loadMesh(readSTL(`public/samples/${f}.stl`), f);
  console.time(f);
  const notes = S.autoSegment('smart');
  console.timeEnd(f);
  const sum = S.sceneSummary();
  console.log(f, sum.size_mm, sum.triangles, notes);
  for (const p of sum.parts) console.log('   ', p.id, p.name, p.role, p.triangles, p.surface_pct+'%', p.z_range_mm);
  for (const m of ['shells','regions','heights']) { const n=S.autoSegment(m); console.log('  ',m, S.S.parts.length, n.join('; ')); }
}
S.undo(); console.log('undo ok', S.S.parts.length);
