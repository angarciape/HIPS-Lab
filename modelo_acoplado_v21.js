/* HIPS LAB v21: red de caminos con caudal conservativo por árbol, pérdida de
   presión equivalente de ranura y Cross-WLF no isotérmico (HIPS PH-60).
   No resuelve Hele-Shaw 2D/3D ni predice presión verdadera en la cavidad.
   Espesores, compuerta, ancho hidráulico y residencia móvil son SUPUESTOS.
*/
(function(root){'use strict';
const H=root.HipsThermal,R=root.HipsRheology;
const WIDTH_EQUIV_M=0.30; // ancho paralelo efectivo SUPUESTO, no medido
const MOBILITY_AGE_FACTOR=0.12; // exposición de la corriente al molde, SUPUESTA
const TEMP_MIN_C=170,TEMP_MAX_C=240; // rango de calibración reológica
const KG=.462;
function between(x,a,b){return Math.max(a,Math.min(x,b));}
function calculate(front,opts){
 const n=front.NX*front.NY,fillSec=+opts.injection,melt=+opts.melt,to=+opts.water,flow=+opts.flow;
 const width=WIDTH_EQUIV_M*(opts.widthScale??1),residence=MOBILITY_AGE_FACTOR*(opts.residenceScale??1),etaScale=opts.etaScale??1;
 if(![width,residence,etaScale].every(v=>Number.isFinite(v)&&v>0))throw Error('Escalas reológicas inválidas');
 if(!(fillSec>0&&melt>=200&&melt<=240&&flow>0&&front.parent&&front.parent.length===n))throw Error('Parámetros de acoplamiento inválidos');
 const wall=H.moldTemperature(to,flow),rho=H.rho(melt),Q=KG/rho/fillSec;
 const pPa=new Float64Array(n),Tflow=new Float64Array(n),eta=new Float64Array(n),gamma=new Float64Array(n),subtree=new Float64Array(front.volume),qEdge=new Float64Array(n);
 let outOfRange=0, pressureMax=0,tempMin=1e6,tempMax=-1e6,etaMin=1e100,etaMax=0;
 // Consistencia del reparto de caudal: suma de volúmenes descendientes en cada rama.
 for(let a=front.order.length-1;a>=0;a--){let i=front.order[a],parent=front.parent[i];if(parent>=0)subtree[parent]+=subtree[i];}
 const dx=front.W/front.NX/1000,dy=front.H/front.NY/1000;
 for(const i of front.order){
   const h=front.thickness[i]/1000,frac=front.arrival[i],parent=front.parent[i];
   const effectiveAge=fillSec*frac*residence;
   const Tref=.5*(melt+wall),alpha=(opts.kScale??1)*H.k(Tref)/(H.rho(Tref)*(opts.cpScale??1)*H.cp(Tref));
   const tLocal=wall+(melt-wall)*Math.exp(-4*alpha*effectiveAge/(h*h));
   Tflow[i]=tLocal;
   if(tLocal<TEMP_MIN_C||tLocal>TEMP_MAX_C)outOfRange++;
   const tEval=between(tLocal,TEMP_MIN_C,TEMP_MAX_C);
   const q=parent<0?Q:Q*(subtree[i]/front.total);
   qEdge[i]=q;
   // Magnitud de cizallamiento nominal de ranura; sin resolver la velocidad local.
   const g=Math.max(1,6*q/(width*h*h));
   gamma[i]=g;eta[i]=R.viscosity(tEval,g,opts)*etaScale;
   if(parent>=0){
     const ix=i%front.NX,px=parent%front.NX,iy=Math.floor(i/front.NX),py=Math.floor(parent/front.NX);
     const dl=Math.hypot((ix-px)*dx,(iy-py)*dy),hMean=(h+front.thickness[parent]/1000)/2;
     const dp=12*eta[i]*q*dl/(width*Math.pow(hMean,3));
     pPa[i]=pPa[parent]+dp;
   }
   pressureMax=Math.max(pressureMax,pPa[i]);tempMin=Math.min(tempMin,tLocal);tempMax=Math.max(tempMax,tLocal);
   etaMin=Math.min(etaMin,eta[i]);etaMax=Math.max(etaMax,eta[i]);
 }
 const samples=[];
 for(let f=.05;f<=1.00001;f+=.05){
  let maxP=0,minT=Infinity,meanT=0,count=0;
  for(let i=0;i<n;i++)if(front.arrival[i]<=f){maxP=Math.max(maxP,pPa[i]);minT=Math.min(minT,Tflow[i]);meanT+=Tflow[i];count++;}
  samples.push({fraction:+f.toFixed(4),timeS:+(f*fillSec).toFixed(4),pressureBar:maxP/1e5,minT_C:minT,meanT_C:count?meanT/count:melt});
 }
 const sourceP=pressureMax/1e5;
 function atFraction(f){f=between(f,0,1);if(f<=0)return {pressureBar:0,minT_C:melt,meanT_C:melt};let k=Math.min(samples.length-1,Math.max(0,Math.ceil(f*20)-1));return samples[k];}
 return {NX:front.NX,NY:front.NY,gate:front.gate,pressureBar:pPa.map(x=>x/1e5),temperatureC:Tflow,viscosityPaS:eta,shearS:gamma,flowEdgeM3S:qEdge,subtreeVolume:subtree,
   qCm3S:Q*1e6,maxPressureBar:sourceP,minTemperatureC:tempMin,maxTemperatureC:tempMax,etaMinPaS:etaMin,etaMaxPaS:etaMax,
   outOfRangeCells:outOfRange,warning:outOfRange?`${outOfRange} celdas bajo 170 °C: Cross-WLF evaluado al límite inferior, sin validez confirmada.`:'Temperaturas dentro del rango reológico.',
   wallC:wall,samples,atFraction,
   assumptions:{widthEquivalentM:width,mobileResidenceFactor:residence,viscositySource:'HIPS PH-60; Cross-WLF publicado',method:'Árbol de caminos de menor resistencia, flujo volumétrico por volumen descendiente y ranura equivalente; NO resolución Hele-Shaw'}
 };
}
function exportCSV(front,coupled,fillS){const lines=['x_mm;y_mm;espesor_mm;tiempo_llegada_s;T_flujo_aprox_C;viscosidad_Pa_s;cizallamiento_1_s;deltaP_camino_bar;caudal_rama_cm3_s'];
 for(let j=0;j<front.NY;j++)for(let i=0;i<front.NX;i++){let n=j*front.NX+i;lines.push([((i+.5)*front.W/front.NX).toFixed(2),((j+.5)*front.H/front.NY).toFixed(2),front.thickness[n].toFixed(3),(front.arrival[n]*fillS).toFixed(3),coupled.temperatureC[n].toFixed(2),coupled.viscosityPaS[n].toFixed(2),coupled.shearS[n].toFixed(1),coupled.pressureBar[n].toFixed(2),(coupled.flowEdgeM3S[n]*1e6).toFixed(3)].join(';'));}
 return '\ufeff'+lines.join('\r\n');}
const out={calculate,exportCSV,WIDTH_EQUIV_M,MOBILITY_AGE_FACTOR};root.HipsCoupled=out;
if(typeof module!=='undefined'&&module.exports)module.exports=out;
})(typeof window!=='undefined'?window:globalThis);
