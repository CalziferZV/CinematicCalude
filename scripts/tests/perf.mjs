import fs from 'node:fs';
import * as MC from '../../public/js/meshcore.js';
import * as S from '../../public/js/state.js';
function readSTL(p){const b=fs.readFileSync(p);const n=b.readUInt32LE(80);const pos=new Float32Array(n*9);for(let i=0;i<n;i++){for(let k=0;k<9;k++)pos[i*9+k]=b.readFloatLE(84+i*50+12+k*4)}return pos}
let pos = MC.removeDegenerate(readSTL('public/samples/trofeo.stl'));
const r = MC.subdivide(pos, new Uint16Array(pos.length/9), 0.35);
console.log('faces', r.pos.length/9);
S.loadMesh(r.pos, 'big');
let t=performance.now(); S.topo(); console.log('topo', (performance.now()-t).toFixed(0),'ms');
t=performance.now(); S.normals(); console.log('normals', (performance.now()-t).toFixed(0),'ms');
t=performance.now(); S.autoSegment('smart'); console.log('smart', (performance.now()-t).toFixed(0),'ms', S.S.parts.map(p=>p.name).join(', '));
t=performance.now(); S.autoSegment('regions'); console.log('regions', (performance.now()-t).toFixed(0),'ms', S.S.parts.length);
let open=0; const tp=S.topo(); for (const v of tp.nbr) if (v<0) open++; console.log('open edges after subdivide', open);
