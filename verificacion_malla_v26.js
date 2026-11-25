/* Verificación malla y reconciliación VOLUMÉTRICA CONTABLE v26.
 * No fuerza espesores ni altera la geometría hidráulica calibrada.
 * Multiplicar volúmenes equivalentes NO significa validar el CAD.
 */
(function(root){'use strict';
const H=root.HipsThermal,F=root.HipsFlowFront,C=root.HipsCoupled;
const SCALE_SHOT_KG=0.462;
function reconcile(front,meltC){
 const rawCm3=front.total/1000;
 const targetCm3=SCALE_SHOT_KG/H.rho(meltC)*1e6;
 const factor=targetCm3/rawCm3;
 return {rawCm3,targetCm3,factor,bookkeepingCm3:rawCm3*factor,rawGapPct:(rawCm3/targetCm3-1)*100,bookkeepingGapPct:(rawCm3*factor/targetCm3-1)*100};
}
function convergence(params){
 const specs=[[33,35],[65,67],[97,101]];
 const rows=[];
 for(const [nx,ny] of specs){
   const f=F.simulate({...params,NX:nx,NY:ny}),c=C.calculate(f,params),v=reconcile(f,params.melt);
   const center=F.sample(f,.50,.28)*params.injection;
   const side=F.sample(f,.97,.30)*params.injection;
   rows.push({NX:nx,NY:ny,cells:nx*ny,volumeCm3:v.rawCm3,accountFactor:v.factor,
       timePanelS:center,timeSideS:side,pressureBar:c.maxPressureBar,
       outOfRangeCells:c.outOfRangeCells});
 }
 const ref=rows[1], fine=rows[2];
 return {rows,diffVsFinePct:{volume:(ref.volumeCm3/fine.volumeCm3-1)*100,
   timePanel:fine.timePanelS?100*(ref.timePanelS/fine.timePanelS-1):0,
   timeSide:fine.timeSideS?100*(ref.timeSideS/fine.timeSideS-1):0,
   pressure:fine.pressureBar?100*(ref.pressureBar/fine.pressureBar-1):0},
   message:'Cambios entre discretizaciones: comparaciones de sensibilidad, no prueba de convergencia ni validación del molde.'};
}
const api={reconcile,convergence};root.HipsGridCheckV26=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
