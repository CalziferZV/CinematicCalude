import fs from 'node:fs';
import * as S from '../../public/js/state.js';
function readSTL(p){const b=fs.readFileSync(p);const n=b.readUInt32LE(80);const pos=new Float32Array(n*9);for(let i=0;i<n;i++){for(let k=0;k<9;k++)pos[i*9+k]=b.readFloatLE(84+i*50+12+k*4)}return pos}
S.loadMesh(readSTL('public/samples/placa-relieve.stl'), 'placa');
let open=0; for (const v of S.topo().nbr) if (v<0) open++;
console.log('open', open, 'faces', S.topo().nF);
console.log(S.autoSegment('smart'));
for (const p of S.sceneSummary().parts) console.log(p.name, p.triangles, p.surface_pct, p.z_range_mm);
