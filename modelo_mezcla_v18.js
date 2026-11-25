/* HIPS LAB v18: balance de masa y estimaciones ópticas/termomecánicas.
   La masa 462 g es la de UNA pieza sin colada adicional (balance ideal, sin pérdidas).
   El color y la expansión del masterbatch son supuestos, no valores medidos.
*/
(function(root){'use strict';
const SHOT_G=462;
const ALPHA_HIPS=9e-5;   // 1/K, referencia sólida para HIPS
const ALPHA_MB=8e-5;     // 1/K, supuesto de sensibilidad para el masterbatch blanco
const Tmin=23;
const basePellet=[.78,.77,.70],whitePellet=[.995,.995,.99];
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function composition(mbPct,massG=SHOT_G){
 if(!Number.isFinite(mbPct)||mbPct<0||mbPct>100||!Number.isFinite(massG)||massG<=0)throw new Error('Composición o masa inválida');
 const mbFraction=mbPct/100;
 return {hipspct:100-mbPct,mbpct:mbPct,totalG:massG,hipsG:massG*(1-mbFraction),mbG:massG*mbFraction,hipsFraction:1-mbFraction,mbFraction};
}
function pelletColor(i,mbPct){ // conteo de pellets solamente ilustrativo, no fracción másica literal por partícula
 const isMB=(((i*73+13)%101)/101*100)<mbPct;
 return isMB?whitePellet:basePellet;
}
function pieceRGB(mbPct){
 // Interpolación óptica empírica exclusivamente para visualizar la dosificación.
 // El material natural se observa crema y el masterbatch lo torna blanco.
 const a=clamp(1-Math.exp(-.9*mbPct),0,1);
 return basePellet.map((v,i)=>v+(whitePellet[i]-v)*a);
}
function effectiveAlpha(mbPct){let w=clamp(mbPct/100,0,1);return (1-w)*ALPHA_HIPS+w*ALPHA_MB;}
function shrinkPct(avgTempC,mbPct,referenceC=Tmin){
 return 100*Math.max(0,avgTempC-referenceC)*effectiveAlpha(mbPct);
}
function feedFraction(t,feedDuration=15){return clamp(t/feedDuration,0,1);}
function fillFraction(t,start,seconds){return clamp((t-start)/seconds,0,1);}
function liveFed(t,mbPct,feedDuration=15,massG=SHOT_G){const c=composition(mbPct,massG),f=feedFraction(t,feedDuration);return {fedG:c.totalG*f,hipsFedG:c.hipsG*f,mbFedG:c.mbG*f,fraction:f};}
const api={SHOT_G,ALPHA_HIPS,ALPHA_MB,composition,pelletColor,pieceRGB,effectiveAlpha,shrinkPct,feedFraction,fillFraction,liveFed};
root.HipsMix=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
