/* Pruebas de regresión para ejecutar con node probar_modelos_v19.js (Node opcional). */
const assert=require('node:assert/strict');
const H=require('./modelo_termico.js');
const M=require('./modelo_mezcla_v18.js');
const B=require('./modelo_balances_v19.js');
const R=require('./modelo_reologia_v19.js');
const base={hopper:22,masterbatch:2,water:53.3,melt:230,flow:6,deltaWater:1,packP:30,thickness:1.72,injection:9,hold:8,cool:34};
let count=0;
for(let mb of [0,2,5,8])for(let melt of [200,230,240])for(let water of [45,53.3,65]){
 let p={...base,masterbatch:mb,melt,water};
 const s=H.simulate(p),b=B.calculate(p,s,83,1),r=R.approximateFlow(p);
 assert(Math.abs(b.massInputG-b.massOutputG)<1e-10);
 assert(Math.abs(b.energyResidualKJ)<1e-8);
 assert(b.moldEnergyKJ>0&&b.pieceEnergyKJ>0&&b.heatKJ>0);
 assert(Number.isFinite(r.deltaPBar)&&r.deltaPBar>0);
 assert(Math.abs((b.composition.hipsG+b.composition.mbG)-462)<1e-9);
 count++;
}
assert(R.viscosity(210,1000)>R.viscosity(230,1000));
assert(R.tait(230,50).compressionPct>R.tait(230,20).compressionPct);
const start=B.calculate(base,H.simulate(base),83,1);
assert(Math.abs(start.heatKJ-177.92)<.15);
assert(Math.abs(start.moldEnergyKJ-154.77)<.3);
console.log(`OK: ${count} escenarios de masa, energía y presión; comprobaciones reológicas y PVT.`);
