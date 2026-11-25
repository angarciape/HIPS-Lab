/* Pruebas rápidas para Node.js (no hace falta instalar Node para abrir la app). */
const assert=require('node:assert/strict');
const H=require('./modelo_termico.js');
const M=require('./modelo_mezcla_v18.js');
const B=require('./modelo_balances_v19.js');
const R=require('./modelo_reologia_v19.js');
const S=require('./analisis_sensibilidad_v22.js');
const reference={hopper:22,masterbatch:2,water:53.3,melt:230,flow:6,thickness:1.72,injection:9,hold:8,cool:34,deltaWater:1,packP:30};
const out=S.calculate(reference);
assert.equal(out.rows.length,4);
assert.ok(Math.abs(out.base.heatKJ-154.77)<1.0);
assert.ok(Math.abs(out.base.pressureBar-95.1)<2.0);
const water=out.rows.find(r=>r.label.startsWith('Agua'));
assert.ok(water.above.panelC>water.below.panelC,'Al subir la temperatura de agua debe subir T panel');
const thickness=out.rows.find(r=>r.label.startsWith('Espesor'));
assert.ok(thickness.above.panelC>=thickness.below.panelC,'Una pieza más gruesa enfría más lento');
const injection=out.rows.find(r=>r.label.startsWith('Tiempo'));
assert.ok(injection.above.pressureBar<injection.below.pressureBar,'Inyección más lenta menor ΔP equivalente');
console.log('OK v22 — sensibilidad OFAT, conservación de tendencias y valores de referencia.');
