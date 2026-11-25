/* Auditoría técnica HIPS LAB v25. Diagnósticos sin alterar ecuaciones. */
(function(){'use strict';
 const $=id=>document.getElementById(id);let pending=false;
 function recalc(){
  pending=false;
  if(window.HipsResultsV22?.active!=='auditoria')return;
  const H=window.HipsThermal,F=window.HipsFlowFront;
  const melt=Number($('melt').value),h=Number($('thickness').value),gate=$('gate').value;
  const mesh=F.simulate({thickness:h,gate});
  const vmesh=mesh.total/1000,vmelt=.462/H.rho(melt)*1e6;
  const diff=100*(vmesh/vmelt-1);
  const b=window.lastHipsBalances?.balance;
  $('auditMeshV').textContent=vmesh.toFixed(1)+' cm³';
  $('auditMeltV').textContent=vmelt.toFixed(1)+' cm³';
  $('auditGap').textContent=(diff>0?'+':'')+diff.toFixed(1)+' %';
  $('auditRequiredWater').textContent=b?b.deltaRequiredC.toFixed(2)+' °C':'—';
 }
 function queue(){if(pending)return;pending=true;requestAnimationFrame(recalc);}
 const btn=$('resultados')?.querySelector('.result-action[data-target="auditoria"]');
 btn?.addEventListener('click',queue);
 document.querySelector('.sidebar-scroll')?.addEventListener('input',queue);
 document.querySelector('.sidebar-scroll')?.addEventListener('change',queue);
 window.HipsAuditV25={recalc};
})();
