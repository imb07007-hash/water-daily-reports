/* Water Solutions — daily maintenance entry and exact monthly template export.
   All database calls use the authenticated host bridge; template stays private. */
(function(global){
 'use strict';
 const settings={stationId:'',type:'PM',area:'',choice:'',search:'',frequency:'',day:'',month:'',saving:false,exporting:false};
 const contexts=new Map();
 const dateToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 settings.day=dateToday();settings.month=settings.day.slice(0,7);
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const format=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n)||0);
 const norm=x=>String(x||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9\u0621-\u064A]+/g,' ').trim();
 const ui=id=>document.getElementById(id);
 const bridge=()=>global.WSMaintenanceHost;
 const allowed=station=>bridge()?.signedIn?.()&&bridge()?.stations?.().some(s=>s.id===station)&&(
  !['station','maintenance'].includes(bridge()?.role?.())||bridge()?.stationId?.()===station);
 async function api(path,options={}){
  const resp=await bridge().authedFetch(path,options);
  if(!resp.ok){const body=await resp.json().catch(()=>({}));throw Error(body?.message||body?.details||'تعذر حفظ بيانات الصيانة ('+resp.status+').')}
  const s=await resp.text();return s?JSON.parse(s):null;
 }
 const endpoint=(table,params)=>'/rest/v1/'+table+'?'+new URLSearchParams(params).toString();
 async function getRows(table,params){return api(endpoint(table,params))}
 async function loadContext(id){
  if(contexts.has(id))return contexts.get(id);
  const [templates,assets]=await Promise.all([
   getRows('maintenance_templates',{station_id:'eq.'+id,select:'template_name,template_sha256,template_b64,template_rows,version',limit:'1'}),
   getRows('maintenance_assets',{station_id:'eq.'+id,select:'id,asset_code,asset_name,area,source_aliases',order:'asset_name.asc',limit:'1500'})
  ]);
  const template=templates[0]||null;
  const layout=template?.template_rows||[],assetList=assets.filter(a=>a.asset_code!=='UNVERIFIED_LINK');
  const placeholder=assets.find(a=>a.asset_code==='UNVERIFIED_LINK');
  const links=new Map();
  for(const row of layout){
   const found=global.WSMaintenanceCatalog?.matchTemplateAsset?.(row,assetList)||null;
   links.set(row.row,found);
  }
  const ctx={template,layout,assets:assetList,placeholder,links};contexts.set(id,ctx);return ctx;
 }
 const statuses=['DONE','DONE WITH COMMENT','NOT DONE','OTHERS'];
 const tag=v=>'<span class="mw-tag '+(v==='DONE'||v==='DONE WITH COMMENT'?'done':v==='NOT DONE'?'not':'unknown')+'">'+h(v)+'</span>';
 function types(){return '<option value="PM">PM — الصيانة الوقائية</option><option value="CM">CM — الصيانة التصحيحية</option><option value="SS">SS — الأعمال الخدمية</option>'}
 function optionsAreas(ctx,type){
  const source=type==='PM'&&ctx.template?ctx.layout:ctx.assets;
  const catalog=global.WSMaintenanceCatalog;
  return catalog?catalog.areas(source):[...new Set(source.map(x=>String(x.area||'').trim()||'غير محددة'))];
 }
 function optionsEquipment(ctx,type,area='',query=''){
  const catalog=global.WSMaintenanceCatalog;
  if(type==='PM'&&ctx.template){
   const source=catalog?catalog.list(ctx.layout,area,query):ctx.layout.filter(x=>!area||x.area===area);
   return source.map(x=>({id:'row:'+x.row,name:x.unit,area:x.area||'غير محددة',meta:x}));
  }
  const assets=catalog?catalog.assetOptions(ctx.assets,area,query):ctx.assets.filter(x=>!area||x.area===area);
  return assets.map(x=>({id:'asset:'+x.id,name:x.asset_name,area:x.area||'غير محددة',meta:x}));
 }
 function drawEquipment(form,ctx,preferred){
  const type=form.elements.workType.value,area=form.elements.area.value||'',
   search=form.elements.equipmentSearch.value||'',
   options=optionsEquipment(ctx,type,area,search),choice=form.elements.equipment;
  const old=preferred!==undefined?preferred:choice.value;
  const total=type==='PM'&&ctx.template?ctx.layout.length:ctx.assets.length;
  choice.innerHTML='<option value="">اختر المعدة / UNIT</option>'+
   options.map(x=>'<option value="'+h(x.id)+'">'+h(area?x.name:x.area+' — '+x.name)+'</option>').join('');
  choice.value=options.some(x=>x.id===old)?old:'';
  const counter=ui('mw-equipment-count');
  if(counter)counter.textContent='المعروض '+format(options.length)+' من '+format(total)+' معدة';
  updateLink(form,ctx);
 }
 function rebuildEquipment(form,ctx){
  const type=form.elements.workType.value,areas=optionsAreas(ctx,type),areaSelect=form.elements.area;
  const previous=areaSelect.value||settings.area||'';
  areaSelect.innerHTML='<option value="">جميع المناطق — عرض جميع المعدات</option>'+
   areas.map(a=>'<option value="'+h(a)+'">'+h(a)+'</option>').join('');
  areaSelect.value=areas.includes(previous)?previous:'';
  form.querySelector('[data-cm-desc]').hidden=type==='PM';
  form.elements.frequency.required=type==='PM';
  drawEquipment(form,ctx,settings.choice);
 }
 function rebuildEquipmentChoiceOnly(form,ctx){
  drawEquipment(form,ctx);
 }
 function updateLink(form,ctx){
  const selected=form.elements.equipment.value,box=form.querySelector('#wj-link-status');
  if(!box)return;
  if(!selected){box.textContent='اختر UNIT.';return}
  if(selected.startsWith('asset:')){
   const asset=ctx.assets.find(x=>'asset:'+x.id===selected);
   box.textContent='AREA: '+(asset?.area||'غير محددة');return
  }
  const row=Number(selected.slice(4)),link=ctx.links.get(row);
  const template=ctx.layout.find(x=>x.row===row);
  box.textContent='AREA: '+(template?.area||'—')+(link?'':' · ربط غير مؤكد');
 }
 function renderDailyMarkup(ctx,stationId,header){
  const areas=optionsAreas(ctx,settings.type),area=areas.includes(settings.area)?settings.area:areas[0]||'';
  return header+'<section class="mw-daily-grid"><article class="mw-card mw-daily-card">'+
   '<div class="mw-daily-heading"><div><h3>＋ إدخال صيانة جديدة</h3></div>'+ 
   '<span class="mw-day-badge">'+h(settings.day)+'</span></div>'+ 
   '<form id="mw-daily-form" autocomplete="off"><div class="mw-daily-section-label">01 · بيانات العمل</div><div class="mw-form-grid">'+
   '<label class="mw-label">تاريخ الصيانة<input class="mw-input" name="workDate" type="date" required value="'+h(settings.day)+'"></label>'+
   '<label class="mw-label">نوع العمل<select class="mw-select" name="workType">'+types()+'</select></label>'+ 
   '<label class="mw-label">تكرار الصيانة / FREQUENCY<select class="mw-select" name="frequency" required><option value="">اختر التكرار</option>'+ 
    '<option value="M">شهري — MONTHLY (M)</option><option value="Q">ربع سنوي — QUARTERLY (Q)</option>'+ 
    '<option value="H">نصف سنوي — HALF YEARLY (H)</option><option value="Y">سنوي — YEARLY (Y)</option></select></label>'+
   '<label class="mw-label">المنطقة / AREA<select class="mw-select" name="area"></select></label>'+
   '<label class="mw-label mw-col-full">بحث المعدات / UNIT SEARCH<input class="mw-input" type="search" name="equipmentSearch" placeholder="ابحث باسم المعدة أو AREA أو رقم الصف" autocomplete="off"></label>'+ 
   '<label class="mw-label mw-col-full">المعدة / UNIT<select class="mw-select" name="equipment" required></select><small id="mw-equipment-count" class="mw-inline-hint" aria-live="polite"></small></label>'+
   '<label class="mw-label" data-cm-desc hidden>وصف عمل CM / SS<input class="mw-input" name="description" maxlength="3000" placeholder="وصف مختصر للعمل"></label>'+
   '<label class="mw-label">الحالة / STATUS<select class="mw-select" name="status">'+statuses.map(s=>'<option value="'+s+'">'+s+'</option>').join('')+'</select></label>'+
   '</div><div id="wj-link-status" class="mw-inline-hint"></div>'+ 
   '<div class="mw-daily-section-label">02 · تفاصيل التنفيذ</div><div class="mw-form-grid mw-daily-details">'+
   '<label class="mw-label">عدد العمال<input class="mw-input" name="workers" type="number" min="0" step="1" inputmode="numeric" placeholder="—"></label>'+
   '<label class="mw-label">عدد الساعات<input class="mw-input" name="hours" type="number" min="0" step="0.5" placeholder="—"></label>'+
   '<label class="mw-label">قطع الغيار (ريال)<input class="mw-input" name="sparePartsCost" type="number" step="0.01" min="0" placeholder="—"></label>'+
   '<label class="mw-label">إجمالي التكلفة (ريال)<input class="mw-input" name="cost" type="number" min="0" step="0.01" placeholder="—"></label>'+
   '<label class="mw-label mw-col-full">المستهلكات / CONSUMABLES<input class="mw-input" name="materials" maxlength="500" placeholder="مواد ومستهلكات العمل"></label>'+
   '<label class="mw-label mw-col-full">الملاحظات / NOTES<textarea class="mw-input" name="notes" rows="3" maxlength="4000" placeholder="ملاحظات الصيانة التي ستظهر في التقرير الشهري"></textarea></label>'+
   '</div><div class="mw-daily-actions"><button class="mw-button main" type="submit" name="afterSave" value="stay">حفظ الصيانة</button>'+ 
   '<button class="mw-button" type="submit" name="afterSave" value="again">حفظ وإضافة صيانة أخرى</button></div>'+ 
   '<div id="mw-daily-feedback" aria-live="polite"></div></form></article>'+ 
   '<aside class="mw-daily-side"><div class="mw-card"><h3>أعمال اليوم</h3><div id="mw-today-summary" class="mw-daily-kpis">جارٍ التحديث…</div>'+ 
   '<div id="mw-today-records" class="mw-daily-list"></div></div><div class="mw-card">'+
   '<h3>التقرير الشهري</h3>'+ 
   '<div class="mw-daily-actions"><button type="button" class="mw-button main" data-mw="openExactMonthly">معاينة التقرير الشهري</button></div></div></aside></section>';
 }
 async function renderDaily(root,id,header){
  if(!allowed(id))throw Error('لا توجد صلاحية لهذه المحطة.');
  contexts.delete(id);
  const ctx=await loadContext(id);settings.stationId=id;
  if(!ctx.assets.length&&!ctx.layout.length){
   root.innerHTML=header+'<div class="mw-card"><h3>لا توجد معدات</h3>'+
        '<button class="mw-button main" data-mw="tab" data-tab="assets" type="button">＋ إضافة معدات</button></div>';
   return;
  }
  root.innerHTML=renderDailyMarkup(ctx,id,header);
  const form=ui('mw-daily-form');form.elements.workType.value=settings.type;
  form.elements.frequency.value=settings.frequency||'';
  form.elements.equipmentSearch.value=settings.search||'';
  rebuildEquipment(form,ctx);
  if(settings.area&&optionsAreas(ctx,settings.type).includes(settings.area)){
   form.elements.area.value=settings.area;
   rebuildEquipmentChoiceOnly(form,ctx);
  }
  if(settings.choice&&form.elements.equipment.querySelector('option[value="'+CSS.escape(settings.choice)+'"]'))form.elements.equipment.value=settings.choice;
  void renderToday(settings.day,id);
 }
 async function renderToday(date,id){
  const stats=ui('mw-today-summary'),list=ui('mw-today-records');if(!stats||!list)return;
  try{
   const rows=await getRows('maintenance_records',{station_id:'eq.'+id,work_date:'eq.'+date,
    select:'id,work_type,frequency,original_equipment,status,notes,cost,work_date,created_at',order:'created_at.desc',limit:'50'});
   if(!stats.isConnected||!list.isConnected)return;
   const done=rows.filter(x=>x.status==='DONE'||x.status==='DONE WITH COMMENT').length;
   stats.innerHTML='<div><strong>'+format(rows.length)+'</strong><small>عمل مسجل</small></div>'+ 
    '<div><strong>'+format(done)+'</strong><small>DONE</small></div>'+ 
    '<div><strong>'+format(rows.reduce((a,x)=>a+Number(x.cost||0),0))+'</strong><small>ر.س مسجلة</small></div>';
   list.innerHTML=rows.length?rows.slice(0,20).map(r=>'<div class="mw-daily-item"><div><b>'+h(r.original_equipment||'معدة غير مسماة')+'</b><small>'+h(r.work_type)+(r.frequency?' · '+h(r.frequency):'')+' · '+h((r.notes||'').slice(0,110))+'</small></div>'+tag(r.status)+'</div>').join(''):
    '<div class="mw-empty">لا توجد صيانة مسجلة لهذا اليوم.</div>';
  }catch(e){list.innerHTML='<div class="mw-notice mw-error">'+h(e.message)+'</div>'}
 }
 function readNum(value){
  if(String(value).trim()==='')return null;
  const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('أدخل أرقامًا صحيحة وغير سالبة للتكاليف والساعات.');
  return n;
 }
 async function save(form,afterSave){
  if(settings.saving)return;
  const id=settings.stationId,ctx=await loadContext(id),date=form.elements.workDate.value,type=form.elements.workType.value;
  if(!allowed(id)||!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('تاريخ أو صلاحية المحطة غير صحيح.');
  const chosen=form.elements.equipment.value;
  if(!chosen)throw Error('اختر المعدة من قائمة UNIT قبل الحفظ.');
  const freq=String(form.elements.frequency.value||'');
  if(type==='PM'&&!['M','Q','H','Y'].includes(freq))throw Error('يجب تحديد دورية الصيانة: شهرية، ربع سنوية، نصف سنوية أو سنوية.');
  if(freq&&!['M','Q','H','Y'].includes(freq))throw Error('قيمة تكرار الصيانة غير صحيحة.');
  let asset,originalEquipment,originalArea,templateRow=null;
  if(type==='PM'&&ctx.template){
   templateRow=Number(chosen.replace('row:',''));
   const row=ctx.layout.find(x=>x.row===templateRow);if(!row)throw Error('المعدة غير موجودة في قالب الصيانة.');
   asset=ctx.links.get(templateRow)||ctx.placeholder;
   if(!asset)throw Error('تعذر حفظ المعدة: لا يوجد سجل مؤقت للمعدات غير المرتبطة.');
   originalEquipment=row.unit;originalArea=row.area;
  }else{
   const chosenId=chosen.replace('asset:','');asset=ctx.assets.find(x=>x.id===chosenId);
   if(!asset)throw Error('المعدة المحددة غير موجودة.');
   originalEquipment=asset.asset_name;originalArea=asset.area;
  }
  const previous=await getRows('maintenance_records',{station_id:'eq.'+id,work_date:'eq.'+date,work_type:'eq.'+type,
   select:'id,asset_id,original_equipment,raw_data',limit:'200'});
  const same=previous.some(x=>type==='PM'&&ctx.template?Number(x.raw_data?.template_row)===templateRow:
   x.asset_id===asset.id&&norm(x.original_equipment)===norm(originalEquipment));
  if(same&&!global.confirm('يوجد سجل للمعدة نفسها في التاريخ ونوع الصيانة المحددين. هل تريد إضافة عمل آخر مستقل؟'))return;
  if(form.elements.status.value==='DONE WITH COMMENT'&&!form.elements.notes.value.trim())throw Error('اكتب ملاحظة عند اختيار DONE WITH COMMENT.');
  const totalCost=readNum(form.elements.cost.value),partsCost=readNum(form.elements.sparePartsCost.value);
  const dateMonth=date.slice(0,7)+'-01';
  const row={station_id:id,asset_id:asset.id,work_type:type,frequency:freq,period_month:dateMonth,work_date:date,
   status:form.elements.status.value,description:type==='PM'?'':form.elements.description.value.trim(),
   notes:form.elements.notes.value.trim(),cost:totalCost,spare_parts_cost:partsCost,
   workers:readNum(form.elements.workers.value),hours:readNum(form.elements.hours.value),
   materials:form.elements.materials.value.trim(),spares:'',
   source_file:'إدخال يومي من الموقع',source_sheet:global.WSMaintenanceExcel?.excelSheetName(date.slice(0,7))||'',
   source_row:null,source_ref:templateRow?'PM:'+templateRow:'',source_key:'SITE-DAILY:'+crypto.randomUUID(),
   original_status:form.elements.status.value,original_date:date,original_equipment:originalEquipment,original_area:originalArea,
   import_issues:templateRow&&!ctx.links.get(templateRow)?['غير مرتبط بمعدة مؤكدة']:[],
   raw_data:{entry_source:'site_daily',template_row:templateRow,template_version:ctx.template?.version||null},
   created_by:bridge().userId()};
  settings.saving=true;
  const buttons=form.querySelectorAll('button[type="submit"]'),feedback=ui('mw-daily-feedback');
  buttons.forEach(b=>b.disabled=true);
  try{
   const inserted=await api('/rest/v1/maintenance_records',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});
   if(!Array.isArray(inserted)||inserted.length!==1)throw Error('لم يرجع تأكيد الحفظ من قاعدة البيانات.');
   settings.day=date;settings.month=date.slice(0,7);settings.type=type;settings.area=form.elements.area.value;
   settings.choice=chosen;settings.search=form.elements.equipmentSearch.value;settings.frequency=freq;
   if(afterSave==='again'){
    form.elements.notes.value='';form.elements.materials.value='';form.elements.sparePartsCost.value='';
    form.elements.cost.value='';form.elements.workers.value='';form.elements.hours.value='';form.elements.description.value='';
   }
   if(feedback)feedback.innerHTML='<div class="mw-notice mw-success">تم حفظ الصيانة.</div>';
   await renderToday(date,id);
   global.WSMaintenance?.refreshDashboard?.();
  }finally{settings.saving=false;buttons.forEach(b=>b.disabled=false)}
 }
 async function monthRows(id,month){
  const result=[];
  for(let offset=0;offset<20000;offset+=1000){
   const rows=await getRows('maintenance_records',{station_id:'eq.'+id,period_month:'eq.'+month+'-01',
    select:'id,work_type,frequency,work_date,period_month,status,description,notes,cost,spare_parts_cost,workers,hours,materials,spares,source_row,original_equipment,original_area,created_at,raw_data,maintenance_assets(asset_name,area)',
    order:'work_date.asc',limit:'1000',offset:String(offset)});
   result.push(...rows);if(rows.length<1000)break;
  }
  return result;
 }
 async function renderMonthly(root,id,header){
  if(!allowed(id))throw Error('لا توجد صلاحية لهذه المحطة.');
  if(id!=='jizan'){
   settings.stationId=id;
   const month=settings.month,rows=await monthRows(id,month);
   root.innerHTML=header+
    '<div class="mw-card"><div class="mw-top"><h3>التقرير الشهري — سجل الصيانة</h3>'+
    '<label>الشهر <input id="mw-exact-month" class="mw-input" type="month" value="'+h(month)+'"></label></div>'+
    '<div class="mw-notice">تصدير Excel غير متاح: قالب المحطة غير مرفوع.</div>'+
    '<div class="mw-table-wrap"><table><thead><tr><th>DATE</th><th>AREA</th><th>UNIT</th><th>TYPE</th><th>FREQUENCY</th><th>STATUS</th><th>NOTES</th><th>TOTAL COST</th></tr></thead><tbody>'+
    (rows.length?rows.slice(0,100).map(x=>'<tr><td>'+h(x.work_date||'')+'</td><td>'+h(x.original_area||'')+'</td><td>'+h(x.original_equipment||'')+'</td><td>'+h(x.work_type)+'</td><td>'+h(x.frequency||'—')+'</td><td>'+tag(x.status)+'</td><td>'+h(x.notes||'')+'</td><td>'+h(x.cost??'')+'</td></tr>').join(''):
     '<tr><td colspan="8">لا توجد أعمال مسجلة في الشهر المختار.</td></tr>')+
    '</tbody></table></div><div class="mw-actions"><button class="mw-button main" data-mw="openExactDaily">＋ إدخال صيانة</button></div></div>';
   return;
  }
  const ctx=await loadContext(id),month=settings.month;
  settings.stationId=id;
  const rows=await monthRows(id,month);
  settings.monthRows=rows;
  const plan=global.WSMaintenanceExcel?.plan(rows,ctx.layout,month);
  const total=rows.reduce((n,x)=>n+Number(x.cost||0),0);
  const done=rows.filter(r=>r.status==='DONE'||r.status==='DONE WITH COMMENT').length;
  const blockers=(plan?.unmapped?.length||0)+(plan?.invalidStatus?.length||0)+(plan?.invalidDate?.length||0);
  root.innerHTML=header+'<div class="mw-card mw-report-head"><div class="mw-report-intro">'+ 
   '<h3>التقرير الشهري</h3></div>'+ 
   '<label class="mw-label">الشهر المطلوب<input id="mw-exact-month" class="mw-input" type="month" value="'+h(month)+'"></label></div>'+ 
   '<div class="mw-kpis mw-month-export-kpis">'+[['سجلات الشهر',rows.length],['DONE',done],['CM',rows.filter(x=>x.work_type==='CM').length],['SS',rows.filter(x=>x.work_type==='SS').length],['التكاليف المسجلة (ر.س)',format(total)]].map(x=>
    '<div class="mw-kpi"><small>'+h(x[0])+'</small><strong>'+h(x[1])+'</strong></div>').join('')+'</div>'+ 
   '<div class="mw-card"><div class="mw-top"><h3>معاينة قبل التصدير</h3><span class="mw-muted">'+h(ctx.template.template_name)+' · '+h(month)+'</span></div>'+ 
   (blockers?'<div class="mw-notice mw-error">يتعذر التصدير: '+format(blockers)+' سجل يحتاج مراجعة.</div>':'')+
   '<div class="mw-table-wrap"><table><thead><tr><th>تاريخ الصيانة</th><th>AREA</th><th>UNIT</th><th>النوع</th><th>FREQUENCY</th><th>STATUS</th><th>NOTES</th><th>TOTAL COST</th></tr></thead><tbody>'+ 
   (rows.length?rows.slice(0,60).map(x=>'<tr><td dir="ltr">'+h(x.work_date||'—')+'</td><td class="mw-note">'+h(x.original_area||x.maintenance_assets?.area||'')+'</td>'+ 
    '<td class="mw-note">'+h(x.original_equipment||x.maintenance_assets?.asset_name||'')+'</td><td>'+h(x.work_type)+'</td><td>'+h(x.frequency||'—')+'</td><td>'+tag(x.status)+'</td>'+ 
    '<td class="mw-note">'+h(x.notes||'')+'</td><td>'+h(x.cost==null?'—':format(x.cost))+'</td></tr>').join(''):'<tr><td colspan="8">لا توجد أعمال لهذا الشهر.</td></tr>')+
   '</tbody></table></div><div class="mw-report-actions"><button class="mw-button main" data-mw="exactExport" type="button" '+(blockers?'disabled':'')+'>⬇ تصدير Excel بنفس القالب</button>'+ 
   '<button class="mw-button" type="button" data-mw="openExactDaily">＋ إدخال صيانة جديدة</button></div><div id="mw-month-export-status" aria-live="polite"></div></div>';
 }
 async function exportCurrent(){
  if(settings.exporting)return;
  const id=settings.stationId;
  if(!allowed(id)||id!=='jizan')throw Error('لا يمكن تصدير قالب محطة أخرى.');
  settings.exporting=true;
  const button=ui('maintenanceBody')?.querySelector('[data-mw="exactExport"]'),box=ui('mw-month-export-status');
  if(button)button.disabled=true;if(box)box.innerHTML='<div class="mw-notice">جارٍ تعبئة ملف Excel الأصلي...</div>';
  try{
   const ctx=await loadContext(id),rows=await monthRows(id,settings.month);
   const result=await global.WSMaintenanceExcel.exportMonth({template:ctx.template,rows,month:settings.month});
   if(box)box.innerHTML='<div class="mw-notice mw-success">تم تصدير '+h(result.filename)+' — '+format(result.included)+' سجل.</div>';
  }catch(err){if(box)box.innerHTML='<div class="mw-notice mw-error">'+h(err.message)+'</div>';throw err}
  finally{settings.exporting=false;if(button)button.disabled=false}
 }
 function change(target){
  if(target.id==='mw-exact-month'){
   if(/^20\d{2}-\d{2}$/.test(target.value)){
    settings.month=target.value;global.WSMaintenance?.refreshActive?.();
   }
   return true;
  }
  const form=target.closest('#mw-daily-form');if(!form)return false;
  if(target.name==='workType'||target.name==='area'){
   const ctx=contexts.get(settings.stationId);if(ctx){
    if(target.name==='workType')rebuildEquipment(form,ctx);
    else rebuildEquipmentChoiceOnly(form,ctx);
   }
  }
  if(target.name==='equipment')updateLink(form,contexts.get(settings.stationId));
  if(target.name==='frequency')settings.frequency=target.value;
  if(target.name==='workDate'&&/^20\d{2}-\d{2}-\d{2}$/.test(target.value)){
   settings.day=target.value;void renderToday(target.value,settings.stationId);
  }
  return true;
 }
 function input(target){
  if(target.name!=='equipmentSearch'||!target.closest('#mw-daily-form'))return false;
  const form=target.closest('#mw-daily-form'),ctx=contexts.get(settings.stationId);
  if(ctx){settings.search=target.value;drawEquipment(form,ctx)}
  return true;
 }
 function selectTemplateRow(templateRow,area){
  if(!Number.isInteger(Number(templateRow)))return false;
  settings.type='PM';settings.area=String(area||'');settings.choice='row:'+templateRow;
  settings.search='';settings.frequency='';
  return true;
 }
 function action(node){
  const a=node.dataset.mw;
  if(a==='openExactMonthly'){global.WSMaintenance?.open?.('monthly');return true}
  if(a==='openExactDaily'){global.WSMaintenance?.open?.('daily');return true}
  if(a==='exactExport'){void exportCurrent().catch(()=>{});return true}
  return false;
 }
 async function submit(form,submitter){
  if(form.id!=='mw-daily-form')return false;
  const feedback=ui('mw-daily-feedback');
  try{await save(form,submitter?.value||'stay')}catch(err){if(feedback)feedback.innerHTML='<div class="mw-notice mw-error">'+h(err.message)+'</div>'}
  return true;
 }
 global.WSMaintenanceDaily=Object.freeze({renderDaily,renderMonthly,submit,change,input,selectTemplateRow,action,loadContext});
})(window);