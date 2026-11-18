import * as THREE from 'three';
import * as MC from '../../public/js/meshcore.js';
for (const [n,g0] of [['sphere',new THREE.SphereGeometry(5,24,12)],['lathe',new THREE.LatheGeometry([[0,0],[10,0],[10,5],[0,8]].map(([x,y])=>new THREE.Vector2(x,y)),16)]]) {
const g=g0.toNonIndexed();
const pos = g.attributes.position.array;
const t = MC.buildTopology(pos);
let open=0; for (const v of t.nbr) if (v<0) open++;
console.log(n,'faces',t.nF,'verts',t.nV,'open',open, MC.shells(t).count);
}
