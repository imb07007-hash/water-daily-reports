/* Water Solutions shared data presentation motion.
 * Runs only after data is rendered, never mutates stored values or input fields.
 * The report-sheet is intentionally excluded to keep screenshots and printing exact.
 */
(function(){
 'use strict';
 const reduce=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const EASE=x=>1-Math.pow(1-x,3);
 const SHOW='.ws-instrument,.dashboard-kpi,.dashboard-plant,.dashboard-section,.dashboard-recent-row,.archive-block,.archive-kpi,.archive-trend-kpi,.archive-entry,.archive-report-list,.audit-row,.sec-row,.stat,.plant,.material,.gauge-item';
 const NUMBERS='.ws-instrument-number,.dashboard-kpi strong,.dashboard-station-value strong,.archive-kpi strong,.archive-trend-kpi strong,.audit-stat strong,.stat strong,.material .quant';
 const MAX_REVEALS=110,MAX_NUMBERS=45;
 let observer=null,active=new Set();
 function visible(el){return !!(el&&el.isConnected&&el.getClientRects().length&&!el.closest('.hidden,[hidden],.report-sheet'))}
 function isSafe(el){return !!el&&!el.closest('.report-sheet,.entry-panel,.login-screen,.settings-controls')}
 function ready(el){
  if(!el.isConnected)return;
  el.classList.remove('ws-reveal-pending');
  el.classList.add('ws-reveal-running');
  const done=()=>{el.classList.remove('ws-reveal-running');el.removeEventListener('animationend',done)};
  el.addEventListener('animationend',done,{once:true});
 }
 function getObserver(){
  if(observer||!('IntersectionObserver' in window))return observer;
  observer=new IntersectionObserver(entries=>{
   for(const e of entries){
    if(e.isIntersecting){observer.unobserve(e.target);ready(e.target)}
   }
  },{threshold:0.06,rootMargin:'0px 0px 100px 0px'});
  return observer;
 }
 function reveal(root){
  if(reduce())return;
  let count=0;
  for(const el of root.querySelectorAll(SHOW)){
   if(count>=MAX_REVEALS)break;
   if(!isSafe(el)||!visible(el)||el.dataset.wsShown==='1')continue;
   el.dataset.wsShown='1';
   el.classList.add('ws-reveal-pending');
   el.style.setProperty('--ws-delay',String(Math.min(count%8*35,245))+'ms');
   const ob=getObserver();
   if(ob)ob.observe(el);else requestAnimationFrame(()=>ready(el));
   count++;
  }
 }
 function unpack(text){
  const m=String(text||'').trim().match(/^([^\d]*?)([+-]?\d[\d,]*(?:\.\d+)?)([^\d]*)$/);
  if(!m)return null;
  const numeric=Number(m[2].replace(/,/g,''));
  if(!Number.isFinite(numeric)||Math.abs(numeric)>10000000000)return null;
  const digits=(m[2].split('.')[1]||'').length;
  return {prefix:m[1],suffix:m[3],value:numeric,digits:Math.min(digits,3)};
 }
 function animateNumbers(root){
  if(reduce())return;
  let count=0;
  for(const el of root.querySelectorAll(NUMBERS)){
   if(count>=MAX_NUMBERS)break;
   if(!isSafe(el)||!visible(el)||el.childElementCount>0||el.dataset.wsCounted==='1')continue;
   const original=el.textContent||'',value=unpack(original);
   if(!value||Math.abs(value.value)<0.001)continue;
   el.dataset.wsCounted='1';
   const digits=value.digits;
   const fmt=n=>n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
   // Never add counting text to editable report fields or exported report DOM.
   el.textContent=value.prefix+fmt(0)+value.suffix;
   const duration=930,start=performance.now();
   let cancelled=false;
   function frame(now){
    if(cancelled)return;
    if(!el.isConnected||!visible(el)){el.textContent=original;active.delete(stop);return}
    const p=Math.min(1,(now-start)/duration);
    el.textContent=p>=1?original:value.prefix+fmt(value.value*EASE(p))+value.suffix;
    if(p<1)requestAnimationFrame(frame);else active.delete(stop);
   }
   const stop=()=>{cancelled=true;el.textContent=original};
   active.add(stop);
   requestAnimationFrame(frame);
   count++;
  }
 }
 function fillCharts(root){
  if(reduce())return;
  // The main dashboard's weekly bars and chemical stock bars already animate independently.
  for(const el of root.querySelectorAll('.archive-barfill,.archive-trend-fill')){
   if(!isSafe(el)||!visible(el))continue;
   const target=el.style.height;
   if(!/^\d+(?:\.\d+)?%$/.test(target)||el.dataset.wsFilled==='1')continue;
   el.dataset.wsFilled='1';
   el.style.height='0%';
   el.classList.add('ws-animated-chart-fill');
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(el.isConnected)el.style.height=target;
   }));
  }
 }
 function animate(root){
  if(!root||reduce()||!visible(root))return;
  reveal(root);animateNumbers(root);fillCharts(root);
 }
 function enterApplication(){
  const main=document.querySelector('.app-main');
  if(main&&visible(main)){
   for(const el of main.querySelectorAll(':scope > .panel')){
    if(el.dataset.wsShown==='1')continue;
    el.dataset.wsShown='1';
    el.classList.add('ws-entry-intro');
   }
  }
 }
 function finish(){
  for(const stop of active)try{stop()}catch(e){}
  active.clear();
  document.querySelectorAll('.ws-reveal-pending,.ws-reveal-running').forEach(el=>{
   el.classList.remove('ws-reveal-pending','ws-reveal-running');
   el.style.opacity='1';el.style.transform='none';
  });
  document.querySelectorAll('.archive-barfill.ws-animated-chart-fill,.archive-trend-fill.ws-animated-chart-fill').forEach(el=>el.style.transition='none');
 }
 window.addEventListener('beforeprint',finish);
 window.WSMotion={animate,enterApplication,finish};
})();
