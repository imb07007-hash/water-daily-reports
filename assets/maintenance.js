/* Maintenance module: one signed-in site, shared Supabase session, station-scoped Excel import. */
(function(){
'use strict';
const M={tab:'overview',stationId:'',page:0,assetPage:0,plannedPage:0,assetView:'template',areaFilter:'',assetId:'',assetName:'',type:'',status:'',frequencyFilter:'',period:'',search:'',preview:null,importing:false,loading:false};
const PAGE=40,BATCH=100;
let root=null,observer=null,bodyObserver=null,updatingDash=false,restoreFocus=null,restoreOverflow='';
const el=id=>document.getElementById(id);
const h=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(x||0));
const prettyDate=x=>x?String(x).slice(0,10):'—';
const host=()=>window.WSMaintenanceHost;
const accessible=()=>['ready','maintenance'].includes(document.body.dataset.auth)&&!!host()?.signedIn?.();
const isMaintenance=()=>host()?.role?.()==='maintenance';
const isStation=()=>['station','maintenance'].includes(host()?.role?.());
const getStations=()=>host()?.stations?.().filter(s=>s&&s.id)||[];
const owns=id=>accessible()&&getStations().some(s=>s.id===id)&&(!isStation()||id===host()?.stationId?.());
const getId=()=>isStation()?host()?.stationId?.():(owns(M.stationId)?M.stationId:getStations()[0]?.id||'');
const stationName=id=>getStations().find(s=>s.id===id)?.name||id;
const message=(txt,isError=false)=>'<div class="mw-notice'+(isError?' mw-error':'')+'">'+h(txt)+'</div>';
const badge=s=>'<span class="mw-tag '+(s==='DONE'?'done':s==='NOT DONE'?'not':s==='NEED CM'?'cm':s==='NOT IN SERVICE'?'offline':'unknown')+'">'+h(s==='UNVERIFIED'?'غير محدد':s||'غير محدد')+'</span>';
const url=(table,params)=>'/rest/v1/'+table+'?'+new URLSearchParams(params).toString();
async function request(path,options){
 const r=await host().authedFetch(path,options||{});
 if(!r.ok){const detail=await r.json().catch(()=>null);throw Error((detail&&typeof detail.message==='string'?detail.message:'تعذر الاتصال بقاعدة البيانات')+' ('+r.status+')')}
 const raw=await r.text();return raw?JSON.parse(raw):[];
}
async function getRows(table,params){return request(url(table,params))}
async function postRows(table,rows,ignore=false){
 if(!rows.length)return [];
 let path='/rest/v1/'+table;
 if(ignore)path+='?on_conflict='+(table==='maintenance_assets'?'station_id,normalized_key':'station_id,source_key');
 return request(path,{method:'POST',headers:{Prefer:'return=representation'+(ignore?',resolution=ignore-duplicates':'')},body:JSON.stringify(rows)});
}
async function summary(stationId){
 const params={select:'*'};
 if(stationId)params.station_id='eq.'+stationId;
 return getRows('maintenance_station_summary',params);
}
function build(){
 if(root)return;
 root=document.createElement('section');
 root.id='maintenanceModal';root.className='hidden';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','إدارة صيانة المحطات');
 root.innerHTML='<div class="mw-dialog"><div class="mw-header"><div class="mw-brand"><img alt="شعار شركة حلول المياه" src="'+h(host()?.logo?.()||'')+'"><div><h2>إدارة الصيانة</h2><small>شركة حلول المياه | متابعة المعدات وأعمال الصيانة</small></div></div><button class="mw-button mw-regular-close" data-mw="close" type="button">✕ إغلاق والعودة للتقارير</button><button class="mw-button mw-engineer-logout" data-mw="engineerLogout" type="button">⎋ تسجيل الخروج</button></div><nav class="mw-tabs" aria-label="أقسام الصيانة">'+
  [['overview','لوحة الصيانة'],['daily','＋ إدخال صيانة'],['assets','المعدات والأصول'],['records','سجلات الصيانة'],['planned','الجدول والدوريات'],['monthly','التقرير الشهري'],['import','استيراد Excel']].map(([key,title])=>'<button type="button" class="mw-tab" data-mw="tab" data-tab="'+key+'">'+title+'</button>').join('')+
  '</nav><div class="mw-body" id="maintenanceBody"></div></div>';
 document.body.appendChild(root);
 root.addEventListener('click',onClick);
 root.addEventListener('change',onChange);
 root.addEventListener('input',event=>{window.WSMaintenanceDaily?.input?.(event.target)});
 root.addEventListener('submit',onSubmit);
 root.addEventListener('click',e=>{if(e.target===root&&!M.importing)close()});
}
function toolbar(){
 const all=getStations();
 const options=(isStation()?all.filter(s=>s.id===host()?.stationId?.()):all);
 return '<div class="mw-top"><div><strong>'+h(stationName(getId()))+'</strong></div>'+
 (!isStation()?'<label>المحطة <select class="mw-select mw-station" id="mw-station">'+options.map(s=>'<option value="'+h(s.id)+'"'+(getId()===s.id?' selected':'')+'>'+h(s.name)+'</option>').join('')+'</select></label>':'')+'</div>';
}
function setTab(tab){if(M.importing)return;if(tab==='assets'){M.assetView='template';M.areaFilter='';M.search='';}if((tab==='daily'||tab==='monthly')&&!isStation()&&getStations().some(s=>s.id==='jizan'))M.stationId='jizan';M.tab=tab;M.page=0;M.assetPage=0;M.plannedPage=0;M.assetId='';M.assetName='';M.preview=null;update()}
function open(tab){
 if(!accessible()){return}
 build();
 if(root.classList.contains('hidden')){restoreFocus=document.activeElement;restoreOverflow=document.body.style.overflow;}
 const requested=tab||M.tab||'overview';
 if(requested==='assets'){M.assetView='template';M.areaFilter='';M.search='';}
 if(requested==='daily'&&!isStation()&&getStations().some(x=>x.id==='jizan'))M.stationId='jizan';
 else M.stationId=getId();
 M.tab=requested==='daily'&&isStation()&&getId()!=='jizan'?'overview':requested;
 root.classList.remove('hidden');
 document.body.style.overflow='hidden';
 root.querySelector('.mw-header h2').textContent=isMaintenance()?'صيانة '+stationName(getId()):'إدارة الصيانة';
 root.querySelector('.mw-header small').textContent=isMaintenance()?'مساحة عمل مهندس الصيانة — محطة واحدة فقط':'شركة حلول المياه | متابعة المعدات وأعمال الصيانة';
 root.querySelector(isMaintenance()?'[data-mw="engineerLogout"]':'[data-mw="close"]')?.focus();
 update();
}
function close(){
 if(M.importing||isMaintenance())return;
 root?.classList.add('hidden');document.body.style.overflow=restoreOverflow;M.preview=null;
 if(restoreFocus?.isConnected&&typeof restoreFocus.focus==='function')restoreFocus.focus();
}
function lock(){
 root?.classList.add('hidden');
 document.body.style.overflow='';
 M.preview=null;
 M.stationId='';M.loading=false;M.pendingUpdate=false;
}
function setTabs(){root?.querySelectorAll('.mw-tab').forEach(b=>{const active=b.dataset.tab===M.tab;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')})}
async function update(){
 if(!root||root.classList.contains('hidden'))return;
 if(M.loading){M.pendingUpdate=true;return}
 const id=getId();if(!owns(id)){el('maintenanceBody').innerHTML=message('لا تتوفر صلاحية لهذه المحطة.',true);return}
 M.loading=true;setTabs();
 const area=el('maintenanceBody');area.innerHTML=toolbar()+message('جارٍ تحميل البيانات...');
 try{
  if(M.tab==='overview')await renderOverview(id);
  else if(M.tab==='assets')await renderAssets(id);
  else if(M.tab==='records')await renderRecords(id);
  else if(M.tab==='planned')await renderPlanned(id);
  else if(M.tab==='daily')await window.WSMaintenanceDaily.renderDaily(area,id,toolbar());
  else if(M.tab==='monthly')await window.WSMaintenanceDaily.renderMonthly(area,id,toolbar());
  else renderImport(id);
 }catch(err){area.innerHTML=toolbar()+message(err.message||'تعذر تحميل البيانات.',true)}
 finally{M.loading=false;if(M.pendingUpdate){M.pendingUpdate=false;void update()}}
}
async function renderOverview(id){
 const [list,imports,months,history]=await Promise.all([
  summary(id),
  getRows('maintenance_imports',{select:'id,file_name,inserted_records,inserted_assets,inserted_definitions,created_at,created_by,status',station_id:'eq.'+id,order:'created_at.desc',limit:8}),
  getRows('maintenance_monthly_summary',{select:'period_month,work_count,done_count,not_done_count,needs_cm_count',station_id:'eq.'+id,order:'period_month.asc',limit:'100'}),
  getRows('maintenance_historical_imports',{select:'source_name,expected_assets,expected_records,expected_definitions,imported_at',station_id:'eq.'+id,limit:'5'})
 ]);
 const x=list[0]||{},n=k=>Number(x[k]||0),known=n('done_count')+n('not_done_count');
 const rate=known?Math.round(100*n('done_count')/known):null;
 const gauge=host()?.gauge?.(rate,'#0362AF','level')||'';
 const panel=(label,value,caption)=>'<article class="mw-instrument"><span class="mw-instrument-label">'+h(label)+'</span>'+
  '<strong class="mw-instrument-number">'+h(value)+'</strong>'+(caption?'<span class="mw-instrument-sub">'+h(caption)+'</span>':'')+'</article>';
 let html=toolbar()+'<div class="mw-actions" style="margin:0 0 12px"><button type="button" class="mw-button main" data-mw="goDaily">＋ إدخال صيانة جديدة</button><button type="button" class="mw-button" data-mw="goMonthly">⬇ التقرير الشهري</button></div><div class="mw-instrument-grid">'+
 '<article class="mw-instrument">'+gauge+'<span class="mw-instrument-label">نسبة DONE</span>'+
 '<strong class="mw-instrument-number">'+(rate===null?'—':rate+'%')+'</strong>'+
 '<span class="mw-instrument-sub">DONE / NOT DONE</span></article>'+
 panel('المعدات',fmt(n('asset_count')),'')+
 panel('سجلات الصيانة',fmt(n('work_count')),'PM + CM + SS')+
 panel('الأعمال المجدولة',fmt(n('planned_count')),'')+
 '</div>';
 const kpis=[
  ['PM',n('pm_count')],['CM',n('cm_count')],['SS',n('ss_count')],
  ['DONE',n('done_count')],['NOT DONE',n('not_done_count')],['NEED CM',n('needs_cm_count')],
  ['NOT IN SERVICE',n('out_of_service_count')],['غير محدد',n('unverified_count')]
 ];
 html+='<div class="mw-kpis">'+kpis.map(([label,value])=>'<div class="mw-kpi"><small>'+h(label)+'</small><strong>'+fmt(value)+'</strong></div>').join('')+'</div>';
 html+='<div class="mw-card" style="margin-top:14px"><div class="mw-top"><h3>أعمال الصيانة — آخر 12 شهرًا</h3></div>';
 const visible=months.slice(-12),maximum=Math.max(1,...visible.map(m=>Number(m.work_count||0)));
 html+='<div class="mw-month-chart">'+visible.map(m=>{
   const count=Number(m.work_count||0),done=Number(m.done_count||0);
   const height=Math.max(4,Math.round(count/maximum*115));
   const doneH=count?Math.round(done/count*100):0;
   const label=String(m.period_month||'').slice(0,7);
   return '<button type="button" class="mw-month-item" data-mw="month" data-period="'+h(label)+'" title="'+h(label+' — '+count+' سجل')+'">'+
    '<span class="mw-month-total">'+fmt(count)+'</span>'+
    '<span class="mw-month-bar" style="height:'+height+'px"><span class="mw-month-done" style="height:'+doneH+'%"></span>'+
    '<span class="mw-month-other" style="height:'+(100-doneH)+'%"></span></span><small dir="ltr">'+h(label.slice(2))+'</small></button>';
  }).join('')+'</div></div>';
 html+='<div class="mw-card"><h3>التكاليف وحالة السجلات</h3><div class="mw-status-grid">'+
 [['التكاليف المسجلة',fmt(x.registered_cost||0)+' ر.س',''],['سجلات تحتاج ربطًا بمعدة',fmt(n('unlinked_count')),'warning'],['حالة OTHERS',fmt(n('other_count')),'purple']].map(([label,val,cls])=>
  '<div class="mw-status-item '+cls+'"><span>'+h(label)+'</span><strong>'+h(val)+'</strong></div>').join('')+
 '</div></div>';
 if(history.length){
  html+='<div class="mw-card"><h3>الأرشيف التاريخي لمحطة وادي جيزان</h3>'+
  '<div class="mw-status-grid">'+history.map(a=>
   '<div class="mw-status-item"><span>'+h(a.source_name)+'</span><strong>'+fmt(a.expected_records)+' سجل</strong></div>').join('')+
  '</div></div>';
 }
 html+='<div class="mw-card"><div class="mw-top"><h3>سجل الاستيراد</h3><button class="mw-button main" data-mw="goImport">استيراد Excel</button></div>';
 html+=imports.length?'<div class="mw-table-wrap"><table><thead><tr><th>اسم الملف</th><th>سجلات جديدة</th><th>معدات جديدة</th><th>الحالة</th><th>التاريخ</th><th>الإجراءات</th></tr></thead><tbody>'+
 imports.map(i=>'<tr><td class="mw-note">'+h(i.file_name)+'</td><td>'+fmt(i.inserted_records)+'</td><td>'+fmt(i.inserted_assets)+'</td><td>'+h(i.status==='completed'?'مكتمل':i.status==='rolled_back'?'تم التراجع':i.status==='pending'?'غير مكتمل':'متوقف')+'</td><td>'+h(new Date(i.created_at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}))+'</td><td>'+
 (i.created_by===host()?.userId?.()&&['completed','pending','failed'].includes(i.status)&&Date.now()-new Date(i.created_at).getTime()<24*3600000?'<button type="button" class="mw-button" data-mw="rollback" data-import-id="'+h(i.id)+'">التراجع</button>':'—')+
 '</td></tr>').join('')+
 '</tbody></table></div>':'<div class="mw-empty">لا توجد عمليات استيراد.</div>';
 el('maintenanceBody').innerHTML=html+'</div>';
 host()?.animateGauges?.(el('maintenanceBody'));
}
function assetQuery(id){
 const params={select:'id,asset_code,asset_name,area,normalized_key,created_at',station_id:'eq.'+id,asset_code:'neq.UNVERIFIED_LINK',order:'asset_name.asc',limit:String(PAGE),offset:String(M.assetPage*PAGE)};
 const search=(M.search||'').trim().replace(/[(),.*]/g,' ').slice(0,70);
 if(search)params.or='(asset_name.ilike.*'+search+'*,area.ilike.*'+search+'*,asset_code.ilike.*'+search+'*)';
 return params;
}
async function renderTemplateAssets(id,layout){
 const source=window.WSMaintenanceCatalog;
 if(!source)throw Error('تعذر تحميل دليل معدات الجدول. يرجى تحديث الصفحة.');
 const areas=source.areas(layout),listed=source.list(layout,M.areaFilter,M.search);
 const rows=listed.map((unit,i)=>
  '<tr><td>'+h(unit.area||'غير محددة')+'</td>'+
  '<td class="mw-note"><strong>'+h(unit.unit)+'</strong></td>'+
  '<td><span class="mw-muted">يُحدّد عند إدخال الصيانة</span></td>'+
  '<td><button class="mw-button main" type="button" data-mw="templateUnit" data-template-row="'+h(unit.row)+'" data-template-area="'+h(unit.area||'')+'">＋ تسجيل صيانة</button></td></tr>'
 ).join('');
 const html=toolbar()+
 '<div class="mw-card"><div class="mw-top"><div><h3>دليل المعدات من جدول الصيانة الأصلي</h3>'+
 '</div>'+
 '<button type="button" class="mw-button" data-mw="viewRegistered">عرض دليل الأصول المسجلة</button></div>'+
 '<div class="mw-kpis" style="margin-bottom:12px">'+
 '<div class="mw-kpi"><small>مجموع معدات الجدول</small><strong>'+fmt(layout.length)+'</strong></div>'+
 '<div class="mw-kpi"><small>المعدات الظاهرة</small><strong>'+fmt(listed.length)+'</strong></div>'+
 '<div class="mw-kpi"><small>مناطق AREA</small><strong>'+fmt(areas.length)+'</strong></div></div>'+
 '<form id="mw-search-form" class="mw-actions mw-equipment-filters">'+
 '<input class="mw-input" id="mw-search-input" type="search" placeholder="بحث بالمنطقة أو اسم UNIT أو رقم الصف" value="'+h(M.search)+'" maxlength="90" style="flex:2;min-width:210px">'+
 '<select id="mw-template-area" class="mw-select" aria-label="تصفية قائمة المعدات حسب AREA">'+
 '<option value="">جميع مناطق AREA</option>'+
 areas.map(area=>'<option value="'+h(area)+'"'+(M.areaFilter===area?' selected':'')+'>'+h(area)+'</option>').join('')+
 '</select><button type="submit" class="mw-button main">بحث</button>'+
 '<button type="button" class="mw-button" data-mw="clearSearch">عرض الكل</button></form>'+
 '<div class="mw-table-wrap mw-original-catalog" style="margin-top:13px">'+
 '<table><thead><tr><th>AREA — المنطقة</th><th>UNIT — المعدة</th><th>FREQUENCY — التكرار</th><th>إدخال العمل</th></tr></thead><tbody>'+
 (listed.length?rows:'<tr><td colspan="4" class="mw-muted">لا توجد معدات مطابقة. امسح البحث أو اختر جميع المناطق.</td></tr>')+
 '</tbody></table></div>'+
 '</div>';
 el('maintenanceBody').innerHTML=html;
}
async function renderAssets(id){
 if(id==='jizan'&&M.assetView!=='registered'){
  const registered=await getRows('maintenance_templates',{
   select:'station_id,template_rows,template_name',station_id:'eq.'+id,limit:'1'
  });
  const template=registered[0];
  if(template&&Array.isArray(template.template_rows)&&template.template_rows.length){
   await renderTemplateAssets(id,template.template_rows);
   return;
  }
 }
 const items=await getRows('maintenance_assets',assetQuery(id));
 let html=toolbar()+'<div class="mw-card"><div class="mw-top"><h3>دليل الأصول المسجلة في قاعدة البيانات</h3><div class="mw-actions">'+(id==='jizan'?'<button class="mw-button" data-mw="viewTemplate">معدات جدول Excel الأصلي</button>':'')+'<button class="mw-button main" data-mw="goImport">رفع قائمة المعدات من Excel</button></div></div>'+
 '<form id="mw-search-form" class="mw-actions"><input class="mw-input" id="mw-search-input" placeholder="اسم المعدة أو المنطقة أو المعرّف الداخلي" value="'+h(M.search)+'" style="flex:1" maxlength="70">'+
 '<button class="mw-button" type="submit">بحث</button><button class="mw-button" type="button" data-mw="clearSearch">مسح</button></form>';
 html+=items.length?'<div class="mw-table-wrap" style="margin-top:13px"><table><thead><tr><th>معرّف المعدة</th><th>اسم المعدة</th><th>المنطقة / المبنى</th><th>السجل</th></tr></thead><tbody>'+
 items.map(a=>'<tr><td>'+h(a.asset_code||'—')+'</td><td class="mw-note">'+h(a.asset_name)+'</td><td class="mw-note">'+h(a.area||'—')+'</td><td><button type="button" class="mw-button" data-mw="asset" data-asset="'+h(a.id)+'" data-name="'+h(a.asset_name)+'">عرض الصيانة</button></td></tr>').join('')+'</tbody></table></div>':
 '<div class="mw-empty">لا توجد معدات مطابقة.</div>';
 html+='<div class="mw-pager"><button type="button" class="mw-button" data-mw="assetPrev" '+(M.assetPage?'':'disabled')+'>السابق</button><span class="mw-muted">الصفحة '+(M.assetPage+1)+'</span><button type="button" class="mw-button" data-mw="assetNext" '+(items.length===PAGE?'':'disabled')+'>التالي</button></div></div>';
 html+='<div class="mw-card"><h3>إضافة معدة واحدة</h3><form id="mw-add-asset"><div class="mw-form-grid">'+
 '<label class="mw-label">اسم المعدة<input class="mw-input" name="assetName" required minlength="2" maxlength="180" placeholder="مثال: INTAKE WATER PUMP 1"></label>'+
 '<label class="mw-label">المنطقة / المبنى<input class="mw-input" name="area" maxlength="180" placeholder="مثال: INTAKE"></label>'+
 '<label class="mw-label">معرّف المعدة الداخلي / Tag إن كان معتمدًا (اختياري)<input class="mw-input" name="assetCode" maxlength="100"></label>'+
 '</div><div class="mw-actions" style="margin-top:12px"><button class="mw-button main" type="submit">حفظ المعدة</button></div></form></div>';
 el('maintenanceBody').innerHTML=html;
}
function recordsParams(id){
 const p={select:'id,asset_id,work_type,frequency,work_date,period_month,status,description,notes,cost,source_file,source_sheet,source_row,original_date,original_status,original_equipment,original_area,import_issues,maintenance_assets(asset_name,area,asset_code)',
 station_id:'eq.'+id,order:'period_month.desc.nullslast,work_date.desc.nullslast,created_at.desc',limit:String(PAGE),offset:String(M.page*PAGE)};
 if(M.assetId)p.asset_id='eq.'+M.assetId;
 if(M.type)p.work_type='eq.'+M.type;
 if(M.status)p.status='eq.'+M.status;
 if(M.frequencyFilter)p.frequency='eq.'+M.frequencyFilter;
 if(M.period&&/^\d{4}-\d{2}$/.test(M.period))p.period_month='eq.'+M.period+'-01';
 return p;
}
async function renderRecords(id){
 const list=await getRows('maintenance_records',recordsParams(id));
 M.visibleRecords=list;
 const canCorrect=host()?.role?.()==='superadmin';
 let html=toolbar()+'<div class="mw-card"><div class="mw-top"><h3>السجل التاريخي لأعمال الصيانة '+(M.assetName?' — '+h(M.assetName):'')+'</h3>'+
 '<button class="mw-button" data-mw="clearFilters">عرض جميع السجلات</button></div>'+
 '<div class="mw-actions"><label>النوع <select class="mw-select" id="mw-type"><option value="">الكل</option>'+
 [['PM','PM'],['CM','CM'],['SS','SS']].map(([v,t])=>'<option value="'+v+'"'+(M.type===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
 '<label>الحالة <select class="mw-select" id="mw-status">'+
 [['','الكل'],['DONE','DONE'],['NOT DONE','NOT DONE'],['NEED CM','NEED CM'],['OTHERS','OTHERS'],['NOT IN SERVICE','NOT IN SERVICE'],['UNVERIFIED','غير محدد']].
 map(([v,t])=>'<option value="'+v+'"'+(M.status===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
 '<label>التكرار <select class="mw-select" id="mw-frequency">'+
 [['','الكل'],['M','شهري M'],['Q','ربع سنوي Q'],['H','نصف سنوي H'],['Y','سنوي Y']].map(([v,t])=>
 '<option value="'+v+'"'+(M.frequencyFilter===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
 '<label>الشهر <input type="month" class="mw-input" id="mw-period" value="'+h(M.period)+'"></label></div>';
 html+=list.length?'<div class="mw-table-wrap" style="margin-top:14px"><table><thead><tr><th>المعدة / العمل</th><th>المنطقة</th><th>النوع</th><th>الشهر</th><th>تاريخ التنفيذ / المصدر</th><th>التكرار</th><th>الحالة</th><th>الوصف والملاحظات</th><th>التكلفة (ر.س)</th><th>المصدر</th>'+ (canCorrect?'<th>المراجعة</th>':'') +'</tr></thead><tbody>'+
 list.map(r=>{
  const unlinked=Array.isArray(r.import_issues)&&r.import_issues.includes('غير مرتبط بمعدة مؤكدة');
  const name=r.original_equipment||r.maintenance_assets?.asset_name||'—',area=r.original_area||r.maintenance_assets?.area||'—';
  return '<tr><td class="mw-note"><span class="mw-original">'+h(name)+'</span>'+(unlinked?'<small class="mw-source-warning" style="display:block">الربط بمعدة غير مؤكد</small>':'')+
   '</td><td class="mw-note">'+h(area)+'</td><td>'+h(r.work_type)+'</td><td>'+h(r.period_month?String(r.period_month).slice(0,7):'—')+'</td>'+
   '<td dir="ltr"><strong>'+h(prettyDate(r.work_date))+'</strong>'+(r.original_date?'<small style="display:block;color:#73899a">المصدر: '+h(r.original_date)+'</small>':'')+'</td><td>'+h(r.frequency||'—')+'</td><td>'+badge(r.status)+'</td>'+
   '<td class="mw-note">'+h([r.description,r.notes].filter(Boolean).join(' — ')||'—')+'</td>'+
   '<td>'+h(r.cost==null?'—':fmt(r.cost))+'</td><td class="mw-note"><small>'+h(r.source_sheet||r.source_file||'إدخال مباشر')+
   (r.source_row?' — صف '+h(r.source_row):'')+'</small></td>'+
 (canCorrect?'<td class="mw-actions"><button type="button" class="mw-button" data-mw="correct" data-record="'+h(r.id)+'">تصحيح</button><button type="button" class="mw-button" data-mw="audit" data-record="'+h(r.id)+'">السجل</button></td>':'')+'</tr>';
 }).join('')+'</tbody></table></div>':
 '<div class="mw-empty">لا توجد أعمال صيانة مسجلة ضمن الفلاتر الحالية.</div>';
 html+='<div id="mw-record-editor"></div><div class="mw-pager"><button class="mw-button" data-mw="recordsPrev" '+(M.page?'':'disabled')+'>السابق</button><span class="mw-muted">الصفحة '+(M.page+1)+'</span><button class="mw-button" data-mw="recordsNext" '+(list.length===PAGE?'':'disabled')+'>التالي</button></div></div>';
 el('maintenanceBody').innerHTML=html;
}
async function renderPlanned(id){
 const p={select:'id,work_type,frequency,period_month,source_sheet,source_row,original_equipment,original_area,maintenance_assets(asset_name,area,asset_code)',
 station_id:'eq.'+id,order:'period_month.desc,source_row.asc',limit:String(PAGE),offset:String(M.plannedPage*PAGE)};
 if(M.period&&/^\d{4}-\d{2}$/.test(M.period))p.period_month='eq.'+M.period+'-01';
 const list=await getRows('maintenance_definitions',p);
 let html=toolbar()+'<div class="mw-card"><div class="mw-top"><h3>جدول الأعمال والدوريات المخططة</h3>'+
 '</div>'+
 '<div class="mw-actions"><label>الشهر <input type="month" class="mw-input" id="mw-plan-period" value="'+h(M.period)+'"></label>'+
 '<button class="mw-button" data-mw="clearPlan">كل الأشهر</button></div>';
 html+=list.length?'<div class="mw-table-wrap" style="margin-top:14px"><table><thead><tr><th>المعدة</th><th>المنطقة</th><th>نوع الصيانة</th><th>التكرار</th><th>شهر الجدول</th><th>الحالة</th><th>مصدر التعريف</th></tr></thead><tbody>'+
 list.map(r=>'<tr><td class="mw-note">'+h(r.original_equipment||r.maintenance_assets?.asset_name||'—')+'</td>'+
 '<td class="mw-note">'+h(r.original_area||r.maintenance_assets?.area||'—')+'</td><td>'+h(r.work_type||'PM')+'</td><td>'+h(r.frequency||'—')+'</td>'+
 '<td dir="ltr">'+h(String(r.period_month||'').slice(0,7))+'</td><td><span class="mw-tag">مجدول</span></td>'+
 '<td>'+h(r.source_sheet||'—')+' — '+h(r.source_row||'')+'</td></tr>').join('')+'</tbody></table></div>':
 '<div class="mw-empty">لا توجد أعمال مخططة ضمن الشهر المحدد.</div>';
 html+='<div class="mw-pager"><button class="mw-button" data-mw="plannedPrev" '+(M.plannedPage?'':'disabled')+'>السابق</button>'+
 '<span class="mw-muted">الصفحة '+(M.plannedPage+1)+'</span><button class="mw-button" data-mw="plannedNext" '+(list.length===PAGE?'':'disabled')+'>التالي</button></div></div>';
 el('maintenanceBody').innerHTML=html;
}
function showCorrection(id){
 if(host()?.role?.()!=='superadmin')return;
 const r=(M.visibleRecords||[]).find(x=>x.id===id),box=el('mw-record-editor');
 if(!r||!box)return;
 const states=['DONE','NOT DONE','NEED CM','OTHERS','NOT IN SERVICE','UNVERIFIED'];
 box.innerHTML='<div class="mw-card mw-correction"><h3>تصحيح سجل الصيانة</h3><p class="mw-muted">'+
  h(r.original_equipment||r.maintenance_assets?.asset_name||'')+' — '+h(r.source_sheet||'')+
  ' / صف '+h(r.source_row||'')+'</p>'+
  '<form id="mw-correct-form" data-record="'+h(r.id)+'"><div class="mw-form-grid">'+
  '<label class="mw-label">الحالة<select class="mw-select" name="status">'+
  states.map(v=>'<option value="'+v+'"'+(v===r.status?' selected':'')+'>'+h(v)+'</option>').join('')+'</select></label>'+
  '<label class="mw-label">تاريخ التنفيذ الصحيح<input type="date" class="mw-input" name="workDate" value="'+h(prettyDate(r.work_date)==='—'?'':prettyDate(r.work_date))+'"></label>'+
  '<label class="mw-label">التكلفة المدونة (ريال)<input type="number" step="0.01" min="0" class="mw-input" name="cost" value="'+h(r.cost??'')+'"></label>'+
  '<label class="mw-label" style="grid-column:1/-1">الملاحظات<textarea class="mw-input" name="notes" rows="3" maxlength="4000">'+h(r.notes||'')+'</textarea></label>'+
  '<label class="mw-label" style="grid-column:1/-1">سبب التصحيح (إلزامي)<textarea class="mw-input" name="reason" rows="2" minlength="5" maxlength="700" required placeholder="اذكر سبب التصحيح والمرجع الذي استندت إليه"></textarea></label>'+
  '</div><div class="mw-actions" style="margin-top:12px"><button class="mw-button main" type="submit">حفظ التصحيح وتوثيقه</button>'+
  '<button class="mw-button" type="button" data-mw="closeCorrection">إلغاء</button></div></form><div id="mw-correction-feedback"></div></div>';
 box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function showAudit(id){
 if(host()?.role?.()!=='superadmin')return;
 const target=el('mw-record-editor');if(!target)return;
 target.innerHTML=message('جارٍ تحميل سجل تصحيحات الصيانة...');
 try{
  const rows=await getRows('maintenance_record_change_log',{
   select:'changed_at,reason,old_value,new_value',record_id:'eq.'+id,order:'changed_at.desc',limit:30
  });
  target.innerHTML='<div class="mw-card"><div class="mw-top"><h3>سجل التصحيحات</h3>'+
   '<button class="mw-button" data-mw="closeCorrection">إغلاق</button></div>'+
   (rows.length?'<div class="mw-table-wrap"><table><thead><tr><th>التاريخ</th><th>السبب</th><th>قبل التعديل</th><th>بعد التعديل</th></tr></thead><tbody>'+
    rows.map(x=>'<tr><td>'+h(new Date(x.changed_at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}))+'</td>'+
    '<td class="mw-note">'+h(x.reason)+'</td><td class="mw-note">'+h(JSON.stringify(x.old_value))+'</td>'+
    '<td class="mw-note">'+h(JSON.stringify(x.new_value))+'</td></tr>').join('')+'</tbody></table></div>':
    '<div class="mw-empty">لا توجد تصحيحات مسجلة لهذا السجل.</div>')+'</div>';
 }catch(err){target.innerHTML=message(err.message,true)}
}
async function submitCorrection(form){
 if(host()?.role?.()!=='superadmin')throw Error('هذه العملية متاحة للسوبر أدمن فقط.');
 const id=form.dataset.record,r=(M.visibleRecords||[]).find(x=>x.id===id);
 if(!r)throw Error('السجل غير متاح للتصحيح.');
 const reason=String(form.elements.reason.value||'').trim();
 if(reason.length<5)throw Error('يرجى إدخال سبب واضح للتصحيح.');
 const costText=form.elements.cost.value.trim(),cost=costText===''?null:Number(costText);
 if(cost!==null&&(!Number.isFinite(cost)||cost<0))throw Error('التكلفة غير صالحة.');
 const button=form.querySelector('[type=submit]');button.disabled=true;
 try{
  await request('/rest/v1/rpc/maintenance_correct_record',{
   method:'POST',body:JSON.stringify({
    p_id:id,p_status:form.elements.status.value,
    p_work_date:form.elements.workDate.value||null,p_notes:form.elements.notes.value,
    p_cost:cost,p_reason:reason
   })
  });
  M.page=0;
  await update();
  alertInline('تم حفظ التصحيح في السجل وتوثيق القيمة القديمة والجديدة.');
  refreshDashboardMaintenance();
 }finally{button.disabled=false}
}
function renderImport(id){
 el('maintenanceBody').innerHTML=toolbar()+'<div class="mw-card"><h3>استيراد المعدات وسجلات الصيانة من Excel</h3>'+
  '<p class="mw-muted">Excel: AREA / UNIT / FREQUENCY / DATE / STATUS / NOTES / COST</p>'+
 '<div class="mw-actions"><input type="file" class="mw-input" accept=".xlsx,.xls" id="mw-file" aria-label="اختيار ملف Excel"><button type="button" class="mw-button main" data-mw="preview">فحص الملف ومعاينة البيانات</button></div>'+
 '<div id="mw-import-result">'+(M.preview?previewHtml(M.preview):'')+'</div></div>';
}
function clean(v){return String(v==null?'':v).normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[ـ]/g,'').replace(/\s+/g,' ').trim()}
function normalized(v){return clean(v).toUpperCase().replace(/[إأآ]/g,'ا').replace(/[ؤ]/g,'و').replace(/[ئى]/g,'ي').replace(/[^A-Z0-9\u0621-\u064A]+/g,' ').trim()}
function assetKey(name,area,code){
 const tag=normalized(code);return tag?'TAG:'+tag:'AREA:'+normalized(area)+'|'+normalized(name);
}
function monthFrom(str){
 let s=clean(str).toLowerCase(),m=s.match(/(?:^|\D)(20\d{2})[-_/ ](0?[1-9]|1[0-2])(?:\D|$)/);
 if(m)return m[1]+'-'+m[2].padStart(2,'0');
 m=s.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_/ ](20\d{2})(?:\D|$)/);
 if(m)return m[2]+'-'+m[1].padStart(2,'0');
 const arabic=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
 const english=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const y=s.match(/20\d{2}/);if(!y)return '';
 for(let i=0;i<12;i++)if(s.includes(arabic[i])||s.includes(english[i]))return y[0]+'-'+String(i+1).padStart(2,'0');
 return '';
}
function parseDate(v,period){
 let s=clean(v),m;
 if(!s)return {iso:'',uncertain:false};
 if((m=s.match(/^(20\d{2})-(\d\d?)-(\d\d?)(?:\D.*)?$/))){
  const dt=validDate(+m[1],+m[2],+m[3]);return {iso:dt?dt:'',uncertain:!dt};
 }
 if((m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2}|\d{2})$/))){
  let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;
  const mo=+(period||'').slice(5,7),amb=a<=12&&b<=12&&a!==b;
  let day=a,month=b,uncertain=false;
  if(a>12){day=a;month=b}
  else if(b>12){day=b;month=a}
  else if(mo&&a===mo&&b!==mo){month=a;day=b}
  else if(mo&&b===mo){month=b;day=a}
  else uncertain=amb;
  const dt=validDate(y,month,day);
  return {iso:dt?dt:'',uncertain:uncertain||!dt};
 }
 return {iso:'',uncertain:true};
}
function validDate(y,m,d){
 let x=new Date(Date.UTC(y,m-1,d));return y>=2020&&y<=2100&&x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):'';
}
function statusOf(raw,date,type){
 let s=normalized(raw);
 if(s==='NEED CM'||s==='NEED CORRECTIVE MAINTENANCE')return 'NEED CM';
 if(s==='NOT IN SERVICE'||s==='OUT OF SERVICE')return 'NOT IN SERVICE';
 if(s==='OTHERS')return 'OTHERS';
 if(s==='DONE'||s==='تم'||s==='مكتمل'||s==='COMPLETED'||s==='YES'||s==='تم التنفيذ')return 'DONE';
 if(s==='NOT DONE'||s==='NOTDONE'||s==='لم يتم'||s==='لم ينفذ'||s==='NO'||s==='PENDING')return 'NOT DONE';
 if(!s&&date&&type)return 'DONE';
 return 'UNVERIFIED';
}
function typeOf(x,source){
 const v=normalized(x),s=normalized(source);
 if(v==='PM'||v.includes('PREVENTIVE')||v.includes('وقائي'))return 'PM';
 if(v==='CM'||v.includes('CORRECTIVE')||v.includes('تصحيحي'))return 'CM';
 if(v==='SS'||v.includes('SERVICE')||v.includes('خدمي'))return 'SS';
 const explicit=s.includes('PM')&&!s.includes('CM')?'PM':s.includes('CM')&&!s.includes('PM')?'CM':s.includes('SS')?'SS':'';
 return explicit;
}
function headerIndex(head,words){
 return head.findIndex(c=>words.some(w=>normalized(c).includes(normalized(w))));
}
function guessHeader(rows){
 for(let i=0;i<Math.min(32,rows.length);i++){
  const head=(rows[i]||[]).map(clean);
  const name=headerIndex(head,['UNIT','EQUIPMENT','ASSET NAME','المعدة','الأصل']);
  const area=headerIndex(head,['AREA','LOCATION','المنطقة','المبنى']);
  if(name>=0&&(area>=0||headerIndex(head,['FREQUENCY','DATE','الحالة','STATUS'])>=0))return {row:i,head};
 }
 return null;
}
function hash(str){
 let a=2166136261,b=22695477;for(let i=0;i<str.length;i++){a=Math.imul(a^str.charCodeAt(i),16777619);b=Math.imul(b^str.charCodeAt(i),2246822519)}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function makeImporter(file){
 return {filename:file.name,assets:new Map(),records:[],definitions:[],skipped:0,issues:[],sample:[],seen:new Set(),seenPlans:new Set(),validRows:0};
}
function addPlanned(out,obj){
 const name=clean(obj.name),area=clean(obj.area),code=clean(obj.code);
 if(!name||name.length<2||!obj.type||!obj.period||!/^20\d{2}-\d{2}$/.test(obj.period))return;
 const key=assetKey(name,area,code);
 const sourceFile=clean(obj.sourceFile||out.filename),sourceSheet=clean(obj.sourceSheet||obj.sheet);
 const sourceRow=Number(obj.sourceRow)||obj.row;
 const sourceKey='XLS-PLAN-'+hash(sourceFile+'|'+sourceSheet+'|'+sourceRow+'|'+key+'|'+obj.type);
 if(out.seenPlans.has(sourceKey))return;
 out.seenPlans.add(sourceKey);
 out.definitions.push({assetKey:key,work_type:obj.type,frequency:clean(obj.frequency).slice(0,100),
 period_month:obj.period+'-01',source_sheet:sourceSheet.slice(0,100),source_row:sourceRow,
 source_key:sourceKey,original_equipment:name,original_area:area,
 notes:clean(obj.notes).slice(0,4000),import_issues:obj.auditNote?[clean(obj.auditNote)]:[]});
}
function addParsed(out,obj){
 const name=clean(obj.name),area=clean(obj.area),code=clean(obj.code);
 if(!name||name.length<2||/^total$|^اجمالي|^المجموع|^unit$|^equipment$/i.test(name)){out.skipped++;return}
 if(name.length>180||area.length>180||code.length>100){out.skipped++;return}
 const key=assetKey(name,area,code);
 if(!out.assets.has(key))out.assets.set(key,{asset_name:name,area,asset_code:code,normalized_key:key});
 out.validRows++;
 if(!obj.type)return;
 const workdate=parseDate(obj.verifiedDate||obj.rawDate,obj.period);
 if(workdate.uncertain&&(obj.verifiedDate||obj.rawDate))out.issues.push('تاريخ يحتاج تحققًا: '+obj.sheet+' / صف '+obj.row);
 const status=statusOf(obj.rawStatus,workdate.iso,obj.type);
 const numeric=value=>{const v=clean(value).replace(/[,،\s]/g,'');return v&&/^\d+(\.\d{1,2})?$/.test(v)?Number(v):null};
 const cost=numeric(obj.cost),workers=numeric(obj.workers),hours=numeric(obj.hours);
 if(clean(obj.cost)&&cost===null)out.issues.push('تكلفة غير مقروءة: '+obj.sheet+' / صف '+obj.row);
 const m=obj.period||((workdate.iso||'').slice(0,7));
 const hasWork=!!(obj.rawDate||obj.verifiedDate||obj.rawStatus||obj.description||obj.notes||cost!==null);
 if(!hasWork){addPlanned(out,obj);return}
 const sourceFile=clean(obj.sourceFile||out.filename),sourceSheet=clean(obj.sourceSheet||obj.sheet);
 const sourceRow=Number(obj.sourceRow)||obj.row;
 const sourceKey='XLS-'+hash(sourceFile+'|'+sourceSheet+'|'+sourceRow+'|'+key+'|'+obj.type);
 if(out.seen.has(sourceKey))return;
 out.seen.add(sourceKey);
 const row={assetKey:key,work_type:obj.type,frequency:clean(obj.frequency).slice(0,100),
 period_month:m?m+'-01':null,work_date:workdate.iso||null,status,
 description:clean(obj.description).slice(0,3000),notes:clean(obj.notes).slice(0,4000),cost,
 source_file:sourceFile.slice(0,240),source_sheet:sourceSheet.slice(0,100),
 source_row:sourceRow,source_ref:clean(obj.sourceRef).slice(0,100),source_key:sourceKey,
 original_status:clean(obj.originalStatus||obj.rawStatus).slice(0,200),
 original_date:clean(obj.rawDate).slice(0,100),
 original_equipment:name,original_area:area,workers,hours,
 materials:clean(obj.materials),spares:clean(obj.spares),
 import_issues:obj.auditNote?[clean(obj.auditNote)]:[],
 raw_data:{original_area:area,original_name:name,original_code:code,source_ref:clean(obj.sourceRef).slice(0,100)}};
 out.records.push(row);
 if(out.sample.length<9)out.sample.push({name,area,type:obj.type,date:obj.rawDate||'',status});
}
function parseUnified(rows,sheet,out){
 const p=monthFrom(out.filename);
 for(let i=5;i<rows.length;i++){
  const r=rows[i]||[],v=j=>clean(r[j]);
  if(!v(3)||/^(رقم السجل|المعدة)/.test(v(3)))continue;
  const month=v(4)&&v(5)?v(4)+'-'+String(v(5)).padStart(2,'0'):p;
  const type=typeOf(v(8),'');
  const obj={name:v(3),area:v(2),code:v(1),sheet,row:i+1,
   period:/^20\d{2}-\d{2}$/.test(month)?month:p,
   type,frequency:'',rawDate:v(11),verifiedDate:v(12),rawStatus:v(9),
   originalStatus:v(10)||v(9),description:v(13),notes:v(14),
   workers:v(15),hours:v(16),spares:v(17),cost:v(18),materials:v(19),
   sourceFile:v(20)||out.filename,sourceSheet:v(21)||sheet,sourceRow:v(22)||i+1,
   auditNote:v(23),sourceRef:v(0)};
  const uncertainty=normalized(v(9)+' '+v(10)+' '+v(23));
  const unverified=/غير مؤكد|غير موثق|غير مثبت|التنفيذ غير/.test(uncertainty);
  if(unverified){
    addParsed(out,{...obj,type:''});  // Register asset without falsely claiming performed maintenance.
    addPlanned(out,obj);
  }else addParsed(out,obj);
 }
}
function parseGeneric(rows,sheet,out){
 const found=guessHeader(rows);
 if(!found){out.issues.push('تعذر تحديد أعمدة المعدة والمنطقة في ورقة '+sheet);return}
 const {head,row:start}=found,ind={
  name:headerIndex(head,['UNIT','EQUIPMENT','ASSET NAME','اسم المعدة','المعدة']),
  area:headerIndex(head,['AREA','LOCATION','المنطقة','المبنى']),
  code:headerIndex(head,['TAG','ASSET ID','رقم المعدة','معرف الاصل','معرّف الأصل']),
  date:headerIndex(head,['DATE','التاريخ المدون','تاريخ الصيانة','تاريخ']),
  status:headerIndex(head,['STATUS','الحالة','DONE']),
  description:headerIndex(head,['DESCRIPTION','WORK DESCRIPTION','وصف العمل','الوصف']),
  notes:headerIndex(head,['NOTES','COMMENT','ملاحظات']),
  frequency:headerIndex(head,['FREQUENCY','التكرار']),
  cost:headerIndex(head,['COST','PRICE','TOTAL COST','التكلفة','السعر']),
  type:headerIndex(head,['TYPE','نوع الصيانة','النوع'])
 };
 let lastArea='',period=monthFrom(sheet)||monthFrom(out.filename),sectionType=typeOf('',sheet);
 for(let i=start+1;i<rows.length;i++){
  const r=rows[i]||[],section=normalized(r.slice(0,6).join(' '));
  if(section.includes('PREVENTIVE MAINTENANCE')||section.includes('الصيانة الوقائية'))sectionType='PM';
  else if(section.includes('CORRECTIVE MAINTENANCE')||section.includes('الصيانة التصحيحية'))sectionType='CM';
  else if(section.includes('SERVICE WORK')||section.includes('SERVICE SCHEDULE')||section.includes('الاعمال الخدمية'))sectionType='SS';
  const v=key=>ind[key]>=0?clean(r[ind[key]]):'';
  let name=v('name');if(!name)continue;
  const area=v('area')||lastArea;if(v('area'))lastArea=v('area');
  const typ=typeOf(v('type'),sectionType);
  const obj={name,area,code:v('code'),sheet,row:i+1,period,type:typ,frequency:v('frequency'),
   rawDate:v('date'),rawStatus:v('status'),description:v('description'),notes:v('notes'),cost:v('cost'),sourceRef:''};
  if(!area)out.issues.push('منطقة غير محددة: '+sheet+' / صف '+(i+1));
  if(!typ&&(obj.rawDate||obj.rawStatus||obj.description||obj.notes||obj.cost))out.issues.push('نوع الصيانة غير محدد؛ ستُضاف المعدة فقط: '+sheet+' / صف '+(i+1));
  addParsed(out,obj);
 }
}
function parseGuide(rows,sheet,out){
 const ix=rows.findIndex(r=>r.some(v=>normalized(v).includes('معرف الاصل'))&&r.some(v=>normalized(v).includes('اسم المعدة')));
 if(ix<0)return;
 for(let i=ix+1;i<rows.length;i++){
  const r=rows[i]||[];if(!clean(r[2]))continue;
  addParsed(out,{code:clean(r[0]),area:clean(r[1]),name:clean(r[2]),type:'',sheet,row:i+1,period:'',rawStatus:'',rawDate:''});
 }
}
async function loadExcel(){
 if(window.XLSX)return;
 const providers=['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];
 for(const src of providers){
  try{await new Promise((ok,fail)=>{
   const tag=document.createElement('script');tag.src=src;tag.async=true;tag.onload=()=>ok();tag.onerror=()=>fail(Error('تعذر تحميل قارئ Excel'));document.head.appendChild(tag);
  });if(window.XLSX)return}catch(e){}
 }
 throw Error('تعذر تحميل قارئ Excel، تحقق من الاتصال بالإنترنت.');
}
async function loadIndexedRows(table,id,fields){
 const all=[];
 for(let offset=0;offset<50000;offset+=1000){
  const batch=await getRows(table,{select:fields,station_id:'eq.'+id,limit:'1000',offset:String(offset)});
  all.push(...batch);
  if(batch.length<1000)break;
 }
 return all;
}
async function preflightImport(out){
 const id=getId();
 if(!owns(id))throw Error('لا توجد صلاحية للاستيراد لهذه المحطة.');
 const [assets,records,plans,shaMatches]=await Promise.all([
  loadAllAssets(id),
  loadIndexedRows('maintenance_records',id,
   'id,source_key,source_sheet,source_row,period_month,work_type,status,description,notes,cost,work_date,original_equipment,original_area'),
  loadIndexedRows('maintenance_definitions',id,
   'id,source_key,source_sheet,source_row,period_month,work_type,frequency,notes,original_equipment,original_area'),
  out.fileSha256?getRows('maintenance_imports',{
   select:'id,status,created_at',station_id:'eq.'+id,
   file_sha256:'eq.'+out.fileSha256,status:'eq.completed',limit:'1'
  }):Promise.resolve([])
 ]);
 const guard=window.WSMaintenanceImportGuard;
 if(!guard)throw Error('تعذر تحميل أداة مطابقة السجلات. حدّث الصفحة وحاول مجددًا.');
 const data=guard.classify(out.records,records,false),schedule=guard.classify(out.definitions,plans,true);
 const missingAssets=Array.from(out.assets.values()).filter(a=>!matchAsset(a,assets));
 const unresolved=[...data.newRows,...schedule.newRows].filter(row=>{
  const asset=out.assets.get(row.assetKey);return !asset||(!matchAsset(asset,assets)&&!missingAssets.some(x=>x.normalized_key===row.assetKey));
 });
 out.stationId=id;
 out.review={
  records:data.newRows,plans:schedule.newRows,assets:missingAssets,
  duplicateRecords:data.duplicates.length,duplicatePlans:schedule.duplicates.length,
  conflicts:[...data.conflicts.map(x=>({...x,kind:'سجل صيانة'})),...schedule.conflicts.map(x=>({...x,kind:'عمل مجدول'}))],
  unresolved:unresolved.length,
  fileExists:shaMatches.length>0
 };
 return out.review;
}
async function previewFile(){
 const file=el('mw-file')?.files?.[0];
 if(!file){el('mw-import-result').innerHTML=message('اختر ملف Excel أولًا.',true);return}
 if(!/\.(xlsx|xls)$/i.test(file.name)||file.size>15*1024*1024){
  el('mw-import-result').innerHTML=message('يجب اختيار ملف Excel بحجم لا يتجاوز 15 ميجابايت.',true);return;
 }
 const status=el('mw-import-result');status.innerHTML=message('جارٍ فحص الملف ومقارنة البيانات الحالية بالمستوردة...');
 M.preview=null;
 try{
  await loadExcel();
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const fingerprint=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const wb=XLSX.read(bytes,{type:'array',cellDates:false,raw:false});
  const out=makeImporter(file);
  out.fileSha256=fingerprint;
  const uni=wb.SheetNames.find(n=>clean(n)==='قاعدة البيانات');
  const names=uni?[uni]:wb.SheetNames;
  for(const sheet of names){
   const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:false,blankrows:false});
   if(uni)parseUnified(rows,sheet,out);
   else parseGeneric(rows,sheet,out);
  }
  if(uni&&wb.Sheets['دليل المعدات']){
   const guide=XLSX.utils.sheet_to_json(wb.Sheets['دليل المعدات'],{header:1,defval:'',raw:false,blankrows:false});
   parseGuide(guide,'دليل المعدات',out);
  }
  if(!out.assets.size)throw Error('لم يتم التعرف على معدات صحيحة. راجع أسماء الأعمدة أو اختر الجدول الأصلي.');
  await preflightImport(out);
  M.preview=out;status.innerHTML=previewHtml(out);
 }catch(err){status.innerHTML=message(err.message||'تعذر قراءة Excel ومقارنته.',true)}
}
function previewHtml(p){
 const r=p.review||{},issues=p.issues.length,assets=p.assets.size,works=p.records.length,plans=p.definitions.length;
 const conflicts=r.conflicts||[],blocked=!!(r.fileExists||conflicts.length||r.unresolved);
 const noNew=!(r.records?.length||r.plans?.length||r.assets?.length);
 return '<div class="mw-card"><h3>معاينة مقارنة قبل الاستيراد — '+h(p.filename)+'</h3>'+
 '<div class="mw-kpis">'+[
 ['معدات جديدة',r.assets?.length||0],['سجلات صيانة جديدة',r.records?.length||0],
 ['أعمال مجدولة جديدة',r.plans?.length||0],['سجلات موجودة ستُتجاوز',(r.duplicateRecords||0)+(r.duplicatePlans||0)]
 ].map(([t,v])=>'<div class="mw-kpi"><small>'+h(t)+'</small><strong>'+fmt(v)+'</strong></div>').join('')+'</div>'+
 '<div class="mw-status-grid" style="margin-top:12px">'+
 [['سجلات الملف',works+plans],['تعارضات تحتاج مراجعة',conflicts.length],['ملاحظات القراءة',issues]].map(([t,v])=>
 '<div class="mw-status-item"><span>'+h(t)+'</span><strong>'+fmt(v)+'</strong></div>').join('')+'</div>'+
 (issues?message('ملاحظات المصدر: '+p.issues.slice(0,5).join('؛ ')):'')+
 (r.fileExists?message('هذا الملف نفسه سبق استيراده واعتماده. لن يُسمح باستيراده مرة ثانية.',true):'')+
 (r.unresolved?message('توجد سجلات لم يمكن ربطها بمعدة. الاستيراد متوقف لحين مراجعتها.',true):'')+
 (conflicts.length?message('تم رصد '+conflicts.length+' تعارضًا مع بيانات محفوظة. لن تُستبدل أو تُكرر السجلات آليًا.',true):'')+
 (conflicts.length?'<div class="mw-table-wrap" style="margin:12px 0"><table><thead><tr><th>النوع</th><th>المعدة</th><th>الشهر</th><th>الحالة بالملف</th><th>الحالة الحالية</th><th>سبب التعارض</th></tr></thead><tbody>'+
 conflicts.slice(0,25).map(x=>'<tr><td>'+h(x.kind)+'</td><td class="mw-note">'+h(x.incoming.original_equipment||'—')+'</td>'+
 '<td>'+h(x.incoming.period_month?.slice(0,7)||'—')+'</td><td>'+h(x.incoming.status||'مجدول')+
 '</td><td>'+h(x.existing.status||'مجدول')+'</td><td class="mw-note">'+h(x.reason)+'</td></tr>').join('')+'</tbody></table></div>':'')+
  '<div class="mw-preview"><table><thead><tr><th>المعدة</th><th>المنطقة</th><th>النوع</th><th>التاريخ الأصلي</th><th>الحالة</th></tr></thead><tbody>'+
 (p.sample.length?p.sample.map(x=>'<tr><td>'+h(x.name)+'</td><td>'+h(x.area)+'</td><td>'+h(x.type)+'</td><td>'+h(x.date)+'</td><td>'+badge(x.status)+'</td></tr>').join(''):'<tr><td colspan="5">الملف يحتوي على قائمة معدات فقط</td></tr>')+
 '</tbody></table></div><div id="mw-import-status"></div><div class="mw-actions" style="margin-top:12px">'+
 '<button class="mw-button main" type="button" data-mw="commitImport" '+(blocked||noNew?'disabled':'')+
 '>اعتماد الإضافات الجديدة فقط</button>'+
 '<button class="mw-button" type="button" data-mw="discardPreview">إلغاء</button></div>'+
 (noNew&&!blocked?message('جميع البيانات موجودة بالفعل، ولا توجد إضافات جديدة.'):'')+'</div>';
}
async function loadAllAssets(id){
 const all=[];
 for(let offset=0;offset<100000;offset+=1000){
  const rows=await getRows('maintenance_assets',{select:'id,normalized_key,asset_name,area,asset_code,source_aliases',station_id:'eq.'+id,limit:'1000',offset:String(offset)});
  all.push(...rows);
  if(rows.length<1000)break;
 }
 const lookup=new Map();
 const addAlias=(key,value)=>{
  if(!lookup.has(key))lookup.set(key,value);
  else if(lookup.get(key)!==value)lookup.set(key,null); // Different assets with the same alias require review.
 };
 for(const a of all){
  lookup.set(a.normalized_key,a.id);
  addAlias('NAME:'+normalized(a.area)+'|'+normalized(a.asset_name),a.id);
  const names=Array.isArray(a.source_aliases)?a.source_aliases:[];
  for(const alias of names)addAlias('NAME:'+normalized(a.area)+'|'+normalized(alias),a.id);
 }
 return lookup;
}
function matchAsset(asset,lookup){
 if(!asset)return null;
 return lookup.get(asset.normalized_key)||lookup.get('NAME:'+normalized(asset.area)+'|'+normalized(asset.asset_name))||null;
}
function assign(data,id){
 return {...data,station_id:id,created_by:host().userId()};
}
async function patchImport(id,fields){
 const rows=await request('/rest/v1/maintenance_imports?id=eq.'+encodeURIComponent(id),{
  method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(fields)
 });
 if(!Array.isArray(rows)||rows.length!==1)throw Error('لم يتم تحديث نتيجة الاستيراد.');
 return rows[0];
}
async function rollbackImport(id){
 const data=await request('/rest/v1/rpc/maintenance_rollback_import',{
  method:'POST',body:JSON.stringify({p_import_id:id})
 });
 return data;
}
async function importCommit(){
 const p=M.preview,id=getId();
 if(M.importing||!p||p.stationId!==id||!owns(id))return;
 M.importing=true;let savedAssets=0,savedRecords=0,savedPlanned=0,importId=null,rollbackText='';
 const box=el('mw-import-status'),buttons=root.querySelectorAll('[data-mw="commitImport"],[data-mw="discardPreview"]');
 buttons.forEach(b=>b.disabled=true);
 const progress=(text,value)=>{
  if(box)box.innerHTML='<div class="mw-progress"><div style="width:'+Math.max(0,Math.min(100,value))+'%"></div></div><div class="mw-muted">'+h(text)+'</div>';
 };
 try{
  progress('إعادة مقارنة الملف بالمعلومات المحفوظة قبل الحفظ...',3);
  const review=await preflightImport(p);
  if(review.fileExists||review.conflicts.length||review.unresolved)throw Error('تم اكتشاف تكرار ملف أو تعارض في البيانات. أعد فحص الملف وراجع التعارضات.');
  if(!review.assets.length&&!review.records.length&&!review.plans.length)throw Error('جميع بيانات الملف موجودة؛ لا توجد إضافات جديدة.');
  const log=await postRows('maintenance_imports',[assign({
    file_name:p.filename.slice(0,240),file_sha256:p.fileSha256,status:'pending',
    reviewed_rows:p.validRows,conflicts:0,inserted_assets:0,inserted_records:0,
    inserted_definitions:0,ignored_records:review.duplicateRecords
  },id)]);
  if(!log.length||!log[0].id)throw Error('تعذر إنشاء سجل الاستيراد.');
  importId=log[0].id;
  const existing=await loadAllAssets(id);
  const missing=review.assets.filter(a=>!matchAsset(a,existing));
  for(let i=0;i<missing.length;i+=BATCH){
   const inserted=await postRows('maintenance_assets',
    missing.slice(i,i+BATCH).map(a=>assign({...a,import_id:importId},id)),true);
   savedAssets+=inserted.length;
   progress('حفظ المعدات...',Math.min(35,Math.round((i+BATCH)/Math.max(1,missing.length)*35)));
  }
  const assetMap=await loadAllAssets(id);
  const attach=(entry)=>{
   const matched=matchAsset(p.assets.get(entry.assetKey),assetMap);
   if(!matched)throw Error('إحدى المعدات غير موجودة بعد الاستيراد؛ تم إيقاف العملية.');
   const {assetKey,...row}=entry;
   return assign({...row,asset_id:matched,import_id:importId},id);
  };
  const records=review.records.map(attach),plans=review.plans.map(attach);
  for(let i=0;i<records.length;i+=BATCH){
   const inserted=await postRows('maintenance_records',records.slice(i,i+BATCH),true);
   savedRecords+=inserted.length;
   progress('حفظ أعمال الصيانة '+Math.min(i+BATCH,records.length)+' / '+records.length,
    35+Math.round(Math.min(i+BATCH,records.length)/Math.max(1,records.length)*40));
  }
  for(let i=0;i<plans.length;i+=BATCH){
   const inserted=await postRows('maintenance_definitions',plans.slice(i,i+BATCH),true);
   savedPlanned+=inserted.length;
   progress('حفظ الأعمال المخططة '+Math.min(i+BATCH,plans.length)+' / '+plans.length,
    75+Math.round(Math.min(i+BATCH,plans.length)/Math.max(1,plans.length)*20));
  }
  await patchImport(importId,{
   status:'completed',finished_at:new Date().toISOString(),
   inserted_assets:savedAssets,inserted_records:savedRecords,inserted_definitions:savedPlanned,
   ignored_records:review.duplicateRecords,reviewed_rows:p.validRows
  });
  M.preview=null;
  progress('اكتمل الحفظ: '+fmt(savedAssets)+' معدة، '+fmt(savedRecords)+' سجل، '+fmt(savedPlanned)+' عمل مجدول. تَم تجاوز '+fmt(review.duplicateRecords+review.duplicatePlans)+' مكررًا.',100);
  if(box){
   box.insertAdjacentHTML('beforeend','<div class="mw-actions" style="margin-top:12px">'+
   '<button class="mw-button main" data-mw="goRecords">عرض السجلات</button>'+
   '<button class="mw-button" data-mw="rollback" data-import-id="'+h(importId)+'">التراجع عن هذا الاستيراد</button></div>');
  }
  root.querySelector('[data-mw="commitImport"]')?.remove();
  refreshDashboardMaintenance();
 }catch(err){
  if(importId){
   try{
    const reversed=await rollbackImport(importId);
    rollbackText=' أُلغي ما أُضيف من هذه العملية ('+
     fmt(reversed.records)+' سجل، '+fmt(reversed.planned)+' عمل مجدول، '+fmt(reversed.assets)+' معدة).';
   }catch(backErr){
    rollbackText=' تعذرت عملية التراجع التلقائية: '+backErr.message+
     '. يمكن المحاولة من سجل الاستيراد دون تعديل السجلات التاريخية.';
   }
  }
  progress('توقف الحفظ: '+err.message+rollbackText,0);
 }finally{
  M.importing=false;buttons.forEach(b=>b.disabled=false);
 }
}
function refreshDashboardMaintenance(){
 const existing=el('dashboardContent')?.querySelector('.mw-dash-summary');
 if(existing)existing.remove();
 dashboardMaintenance();
}
function alertInline(text,err=false){
 const body=el('maintenanceBody');if(body)body.insertAdjacentHTML('afterbegin',message(text,err));
}
async function rollbackClick(id){
 if(!id||M.importing)return;
 if(!confirm('التراجع عن الاستيراد؟ ستُحذف الإضافات التي أُنشئت خلاله فقط.'))return;
 M.importing=true;
 try{
  const result=await rollbackImport(id);
  M.importing=false;
  await update();
  alertInline('تم التراجع عن الاستيراد: '+fmt(result.records)+' سجل، '+fmt(result.planned)+' عمل مجدول، '+fmt(result.assets)+' معدة.');
  refreshDashboardMaintenance();
 }catch(err){
  M.importing=false;
  alertInline('لم يكتمل التراجع: '+err.message,true);
 }
}
async function onSubmit(e){
 if(e.target.id==='mw-daily-form'){
  e.preventDefault();void window.WSMaintenanceDaily.submit(e.target,e.submitter);return;
 }
 if(e.target.id==='mw-correct-form'){
  e.preventDefault();try{await submitCorrection(e.target)}catch(err){const box=el('mw-correction-feedback');if(box)box.innerHTML=message(err.message,true);return}
  return;
 }
 if(e.target.id==='mw-add-asset'){e.preventDefault();try{await addAsset(e.target)}catch(err){alertInline(err.message,true)}}
 else if(e.target.id==='mw-search-form'){e.preventDefault();M.search=el('mw-search-input').value;M.assetPage=0;update()}
}
function onChange(e){
 if(window.WSMaintenanceDaily?.change?.(e.target))return;
 if(e.target.id==='mw-station'){if(isStation())return;M.stationId=e.target.value;M.page=0;M.assetPage=0;M.assetId='';M.preview=null;update()}
 if(e.target.id==='mw-type'){M.type=e.target.value;M.page=0;update()}
 if(e.target.id==='mw-status'){M.status=e.target.value;M.page=0;update()}
 if(e.target.id==='mw-frequency'){M.frequencyFilter=e.target.value;M.page=0;update()}
 if(e.target.id==='mw-period'){M.period=e.target.value;M.page=0;update()}
 if(e.target.id==='mw-plan-period'){M.period=e.target.value;M.plannedPage=0;update()}
 if(e.target.id==='mw-template-area'){M.areaFilter=e.target.value;M.assetPage=0;update()}
}
function onClick(e){
 const b=e.target.closest('[data-mw]');if(!b)return;
 const action=b.dataset.mw;
 if(action==='close'){close();return}
 if(M.importing)return;
 if(action==='engineerLogout'){if(isMaintenance())void host()?.logout?.();return}
 if(window.WSMaintenanceDaily?.action?.(b))return;
 if(action==='tab'){setTab(b.dataset.tab);return}
 if(action==='goImport'){setTab('import');return}
 if(action==='goRecords'){setTab('records');return}
 if(action==='goDaily'){setTab('daily');return}
 if(action==='goMonthly'){setTab('monthly');return}
 if(action==='asset'){M.assetId=b.dataset.asset;M.assetName=b.dataset.name;M.tab='records';M.page=0;update();return}
 if(action==='clearFilters'){M.assetId='';M.assetName='';M.type='';M.status='';M.frequencyFilter='';M.period='';M.page=0;update();return}
 if(action==='clearSearch'){M.search='';M.areaFilter='';M.assetPage=0;update();return}
 if(action==='viewRegistered'){M.assetView='registered';M.areaFilter='';M.assetPage=0;M.search='';update();return}
 if(action==='viewTemplate'){M.assetView='template';M.areaFilter='';M.assetPage=0;M.search='';update();return}
 if(action==='templateUnit'){
  const row=Number(b.dataset.templateRow),area=b.dataset.templateArea||'';
  if(window.WSMaintenanceDaily?.selectTemplateRow?.(row,area)){setTab('daily')}return;
 }
 if(action==='assetPrev'){M.assetPage=Math.max(0,M.assetPage-1);update();return}
 if(action==='assetNext'){M.assetPage++;update();return}
 if(action==='recordsPrev'){M.page=Math.max(0,M.page-1);update();return}
 if(action==='recordsNext'){M.page++;update();return}
 if(action==='month'){M.period=b.dataset.period;M.page=0;M.assetId='';M.assetName='';M.tab='records';update();return}
 if(action==='clearPlan'){M.period='';M.plannedPage=0;update();return}
 if(action==='plannedPrev'){M.plannedPage=Math.max(0,M.plannedPage-1);update();return}
 if(action==='plannedNext'){M.plannedPage++;update();return}
 if(action==='preview'){previewFile();return}
 if(action==='discardPreview'){M.preview=null;renderImport(getId());return}
 if(action==='commitImport'){importCommit();return}
 if(action==='correct'){showCorrection(b.dataset.record);return}
 if(action==='audit'){showAudit(b.dataset.record);return}
 if(action==='closeCorrection'){const box=el('mw-record-editor');if(box)box.innerHTML='';return}
 if(action==='rollback'){void rollbackClick(b.dataset.importId);return}
}
async function dashboardMaintenance(){
 if(isMaintenance())return;
 const container=el('dashboardContent');
 const summaryNode=container?.querySelector('.dashboard-summary');
 if(!accessible()||!container||!summaryNode||updatingDash)return;
 if(container.querySelector('.mw-dash-summary'))return;
 const node=document.createElement('section');
 node.className='mw-dash-summary';
 node.innerHTML='<h3>🔧 متابعة الصيانة</h3><div class="mw-muted">جارٍ تحميل سجلات الصيانة...</div>';
 summaryNode.insertAdjacentElement('afterend',node);
 updatingDash=true;
 try{
  const list=await summary('');
  if(!node.isConnected)return;
  const sums=k=>list.reduce((a,x)=>a+Number(x[k]||0),0);
  const assets=sums('asset_count'),works=sums('work_count'),done=sums('done_count'),undone=sums('not_done_count');
  const hasData=list.filter(x=>Number(x.work_count||0)>0);
  const stationsWithData=hasData.map(x=>stationName(x.station_id)).join('، ');
  node.innerHTML='<div class="mw-top" style="border:0;padding:0;margin:0 0 10px"><div><h3>🔧 متابعة الصيانة</h3>'+
   '<p class="mw-muted" style="margin:3px 0">المحطات التي لديها بيانات صيانة: '+h(stationsWithData||'لا توجد سجلات مستوردة')+'</p></div>'+
   '<button type="button" id="mw-dashboard-open">فتح إدارة الصيانة</button></div>'+
   '<div class="mw-dash-row"><div class="mw-dash-values">'+
   [['المعدات المؤكدة',assets],['سجلات الصيانة',works],['DONE',done],['NOT DONE',undone]].
   map(([label,num])=>'<span>'+h(label)+'<strong>'+fmt(num)+'</strong></span>').join('')+'</div></div>';
  el('mw-dashboard-open')?.addEventListener('click',()=>open('overview'));
 }catch(err){
  if(node.isConnected)node.innerHTML='<h3>🔧 متابعة الصيانة</h3>'+message('تعذر تحميل ملخص الصيانة.',true);
 }finally{updatingDash=false}
}
function init(){
 build();
 const dc=el('dashboardContent');
 if(dc){observer=new MutationObserver(()=>{if(!dc.querySelector('.mw-dash-summary'))dashboardMaintenance()});observer.observe(dc,{childList:true});dashboardMaintenance()}
 bodyObserver=new MutationObserver(()=>{if(!accessible())close()});
 bodyObserver.observe(document.body,{attributes:true,attributeFilter:['data-auth']});
 document.addEventListener('keydown',e=>{
 if(!root||root.classList.contains('hidden'))return;
 if(e.key==='Escape'){
  e.preventDefault();e.stopImmediatePropagation();close();return;
 }
 if(e.key==='Tab'){
  const choices=[...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(x=>x.getClientRects().length>0);
  if(!choices.length)return;
  const first=choices[0],last=choices[choices.length-1];
  if(e.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){e.preventDefault();first.focus()}
 }
},true);
}
window.WSMaintenance={open,close,lock,refreshDashboard:dashboardMaintenance,refreshActive:update};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
