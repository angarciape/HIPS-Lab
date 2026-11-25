/* Pruebas independientes: posiciones de tornillo, reconciliación contable, mallas y consistencia. */
'use strict';
const assert=require('node:assert/strict');
const H=require('./modelo_termico.js'), R=require('./modelo_reologia_v19.js'), F=require('./modelo_frente_v20.js'), C=require('./modelo_acoplado_v21.js');
const S=require('./modelo_tornillo_v26.js'),V=require('./verificacion_malla_v26.js');
const p={hopper:22,masterbatch:2,water:53.3,melt:230,flow:6,deltaWater:1,packP:30,thickness:1.72,injection:9,hold:8,cool:34,gate:'centro'};
const durations=[15,6,p.injection,p.hold,p.cool,6,5],phase=[];
for(let i=0,acc=0;i<durations.length;i++){let d=durations[i];phase.push({start:acc,end:acc+d,duration:d});acc+=d;}
const stroke=S.strokeMm(p.melt,H.rho);
assert.ok(stroke>105&&stroke<115,'Carrera derivada del diámetro y disparo');
const at=t=>S.positionMm(t,phase,stroke);
assert.ok(Math.abs(at(0))<1e-10);
assert.ok(Math.abs(at(15)-stroke)<1e-10);
assert.ok(Math.abs(at(21)-stroke)<1e-10);
assert.ok(Math.abs(at(25.5)-stroke/2)<1e-10);
assert.ok(Math.abs(at(30))<1e-10);
assert.ok(Math.abs(at(83))<1e-10);
for(let t=0;t<=83;t+=.25){assert.ok(at(t)>=-1e-8&&at(t)<=stroke+1e-8);}
for(let t=0;t<15;t+=.25){assert.ok(at(t+.25)>=at(t)-1e-8,'retroceso monótono');}
for(let t=21;t<30;t+=.25){assert.ok(at(t+.25)<=at(t)+1e-8,'avance monótono');}
const center=F.simulate(p),rec=V.reconcile(center,p.melt);
assert.ok(Math.abs(rec.rawCm3-403.7637)<0.01);
assert.ok(Math.abs(rec.targetCm3-483.979)<0.03);
assert.ok(rec.factor>1.1&&rec.factor<1.3);
assert.ok(Math.abs(rec.bookkeepingGapPct)<1e-10);
const v=V.convergence(p);
assert.equal(v.rows.length,3);assert.equal(v.rows[1].cells,4355);
for(let i=0;i<v.rows.length;i++){
 const row=v.rows[i];assert.ok(Number.isFinite(row.pressureBar)&&row.pressureBar>0);
 assert.ok(row.timePanelS>0&&row.timeSideS>0);
 assert.ok(row.volumeCm3>380&&row.volumeCm3<425);
}
assert.ok(Math.abs(v.diffVsFinePct.volume)<2.0,'volumen media/fina difiere menos de 2 %');
assert.ok(Math.abs(v.diffVsFinePct.pressure)<5.0,'presión estimada media/fina difiere menos de 5 % para este escenario');
// Se mantienen las cinco entradas y la conservación volumétrica con mallas distintas.
let checks=0;
for(const gate of Object.keys(F.gates)){
 for(const grid of [[33,35],[65,67],[97,101]]){
  const model=F.simulate({...p,gate,NX:grid[0],NY:grid[1]});
  const volSum=model.volume.reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(volSum-model.total)<1e-6);
  for(const zone of model.regions)assert.ok(zone.fraction>=0&&zone.fraction<=1,'todas las regiones finitas');
  checks++;
 }
}
console.log(`OK v26: cinemática del tornillo, volumen reconciliado por factor CONTABLE, 3 niveles de refinamiento, ${checks} mallas de 5 entradas distintas.`);
console.log(`Carrera inferida: ${stroke.toFixed(2)} mm; crudo=${rec.rawCm3.toFixed(2)} cm³, fundido=${rec.targetCm3.toFixed(2)} cm³, factor=${rec.factor.toFixed(4)}.`);
console.log('Mallas:',v.rows.map(x=>`${x.NX}x${x.NY}: volumen ${x.volumeCm3.toFixed(1)}, ΔP ${x.pressureBar.toFixed(2)} bar`).join(' | '));
