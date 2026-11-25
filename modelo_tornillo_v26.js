/* Cinemática ESQUEMÁTICA del tornillo; sin sensor de posición real.
 * Carrera inferida del volumen de disparo fundido con tornillo D=75 mm.
 * t=0: posición adelantada; recuperación en alimentación -> retraído;
 * molde cerrado -> avanza durante llenado; sostenimiento/enfriamiento: fijo.
 */
(function(root){'use strict';
const DIAMETER_M=0.075,SHOT_KG=0.462;
function strokeMm(meltC, densityFn){
 const rho=densityFn(meltC),area=Math.PI*DIAMETER_M*DIAMETER_M/4;
 return SHOT_KG/rho/area*1000;
}
function positionMm(t, phases, stroke){
 const feed=phases[0],inject=phases[2],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 if(t<=feed.end) return stroke*clamp((t-feed.start)/feed.duration,0,1);
 if(t<inject.start) return stroke;
 if(t<=inject.end) return stroke*(1-clamp((t-inject.start)/inject.duration,0,1));
 return 0;
}
function state(t,phases){
 if(t<=phases[0].end && t>=phases[0].start) return 'Retrocediendo · dosificación';
 if(t>=phases[2].start && t<=phases[2].end) return 'Avanzando · inyección';
 if(t>phases[0].end&&t<phases[2].start) return 'Retraído · espera cierre';
 return 'Fijo · sin recorrido axial';
}
const api={DIAMETER_M,SHOT_KG,strokeMm,positionMm,state};
root.HipsScrewV26=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
