/* Modelo híbrido HIPS MA3800, réplica JS del solucionador FVM de simular_hips.py.
   Distinción esencial: Cp,k,rho contienen interpolaciones/supuestos; geometría 1D por zonas.
   No reproduce el contacto real del molde, CFD, tensiones ni cargas externas.
   Todos los grados son Celsius; las unidades SI salvo espesor en mm. */
(function(root){'use strict';
const P={rho23:1040,alpha:9e-5,beta:.0005,cpBase:1190,cpSlope:4.13,cp100:1850,k15:.116,k45:.128,k220:.256,rhocp220:2170000};
const rho90=P.rho23/Math.pow(1+P.alpha*(90-23),3);
function rho(T){return T<=90?P.rho23/Math.pow(1+P.alpha*(T-23),3):rho90/(1+P.beta*(T-90));}
const cp220=P.rhocp220/rho(220),cp75=P.cpBase+P.cpSlope*75;
function cp(T){if(T<=75)return P.cpBase+P.cpSlope*T;if(T<=100)return cp75+(P.cp100-cp75)*(T-75)/25;return P.cp100+(cp220-P.cp100)*(T-100)/120;}
function k(T){return T<=45?P.k15+(P.k45-P.k15)*(T-15)/30:P.k45+(P.k220-P.k45)*Math.min(T-45,175)/175;}
const zones=[
{name:'Panel principal',thickness:1.72,provenance:'Inferido por masa y geometría supuesta',weight:0.74},
{name:'Reborde superior',thickness:3.15,provenance:'Espesor local medido',weight:0.08},
{name:'Lateral derecho superior',thickness:2.79,provenance:'Espesor local medido',weight:0.06},
{name:'Lateral derecho inferior',thickness:1.79,provenance:'Espesor local medido',weight:0.05},
{name:'Ensamble esquina superior',thickness:4.15,provenance:'Espesor local medido, volumen local desconocido',weight:0.035},
{name:'Ensamble esquina inferior',thickness:4.15,provenance:'Espesor local medido, volumen local desconocido',weight:0.035}];
function moldTemperature(to,flow){ // aproximación hidráulica, NO correlación validada
 return to+3.7*Math.pow(6/flow,.65);
}
function modelZone(e,Tmelt,Twall,hold,cool,scales={}){
 const cpScale=scales.cpScale??1,kScale=scales.kScale??1,contactScale=scales.contactScale??1;
 if(![cpScale,kScale,contactScale].every(v=>Number.isFinite(v)&&v>0))throw new Error('Escalas termofísicas inválidas');
 const n=10, tmax=hold+cool,dx=e/1000/(2*n); const T=new Float64Array(n);T.fill(Tmelt);
 let maxAlpha=0;for(let i=0;i<=60;i++){let temp=Twall+(Tmelt-Twall)*i/60;maxAlpha=Math.max(maxAlpha,kScale*k(temp)/(rho(temp)*cpScale*cp(temp)));}
 let dtMax=Math.min(.015,.3*dx*dx/maxAlpha);
 const trace=[];let t=0, next=.5;
 function snapshot(){let h=(t < hold-1e-8 ? 4000:2500)*contactScale;let q=(T[n-1]-Twall)/(dx/(2*k(T[n-1]))+1/h);let surf=Twall+q/h;let avg=0;for(let i=0;i<n;i++)avg+=T[i]/n;return [T[0],surf,avg];}
 trace.push(snapshot());const ff=new Float64Array(n),q=new Float64Array(n-1),net=new Float64Array(n);
 while(t<tmax-1e-9){let step=Math.min(dtMax,tmax-t,next-t);if(step<=1e-12){trace.push(snapshot());next+=.5;continue;}
 let h=(t < hold-1e-8 ? 4000:2500)*contactScale;
 for(let i=0;i<n;i++){let ki=kScale*k(T[i]);ff[i]=ki;}
 for(let i=0;i<n-1;i++){let f=2*ff[i]*ff[i+1]/(ff[i]+ff[i+1]);q[i]=f*(T[i]-T[i+1])/dx;}
 const qsurf=(T[n-1]-Twall)/(dx/(2*ff[n-1])+1/h);
 net[0]=-q[0];for(let i=1;i<n-1;i++)net[i]=q[i-1]-q[i];net[n-1]=q[n-2]-qsurf;
 for(let i=0;i<n;i++)T[i]+=step*net[i]/(rho(T[i])*cpScale*cp(T[i])*dx);
 t+=step;
 if(t>=next-1e-8){trace.push(snapshot());next+=.5;}
 }
 if(trace.length===0||Math.abs((trace.length-1)*.5-tmax)>1e-6)trace.push(snapshot());
 return trace;
}
function simulate(opts){let to=+opts.water,flow=+opts.flow,tmelt=+opts.melt,hold=+opts.hold,cool=+opts.cool,ep=+opts.thickness;
 if(!([to,flow,tmelt,hold,cool,ep].every(Number.isFinite) && flow>0 && ep>0 && to>0 && tmelt>to && hold>0 && cool>=0))throw new Error('Parámetros térmicos inválidos');
 const wall=moldTemperature(to,flow), zoneProfiles=[], tmax=hold+cool;
 for(let i=0;i<zones.length;i++){
 const thick=i===0?ep:zones[i].thickness;
 zoneProfiles.push({name:zones[i].name,thickness:thick,source:i===0?'Supuesto editable (1.72 mm inferidos)':zones[i].provenance,trace:modelZone(thick,tmelt,wall,hold,cool,opts)});
 }
 return {wall,tmax,dt:.5,profiles:zoneProfiles,fromApprox:to+1,params:{...opts}};
}
function at(sim,idx,t){let arr=sim.profiles[idx].trace,f=Math.max(0,Math.min(arr.length-1,t/.5)),i=Math.floor(f),j=Math.min(i+1,arr.length-1),w=f-i;return arr[i].map((v,a)=>v*(1-w)+arr[j][a]*w);}

// Integración exacta por tramos lineales de Cp(T); evita residuos de cuadratura.
function integrateCp(Ta,Tb){
 if(Ta===Tb)return 0;
 let sign=1,a=Ta,b=Tb;
 if(b<a){a=Tb;b=Ta;sign=-1;}
 const cuts=[a,...[75,100].filter(x=>x>a&&x<b),b];
 let sum=0;
 for(let i=0;i<cuts.length-1;i++)sum+=(cp(cuts[i])+cp(cuts[i+1]))*(cuts[i+1]-cuts[i])/2;
 return sign*sum;
}
function qHeat(hopper,melt,mass=.462){let n=Math.ceil((melt-hopper)*4),dt=(melt-hopper)/Math.max(n,1),sum=0;for(let i=0;i<Math.max(n,1);i++)sum+=.5*(cp(hopper+i*dt)+cp(hopper+(i+1)*dt))*dt;return mass*Math.abs(sum)/1000;}
function qRemoved(sim,mass=.462){let total=0;for(let i=0;i<sim.profiles.length;i++){let w=zones[i].weight||1/sim.profiles.length;let Tfinal=sim.profiles[i].trace.at(-1)[2];total+=w*integrateCp(sim.params.melt,Tfinal)*(sim.params.cpScale??1);}return mass*Math.abs(total)/1000;}
function shrinkPct(T,Tref=23){return Math.max(0,(T-Tref))*P.alpha*100;}
function zoneEnd(sim,idx){let tr=sim.profiles[idx].trace.at(-1);return {center:tr[0],surface:tr[1],average:tr[2]};}
const out={P,cp,rho,k,modelZone,simulate,at,moldTemperature,qHeat,qRemoved,shrinkPct,zoneEnd,zones,integrateCp};root.HipsThermal=out;
if(typeof module!=='undefined'&&module.exports)module.exports=out;
})(typeof window!=='undefined'?window:globalThis);
