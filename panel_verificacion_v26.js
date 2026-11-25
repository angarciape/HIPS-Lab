/* Panel v26, sólo calcula bajo demanda para no ralentizar el render 3D. */
(function(){'use strict';
const $=id=>document.getElementById(id);
let dirty=true,pending=false;
function compute(){
 pending=false;
 if(window.HipsResultsV22?.active!=='convergencia')return;
 try{
 const keys=['hopper','masterbatch','water','melt','flow','deltaWater','packP','thickness','injection','hold','cool'];
 const p={};for(const k of keys)p[k]=k==='deltaWater'?1:Number($(k).value);p.gate=$('gate').value;
 const ref=window.HipsFlowFront.simulate(p),r=window.HipsGridCheckV26.reconcile(ref,p.melt);
 $('meshRawV26').textContent=r.rawCm3.toFixed(1)+' cm³';
 $('meshTargetV26').textContent=r.targetCm3.toFixed(1)+' cm³';
 $('meshFactorV26').textContent=r.factor.toFixed(3)+' ×';
 $('meshAdjustedV26').textContent=r.bookkeepingCm3.toFixed(1)+' cm³';
 const cv=window.HipsGridCheckV26.convergence(p),tbody=$('gridCheckRowsV26');tbody.textContent='';
 for(const row of cv.rows){const tr=document.createElement('tr');for(const x of [row.NX+' × '+row.NY,row.volumeCm3.toFixed(1),row.timePanelS.toFixed(2),row.timeSideS.toFixed(2),row.pressureBar.toFixed(1)]){let td=document.createElement('td');td.textContent=x;tr.append(td);}tbody.append(tr);}
 $('gridCheckNoteV26').textContent='Comparación malla media → fina: V '+cv.diffVsFinePct.volume.toFixed(1)+' %, t panel '+cv.diffVsFinePct.timePanel.toFixed(1)+' %, t lateral '+cv.diffVsFinePct.timeSide.toFixed(1)+' %, ΔP '+cv.diffVsFinePct.pressure.toFixed(1)+' %. NO son errores medidos.';
 dirty=false;
 }catch(err){$('gridCheckNoteV26').textContent='No se pudo completar la comparación: '+err.message;}
}
function queue(){dirty=true;if(pending)return;pending=true;requestAnimationFrame(compute);}
const b=document.querySelector('.result-action[data-target="convergencia"]');
b?.addEventListener('click',()=>setTimeout(queue,0));
const inputs=document.querySelector('.sidebar-scroll');
inputs?.addEventListener('input',queue);inputs?.addEventListener('change',queue);
window.HipsVerificationV26={compute};
})();
