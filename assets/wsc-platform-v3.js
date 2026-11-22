/* Water Solutions Workspace V3.
 * Native client-side navigation around existing authenticated application actions.
 * The original logo assets, report rendering and server permissions are untouched.
 */
(function(){
'use strict';
const host=()=>window.WSMaintenanceHost;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const paths={
 home:{label:'الرئيسية',section:'home',icon:'home'},
 reports:{label:'التقرير اليومي',section:'reports',icon:'file'},
 dashboard:{label:'لوحة المتابعة التشغيلية',section:'dashboard',icon:'chart',manager:true},
 'archive/daily':{label:'التقارير اليومية',section:'archive',icon:'archive'},
 'archive/monthly':{label:'التقارير الشهرية',section:'archive',icon:'calendar'},
 'archive/yearly':{label:'التقارير السنوية',section:'archive',icon:'chart'},
 'chemicals/overview':{label:'لوحة مخزون الكيماويات',section:'chemicals',icon:'flask'},
 'chemicals/entry':{label:'تسجيل قراءة مخزون',section:'chemicals',icon:'plus'},
 'maintenance/overview':{label:'لوحة الصيانة',section:'maintenance',icon:'wrench'},
 'maintenance/daily':{label:'إدخال أعمال الصيانة',section:'maintenance',icon:'plus'},
 'maintenance/assets':{label:'المعدات والأصول',section:'maintenance',icon:'layers'},
 'maintenance/records':{label:'سجلات الصيانة',section:'maintenance',icon:'list'},
 'maintenance/planned':{label:'الجدول والدوريات',section:'maintenance',icon:'calendar'},
 'maintenance/monthly':{label:'تقرير الصيانة الشهري',section:'maintenance',icon:'file'},
 'maintenance/import':{label:'استيراد صيانة Excel',section:'maintenance',icon:'upload',manager:true},
 'admin/stations':{label:'إعدادات المحطات',section:'admin',icon:'settings'},
 'admin/accounts':{label:'إدارة الحسابات',section:'admin',icon:'users',super:true},
 'admin/audit':{label:'سجل النشاط والمراجعة',section:'admin',icon:'history',super:true},
 'admin/data':{label:'إدارة البيانات والنسخ',section:'admin',icon:'database',manager:true}
};
const groups=[
 {name:'الرئيسية',route:'home',icon:'home'},
 {name:'التقرير اليومي',route:'reports',icon:'file'},
 {name:'لوحة المتابعة',route:'dashboard',icon:'chart',manager:true},
 {name:'الأرشيف',route:'archive/daily',icon:'archive',children:['archive/daily','archive/monthly','archive/yearly']},
 {name:'المواد الكيميائية',route:'chemicals/overview',icon:'flask',children:['chemicals/overview','chemicals/entry']},
 {name:'الصيانة',route:'maintenance/overview',icon:'wrench',children:['maintenance/overview','maintenance/daily','maintenance/assets','maintenance/records','maintenance/planned','maintenance/monthly','maintenance/import']},
 {name:'الإدارة',route:'admin/stations',icon:'settings',children:['admin/stations','admin/accounts','admin/audit','admin/data']}
];
const icons={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/>',
 file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h7"/>',
 chart:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16v-4m5 4V8m5 8v-6"/>',
 archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3"/>',
 flask:'<path d="M9 3h6m-5 0v6l-5.6 9.4A2 2 0 0 0 6.1 21h11.8a2 2 0 0 0 1.7-2.6L14 9V3M7.5 15h9"/>',
 wrench:'<path d="M14.5 6.5a5 5 0 0 0-6.7 6.7L3 18a2 2 0 0 0 3 3l4.8-4.8a5 5 0 0 0 6.7-6.7L14 13l-3-3Z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 layers:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="m2 8 10-6 10 6M2 16l10 6 10-6"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
 settings:'<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1 1.4 1.2-1.5 2.6-1.8-.6a8 8 0 0 1-2.2 1.2L15 21.5h-3l-.4-2a8 8 0 0 1-2.1-1.2l-1.9.6-1.5-2.6 1.5-1.3a8 8 0 0 1 0-2.5L6.1 11l1.5-2.6 1.9.6a8 8 0 0 1 2.1-1.2l.4-2h3l.4 2a8 8 0 0 1 2.2 1.2l1.8-.6 1.5 2.6-1.4 1.3a8 8 0 0 1-.1 2.7Z" transform="translate(-1 -1) scale(.97)"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 0 0-1-5.8M17 15a5 5 0 0 1 5 5v1"/>',
 history:'<path d="M3 12a9 9 0 1 0 2.7-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
 database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 shield:'<path d="m12 2 8 3v7c0 5-3 8-8 10-5-2-8-5-8-10V5Z"/><path d="m9 12 2 2 4-4"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m-5 0h5v5"/>',
 logout:'<path d="M10 17l5-5-5-5M15 12H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
 adjust:'<path d="M4 7h16M4 17h16M9 4v6M15 14v6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon=(name)=>'<svg class="ws3-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.file)+'</svg>';
const state={page:'',group:'',busy:false,booted:false,loadVersion:0,routeFromLink:false,role:'',navOpen:false,
 expandedGroups:new Set(),collapsed:false,viewState:new Map()};
const WS_UI_PREFS='ws-company-ux-v41';
function readPreferences(){
 try{
  const v=JSON.parse(localStorage.getItem(WS_UI_PREFS)||'{}');
  return v&&typeof v==='object'&&!Array.isArray(v)?v:{};
 }catch{return {}}
}
function persistPreferences(){
 try{
  localStorage.setItem(WS_UI_PREFS,JSON.stringify({
   collapsed:state.collapsed,
   density:body().dataset.wsDensity==='compact'?'compact':'comfortable',
   expanded:[...state.expandedGroups].filter(x=>['archive','chemicals','maintenance','admin'].includes(x)).slice(0,4)
  }));
 }catch{}
}
function setCollapsed(collapsed){
 state.collapsed=!!collapsed;
 body().classList.toggle('ws-v41-collapsed',state.collapsed);
 const toggle=$('wsV41Collapse');
 if(toggle){toggle.setAttribute('aria-expanded',String(!state.collapsed));
  toggle.setAttribute('aria-label',state.collapsed?'توسيع القائمة الجانبية':'تصغير القائمة الجانبية');
  toggle.title=state.collapsed?'توسيع القائمة':'تصغير القائمة';
  const label=toggle.querySelector('[data-ws-collapse-label]');
  if(label)label.textContent=state.collapsed?'توسيع القائمة':'تصغير القائمة';
 }
 const sidebar=$('wsV3Sidebar');
 if(sidebar)sidebar.setAttribute('data-collapsed',String(state.collapsed));
}
function initPreferences(){
 const v=readPreferences();
 state.expandedGroups=new Set(Array.isArray(v.expanded)?v.expanded.filter(x=>['archive','chemicals','maintenance','admin'].includes(x)):[]);
 body().dataset.wsDensity=v.density==='compact'?'compact':'comfortable';
 setCollapsed(v.collapsed===true);
}
const VIEW_FIELDS={
 dashboard:['dashboardDate'],
 archive:['archiveStation','archiveFrom','archiveTo','archiveMonth','archiveYear']
};
const scrollableBySection={
 dashboard:'#dashboardModal .modal-body',
 archive:'#archiveModal .modal-body',
 chemicals:'#chemicalsModal .modal-body',
 maintenance:'#maintenanceModal .mw-body',
 admin:'#modalBackdrop .modal-body'
};
function currentViewport(route){
 if(!route)return null;
 const sec=section(route),node=scrollableBySection[sec]?document.querySelector(scrollableBySection[sec]):null;
 return node||document.scrollingElement;
}
function captureView(route){
 if(!route)return;
 const sec=section(route),fields={};
 for(const id of VIEW_FIELDS[sec]||[]){
  const input=$(id);if(input)fields[id]=input.value;
 }
 const old=state.viewState.get(sec)||{};
 const viewport=currentViewport(route);
 state.viewState.set(sec,{...old,fields,scrollTop:viewport?.scrollTop||0,route});
}
function restoreView(route){
 const sec=section(route),stored=state.viewState.get(sec);
 if(!stored)return;
 const sameRoute=stored.route===route;
 if(sameRoute&&['dashboard','archive'].includes(sec)){
  let dirty=false;
  for(const [id,value] of Object.entries(stored.fields||{})){
   const input=$(id);
   if(input&&!input.disabled&&typeof value==='string'&&input.value!==value){
    if(input.tagName==='SELECT'&&![...input.options].some(o=>o.value===value))continue;
    input.value=value;dirty=true;
   }
  }
  if(sec==='archive'&&dirty)$('archiveSearch')?.click();
  if(sec==='dashboard'&&dirty)$('dashboardRefresh')?.click();
 }
 if(sameRoute){
  const position=stored.scrollTop||0,apply=()=>{
   const node=currentViewport(route);
   if(node&&state.page===route&&node.scrollHeight>node.clientHeight)node.scrollTop=Math.min(position,node.scrollHeight-node.clientHeight);
  };
  requestAnimationFrame(()=>requestAnimationFrame(apply));
  // Maintenance and archive content can be populated asynchronously after navigation.
  setTimeout(apply,260);
 }
}

const isManager=()=>['admin','superadmin'].includes(host()?.role?.());
const isSuper=()=>host()?.role?.()==='superadmin';
const allowed=route=>{
 const p=paths[route],role=host()?.role?.();
 return !!(p&&host()?.signedIn?.()&&role!=='maintenance'&&
  !(route==='chemicals/entry'&&role==='admin')&&(!p.manager||isManager())&&(!p.super||isSuper()));
};
const visibleGroups=()=>groups.filter(x=>allowed(x.route)).map(x=>({...x,children:(x.children||[]).filter(allowed)}));
const section=route=>paths[route]?.section||'home';
const body=()=>document.body;
const modalFor=route=>({
 dashboard:'dashboardModal',archive:'archiveModal',chemicals:'chemicalsModal',
 maintenance:'maintenanceModal',admin:'modalBackdrop'
}[section(route)]||'');
const selectModalId=route=>{
 if(route==='admin/data')return '';
 if(route==='admin/accounts')return 'accountsModal';
 if(route==='admin/audit')return 'auditModal';
 return modalFor(route);
};
const primaryRoute=()=>host()?.role?.()==='station'?'reports':'home';
const getHash=()=>{
 const raw=location.hash.slice(1),match=raw.match(/^ws\/([a-z0-9/-]+)$/);
 return match&&allowed(match[1])?match[1]:'';
};
function navigateHash(route,replace){
 if(!route||location.hash==='#ws/'+route)return;
 const address=location.pathname+location.search+'#ws/'+route;
 if(replace)history.replaceState({wsRoute:route},'',address);
 else history.pushState({wsRoute:route},'',address);
}
function pageTitle(route){
 if(route==='admin/stations'&&host()?.role?.()==='station')return 'إعدادات المحطة';
 return paths[route]?.label||'الرئيسية';
}
function navButton(route,sub){
 const p=paths[route];
 return '<button type="button" class="ws-v3-link'+(sub?' ws-v3-sub-link':'')+'" data-ws-to="'+esc(route)+'" aria-label="'+esc(pageTitle(route))+'" title="'+esc(pageTitle(route))+'"'+
  (state.page===route?' aria-current="page"':'')+'>'+
  (sub?'':icon(p.icon))+'<span class="ws-v3-link-label">'+esc(pageTitle(route))+'</span></button>';
}
function buildNav(){
 const menu=$('wsV3Nav');if(!menu)return;
 const currentSection=section(state.page);
 menu.innerHTML='<div class="ws-v3-nav-caption">مساحة العمل</div>'+
 visibleGroups().map(g=>{
  const children=g.children||[];
  if(!children.length)return '<div class="ws-v3-nav-group">'+navButton(g.route,false)+'</div>';
  const groupName=section(g.route),open=state.expandedGroups.has(groupName);
  return '<div class="ws-v3-nav-group'+(open?' open':'')+'" data-ws-section="'+esc(groupName)+'">'+
   '<div class="ws-v3-parent-row"><button type="button" class="ws-v3-link" data-ws-to="'+esc(g.route)+'" aria-label="'+esc(g.name)+'" title="'+esc(g.name)+'"'+(currentSection===groupName?' aria-current="page"':'')+'>'+
   icon(g.icon)+'<span class="ws-v3-link-label">'+esc(g.name)+'</span></button>'+
   '<button type="button" class="ws-v3-group-toggle" data-ws-toggle="'+esc(groupName)+'" aria-expanded="'+open+'" aria-label="عرض صفحات '+esc(g.name)+'">'+
   icon('chevron').replace('ws3-icon','ws3-icon ws-v3-chevron')+'</button></div>'+
   '<div class="ws-v3-subnav">'+children.map(c=>navButton(c,true)).join('')+'</div></div>';
 }).join('');
 $('wsV3Role').textContent=host()?.role?.()==='station'?'حساب محطة':isSuper()?'سوبر أدمن':'أدمن';
 $('wsV3RoleSubtitle').textContent=host()?.role?.()==='station'?(host()?.stations?.().find(x=>x.id===host()?.stationId?.())?.name||'المحطة المخصصة'):'متابعة وتشغيل المحطات';
 $('wsV3AccountLabel').textContent=$('accountRole')?.textContent||'حسابي';
}
function setPage(route){
 state.page=route;state.group=section(route);
 if(['archive','chemicals','maintenance','admin'].includes(section(route))){
  if(!state.expandedGroups.has(section(route))){state.expandedGroups.add(section(route));persistPreferences()}
 }
 body().dataset.wsPage=route==='home'?'home':route==='reports'?'reports':route==='admin/data'?'data':'workspace';
 const title=pageTitle(route),groupTitle=({
 home:'الرئيسية',reports:'التشغيل اليومي',dashboard:'التحليلات',archive:'الأرشيف',
 chemicals:'المواد الكيميائية',maintenance:'الصيانة',admin:'الإدارة'
 })[section(route)];
 $('wsV3PageTitle').textContent=title;
 $('wsV3Breadcrumb').textContent=groupTitle===title?groupTitle:(groupTitle+' / '+title);
 document.title=title+' | شركة حلول المياه';
 const send=$('wsV3ReportBar')?.querySelector('[data-ws-original="saveBtn"]');
 if(send)send.hidden=host()?.role?.()==='admin';
 const message=$('wsV3SaveStatus');if(message)message.textContent=$('saveStatus')?.textContent||'حالة التقرير';
 buildNav();
 window.WSV42?.recordVisit?.(route);
 closeNav();
}
function closeNav(){body().classList.remove('ws-v3-nav-open');state.navOpen=false}
function showNav(){body().classList.add('ws-v3-nav-open');state.navOpen=true}
function status(text,negative=false){
 const node=$('wsV3Notice');
 if(!node)return;
 node.textContent=text;node.style.color=negative?'#a83e44':'#205b84';
 node.hidden=false;
 clearTimeout(status.timer);
 status.timer=setTimeout(()=>{node.hidden=true},4900);
}
function closeModal(id){
 const n=$(id);if(!n)return;
 if(n.classList.contains('hidden')){n.classList.remove('ws-v3-docked');return}
 const btnId={
 dashboardModal:'dashboardClose',archiveModal:'archiveClose',chemicalsModal:'chemicalsClose',
 accountsModal:'accountsClose',auditModal:'auditClose',modalBackdrop:'resetStationsBtn'
 }[id];
 if(id==='maintenanceModal')window.WSMaintenance?.close?.();
 else if(btnId&&$(btnId))$(btnId).click();
 else n.classList.add('hidden');
 n.classList.remove('ws-v3-docked');
}
function closePrevious(next){
 const nextId=selectModalId(next);
 for(const id of ['dashboardModal','archiveModal','chemicalsModal','maintenanceModal','modalBackdrop','accountsModal','auditModal']){
  if(id!==nextId)closeModal(id);
 }
}
function canLeave(next){
 if(state.page==='admin/stations'&&next!=='admin/stations'){
  const n=$('modalBackdrop');
  if(n&&!n.classList.contains('hidden')){
   if(window.WSPlatformHost?.settingsHaveChanges?.())return confirm('هل تريد مغادرة إعدادات المحطات؟ ستُلغى التغييرات غير المحفوظة.');
   return true;
  }
 }
 const editor=$('maintenanceModal')?.querySelector('[data-maintenance-bulk-overlay]');
 if(editor&&!['maintenance/overview','maintenance/daily','maintenance/assets','maintenance/records','maintenance/planned','maintenance/monthly','maintenance/import'].includes(next)){
  status('أغلق محرر الصيانة الجماعي أو احفظ التغييرات قبل الانتقال.',true);return false;
 }
 return true;
}
function originalClick(id){
 const button=$(id);if(!button){status('الوظيفة المطلوبة غير متاحة في هذه النسخة.',true);return false}
 button.click();return true;
}
function openCurrent(route,sameSection){
 const sec=section(route),modalId=selectModalId(route);
 if(modalId)$(modalId)?.classList.add('ws-v3-docked');
 if(route==='reports'){
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  return;
 }
 if(route==='home'||route==='admin/data')return;
 if(sec==='dashboard'){if(!sameSection||$('dashboardModal').classList.contains('hidden'))originalClick('dashboardBtn');return}
 if(sec==='archive'){
  if(!sameSection||$('archiveModal').classList.contains('hidden'))originalClick('archiveBtn');
  const kind=route.split('/')[1]||'daily';
  const button=document.querySelector('[data-archive-mode="'+kind+'"]');
  if(button&&kind!=='daily')button.click();
  else if(button&&sameSection)button.click();
  return;
 }
 if(sec==='chemicals'){
  if(!sameSection||$('chemicalsModal').classList.contains('hidden'))originalClick('chemicalsLink');
  if(route==='chemicals/entry'){
   if(host()?.role?.()==='admin'){status('يمكنك مراجعة مخزون المواد، لكن تعديل القراءات متاح للحساب المصرح له.',true);return}
   setTimeout(()=>{
    const btn=$('chem-widget-goEditor');
    if(btn&&!btn.hidden){btn.click();$('chem-widget-editor')?.scrollIntoView({block:'start',behavior:'smooth'})}
   },90);
  }else if(sameSection){$('chem-widget-stats')?.scrollIntoView({block:'start'})}
  return;
 }
 if(sec==='maintenance'){
  const tab=route.split('/')[1];
  if(window.WSMaintenance?.open)window.WSMaintenance.open(tab);
  else status('تعذر تحميل مساحة الصيانة. حدّث الصفحة.',true);
  return;
 }
 if(route==='admin/stations'){if(!sameSection||$('modalBackdrop').classList.contains('hidden'))originalClick('settingsBtn');return}
 if(route==='admin/accounts'){originalClick('accountsBtn');return}
 if(route==='admin/audit'){originalClick('auditBtn');return}
}
function navigate(route,options={}){
 if(!allowed(route))return false;
 if(state.busy)return false;
 if(!canLeave(route))return false;
 const previous=state.page,sameSection=section(previous)===section(route);
 state.busy=true;
 try{
  if(previous!==route){
   captureView(previous);
   if(previous==='reports')window.WSPlatformHost?.saveDraft?.();
   closePrevious(route);
  }
  if(route==='admin/accounts'||route==='admin/audit'){
   // Both are distinct native sections sharing the administration sidebar group.
   const other=route==='admin/accounts'?'auditModal':'accountsModal';
   closeModal(other);
  }
  setPage(route);
  openCurrent(route,previous!==''&&sameSection);
  if(previous!==route)restoreView(route);
  if(options.history!=='none')navigateHash(route,options.history==='replace');
  if(route==='home')loadHome();
  if(route==='admin/data')renderData();
  return true;
 }catch(err){
  status('تعذر فتح القسم: '+(err?.message||'خطأ غير معروف'),true);return false;
 }finally{
  state.busy=false;
 }
}
function dateSaudi(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const o=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return o.year+'-'+o.month+'-'+o.day;
}
function dateLabel(date){
 if(!date)return '—';
 const t=new Date(date+'T12:00:00Z');
 return isNaN(t.getTime())?date:new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'}).format(t);
}
function number(n){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)}
function homeMarkup(){
 const manager=isManager(),role=host()?.role?.();
 const btns=manager?[
  ['dashboard','لوحة متابعة التشغيل','chart'],['archive/daily','أرشيف التقارير','archive'],
  ['maintenance/overview','إدارة الصيانة','wrench'],['chemicals/overview','مخزون الكيماويات','flask']
 ]:[
  ['reports','إدخال تقرير اليوم','file'],['archive/daily','تقاريري السابقة','archive'],
  ['chemicals/overview','مخزون الكيماويات','flask'],['maintenance/overview','بيانات الصيانة','wrench']
 ];
 return '<div class="ws-v3-hero"><span class="ws-v4-hero-stripe" aria-hidden="true"></span>'+
 '<span class="ws-v4-hero-bottomline" aria-hidden="true"></span>'+
 '<div class="ws-v3-hero-content"><div class="ws-v4-hero-contentmark">Water Solutions Company · حلول المياه</div>'+
 '<div class="ws-v3-eyebrow">منصة التشغيل والمتابعة | منطقة التشغيل</div>'+
 '<h2>'+(manager?'مركز المتابعة التشغيلي':'مساحة المحطة التشغيلية')+'</h2>'+
 '<p>'+(manager?'تابع التقارير والمواقع وأعمال الصيانة من لوحة موحدة، وانتقل مباشرة إلى التفاصيل.':'كل ما تحتاجه لإدخال التقرير ومراجعة بيانات محطتك في مكان واحد.')+'</p></div>'+
 '<div class="ws-v3-hero-actions">'+
 '<button type="button" data-ws-to="'+(manager?'dashboard':'reports')+'" class="ws-v3-primary">'+icon(manager?'chart':'file')+(manager?'لوحة المتابعة':'إدخال تقرير')+'</button>'+
 '<button type="button" data-ws-to="archive/daily" class="ws-v3-secondary">'+icon('archive')+'الأرشيف</button></div></div>'+
 '<div class="ws-v3-section-title"><h3>مؤشرات التقارير اليومية</h3>'+
 '<button type="button" class="ws-v3-icon-button" data-ws-refresh>'+icon('refresh')+' تحديث البيانات</button></div>'+
 '<div class="ws-v3-kpis" id="wsV3Kpis" aria-live="polite">'+[0,1,2,3].map(()=>
 '<article class="ws-v3-kpi"><div class="ws-v3-kpi-title">جارٍ التحميل</div><strong class="ws-v3-kpi-value">—</strong></article>').join('')+'</div>'+
 '<div class="ws-v3-section-title"><h3>التفاصيل والوصول السريع</h3><small>الأرقام من التقارير المحفوظة فعليًا</small></div>'+
 '<div class="ws-v3-home-grid"><section class="ws-v3-card"><h3>حالة إرسال التقارير</h3>'+
 '<div id="wsV4Coverage" class="ws-v4-coverage" role="status" aria-live="polite">'+
 '<div class="ws-v4-coverage-ring" style="--ws4-percent:0%"><strong>—</strong></div>'+
 '<div class="ws-v4-coverage-copy"><h4>مؤشر استلام تقارير اليوم</h4>'+
 '<p>يعكس نسبة المحطات التي لديها تقرير مسجل بتاريخ اليوم، بناءً على التقارير المتاحة لحسابك.</p>'+
 '<span class="ws-v4-coverage-empty">جارٍ قراءة بيانات المحطات...</span></div></div>'+
 '<div class="ws-v3-list" id="wsV3StationList"><div class="ws-v3-loading">جارٍ قراءة التقارير…</div></div></section>'+
 '<section class="ws-v3-card"><h3>الانتقال السريع</h3><div class="ws-v3-quick-grid">'+
 btns.map(x=>'<button class="ws-v3-quick" type="button" data-ws-to="'+x[0]+'">'+icon(x[2])+esc(x[1])+'</button>').join('')+
 '</div><div class="ws-v3-section-title"><h3>آخر التقارير</h3></div>'+
 '<div class="ws-v3-list" id="wsV3RecentList"><div class="ws-v3-loading">جارٍ التحميل…</div></div></section></div>';
}
function homeError(msg){
 const text='<div class="ws-v3-loading">'+esc(msg)+'</div>';
 $('wsV3StationList').innerHTML=text;$('wsV3RecentList').innerHTML=text;
 const coverage=$('wsV4Coverage');if(coverage)coverage.innerHTML='<div class="ws-v4-coverage-empty">'+esc(msg)+'</div>';
 $('wsV3Kpis').innerHTML=['تقارير اليوم','محطات أرسلت','لم ترسل','تاريخ المتابعة'].map(label=>
 '<article class="ws-v3-kpi"><div class="ws-v3-kpi-title">'+label+'</div><strong class="ws-v3-kpi-value">—</strong></article>').join('');
}
async function reportRows(params){
 const response=await host().authedFetch('/rest/v1/reports?'+new URLSearchParams(params));
 if(!response.ok)throw Error('تعذر قراءة التقارير (HTTP '+response.status+')');
 const result=await response.json();
 if(!Array.isArray(result))throw Error('نتيجة بيانات التقارير غير متوقعة');
 return result;
}
async function loadHome(){
 const version=++state.loadVersion;
 const root=$('wsV3Home');if(!root||state.page!=='home')return;
 root.innerHTML=homeMarkup();
 window.WSV42?.renderQuickPanel?.();
 const today=dateSaudi(),all=host()?.stations?.()||[];
 const visible=host()?.role?.()==='station'?all.filter(s=>s.id===host()?.stationId?.()):all;
 try{
  const [dayRows,recentRows]=await Promise.all([
   reportRows({select:'id,station_id,report_date,created_at,source',report_date:'eq.'+today,order:'created_at.desc',limit:'200'}),
   reportRows({select:'id,station_id,report_date,created_at,source,source_sent_at,imported_from',order:'report_date.desc,created_at.desc',limit:'16'})
  ]);
  if(version!==state.loadVersion||state.page!=='home')return;
  const ids=new Set(visible.map(s=>s.id));
  const todayValid=dayRows.filter(r=>ids.has(r.station_id)),recentValid=recentRows.filter(r=>ids.has(r.station_id));
  const sent=new Set(todayValid.map(r=>r.station_id));
  const latestByStation=new Map();
  for(const r of recentValid)if(!latestByStation.has(r.station_id))latestByStation.set(r.station_id,r);
  const kpis=[
   {icon:'file',title:'تقارير اليوم',value:number(todayValid.length),hint:'تقارير مسجلة بتاريخ '+dateLabel(today)},
   {icon:'shield',title:'محطات أرسلت',value:number(sent.size),hint:'من أصل '+number(visible.length)+' محطة متاحة'},
   {icon:'clock',title:'محطات لم ترسل',value:number(Math.max(0,visible.length-sent.size)),hint:'لم يُعثر على تقرير بتاريخ اليوم'},
   {icon:'calendar',title:'تاريخ المتابعة',value:today.slice(5),hint:'بتوقيت السعودية'}
  ];
  const coverage=$('wsV4Coverage');
  if(coverage){
   const percentage=visible.length?Math.round(sent.size/visible.length*100):0;
   const angle=Math.max(0,Math.min(100,percentage));
   coverage.innerHTML='<div class="ws-v4-coverage-ring" style="--ws4-percent:'+angle+'%" aria-label="نسبة التقارير المستلمة '+angle+' بالمئة">'+
    '<strong>'+angle+'%</strong></div>'+
    '<div class="ws-v4-coverage-copy"><h4>استلام تقارير اليوم</h4>'+
    '<p>من المحطات المتاحة لحسابك، وفق تاريخ التقرير المسجل في النظام.</p>'+
    '<span class="ws-v4-coverage-summary">'+number(sent.size)+' من '+number(visible.length)+' محطة</span></div>';
  }
  $('wsV3Kpis').innerHTML=kpis.map(k=>'<article class="ws-v3-kpi">'+
   '<div class="ws-v3-kpi-title"><span class="ws-v3-kpi-icon">'+icon(k.icon)+'</span>'+k.title+'</div>'+
   '<strong class="ws-v3-kpi-value">'+esc(k.value)+'</strong><small>'+esc(k.hint)+'</small></article>').join('');
  $('wsV3StationList').innerHTML=visible.length?visible.map(st=>{
   const row=latestByStation.get(st.id),done=sent.has(st.id);
   const last=row?'آخر تقرير: '+dateLabel(row.report_date):'لا توجد تقارير في أحدث النتائج';
   return '<div class="ws-v3-item"><span class="ws-v3-status '+(done?'ok':'warn')+'">'+(done?'تم الإرسال':'لم يرسل اليوم')+'</span>'+
    '<span class="ws-v3-item-details"><strong>'+esc(st.name)+'</strong><small>'+esc(last)+'</small></span>'+
    '<button data-ws-archive-station="'+esc(st.id)+'" type="button">عرض</button></div>';
  }).join(''):'<div class="ws-v3-loading">لا توجد محطات متاحة لهذا الحساب.</div>';
  $('wsV3RecentList').innerHTML=recentValid.length?recentValid.slice(0,8).map(r=>{
   const station=visible.find(s=>s.id===r.station_id)?.name||r.station_id;
   return '<div class="ws-v3-item"><span class="ws-v3-item-details"><strong>'+esc(station)+'</strong>'+
   '<small>'+esc(dateLabel(r.report_date))+' · '+esc(window.WSV42?.sourceLabel?.(r)|| (r.source==='migration'?'تقرير مستورد':'تقرير أُدخل بالموقع'))+'</small></span>'+
   '<button type="button" data-ws-archive-date="'+esc(r.report_date)+'" data-ws-archive-station="'+esc(r.station_id)+'">عرض</button></div>';
  }).join(''):'<div class="ws-v3-loading">لا توجد تقارير حديثة متاحة لهذا الحساب.</div>';
 }catch(err){
  if(version===state.loadVersion&&state.page==='home')homeError('تعذر تحميل ملخص التقارير: '+err.message);
 }
}

let sourceArchiveBusy=false;
const sourceArchiveApi=async(action,extra={})=>{
 const api=host()?.authedFetch;
 if(!api||!isSuper())throw Error('هذه الخدمة متاحة للسوبر أدمن فقط.');
 const response=await api('/functions/v1/plant-source-archive',{
  method:'POST',body:JSON.stringify({action,...extra})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result?.message||({
  superadmin_required:'هذا الإجراء متاح للسوبر أدمن فقط.',
  source_archive_failed:'تعذر سحب ملف المصدر أو حفظه. راجع حالة الاتصال.'
 }[result?.error])||'تعذر إكمال العملية ('+response.status+').');
 return result;
};
function archiveStatus(message,error=false){
 const node=$('wsSourceArchiveStatus');if(!node)return;
 node.textContent=message;
 node.style.color=error?'#b53a43':'#325b77';
}
function archiveSourceRenderSnapshots(items){
 const node=$('wsSourceSnapshots');if(!node)return;
 if(!Array.isArray(items)||!items.length){
  node.innerHTML='<div class="ws-v3-loading">لم يتم حفظ أي نسخة Excel يومية بعد.</div>';return;
 }
 const dateTime=v=>{
  try{return new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}).format(new Date(v))}
  catch{return String(v||'—')}
 };
 node.innerHTML=items.map(s=>'<div class="ws-v3-item ws-source-snapshot">'+
  '<span class="ws-v3-item-details"><strong>نسخة '+esc(s.snapshot_date)+'</strong>'+
  '<small>تاريخ السحب: '+esc(dateTime(s.captured_at))+
  ' · تاريخ التقرير: '+esc(s.report_date)+
  ' · صفوف المصدر: '+esc(s.row_count)+
  (s.stale_revision?' · الملف لم يتغير عن نسخة سابقة':'')+
  '</small></span><button type="button" data-ws-source-download="'+esc(s.id)+'" data-snapshot-date="'+esc(s.snapshot_date)+'">تنزيل Excel</button></div>').join('');
}
async function sourceArchiveLoad(){
 if(!isSuper()||state.page!=='admin/data')return;
 try{
  const [listed,sources]=await Promise.all([sourceArchiveApi('list'),sourceArchiveApi('sources')]);
  if(state.page!=='admin/data')return;
  archiveSourceRenderSnapshots(listed.snapshots||[]);
  const options=(sources.sources||[]).map(s=>
   '<option value="'+esc(s.key)+'">'+esc(s.name)+'</option>').join('');
  const select=$('wsArchiveSourceSelect');
  if(select){
   const previous=select.value;
   select.innerHTML='<option value="">اختر اسم المحطة كما يظهر في ملف Excel</option>'+options;
   if(previous&&[...select.options].some(o=>o.value===previous))select.value=previous;
  }
  archiveStatus((listed.snapshots||[]).length?'الأرشيف اليومي متاح؛ يمكنك تحميل النسخ أو ربط محطة جديدة.':'لم تُسجل نسخة Excel بعد. يمكنك تشغيل السحب الآن.');
 }catch(e){archiveStatus('تعذر تحميل أرشيف المصدر: '+e.message,true)}
}
async function archiveRunNow(){
 if(sourceArchiveBusy||!isSuper())return;
 sourceArchiveBusy=true;
 const button=$('wsSourceArchiveRun');if(button)button.disabled=true;
 archiveStatus('جارٍ سحب ملف Google Drive وحفظ النسخة الكاملة ثم تحديث تقارير المحطات...');
 try{
  const result=await sourceArchiveApi('run',{mode:'both'});
  const snapshot=result.snapshot||{},sync=result.sync||{};
  const message=result.syncError
   ?'تم حفظ نسخة Excel بتاريخ '+(snapshot.date||'—')+'، لكن استيراد تقارير التشغيل لم يكتمل: '+result.syncError
   :'تم حفظ النسخة الكاملة ('+(snapshot.rows||0)+' صفًا). أضيف '+(sync.inserted||0)+' تقريرًا جديدًا دون استبدال التقارير الموجودة.';
  await sourceArchiveLoad();
  archiveStatus(message,!!result.syncError);
 }catch(e){archiveStatus('تعذر تنفيذ السحب: '+e.message,true)}
 finally{sourceArchiveBusy=false;if(button)button.disabled=false}
}
async function sourceArchiveDownload(button){
 if(sourceArchiveBusy||!isSuper())return;
 const id=button.dataset.wsSourceDownload;
 button.disabled=true;
 try{
  const r=await sourceArchiveApi('download',{id});
  if(!/^https:\/\//.test(r.url||''))throw Error('رابط التنزيل غير صالح.');
  const a=document.createElement('a');
  a.href=r.url;a.download='مصدر_جميع_المحطات_'+(button.dataset.snapshotDate||'')+'.xlsx';
  a.rel='noopener noreferrer';a.target='_blank';
  document.body.appendChild(a);a.click();a.remove();
 }catch(e){archiveStatus('تعذر تنزيل الملف: '+e.message,true)}
 finally{button.disabled=false}
}
async function sourceArchiveBackfill(){
 if(sourceArchiveBusy||!isSuper())return;
 const stationId=$('wsArchiveStationSelect')?.value;
 const sourceKey=$('wsArchiveSourceSelect')?.value;
 const stationName=host()?.stations?.().find(x=>x.id===stationId)?.name||stationId;
 const excelName=$('wsArchiveSourceSelect')?.selectedOptions?.[0]?.textContent||'';
 if(!stationId||!sourceKey){archiveStatus('اختر المحطة واسمها المطابق في ملف Excel أولًا.',true);return}
 if(!confirm('ربط '+stationName+' بصف المصدر «'+excelName+'»؟ سيتم استعادة التقارير التاريخية الناقصة فقط، دون تغيير أي تقرير محفوظ.'))return;
 sourceArchiveBusy=true;
 const button=$('wsArchiveBackfill');if(button)button.disabled=true;
 archiveStatus('جارٍ مطابقة سجلات Excel التاريخية للمحطة...');
 try{
  const r=await sourceArchiveApi('backfill',{stationId,sourceKey});
  archiveStatus('تم ربط المحطة بالمصدر. تمت استعادة '+(r.inserted||0)+' تقريرًا؛ أيام المصدر المطابقة: '+(r.matchedDays||0)+'.');
 }catch(e){archiveStatus('تعذر ربط المحطة: '+e.message,true)}
 finally{sourceArchiveBusy=false;if(button)button.disabled=false}
}
function renderData(){
 const node=$('wsV3Data');if(!node)return;
 node.innerHTML='<div class="ws-v3-page-head"><h2>إدارة البيانات والنسخ</h2><p>ملفات المصدر الأصلية محفوظة بصورة مستقلة عن التقارير المُدخلة إلى الموقع.</p></div>'+
 '<div class="ws-v3-card"><h3>أدوات البيانات</h3><p style="font-size:13px;color:#60788a;line-height:2">تصدير أو استيراد ملفات JSON الموجودة على هذا الجهاز. ليست بديلًا عن النسخ اليومية الكاملة.</p>'+
 '<div class="ws-v3-data-actions"><button type="button" data-ws-original="backupBtn">'+icon('database')+' تصدير JSON</button>'+
 '<button type="button" data-ws-original="importBtn">'+icon('upload')+' استيراد JSON</button></div></div>'+
 (isSuper()?'<section class="ws-v3-card ws-source-archive"><h3>سحب الإنتاج وأرشيف Excel اليومي</h3>'+
 '<p>يُحفظ ملف المصدر كاملًا بكل المحطات بصيغته الأصلية، بما فيها المحطات غير المفعّلة. السحب التلقائي مستمر، ويمكن تشغيله يدويًا في أي وقت. لا تُستبدل التقارير المسجلة.</p>'+
 '<div class="ws-v3-data-actions"><button type="button" class="ws-v3-primary" id="wsSourceArchiveRun">⟳ سحب البيانات الآن</button>'+
 '<button type="button" id="wsSourceArchiveRefresh">تحديث قائمة النسخ</button></div>'+
 '<p id="wsSourceArchiveStatus" class="ws-source-status" role="status">جارٍ تحميل أرشيف Excel...</p>'+
 '<h3>النسخ اليومية المحفوظة</h3><div id="wsSourceSnapshots" class="ws-source-snapshots"><div class="ws-v3-loading">تحميل...</div></div>'+
 '<div class="ws-source-linker"><h3>إضافة تاريخ محطة من النسخ المحفوظة</h3>'+
 '<p>عند تفعيل محطة جديدة، اخترها واربط اسمها باسم المحطة في Excel لاستعادة أيامها السابقة بأمان.</p>'+
 '<div class="ws-source-forms"><label>محطة الموقع<select id="wsArchiveStationSelect"><option value="">اختر محطة</option>'+
 (host()?.stations?.()||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')+
 '</select></label><label>اسمها في ملف Excel<select id="wsArchiveSourceSelect"><option value="">جارٍ تحميل أسماء المحطات...</option></select></label>'+
 '<button type="button" id="wsArchiveBackfill">ربط المحطة واستعادة سجلها</button></div></div></section>':'');
 if(isSuper())void sourceArchiveLoad();
}

document.addEventListener('click',event=>{
 if(state.page!=='admin/data'||!isSuper())return;
 const t=event.target;
 if(t.closest('#wsSourceArchiveRun')){void archiveRunNow();return}
 if(t.closest('#wsSourceArchiveRefresh')){void sourceArchiveLoad();return}
 const download=t.closest('[data-ws-source-download]');
 if(download){void sourceArchiveDownload(download);return}
 if(t.closest('#wsArchiveBackfill')){void sourceArchiveBackfill();return}
});
function focusChemicalEntry(){const node=$('chem-widget-editor');if(node)node.scrollIntoView({block:'start',behavior:'smooth'})}
function launchArchiveFromHome(station,day){
 if(!navigate('archive/daily'))return;
 const st=$('archiveStation'),from=$('archiveFrom'),to=$('archiveTo');
 if(st&&station&&[...st.options].some(o=>o.value===station)){
  st.value=station;st.dispatchEvent(new Event('change',{bubbles:true}));
 }
 if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day)){from.value=day;to.value=day;from.dispatchEvent(new Event('change',{bubbles:true}))}
 $('archiveSearch')?.click();
}
function openCommand(){
 if(body().dataset.auth!=='ready')return;
 const overlay=$('wsV3Command');
 overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
 $('wsV3CommandInput').value='';drawCommand('');
 $('wsV3CommandInput').focus();
}
function closeCommand(){
 $('wsV3Command')?.classList.remove('open');
 $('wsV3Command')?.setAttribute('aria-hidden','true');
}
function drawCommand(text){
 const q=String(text||'').trim().toLocaleLowerCase('ar');
 const list=$('wsV3CommandList');
 const available=Object.entries(paths).filter(([path,config])=>allowed(path)&&
  (!q||(config.label+' '+path).toLocaleLowerCase('ar').includes(q)));
 list.innerHTML=available.length?available.map(([path,config])=>
  '<button data-ws-to="'+esc(path)+'" type="button">'+icon(config.icon)+' &nbsp;'+esc(pageTitle(path))+'</button>').join(''):
 '<div class="ws-v3-loading">لا توجد أقسام مطابقة للبحث.</div>';
 window.WSV42?.search?.(text);
}
function makeShell(){
 if($('wsV3Shell'))return;
 const root=document.createElement('div');root.className='ws-v3-shell';root.id='wsV3Shell';
 root.innerHTML='<div class="ws-v3-backdrop" data-ws-close-menu></div>'+
 '<aside class="ws-v3-sidebar" id="wsV3Sidebar" aria-label="قائمة أقسام الموقع">'+
 '<div class="ws-v3-side-head"><div class="ws-v4-logo-panel"><img class="ws-v3-logo" src="/assets/wsc-logo.svg?v=20261118-identity2" alt="الشعار الأصلي لشركة حلول المياه" width="208" height="122"></div>'+
 '<div class="ws-v3-brand-tag">منصة التشغيل والمتابعة</div><div class="ws-v3-brand-sub">Water Solutions Company</div>'+
 '<div class="ws-v4-brand-divider" aria-hidden="true"><span></span><span></span><span></span></div>'+
 '<img class="ws-v41-compact-logo" src="/assets/wsc-mark.svg?v=20261118-identity2" alt="رمز شركة حلول المياه" width="58" height="38"></div>'+
 '<nav class="ws-v3-scroll" id="wsV3Nav" aria-label="التنقل الرئيسي"></nav>'+
 '<div class="ws-v3-foot"><button class="ws-v41-collapse-control" id="wsV41Collapse" type="button" data-ws-toggle-collapse aria-controls="wsV3Sidebar" aria-expanded="true">'+
 icon('menu')+'<span data-ws-collapse-label>تصغير القائمة</span></button>'+
 '<div class="ws-v3-foot-card">'+icon('shield')+
 '<div><strong id="wsV3Role">الحساب</strong><small id="wsV3RoleSubtitle">مساحة العمل</small></div></div></div></aside>'+
 '<header class="ws-v3-topbar"><button type="button" class="ws-v3-icon-button ws-v3-menu-toggle" data-ws-open-menu aria-label="فتح قائمة الأقسام">'+icon('menu')+'</button>'+
 '<div class="ws-v4-top-signature"><img src="/assets/wsc-mark.svg?v=20261118-identity2" alt="" aria-hidden="true" width="57" height="40"></div>'+
 '<div class="ws-v3-title-area"><div class="ws-v3-breadcrumb" id="wsV3Breadcrumb">الرئيسية</div>'+
 '<h1 class="ws-v3-page-title" id="wsV3PageTitle">الرئيسية</h1></div>'+
 '<div class="ws-v3-top-actions">'+
 '<span id="wsV3Notice" hidden role="status" aria-live="polite" style="font-size:11px"></span>'+
 '<button type="button" class="ws-v3-icon-button ws-v3-density" data-ws-density title="تبديل كثافة العرض" aria-label="تبديل كثافة العرض">'+icon('adjust')+'</button>'+
 '<button type="button" class="ws-v3-icon-button ws-v3-top-search" data-ws-command>'+icon('search')+'<span>بحث في الأقسام</span></button>'+
 '<details class="ws-v3-profile-menu" id="wsV3Profile"><summary class="ws-v3-icon-button" aria-label="خيارات المستخدم">'+icon('user')+'</summary>'+
 '<div class="ws-v3-popover"><strong id="wsV3AccountLabel">حسابي</strong>'+
 '<button type="button" data-ws-profile="password">تغيير كلمة المرور</button>'+
 '<button type="button" data-ws-profile="logout">تسجيل الخروج</button></div></details></div></header>'+
 '<div class="ws-v3-report-bar" id="wsV3ReportBar" aria-label="أدوات التقرير اليومي">'+
 '<div class="ws-v3-report-bar-main">'+
 '<button type="button" class="ws-v3-report-submit" data-ws-original="saveBtn">'+icon('shield')+' إرسال التقرير</button>'+
 '<button type="button" class="ws-v3-report-tool" data-ws-original="newBtn">'+icon('plus')+' تقرير جديد</button>'+
 '<button type="button" class="ws-v3-report-tool" data-ws-original="restoreBtn">'+icon('history')+' استرجاع تقرير</button>'+
 '<button type="button" class="ws-v3-report-tool" data-ws-original="exportBtn">'+icon('file')+' حفظ صورة</button>'+
 '<button type="button" class="ws-v3-report-tool" data-ws-original="shareBtn">مشاركة واتساب</button>'+
 '<button type="button" class="ws-v3-report-tool" data-ws-original="printBtn">طباعة</button>'+
 '<button type="button" class="ws-v3-report-tool" data-ws-original="fullBtn">معاينة كاملة</button>'+
 '<button type="button" class="ws-v3-report-tool ws-v3-report-clear" data-ws-original="clearBtn">مسح الحقول</button></div>'+
 '<span class="ws-v3-report-status" id="wsV3SaveStatus">حالة التقرير</span></div>'+
 '<section class="ws-v3-home" id="wsV3Home" aria-label="الصفحة الرئيسية"></section>'+
 '<section class="ws-v3-data" id="wsV3Data" aria-label="إدارة البيانات"></section>';
 document.body.appendChild(root);
 // Bind reporting actions at the control itself. This prevents lost submit clicks
 // when a section-specific handler consumes bubbling before document delegation.
 root.querySelectorAll('#wsV3ReportBar [data-ws-original]').forEach(control=>{
  control.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   const target=$(control.dataset.wsOriginal);
   if(target&&!target.disabled)target.click();
  });
 });
 const command=document.createElement('div');
 command.id='wsV3Command';command.className='ws-v3-command';command.setAttribute('aria-hidden','true');
 command.innerHTML='<div class="ws-v3-command-dialog" role="dialog" aria-modal="true" aria-label="البحث في أقسام الموقع">'+
 '<div class="ws-v3-command-field">'+icon('search')+
 '<input id="wsV3CommandInput" autocomplete="off" placeholder="ابحث عن قسم أو وظيفة..."></div>'+
 '<div class="ws-v3-command-list" id="wsV3CommandList"></div>'+
 '<div class="ws-v3-command-hint">اختر القسم المطلوب · اختصار Ctrl + K · إغلاق Escape</div></div>';
 document.body.appendChild(command);
 document.addEventListener('click',event=>{
  const groupButton=event.target.closest('[data-ws-toggle]');
  if(groupButton){
   const groupName=groupButton.dataset.wsToggle;
   if(state.expandedGroups.has(groupName))state.expandedGroups.delete(groupName);
   else state.expandedGroups.add(groupName);
   persistPreferences();buildNav();return;
  }
  if(event.target.closest('[data-ws-toggle-collapse]')){
   setCollapsed(!state.collapsed);persistPreferences();return;
  }
  const to=event.target.closest('[data-ws-to]');
  if(to){event.preventDefault();if(navigate(to.dataset.wsTo))closeCommand();return}
  if(event.target.closest('[data-ws-open-menu]')){showNav();return}
  if(event.target.closest('[data-ws-close-menu]')){closeNav();return}
  if(event.target.closest('[data-ws-command]')){openCommand();return}
  if(event.target.closest('[data-ws-density]')){
   body().dataset.wsDensity=body().dataset.wsDensity==='compact'?'comfortable':'compact';
   persistPreferences();return;
  }
  if(event.target.closest('[data-ws-refresh]')){loadHome();return}
  const external=event.target.closest('[data-ws-original]');
  if(external){
   const operation=external.dataset.wsOriginal;
   if(['backupBtn','importBtn'].includes(operation)&&!isManager())return;
   originalClick(operation);return;
  }
  const entry=event.target.closest('[data-ws-archive-station]');
  if(entry){
   launchArchiveFromHome(entry.dataset.wsArchiveStation,entry.dataset.wsArchiveDate);return;
  }
  const profile=event.target.closest('[data-ws-profile]');
  if(profile){
   $('wsV3Profile').open=false;
   originalClick(profile.dataset.wsProfile==='logout'?'signoutBtn':'changeOwnPasswordBtn');return;
  }
  if(event.target===$('wsV3Command'))closeCommand();
  if(event.target.closest('[data-archive-mode]')&&state.page.startsWith('archive/')){
   const kind=event.target.closest('[data-archive-mode]').dataset.archiveMode;
   if(paths['archive/'+kind]){setPage('archive/'+kind);navigateHash('archive/'+kind,false)}
  }
  if(event.target.closest('[data-mw="tab"]')&&state.page.startsWith('maintenance/')){
   const tab=event.target.closest('[data-mw="tab"]').dataset.tab;
   if(paths['maintenance/'+tab]){setPage('maintenance/'+tab);navigateHash('maintenance/'+tab,false)}
  }
  if(event.target.closest('#chem-widget-goEditor')&&state.page.startsWith('chemicals/')){
   setPage('chemicals/entry');navigateHash('chemicals/entry',false);
  }
 });
 $('wsV3CommandInput').addEventListener('input',event=>drawCommand(event.target.value));
 document.addEventListener('keydown',event=>{
  if(event.key==='k'&&(event.ctrlKey||event.metaKey)&&body().dataset.auth==='ready'){
   event.preventDefault();openCommand();return;
  }
  if(event.key==='Escape'){
   if($('wsV3Command').classList.contains('open')){event.stopImmediatePropagation();closeCommand();return}
   if(body().classList.contains('ws-v3-nav-open'))closeNav();
  }
 },true);
 const monitored=['archiveModal','dashboardModal','chemicalsModal','maintenanceModal','modalBackdrop','accountsModal','auditModal'];
 const watcher=new MutationObserver(()=>{
  if(!state.page||state.busy||body().dataset.auth!=='ready')return;
  const active=selectModalId(state.page),node=$(active);
  if(!active||!node||!node.classList.contains('hidden'))return;
  // A user explicitly closed the current native workspace section.
  if(section(state.page)==='admin'&&state.page==='admin/data')return;
  navigate(primaryRoute(),{history:'replace'});
 });
 for(const id of monitored)if($(id))watcher.observe($(id),{attributes:true,attributeFilter:['class']});
 const maintainObserver=new MutationObserver(()=>{
  if($('maintenanceModal'))watcher.observe($('maintenanceModal'),{attributes:true,attributeFilter:['class']});
  maintainObserver.disconnect();
 });
 if(!$('maintenanceModal'))maintainObserver.observe(body(),{childList:true});
 window.addEventListener('popstate',()=>{
  if(body().dataset.auth!=='ready')return;
  navigate(getHash()||primaryRoute(),{history:'none'});
 });
}
function applyRole(){
 const mode=body().dataset.auth;
 if(mode!=='ready'){
  body().classList.remove('ws-v3-ready','ws-v3-nav-open');
  if(mode==='locked'){
   state.page='';state.loadVersion++;state.viewState.clear();
   if(location.hash.startsWith('#ws/'))history.replaceState(null,'',location.pathname+location.search);
  }
  return;
 }
 if(!host()?.signedIn?.())return;
 makeShell();
 body().classList.add('ws-v3-ready');
 state.role=host()?.role?.()||'';
 let route=getHash()||primaryRoute();
 if(!allowed(route))route=primaryRoute();
 navigate(route,{history:'replace'});
}
function init(){
 if(state.booted)return;
 state.booted=true;
 makeShell();
 initPreferences();
 const saveNode=$('saveStatus');
 if(saveNode)new MutationObserver(()=>{if($('wsV3SaveStatus'))$('wsV3SaveStatus').textContent=saveNode.textContent||'حالة التقرير'}).observe(saveNode,{childList:true,characterData:true,subtree:true});
 const observer=new MutationObserver(records=>{
  if(records.some(x=>x.attributeName==='data-auth'))applyRole();
 });
 observer.observe(body(),{attributes:true,attributeFilter:['data-auth']});
 if(body().dataset.auth==='ready')applyRole();
}
window.WSShellUI=Object.freeze({enabled:true,navigate,paths:Object.keys(paths)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();