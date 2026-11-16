/* Maintenance module: one signed-in site, shared Supabase session, station-scoped Excel import. */
(function(){
'use strict';
const M={tab:'overview',stationId:'',page:0,assetPage:0,assetId:'',assetName:'',type:'',status:'',period:'',search:'',preview:null,importing:false,loading:false};
const PAGE=40,BATCH=100;
let root=null,observer=null,bodyObserver=null,updatingDash=false;
const el=id=>document.getElementById(id);
const h=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(x||0));
const prettyDate=x=>x?String(x).slice(0,10):'—';
const host=()=>window.WSMaintenanceHost;
const accessible=()=>document.body.dataset.auth==='ready'&&!!host()?.signedIn?.();
const isStation=()=>host()?.role?.()==='station';
const getStations=()=>host()?.stations?.().filter(s=>s&&s.id)||[];
const owns=id=>accessible()&&getStations().some(s=>s.id===id)&&(!isStation()||id===host()?.stationId?.());
const getId=()=>isStation()?host()?.stationId?.():(owns(M.stationId)?M.stationId:getStations()[0]?.id||'');
const stationName=id=>getStations().find(s=>s.id===id)?.name||id;
const message=(txt,isError=false)=>'<div class="mw-notice'+(isError?' mw-error':'')+'">'+h(txt)+'</div>';
const badge=s=>'<span class="mw-tag '+(s==='DONE'?'done':s==='NOT DONE'?'not':'unknown')+'">'+h(s==='UNVERIFIED'?'غير محدد':s||'غير محدد')+'</span>';
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
 root.innerHTML='<div class="mw-dialog"><div class="mw-header"><div><h2>إدارة الصيانة</h2><small>شركة حلول المياه | سجلات المعدات والصيانة داخل الموقع الرئيسي</small></div><button class="mw-button" data-mw="close" type="button">✕ إغلاق والعودة للتقارير</button></div><nav class="mw-tabs" aria-label="أقسام الصيانة">'+
  [['overview','لوحة الصيانة'],['assets','المعدات والأصول'],['records','سجلات الصيانة'],['import','استيراد Excel']].map(([key,title])=>'<button type="button" class="mw-tab" data-mw="tab" data-tab="'+key+'">'+title+'</button>').join('')+
  '</nav><div class="mw-body" id="maintenanceBody"></div><div class="mw-foot">يُعرض لكل حساب نطاق المحطات المسموح له فقط • التواريخ غير المؤكدة تبقى مميزة عن التنفيذ الفعلي</div></div>';
 document.body.appendChild(root);
 root.addEventListener('click',onClick);
 root.addEventListener('change',onChange);
 root.addEventListener('submit',onSubmit);
 root.addEventListener('click',e=>{if(e.target===root&&!M.importing)close()});
}
function toolbar(){
 const all=getStations();
 const options=(isStation()?all.filter(s=>s.id===host()?.stationId?.()):all);
 return '<div class="mw-top"><div><strong>'+h(stationName(getId()))+'</strong><br><span class="mw-muted">سجل الصيانة والمعدات الخاصة بالمحطة</span></div>'+
 (!isStation()?'<label>المحطة <select class="mw-select mw-station" id="mw-station">'+options.map(s=>'<option value="'+h(s.id)+'"'+(getId()===s.id?' selected':'')+'>'+h(s.name)+'</option>').join('')+'</select></label>':'')+'</div>';
}
function setTab(tab){M.tab=tab;M.page=0;M.assetPage=0;M.assetId='';M.assetName='';M.preview=null;update()}
function open(tab){
 if(!accessible()){return}
 build();M.stationId=getId();M.tab=tab||M.tab||'overview';root.classList.remove('hidden');document.body.style.overflow='hidden';update();
}
function close(){
 if(M.importing)return;
 root?.classList.add('hidden');document.body.style.overflow='';M.preview=null;
}
function setTabs(){root?.querySelectorAll('.mw-tab').forEach(b=>{const active=b.dataset.tab===M.tab;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')})}
async function update(){
 if(!root||root.classList.contains('hidden')||M.loading)return;
 const id=getId();if(!owns(id)){el('maintenanceBody').innerHTML=message('لا تتوفر صلاحية لهذه المحطة.',true);return}
 M.loading=true;setTabs();
 const area=el('maintenanceBody');area.innerHTML=toolbar()+message('جارٍ تحميل البيانات...');
 try{
  if(M.tab==='overview')await renderOverview(id);
  else if(M.tab==='assets')await renderAssets(id);
  else if(M.tab==='records')await renderRecords(id);
  else renderImport(id);
 }catch(err){area.innerHTML=toolbar()+message(err.message||'تعذر تحميل البيانات.',true)}
 finally{M.loading=false}
}
async function renderOverview(id){
 const [list,imports]=await Promise.all([
  summary(id),
  getRows('maintenance_imports',{select:'file_name,inserted_records,inserted_assets,created_at',station_id:'eq.'+id,order:'created_at.desc',limit:5})
 ]);
 const x=list[0]||{};const kpis=[
  ['إجمالي المعدات',x.asset_count],['سجلات الصيانة',x.work_count],['PM',x.pm_count],['CM',x.cm_count],
  ['SS',x.ss_count],['DONE',x.done_count],['NOT DONE',x.not_done_count],['غير محدد',x.unverified_count]
 ];
 const full=Number(x.work_count||0),pct=(n)=>full?Math.max(2,Math.round(Number(n||0)/full*100)):2;
 let html=toolbar()+'<div class="mw-kpis">'+kpis.map(([label,v])=>'<div class="mw-kpi"><small>'+h(label)+'</small><strong>'+fmt(v)+'</strong></div>').join('')+'</div>'+
 '<div class="mw-card" style="margin-top:14px"><h3>توزيع أعمال الصيانة حسب النوع</h3><div class="mw-chart">'+
 [['PM',x.pm_count],['CM',x.cm_count],['SS',x.ss_count]].map(([label,v])=>'<div class="mw-chart-col"><span class="mw-muted">'+fmt(v)+'</span><div class="bar" style="height:'+pct(v)+'%"></div><small>'+label+'</small></div>').join('')+
 '</div><p class="mw-muted">التكاليف المسجلة: '+fmt(x.registered_cost)+' ريال. هذه مبالغ مدونة وليست بالضرورة مصروفات فعلية.</p></div>'+
 '<div class="mw-card"><div class="mw-top"><h3>آخر عمليات الاستيراد</h3><button class="mw-button main" data-mw="goImport">استيراد Excel</button></div>';
 html+=imports.length?'<div class="mw-table-wrap"><table><thead><tr><th>اسم الملف</th><th>السجلات المضافة</th><th>المعدات المضافة</th><th>وقت الاستيراد</th></tr></thead><tbody>'+
 imports.map(i=>'<tr><td class="mw-note">'+h(i.file_name)+'</td><td>'+fmt(i.inserted_records)+'</td><td>'+fmt(i.inserted_assets)+'</td><td>'+h(new Date(i.created_at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}))+'</td></tr>').join('')+
 '</tbody></table></div>':'<div class="mw-empty">لا توجد عمليات استيراد محفوظة حتى الآن.</div>';
 el('maintenanceBody').innerHTML=html+'</div>';
}
function assetQuery(id){
 const params={select:'id,asset_code,asset_name,area,normalized_key,created_at',station_id:'eq.'+id,order:'asset_name.asc',limit:String(PAGE),offset:String(M.assetPage*PAGE)};
 const search=(M.search||'').trim().replace(/[(),.*]/g,' ').slice(0,70);
 if(search)params.or='(asset_name.ilike.*'+search+'*,area.ilike.*'+search+'*,asset_code.ilike.*'+search+'*)';
 return params;
}
async function renderAssets(id){
 const items=await getRows('maintenance_assets',assetQuery(id));
 let html=toolbar()+'<div class="mw-card"><div class="mw-top"><h3>دليل المعدات والأصول</h3><button class="mw-button main" data-mw="goImport">رفع قائمة المعدات من Excel</button></div>'+
 '<form id="mw-search-form" class="mw-actions"><input class="mw-input" id="mw-search-input" placeholder="اسم المعدة أو المبنى أو رقم المعدة" value="'+h(M.search)+'" style="flex:1" maxlength="70">'+
 '<button class="mw-button" type="submit">بحث</button><button class="mw-button" type="button" data-mw="clearSearch">مسح</button></form>';
 html+=items.length?'<div class="mw-table-wrap" style="margin-top:13px"><table><thead><tr><th>رقم المعدة</th><th>اسم المعدة</th><th>المنطقة / المبنى</th><th>السجل</th></tr></thead><tbody>'+
 items.map(a=>'<tr><td>'+h(a.asset_code||'—')+'</td><td class="mw-note">'+h(a.asset_name)+'</td><td class="mw-note">'+h(a.area||'—')+'</td><td><button type="button" class="mw-button" data-mw="asset" data-asset="'+h(a.id)+'" data-name="'+h(a.asset_name)+'">عرض الصيانة</button></td></tr>').join('')+'</tbody></table></div>':
 '<div class="mw-empty">لا توجد معدات مطابقة. يمكنك إضافة معدات جديدة أو استيراد قائمتها من Excel.</div>';
 html+='<div class="mw-pager"><button type="button" class="mw-button" data-mw="assetPrev" '+(M.assetPage?'':'disabled')+'>السابق</button><span class="mw-muted">الصفحة '+(M.assetPage+1)+'</span><button type="button" class="mw-button" data-mw="assetNext" '+(items.length===PAGE?'':'disabled')+'>التالي</button></div></div>';
 html+='<div class="mw-card"><h3>إضافة معدة واحدة</h3><form id="mw-add-asset"><div class="mw-form-grid">'+
 '<label class="mw-label">اسم المعدة<input class="mw-input" name="assetName" required minlength="2" maxlength="180" placeholder="مثال: INTAKE WATER PUMP 1"></label>'+
 '<label class="mw-label">المنطقة / المبنى<input class="mw-input" name="area" maxlength="180" placeholder="مثال: INTAKE"></label>'+
 '<label class="mw-label">رقم المعدة / TAG (اختياري)<input class="mw-input" name="assetCode" maxlength="100"></label>'+
 '</div><div class="mw-actions" style="margin-top:12px"><button class="mw-button main" type="submit">حفظ المعدة</button></div></form></div>';
 el('maintenanceBody').innerHTML=html;
}
function recordsParams(id){
 const p={select:'id,asset_id,work_type,frequency,work_date,period_month,status,description,notes,cost,source_file,source_sheet,source_row,original_date,original_status,maintenance_assets(asset_name,area,asset_code)',
 station_id:'eq.'+id,order:'period_month.desc.nullslast,work_date.desc.nullslast,created_at.desc',limit:String(PAGE),offset:String(M.page*PAGE)};
 if(M.assetId)p.asset_id='eq.'+M.assetId;
 if(M.type)p.work_type='eq.'+M.type;
 if(M.status)p.status='eq.'+M.status;
 if(M.period&&/^\d{4}-\d{2}$/.test(M.period))p.period_month='eq.'+M.period+'-01';
 return p;
}
async function renderRecords(id){
 const list=await getRows('maintenance_records',recordsParams(id));
 let html=toolbar()+'<div class="mw-card"><div class="mw-top"><h3>سجل أعمال الصيانة '+(M.assetName?' — '+h(M.assetName):'')+'</h3>'+
 '<button class="mw-button" data-mw="clearFilters">عرض جميع السجلات</button></div>'+
 '<div class="mw-actions"><label>النوع <select class="mw-select" id="mw-type"><option value="">الكل</option>'+
 [['PM','PM'],['CM','CM'],['SS','SS']].map(([v,t])=>'<option value="'+v+'"'+(M.type===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
 '<label>الحالة <select class="mw-select" id="mw-status">'+[['','الكل'],['DONE','DONE'],['NOT DONE','NOT DONE'],['UNVERIFIED','غير محدد']].map(([v,t])=>'<option value="'+v+'"'+(M.status===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
 '<label>الشهر <input type="month" class="mw-input" id="mw-period" value="'+h(M.period)+'"></label></div>';
 html+=list.length?'<div class="mw-table-wrap" style="margin-top:14px"><table><thead><tr><th>المعدة</th><th>المنطقة</th><th>النوع</th><th>الشهر</th><th>التاريخ المدون</th><th>التكرار</th><th>الحالة</th><th>الملاحظات</th><th>التكلفة (ر.س)</th><th>المصدر</th></tr></thead><tbody>'+
 list.map(r=>'<tr><td class="mw-note">'+h(r.maintenance_assets?.asset_name||'—')+'</td><td class="mw-note">'+h(r.maintenance_assets?.area||'—')+'</td><td>'+h(r.work_type)+'</td><td>'+h(r.period_month?String(r.period_month).slice(0,7):'—')+'</td>'+
 '<td>'+h(r.original_date||prettyDate(r.work_date))+'</td><td>'+h(r.frequency||'—')+'</td><td>'+badge(r.status)+'</td>'+
 '<td class="mw-note">'+h([r.description,r.notes].filter(Boolean).join(' — ')||'—')+'</td><td>'+h(r.cost==null?'—':fmt(r.cost))+'</td>'+
 '<td class="mw-note"><small>'+h(r.source_file||'إدخال مباشر')+' '+h(r.source_sheet||'')+' '+h(r.source_row||'')+'</small></td></tr>').join('')+'</tbody></table></div>':
 '<div class="mw-empty">لا توجد أعمال صيانة مسجلة ضمن الفلاتر الحالية.</div>';
 html+='<div class="mw-pager"><button class="mw-button" data-mw="recordsPrev" '+(M.page?'':'disabled')+'>السابق</button><span class="mw-muted">الصفحة '+(M.page+1)+'</span><button class="mw-button" data-mw="recordsNext" '+(list.length===PAGE?'':'disabled')+'>التالي</button></div></div>';
 el('maintenanceBody').innerHTML=html;
}
function renderImport(id){
 el('maintenanceBody').innerHTML=toolbar()+'<div class="mw-card"><h3>استيراد المعدات وسجلات الصيانة من Excel</h3>'+
 '<p class="mw-muted">يمكن لحساب كل محطة استيراد ملفه الخاص. تُقرأ أوراق العمل محليًا في المتصفح، ويُحفظ في قاعدة البيانات فقط ما تؤكده بعد المعاينة.</p>'+
 '<div class="mw-notice">التنسيقات المدعومة: ملف قاعدة البيانات الموحدة (ورقة «قاعدة البيانات») أو الجداول الشهرية ذات أعمدة AREA / UNIT / FREQUENCY / DATE / STATUS / NOTES / COST، إضافة إلى قوائم المعدات. لا تُحوَّل الحالات غير المؤكدة إلى DONE.</div>'+
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
 return {filename:file.name,assets:new Map(),records:[],skipped:0,issues:[],sample:[],seen:new Set(),validRows:0};
}
function addParsed(out,obj){
 const name=clean(obj.name),area=clean(obj.area),code=clean(obj.code);
 if(!name||name.length<2||/^total$|^اجمالي|^المجموع|^unit$|^equipment$/i.test(name)){out.skipped++;return}
 if(name.length>180||area.length>180||code.length>100){out.skipped++;return}
 const key=assetKey(name,area,code);if(!out.assets.has(key))out.assets.set(key,{asset_name:name,area,asset_code:code,normalized_key:key});
 out.validRows++;
 if(!obj.type)return;
 const workdate=parseDate(obj.rawDate,obj.period);
 if(workdate.uncertain&&obj.rawDate)out.issues.push('تاريخ غير مؤكد: '+obj.sheet+' / صف '+obj.row+' ('+clean(obj.rawDate)+')');
 const status=statusOf(obj.rawStatus,workdate.iso,obj.type);
 const costRaw=clean(obj.cost).replace(/[,،\s]/g,'');
 const cost=costRaw&&/^\d+(\.\d{1,2})?$/.test(costRaw)?Number(costRaw):null;
 if(costRaw&&cost===null)out.issues.push('تكلفة غير مقروءة: '+obj.sheet+' / صف '+obj.row);
 const m=obj.period||((workdate.iso||'').slice(0,7));
 const hasWork=!!(obj.period||obj.rawDate||obj.rawStatus||obj.description||obj.notes||cost!==null);
 if(!hasWork)return;
 const sourceKey='XLS-'+hash(out.filename+'|'+obj.sheet+'|'+obj.row+'|'+key+'|'+obj.type);
 if(out.seen.has(sourceKey))return;
 out.seen.add(sourceKey);
 const row={assetKey:key,work_type:obj.type,frequency:clean(obj.frequency).slice(0,100),
 period_month:m?m+'-01':null,work_date:workdate.iso||null,status,description:clean(obj.description).slice(0,3000),notes:clean(obj.notes).slice(0,4000),cost,source_file:out.filename.slice(0,240),
 source_sheet:obj.sheet.slice(0,100),source_row:obj.row,source_ref:clean(obj.sourceRef).slice(0,100),
 source_key:sourceKey,original_status:clean(obj.rawStatus).slice(0,200),original_date:clean(obj.rawDate).slice(0,100),
 raw_data:{original_area:area,original_name:name,original_code:code}};
 out.records.push(row);
 if(out.sample.length<9)out.sample.push({name,area,type:obj.type,date:obj.rawDate||'',status});
}
function parseUnified(rows,sheet,out){
 const p=monthFrom(out.filename);
 for(let i=5;i<rows.length;i++){
  const r=rows[i]||[];let v=j=>clean(r[j]);
  if(!v(3)||/^(رقم السجل|المعدة)/.test(v(3)))continue;
  const month=v(4)&&v(5)?v(4)+'-'+String(v(5)).padStart(2,'0'):p;
  const type=typeOf(v(8),'');
  const obj={name:v(3),area:v(2),code:v(1),sheet,row:i+1,period:/^20\d{2}-\d{2}$/.test(month)?month:p,
   type,frequency:'',rawDate:v(12)||v(11),rawStatus:v(10)||v(9),
   description:v(13),notes:v(14),cost:v(18),sourceRef:v(0)};
  // "حالة مصنفة" and "حالة أصلية" stay UNVERIFIED when explicitly unconfirmed.
  addParsed(out,obj);
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
async function previewFile(){
 const file=el('mw-file')?.files?.[0];
 if(!file){el('mw-import-result').innerHTML=message('اختر ملف Excel أولًا.',true);return}
 if(!/\.(xlsx|xls)$/i.test(file.name)||file.size>15*1024*1024){el('mw-import-result').innerHTML=message('يجب اختيار ملف Excel بحجم لا يتجاوز 15 ميجابايت.',true);return}
 const status=el('mw-import-result');status.innerHTML=message('جارٍ قراءة الملف وفحص الأعمدة...');M.preview=null;
 try{
  await loadExcel();
  const bytes=await file.arrayBuffer(),wb=XLSX.read(bytes,{type:'array',cellDates:false,raw:false});
  const out=makeImporter(file),uni=wb.SheetNames.find(n=>clean(n)==='قاعدة البيانات');
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
  // Pure asset guide in a unified workbook is not treated as proof of completed work.
  if(!out.assets.size)throw Error('لم يتم التعرف على معدات صحيحة. راجع أسماء الأعمدة أو اختر الجدول الأصلي.');
  out.stationId=getId();
  M.preview=out;
  status.innerHTML=previewHtml(out);
 }catch(err){status.innerHTML=message(err.message||'تعذر قراءة Excel.',true)}
}
function previewHtml(p){
 const issues=p.issues.length,assets=p.assets.size,works=p.records.length;
 return '<div class="mw-card"><h3>معاينة قبل الحفظ — '+h(p.filename)+'</h3>'+
 '<div class="mw-kpis">'+[['المعدات المميزة',assets],['سجلات الصيانة',works],['الصفوف المستبعدة',p.skipped],['ملاحظات الفحص',issues]].map(([t,v])=>
 '<div class="mw-kpi"><small>'+h(t)+'</small><strong>'+fmt(v)+'</strong></div>').join('')+'</div>'+
 (issues?message('توجد '+issues+' ملاحظة. أمثلة: '+p.issues.slice(0,4).join('؛ ')):'')+
 '<p class="mw-muted">الأعمال غير المؤكدة لن تتحول إلى DONE. ستُتجاهل السجلات الموجودة سابقًا بالمصدر نفسه دون استبدالها.</p>'+
 '<div class="mw-preview"><table><thead><tr><th>المعدة</th><th>المنطقة</th><th>النوع</th><th>التاريخ المدون</th><th>الحالة</th></tr></thead><tbody>'+
 (p.sample.length?p.sample.map(x=>'<tr><td>'+h(x.name)+'</td><td>'+h(x.area)+'</td><td>'+h(x.type)+'</td><td>'+h(x.date)+'</td><td>'+badge(x.status)+'</td></tr>').join(''):'<tr><td colspan="5">الملف يحتوي على قائمة معدات فقط</td></tr>')+
 '</tbody></table></div><div id="mw-import-status"></div><div class="mw-actions" style="margin-top:12px">'+
 '<button class="mw-button main" type="button" data-mw="commitImport">اعتماد استيراد البيانات المعروضة</button>'+
 '<button class="mw-button" type="button" data-mw="discardPreview">إلغاء</button></div></div>';
}
async function loadAllAssets(id){
 const all=[];for(let offset=0;offset<100000;offset+=1000){
  const rows=await getRows('maintenance_assets',{select:'id,normalized_key',station_id:'eq.'+id,limit:'1000',offset:String(offset)});
  all.push(...rows);if(rows.length<1000)break;
 }
 return new Map(all.map(x=>[x.normalized_key,x.id]));
}
function assign(data,id){
 return {...data,station_id:id,created_by:host().userId()};
}
async function importCommit(){
 const p=M.preview,id=getId();if(M.importing||!p||p.stationId!==id||!owns(id))return;
 if(!p.assets.size){el('mw-import-status').innerHTML=message('لا توجد معدات للاستيراد.',true);return}
 M.importing=true;let savedAssets=0,savedRecords=0;
 const box=el('mw-import-status'),buttons=root.querySelectorAll('[data-mw="commitImport"],[data-mw="discardPreview"]');
 buttons.forEach(b=>b.disabled=true);
 const progress=(t,v)=>{if(box)box.innerHTML='<div class="mw-progress"><div style="width:'+v+'%"></div></div><div class="mw-muted">'+h(t)+'</div>'};
 try{
  const assets=Array.from(p.assets.values()),existing=await loadAllAssets(id);
  const missing=assets.filter(a=>!existing.has(a.normalized_key));
  for(let i=0;i<missing.length;i+=BATCH){
   const inserted=await postRows('maintenance_assets',missing.slice(i,i+BATCH).map(a=>assign(a,id)),true);
   savedAssets+=inserted.length;progress('جاري حفظ المعدات...',Math.round((i+BATCH)/Math.max(1,missing.length)*35));
  }
  const amap=await loadAllAssets(id);
  const records=p.records.map(r=>{
   const asset_id=amap.get(r.assetKey);if(!asset_id)return null;
   const {assetKey,...row}=r;return assign({...row,asset_id},id);
  }).filter(Boolean);
  for(let i=0;i<records.length;i+=BATCH){
   const inserted=await postRows('maintenance_records',records.slice(i,i+BATCH),true);
   savedRecords+=inserted.length;progress('جاري حفظ سجلات الصيانة... '+Math.min(i+BATCH,records.length)+' / '+records.length,35+Math.round(Math.min(i+BATCH,records.length)/Math.max(1,records.length)*62));
  }
  await postRows('maintenance_imports',[assign({
   file_name:p.filename.slice(0,240),reviewed_rows:p.validRows,inserted_assets:savedAssets,
   inserted_records:savedRecords,ignored_records:records.length-savedRecords
  },id)]);
  M.preview=null;progress('اكتمل الحفظ: '+savedAssets+' معدة جديدة، '+savedRecords+' سجل جديد. تم تجاوز '+(records.length-savedRecords)+' سجل مكرر.',100);
  const actions=document.createElement('div');actions.className='mw-actions';actions.style.marginTop='12px';
  actions.innerHTML='<button class="mw-button main" type="button" data-mw="goRecords">استعراض السجلات</button>';
  box.appendChild(actions);root.querySelector('[data-mw="commitImport"]')?.remove();
  dashboardMaintenance();
 }catch(err){progress('توقف الاستيراد: '+err.message+'. تم حفظ '+savedAssets+' معدة و'+savedRecords+' سجل قبل التوقف. يمكن إعادة رفع الملف دون تكرار السجلات.',75)}
 finally{M.importing=false;buttons.forEach(b=>b.disabled=false)}
}
async function addAsset(form){
 const name=clean(form.elements.assetName.value),area=clean(form.elements.area.value),code=clean(form.elements.assetCode.value);
 if(name.length<2||name.length>180)throw Error('اسم المعدة غير صالح.');
 const rows=await postRows('maintenance_assets',[assign({asset_name:name,area,asset_code:code,normalized_key:assetKey(name,area,code)},getId())],true);
 if(rows.length){M.search='';M.assetPage=0;await update();alertInline('تمت إضافة المعدة بنجاح.')}
 else alertInline('هذه المعدة مسجلة مسبقًا في المحطة.',false);
}
function alertInline(text,err=false){
 const body=el('maintenanceBody');if(body)body.insertAdjacentHTML('afterbegin',message(text,err));
}
async function onSubmit(e){
 if(e.target.id==='mw-add-asset'){e.preventDefault();try{await addAsset(e.target)}catch(err){alertInline(err.message,true)}}
 else if(e.target.id==='mw-search-form'){e.preventDefault();M.search=el('mw-search-input').value;M.assetPage=0;update()}
}
function onChange(e){
 if(e.target.id==='mw-station'){if(isStation())return;M.stationId=e.target.value;M.page=0;M.assetPage=0;M.assetId='';M.preview=null;update()}
 if(e.target.id==='mw-type'){M.type=e.target.value;M.page=0;update()}
 if(e.target.id==='mw-status'){M.status=e.target.value;M.page=0;update()}
 if(e.target.id==='mw-period'){M.period=e.target.value;M.page=0;update()}
}
function onClick(e){
 const b=e.target.closest('[data-mw]');if(!b)return;
 const action=b.dataset.mw;
 if(action==='close'){close();return}
 if(action==='tab'){setTab(b.dataset.tab);return}
 if(action==='goImport'){setTab('import');return}
 if(action==='goRecords'){setTab('records');return}
 if(action==='asset'){M.assetId=b.dataset.asset;M.assetName=b.dataset.name;M.tab='records';M.page=0;update();return}
 if(action==='clearFilters'){M.assetId='';M.assetName='';M.type='';M.status='';M.period='';M.page=0;update();return}
 if(action==='clearSearch'){M.search='';M.assetPage=0;update();return}
 if(action==='assetPrev'){M.assetPage=Math.max(0,M.assetPage-1);update();return}
 if(action==='assetNext'){M.assetPage++;update();return}
 if(action==='recordsPrev'){M.page=Math.max(0,M.page-1);update();return}
 if(action==='recordsNext'){M.page++;update();return}
 if(action==='preview'){previewFile();return}
 if(action==='discardPreview'){M.preview=null;renderImport(getId());return}
 if(action==='commitImport'){importCommit();return}
}
async function dashboardMaintenance(){
 const container=el('dashboardContent');
 if(!accessible()||!container||!container.querySelector('.dashboard-summary')||updatingDash)return;
 if(container.querySelector('.mw-dash-summary'))return;
 const node=document.createElement('section');
 node.className='mw-dash-summary';node.innerHTML='<h3>🔧 ملخص الصيانة</h3><div class="mw-muted">جارٍ تحميل سجلات الصيانة...</div>';
 container.insertBefore(node,container.firstChild);
 updatingDash=true;
 try{
  const list=await summary('');
  if(!node.isConnected)return;
  const sums=k=>list.reduce((a,x)=>a+Number(x[k]||0),0);
  const assets=sums('asset_count'),works=sums('work_count'),undone=sums('not_done_count');
  node.innerHTML='<h3>🔧 متابعة الصيانة — جميع المحطات</h3><div class="mw-dash-row"><div class="mw-dash-values">'+
   [['المعدات المسجلة',assets],['سجلات الصيانة',works],['NOT DONE',undone]].map(([label,num])=>'<span>'+h(label)+'<strong>'+fmt(num)+'</strong></span>').join('')+
   '</div><button type="button" id="mw-dashboard-open">فتح إدارة الصيانة</button></div>'+
   (!works?'<p class="mw-muted" style="margin:8px 0 0">لم تُستورد سجلات الصيانة إلى الموقع بعد.</p>':'');
  el('mw-dashboard-open')?.addEventListener('click',()=>open('overview'));
 }catch(err){if(node.isConnected)node.innerHTML='<h3>🔧 متابعة الصيانة</h3>'+message('تعذر تحميل ملخص الصيانة.',true)}
 finally{updatingDash=false}
}
function init(){
 const trigger=el('maintenanceLink');
 if(trigger)trigger.addEventListener('click',()=>open('overview'));
 build();
 const dc=el('dashboardContent');
 if(dc){observer=new MutationObserver(()=>{if(!dc.querySelector('.mw-dash-summary'))dashboardMaintenance()});observer.observe(dc,{childList:true});dashboardMaintenance()}
 bodyObserver=new MutationObserver(()=>{if(!accessible())close()});
 bodyObserver.observe(document.body,{attributes:true,attributeFilter:['data-auth']});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root&&!root.classList.contains('hidden'))close()});
}
window.WSMaintenance={open,close,refreshDashboard:dashboardMaintenance};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
