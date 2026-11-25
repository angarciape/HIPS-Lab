/* HIPS LAB v19 — Cross-WLF a presión cero, usando parámetros de HIPS PH-60 publicados.
 * No se debe interpretar como la viscosidad medida del HIPS 478.
 * ΔP es una aproximación de ranura ancha isoterma con viscosidad efectiva, NO presión real.
 * PVT es Tait de un dominio, sin calibración de HIPS 478 ni contribución transicional.
 */
(function(root){'use strict';
const H=root.HipsThermal;
const PH60={n:0.293,tauPa:23000,eta0rPaS:5.94e11,TrefK:373.15,A1:26.86,A2K:51.57};
function viscosity(tempC,gammaS,overrides={}){
 if(tempC<170||tempC>240||gammaS<=0)throw new Error('Cross-WLF fuera de 170–240 °C o cizallamiento inválido');
 const dT=tempC+273.15-PH60.TrefK;
 const n=PH60.n+(overrides.nShift??0),tau=PH60.tauPa*(overrides.tauScale??1);
 if(!(n>0&&n<1&&tau>0))throw new Error('Parámetros Cross-WLF inválidos');
 const eta0=PH60.eta0rPaS*Math.exp(-PH60.A1*dT/(PH60.A2K+dT));
 return eta0/(1+Math.pow(eta0*gammaS/tau,1-n));
}
function approximateFlow(p){
 const massKg=.462,injSec=p.injection,meltC=p.melt,rho=H.rho(meltC),
   Q=massKg/(rho*injSec),width=.25,length=.12,thick=p.thickness/1000;
 const gamma=6*Q/(width*thick*thick),eta=viscosity(meltC,gamma);
 // Equivalente a un líquido newtoniano con viscosidad evaluada a gamma nominal.
 const dpPa=12*eta*Q*length/(width*Math.pow(thick,3));
 return {rhoMelt:rho,flowCm3S:Q*1e6,gammaS:gamma,viscosityPaS:eta,deltaPBar:dpPa/1e5,
    geometry:{widthM:width,lengthM:length,thicknessM:thick},source:'HIPS PH-60; ranura equivalente supuesta; sólo sensibilidad'};
}
function tait(tempC,pMPa){
 if(pMPa<0)throw new Error('Presión PVT negativa');
 const C=0.0894,BrefMPa=150,TrefC=100,slope=.003;
 const B=BrefMPa*Math.exp(-slope*(tempC-TrefC));
 const v0=1/H.rho(tempC),v=v0*(1-C*Math.log1p(pMPa/B));
 return {v0M3Kg:v0,vM3Kg:v,compressionPct:100*(1-v/v0),densityKgM3:1/v,
         B_MPa:B,pressureMPa:pMPa,assumption:'Tait simplificado, B y gradiente T supuestos'};
}
root.HipsRheology={PH60,viscosity,approximateFlow,tait};
if(typeof module!=='undefined'&&module.exports)module.exports=root.HipsRheology;
})(typeof window!=='undefined'?window:globalThis);
