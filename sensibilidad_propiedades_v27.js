/* HIPS LAB v27 — OFAT con parámetros termofísicos y reológicos perturbados.
 * Perturbaciones de usuario, NO incertidumbres estimadas con ensayos.
 * No altera parámetros ni ecuaciones del caso de referencia.
 */
(function(root){'use strict';
const H=root.HipsThermal,B=root.HipsBalances,C=root.HipsCoupled,F=root.HipsFlowFront;
const thermal=[
  {key:'cpScale',label:'Calor específico Cp(T)',unit:'factor',lo:.90,hi:1.10,description:'−10 % / +10 %'},
  {key:'kScale',label:'Conductividad térmica k(T)',unit:'factor',lo:.85,hi:1.15,description:'−15 % / +15 %'},
  {key:'contactScale',label:'Contacto térmico con molde (h)',unit:'factor',lo:.70,hi:1.30,description:'−30 % / +30 %'},
];
const rheology=[
  {key:'etaScale',label:'Viscosidad efectiva (factor)',unit:'factor',lo:.75,hi:1.25,description:'−25 % / +25 %'},
  {key:'tauScale',label:'Esfuerzo Cross-WLF τ*',unit:'factor',lo:.80,hi:1.20,description:'−20 % / +20 %'},
  {key:'nShift',label:'Exponente Cross-WLF n',unit:'adim.',lo:-.05,hi:.05,description:'−0.05 / +0.05 respecto a n=0.293'},
  {key:'widthScale',label:'Ancho hidráulico equivalente',unit:'factor',lo:.80,hi:1.20,description:'−20 % / +20 %'},
];
function estimate(params,front){
 const p={...params};
 const fm=front||F.simulate(p);
 const sim=H.simulate(p);
 const tcycle=15+6+p.injection+p.hold+p.cool+6+5;
 const balance=B.calculate(p,sim,tcycle,p.deltaWater??1);
 const coupled=C.calculate(fm,p);
 return {panelC:H.zoneEnd(sim,0).center,
  coolKJ:balance.moldEnergyKJ,heatKJ:balance.heatKJ,
  pressureBar:coupled.maxPressureBar,minFlowC:coupled.minTemperatureC,
  outOfRangeCells:coupled.outOfRangeCells};
}
function calculate(base,group){
 if(!['termica','reologia'].includes(group))throw new Error('Grupo de sensibilidad desconocido');
 const values={...base};
 const front=F.simulate(values);
 const b=estimate(values,front);
 const list=group==='termica'?thermal:rheology;
 const rows=list.map(cfg=>{
  let low=estimate({...values,[cfg.key]:cfg.key==='nShift'?cfg.lo:cfg.lo},front);
  let high=estimate({...values,[cfg.key]:cfg.key==='nShift'?cfg.hi:cfg.hi},front);
  return {...cfg,low,high,
    span:{panelC:Math.abs(high.panelC-low.panelC),coolKJ:Math.abs(high.coolKJ-low.coolKJ),
       pressureBar:Math.abs(high.pressureBar-low.pressureBar),minFlowC:Math.abs(high.minFlowC-low.minFlowC)}};
 });
 return {mode:'OFAT exploratorio; no validado',group,base:b,rows,
  context:'Térmica 1D por zonas; caída de presión y flujo en red equivalente; HIPS comparable'};
}
root.HipsSensitivityV27={calculate,estimate,thermal,rheology};
if(typeof module!=='undefined'&&module.exports)module.exports=root.HipsSensitivityV27;
})(typeof window!=='undefined'?window:globalThis);
