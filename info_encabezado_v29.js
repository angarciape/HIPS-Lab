/* HIPS LAB v29: descripción accesible con mouse, teclado y táctil */
(function(){'use strict';
const region=document.getElementById('brandAbout'),btn=region?.querySelector('button');
if(!btn)return;
function open(v){region.classList.toggle('is-open',v);btn.setAttribute('aria-expanded',String(v));}
btn.addEventListener('click',()=>open(!region.classList.contains('is-open')));
document.addEventListener('keydown',e=>{if(e.key==='Escape')open(false)});
document.addEventListener('pointerdown',e=>{if(!region.contains(e.target))open(false)});
})();
