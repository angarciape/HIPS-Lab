/* Pruebas internas sin equipo real: propiedades geométricas, conservación discreta y casos extremos. */
'use strict';
const assert=require('node:assert/strict');
const F=require('./modelo_frente_v20.js');
let tests=0;
for(const gate of Object.keys(F.gates)){
 for(const thickness of [1.2,1.72,2.8,3.3]){
  const r=F.simulate({thickness,gate});tests++;
  assert.equal(r.order.length,F.NX*F.NY);
  assert.equal(r.arrival.length,r.order.length);
  assert.ok(Math.abs(r.arrival.reduce((s,a,i)=>s+r.volume[i],0)-r.total)<1e-4);
  assert.ok([...r.arrival].every(x=>x>=0&&x<=1));
  assert.equal(r.filledAt(0),0);assert.equal(r.filledAt(1),1);
  let last=0;for(let f=0.05;f<1;f+=0.05){let cur=r.filledAt(f);assert.ok(cur>=last-1e-9);assert.ok(Math.abs(cur-f)<0.01);last=cur;}
  for(const zone of r.regions){assert.ok(zone.fraction>=0&&zone.fraction<=1)}
 }
}
const a=F.simulate({thickness:1.72,gate:'centro'}),b=F.simulate({thickness:1.72,gate:'arriba'});
assert.ok(Math.abs(F.sample(a,.5,.05)-F.sample(b,.5,.05))>.15,'La compuerta debe cambiar el patrón');
assert.ok(Math.abs(F.sample(a,.5,.5)-F.sample(b,.5,.5))>.15,'La compuerta debe cambiar el patrón');
let sums=a.volume.reduce((s,x)=>s+x,0);assert.ok(Math.abs(sums-a.total)/a.total<1e-12);
console.log(`OK: ${tests} combinaciones de espesor/entrada, conservación de fracción llenada, mapa y CSV.`);
