/* HIPS LAB v22 · sensibilidad OFAT (una variable por vez).
   Muestra RANGOS EXPLORATORIOS de las ecuaciones existentes, NO intervalos de confianza.
   Basado en HipsThermal, HipsBalances y HipsRheology de las versiones anteriores.
*/
(function(root){'use strict';
const H=root.HipsThermal,B=root.HipsBalances,R=root.HipsRheology;
function estimate(p){
  const sim=H.simulate(p);
  const cycle=15+6+p.injection+p.hold+p.cool+6+5;
  const balance=B.calculate(p,sim,cycle,p.deltaWater||1);
  const flow=R.approximateFlow(p);
  return {panelC:H.zoneEnd(sim,0).center,heatKJ:balance.moldEnergyKJ,pressureBar:flow.deltaPBar};
}
const scenarios=[
 {key:'water',label:'Agua de suministro TO',units:'°C',span:8,min:40,max:70},
 {key:'thickness',label:'Espesor del panel',units:'mm',span:0.2,min:1.2,max:3.3},
 {key:'melt',label:'Fundido / boquilla',units:'°C',span:10,min:200,max:240},
 {key:'injection',label:'Tiempo de inyección',units:'s',span:3,min:4,max:14}
];
function calculate(base){
 const p={...base};
 const initial=estimate(p);
 const rows=scenarios.map(cfg=>{
  const low=Math.max(cfg.min,p[cfg.key]-cfg.span),high=Math.min(cfg.max,p[cfg.key]+cfg.span);
  const below=estimate({...p,[cfg.key]:low});
  const above=estimate({...p,[cfg.key]:high});
  return {label:cfg.label,units:cfg.units,low,high,below,above,
    spreads:{panelC:Math.abs(above.panelC-below.panelC),heatKJ:Math.abs(above.heatKJ-below.heatKJ),pressureBar:Math.abs(above.pressureBar-below.pressureBar)}};
 });
 return {base:initial,rows,mode:'OFAT, no validado'};
}
root.HipsSensitivityV22={calculate,estimate,scenarios};
if(typeof module!=='undefined'&&module.exports)module.exports=root.HipsSensitivityV22;
})(typeof window!=='undefined'?window:globalThis);
