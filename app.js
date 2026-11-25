/* HIPS LAB v25 · visor WebGL offline y controlador de ciclo.
 * No utiliza Three.js ni servicios externos. Geometría y movimientos ESQUEMÁTICOS.
 * La simulación de temperaturas de la pieza se resuelve en modelo_termico.js.
 */
(function(){'use strict';
const S=window.HipsScrewV26,H=window.HipsThermal,M=window.HipsMix,B=window.HipsBalances,R=window.HipsRheology,F=window.HipsFlowFront,C=window.HipsCoupled,$=id=>document.getElementById(id);
const canvas=$('scene'),gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
const softwareCtx=gl?null:canvas.getContext('2d');
if(!gl)console.warn('WebGL no disponible; usando renderizador 3D por CPU sobre Canvas 2D.');
const defaults={hopper:22,masterbatch:2,water:53.3,melt:230,flow:6,deltaWater:1,packP:30,thickness:1.72,injection:9,hold:8,cool:34,gate:"centro"};
// Lectura FROM: nunca se predefine un valor real. El chequeo es una declaración del usuario.
// Conservamos el supuesto de ΔT=1 °C para escenarios sin medición.
const fromMeas={confirmed:false,value:null,signature:null};
const fromKeys=['water','flow','melt','thickness','injection','hold','cool','masterbatch','gate'];
function fromSignature(p){return fromKeys.map(k=>`${k}:${p[k]}`).join('|');}
function getFromStatus(p){
 const declared=fromMeas.confirmed;
 const valid=declared && typeof fromMeas.value==='number' && Number.isFinite(fromMeas.value) && fromMeas.value>=0 && fromMeas.value<=120;
 const same=valid && fromMeas.signature===fromSignature(p);
 if(same)return {measured:true,fromC:fromMeas.value,deltaC:fromMeas.value-p.water,status:'Lectura FROM reportada como real por el usuario; misma condición registrada.'};
 if(!declared)return {measured:false,fromC:p.water+p.deltaWater,deltaC:p.deltaWater,status:'Sin lectura real: se usa FROM ≈ TO + 1,0 °C, valor supuesto.'};
 if(!valid)return {measured:false,fromC:p.water+p.deltaWater,deltaC:p.deltaWater,status:'Se requiere un valor real válido (0–120 °C). Hasta entonces se usa la hipótesis de 1,0 °C.'};
 return {measured:false,fromC:p.water+p.deltaWater,deltaC:p.deltaWater,status:'La lectura FROM corresponde a otras condiciones. Para este escenario se usa la hipótesis de 1,0 °C; vuelve a las condiciones originales para aplicar la lectura.'};
}
function refreshFromControl(p){
 const view=getFromStatus(p),input=$('fromRealValue'),label=$('fromStatus'),badge=$('fromModeBadge');
 input.disabled=!fromMeas.confirmed;
 label.textContent=view.status;
 label.classList.toggle('is-real',view.measured);
 label.classList.toggle('has-warning',fromMeas.confirmed&&!view.measured || view.measured&&view.deltaC<=0);
 badge.textContent=view.measured?'LECTURA REAL':fromMeas.confirmed?'PENDIENTE':'SIN MEDICIÓN';
 badge.classList.toggle('is-real',view.measured);
 if(view.measured&&view.deltaC<=0)label.textContent+=' Atención: FROM ≤ TO; revisar el signo, sensores y condiciones de medición.';
 return view;
}

let params={...defaults},sim=H.simulate(params),frontModel=F.simulate(params),coupledModel=null,time=0,playing=false,speed=3,lastFrame=0,thermal=true,partView=false;
const PROG=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uViewProjection;varying vec3 vColor;varying vec3 vNormal;varying vec3 vPosition;void main(){vColor=aColor;vNormal=aNormal;vPosition=aPosition;gl_Position=uViewProjection*vec4(aPosition,1.);}`;
const FRAG=`precision mediump float;varying vec3 vColor,vNormal,vPosition;void main(){vec3 n=normalize(vNormal);vec3 l=normalize(vec3(.45,.85,1.));float diff=abs(dot(n,l));float diff2=abs(dot(n,normalize(vec3(-.7,.25,-.4))));float light=.43+.46*diff+.12*diff2;vec3 col=vColor*light;float fog=clamp((length(vPosition-vec3(0.,1.5,0.))-3.)/26.,0.,.22);gl_FragColor=vec4(mix(col,vec3(.095,.16,.21),fog),1.);}`;
function shader(type,src){let sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
let prog=null,aP=null,aN=null,aC=null,uVP=null,gpuBuf=null;
if(gl){prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,PROG));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
aP=gl.getAttribLocation(prog,'aPosition');aN=gl.getAttribLocation(prog,'aNormal');aC=gl.getAttribLocation(prog,'aColor');uVP=gl.getUniformLocation(prog,'uViewProjection');
gpuBuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,gpuBuf);const stride=9*4;gl.enableVertexAttribArray(aP);gl.enableVertexAttribArray(aN);gl.enableVertexAttribArray(aC);gl.vertexAttribPointer(aP,3,gl.FLOAT,false,stride,0);gl.vertexAttribPointer(aN,3,gl.FLOAT,false,stride,12);gl.vertexAttribPointer(aC,3,gl.FLOAT,false,stride,24);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);}
let yaw=.59,pitch=.37,dist=11.5,target=[0,1.55,0],dragging=false,lastMouse=[0,0];
const rgb=s=>{if(Array.isArray(s))return s;if(s.startsWith('#'))return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);return [.5,.5,.5]};
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function heatColor(T){let stops=[[20,[.21,.43,.87]],[60,[.18,.74,.76]],[120,[.89,.72,.31]],[180,[.96,.51,.23]],[240,[.93,.29,.25]]];for(let i=0;i<stops.length-1;i++){if(T<=stops[i+1][0])return mix(stops[i][1],stops[i+1][1],clamp((T-stops[i][0])/(stops[i+1][0]-stops[i][0]),0,1));}return stops.at(-1)[1];}
function pieceHeatColor(T){let stops=[[20,[.18,.42,.86]],[50,[.18,.75,.79]],[80,[.94,.72,.29]],[100,[.94,.23,.18]],[140,[.80,.11,.11]],[220,[.53,.05,.08]]];for(let i=0;i<stops.length-1;i++){if(T<=stops[i+1][0])return mix(stops[i][1],stops[i+1][1],clamp((T-stops[i][0])/(stops[i+1][0]-stops[i][0]),0,1));}return stops.at(-1)[1];}
function barrelProfile(nozzle){return [nozzle,nozzle-20,nozzle-20,nozzle-30,nozzle-30];}
function vec(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function normalize(a){let d=Math.hypot(...a)||1;return a.map(v=>v/d)};
class Mesh{
 constructor(){this.data=[];}
 tri(p1,p2,p3,c){let n=normalize(cross(vec(p2,p1),vec(p3,p1))),co=rgb(c);for(let p of [p1,p2,p3])this.data.push(...p,...n,...co);}
 quad(a,b,c,d,col){this.tri(a,b,c,col);this.tri(a,c,d,col);}
 box(x,y,z,w,h,d,col){let a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;
 let p=[[a,c,f],[b,c,f],[b,e,f],[a,e,f],[a,c,g],[b,c,g],[b,e,g],[a,e,g]];
 for(let q of [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]])this.quad(...q.map(i=>p[i]),col);
 }
 cylinder(x,y,z,r,len,axis,col,sides=14,r2=r){const center=[x,y,z],point=(q,angle)=>{let ca=Math.cos(angle),sa=Math.sin(angle);if(axis==='x')return [x+q,y+r*ca,z+r*sa];if(axis==='y')return [x+r*ca,y+q,z+r*sa];return [x+r*ca,y+r*sa,z+q];};
 const pointUpper=(q,angle)=>{let ca=Math.cos(angle),sa=Math.sin(angle);if(axis==='x')return [x+q,y+r2*ca,z+r2*sa];if(axis==='y')return [x+r2*ca,y+q,z+r2*sa];return [x+r2*ca,y+r2*sa,z+q];};
 const neg=center.map((v,i)=>v+(i===(axis==='x'?0:axis==='y'?1:2)?-len/2:0)),pos=center.map((v,i)=>v+(i===(axis==='x'?0:axis==='y'?1:2)?len/2:0));
 for(let i=0;i<sides;i++){let a=i*Math.PI*2/sides,b=(i+1)*Math.PI*2/sides,l0=point(-len/2,a),l1=point(-len/2,b),u0=pointUpper(len/2,a),u1=pointUpper(len/2,b);this.quad(l0,l1,u1,u0,col);this.tri(neg,l1,l0,col);this.tri(pos,u0,u1,col);}
 }
 rod(a,b,r,col,sides=7){let dir=vec(b,a),len=Math.hypot(...dir);if(len<1e-6)return;let n=dir.map(v=>v/len),ar=Math.abs(n[1])<.9?[0,1,0]:[1,0,0],u=normalize(cross(n,ar)),v=cross(n,u);
 for(let i=0;i<sides;i++){let t=i*2*Math.PI/sides,s=(i+1)*2*Math.PI/sides;const p=(base,angle)=>base.map((x,j)=>x+r*(Math.cos(angle)*u[j]+Math.sin(angle)*v[j]));let a0=p(a,t),a1=p(a,s),b0=p(b,t),b1=p(b,s);this.quad(a0,a1,b1,b0,col);}
 }
}
function mat4mul(a,b){let out=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),d=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*d,-1,0,0,2*far*near*d,0];}
function lookAt(eye,at,up){let z=normalize(vec(eye,at)),x=normalize(cross(up,z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1];}
function timeline(){let s=[15,6,params.injection,params.hold,params.cool,6,5],acc=0;return s.map((d,i)=>{let p={start:acc,end:acc+d,duration:d,index:i};acc+=d;return p;});}
function currPhase(){let tl=timeline(),p=tl.find(x=>time<=x.end+1e-8)||tl.at(-1);return {...p,frac:clamp((time-p.start)/p.duration,0,1),elapsed:time-p.start};}
const phaseNames=['Alimentación y plastificación','Cierre del molde','Inyección y llenado','Sostenimiento de presión','Enfriamiento en el molde','Apertura y expulsión','Retorno y preparación'];
function phaseInfo(){let p=currPhase(),screw=p.index===2?p.frac:p.index===3?1:0;
 let open=p.index===0||p.index===6?1:p.index===1?1-p.frac:p.index===5?p.frac:0;
 let filled=p.index<2?0:p.index===2?p.frac:1;
 let eject=p.index===5?clamp((p.frac-.30)/.7,0,1):p.index===6?1:0;
 let endInjection=timeline()[2].end,thermalTime=clamp(time-endInjection,0,sim.tmax),inside=p.index>=2;
 return {...p,screw,open,filled,eject,inside,thermalTime};}
function frameData(){let p=phaseInfo();return {p,panel:H.at(sim,0,p.thermalTime),upper:H.at(sim,4,p.thermalTime),wall:sim.wall};}
function pressureIndicator(p){
 if(p.index<2) return 0;
 if(p.index===2) return 12+88*p.frac;
 if(p.index===3) return 82-18*p.frac;
 if(p.index===4) return 58-42*p.frac;
 if(p.index===5) return 10*(1-p.frac);
 return 0;
}
function packingIndicator(p){
 if(p.index<2) return 0;
 if(p.index===2) return 55*p.frac;
 if(p.index===3) return 55+35*p.frac;
 if(p.index===4) return 90-18*p.frac;
 if(p.index===5) return 70-60*p.frac;
 return 8;
}
function pelletColor(i,mb){return M.pelletColor(i,mb);}
function materialColor(zone){const factors=[1,.94,.88,.91,1.02,1.02],f=factors[zone]||1;return M.pieceRGB(params.masterbatch).map(v=>clamp(v*f,0,1));}
function drawAxisTitles(cx,w,h,left,right,top,bottom,xLabel,yLabel){cx.save();cx.fillStyle='#9ab0c1';cx.font='11px Segoe UI,Arial';cx.textAlign='center';cx.fillText(xLabel,(left+right)/2,h-6);cx.translate(12,(top+bottom)/2);cx.rotate(-Math.PI/2);cx.fillText(yLabel,0,0);cx.restore();cx.textAlign='left';}
function drawWorld(m,p){
 const c={floor:'#172833',grid:'#35505b',base:'#273846',base2:'#344657',metal:'#9eacb6',edge:'#d4e0e8',blue:'#275e86',blueLight:'#417ea5',dark:'#1b2835',shaft:'#8c99a4',cabinet:'#50606b',rubber:'#13232e',copper:'#bf9065'};
 // Suelo sobre base oscura, líneas discretas.
 m.box(0,-.08,0,13.3,.15,5.9,c.floor);
 for(let x=-6.1;x<=6.1;x+=.72)m.box(x,.005,0,.009,.009,5.3,c.grid);
 for(let z=-2.6;z<=2.6;z+=.72)m.box(0,.006,z,12.4,.009,.009,c.grid);
 // Base mecánica y bancada.
 m.box(-2.65,.46,0,5.3,.8,2.35,c.blue);m.box(1.55,.47,0,4.45,.82,2.2,c.base);
 for(let x of [-4.7,-3.5,-1.8,.3,2.6]){m.box(x,.38,-.96,.52,.62,.2,c.base2);}
 // Armario frontal de controles / carenado al espectador (z positivo).
 m.box(1.0,.65,1.03,3.2,1.05,.16,c.cabinet);m.box(1.65,.81,1.15,.53,.72,.05,c.dark);m.box(1.65,.87,1.19,.36,.42,.018,'#244b65');
 for(let i=0;i<5;i++)m.box(1.50+i*.075,.73,1.23,.034,.025,.024,i%2? '#87bd9f':'#a9c5d3');
 // Bancada azul de unidad de cierre.
 m.box(-3.1,.75,1.0,3.5,1.1,.17,c.blue);m.box(-3.1,.88,1.1,1.5,.36,.05,c.blueLight);
 // Soporte superior para las platinas.
 for(let z of [-.74,.74]){for(let y of [1.35,2.45])m.cylinder(-3.13,y,z,.060,3.6,'x',c.shaft,11);}
 // Platinas. La móvil se desplaza a la izquierda al abrir el molde.
 const move=-.78*p.open; m.box(-4.16+move,1.86,0,.25,1.70,2.0,c.metal);m.box(-4.16+move,1.85,0,.29,1.74,2.05,c.blueLight);
 m.box(-1.73,1.86,0,.32,1.8,2.06,c.edge);m.box(-1.80,1.85,0,.24,1.58,1.73,c.base2);
 // Mitades del molde. Parada fija a derecha e izquierda móvil.
 m.box(-2.63,1.86,0,.41,1.59,1.64,'#71858f');
 m.box(-3.08+move,1.86,0,.43,1.63,1.69,'#6e8594');
 // Contorno frío visual, no mapa FEM del acero.
 const moldCol=thermal?heatColor(sim.wall):'#74a0a9';
 m.box(-2.84,1.86,0,.07,1.45,1.46,moldCol);
 m.box(-2.87+move,1.86,0,.075,1.46,1.48,moldCol);
 // Travesaños y herrajes de cierre.
 for(let z of [-.72,.72])for(let y of [1.26,2.46])m.cylinder(-4.42+move,y,z,.095,.22,'x',c.metal,12);
 // Unidad de inyección a derecha: soporte, cilindro, husillo, zonas térmicas.
 m.box(1.15,1.24,0,4.18,.43,1.53,c.base);m.box(2.25,1.59,0,2.80,.40,1.22,'#586a79');
 m.cylinder(.85,2.0,0,.29,3.58,'x',c.dark,22);
 m.cylinder(.86,2.0,0,.18,3.6,'x',c.shaft,18);
 const zonesTemp=barrelProfile(params.melt);
 for(let i=0;i<5;i++){let x=-.38+i*.70;
   const cc=thermal?heatColor(zonesTemp[i]):'#788b98';
   m.cylinder(x,2,0,.34,.43,'x',cc,22);
   m.cylinder(x-.23,2,0,.35,.055,'x',c.dark,22);
   m.cylinder(x+.23,2,0,.35,.048,'x',c.metal,22);
 }
 // Tornillo: la geometría se desplaza con la MISMA cinemática mostrada en el gráfico.
 // 0,34 unidades visuales = carrera teórica (~110 mm) y NO distancia CAD a escala.
 const shotStroke=S.strokeMm(params.melt,H.rho);
 const screwAxial=.34*S.positionMm(time,timeline(),shotStroke)/shotStroke;
 m.cylinder(.86+screwAxial,2,0,.092,3.36,'x','#f8fbfd',22);
 m.cylinder(.86+screwAxial,2,0,.045,3.38,'x','#7e8d99',18);
 let angleBase=(time*.18+(p.index===0?time*.36:0));
 for(let i=0;i<96;i++){let u=i/96,v=(i+1)/96,x1=-.97+screwAxial+u*3.21,x2=-.97+screwAxial+v*3.21;
   const t1=angleBase+u*Math.PI*22,t2=angleBase+v*Math.PI*22;
   let scol=thermal?mix(pieceHeatColor(208+u*18),[0.98,0.99,1.0],0.26):'#eef5f9';
   m.rod([x1,2+.23*Math.cos(t1),.23*Math.sin(t1)],[x2,2+.23*Math.cos(t2),.23*Math.sin(t2)],.036,scol,7);
 }
 for(let i=0;i<11;i++){let xx=-.96+screwAxial+i*.31;m.box(xx,2.0,0,.02,.50,.03,'#fafdff');}
 // Boquilla, puente de inyección y cilindro hidráulico.
 m.cylinder(-1.45+p.screw*.1,2,0,.20,.48,'x','#788f9d',18);
 m.cylinder(-1.76+p.screw*.1,2,0,.12,.23,'x',thermal?heatColor(params.melt):'#cf8774',14);
 m.cylinder(-2.15,2,0,.11,.82,'x',thermal?heatColor(params.melt):'#d2dde5',18,.055);
 m.cylinder(-2.54,2,0,.085,.16,'x','#8fa5b3',16);
 m.box(-2.33,2.0,0,.10,.18,.24,'#d9e4eb');
 m.cylinder(3.0,1.99,0,.39,.75,'x',c.cabinet,20);
 m.box(3.49,1.45,0,.85,.55,1.28,c.base2);
 // Tolva sobre la zona de plastificación, azul metal y cuello.
 m.cylinder(1.83,2.62,0,.23,.53,'y',c.shaft,18);
 m.cylinder(1.83,3.03,0,.24,.43,'y',thermal?heatColor(params.hopper):c.edge,22,.56);
 m.cylinder(1.83,3.48,0,.58,.55,'y',thermal?heatColor(params.hopper):c.shaft,24);
 m.cylinder(1.83,3.78,0,.61,.055,'y',c.edge,24);
 // Pellets dentro de la tolva y alimentación: descienden por la tolva y luego pasan a la garganta.
 for(let i=0;i<42;i++){let yy=3.26+((i*19)%100)/100*.46;let ang=(i*2.37)%6.283;let rr=.38*(.25+((i*13)%100)/100*.75);let col=pelletColor(i,params.masterbatch);
   m.cylinder(1.83+Math.cos(ang)*rr,yy,Math.sin(ang)*rr*.72,.034,.042,'y',col,6);}
 if(p.index===0||p.index===6){
   for(let i=0;i<18;i++){let tt=(time*.62+i*.071)%1;let y=3.82-tt*1.38;let col=pelletColor(i,params.masterbatch);
     m.cylinder(1.83+.025*Math.sin(i*1.7),y,.03*Math.cos(i*1.9),.035,.044,'y',col,7);}
   for(let i=0;i<12;i++){let tt=(time*.52+i*.094)%1;let x=1.78-tt*.72;let y=2.61-.03*Math.sin(tt*Math.PI);let col=pelletColor(i+24,params.masterbatch);
     m.cylinder(x,y,.04*Math.sin(i*2.1),.03,.042,'x',col,6);}
   for(let i=0;i<8;i++){let tt=(time*.44+i*.11)%1;let x=1.08-tt*.42;let col=pelletColor(i+36,params.masterbatch);
     m.cylinder(x,2.12,.05*Math.cos(i*2.2),.028,.038,'x',col,6);}
 }
 // Compresores/guardas/tubos en la parte superior de la máquina (solo visuales).
 m.box(-.6,2.67,-.90,3.5,.07,.10,c.metal);m.box(.02,2.78,-.91,1.8,.17,.14,c.base2);
 // Línea auxiliar de circuito de agua al molde.
 let wc=thermal?heatColor(params.water):'#5ca3ac';
 m.rod([-2.52,.98,-.86],[-2.52,1.28,-.86],.034,wc,9);
 m.rod([-2.52,.98,-.86],[-1.52,.98,-.86],.034,wc,9);
 m.rod([-1.52,.98,-.86],[-1.52,1.55,-.86],.034,wc,9);
 // Puerta durante la inyección o durante la expulsión, con los espesores locales.
 if(p.filled>0){let eta=p.eject,x=-2.85-.17*eta,y=1.88-.78*eta,z=.0+.82*eta;
   drawDoor(m,x,y,z,1.0,p.filled,p.thermalTime,thermal,eta);
 }
 // Mesa receptora esquemática.
 m.box(-4.75,.51,1.55,1.65,.14,1.7,'#445361');for(let x of [-5.35,-4.15])for(let z of [.95,2.12])m.box(x,.26,z,.08,.55,.08,c.shaft);
}
function drawDoor(m,x,y,z,scale,fill,tThermal,useThermal,eject){
 // La misma malla geométrica de la puerta v13 (rebaje U, falda abierta, pestañas y engrosamientos),
 // reducida a 24x24 para animación. Es reconstrucción PARAMÉTRICA, no CAD.
 const door=window.HipsDoorMesh;
 if(door){
    const f=(1.4/door.L)*scale, depth=2.4*Math.pow(params.thickness/door.panelThick,.3);
    const verts=door.vertices;
    function pv(i){let v=verts[i];return [x+v[2]*f*depth,y+(v[1]-door.L/2)*f,z+(v[0]-door.W/2)*f];}
    let zoneColors=Array.from({length:6},(_,i)=>useThermal?pieceHeatColor(H.at(sim,i,tThermal)[0]):materialColor(i));
    for(let face of door.faces){let v0=verts[face[0]],v1=verts[face[1]],v2=verts[face[2]];
       // Orden espacial derivado de caminos de menor costo: el punto de entrada es supuesto.
       const u=((v0[0]+v1[0]+v2[0])/3)/door.W;
       const v=((v0[1]+v1[1]+v2[1])/3)/door.L;
       if(fill<.999 && (fill<=0 || F.sample(frontModel,u,v)>fill+0.002))continue;
       m.tri(pv(face[0]),pv(face[1]),pv(face[2]),zoneColors[face[3]]||zoneColors[0]);
    }
    return;
 }
 let basic=useThermal?pieceHeatColor(H.at(sim,0,tThermal)[0]):materialColor(0);
 let top=useThermal?pieceHeatColor(H.at(sim,1,tThermal)[0]):materialColor(1);
 let rightTop=useThermal?pieceHeatColor(H.at(sim,2,tThermal)[0]):materialColor(2);
 let rightBot=useThermal?pieceHeatColor(H.at(sim,3,tThermal)[0]):materialColor(3);
 let corner=useThermal?pieceHeatColor(H.at(sim,4,tThermal)[0]):materialColor(4);
 let w=1.37*scale,h=1.4*scale,done=clamp(fill,0,1);
 // El llenado visual se representa como una franja que avanza, no como una simulación del frente real.
 let ww=w*done;if(ww<.01)return;
 m.box(x,y,z-w/2+ww/2,.055*scale,h,ww,basic);
 m.box(x+.037*scale,y+h/2-.032*scale,z-w/2+ww/2,.034*scale,.066*scale,ww,top);
 let zR=z+w/2-.065*scale;
 if(done>.9){m.box(x-.06*scale,y,zR,.20*scale,h,.075*scale,rightTop);m.box(x-.065*scale,y-h*.25,zR,.18*scale,h*.5,.084*scale,rightBot);
   m.box(x-.072*scale,y,z-w/2+.04*scale,.16*scale,h,.06*scale,basic);
   m.box(x-.07*scale,y-h/2+.03*scale,z,.18*scale,.065*scale,w,basic);
   for(let ye of [y-h/2+.10*scale,y+h/2-.1*scale])m.box(x-.14*scale,ye,zR,.21*scale,.14*scale,.17*scale,corner);
   // Exterior: huella/rebaje U aproximado, sin pretender CAD real.
   let cy=y-h*.33;let z0=z-w*.30,z1=z+w*.30;let outline=mix(rgb(basic),rgb('#6c8491'),.23);
   m.box(x+.049*scale,cy+.12*scale,z,.018*scale,.033*scale,(z1-z0),outline);
   for(let zz of [z0,z1])m.box(x+.046*scale,cy-.017*scale,zz,.026*scale,.28*scale,.027*scale,outline);
   m.box(x+.047*scale,cy-.15*scale,z,.015*scale,.025*scale,(z1-z0),outline);
   // Por detrás se ven los rebordes de soporte.
   m.box(x-.12*scale,y+h/2-.15*scale,z,.17*scale,.045*scale,w*.72,top);
 }
}
function drawPartSolo(m,viewType){
 m.box(0,-.09,0,4.5,.14,4.1,'#172833');
 for(let x=-2;x<=2;x+=.5)m.box(x,.001,0,.008,.01,3.8,'#2d4958');
 const thermalTime=sim.tmax,rot=0;
 // Mostrar puerta aumentada y separada de la máquina.
 drawDoor(m,0,1.52,0,2.05,1,thermalTime,thermal,0);
}
function render(){const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h);}
 let mesh=new Mesh(),phase=phaseInfo();if(partView)drawPartSolo(mesh);else drawWorld(mesh,phase);
 let angle=yaw,el=pitch,eye=[target[0]+dist*Math.sin(angle)*Math.cos(el),target[1]+dist*Math.sin(el),target[2]+dist*Math.cos(angle)*Math.cos(el)];
 const vp=mat4mul(perspective(Math.PI/4.4,w/h,.05,90),lookAt(eye,target,[0,1,0]));
 if(gl){gl.clearColor(.063,.109,.16,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(prog);gl.uniformMatrix4fv(uVP,false,new Float32Array(vp));gl.bindBuffer(gl.ARRAY_BUFFER,gpuBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,mesh.data.length/9);return;}
 // Fallback offline para equipos donde WebGL está deshabilitado o carece de GPU.
 // Mismo modelo 3D, rasterización por triángulos y ordenación de profundidad.
 if(!softwareCtx)return;let ctx=softwareCtx;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
 function project(idx){let a=mesh.data,x=a[idx],y=a[idx+1],z=a[idx+2],px=vp[0]*x+vp[4]*y+vp[8]*z+vp[12],py=vp[1]*x+vp[5]*y+vp[9]*z+vp[13],pz=vp[2]*x+vp[6]*y+vp[10]*z+vp[14],pw=vp[3]*x+vp[7]*y+vp[11]*z+vp[15];if(pw<=.01)return null;return [w*(.5+.5*px/pw),h*(.5-.5*py/pw),pz/pw];}
 let arr=[];for(let i=0;i<mesh.data.length;i+=27){let a=project(i),b=project(i+9),c=project(i+18);if(!a||!b||!c)continue;
 const nx=mesh.data[i+3],ny=mesh.data[i+4],nz=mesh.data[i+5];let li=Math.min(1.15,.49+.45*Math.abs(nx*.4+ny*.8+nz*.65));
 let rr=Math.round(clamp(mesh.data[i+6]*255*li,0,255)),gg=Math.round(clamp(mesh.data[i+7]*255*li,0,255)),bb=Math.round(clamp(mesh.data[i+8]*255*li,0,255));
 arr.push({a,b,c,z:(a[2]+b[2]+c[2])/3,color:`rgb(${rr},${gg},${bb})`});}
 arr.sort((a,b)=>b.z-a.z);for(let tr of arr){ctx.beginPath();ctx.moveTo(tr.a[0],tr.a[1]);ctx.lineTo(tr.b[0],tr.b[1]);ctx.lineTo(tr.c[0],tr.c[1]);ctx.closePath();ctx.fillStyle=tr.color;ctx.fill();}
}
function updateBalances(){
 const fromInfo=refreshFromControl(params),cycleT=timeline().at(-1).end,b=B.calculate(params,sim,cycleT,fromInfo.deltaC),
       c=b.composition,flow=R.approximateFlow(params),pvt=R.tait(params.melt,params.packP);
 const put=(id,val)=>{$(id).textContent=val;},f=(x,dec=2)=>Number(x).toFixed(dec),
       energy=f(b.heatKJ),cool=f(b.moldEnergyKJ),stored=f(b.pieceEnergyKJ);
 window.lastHipsBalances={balance:b,flow,pvt};
 put('massBalanceTotal',f(c.totalG));put('heatBalanceTotal',f(b.heatKJ,1));put('coolBalanceTotal',f(b.moldEnergyKJ,1));
 put('bmHips',f(c.hipsG));put('bmMb',f(c.mbG));put('bmPart',f(c.totalG));put('bmIn',f(c.totalG));put('bmOut',f(c.totalG));
 put('massEquation',`${f(c.hipsG)} + ${f(c.mbG)} = ${f(c.totalG)} + 0.00 + 0.00 g`);
 for(const id of ['beHeatIn','beMeltOut','beHeatTotalIn','beHeatTotalOut','bcMeltIn','bcTotalIn'])put(id,energy);
 for(const id of ['bcPieceOut'])put(id,stored);
 for(const id of ['bcCoolOut'])put(id,cool);
 put('bcTotalOut',f(b.pieceEnergyKJ+b.moldEnergyKJ));
 put('heatEquation',`${energy} = ${energy} kJ`);
 put('coolEquation',`${energy} = ${stored} + ${cool} kJ`);
 put('bwTo',f(params.water,1)+' °C');put('bwFrom',f(b.fromAssumedC,1)+' °C');put('bwFromSource',fromInfo.measured?'Lectura reportada como real':'Supuesto');
 put('bwWaterQ',f(b.qWaterKJ,1)+' kJ');put('bwPolyQ',f(b.moldEnergyKJ,1)+' kJ');
 put('bwDiff',(b.waterDifferenceKJ>=0?'+':'')+f(b.waterDifferenceKJ,1)+' kJ');
 put('bwRequired',f(b.fromRequiredC,2)+' °C');
 put('bwRequiredDelta',f(b.deltaRequiredC,2)+' °C');
 put('waterEquation',`${f(b.waterMassKg,1)} kg × 4.18 kJ/(kg·K) × ${f(fromInfo.deltaC,2)} K = ${f(b.qWaterKJ,1)} kJ (${fromInfo.measured?'FROM reportada como medida':'FROM supuesta'})`);
 const enough=b.qWaterKJ+1e-9>=b.moldEnergyKJ;
 const rel=Math.abs(b.waterDifferenceKJ)/Math.max(1e-6,b.moldEnergyKJ);
 put('bwCheck',enough?'Sí (en modelo)':'No (en modelo)');
 put('bwCheckStatus',enough?'Cubre en modelo ideal':'No cubre en modelo ideal');
 put('bwValidationText',!enough?'Menor que Q pieza':'Mayor o cercana a Q pieza');
 $('bwCheck').className=enough?'validation-ok':'validation-bad';
 $('bwCheckStatus').className=enough?'validation-ok':'validation-bad';
 $('bwValidationText').className='validation-warn';
 const closed=Math.abs(b.massResidualG)<1e-9&&Math.abs(b.energyResidualKJ)<1e-6;
 put('balancesStatus',closed?'Cierre correcto':'Revisar cierre');
 $('balancesStatus').className=closed?'closing-ok':'closing-warn';
 put('rvEta',f(flow.viscosityPaS,1));put('rvShear',`Cizallamiento nominal: ${f(flow.gammaS,0)} s⁻¹`);
 put('rvFlow',f(flow.flowCm3S,1));put('rvPressure',f(flow.deltaPBar,1));
 put('rvPvt',f(pvt.compressionPct,2));put('rvPvtText',`A ${f(params.packP,0)} MPa supuestos en la cavidad`);
 put('qReadout',f(b.heatKJ,1)+' kJ/pieza');put('qRemovedMetric',f(b.moldEnergyKJ,1));
 put('qRemovedReadout',f(b.moldEnergyKJ,1)+' kJ/pieza');
 put('returnReadout',(fromInfo.measured?'':'≈')+f(b.fromAssumedC,1)+' °C ('+(fromInfo.measured?'reportada real':'supuesto')+')');
}
function updateMixUI(){
 const mix=M.composition(params.masterbatch),swatch=M.pieceRGB(params.masterbatch),hex='#'+swatch.map(n=>Math.round(255*n).toString(16).padStart(2,'0')).join('');
 $('hipsPct').textContent=mix.hipspct.toFixed(1)+' %';$('mbPct').textContent=mix.mbpct.toFixed(1)+' %';
 $('hipsMass').textContent=mix.hipsG.toFixed(2)+' g';$('mbMass').textContent=mix.mbG.toFixed(2)+' g';
 $('mixHipsBar').style.width=mix.hipspct+'%';$('mixMbBar').style.width=mix.mbpct+'%';
 $('mixColorSwatch').style.backgroundColor=hex;$('mixColorLabel').textContent=(params.masterbatch>=2?'Blanco ilustrativo':params.masterbatch>=.4?'Blanco tenue (ilustrativo)':'HIPS natural (ilustrativo)');
 $('headerComposition').textContent='HIPS '+mix.hipspct.toFixed(1)+' % + MB '+mix.mbpct.toFixed(1)+' %';
 $('feedTotalLabel').textContent=mix.totalG.toFixed(2)+' g';
 $('shrinkMixMetric').textContent=M.shrinkPct(H.zoneEnd(sim,0).average,params.masterbatch).toFixed(3);
 updateBalances();
 $('shrinkMetric').textContent=M.shrinkPct(H.zoneEnd(sim,0).average,params.masterbatch).toFixed(3);
 $('cornerShrinkReadout').textContent=M.shrinkPct(H.zoneEnd(sim,4).average,params.masterbatch).toFixed(3)+' %';
}
function drawScrewChart(){
 const cn=$('screwChart');if(!cn)return;
 const cx=cn.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),w=cn.clientWidth,h=cn.clientHeight;
 if(!w||!h)return;
 cn.width=Math.max(1,Math.round(w*dpr));cn.height=Math.max(1,Math.round(h*dpr));cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,w,h);
 const phases=timeline(),total=phases.at(-1).end,stroke=S.strokeMm(params.melt,H.rho);
 const l=33,r=w-9,t=8,b=h-25;
 const X=v=>l+(r-l)*v/total,Y=v=>b-(b-t)*v/(stroke*1.10);
 cx.fillStyle='#8b9eae';cx.font='9px Segoe UI,Arial';cx.lineWidth=.7;
 for(const frac of [0,.5,1]){let yy=Y(stroke*frac);cx.strokeStyle='#2b4654';cx.beginPath();cx.moveTo(l,yy);cx.lineTo(r,yy);cx.stroke();cx.fillText(Math.round(stroke*frac)+'',2,yy+3);}
 for(const sec of [0,phases[0].end,phases[2].end,total]){let x=X(sec);cx.fillStyle='#8da7bb';cx.fillText(Math.round(sec)+'s',x-8,b+13);}
 const knots=[0,phases[0].end,phases[2].start,phases[2].end,total];
 cx.beginPath();for(let i=0;i<knots.length;i++){let x=X(knots[i]),y=Y(S.positionMm(knots[i],phases,stroke));if(!i)cx.moveTo(x,y);else cx.lineTo(x,y);}
 cx.strokeStyle='#56cfe1';cx.lineWidth=2.5;cx.stroke();
 const pos=S.positionMm(time,phases,stroke),xx=X(time),yy=Y(pos);
 cx.setLineDash([3,3]);cx.strokeStyle='#edb76c';cx.beginPath();cx.moveTo(xx,t);cx.lineTo(xx,b);cx.stroke();cx.setLineDash([]);
 cx.beginPath();cx.arc(xx,yy,4,0,Math.PI*2);cx.fillStyle='#fff1d1';cx.fill();
 cx.fillStyle='#9fb3c2';cx.font='9px Segoe UI,Arial';cx.fillText('Pos. (mm)',1,7);cx.textAlign='center';cx.fillText('Tiempo (s)',(l+r)/2,h-1);cx.textAlign='left';
 $('screwValue').textContent=pos.toFixed(1)+' / '+stroke.toFixed(1)+' mm';
 $('screwState').textContent=S.state(time,phases);
}
function drawFillChart(){
 const cn=$('fillChart'),cx=cn.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),w=cn.clientWidth,h=cn.clientHeight;if(!w||!h)return;
 cn.width=Math.max(1,Math.round(w*dpr));cn.height=Math.max(1,Math.round(h*dpr));cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,w,h);
 const l=56,r=w-18,t=18,b=h-38,total=timeline().at(-1).end,inj=timeline()[2];
 const X=sec=>l+(r-l)*sec/total,Y=pct=>b-(b-t)*pct/100;
 cx.font='10px Segoe UI,Arial';cx.lineWidth=1;
 for(let val=0;val<=100;val+=25){const yy=Y(val);cx.beginPath();cx.moveTo(l,yy);cx.lineTo(r,yy);cx.strokeStyle='#2a3d4d';cx.stroke();cx.fillStyle='#8ea8b8';cx.fillText(val+' %',8,yy+3);}
 for(let sec=0;sec<=total;sec+=10){let xx=X(sec);cx.fillStyle='#8299ac';cx.fillText(sec+' s',xx-10,b+16);}
 cx.fillStyle='rgba(70,191,204,.11)';cx.fillRect(X(inj.start),t,X(inj.end)-X(inj.start),b-t);
 for(let sec of [inj.start,inj.end]){const xx=X(sec);cx.strokeStyle='#506e7e';cx.setLineDash([3,5]);cx.beginPath();cx.moveTo(xx,t);cx.lineTo(xx,b);cx.stroke();cx.setLineDash([]);}
 cx.beginPath();cx.moveTo(X(0),Y(0));cx.lineTo(X(inj.start),Y(0));cx.lineTo(X(inj.end),Y(100));cx.lineTo(X(total),Y(100));cx.strokeStyle='#58cbd4';cx.lineWidth=2.8;cx.stroke();
 const pct=M.fillFraction(time,inj.start,inj.duration)*100,x=X(time),y=Y(pct);
 cx.strokeStyle='#efa95b';cx.lineWidth=1.4;cx.beginPath();cx.moveTo(x,t);cx.lineTo(x,b);cx.stroke();
 cx.beginPath();cx.arc(x,y,4.2,0,2*Math.PI);cx.fillStyle='#fff1d8';cx.fill();cx.strokeStyle='#b7662d';cx.stroke();
 drawAxisTitles(cx,w,h,l,r,t,b,'Tiempo del ciclo (s)','Llenado de cavidad (%)');
 $('fillDurationLabel').textContent=inj.duration+' s de llenado';
}

function drawFrontMap(){
 const cn=$('frontMap'),cx=cn.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),w=cn.clientWidth,h=cn.clientHeight;
 if(!w||!h)return;
 cn.width=Math.max(1,Math.round(w*dpr));cn.height=Math.max(1,Math.round(h*dpr));cx.setTransform(dpr,0,0,dpr,0,0);
 cx.fillStyle='#101c28';cx.fillRect(0,0,w,h);
 const {NX,NY}=frontModel,padT=14,padB=24,padX=18,sx=(w-2*padX)/NX,sy=(h-padT-padB)/NY;
 const fraction=phaseInfo().filled;
 const mode=$('flowMapMode').value;
 $('fillLegend').hidden=mode!=='fill';$('pressureLegend').hidden=mode!=='pressure';
 if(mode==='pressure'){$('pressureLow').textContent='0 bar · menor ΔP';$('pressureHigh').textContent=(coupledModel?.maxPressureBar??0).toFixed(1)+' bar · mayor ΔP';}
 for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
  const idx=j*NX+i,a=frontModel.arrival[idx],thick=frontModel.thickness[idx],done=fraction>=a;
  let color=done?'#51b6c2':'#263b4b';
  if(mode==='fill'){
    if(!done&&fraction>0&&a-fraction<.017)color='#af8351';
    if(done&&fraction-a<.014)color='#b9f0e1';
    if(done&&thick>=3.9)color='#6ce0b8';
  }else if(done && mode==='pressure' && coupledModel){
    const r=clamp(coupledModel.pressureBar[idx]/Math.max(1,coupledModel.maxPressureBar),0,1);
    const rgb=mix([0.23,0.55,0.83],[0.91,0.22,0.17],Math.sqrt(r));
    color='rgb('+rgb.map(x=>Math.round(x*255)).join(',')+')';
  }else if(!done)color='#253849';
  cx.fillStyle=color;cx.fillRect(padX+i*sx,padT+j*sy,sx+.18,sy+.18);
 }
 // Posición de inyección solo como hipótesis; círculo y cruz visibles.
 let gx=padX+frontModel.gate.x*(w-2*padX),gy=padT+frontModel.gate.y*(h-padT-padB);
 cx.strokeStyle='#1d2733';cx.lineWidth=3;cx.beginPath();cx.arc(gx,gy,6,0,Math.PI*2);cx.stroke();
 cx.strokeStyle='#ffd39c';cx.lineWidth=2;cx.beginPath();cx.arc(gx,gy,5,0,Math.PI*2);cx.stroke();
 cx.beginPath();cx.moveTo(gx-9,gy);cx.lineTo(gx+9,gy);cx.moveTo(gx,gy-9);cx.lineTo(gx,gy+9);cx.stroke();
 cx.fillStyle='#93aabd';cx.font='10px Segoe UI, Arial';cx.fillText('0 mm',padX,h-8);
 cx.textAlign='right';cx.fillText(Math.round(frontModel.W)+' mm',w-padX,h-8);cx.textAlign='left';
}
function updateCoupledUI(){
  if(!coupledModel)return;
  const c=coupledModel;
  $('coFlow').textContent=c.qCm3S.toFixed(1);
  $('coPmax').textContent=c.maxPressureBar.toFixed(1);
  $('coTmin').textContent=c.minTemperatureC.toFixed(1);
  $('coEta').textContent=c.etaMinPaS.toFixed(0)+' – '+c.etaMaxPaS.toFixed(0);
  $('coupledWarning').textContent=c.warning+' Ancho hidráulico equivalente '+(c.assumptions.widthEquivalentM*100).toFixed(0)+' cm y factor de exposición móvil '+c.assumptions.mobileResidenceFactor+' (ambos supuestos).';
  drawCoupledCharts();
}
function drawCoupledCharts(){
 if(!coupledModel)return;
 function chart(id,getVal,titleColor,minY,maxY,yLabel){
  const cn=$(id),cx=cn.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),w=cn.clientWidth,h=cn.clientHeight;
  if(!w||!h)return;
  cn.width=Math.max(1,Math.round(w*dpr));cn.height=Math.max(1,Math.round(h*dpr));cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,w,h);
  const l=58,r=w-18,t=16,b=h-38;
  const xx=v=>l+(r-l)*v/params.injection,yy=v=>b-(b-t)*(v-minY)/(maxY-minY);
  cx.font='10px Segoe UI,Arial';cx.lineWidth=1;
  for(let k=0;k<=4;k++){let val=minY+(maxY-minY)*k/4,py=yy(val);cx.strokeStyle='#293d4b';cx.beginPath();cx.moveTo(l,py);cx.lineTo(r,py);cx.stroke();cx.fillStyle='#94a7b9';cx.fillText(val.toFixed(0),9,py+4);}
  for(let j=0;j<=4;j++){let tt=params.injection*j/4,px=xx(tt);cx.fillStyle='#8096a9';cx.fillText(tt.toFixed(1)+' s',px-14,b+16);}
  cx.beginPath();cx.lineWidth=2.5;cx.strokeStyle=titleColor;
  cx.moveTo(xx(0),yy(id==='pressurePathChart'?0:params.melt));
  for(let k=0;k<coupledModel.samples.length;k++){let point=coupledModel.samples[k];cx.lineTo(xx(point.timeS),yy(getVal(point)));}cx.stroke();
  const tp=phaseInfo().filled*params.injection,cP=coupledModel.atFraction(phaseInfo().filled);
  const v=phaseInfo().filled>0?getVal(cP):(id==='pressurePathChart'?0:params.melt);
  cx.setLineDash([4,5]);cx.strokeStyle='#e1d1a6';cx.beginPath();cx.moveTo(xx(tp),t);cx.lineTo(xx(tp),b);cx.stroke();cx.setLineDash([]);
  cx.beginPath();cx.arc(xx(tp),yy(v),4,0,2*Math.PI);cx.fillStyle='#fff1c6';cx.fill();
  drawAxisTitles(cx,w,h,l,r,t,b,'Tiempo de llenado (s)',yLabel);
 }
 const maxp=Math.max(1,Math.ceil(coupledModel.maxPressureBar/10)*10),minT=Math.floor((coupledModel.minTemperatureC-4)/10)*10;
 chart('pressurePathChart',x=>x.pressureBar,'#eeac61',0,maxp*1.1,'Caída de presión (bar)');
 chart('meltFlowChart',x=>x.minT_C,'#6dcde1',minT,Math.max(params.melt+3,minT+10),'Temperatura del fundido (°C)');
}
function updateFrontUI(){
 const p=phaseInfo(),f=p.filled;
 $('frontFilled').textContent=(100*frontModel.filledAt(f)).toFixed(1);
 $('frontElapsed').textContent=(f*params.injection).toFixed(1);
 $('mapGateLabel').textContent='Entrada: '+frontModel.gate.label;
 const idx=(f>=1)?frontModel.order.at(-1):frontModel.order.findLast(i=>frontModel.arrival[i]<=f);
 if(idx===undefined)$('frontLast').textContent='Pendiente';
 else {let x=idx%frontModel.NX,y=Math.floor(idx/frontModel.NX);$('frontLast').textContent=Math.round((x+.5)*frontModel.W/frontModel.NX)+'×'+Math.round((y+.5)*frontModel.H/frontModel.NY)+' mm';}
 const rows=$('frontRegionRows');rows.textContent='';
 for(const z of frontModel.regions){let tr=document.createElement('tr'),a=document.createElement('td'),b=document.createElement('td'),c=document.createElement('td');a.textContent=z.name;b.textContent=(z.fraction*params.injection).toFixed(2)+' s';c.textContent=f>=z.fraction?'Alcanzada':'Pendiente';c.className=f>=z.fraction?'flow-status':'flow-wait';tr.append(a,b,c);rows.appendChild(tr);}
 drawFrontMap();
}
function updateThermal(){sim=H.simulate(params);updateUI();}
function updateUI(){coupledModel=C.calculate(frontModel,params);let tl=timeline(),total=tl.at(-1).end;
 $('gate').value=params.gate; $('hopperVal').textContent=params.hopper.toFixed(0)+' °C';$('masterbatchVal').textContent=params.masterbatch.toFixed(1)+' %';$('packPVal').textContent=params.packP.toFixed(0)+' MPa';$('waterVal').textContent=params.water.toFixed(1)+' °C';$('meltVal').textContent=params.melt.toFixed(0)+' °C';$('flowVal').textContent=params.flow.toFixed(1)+' GPM';$('thicknessVal').textContent=params.thickness.toFixed(2)+' mm';$('injectionVal').textContent=params.injection+' s';$('holdVal').textContent=params.hold+' s';$('coolVal').textContent=params.cool+' s';
 $('hopperMetric').textContent=params.hopper.toFixed(1);$('qReadout').textContent=H.qHeat(params.hopper,params.melt).toFixed(1)+' kJ/pieza';$('nozzleMetric').textContent=params.melt.toFixed(0);$('moldMetric').textContent=sim.wall.toFixed(1);$('waterReadout').textContent=params.flow.toFixed(1)+' GPM · '+(params.flow*3.785411784).toFixed(1)+' L/min';$('mbReadout').textContent=params.masterbatch.toFixed(1)+' %';
 $('returnReadout').textContent='≈'+(params.water+1).toFixed(1)+' °C (hipótesis)';$('barrelSetpoints').textContent=barrelProfile(params.melt).map(v=>Math.round(v)).join(' / ')+' °C';
 let panelEnd=H.zoneEnd(sim,0),cornerEnd=H.zoneEnd(sim,4);
 $('panelMetric').textContent=panelEnd.center.toFixed(1);$('cornerReadout').textContent=cornerEnd.center.toFixed(1)+' °C';
 $('qRemovedMetric').textContent=H.qRemoved(sim).toFixed(1);$('qRemovedReadout').textContent=H.qRemoved(sim).toFixed(1)+' kJ/pieza';
 $('shrinkMetric').textContent=M.shrinkPct(panelEnd.average,params.masterbatch).toFixed(3);$('cornerShrinkReadout').textContent=M.shrinkPct(cornerEnd.average,params.masterbatch).toFixed(3)+' %';
 updateMixUI();$('time').max=total;time=Math.min(time,total);$('totalClock').textContent='/ '+total.toFixed(0)+' s';
 refreshDynamicMetrics();
 let segments=$('segments');segments.innerHTML='';for(let p of tl){let e=document.createElement('span');e.style.width=(p.duration/total*100)+'%';segments.appendChild(e);}
 updateTimeUI();drawScrewChart();drawChart();drawFillChart();updateCoupledUI();render();}
function refreshDynamicMetrics(){let p=phaseInfo(),feed=M.liveFed(time,params.masterbatch,timeline()[0].duration);$('fillMetric').textContent=(p.filled*100).toFixed(0);$('pressureMetric').textContent=pressureIndicator(p).toFixed(0);$('packMetric').textContent=packingIndicator(p).toFixed(0);$('fedMetric').textContent=feed.fedG.toFixed(2);$('fedDetailed').textContent=feed.fedG.toFixed(2)+' g';$('fedFraction').textContent=(100*feed.fraction).toFixed(1)+' %';$('feedBar').style.width=(100*feed.fraction)+'%';}
function updateTimeUI(){let p=phaseInfo(),tEnd=timeline().at(-1).end;$('time').value=time;$('clock').textContent=time.toFixed(1)+' s';$('phaseName').textContent=phaseNames[p.index];$('phaseBadge').textContent=phaseNames[p.index].toUpperCase();$('phaseIcon').textContent=['●','↔','➤','▣','❄','↗','↺'][p.index];$('play').innerHTML=playing?'Ⅱ <span>Pausar</span>':'▶ <span>Reproducir</span>';
 $('sceneTitle').textContent=partView?'Puerta evaporadora · reconstrucción aproximada':'Inyectora · conjunto completo';$('machineLabel').style.display=partView?'none':'block';
 refreshDynamicMetrics();drawScrewChart();
 drawChart();drawFillChart();updateFrontUI();drawCoupledCharts();}
function drawChart(){const canvasChart=$('temperatureChart'),ctx=canvasChart.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),ww=canvasChart.clientWidth,hh=canvasChart.clientHeight;
 if(!ww||!hh)return;canvasChart.width=Math.max(1,ww*dpr);canvasChart.height=Math.max(1,hh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,ww,hh);
 let left=54,right=ww-15,top=16,bottom=hh-40;let ymin=Math.min(35,sim.wall-15),ymax=Math.max(params.melt+7,245),maxT=sim.tmax;
 let xy=(t,T)=>[left+(right-left)*t/maxT,bottom-(bottom-top)*(T-ymin)/(ymax-ymin)];
 ctx.font='10px Segoe UI,Arial';ctx.lineWidth=1;
 for(let T=40;T<=240;T+=40){let y=xy(0,T)[1];ctx.strokeStyle='#293d4b';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#7994a9';ctx.fillText(T+' °C',8,y+3);}
 for(let t=0;t<=maxT+1;t+=10){if(t>maxT)break;let x=xy(t,ymin)[0];ctx.strokeStyle='#1f3040';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.fillStyle='#7890a3';ctx.fillText(t+' s',x-10,bottom+16);}
 let datasets=[{index:0,color:'#67c4e4'},{index:4,color:'#efb46b'}];
 for(let data of datasets){let arr=sim.profiles[data.index].trace;ctx.strokeStyle=data.color;ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<arr.length;i++){let p=xy(i*.5,arr[i][0]);if(i===0)ctx.moveTo(...p);else ctx.lineTo(...p);}ctx.stroke();}
 ctx.strokeStyle='#9a9fae';ctx.setLineDash([4,5]);ctx.beginPath();let y=xy(0,sim.wall)[1];ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);
 let t=phaseInfo().thermalTime;let xx=xy(t,sim.wall)[0];ctx.strokeStyle='#ecf5ff';ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.globalAlpha=1;
 drawAxisTitles(ctx,ww,hh,left,right,top,bottom,'Tiempo de enfriamiento (s)','Temperatura (°C)');
}
let draggingChart=false;
function resize(){render();drawScrewChart();drawChart();drawFillChart();drawFrontMap();drawCoupledCharts()}
window.addEventListener('resize',resize);
$('flowMapMode').addEventListener('change',drawFrontMap);
$('fromRealConfirm').addEventListener('change',e=>{
 fromMeas.confirmed=Boolean(e.target.checked);
 if(!fromMeas.confirmed){fromMeas.value=null;fromMeas.signature=null;$('fromRealValue').value='';}
 else {fromMeas.signature=fromSignature(params);fromMeas.value=null;}
 updateUI();
});
$('fromRealValue').addEventListener('input',e=>{
 if(!fromMeas.confirmed)return;
 const raw=e.target.value.trim();
 fromMeas.value=raw===''?null:Number(raw);
 // Al registrar el dato, se vincula a las condiciones que existen en este momento.
 if(raw!==''&&Number.isFinite(fromMeas.value)&&fromMeas.value>=0&&fromMeas.value<=120)fromMeas.signature=fromSignature(params);
 updateUI();
});
for(let key of Object.keys(defaults).filter(k=>k!=='deltaWater'))$(key).addEventListener(key==='gate'?'change':'input',e=>{params[key]=key==='gate'?e.target.value:+e.target.value;if(['thickness','gate'].includes(key))frontModel=F.simulate(params);if(['masterbatch','deltaWater','packP','gate'].includes(key))updateUI();else updateThermal()});
$('restore').addEventListener('click',()=>{fromMeas.confirmed=false;fromMeas.value=null;fromMeas.signature=null;$('fromRealConfirm').checked=false;$('fromRealValue').value='';params={...defaults};for(let key of Object.keys(defaults).filter(k=>k!=='deltaWater'))$(key).value=defaults[key];frontModel=F.simulate(params);time=0;playing=false;updateThermal()});
$('thermal').addEventListener('change',e=>{thermal=e.target.checked;render()});
function setView(part){partView=part;$('btnPart').classList.toggle('is-active',part);$('btnMachine').classList.toggle('is-active',!part);if(part){dist=6.1;target=[0,1.4,0];yaw=.84;pitch=.38;}else{dist=11.5;target=[0,1.55,0];yaw=.59;pitch=.37;}updateTimeUI();render()}
$('btnPart').addEventListener('click',()=>setView(true));$('btnMachine').addEventListener('click',()=>setView(false));
$('cameraReset').addEventListener('click',()=>setView(partView));canvas.addEventListener('dblclick',()=>setView(partView));
canvas.addEventListener('pointerdown',e=>{dragging=true;lastMouse=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('pointermove',e=>{if(!dragging)return;let dx=e.clientX-lastMouse[0],dy=e.clientY-lastMouse[1];yaw+=dx*.007;pitch=clamp(pitch+dy*.0055,-1.15,1.23);lastMouse=[e.clientX,e.clientY];render();});
canvas.addEventListener('wheel',e=>{e.preventDefault();dist=clamp(dist*Math.exp(e.deltaY*.0011),partView?3.8:6.3,27);render();},{passive:false});
$('time').addEventListener('input',e=>{time=+e.target.value;playing=false;updateTimeUI();render();});
$('play').addEventListener('click',()=>{if(time>=timeline().at(-1).end-.001)time=0;playing=!playing;updateTimeUI()});
$('restart').addEventListener('click',()=>{playing=false;time=0;updateTimeUI();render()});
for(let b of document.querySelectorAll('.speed'))b.addEventListener('click',()=>{speed=+b.dataset.speed;for(let bb of document.querySelectorAll('.speed'))bb.classList.toggle('is-active',bb===b)});
$('exportPNG').addEventListener('click',()=>{render();let a=document.createElement('a');a.download='HAITIAN_MA3800_v25_'+(partView?'puerta':'maquina')+'.png';a.href=canvas.toDataURL('image/png');a.click();});
$('downloadBalances').addEventListener('click',()=>{
 const {balance:b,flow,pvt}=window.lastHipsBalances;
 const records=[['grupo','corriente','entrada','salida','unidad'],
 ['masa','HIPS',b.composition.hipsG,'','g/ciclo'],['masa','masterbatch',b.composition.mbG,'','g/ciclo'],
 ['masa','pieza','',b.massOutputG,'g/ciclo'],['masa','merma','',0,'g/ciclo'],
 ['calentamiento','calor neto al polímero',b.heatKJ,'','kJ/ciclo'],['calentamiento','fundido','',b.heatKJ,'kJ/ciclo'],
 ['enfriamiento','fundido',b.heatKJ,'','kJ/ciclo'],['enfriamiento','pieza a expulsión','',b.pieceEnergyKJ,'kJ/ciclo'],
 ['enfriamiento','calor al molde','',b.moldEnergyKJ,'kJ/ciclo'],
 ['agua','calor calculado del circuito',b.qWaterKJ,'','kJ/ciclo'],['agua','FROM utilizada',b.fromAssumedC,'','°C'],['agua','Origen FROM',getFromStatus(params).measured?'reportada como medición':'supuesto','','texto'],
 ['reología','viscosidad Cross-WLF',flow.viscosityPaS,'','Pa.s'],
 ['reología','caida de presión ranura equivalente',flow.deltaPBar,'','bar'],
 ['pvt','compresión volumétrica Tait',pvt.compressionPct,'','%']];
 const csv='\ufeff'+records.map(row=>row.join(';')).join('\r\n');
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 a.href=url;a.download='balances_HIPS_MA3800_v25.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
});
$('exportCSV').addEventListener('click',()=>{let lines=['tiempo_s,llenado_pct,alimentado_g,hips_alimentado_g,masterbatch_alimentado_g,panel_centro_C,ensamble_centro_C'];let tl=timeline(),inj=tl[2],total=tl.at(-1).end;for(let t=0;t<=total+.001;t+=.5){let th=clamp(t-inj.end,0,sim.tmax),a=H.at(sim,0,th),b=H.at(sim,4,th),f=M.liveFed(t,params.masterbatch,tl[0].duration),frac=M.fillFraction(t,inj.start,inj.duration);lines.push([t.toFixed(1),(100*frac).toFixed(2),f.fedG.toFixed(3),f.hipsFedG.toFixed(3),f.mbFedG.toFixed(3),a[0].toFixed(3),b[0].toFixed(3)].join(','));}let blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.download='simulacion_mezcla_llenado_MA3800_v25.csv';a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);});
$('downloadCoupled').addEventListener('click',()=>{const csv=C.exportCSV(frontModel,coupledModel,params.injection),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='acoplado_T_eta_deltaP_MA3800_v25.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);});
$('downloadFront').addEventListener('click',()=>{const csv=F.exportCSV(frontModel,params.injection),a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='frente_llenado_MA3800_v25.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);});
function tick(now){if(lastFrame&&playing){time+=Math.min((now-lastFrame)/1000,0.1)*speed;if(time>=timeline().at(-1).end){time=timeline().at(-1).end;playing=false;}updateTimeUI();render();}lastFrame=now;requestAnimationFrame(tick)}
updateUI();requestAnimationFrame(tick);
})();
