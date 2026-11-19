/* Water Solutions Platform V4.3
 * No new pages. Official brand vectors, report renderer, and server permissions unchanged.
 * This module only reads report data through authenticated endpoints; final save stays in core-app.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const host=()=>window.WSMaintenanceHost;
const bp=()=>window.WSPlatformHost?.stationBlueprints?.()||[];
const ready=()=>!!host()?.signedIn?.();
const defined=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const present=v=>defined(v);
const number=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(Number(v)||0);
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
let refreshTicket=0,dialog=null,returnFocus=null,resolveReview=null;
function dismiss(accepted=false){
 if(!dialog)return;
 const node=dialog;dialog=null;
 node.remove();document.body.classList.remove('ws-v43-dialog-open');
 const settle=resolveReview;resolveReview=null;
 if(settle)settle(accepted);
 if(returnFocus?.isConnected)try{returnFocus.focus({preventScroll:true})}catch{}
 returnFocus=null;
}
function createDialog(markup,review=false){
 dismiss(false);
 returnFocus=document.activeElement;
 const overlay=document.createElement('div');
 overlay.className='ws-v43-overlay';overlay.setAttribute('data-ws43-overlay','');
 overlay.innerHTML='<section class="ws-v43-dialog" role="dialog" aria-modal="true" aria-label="'+(review?'مراجعة التقرير قبل الإرسال':'معاينة التقرير')+'">'+markup+'</section>';
 document.body.appendChild(overlay);document.body.classList.add('ws-v43-dialog-open');
 dialog=overlay;
 overlay.addEventListener('click',e=>{
  if(e.target===overlay||e.target.closest('[data-ws43-close]')){dismiss(false);return}
  if(review&&e.target.closest('[data-ws43-confirm]'))dismiss(true);
 });
 const keydown=e=>{
  if(!dialog||dialog!==overlay){document.removeEventListener('keydown',keydown,true);return}
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dismiss(false);document.removeEventListener('keydown',keydown,true)}
  if(e.key==='Tab'){
   const targets=[...overlay.querySelectorAll('button:not([disabled]),a[href]')].filter(x=>x.offsetParent!==null);
   if(!targets.length)return;
   const first=targets[0],last=targets[targets.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 };
 document.addEventListener('keydown',keydown,true);
 const close=overlay.querySelector('[data-ws43-close]');
 close?.focus({preventScroll:true});
 return overlay;
}
function readingFields(){
 const root=$('reportInputFields');
 if(!root)return [];
 return [...root.querySelectorAll('input:not([type="hidden"]),textarea,select')].filter(x=>!x.closest('[hidden]'));
}
function fieldCoverage(){
 const fields=readingFields();
 let total=0,filled=0;
 for(const f of fields){
  if(f.type==='checkbox'||f.type==='radio')continue;
  total++;if(present(f.value))filled++;
 }
 const model=window.WSPlatformHost?.reportReadOnly?.();
 const mandatory=(model?.metrics||[]).filter(m=>m.required);
 const requiredDone=mandatory.filter(m=>present(m.value)).length;
 return {total,filled,percent:total?Math.round(100*filled/total):null,mandatory:mandatory.length,requiredDone};
}
function completionMarkup(coverage){
 const p=coverage.percent;
 const requiredLabel=coverage.mandatory?
   'المؤشرات الإلزامية: '+coverage.requiredDone+' من '+coverage.mandatory:
   'لا توجد مؤشرات إلزامية محددة في إعدادات هذه المحطة';
 return '<div class="ws-v43-coverage-copy"><span class="ws-v43-small-title">اكتمال إدخال التقرير</span>'+
  '<strong>'+ (p===null?'—':p+'%') +'</strong><small>'+coverage.filled+' من '+coverage.total+' حقل إدخال</small></div>'+
  '<div class="ws-v43-coverage-body"><div class="ws-v43-coverage-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(p??0)+'" aria-label="نسبة ملء حقول التقرير">'+
  '<span style="width:'+(p??0)+'%"></span></div>'+
  '<small>'+esc(requiredLabel)+'</small>'+
  '<small class="ws-v43-coverage-note">النسبة توضح الحقول المعبأة، ولا تعني اعتماد صحة جميع القراءات. الصفر المدخل يُحسب قراءة.</small></div>';
}
function refreshReport(){
 cancelAnimationFrame(refreshTicket);
 refreshTicket=requestAnimationFrame(()=>{
  if(!ready())return;
  const root=$('reportInputFields');if(!root)return;
  let surface=$('wsV43Completion');
  if(!surface){
   surface=document.createElement('section');surface.id='wsV43Completion';surface.className='ws-v43-coverage';
   surface.setAttribute('aria-label','تغطية إدخال بيانات التقرير');
  }
  if(surface.previousElementSibling!==null||surface.nextElementSibling!==root){
   root.insertAdjacentElement('beforebegin',surface);
  }
  surface.innerHTML=completionMarkup(fieldCoverage());
 });
}
function dashboardSections({stations=[],selectedRows=[],allRows=[],date}={}){
 if(!ready()||!validDate(date))return '';
 const presentReport=new Set(selectedRows.map(r=>r.station_id));
 const missing=stations.filter(s=>!presentReport.has(s.id));
 const native=selectedRows.filter(r=>r.source!=='migration').length;
 const imported=selectedRows.length-native;
 const blueprint=new Map(bp().map(s=>[s.id,s]));
 let expected=0,provided=0,missingInputs=0,checkedReports=0;
 for(const r of selectedRows){
  const def=blueprint.get(r.station_id);
  const fields=(def?.metrics||[]).filter(m=>!m.auto);
  if(!fields.length)continue;
  checkedReports++;
  expected+=fields.length;
  for(const m of fields){if(present(r.data?.metrics?.[m.id]))provided++;else missingInputs++}
 }
 const coverage=expected?Math.round(provided/expected*100):null;
 const seen=new Set(),dup=new Set();
 for(const r of allRows){
  if(r.report_date!==date)continue;
  const key=r.station_id+'@'+r.report_date;
  if(seen.has(key))dup.add(key);else seen.add(key);
 }
 const valid=(v)=>Number.isFinite(v)?number(v):'—';
 const stationNames=missing.length?missing.map(st=>
  '<button class="ws-v43-missing-station" type="button" data-ws43-missing="'+esc(st.id)+'" data-ws43-date="'+esc(date)+'">'+
   '<span class="ws-v43-station-dot" aria-hidden="true"></span>'+
   '<span>'+esc(st.name)+'</span><small>عرض أرشيف المحطة</small></button>').join(''):
  '<div class="ws-v43-no-missing">كل المحطات الظاهرة لديها تقرير مسجل لهذا التاريخ.</div>';
 return '<section class="dashboard-section ws-v43-dashboard" aria-label="متابعة تقارير المحطات وجودة البيانات">'+
  '<div class="dashboard-section-head"><h3>متابعة التقارير وجودة البيانات</h3><small>تاريخ التقرير: '+esc(date)+'</small></div>'+
  '<div class="ws-v43-quality-cards">'+
   '<div class="ws-v43-quality-card"><span>محطات دون تقرير مسجل</span><strong>'+valid(missing.length)+'</strong><small>من '+valid(stations.length)+' محطة متاحة</small></div>'+
   '<div class="ws-v43-quality-card"><span>تقارير أُدخلت بالموقع</span><strong>'+valid(native)+'</strong><small>من التقارير المسجلة لهذا التاريخ</small></div>'+
   '<div class="ws-v43-quality-card"><span>تقارير مستوردة</span><strong>'+valid(imported)+'</strong><small>واتساب أو Excel، لا يعني إرسالًا جديدًا اليوم</small></div>'+
   '<div class="ws-v43-quality-card"><span>تغطية حقول المؤشرات</span><strong>'+(coverage===null?'—':coverage+'%')+'</strong>'+
    '<small>'+(expected?valid(provided)+' من '+valid(expected)+' قراءة · '+valid(checkedReports)+' تقرير':'لا توجد تعريفات مؤشرات قابلة للقياس')+'</small></div>'+
   '</div>'+
  '<div class="ws-v43-quality-detail"><div class="ws-v43-missing-list"><h4>المحطات التي لا يوجد لها تقرير في التاريخ المحدد</h4>'+
   '<div class="ws-v43-missing-items">'+stationNames+'</div></div>'+
   '<div class="ws-v43-quality-explain"><h4>كيف تُحسب الجودة؟</h4>'+
   '<p>نسبة ملء المؤشرات = القراءات غير الفارغة ÷ حقول المؤشرات اليدوية الظاهرة في إعدادات المحطات. الصفر المسجل قراءة، أما الحقل الفارغ فلا يُحسب.</p>'+
   '<div><span>حقول مؤشرات فارغة</span><b>'+valid(missingInputs)+'</b></div>'+
   '<div><span>تكرارات محتملة للتقرير نفسه</span><b>'+valid(dup.size)+'</b></div>'+
   '<small>البيانات المعروضة للفترة المختارة فقط، ولا تعني اعتماد جودة التحليل المخبري أو صحة الأرقام.</small></div></div>'+
  '</section>';
}
function sourceDescription(r){
 if(r.source==='migration'&&String(r.imported_from||'').startsWith('google_drive_xlsx:'))return 'استيراد من ملف Excel — وقت الحفظ في الموقع';
 if(r.source==='migration'&&r.source_sent_at)return 'استيراد من واتساب — وقت الرسالة الأصلية متوفر';
 if(r.source==='migration')return 'استيراد من واتساب — وقت الرسالة الأصلية غير موثق';
 return 'إدخال مباشر عبر الموقع';
}
function showStamp(value){
 if(!value)return 'غير متوفر';
 const date=new Date(value);
 if(!Number.isFinite(date.valueOf()))return 'غير متوفر';
 return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{
  timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true
 }).format(date);
}
function reportRow(label,value,unit){
 const normalized=present(value)?String(value):'غير مسجل';
 return '<tr><th scope="row">'+esc(label)+'</th><td dir="auto">'+esc(normalized)+(present(value)&&unit?' <small>'+esc(unit)+'</small>':'')+'</td></tr>';
}
function quickPreviewMarkup(r){
 const models=bp(),config=(r.config_snapshot&&Array.isArray(r.config_snapshot.metrics))?
  r.config_snapshot:models.find(s=>s.id===r.station_id);
 const metricDefs=config?.metrics||[];
 const known=new Map(metricDefs.map(m=>[m.id,m]));
 const m=r.data?.metrics||{},keys=Object.keys(m);
 const rows=keys.slice(0,40).map(k=>{
  const def=known.get(k);return reportRow(def?.label||k,m[k],def?.unit||'');
 }).join('');
 const notes=Object.entries(r.data?.notes||{}).filter(([,v])=>present(v)).slice(0,8)
  .map(([k,v])=>reportRow(config?.noteFields?.find?.(f=>f.id===k)?.label||k,v,'')).join('');
 const station=host()?.stations?.()?.find(x=>x.id===r.station_id);
 const originalStamp=r.source==='migration'&&r.source_sent_at?showStamp(r.source_sent_at):null;
 const reportedTime=r.source==='migration'&&String(r.imported_from||'').startsWith('google_drive_xlsx:')?
  'وقت استيراد Excel: '+showStamp(r.created_at):
  r.source==='migration'?
  (originalStamp?'وقت رسالة واتساب: '+originalStamp:'وقت رسالة واتساب غير متوفر'):
  'وقت التسجيل بالموقع: '+showStamp(r.created_at);
 return '<div class="ws-v43-dialog-head"><div><small>معاينة سريعة — للقراءة فقط</small><h2>'+esc(station?.name||r.station_id)+'</h2>'+
  '<p>تاريخ التقرير: '+esc(r.report_date)+'</p></div>'+
  '<button class="ws-v43-dismiss" type="button" data-ws43-close aria-label="إغلاق المعاينة">×</button></div>'+
  '<div class="ws-v43-dialog-body">'+
  '<div class="ws-v43-proof"><strong>'+esc(sourceDescription(r))+'</strong><span>'+esc(reportedTime)+'</span></div>'+
  '<h3>المؤشرات المسجلة</h3>'+
  (rows?'<div class="ws-v43-dialog-table"><table><tbody>'+rows+'</tbody></table></div>':
   '<p class="ws-v43-muted">لا توجد قيم للمؤشرات الرئيسية في هذا السجل.</p>')+
  (notes?'<h3>الحالة والملاحظات</h3><div class="ws-v43-dialog-table"><table><tbody>'+notes+'</tbody></table></div>':'')+
  (keys.length>40?'<small class="ws-v43-muted">يظهر أول 40 مؤشرًا. استخدم عرض التقرير للاطلاع على جميع التفاصيل.</small>':'')+
  '</div><div class="ws-v43-dialog-actions"><button type="button" data-ws43-close>إغلاق المعاينة</button></div>';
}
async function previewArchive(id){
 if(!ready()||!/^[a-f0-9-]{32,36}$/i.test(String(id||'')))return;
 const markup='<div class="ws-v43-dialog-head"><h2>جارٍ قراءة التقرير…</h2>'+
  '<button class="ws-v43-dismiss" type="button" data-ws43-close aria-label="إغلاق">×</button></div>'+
  '<div class="ws-v43-dialog-body ws-v43-muted">يتم جلب بيانات التقرير المصرح بها فقط.</div>';
 const overlay=createDialog(markup);
 try{
  const params=new URLSearchParams({select:'id,station_id,report_date,data,config_snapshot,source,source_sent_at,imported_from,created_at',id:'eq.'+id,limit:'1'});
  const response=await host().authedFetch('/rest/v1/reports?'+params);
  if(!response.ok)throw Error('تعذرت قراءة التقرير أو ليست لديك صلاحية عرضه.');
  const list=await response.json();
  if(!Array.isArray(list)||!list[0])throw Error('السجل غير متوفر للحساب الحالي.');
  if(!ready()||overlay!==dialog)return;
  if(!(host()?.stations?.()||[]).some(st=>st.id===list[0].station_id))throw Error('لا توجد صلاحية للمحطة.');
  overlay.querySelector('.ws-v43-dialog').innerHTML=quickPreviewMarkup(list[0]);
  overlay.querySelector('[data-ws43-close]')?.focus({preventScroll:true});
 }catch(err){
  if(overlay!==dialog)return;
  overlay.querySelector('.ws-v43-dialog').innerHTML=
   '<div class="ws-v43-dialog-head"><h2>تعذر فتح المعاينة</h2><button type="button" class="ws-v43-dismiss" data-ws43-close>×</button></div>'+
   '<div class="ws-v43-dialog-body ws-v43-error">'+esc(err.message||'خطأ غير معروف')+'</div>';
 }
}
function reviewMarkup(ctx){
 const metrics=Array.isArray(ctx.metrics)?ctx.metrics:[];
 const filled=metrics.filter(m=>present(m.value)).length;
 const mandatory=metrics.filter(m=>m.required),mandatoryDone=mandatory.filter(m=>present(m.value)).length;
 const entries=metrics.slice(0,12).map(m=>reportRow(m.label,present(m.value)?m.value:'غير مسجل',m.unit)).join('');
 return '<div class="ws-v43-dialog-head"><div><small>مراجعة نهائية قبل الاعتماد</small><h2>'+esc(ctx.reportType||'مراجعة التقرير')+'</h2>'+
  '<p>'+esc(ctx.stationName||'المحطة')+' · '+esc(ctx.date||'')+'</p></div>'+
  '<button class="ws-v43-dismiss" data-ws43-close type="button" aria-label="إلغاء">×</button></div>'+
  '<div class="ws-v43-dialog-body">'+
   '<div class="ws-v43-review-highlights"><div><small>المؤشرات المسجلة</small><strong>'+filled+' من '+metrics.length+'</strong></div>'+
   '<div><small>المؤشرات الإلزامية</small><strong>'+(mandatory.length?mandatoryDone+' من '+mandatory.length:'غير محددة')+'</strong></div></div>'+
   '<p class="ws-v43-review-desc">راجع المحطة والتاريخ والقراءات قبل الإرسال. القيم الفارغة تبقى فارغة ولا تتحول إلى صفر.</p>'+
   (entries?'<div class="ws-v43-dialog-table"><table><tbody>'+entries+'</tbody></table></div>':'')+
   (metrics.length>12?'<small class="ws-v43-muted">تظهر أول 12 قراءة هنا؛ جميع القراءات في نموذج الإدخال الأصلي.</small>':'')+
   '<p class="ws-v43-approval-note">تأكيد الإرسال سيحفظ البيانات في قاعدة النظام وفق صلاحيات الحساب. هذا الإجراء لا يغيّر القيم تلقائيًا.</p>'+
  '</div><div class="ws-v43-dialog-actions">'+
  '<button type="button" data-ws43-close>العودة للتعديل</button>'+
  '<button type="button" class="ws-v43-primary" data-ws43-confirm>تأكيد وإرسال التقرير</button></div>';
}
async function reviewBeforeSubmit(ctx){
 if(!ready())return false;
 return new Promise(resolve=>{
  const overlay=createDialog(reviewMarkup(ctx),true);
  resolveReview=resolve;
  // A review dialog must always finish with an explicit user action, never auto-confirm.
  overlay.querySelector('[data-ws43-confirm]')?.focus({preventScroll:true});
 });
}
function openArchive(station,date){
 if(!ready()||!(host()?.stations?.()||[]).some(s=>s.id===station))return;
 if(!window.WSShellUI?.navigate?.('archive/daily'))return;
 const field=$('archiveStation');
 if(field&&!field.disabled&&[...field.options].some(o=>o.value===station))field.value=station;
 if(validDate(date)){
  if($('archiveFrom'))$('archiveFrom').value=date;
  if($('archiveTo'))$('archiveTo').value=date;
 }
 $('archiveSearch')?.click();
}
function handleClick(e){
 const preview=e.target.closest('[data-ws43-preview-id]');
 if(preview){
  e.preventDefault();e.stopImmediatePropagation();
  void previewArchive(preview.dataset.ws43PreviewId);
  return;
 }
 const missing=e.target.closest('[data-ws43-missing]');
 if(missing){
  e.preventDefault();openArchive(missing.dataset.ws43Missing,missing.dataset.ws43Date);
 }
}
function install(){
 const form=$('reportInputFields');
 form?.addEventListener('input',refreshReport);
 form?.addEventListener('change',refreshReport);
 $('reportDate')?.addEventListener('change',()=>setTimeout(refreshReport,150));
 $('stationSelect')?.addEventListener('change',()=>setTimeout(refreshReport,150));
 document.addEventListener('click',handleClick,true);
 const observer=new MutationObserver(changes=>{
  if(changes.some(c=>c.attributeName==='data-auth')){
   if(!ready())dismiss(false);else refreshReport();
  }
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['data-auth']});
 refreshReport();
}
window.WSV43=Object.freeze({refreshReport,dashboardSections,reviewBeforeSubmit,fieldCoverage,previewArchive});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
