/* Verificaciones independientes, sin navegador: ejecutarlas con node probar_sensibilidad_v27.js */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const H=require('./modelo_termico.js');
const M=require('./modelo_mezcla_v18.js');
const B=require('./modelo_balances_v19.js');
const R=require('./modelo_reologia_v19.js');
const F=require('./modelo_frente_v20.js');
const C=require('./modelo_acoplado_v21.js');
const S=require('./sensibilidad_propiedades_v27.js');
const p=Object.freeze({hopper:22,masterbatch:2,water:53.3,melt:230,flow:6,thickness:1.72,injection:9,hold:8,cool:34,deltaWater:1,packP:30,gate:'centro'});
const fm=F.simulate(p),baselineThermal=H.simulate(p),baselineC=C.calculate(fm,p),baseB=B.calculate(p,baselineThermal,83,1);
let checks=0;
function close(a,b,tol,label){assert.ok(Math.abs(a-b)<=tol,`${label}: ${a} vs ${b}`);checks++;}
function yes(x,label){assert.ok(x,label);checks++;}
close(baseB.heatKJ,177.92189592633514,.01,'calentamiento v26');
close(baseB.moldEnergyKJ,154.774808656723,.01,'calor v26');
close(baselineC.maxPressureBar,87.2250123415,.01,'presion v26');
const previousPressure=R.viscosity(230,100);
close(R.viscosity(230,100),previousPressure,0,'Cross-WLF no modificado');
for(const group of ['termica','reologia']){
 const out=S.calculate(p,group);
 close(out.base.panelC,H.zoneEnd(baselineThermal,0).center,1e-8,`temperatura base ${group}`);
 close(out.base.pressureBar,baselineC.maxPressureBar,1e-8,`presion base ${group}`);
 yes(out.rows.length=== (group==='termica'?3:4),`numero parámetros ${group}`);
 for(const row of out.rows){
  for(const edge of [row.low,row.high]) for(const key of ['panelC','coolKJ','pressureBar','minFlowC'])yes(Number.isFinite(edge[key]),`${row.key} ${key}`);
 }
}
const tp=S.calculate(p,'termica'),rp=S.calculate(p,'reologia');
yes(tp.rows.find(r=>r.key==='cpScale').high.heatKJ>tp.rows.find(r=>r.key==='cpScale').low.heatKJ,'mayor Cp requiere mas calor');
yes(tp.rows.find(r=>r.key==='kScale').high.minFlowC<tp.rows.find(r=>r.key==='kScale').low.minFlowC,'mayor k enfria fundido en red');
yes(rp.rows.find(r=>r.key==='etaScale').high.pressureBar>rp.rows.find(r=>r.key==='etaScale').low.pressureBar,'viscosidad eleva DP');
yes(rp.rows.find(r=>r.key==='widthScale').high.pressureBar<rp.rows.find(r=>r.key==='widthScale').low.pressureBar,'mayor ancho reduce DP');
yes(rp.rows.find(r=>r.key==='tauScale').high.pressureBar>rp.rows.find(r=>r.key==='tauScale').low.pressureBar,'tau eleva DP en modelo');
const html=fs.readFileSync('./index.html','utf8'),app=fs.readFileSync('./app.js','utf8');
yes(!html.includes('<option value="temperature">'),'selector sin temperatura');
yes(html.includes('azul = menor')&&html.includes('rojo = mayor'),'leyenda inequívoca');
yes(html.includes('sensibilidad_propiedades_v27.js'),'modulo conectado');
yes(app.includes("$('pressureHigh').textContent"),'gradiente dinámico con bar');
close(H.zoneEnd(H.simulate(p),0).center,H.zoneEnd(baselineThermal,0).center,1e-8,'parametros globales no mutados');
console.log(`OK v27: ${checks} comprobaciones de sensibilidad, referencia, signo, estructura y no-mutación.`);
console.log('Presión referencia red:',baselineC.maxPressureBar.toFixed(2),'bar');
console.log('η factor ±25%:',rp.rows.find(r=>r.key==='etaScale').low.pressureBar.toFixed(2),'→',rp.rows.find(r=>r.key==='etaScale').high.pressureBar.toFixed(2),'bar');
