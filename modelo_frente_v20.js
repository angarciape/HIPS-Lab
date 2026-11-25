/* HIPS LAB v20 — ORDEN DE LLENADO 2D POR CAMINOS DE MENOR RESISTENCIA.
 * Modelo de sensibilidad geométrica; no resuelve presión 2D, ecuación de Hele-Shaw,
 * caudal transitorio ni el frente de flujo físico. Gate no medido.
 * Los costos locales se inspiran en velocidad ~ h^2 para una ranura laminar.
 * El tiempo de llegada se parametriza por fracción de volumen llenada a Q constante.
 */
(function(root){'use strict';
const NX=65,NY=67,W=456.86,H=465.14;
const gates={
 centro:{label:'Centro (supuesto)',x:.5,y:.5},
 arriba:{label:'Borde superior (supuesto)',x:.5,y:.065},
 derecha:{label:'Lateral derecho (supuesto)',x:.94,y:.5},
 abajo:{label:'Borde inferior (supuesto)',x:.5,y:.94},
 izquierda:{label:'Lateral izquierdo (supuesto)',x:.06,y:.5}
};
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function thicknessAt(u,v,panel){
 // El panel se infiere de masa/volumen; los bordes y esquinas son franjas de extensión SUPUESTA.
 let h=panel;
 if(v<.06)h=3.15; // reborde superior medido LOCALMENTE
 if(v>.944)h=2.20; // reborde inferior NO medido
 if(u<.05)h=2.15; // lateral izquierdo NO medido
 if(u>.94)h=v<.48?2.79:1.79; // espesores locales medidos del costado derecho
 // Dos zonas puntuales de ensamble, no barras de 4.15 mm.
 if(u>.90 && (v<.07||v>.93))h=4.15;
 return h;
}
class MinHeap{
 constructor(){this.a=[];}
 push(d,i){let a=this.a,j=a.length;a.push([d,i]);while(j>0){let k=(j-1)>>1;if(a[k][0]<=d)break;a[j]=a[k];j=k;}a[j]=[d,i];}
 pop(){let a=this.a,out=a[0],end=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(end[0]<=a[c][0])break;a[i]=a[c];i=c;}a[i]=end;}return out;}
 get length(){return this.a.length;}
}
function simulate(opts){
 const panel=+opts.thickness,g=String(opts.gate||'centro'),gate=gates[g]||gates.centro;
 const nx=Number(opts.NX)||NX,ny=Number(opts.NY)||NY;
 if(nx<10||ny<10||nx>150||ny>150)throw Error('Resolución de malla fuera de límites');
 if(!(panel>0))throw Error('Espesor principal inválido');
 const n=nx*ny,h=new Float64Array(n),volume=new Float64Array(n),potential=new Float64Array(n),arrival=new Float64Array(n),parent=new Int32Array(n);parent.fill(-1);
 const dx=W/nx,dy=H/ny,ref=2.0;
 let total=0;
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  let i=y*nx+x,u=(x+.5)/nx,v=(y+.5)/ny;
  let e=thicknessAt(u,v,panel);
  h[i]=e;volume[i]=e*dx*dy;total+=volume[i];potential[i]=Infinity;
 }
 const gx=clamp(Math.floor(gate.x*nx),0,nx-1),gy=clamp(Math.floor(gate.y*ny),0,ny-1),gidx=gy*nx+gx;
 const pq=new MinHeap();potential[gidx]=0;pq.push(0,gidx);
 const edges=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
 while(pq.length){const [d,i]=pq.pop();if(d>potential[i]+1e-12)continue;
  const x=i%nx,y=(i/nx)|0;
  for(const [ox,oy] of edges){let xx=x+ox,yy=y+oy;if(xx<0||xx>=nx||yy<0||yy>=ny)continue;
   const j=yy*nx+xx,e=.5*(h[i]+h[j]);
   const length=Math.hypot(ox*dx,oy*dy);
   const resistance=Math.pow(ref/e,2); // h^-2 es un indicador de velocidad relativa, no una ley CFD completa.
   const nd=d+length*resistance;
   if(nd<potential[j]){potential[j]=nd;parent[j]=i;pq.push(nd,j);}
  }
 }
 const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>potential[a]-potential[b]||a-b);
 let cum=0;
 for(const i of order){arrival[i]=(cum+volume[i]*.5)/total;cum+=volume[i];}
 const regionSamples={
  'Centro del panel':[.50,.50],
  'Reborde superior':[.50,.035],
  'Lateral derecho superior':[.97,.30],
  'Lateral derecho inferior':[.97,.73],
  'Ensamble superior derecho':[.96,.035],
  'Ensamble inferior derecho':[.96,.967],
  'Esquina opuesta':[.04,.965]
 };
 const regions=Object.entries(regionSamples).map(([label,uv])=>({name:label,fraction:sample({arrival,NX:nx,NY:ny},uv[0],uv[1]),x:uv[0],y:uv[1]}));
 const avgPotential=potential.reduce((s,v,i)=>s+v*volume[i],0)/total;
 const maxPotential=Math.max(...potential);
 const filledAt=(f)=>{if(f<=0)return 0;if(f>=1)return 1;let sum=0;for(let i=0;i<n;i++)if(arrival[i]<=f)sum+=volume[i];return sum/total;};
 return {NX:nx,NY:ny,W,H,gate:{...gate,id:g},gateIndex:gidx,parent,panel,thickness:h,potential,arrival,volume,total,order,
   maxPotential,avgPotential,regions,filledAt,assumption:'Orden por caminos de mínimo costo + caudal constante impuesto; entrada y espesores de áreas no medidos'};
}
function sample(model,u,v){let nx=model.NX,ny=model.NY;let xx=clamp(Math.floor(clamp(u,0,1-1e-10)*nx),0,nx-1),yy=clamp(Math.floor(clamp(v,0,1-1e-10)*ny),0,ny-1);return model.arrival[yy*nx+xx];}
function exportCSV(model,tfill){let rows=['x_mm;y_mm;espesor_mm;coste_relativo;tiempo_llegada_s;fraccion_llegada'];for(let y=0;y<model.NY;y++)for(let x=0;x<model.NX;x++){let i=y*model.NX+x;rows.push([((x+.5)*W/model.NX).toFixed(3),((y+.5)*H/model.NY).toFixed(3),model.thickness[i].toFixed(3),model.potential[i].toFixed(5),(model.arrival[i]*tfill).toFixed(4),model.arrival[i].toFixed(6)].join(';'));}return '\ufeff'+rows.join('\r\n');}
const out={NX,NY,W,H,gates,thicknessAt,simulate,sample,exportCSV};root.HipsFlowFront=out;
if(typeof module!=='undefined'&&module.exports)module.exports=out;
})(typeof window!=='undefined'?window:globalThis);
