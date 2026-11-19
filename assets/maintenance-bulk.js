/* Admin-only batch maintenance workspace. Source records remain unchanged until confirmed server RPC. */
(function(){
'use strict';
const LIMIT=200,EDIT_LIMIT=50,READ_CHUNK=50;
const FIELDS=['work_type','frequency','work_date','status','description','notes','cost','spare_parts_cost','workers','hours','materials','spares'];
const NUMERIC=new Set(['cost','spare_parts_cost','workers','hours']);
const STATUS=['DONE','DONE WITH COMMENT','NOT DONE','UNVERIFIED','NEED CM','OTHERS','NOT IN SERVICE'];
const OPTIONS={
 status:STATUS,work_type:['PM','CM','SS'],frequency:['M','Q','H','Y']
};
const B={scope:'',selected:new Set(),visible:[],params:{},stationId:'',root:null,refresh:null,notice:null,toolbar:null,
 original:[],working:new Map(),overlay:null,mode:'notes',preview:false,busy:false};
const h=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const host=()=>window.WSMaintenanceHost;
const isAdmin=()=>['admin','superadmin'].includes(host()?.role?.())&&host()?.signedIn?.();
const uuid=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const option=(value,current)=>'<option value="'+h(value)+'"'+(value===current?' selected':'')+'>'+h(value)+'</option>';
function signal(message,isError){
 if(B.notice)B.notice(message,!!isError);
 else window.alert(message);
}
async function api(path,options={}){
 const response=await host().authedFetch(path,options);
 if(!response.ok){
  const detail=await response.json().catch(()=>null);
  throw Error((detail?.message||'تعذر تنفيذ العملية')+' ('+response.status+')');
 }
 const body=await response.text();
 return body?JSON.parse(body):[];
}
async function rows(params){
 return api('/rest/v1/maintenance_records?'+new URLSearchParams(params));
}
function scopeOf(stationId,params){
 const conditions={...params};for(const k of ['select','order','limit','offset'])delete conditions[k];
 return JSON.stringify([stationId,conditions]);
}
function counts(){
 const node=B.toolbar;
 if(!node)return;
 const count=B.selected.size,visible=B.visible.filter(r=>B.selected.has(r.id)).length;
 const text=node.querySelector('[data-bulk-count]');
 if(text)text.textContent='المحدد: '+count+' سجل'+(count>visible?' (يشمل صفحات أخرى)':'')+' · الحد الأقصى '+LIMIT;
 node.querySelectorAll('[data-bulk-action="editNotes"],[data-bulk-action="editAll"],[data-bulk-action="lock"],[data-bulk-action="unlock"],[data-bulk-action="clear"]').forEach(btn=>btn.disabled=count===0);
 const all=B.root?.querySelector('[data-bulk-page-all]');
 if(all){all.checked=B.visible.length>0&&visible===B.visible.length;all.indeterminate=visible>0&&visible<B.visible.length}
 B.root?.querySelectorAll('[data-bulk-record]').forEach(input=>{input.checked=B.selected.has(input.dataset.bulkRecord)});
}
function enhance({root,records,stationId,params,onRefresh,onNotice}){
 if(!isAdmin()||!root||!stationId)return;
 const scope=scopeOf(stationId,params||{});
 if(B.scope!==scope){B.scope=scope;B.selected.clear()}
 B.root=root;B.visible=records||[];B.stationId=stationId;B.params={...(params||{})};
 B.refresh=onRefresh;B.notice=onNotice;
 const card=root.querySelector('.mw-card'),table=card?.querySelector('.mw-table-wrap table');
 if(!card)return;
 const toolbar=document.createElement('div');toolbar.className='mw-bulk-toolbar';
 toolbar.innerHTML='<div class="mw-bulk-title"><strong>الإدارة الجماعية لسجلات الصيانة</strong>'+
 '<span data-bulk-count>المحدد: 0 سجل</span></div>'+
 '<div class="mw-bulk-actions">'+
 '<button type="button" class="mw-button" data-bulk-action="page">تحديد الصفحة</button>'+
 '<button type="button" class="mw-button" data-bulk-action="filtered">تحديد نتائج البحث</button>'+
 '<button type="button" class="mw-button" data-bulk-action="clear">إلغاء التحديد</button>'+
 '<button type="button" class="mw-button main" data-bulk-action="editNotes">تحرير التعليقات</button>'+
 '<button type="button" class="mw-button" data-bulk-action="editAll">تعديل البيانات</button>'+
 '<button type="button" class="mw-button" data-bulk-action="lock">🔒 قفل جماعي</button>'+
 '<button type="button" class="mw-button" data-bulk-action="unlock">🔓 فتح جماعي</button></div>'+
 '<small class="mw-bulk-hint">التحديد يستمر بين صفحات نفس البحث. يمكن تحرير 50 سجلًا أو قفل 200 سجل في العملية الواحدة. لا يُحفظ شيء قبل المعاينة والتأكيد.</small>';
 const before=card.querySelector('.mw-table-wrap')||card.querySelector('.mw-empty')||card.querySelector('.mw-pager');
 card.insertBefore(toolbar,before);
 B.toolbar=toolbar;
 toolbar.addEventListener('click',e=>{
  const button=e.target.closest('[data-bulk-action]');if(!button)return;
  Promise.resolve(action(button.dataset.bulkAction)).catch(err=>signal('تعذر الإجراء الجماعي: '+err.message,true));
 });
 if(table){
  const head=table.querySelector('thead tr');
  if(head){
   const th=document.createElement('th');
   th.className='mw-bulk-check-col';
   th.innerHTML='<label class="mw-bulk-check-label"><input type="checkbox" data-bulk-page-all aria-label="تحديد كل سجلات هذه الصفحة"><span>تحديد</span></label>';
   head.insertBefore(th,head.firstChild);
  }
  const tableRows=[...table.querySelectorAll('tbody tr')];
  tableRows.forEach((tr,i)=>{
   const r=B.visible[i];if(!r)return;
   const td=document.createElement('td');td.className='mw-bulk-check-col';
   const input=document.createElement('input');
   input.type='checkbox';input.dataset.bulkRecord=r.id;
   input.setAttribute('aria-label','تحديد صيانة '+(r.original_equipment||r.maintenance_assets?.asset_name||''));
   td.appendChild(input);tr.insertBefore(td,tr.firstChild);
  });
  table.addEventListener('change',event=>{
   const element=event.target;
   if(element.matches('[data-bulk-page-all]')){togglePage(element.checked);return}
   if(element.matches('[data-bulk-record]')){toggleOne(element.dataset.bulkRecord,element.checked);return}
  });
 }
 counts();
}
function toggleOne(id,checked){
 if(!uuid(id))return;
 if(checked&&B.selected.size>=LIMIT&&!B.selected.has(id)){signal('الحد الأقصى للتحديد '+LIMIT+' سجلًا. استخدم فلاتر أدق.',true);counts();return}
 if(checked)B.selected.add(id);else B.selected.delete(id);
 counts();
}
function togglePage(checked){
 const ids=B.visible.map(r=>r.id).filter(uuid),next=new Set(B.selected);
 for(const id of ids){if(checked)next.add(id);else next.delete(id)}
 if(next.size>LIMIT){signal('تجاوز العدد '+LIMIT+' سجلًا. حدد مجموعة أصغر.',true);counts();return}
 B.selected=next;counts();
}
async function selectFiltered(){
 const params={...B.params,select:'id',order:'id.asc',limit:String(LIMIT+1),offset:'0'};
 const found=await rows(params);
 if(found.length>LIMIT){signal('نتائج البحث تتجاوز '+LIMIT+' سجلًا. حدد المحطة والشهر أو نوع الصيانة لتقليل النتائج.',true);return}
 const ids=found.map(r=>r.id);
 if(ids.some(x=>!uuid(x)))throw Error('معرّف سجل غير صالح');
 B.selected=new Set(ids);counts();
 signal('تم تحديد '+ids.length+' سجل من جميع صفحات نتائج البحث الحالية.');
}
async function loadSelected(detail){
 const ids=[...B.selected];
 if(!ids.length)throw Error('حدد سجلات الصيانة أولًا');
 if(detail&&ids.length>EDIT_LIMIT)throw Error('المحرر الجماعي يستقبل '+EDIT_LIMIT+' سجلًا كحد أقصى. قلل التحديد أو استخدم الفلاتر.');
 const records=[];
 for(let i=0;i<ids.length;i+=READ_CHUNK){
  const batch=ids.slice(i,i+READ_CHUNK);
  const params={select:detail?'id,station_id,is_locked,original_equipment,work_type,frequency,work_date,status,description,notes,cost,spare_parts_cost,workers,hours,materials,spares,maintenance_assets(asset_name,area)':'id,station_id,is_locked',
   station_id:'eq.'+B.stationId,id:'in.('+batch.join(',')+')',limit:String(READ_CHUNK)};
  records.push(...await rows(params));
 }
 if(records.length!==ids.length)throw Error('بعض السجلات غير متاحة أو تغيرت. أعد تحميل قائمة الصيانة.');
 const byId=new Map(records.map(r=>[r.id,r]));
 return ids.map(id=>byId.get(id));
}
function normalValues(r){
 const values={};
 for(const key of FIELDS){
  const raw=r[key];
  if(NUMERIC.has(key)){
   if(raw===null||raw===undefined||raw===''){values[key]=null;continue}
   const num=Number(raw);
   if(!Number.isFinite(num)||num<0||num>(key==='workers'||key==='hours'?100000:1000000000)||
      (key==='workers'&&!Number.isInteger(num)))throw Error('القيمة الرقمية غير صحيحة في '+key);
   values[key]=num;continue;
  }
  if(key==='work_date'){
   const val=raw==null?'':String(raw);
   if(!val){values[key]=null;continue}
   if(!/^20\d{2}-\d{2}-\d{2}$/.test(val)||Number.isNaN(Date.parse(val))||
      new Date(val+'T00:00:00Z').toISOString().slice(0,10)!==val)throw Error('تاريخ تنفيذ غير صالح');
   values[key]=val;continue;
  }
  values[key]=raw==null?'':String(raw);
 }
 if(!['PM','CM','SS'].includes(values.work_type)||!STATUS.includes(values.status))throw Error('نوع العمل أو حالة الصيانة غير صحيح');
 for(const [field,max] of [['frequency',100],['description',3000],['notes',4000],['materials',4000],['spares',4000]]){
  if(values[field].length>max)throw Error('نص '+field+' تجاوز الحد المسموح');
 }
 if(values.status==='DONE WITH COMMENT'&&!values.notes.trim())throw Error('الحالة DONE WITH COMMENT تتطلب تعليقًا');
 return values;
}
function changes(){
 return B.original.map(origin=>{
  const edited=B.working.get(origin.id);
  const expected=normalValues(origin),values=normalValues(edited);
  const fields=FIELDS.filter(k=>JSON.stringify(expected[k])!==JSON.stringify(values[k]));
  return {id:origin.id,origin,expected,values,fields};
 }).filter(item=>item.fields.length);
}
function getEditor(){
 const container=document.getElementById('maintenanceModal');
 if(!container)throw Error('نافذة الصيانة غير متاحة');
 return container;
}
function viewRows(){
 return B.original.map((r,i)=>{
  const value=B.working.get(r.id)||r;
  const info='<div class="mw-bulk-record-heading"><strong>'+h((i+1)+'. '+(r.original_equipment||r.maintenance_assets?.asset_name||'معدة غير مسماة'))+'</strong>'+
   '<span>'+h(r.work_date||'بلا تاريخ')+' · '+h(r.work_type)+' · '+h(r.status)+(r.is_locked?' · 🔒 مقفل':'')+'</span></div>';
  const note='<label class="mw-bulk-textarea-label">COMMENT / NOTES'+
    '<textarea class="mw-input" rows="3" maxlength="4000" data-bulk-record-id="'+h(r.id)+'" data-bulk-field="notes">'+h(value.notes||'')+'</textarea></label>';
  const controls=B.mode==='all'?'<details class="mw-bulk-more"><summary>تفاصيل الصيانة: التاريخ، الحالة، التكرار، التكاليف، الوصف والمواد</summary>'+
    '<div class="mw-bulk-fields">'+
    fieldSelect(r.id,'work_type','نوع الصيانة',value.work_type,OPTIONS.work_type)+
    fieldSelect(r.id,'status','الحالة',value.status,STATUS)+
    fieldText(r.id,'frequency','التكرار',value.frequency,'text')+
    fieldText(r.id,'work_date','تاريخ التنفيذ',value.work_date,'date')+
    fieldText(r.id,'cost','التكلفة الإجمالية',value.cost,'number')+
    fieldText(r.id,'spare_parts_cost','تكلفة قطع الغيار',value.spare_parts_cost,'number')+
    fieldText(r.id,'workers','عدد العمال',value.workers,'number')+
    fieldText(r.id,'hours','ساعات العمل',value.hours,'number')+
    fieldArea(r.id,'description','وصف العمل',value.description)+
    fieldArea(r.id,'materials','المستهلكات',value.materials)+
    fieldArea(r.id,'spares','قطع الغيار',value.spares)+
    '</div></details>':'';
  return '<article class="mw-bulk-record" data-bulk-item="'+h(r.id)+'">'+info+note+controls+'</article>';
 }).join('');
}
function fieldSelect(id,key,label,val,options){
 return '<label>'+h(label)+'<select class="mw-select" data-bulk-record-id="'+h(id)+'" data-bulk-field="'+h(key)+'">'+
  options.map(v=>option(v,val)).join('')+'</select></label>';
}
function fieldText(id,key,label,val,type){
 const numeric=type==='number';
 return '<label>'+h(label)+'<input class="mw-input" type="'+type+'" '+(numeric?'min="0" step="'+(key==='workers'?'1':'any')+'" ':'')+
  'data-bulk-record-id="'+h(id)+'" data-bulk-field="'+h(key)+'" value="'+h(val??'')+'"></label>';
}
function fieldArea(id,key,label,val){
 return '<label class="mw-bulk-wide">'+h(label)+'<textarea class="mw-input" rows="2" data-bulk-record-id="'+h(id)+'" data-bulk-field="'+h(key)+'">'+h(val||'')+'</textarea></label>';
}
function editorHtml(){
 return '<div class="mw-bulk-dialog" role="dialog" aria-modal="true" aria-label="محرر الصيانة الجماعي">'+
  '<header class="mw-bulk-head"><div><h3>محرر الصيانة الجماعي</h3><small>المحطة: '+h(B.stationId)+' · '+B.original.length+' سجلًا · الحفظ للإدارة فقط</small></div>'+
  '<button class="mw-button" data-bulk-editor-action="close" type="button">✕ إغلاق</button></header>'+
  '<div class="mw-bulk-mode"><button class="mw-button '+(B.mode==='notes'?'main':'')+'" type="button" data-bulk-editor-action="notes">تحرير التعليقات فقط</button>'+
  '<button class="mw-button '+(B.mode==='all'?'main':'')+'" type="button" data-bulk-editor-action="all">التعديل التفصيلي</button>'+
  '<span data-bulk-dirty>بدون تغييرات</span></div>'+
  '<div class="mw-bulk-scroll">'+
  '<section class="mw-bulk-tools"><div class="mw-bulk-tool"><strong>تطبيق تعليق مشترك</strong>'+
  '<textarea id="mw-bulk-shared-note" rows="2" maxlength="4000" placeholder="اكتب تعليقًا جديدًا..."></textarea>'+
  '<div class="mw-bulk-line"><button class="mw-button" type="button" data-bulk-editor-action="replaceNotes">استبدال جميع التعليقات</button>'+
  '<button class="mw-button" type="button" data-bulk-editor-action="appendNotes">إضافة لنهاية جميع التعليقات</button></div></div>'+
  '<div class="mw-bulk-tool"><strong>بحث واستبدال داخل التعليقات</strong>'+
  '<input id="mw-bulk-find" class="mw-input" placeholder="النص القديم" maxlength="4000">'+
  '<input id="mw-bulk-replace" class="mw-input" placeholder="النص الجديد (قد يكون فارغًا)" maxlength="4000">'+
  '<button class="mw-button" type="button" data-bulk-editor-action="findReplace">استبدال العبارة داخل التعليقات</button></div>'+
  '<div class="mw-bulk-tool"><strong>تطبيق قيمة على حقل موحد</strong>'+
  '<select id="mw-bulk-common-field" class="mw-select">'+
  [['status','الحالة'],['work_type','نوع الصيانة'],['frequency','التكرار']].map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join('')+'</select>'+
  '<select id="mw-bulk-common-value" class="mw-select">'+STATUS.map(v=>option(v,STATUS[0])).join('')+'</select>'+
  '<button class="mw-button" type="button" data-bulk-editor-action="applyField">تطبيق على المحدد</button></div>'+
  '<div class="mw-bulk-tool"><strong>لصق تعليقات متعددة من Excel</strong>'+
  '<textarea id="mw-bulk-multi-paste" rows="3" placeholder="كل سطر يُكتب في تعليق سجل واحد، حسب ترتيب السجلات أدناه"></textarea>'+
  '<small>يجب أن يتطابق عدد الأسطر مع عدد السجلات المفتوحة، مع الحفاظ على الأسطر الفارغة للتعليقات المطلوب مسحها.</small>'+
  '<button class="mw-button" type="button" data-bulk-editor-action="pasteLines">توزيع التعليقات على السجلات</button></div></section>'+
  '<section class="mw-bulk-records">'+viewRows()+'</section>'+
  '<div id="mw-bulk-preview" class="mw-bulk-preview" hidden></div></div>'+
  '<footer class="mw-bulk-footer"><label>سبب التعديل (إلزامي للتوثيق)'+
  '<input class="mw-input" id="mw-bulk-reason" maxlength="700" placeholder="مثال: مراجعة تعليقات الصيانة الشهرية"></label>'+
  '<div id="mw-bulk-feedback" role="status" aria-live="polite"></div>'+
  '<div class="mw-bulk-line"><button type="button" class="mw-button" data-bulk-editor-action="preview">معاينة التعديلات</button>'+
  '<button type="button" class="mw-button main" data-bulk-editor-action="save" disabled>حفظ التغييرات بعد المعاينة</button></div></footer></div>';
}
function errorInEditor(msg){
 const box=B.overlay?.querySelector('#mw-bulk-feedback');
 if(box){box.textContent=msg;box.classList.add('mw-bulk-error');}
}
function clearEditorError(){
 const box=B.overlay?.querySelector('#mw-bulk-feedback');
 if(box){box.textContent='';box.classList.remove('mw-bulk-error');}
}
function changedCount(){
 try{return changes().length}catch{return -1}
}
function editorCount(){
 const count=changedCount(),text=B.overlay?.querySelector('[data-bulk-dirty]');
 if(text)text.textContent=count<0?'راجع القيم المدخلة':count+' سجلًا به تغييرات من أصل '+B.original.length;
}
function invalidatePreview(){
 B.preview=false;
 const box=B.overlay?.querySelector('#mw-bulk-preview');if(box){box.hidden=true;box.innerHTML=''}
 const save=B.overlay?.querySelector('[data-bulk-editor-action="save"]');if(save)save.disabled=true;
 editorCount();clearEditorError();
}
function renderEditor(){
 if(!B.overlay)return;
 const reason=B.overlay.querySelector('#mw-bulk-reason')?.value||'';
 B.overlay.innerHTML=editorHtml();
 B.overlay.querySelector('#mw-bulk-reason').value=reason;
 editorCount();
}
function closeEditor(){
 if(B.busy)return;
 B.overlay?.remove();B.overlay=null;B.original=[];B.working.clear();B.preview=false;
}
async function openEditor(mode){
 if(!isAdmin())throw Error('التعديل الجماعي متاح للإدارة فقط');
 const originals=await loadSelected(true);
 B.original=originals;B.working=new Map(originals.map(r=>[r.id,{...r}]));
 B.mode=mode;B.preview=false;
 const overlay=document.createElement('div');
 overlay.className='mw-bulk-overlay';overlay.setAttribute('data-maintenance-bulk-overlay','');
 B.overlay=overlay;renderEditor();
 overlay.addEventListener('input',e=>editorInput(e.target));
 overlay.addEventListener('change',e=>editorInput(e.target));
 overlay.addEventListener('click',e=>{
  const btn=e.target.closest('[data-bulk-editor-action]');if(!btn)return;
  Promise.resolve(editorAction(btn.dataset.bulkEditorAction)).catch(err=>errorInEditor(err.message));
 });
 getEditor().appendChild(overlay);
 B.overlay.querySelector('[data-bulk-editor-action="close"]').focus();
}
function editorInput(target){
 if(!target||!target.dataset)return;
 if(target.id==='mw-bulk-common-field'){
  const values=OPTIONS[target.value]||[];
  const node=B.overlay.querySelector('#mw-bulk-common-value');
  node.innerHTML=values.map(v=>option(v,values[0])).join('');
  return;
 }
 const id=target.dataset.bulkRecordId,key=target.dataset.bulkField;
 if(!id||!FIELDS.includes(key)||!B.working.has(id))return;
 B.working.get(id)[key]=target.value;
 invalidatePreview();
}
function applyToAll(callback){
 for(const r of B.original){
  const value=B.working.get(r.id);
  const updated=callback(value);
  if(typeof updated==='string'&&updated.length>4000)throw Error('التعليق الجديد تجاوز 4000 حرف في أحد السجلات');
  if(typeof updated==='string')value.notes=updated;
 }
 invalidatePreview();renderEditor();
}
function previewMarkup(items){
 return '<h4>مراجعة ما سيتغير قبل الحفظ — '+items.length+' سجلًا</h4>'+
 '<p>ستُعدّل الحقول الموضحة أدناه فقط، وسيُحفظ سجل تدقيق مستقل لكل صيانة. إذا تغيرت البيانات في النظام أثناء التحرير فستُرفض العملية بالكامل.</p>'+
 '<div class="mw-bulk-preview-list">'+items.map(x=>{
  const heading=x.origin.original_equipment||x.origin.maintenance_assets?.asset_name||x.id;
  const rows=x.fields.map(f=>'<div class="mw-bulk-difference"><strong>'+h(f)+'</strong>'+
   '<span>قبل: '+h(x.expected[f]??'—')+'</span><span>بعد: '+h(x.values[f]??'—')+'</span></div>').join('');
  return '<div class="mw-bulk-preview-item"><b>'+h(heading)+'</b>'+rows+'</div>';
 }).join('')+'</div>';
}
async function editorAction(action){
 if(B.busy)return;
 if(action==='close'){closeEditor();return}
 if(action==='notes'||action==='all'){B.mode=action;invalidatePreview();renderEditor();return}
 if(action==='replaceNotes'||action==='appendNotes'){
  const text=B.overlay.querySelector('#mw-bulk-shared-note').value;
  if(!text&&action==='appendNotes')throw Error('اكتب التعليق المطلوب إضافته');
  if(!window.confirm(action==='replaceNotes'?'سيتم استبدال التعليقات الحالية للسجلات المفتوحة. يمكنك مراجعة التغييرات قبل الحفظ.':'سيتم إضافة النص إلى التعليقات الحالية. يمكنك المراجعة قبل الحفظ.'))return;
  applyToAll(r=>action==='replaceNotes'?text:(r.notes?String(r.notes).trimEnd()+'\n':'')+text);
  return;
 }
 if(action==='findReplace'){
  const search=B.overlay.querySelector('#mw-bulk-find').value;
  const replacement=B.overlay.querySelector('#mw-bulk-replace').value;
  if(!search)throw Error('أدخل النص المطلوب البحث عنه');
  let affected=0;for(const row of B.working.values())if(String(row.notes||'').includes(search))affected++;
  if(!affected)throw Error('العبارة غير موجودة في التعليقات المحددة');
  if(!window.confirm('سيُستبدل النص في '+affected+' تعليقًا. المتابعة؟'))return;
  applyToAll(r=>String(r.notes||'').split(search).join(replacement));return;
 }
 if(action==='pasteLines'){
  const pasted=String(B.overlay.querySelector('#mw-bulk-multi-paste').value||'').replace(/\r\n?/g,'\n');
  if(!pasted)throw Error('ألصق التعليقات المطلوبة أولًا');
  const lines=pasted.split('\n');
  if(lines.length!==B.original.length)throw Error('عدد الأسطر '+lines.length+' لا يطابق عدد السجلات '+B.original.length+'؛ لم يتغير أي تعليق.');
  if(!window.confirm('توزيع '+lines.length+' تعليقًا على السجلات المعروضة حسب ترتيبها؟ ستتمكن من معاينتها قبل الحفظ.'))return;
  let cursor=0;
  applyToAll(()=>lines[cursor++]);
  return;
 }
 if(action==='applyField'){
  const field=B.overlay.querySelector('#mw-bulk-common-field').value;
  const value=B.overlay.querySelector('#mw-bulk-common-value').value;
  if(!OPTIONS[field]?.includes(value))throw Error('حقل أو قيمة غير صالحة');
  if(!window.confirm('تطبيق '+value+' على '+B.original.length+' سجلًا؟'))return;
  for(const row of B.working.values())row[field]=value;
  invalidatePreview();renderEditor();return;
 }
 if(action==='preview'){
  const items=changes();
  if(!items.length)throw Error('لا توجد أي تعديلات للحفظ');
  const pane=B.overlay.querySelector('#mw-bulk-preview');
  pane.innerHTML=previewMarkup(items);pane.hidden=false;B.preview=true;
  B.overlay.querySelector('[data-bulk-editor-action="save"]').disabled=false;
  pane.scrollIntoView({block:'nearest',behavior:'smooth'});return;
 }
 if(action==='save'){
  if(!B.preview)throw Error('راجع معاينة التعديلات قبل الحفظ');
  const items=changes(),reason=String(B.overlay.querySelector('#mw-bulk-reason').value||'').trim();
  if(!items.length)throw Error('لا توجد تعديلات للحفظ');
  if(reason.length<5||reason.length>700)throw Error('أدخل سبب التعديل، من 5 إلى 700 حرف');
  if(!window.confirm('حفظ تعديلات '+items.length+' سجلًا في قاعدة البيانات؟ العملية موثقة ولا يمكن حفظ جزء منها.'))return;
  B.busy=true;
  const btn=B.overlay.querySelector('[data-bulk-editor-action="save"]');btn.disabled=true;btn.textContent='جارٍ الحفظ...';
  try{
   const result=await api('/rest/v1/rpc/maintenance_bulk_edit_records',{
    method:'POST',body:JSON.stringify({p_items:items.map(x=>({id:x.id,expected:x.expected,values:x.values})),p_reason:reason})
   });
   if(!result||result.updated!==true||result.changed!==items.length)throw Error('لم يصل تأكيد كامل الحفظ من قاعدة البيانات');
   B.busy=false;B.selected.clear();closeEditor();
   if(B.refresh)await B.refresh();
   signal('تم حفظ '+items.length+' سجل صيانة مع سجل تدقيق لكل تعديل.');
  }catch(err){B.busy=false;btn.textContent='حفظ التغييرات بعد المعاينة';invalidatePreview();throw err}
 }
}
async function bulkLock(locked){
 if(!isAdmin())throw Error('هذه العملية للأدمن والسوبر أدمن فقط');
 const records=await loadSelected(false),changing=records.filter(r=>!!r.is_locked!==locked);
 if(!changing.length){signal('جميع السجلات المحددة في الحالة المطلوبة بالفعل.');return}
 const reason=window.prompt('اكتب سبب '+(locked?'قفل':'فتح')+' '+changing.length+' سجلًا (5 أحرف على الأقل):',
  locked?'اعتماد ومراجعة سجلات الصيانة جماعيًا':'إعادة فتح سجلات الصيانة جماعيًا');
 if(reason===null)return;
 if(reason.trim().length<5||reason.length>700)throw Error('سبب العملية يجب أن يتكون من 5 إلى 700 حرف');
 if(!window.confirm((locked?'قفل':'فتح')+' '+changing.length+' سجلًا؟ السجلات الموجودة في الحالة المطلوبة ستبقى كما هي.'))return;
 const result=await api('/rest/v1/rpc/maintenance_bulk_set_lock',{
  method:'POST',body:JSON.stringify({
   p_items:changing.map(r=>({id:r.id,expected_locked:!!r.is_locked})),
   p_locked:locked,p_reason:reason.trim()
  })
 });
 if(!result||result.updated!==true||result.changed!==changing.length)throw Error('لم يصل تأكيد القفل أو الفتح من قاعدة البيانات');
 B.selected.clear();
 if(B.refresh)await B.refresh();
 signal('تم '+(locked?'قفل ':'فتح ')+changing.length+' سجلًا مع توثيق العملية.');
}
async function action(name){
 if(!isAdmin())throw Error('هذه الإجراءات للأدمن والسوبر أدمن فقط');
 if(name==='page'){togglePage(true);return}
 if(name==='filtered'){await selectFiltered();return}
 if(name==='clear'){B.selected.clear();counts();return}
 if(!B.selected.size)throw Error('حدد السجلات المطلوبة أولًا');
 if(name==='editNotes'||name==='editAll'){await openEditor(name==='editNotes'?'notes':'all');return}
 if(name==='lock'||name==='unlock'){await bulkLock(name==='lock');return}
}
window.addEventListener('keydown',event=>{
 if(B.overlay&&event.key==='Escape'){
  event.preventDefault();event.stopImmediatePropagation();closeEditor();
 }
},true);
window.WSMaintenanceBulk=Object.freeze({enhance});
})();