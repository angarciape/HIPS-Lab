/* HIPS LAB v19 — balances por ciclo en unidades SI.
 * Base: 1 pieza de 462 g, sin colada o descarte de ciclo, mezcla ideal.
 * Cp(T) de HIPS se utiliza como aproximación para el 2% de masterbatch.
 * Balances respecto a la temperatura de tolva. NO representa consumo eléctrico.
 */
(function(root){'use strict';
const M=root.HipsMix,H=root.HipsThermal;
const WATER_CP_KJKGK=4.18,WATER_RHO_KG_L=0.99,US_GAL_L=3.785411784;
const weightSum=H.zones.reduce((sum,z)=>sum+z.weight,0);
if(Math.abs(weightSum-1)>1e-8)throw new Error('Las ponderaciones de zonas no suman 100%');
function calculate(params,sim,cycleTimeS,deltaReturnC=1){
 const c=M.composition(params.masterbatch),massKg=c.totalG/1000,cpScale=params.cpScale??1;
 let stored=0,removed=0;
 const byZone=[];
 for(let i=0;i<sim.profiles.length;i++){
   const wt=H.zones[i].weight,Tavg=H.zoneEnd(sim,i).average;
   const qStore=massKg*wt*H.integrateCp(params.hopper,Tavg)*cpScale/1000;
   const qCool=massKg*wt*H.integrateCp(Tavg,params.melt)*cpScale/1000;
   stored+=qStore;removed+=qCool;
   byZone.push({name:H.zones[i].name,weight:wt,averageC:Tavg,qStoredKJ:qStore,qRemovedKJ:qCool});
 }
 const heat=massKg*H.integrateCp(params.hopper,params.melt)*cpScale/1000;
 const waterKgS=params.flow*US_GAL_L/60*WATER_RHO_KG_L;
 const qWater=waterKgS*WATER_CP_KJKGK*deltaReturnC*cycleTimeS;
 const deltaRequired=removed/(waterKgS*WATER_CP_KJKGK*cycleTimeS);
 return {
   composition:c,massInputG:c.totalG,massOutputG:c.totalG,materialLossG:0,
   massAccumG:0,massResidualG:0,
   heatKJ:heat,pieceEnergyKJ:stored,moldEnergyKJ:removed,
   energyResidualKJ:heat-stored-removed,
   qWaterKJ:qWater,deltaFromAssumedC:deltaReturnC,
   fromAssumedC:params.water+deltaReturnC,fromRequiredC:params.water+deltaRequired,deltaRequiredC:deltaRequired,
   waterDifferenceKJ:qWater-removed,waterMassKg:waterKgS*cycleTimeS,
   cycleTimeS,byZone,cpMasterbatchAssumption:'Cp de HIPS utilizado también para masterbatch',
   massAssumption:'Sin colada, rebabas ni pérdida por ciclo; inventario constante'
 };
}
const api={calculate,waterConstants:{WATER_CP_KJKGK,WATER_RHO_KG_L,US_GAL_L}};
root.HipsBalances=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
