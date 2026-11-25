/* HIPS LAB v29 - verificación cruzada código/documento/resultado.
 * Cada comprobación es numérica o funcional, no validación física externa.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('./modelo_termico.js');
require('./modelo_tornillo_v26.js');
require('./modelo_mezcla_v18.js');
require('./modelo_balances_v19.js');
require('./modelo_reologia_v19.js');
const F=require('./modelo_frente_v20.js');
const C=require('./modelo_acoplado_v21.js');
const H=globalThis.HipsThermal, M=globalThis.HipsMix, B=globalThis.HipsBalances, R=globalThis.HipsRheology, S=globalThis.HipsScrewV26;
const base={hopper:22,masterbatch:2,water:53.3,melt:230,flow:6,deltaWater:1,packP:30,thickness:1.72,injection:9,hold:8,cool:34,gate:'centro'};
const sim=H.simulate(base), front=F.simulate(base), coupled=C.calculate(front,base);
const bal=B.calculate(base,sim,83,1), mix=M.composition(2), flow=R.approximateFlow(base),pvt=R.tait(base.melt,base.packP);
function near(a,b,eps,label){assert.ok(Math.abs(a-b)<=eps,`${label}: ${a} != ${b}`)}
let checks=[];
function check(name,fn){fn();checks.push({name,result:'CORRECTO'});}
check('Dosificación 98/2 y conservación de masa',()=>{near(mix.hipsG,452.76,1e-8,'hips');near(mix.mbG,9.24,1e-8,'mb');near(mix.hipsG+mix.mbG,462,1e-8,'masa');});
check('Tiempo del ciclo 83 s, etapa térmica 42 s',()=>{near(15+6+base.injection+base.hold+base.cool+6+5,83,1e-9,'ciclo');near(sim.tmax,42,1e-9,'enfriamiento');});
check('Cp por tramos, entalpía 177.92 kJ',()=>{near(bal.heatKJ,177.922,0.15,'calor');near(H.integrateCp(22,230)*.462/1000,bal.heatKJ,1e-8,'integral');});
check('Conservación algebraica de calor',()=>{near(bal.heatKJ,bal.moldEnergyKJ+bal.pieceEnergyKJ,1e-5,'energía');near(bal.moldEnergyKJ,154.77,0.25,'q molde');near(bal.pieceEnergyKJ,23.15,0.25,'q pieza');});
check('Agua - diferencia hipotética, no validación real',()=>{near(bal.qWaterKJ,130.0,0.3,'agua');assert.ok(bal.qWaterKJ<bal.moldEnergyKJ);near(bal.deltaRequiredC,bal.moldEnergyKJ/(bal.waterMassKg*4.18),1e-12,'delta agua');});
check('Malla 65x67 y volumen geométrico',()=>{assert.equal(front.NX,65);assert.equal(front.NY,67);near(front.total/1000,403.8,0.3,'V malla');assert.ok(front.total>0);});
check('Diferencia malla vs masa/densidad NO escondida',()=>{const vshot=0.462/H.rho(230)*1e6;near(vshot,484,0.5,'V fundido');assert.ok(Math.abs(1-front.total/1000/vshot)>.1);});
check('Llenado - monotonicidad y fracciones',()=>{assert.ok(front.arrival.every(x=>x>=0&&x<=1));for(let i=1;i<front.order.length;i++)assert.ok(front.arrival[front.order[i]]>=front.arrival[front.order[i-1]]);near(front.filledAt(1),1,1e-12,'lleno');});
check('Cross-WLF y caudal: grado PH-60, no 478',()=>{near(flow.viscosityPaS,156.16,.5,'viscosidad');near(flow.flowCm3S,53.78,.1,'caudal');near(flow.deltaPBar,95.1,.6,'ranura');});
check('Red acoplada: pérdida de presión equivalente',()=>{near(coupled.maxPressureBar,87.2,1.0,'red');assert.ok(coupled.minTemperatureC<base.melt);});
check('PVT modelo tipo Tait estimación',()=>{near(pvt.compressionPct,2.31,.05,'PVT');assert.ok(pvt.compressionPct>0);});
check('Contracción libre panel, distinta del valor de ficha',()=>{const v=M.shrinkPct(H.zoneEnd(sim,0).average,base.masterbatch);near(v,.305,.02,'shrink');});
check('Carrera del tornillo inferida, con D=75 mm',()=>{const stroke=S.strokeMm(base.melt,H.rho);near(stroke,109.6,1.0,'stroke');const phases=[{start:0,end:15,duration:15},{start:15,end:21,duration:6},{start:21,end:30,duration:9}];near(S.positionMm(15,phases,stroke),stroke,1e-9,'retroceso');near(S.positionMm(25.5,phases,stroke),stroke/2,1e-9,'avance');});
check('Entradas sin temperatura de retorno medida',()=>{assert.equal(bal.fromAssumedC,54.3);assert.ok(base.deltaWater>0);});
const output={version:'29',date:'2026-11-24',scenario:base,checks,values:{hipsG:mix.hipsG,mbG:mix.mbG,cycleS:83,thermalS:sim.tmax,heatKJ:bal.heatKJ,coolKJ:bal.moldEnergyKJ,retainedKJ:bal.pieceEnergyKJ,waterKJ:bal.qWaterKJ,waterRequiredDeltaC:bal.deltaRequiredC,meshCm3:front.total/1000,shotMeltCm3:0.462/H.rho(230)*1e6,viscosityPaS:flow.viscosityPaS,flowCm3S:flow.flowCm3S,slotBar:flow.deltaPBar,pathBar:coupled.maxPressureBar,pvtCompressionPct:pvt.compressionPct,shrinkPanelPct:M.shrinkPct(H.zoneEnd(sim,0).average,2),screwStrokeMm:S.strokeMm(230,H.rho)},warnings:[
 'Las correlaciones de Cp/k/densidad combinan grados bibliográficos y extrapolaciones.',
 'La malla no reproduce el volumen exacto de pieza ni canales de molde.',
 'FROM del agua no medida: comparación energética no validada.',
 'La presión de red es pérdida relativa, no lectura de cavidad ni hidráulica.',
 'El modelo PVT de un dominio y la contracción libre no predicen contracción de moldeo.',
 'Recorrido del tornillo inferido; dosificación y movimientos visuales esquemáticos.'
]};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2),'utf8');
console.log(`v29: ${checks.length} comprobaciones numéricas de consistencia aprobadas`);console.log(JSON.stringify(output.values,null,2));
