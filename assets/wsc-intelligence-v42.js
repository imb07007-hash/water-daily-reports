/* Water Solutions V4.2 — in-page intelligence and navigation tools.
 * All searches are authenticated and restricted by existing database RLS.
 * No report data is written or cached locally. No new pages or brand asset changes.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const host=()=>window.WSMaintenanceHost;
 const report=()=>window.WSPlatformHost?.reportReadOnly?.();
 const accessible=()=>document.body.dataset.auth==='ready'&&!!host()?.signedIn?.();
 const routeAllowed=route=>window.WSShellUI?.paths?.includes(route);
 const state={uid:'',favorites:[],recents:[],seq:0,searchTimer:0,priorSeq:0,priorKey:'',prior:null,priorError:'',reviewTimer:0,booted:false};
 const escapeAttr=escapeHtml;
 const arabicNum=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n):'—';
 const safeNumber=v=>{
  if(v===null||v===undefined||String(v).trim()==='')return null;
  const text=String(v).replaceAll(',','').trim();
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return null;
  const x=Number(text);
  return Number.isFinite(x)?x:null;
 };
 const key=()=>host()?.userId?.()?('ws-v42-preferences:'+host().userId()):'';
 function validFav(item){
  if(!item||!['route','station','asset'].includes(item.kind)||typeof item.id!=='string'||item.id.length>160)return false;
  if(item.kind==='route')return routeAllowed(item.id);
  return (host()?.stations?.()||[]).some(s=>s.id===item.stationId||s.id===item.id);
 }
 function loadPrefs(){
  const current=key();if(!current)return;
  if(state.uid===current)return;
  state.uid=current;
  try{
   const saved=JSON.parse(localStorage.getItem(current)||'{}');
   state.favorites=(Array.isArray(saved.favorites)?saved.favorites:[]).filter(validFav).slice(0,8);
   state.recents=(Array.isArray(saved.recents)?saved.recents:[]).filter(x=>typeof x==='string'&&routeAllowed(x)).slice(0,8);
  }catch{state.favorites=[];state.recents=[]}
 }
 function persist(){
  if(!state.uid)return;
  try{localStorage.setItem(state.uid,JSON.stringify({favorites:state.favorites.slice(0,8),recents:state.recents.slice(0,8)}))}catch{}
 }
 function same(a,b){return a.kind===b.kind&&a.id===b.id}
 function isFavorite(item){return state.favorites.some(x=>same(x,item))}
 function toggleFavorite(item){
  if(!validFav(item))return;
  loadPrefs();
  if(isFavorite(item))state.favorites=state.favorites.filter(x=>!same(x,item));
  else state.favorites=[item,...state.favorites].slice(0,8);
  persist();paintPin();renderQuickPanel();
  const input=$('wsV3CommandInput');if(input&&$('wsV3Command')?.classList.contains('open'))search(input.value);
 }
 function label(route){
  const names={
   home:'الرئيسية',reports:'التقرير اليومي',dashboard:'الداشبورد التشغيلية',
   'archive/daily':'أرشيف التقارير اليومية','archive/monthly':'الأرشيف الشهري',
   'archive/yearly':'الأرشيف السنوي','chemicals/overview':'مخزون الكيماويات',
   'chemicals/entry':'تسجيل قراءة مخزون','maintenance/overview':'لوحة الصيانة',
   'maintenance/daily':'إدخال صيانة','maintenance/assets':'المعدات والأصول',
   'maintenance/records':'سجلات الصيانة','maintenance/planned':'الجدول والدوريات',
   'maintenance/monthly':'التقرير الشهري للصيانة','maintenance/import':'استيراد Excel',
   'admin/stations':'إدارة المحطات','admin/accounts':'إدارة الحسابات',
   'admin/audit':'سجل النشاط','admin/data':'إدارة البيانات'
  };
  return names[route]||route;
 }
 function currentRoute(){
  const h=location.hash.match(/^#ws\/([a-z0-9/-]+)$/);
  return h&&routeAllowed(h[1])?h[1]:'home';
 }
 function addPin(){
  if($('wsV42Pin'))return;
  const top=document.querySelector('.ws-v3-top-actions');
  if(!top)return;
  const button=document.createElement('button');
  button.id='wsV42Pin';button.type='button';button.className='ws-v3-icon-button ws-v42-pin';
  button.setAttribute('aria-label','تثبيت القسم في المفضلة');button.title='تثبيت القسم الحالي';
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6 6.6 1-4.8 4.7 1.1 6.5-5.9-3.1-5.9 3.1 1.1-6.5L2.4 9 9 8Z"/></svg>';
  const search=document.querySelector('.ws-v3-top-search');
  top.insertBefore(button,search||top.firstChild);
  button.addEventListener('click',()=>{
   const r=currentRoute();toggleFavorite({kind:'route',id:r});
  });
  paintPin();
 }
 function paintPin(){
  const node=$('wsV42Pin');
  if(!node)return;
  const marked=isFavorite({kind:'route',id:currentRoute()});
  node.dataset.pinned=String(marked);node.setAttribute('aria-pressed',String(marked));
  node.setAttribute('aria-label',marked?'إزالة القسم من المفضلة':'تثبيت القسم في المفضلة');
  node.title=marked?'إزالة من المفضلة':'تثبيت القسم الحالي';
 }
 function recordVisit(route){
  if(!accessible()||!routeAllowed(route))return;
  loadPrefs();
  state.recents=[route,...state.recents.filter(x=>x!==route)].slice(0,8);
  persist();paintPin();
  if(route==='home')renderQuickPanel();
 }
 function itemTitle(item){
  if(item.kind==='route')return label(item.id);
  return item.label||item.id;
 }
 function quickButton(item,kind){
  return '<div class="ws-v42-quick-entry">'+
   '<button type="button" class="ws-v42-quick-open" data-ws42-go="'+escapeAttr(item.kind)+'" data-ws42-id="'+escapeAttr(item.id)+'" data-ws42-station="'+escapeAttr(item.stationId||item.id)+'" data-ws42-label="'+escapeAttr(itemTitle(item))+'">'+
   '<span>'+escapeHtml(itemTitle(item))+'</span><small>'+(item.kind==='asset'?'معدة':item.kind==='station'?'محطة':'قسم')+'</small></button>'+
   (kind==='fav'?'<button type="button" class="ws-v42-favorite-remove" title="إلغاء التثبيت" aria-label="إزالة من المفضلة" data-ws42-unpin="'+escapeAttr(item.kind)+'" data-ws42-id="'+escapeAttr(item.id)+'">×</button>':'')+'</div>';
 }
 function renderQuickPanel(){
  if(!accessible())return;
  const root=$('wsV3Home');if(!root||document.body.dataset.wsPage!=='home')return;
  loadPrefs();
  let panel=$('wsV42QuickPanel');
  if(!panel){panel=document.createElement('section');panel.id='wsV42QuickPanel';panel.className='ws-v42-quick-panel';
   root.querySelector('.ws-v3-hero')?.insertAdjacentElement('afterend',panel);}
  const favorites=state.favorites.filter(validFav);
  const recent=state.recents.filter(routeAllowed).slice(0,5);
  panel.innerHTML='<div class="ws-v42-hub-group"><div class="ws-v42-hub-head"><strong>المفضلة</strong><small>ثبّت الأقسام من النجمة أعلى الموقع</small></div>'+
   '<div class="ws-v42-hub-list">'+(favorites.length?favorites.map(x=>quickButton(x,'fav')).join(''):
   '<span class="ws-v42-empty">لا توجد عناصر مثبتة بعد.</span>')+'</div></div>'+
   '<div class="ws-v42-hub-group"><div class="ws-v42-hub-head"><strong>آخر الأقسام</strong><small>رجوع سريع لما فتحته سابقًا</small></div>'+
   '<div class="ws-v42-hub-list">'+(recent.length?recent.map(r=>quickButton({kind:'route',id:r},'recent')).join(''):
   '<span class="ws-v42-empty">ستظهر الأقسام المستخدمة هنا.</span>')+'</div></div>';
 }
 function closeCommand(){
  const modal=$('wsV3Command');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
 }
 function openArchive(stationId,date){
  if(!accessible()||!(host()?.stations?.()||[]).some(s=>s.id===stationId))return;
  window.WSShellUI?.navigate('archive/daily');
  const select=$('archiveStation');
  if(select&&!select.disabled&&[...select.options].some(o=>o.value===stationId))select.value=stationId;
  if(/^\d{4}-\d{2}-\d{2}$/.test(date||'')){
   if($('archiveFrom'))$('archiveFrom').value=date;
   if($('archiveTo'))$('archiveTo').value=date;
  }
  $('archiveSearch')?.click();closeCommand();
 }
 function openAsset(item){
  if(!accessible()||!(host()?.stations?.()||[]).some(s=>s.id===item.stationId))return;
  window.WSShellUI?.navigate('maintenance/assets');
  const select=$('mw-station');
  if(select&&[...select.options].some(o=>o.value===item.stationId)){
   select.value=item.stationId;
   select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  let tries=0;
  const locate=()=>{
   if(document.body.dataset.wsPage!=='workspace')return;
   const field=$('mw-search-input');
   if(!field&&tries++<14){setTimeout(locate,160);return}
   if(!field)return;
   const registered=document.querySelector('#maintenanceBody [data-mw="viewRegistered"]');
   if(registered){registered.click();setTimeout(locate,180);return}
   field.value=(item.label||'').slice(0,65);
   const form=$('mw-search-form');
   if(form)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  };
  setTimeout(locate,180);closeCommand();
 }
 function goItem(item){
  if(!accessible())return;
  if(item.kind==='route'&&routeAllowed(item.id))window.WSShellUI?.navigate(item.id);
  else if(item.kind==='station')openArchive(item.id,'');
  else if(item.kind==='asset')openAsset(item);
  closeCommand();
 }
 function sourceLabel(r){
  if(r.source==='migration'&&String(r.imported_from||'').startsWith('google_drive_xlsx:'))return 'ملف Excel · وقت الإدخال';
  if(r.source==='migration')return r.source_sent_at?'واتساب · وقت الرسالة متاح':'واتساب · وقت الرسالة غير متاح';
  return 'تقرير أُدخل بالموقع';
 }
 function renderSearchItems(rows,msg){
  const node=$('wsV42DataResults');if(!node)return;
  node.innerHTML='<div class="ws-v42-search-title">نتائج البحث في البيانات</div>'+
   (rows.length?rows.map(row=>{
    const item=row.item;
    return '<div class="ws-v42-search-item"><button type="button" class="ws-v42-result-link" data-ws42-go="'+escapeAttr(item.kind)+
     '" data-ws42-id="'+escapeAttr(item.id)+'" data-ws42-station="'+escapeAttr(item.stationId||item.id)+
     '" data-ws42-label="'+escapeAttr(item.label||row.title)+'" data-ws42-date="'+escapeAttr(item.date||'')+'">'+
     '<strong>'+escapeHtml(row.title)+'</strong><small>'+escapeHtml(row.meta||'')+'</small></button>'+
     '<button type="button" class="ws-v42-search-star" data-ws42-toggle="'+escapeAttr(item.kind)+'" data-ws42-id="'+escapeAttr(item.id)+
     '" data-ws42-label="'+escapeAttr(item.label||row.title)+'" data-ws42-station="'+escapeAttr(item.stationId||item.id)+'" title="حفظ في المفضلة" aria-label="تثبيت في المفضلة">'+
     (isFavorite(item)?'★':'☆')+'</button></div>';
   }).join(''):'<div class="ws-v42-search-note">'+escapeHtml(msg||'لا توجد نتائج مطابقة.')+'</div>');
 }
 function search(query){
  if(!accessible())return;
  let root=$('wsV42DataResults');
  if(!root){
   const list=$('wsV3CommandList');if(!list)return;
   root=document.createElement('section');root.id='wsV42DataResults';root.className='ws-v42-command-extra';
   list.insertAdjacentElement('afterend',root);
  }
  const value=String(query||'').trim().slice(0,90);
  const seq=++state.seq;
  clearTimeout(state.searchTimer);
  if(value.length<2){root.innerHTML='<div class="ws-v42-search-note">للبحث عن المحطات أو المعدات أو تاريخ التقرير، اكتب حرفين على الأقل.</div>';return}
  const allowed=(host()?.stations?.()||[]);
  const names=allowed.filter(s=>String(s.name||'').toLocaleLowerCase('ar').includes(value.toLocaleLowerCase('ar'))).slice(0,7);
  renderSearchItems(names.map(s=>({title:s.name,meta:'محطة · فتح أرشيف تقاريرها',item:{kind:'station',id:s.id,stationId:s.id,label:s.name}})),
    'جارٍ البحث في السجلات المتاحة لحسابك…');
  if(value.length<3)return;
  state.searchTimer=setTimeout(()=>void asyncSearch(value,seq,names),270);
 }
 async function searchTable(table,params){
  const res=await host().authedFetch('/rest/v1/'+table+'?'+new URLSearchParams(params));
  if(!res.ok)throw Error('تعذر قراءة '+table);
  const json=await res.json();return Array.isArray(json)?json:[];
 }
 async function asyncSearch(value,seq,names){
  const rows=names.map(s=>({title:s.name,meta:'محطة · التقارير المحفوظة',item:{kind:'station',id:s.id,stationId:s.id,label:s.name}}));
  const clean=value.replace(/[^\p{L}\p{N} \-]/gu,' ').trim().slice(0,60);
  const day=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
  const month=/^\d{4}-\d{2}$/.test(value)?value:null;
  const all=host()?.stations?.()||[],allowedIds=new Set(all.map(s=>s.id));
  const tasks=[];
  if(clean.length>=3){
   tasks.push(searchTable('maintenance_assets',{
    select:'id,station_id,asset_name,area',asset_name:'ilike.*'+clean+'*',limit:'8'
   }).then(assets=>{
    for(const a of assets){
     if(!allowedIds.has(a.station_id))continue;
     rows.push({title:a.asset_name,meta:'معدة · '+(a.area||'منطقة غير محددة')+' · '+(all.find(s=>s.id===a.station_id)?.name||''),
      item:{kind:'asset',id:a.id,stationId:a.station_id,label:a.asset_name}});
    }
   }).catch(()=>{}));
  }
  const reportFilters={select:'id,station_id,report_date,source,source_sent_at,created_at,imported_from',
   order:'report_date.desc,created_at.desc',limit:'10'};
  if(day)reportFilters.report_date='eq.'+day;
  else if(month){
   reportFilters.report_date='gte.'+month+'-01';
   // PostgREST range filter paired with "and" to avoid the same key occurring twice.
   const year=Number(month.slice(0,4)),mo=Number(month.slice(5,7));
   const end=new Date(Date.UTC(year,mo,1)).toISOString().slice(0,10);
   reportFilters.and='(report_date.gte.'+month+'-01,report_date.lt.'+end+')';
   delete reportFilters.report_date;
  }else if(names.length){
   reportFilters.station_id='in.('+names.map(s=>s.id).join(',')+')';
  }
  if(day||month||names.length){
   tasks.push(searchTable('reports',reportFilters).then(reports=>{
    for(const r of reports){
     if(!allowedIds.has(r.station_id))continue;
     rows.push({title:(all.find(s=>s.id===r.station_id)?.name||r.station_id)+' — '+r.report_date,
      meta:'تقرير · '+sourceLabel(r),
      item:{kind:'report',id:r.id,stationId:r.station_id,date:r.report_date,label:'تقرير '+r.report_date}});
    }
   }).catch(()=>{}));
  }
  await Promise.all(tasks);
  if(seq!==state.seq||!accessible())return;
  // Supported persisted favorites are routes, stations, and equipment only.
  renderSearchItems(rows.slice(0,20),rows.length?'':'لا توجد نتائج متاحة؛ جرّب اسم معدة أو تاريخًا محددًا.');
 }
 function goResult(kind,id,stationId,label,date){
  if(kind==='report'){openArchive(stationId,date);return}
  goItem({kind,id,stationId,label});
 }
 function handleAction(event){
  const pin=event.target.closest('#wsV42Pin');
  if(pin)return;
  const toggle=event.target.closest('[data-ws42-toggle]');
  if(toggle){
   const x=toggle.dataset;
   toggleFavorite({kind:x.ws42Toggle,id:x.ws42Id,stationId:x.ws42Station,label:x.ws42Label});
   return;
  }
  const remove=event.target.closest('[data-ws42-unpin]');
  if(remove){
   const x=remove.dataset;
   toggleFavorite({kind:x.ws42Unpin,id:x.ws42Id});return;
  }
  const go=event.target.closest('[data-ws42-go]');
  if(go){
   event.preventDefault();const x=go.dataset;
   goResult(x.ws42Go,x.ws42Id,x.ws42Station,x.ws42Label,x.ws42Date);
  }
 }
 function ensureReview(){
  if(!accessible())return null;
  let container=$('wsV42ReportReview');
  const fields=$('reportInputFields');if(!fields)return null;
  if(!container){
   container=document.createElement('section');
   container.id='wsV42ReportReview';container.className='ws-v42-report-review';
   container.setAttribute('aria-label','مقارنة التقرير والتحقق من البيانات');
   fields.insertAdjacentElement('beforebegin',container);
  }
  return container;
 }
 function onReportRendered(){
  clearTimeout(state.reviewTimer);
  state.reviewTimer=setTimeout(()=>void updateReportReview(),180);
 }
 function metricDetails(ctx,prev){
  const old=prev?.data?.metrics||{};
  const changes=[],warnings=[],missing=[];
  for(const m of ctx.metrics||[]){
   const now=m.value,before=old[m.id];
   if(m.required&&String(now??'').trim()==='')missing.push(m.label);
   const a=safeNumber(now),b=safeNumber(before);
   if(a===null||b===null)continue;
   const diff=a-b;
   if(!Number.isFinite(diff))continue;
   if(b!==0&&Math.abs(diff)/Math.abs(b)>=2.5&&Math.abs(diff)>=10){
    warnings.push('تغير كبير في '+m.label+' مقارنة بالتقرير السابق؛ تأكد من القراءة.');
   }
   changes.push({label:m.label,unit:m.unit,before:b,now:a,diff});
  }
  return {changes:changes.slice(0,8),warnings:warnings.slice(0,4),missing:missing.slice(0,5)};
 }
 function drawReview(ctx){
  const node=ensureReview();if(!node||!ctx)return;
  const errors=ctx.validation||[];
  const prior=state.priorKey===ctx.stationId+'@'+ctx.date?state.prior:null;
  const details=metricDetails(ctx,prior);
  const hasContext=state.priorKey===ctx.stationId+'@'+ctx.date;
  const source=prior?sourceLabel(prior):'';
  const status=ctx.loading?'جارٍ التحقق من التقرير الحالي…':
   ctx.lookupError?'تعذر التأكد من التقرير الحالي.':
   ctx.locked?'تقرير محفوظ — مراجعة للقراءة فقط':
   errors.length?'تحتاج بعض الحقول إلى تصحيح':
   details.warnings.length?'توجد فروقات كبيرة تستحق المراجعة':
   'الحقول الأساسية التي تم إدخالها لا تحتوي الأخطاء المعروفة.';
  const rows=prior?details.changes.map(m=>{
   const direction=m.diff>0?'↑':m.diff<0?'↓':'=';
   return '<tr><td>'+escapeHtml(m.label)+'</td><td dir="ltr">'+arabicNum(m.before)+'</td><td dir="ltr">'+arabicNum(m.now)+'</td>'+
    '<td dir="ltr" class="'+(m.diff===0?'stable':'changed')+'">'+direction+' '+arabicNum(Math.abs(m.diff))+' '+escapeHtml(m.unit)+'</td></tr>';
  }).join(''):'';
  node.innerHTML='<div class="ws-v42-report-review-head"><div><span class="ws-v42-eyebrow">مراجعة التقرير قبل الإرسال</span>'+
   '<h3>المقارنة والتحقق من القراءات</h3><small>'+escapeHtml(status)+'</small></div>'+
   '<button type="button" data-ws42-recheck>إعادة الفحص</button></div>'+
   '<div class="ws-v42-checks">'+
   '<span class="ws-v42-check '+(errors.length?'error':'ok')+'">'+(errors.length?'✕':'✓')+' '+errors.length+' ملاحظات تحقق أساسية</span>'+
   '<span class="ws-v42-check '+(details.warnings.length?'warn':'ok')+'">'+details.warnings.length+' فروقات كبيرة</span></div>'+
   (errors.length?'<div class="ws-v42-alert error">'+errors.map(escapeHtml).slice(0,5).join(' · ')+'</div>':'')+
   (details.warnings.length?'<div class="ws-v42-alert warning">'+details.warnings.map(escapeHtml).join(' · ')+'</div>':'')+
   '<div class="ws-v42-comparison-head"><strong>مقارنة بآخر تقرير سابق متاح للمحطة</strong>'+
   '<small>'+(prior?'تاريخ التقرير السابق: '+escapeHtml(prior.report_date)+' · '+escapeHtml(source):
   hasContext?(state.priorError?escapeHtml(state.priorError):'لا يوجد تقرير سابق متاح للمقارنة.'):'جارٍ تحميل المقارنة…')+
   '</small></div>'+
   (rows?'<div class="ws-v42-table-wrap"><table><thead><tr><th>المؤشر</th><th>السابق</th><th>الحالي</th><th>الفرق</th></tr></thead>'+
   '<tbody>'+rows+'</tbody></table></div>':'<p class="ws-v42-comparison-empty">'+
    (prior?'لا توجد قراءات رقمية مشتركة للمقارنة.':'لن يُفترض أن البيانات الناقصة تساوي صفرًا.')+'</p>')+
   '<p class="ws-v42-review-foot">الفروقات تنبيه للمراجعة فقط، ولا تغيّر البيانات أو تمنع إرسال تقرير صحيح. ويبقى التحقق الأساسي والصلاحيات المعتمدة كما هي.</p>';
 }
 async function updateReportReview(force=false){
  if(!accessible())return;
  const ctx=report();if(!ctx)return;
  const k=ctx.stationId+'@'+ctx.date;
  if(force||k!==state.priorKey){
   state.priorKey=k;state.prior=null;state.priorError='';
   const seq=++state.priorSeq;
   drawReview(ctx);
   if(!ctx.loading&&/^\d{4}-\d{2}-\d{2}$/.test(ctx.date)){
    try{
     const res=await searchTable('reports',{
      select:'id,report_date,station_id,data,source,source_sent_at,created_at,imported_from',
      station_id:'eq.'+ctx.stationId,report_date:'lt.'+ctx.date,order:'report_date.desc,created_at.desc',limit:'1'
     });
     if(seq!==state.priorSeq||state.priorKey!==k)return;
     state.prior=res[0]||null;
    }catch{
     if(seq!==state.priorSeq)return;
     state.priorError='تعذرت قراءة التقرير السابق؛ لا تؤثر المقارنة على التقرير الحالي.';
    }
   }
  }
  const newCtx=report();
  if(newCtx?.stationId===ctx.stationId&&newCtx?.date===ctx.date)drawReview(newCtx);
 }
 function install(){
  if(state.booted)return;state.booted=true;
  addPin();
  document.addEventListener('click',event=>{
   if(event.target.closest('[data-ws42-recheck]')){void updateReportReview(true);return}
   handleAction(event);
  });
  const field=$('reportInputFields');
  if(field){
   field.addEventListener('input',()=>onReportRendered());
   const obs=new MutationObserver(()=>onReportRendered());
   obs.observe(field,{childList:true});
  }
  $('stationSelect')?.addEventListener('change',()=>onReportRendered());
  $('reportDate')?.addEventListener('change',()=>onReportRendered());
  const obs=new MutationObserver(changes=>{
   if(!changes.some(c=>c.attributeName==='data-auth'))return;
   if(document.body.dataset.auth==='locked'){
    state.uid='';state.favorites=[];state.recents=[];state.prior=null;state.priorKey='';
    state.seq++;state.priorSeq++;
   }else if(accessible()){
    loadPrefs();paintPin();renderQuickPanel();onReportRendered();
   }
  });
  obs.observe(document.body,{attributes:true,attributeFilter:['data-auth']});
  if(accessible()){loadPrefs();renderQuickPanel();onReportRendered()}
 }
 window.WSV42=Object.freeze({search,recordVisit,renderQuickPanel,onReportRendered,updateReportReview,sourceLabel});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
