import fs from 'node:fs';
import * as MC from '../../public/js/meshcore.js';
function readSTL(p){const b=fs.readFileSync(p);const n=b.readUInt32LE(80);const pos=new Float32Array(n*9);for(let i=0;i<n;i++){for(let k=0;k<9;k++)pos[i*9+k]=b.readFloatLE(84+i*50+12+k*4)}return pos}
for (const f of ['caja','llavero']){
const pos = MC.removeDegenerate(readSTL(`public/samples/${f}.stl`));
const t = MC.buildTopology(pos); const sh=MC.shells(t);
let open=0; for (const v of t.nbr) if (v<0) open++;
const st=MC.groupStats(pos,t,sh.label,sh.count);
console.log(f,t.nF,'open',open,sh.count, st.map(s=>s.faces+':'+s.minZ.toFixed(1)+'-'+s.maxZ.toFixed(1)).join(' '));
}
