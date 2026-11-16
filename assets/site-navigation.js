/* Native navigation group behavior; does not modify accounts or report data. */
(function(){
 'use strict';
 function init(){
  const header=document.querySelector('.app-bar');
  if(!header)return;
  const menus=[...header.querySelectorAll('details.ws-menu')];
  const collapse=except=>menus.forEach(d=>{if(d!==except)d.open=false});
  menus.forEach(d=>{
   d.addEventListener('toggle',()=>{if(d.open)collapse(d)});
   d.addEventListener('click',e=>{if(e.target.closest('.ws-menu-content button'))d.open=false});
  });
  document.addEventListener('pointerdown',e=>{
   if(!e.target.closest('details.ws-menu'))collapse();
  });
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'){
    const active=menus.find(d=>d.open);
    if(active){active.open=false;active.querySelector('summary')?.focus()}
   }
  });
  window.addEventListener('beforeprint',()=>collapse());
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
