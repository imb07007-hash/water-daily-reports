/* WS-PTW acceptance environment guard. No effect on the production hostname. */
(()=>{
 'use strict';
 if(location.hostname!=='water-ptw-acceptance.onrender.com')return;
 const lockNavigation=e=>{
   const trigger=e.target?.closest?.('[data-ws-to],[data-act="new"],#ptwModal [data-view="new"]');
   if(!trigger)return;
   const route=String(trigger.dataset.wsTo||'');
   if(route==='ptw/new'||((trigger.dataset.act==='new'||trigger.dataset.view==='new')&&trigger.closest('#ptwModal'))){
     const approved=window.confirm('تنبيه مهم: رابط التجربة متصل بقاعدة البيانات الحالية. إنشاء مسودة يحجز رقم PTW حقيقيًا لا يعاد استخدامه، ويظهر في الأرشيف. أنشئ مسودة فقط عندما تريد اختبار السجل، واكتب كلمة TEST في وصف العمل. هل تريد المتابعة؟');
     if(!approved){e.preventDefault();e.stopImmediatePropagation();}
     return;
   }
   if(route.startsWith('ptw/')||route==='home')return;
   e.preventDefault();e.stopImmediatePropagation();
   const n=document.getElementById('ptwAcceptanceNotice');
   if(n)n.querySelector('[data-message]').textContent='هذه النسخة مخصصة لاختبار PTW فقط. بقية الوظائف موجودة على الموقع الرئيسي.';
 };
 document.addEventListener('click',lockNavigation,true);
 function addNotice(){
  if(document.getElementById('ptwAcceptanceNotice'))return;
  const bar=document.createElement('aside');
  bar.id='ptwAcceptanceNotice';bar.setAttribute('role','status');
  bar.style.cssText='position:fixed;z-index:5000;bottom:0;inset-inline:0;padding:9px 17px;background:#fff3d0;border-top:2px solid #ad7a18;color:#513d12;box-shadow:0 -3px 14px #0002;font:600 13px/1.65 system-ui,Tahoma,Arial;direction:rtl;text-align:center';
  const msg=document.createElement('span');
  msg.setAttribute('data-message','');msg.textContent='نسخة قبول تجريبية لتصاريح العمل فقط — مرتبطة بقاعدة البيانات الحالية؛ أي مسودة تحفظ هنا ستظهر في الأرشيف ويحجز لها رقم PTW فعلي غير قابل لإعادة الاستخدام. لا تستخدم هذه النسخة لإصدار تصريح ميداني دون إجراءات ST-07 الورقية.';
  const link=document.createElement('a');link.href='https://water-daily-reports.onrender.com';link.textContent=' | العودة للموقع الرئيسي';link.rel='noopener noreferrer';link.style.cssText='color:#075b97;text-decoration:underline;margin-inline-start:10px';
  bar.append(msg,link);document.body.appendChild(bar);
  document.body.style.paddingBottom='80px';
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addNotice,{once:true});else addNotice();
})();