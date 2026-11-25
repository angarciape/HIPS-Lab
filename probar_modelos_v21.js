'use strict';
const assert=require('node:assert/strict');
require('./modelo_termico.js');require('./modelo_reologia_v19.js');
const F=require('./modelo_frente_v20.js'),C=require('./modelo_acoplado_v21.js');
const base={melt:230,water:53.3,flow:6,thickness:1.72,injection:9,gate:'centro'};
let tests=0;
for(const gate of Object.keys(F.gates)) for(const injection of [5,9,13])for(const melt of [210,230,240]){
 const p={...base,gate,injection,melt},f=F.simulate(p),r=C.calculate(f,p);tests++;
 assert.ok(r.maxPressureBar>0&&Number.isFinite(r.maxPressureBar));
 assert.ok(r.minTemperatureC<=melt&&r.minTemperatureC>r.wallC);
 assert.ok(r.etaMaxPaS>=r.etaMinPaS&&r.etaMinPaS>0);
 assert.ok(r.samples.every((x,i)=>i===0||x.pressureBar>=r.samples[i-1].pressureBar-1e-8));
 assert.ok(r.samples.every((x,i)=>i===0||x.minT_C<=r.samples[i-1].minT_C+1e-8));
 assert.ok(Math.abs(r.subtreeVolume[f.gateIndex]-f.total)/f.total<1e-12,'Conservación del caudal repartido');
 assert.ok(r.temperatureC.every(Number.isFinite));
}
const a=C.calculate(F.simulate(base),base);
const warm=C.calculate(F.simulate({...base,melt:240}),{...base,melt:240});
const fast=C.calculate(F.simulate({...base,injection:5}),{...base,injection:5});
const hotWater=C.calculate(F.simulate({...base,water:65}),{...base,water:65});
assert.ok(warm.maxPressureBar<a.maxPressureBar,'Mayor temperatura del fundido debe reducir la caída');
assert.ok(fast.maxPressureBar>a.maxPressureBar,'Mayor caudal debe elevar la caída');
assert.ok(hotWater.minTemperatureC>a.minTemperatureC,'Agua más caliente debe elevar temperatura de flujo');
assert.ok(Math.abs(a.qCm3S-53.775)<.1);
let csv=C.exportCSV(F.simulate(base),a,base.injection);assert.ok(csv.includes('caudal_rama_cm3_s'));
console.log(`OK: ${tests} escenarios acoplados, reparto de caudal, temperaturas, presiones, tendencias y CSV.`);
console.log(`Referencia: Q=${a.qCm3S.toFixed(2)} cm3/s; ΔPmax=${a.maxPressureBar.toFixed(2)} bar; Tmin=${a.minTemperatureC.toFixed(2)} °C; η=${a.etaMinPaS.toFixed(1)}–${a.etaMaxPaS.toFixed(1)} Pa·s.`);
