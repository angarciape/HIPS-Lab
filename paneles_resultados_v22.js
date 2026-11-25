/* HIPS LAB v27 · Panel único de resultados.
   Control accesible: solo una categoría abierta; un segundo clic la cierra.
   No altera las fórmulas ni vuelve a dibujar el 3D hasta necesitarlo.
*/
(function(){'use strict';
const hub=document.getElementById('resultados');
if(!hub)return;
const buttons=[...hub.querySelectorAll('.result-action[data-target]')];
const panels=[...hub.querySelectorAll('.result-panel[data-panel]')];
let current=null,drawQueued=false,calcQueued=false,group="operacion";
function redraw(){
 if(drawQueued)return;
 drawQueued=true;
 requestAnimationFrame(()=>{
  drawQueued=false;
  // Canvas necesita dimensiones finales después de mostrar la sección.
  window.dispatchEvent(new Event('resize'));
 });
}
function format(x,n=1){return Number(x).toFixed(n);}
function getParams(){
 const base={};
 for(const id of ['hopper','water','melt','flow','thickness','injection','hold','cool','masterbatch','deltaWater','packP']){
   let el=document.getElementById(id);
   if(el)base[id]=Number(el.value);
 }
 const gate=document.getElementById('gate');if(gate)base.gate=gate.value;
 return base;
}
function sensitivity(){
 const ops=document.querySelector('[data-sensitivity-panel="operacion"]');
 const mt=document.getElementById('sensitivityThermalRows'), mr=document.getElementById('sensitivityRheoRows');
 document.querySelectorAll('.sensitivity-tab').forEach(button=>{
  const active=button.dataset.sensitivity===group;
  button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
 });
 document.querySelectorAll('.sensitivity-panel').forEach(panel=>{panel.hidden=panel.dataset.sensitivityPanel!==group;});
 const findings=document.getElementById('sensitivityFindings');
 try{
   if(group==='operacion'){
     const result=window.HipsSensitivityV22.calculate(getParams());
     const output=document.getElementById('sensitivityRows');output.textContent='';
     for(const row of result.rows){
       const tr=document.createElement('tr');
       const range=document.createElement('td');
       const d=row.units==='mm'?2:0;
       range.textContent=`${row.label}: ${format(row.low,d)} → ${format(row.high,d)} ${row.units}`;tr.append(range);
       for(const key of ['panelC','heatKJ','pressureBar']){
         const td=document.createElement('td');
         td.textContent=`${format(row.below[key])} – ${format(row.above[key])}`;tr.append(td);
       }
       output.append(tr);
     }
     document.getElementById('sensitivityBase').textContent=`Escenario actual: panel ${format(result.base.panelC)} °C · Q molde ${format(result.base.heatKJ)} kJ/pieza · ΔP ranura ${format(result.base.pressureBar)} bar. Son comparaciones de operación con la ranura equivalente del módulo v19.`;
     findings.textContent='Los controles de operación se varían de uno en uno. La presión de esta tabla usa una ranura simplificada; no compararla como si fuera idéntica a la red 2D de las otras categorías.';
     return;
   }
   const rowsTarget=group==='termica'?mt:mr;
   const result=window.HipsSensitivityV27.calculate(getParams(),group);
   rowsTarget.textContent='';
   const vals=['panelC','coolKJ','pressureBar','minFlowC'];
   for(const row of result.rows){
     const tr=document.createElement('tr'),name=document.createElement('td');
     name.textContent=`${row.label} (${row.description})`;tr.append(name);
     for(const key of vals){
       const td=document.createElement('td');td.textContent=`${format(row.low[key],key==='panelC'?3:1)} → ${format(row.high[key],key==='panelC'?3:1)}`;
       tr.append(td);
     }
     rowsTarget.append(tr);
   }
   let greatestPressure=result.rows.reduce((a,b)=>b.span.pressureBar>a.span.pressureBar?b:a);
   let greatestPanel=result.rows.reduce((a,b)=>b.span.panelC>a.span.panelC?b:a);
   const centerFinding=greatestPanel.span.panelC<.001?'Las variaciones de este grupo no cambian la temperatura de expulsión del panel en este modelo: la etapa de enfriamiento no recibe retroalimentación de la reología.':`En los rangos escogidos, el mayor cambio de T central del panel corresponde a ${greatestPanel.label.toLowerCase()} (Δ=${format(greatestPanel.span.panelC,3)} °C).`;
   findings.textContent=`Base: panel ${format(result.base.panelC)} °C; Q molde ${format(result.base.coolKJ)} kJ; ΔP red ${format(result.base.pressureBar)} bar; T mínima del flujo ${format(result.base.minFlowC)} °C. ${centerFinding} El mayor cambio de ΔP de este grupo corresponde a ${greatestPressure.label.toLowerCase()} (Δ=${format(greatestPressure.span.pressureBar)} bar). Estas perturbaciones tienen amplitudes diferentes y no constituyen una clasificación global de importancia.`;
 }catch(error){
  const target=group==='operacion'?document.getElementById('sensitivityRows'):(group==='termica'?mt:mr);
  target.textContent='';const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=group==='operacion'?4:5;td.textContent='Error al calcular: '+error.message;tr.append(td);target.append(tr);
  findings.textContent='El cálculo no pudo completarse con los parámetros elegidos.';
 }
}
for(const button of document.querySelectorAll('.sensitivity-tab'))button.addEventListener('click',()=>{
 group=button.dataset.sensitivity;
 if(current==='incertidumbre')queueSensitivity();
});
function queueSensitivity(){
 if(current!=='incertidumbre'||calcQueued)return;
 calcQueued=true;
 requestAnimationFrame(()=>{
  calcQueued=false;
  if(current==='incertidumbre')sensitivity();
 });
}
function open(key,{scroll=false}={}){
 const next=current===key?null:key;
 current=next;
 for(const button of buttons){
  const isActive=next===button.dataset.target;
  button.classList.toggle('is-open',isActive);
  button.setAttribute('aria-expanded',String(isActive));
 }
 for(const panel of panels){
  const shown=panel.dataset.panel===next;
  panel.hidden=!shown;
  panel.classList.toggle('is-open',shown);
 }
 if(next){
  if(next==='incertidumbre')queueSensitivity();
  redraw();
 }
 if(scroll){
  const dest=next?document.getElementById('resultado-'+next):hub;
  requestAnimationFrame(()=>dest?.scrollIntoView({block:'start',behavior:'smooth'}));
 }
}
for(const button of buttons)button.addEventListener('click',()=>open(button.dataset.target));
for(const anchor of document.querySelectorAll('[data-open-result]')){
 anchor.addEventListener('click',event=>{
  event.preventDefault();
  const key=anchor.dataset.openResult;
  // Navegación abre el destino incluso si ya estaba abierto.
  if(current===key)current=null;
  open(key,{scroll:true});
 });
}
const inputRoot=document.querySelector('.sidebar-scroll');
inputRoot?.addEventListener('input',queueSensitivity);
inputRoot?.addEventListener('change',queueSensitivity);
// Iniciar todos cerrados para evitar saturación visual.
for(const panel of panels)panel.hidden=true;
window.HipsResultsV22={open,get active(){return current;},sensitivity};
})();
