'use strict';
(()=>{
const $=id=>document.getElementById(id);
const LOGO='/assets/wsc-logo.svg?v=20261118-identity2';
const MARK='/assets/wsc-mark.svg?v=20261118-identity2';
/* The same company logo used in exported reports is reused in all system screens. */
function applyCorporateIdentity(){
 for(const el of document.querySelectorAll('img[data-brand-logo]')){
  // The header needs a legible symbol, while forms and print use the full logotype.
  el.src=el.classList.contains('brand-logo-header')?MARK:LOGO;
 }
 for(const head of document.querySelectorAll('.modal-head')){
  if(head.querySelector('.modal-brand-logo'))continue;
  const logo=document.createElement('img');
  logo.className='modal-brand-logo';
  logo.src=MARK;
  logo.alt='شركة حلول المياه';
  logo.width=77;logo.height=42;
  head.insertBefore(logo,head.firstChild);
 }
 const icon=document.createElement('link');
 icon.rel='icon';icon.type='image/svg+xml';icon.href=MARK;
 document.head.appendChild(icon);
}
applyCorporateIdentity();
const KEY_STATIONS='wsc_daily_station_settings_v2',KEY_REPORTS='wsc_daily_reports_v2';
const CLOUD_URL='https://vksbjasfoysuwxdyeaed.supabase.co';
const CLOUD_PUBLIC_KEY='sb_publishable_ZNsCbKJ-E3WMhiKWbzUTHw_1IJJdBZh';
const CLOUD_AUTH=CLOUD_URL+'/auth/v1';
const CLOUD_ADMIN=CLOUD_URL+'/functions/v1/account-admin';
const CLOUD_STATION_LOGIN=CLOUD_URL+'/functions/v1/station-login';
const AUTH_KEY='wsc_supabase_auth_v1';
const STATION_EMAIL_SUFFIX='@wsc-ops.example';
const STATION_PLANT_CODES=Object.freeze({bish:'8053',matari:'8054',damad:'8056',muhayil:'8058',jizan:'8061'});
const isValidAccountPassword=password=>typeof password==='string'&&password.length>=2&&password.length<=128;
const isValidLoginName=name=>typeof name==='string'&&name.length>=1&&[...name].length<=64&&!/[@\u0000-\u001f\u007f]/.test(name);
let authSession=null,currentRole='',currentUserId='',currentStationId='',currentLoginName='';
const signedIn=()=>!!authSession&&!!authSession.access_token&&!!currentUserId;
const isAdmin=()=>currentRole==='admin'||currentRole==='superadmin';
const isSuperAdmin=()=>currentRole==='superadmin';
const perUserKey=(name)=>name+'_'+(currentUserId||'locked');

const DRAFTS_KEY='wsc_cloud_pending_drafts_v1', RECEIPTS_KEY='wsc_cloud_receipts_v1',REQUESTS_KEY='wsc_cloud_request_ids_v1';
let cloudReady=false,cloudSubmitting=false,archiveViewing=false,archiveConfig=null;
let dailyLookupBusy=false,dailyLookupError=false,dailySelectedReport=null,dailyLookupVersion=0;
let stationVersions=Object.create(null);
let editingReportId=null,settingsEditing=false,pendingInactiveIds=[];
let receipts={},requestIds={};
function cloudNotice(message,status=''){const el=$('cloudNotice');el.textContent=message;el.className='cloud-notice '+status;}

const numberUnit='م³', dayUnit='م³/يوم';
const metric=(id,label,unit=numberUnit,shade='blue',opts={})=>({id,label,unit,shade,required:false,visible:true,auto:'',...opts});
const item=(id,label,extra={})=>({id,label,...extra});
const group=(id,title,kind,items,extra={})=>({id,title,kind,items,visible:true,...extra});
const notes=(...labels)=>labels.map((label,i)=>({id:['status','cause','notes','other'][i]||'note'+i,label}));
const wtpMetrics=[
 item('production','الإنتاج',{unit:dayUnit,additive:true,metricKey:'production'}),
 item('ro_mix','الإنتاج من وحدات RO الأساسية والخلط',{unit:dayUnit,additive:true,metricKey:'ro_mix'}),
 item('bypass','Bypass / الخلط',{unit:dayUnit,additive:true,metricKey:'bypass'}),
 item('ro_return','الراجع من وحدات RO الأساسية',{unit:dayUnit,additive:true,metricKey:'ro_return'}),
 item('ro_eff','كفاءة وحدات RO الأساسية',{unit:'%',additive:false,metricKey:'ro_eff'}),
 item('recovery_production','إنتاج وحدة الراجع',{unit:dayUnit,additive:true,metricKey:'recovery_production'}),
 item('final_return','الراجع النهائي من وحدة الراجع',{unit:dayUnit,additive:true,metricKey:'final_return'}),
 item('recovery_eff','كفاءة وحدة الراجع',{unit:'%',additive:false,metricKey:'recovery_eff'}),
 item('export','التصدير',{unit:dayUnit,additive:true,metricKey:'export'}),
 item('tds','نسبة الأملاح',{unit:'ppm',additive:false,metricKey:'tds'}),
 item('raw_wells','إنتاج الآبار الخام',{unit:dayUnit,additive:true,metricKey:'raw_wells'}),
 item('power','استهلاك الكهرباء',{unit:'MWh',additive:true,metricKey:'power'})
];
const defaults=[
{id:'matari',name:'وحدة تحلية المياه الجوفية بالماطري',metrics:[metric('raw','المياه الخام المنتجة'),metric('production','الإنتاج'),metric('pumping','إجمالي الضخ',numberUnit,'blue',{auto:'lines'}),metric('nwc','الكمية المستلمة من NWC'),metric('tds_product','TDS المنتج','ppm','purple'),metric('tds_raw','TDS الخام','ppm','purple'),metric('power','الكهرباء','ميجاوات/يوم','gray')],groups:[group('tanks','مناسيب الخزانات','tanks',[item('raw','خزان المياه الخام'),item('product','خزانات المنتج (الرئيسي + الثانوي)',{children:[item('main','الرئيسي'),item('secondary','الثانوي')]})]),group('lines','الضخ حسب الخطوط','bars',[item('mahaliya','خط محلية'),item('suwais','خط السويس'),item('karbus','خط الكربوس'),item('burj','خط البرج'),item('qura','خط القرى'),item('rayyan','خط الريان وخبت سعيد'),item('badee','خط البديع والقرض')],{metricKey:'pumping'})],noteFields:notes('حالة التشغيل','سبب الانخفاض','ملاحظات التشغيل')},
{id:'wajid',name:'وحدة إنتاج تحلية مياه الوجيد',metrics:[metric('units','إنتاج الوحدات',dayUnit),metric('mix','كمية الخلط',dayUnit),metric('total','الإنتاج الإجمالي',dayUnit),metric('backup','الإنتاج الاحتياطي',dayUnit),metric('export','التصدير الكلي',dayUnit,'blue',{auto:'gates'}),metric('new_wells','مياه الآبار - العداد الجديد',dayUnit),metric('old_wells','مياه الآبار القديمة',dayUnit),metric('raw_total','إجمالي المياه الخام',dayUnit),metric('raw_stored','المياه المخزنة في الخام',numberUnit),metric('tds','نسبة الأملاح','ppm','purple')],groups:[group('electricity','استهلاك الكهرباء','values',[item('power','كمية الكهرباء المستهلكة',{unit:'MWh'})]),group('tanks','مناسيب الخزانات','tanks',[item('raw','خزان المياه الخام'),item('product','خزان المياه المنتجة'),item('tathlith','خزان تثليث'),item('drain','خزان الصرف')]),group('gates','التصدير حسب البوابات','bars',[item('shuruji','بوابة الشروجي وتثليث'),item('yadmah','بوابة يدمة'),item('facilities','مرافق المحطة')],{metricKey:'export'})],noteFields:notes('حالة التشغيل','أسباب انخفاض الإنتاج','الملاحظات التشغيلية')},
{id:'dawasir',name:'منظومة إنتاج تحلية مياه وادي الدواسر',metrics:wtpMetrics.map((w,i)=>metric(w.id,w.label,w.unit,['blue','blue','gray','gray','purple'][i%5],{auto:'wtp',additive:w.additive})),groups:[group('wtp','توزيع وحدات WTP1 وWTP2 وRO','wtp',wtpMetrics),group('tanks','مناسيب الخزانات','tanks',[item('raw1','خزان الخام WTP1'),item('raw2','خزان الخام WTP2'),item('prod1','خزان المنتج WTP1'),item('prod2','خزان المنتج WTP2')]),group('pumps','محطات الضخ','bars',[item('pump1','محطة ضخ مياه وادي الدواسر 1'),item('pump2','محطة ضخ مياه وادي الدواسر 2')]),group('facilities','مرافق المحطة','values',[item('water','كمية مياه مرافق المحطة',{unit:numberUnit})])],noteFields:notes('حالة التشغيل','أسباب انخفاض الإنتاج','ملاحظات التشغيل')},
{id:'aqiq',name:'وحدة تحلية المياه الجوفية والسطحية بالعقيق',metrics:[metric('production','الإنتاج'),metric('export','التصدير',numberUnit,'blue',{auto:'gates'}),metric('tds','TDS','ppm','purple')],groups:[group('tanks','مناسيب الخزانات','tanks',[item('tank','خزان المحطة')]),group('gates','بوابات التصدير','bars',[item('lahyan','شيب اللحيان'),item('mazra','شيب المزرع'),item('shahbah','خزان شهبة')],{metricKey:'export'}),group('chemicals','استهلاك الكيماويات','values',[item('pac','PAC 18%',{unit:'kg'}),item('polymer','Polymer',{unit:'kg'}),item('chlorine','Chlorine Gas',{unit:'kg'})])],noteFields:notes('حالة تشغيل المحطة','سبب انخفاض الإنتاج','ملاحظات التشغيل')},
{id:'tarad',name:'وحدة تحلية المياه الجوفية والسطحية بتراد',metrics:[metric('production','الإنتاج'),metric('export','التصدير'),metric('tds','TDS','ppm','purple')],groups:[group('tanks','مناسيب الخزانات','tanks',[item('tank','خزان المحطة')]),group('pumps','الخطوط ومحطات الضخ','bars',[item('tarad1','محطة تراد 1')]),group('chemicals','استهلاك الكيماويات','values',[item('pac','PAC 18%',{unit:'kg'}),item('polymer','Polymer',{unit:'kg'}),item('chlorine','Chlorine Gas',{unit:'kg'})])],noteFields:notes('حالة التشغيل','سبب التوقف','الملاحظات')},
{id:'jizan',name:'وحدة تنقية المياه السطحية في سد وادي جيزان',metrics:[metric('production','الإنتاج'),metric('raw','المياه الخام'),metric('export','التصدير'),metric('power','استهلاك الكهرباء','MWh'),metric('diesel','استهلاك الديزل','L','gray'),metric('tds','TDS المياه المنتجة','ppm','purple')],groups:[group('tanks','منسوب الخزان','tanks',[item('tank','الخزان')])],noteFields:notes('حالة التشغيل','سبب الإيقاف','الملاحظات التشغيلية')},
{id:'bisha',name:'وحدة تنقية المياه الجوفية في سد الملك فهد ببيشة',metrics:[metric('production','الإنتاج'),metric('export','التصدير')],groups:[],noteFields:notes('حالة التشغيل','سبب التوقف','الملاحظات')},
{id:'safa',name:'منظومة إنتاج مياه تنقية الصفا',metrics:[metric('production','الإنتاج'),metric('export','التصدير',numberUnit,'blue',{auto:'gates'}),metric('tds','TDS','ppm','purple'),metric('power','استهلاك الكهرباء','MW','gray')],groups:[group('tanks','مناسيب الخزانات','tanks',[item('raw','الخزان الخام'),item('product','الخزان المنتج')]),group('gates','بوابات التصدير','bars',[item('triangle','المثلث + المنجم'),item('hadn','الحضن')],{metricKey:'export'})],noteFields:notes('حالة التشغيل','أسباب انخفاض الإنتاج','الملاحظات')},
{id:'marbah',name:'منظومة إنتاج تحلية المياه الجوفية والسطحية بمربة',metrics:[metric('production','الإنتاج'),metric('raw','المياه الخام'),metric('pumping','الضخ'),metric('power','استهلاك الكهرباء','kWh','gray'),metric('tds','TDS','ppm','purple')],groups:[],noteFields:notes('حالة التشغيل','أسباب انخفاض الإنتاج','الملاحظات التشغيلية')},
{id:'aradah',name:'وحدة تنقية المياه الجوفية والسطحية في عردة',metrics:[metric('production','الإنتاج'),metric('tds','TDS','ppm','purple'),metric('status','حالة التشغيل','', 'gray',{type:'text'}),metric('receipt','المياه المستلمة من ويتكو',numberUnit,'blue',{auto:'meter'}),metric('export','إجمالي الكميات المصدرة للبوابات')],groups:[group('meter','قراءات عداد ويتكو','meter',[item('previous','قراءة العداد السابقة'),item('current','قراءة العداد الحالية')]),group('gates','كميات التصدير','bars',[item('total','بوابات الاستلام')],{metricKey:'export'})],noteFields:notes('حالة المحطة','الملاحظات التشغيلية')}
,
{"id":"muhayil","name":"وحدة تحلية المياه الجوفية في محايل","metrics":[{"id":"production","label":"الإنتاج","unit":"م³","shade":"blue","required":false,"visible":true,"auto":""},{"id":"export","label":"التصدير","unit":"م³","shade":"blue","required":false,"visible":true,"auto":""}],"groups":[],"noteFields":[{"id":"status","label":"حالة التشغيل"},{"id":"cause","label":"سبب انخفاض الإنتاج / التوقف"},{"id":"notes","label":"الملاحظات التشغيلية"}]},
{"id":"bish","name":"منظومة إنتاج تحلية المياه الجوفية والسطحية ببيش","metrics":[{"id":"raw","label":"المياه الخام","unit":"م³","shade":"blue","required":false,"visible":true,"auto":""},{"id":"production","label":"الإنتاج الإجمالي","unit":"م³","shade":"blue","required":false,"visible":true,"auto":""},{"id":"withdrawal","label":"السحب الإجمالي","unit":"م³","shade":"blue","required":false,"visible":true,"auto":""},{"id":"phase1_hours","label":"ساعات تشغيل المرحلة الأولى","unit":"","shade":"gray","required":false,"visible":true,"auto":"","type":"text"},{"id":"phase2_hours","label":"ساعات تشغيل المرحلة الثانية","unit":"","shade":"gray","required":false,"visible":true,"auto":"","type":"text"},{"id":"tds","label":"TDS","unit":"ppm","shade":"purple","required":false,"visible":true,"auto":""},{"id":"power","label":"استهلاك الكهرباء","unit":"kWh","shade":"gray","required":false,"visible":true,"auto":""}],"groups":[{"id":"withdrawal_routes","title":"تفاصيل السحب","kind":"bars","items":[{"id":"samta","label":"تنقية بيش - خط صامطة"},{"id":"shaqiq","label":"تنقية بيش - خط الشقيق"},{"id":"lift_stations","label":"محطات الرفع"}],"visible":true,"metricKey":"withdrawal"},{"id":"lift_pumps","title":"تفاصيل مضخات الرفع","kind":"bars","items":[{"id":"fatiha","label":"مضخة الفطيحة"},{"id":"haqu","label":"مضخة الحقو"},{"id":"raith","label":"مضخة الريث"}],"visible":true},{"id":"tanks","title":"مستوى الخزانات","kind":"tanks","items":[{"id":"a","label":"الخزان A"},{"id":"b","label":"الخزان B"}],"visible":true}],"noteFields":[{"id":"status","label":"حالة التشغيل"},{"id":"cause","label":"سبب انخفاض الإنتاج / التوقف"},{"id":"notes","label":"الملاحظات التشغيلية"}]},
{"id":"damad","name":"منظومة إنتاج تحلية المياه الجوفية والسطحية على سد وادي ضمد","metrics":[{"id":"production","label":"الإنتاج","unit":"م³","shade":"blue","required":false,"visible":true,"auto":""},{"id":"power","label":"استهلاك الكهرباء","unit":"MWh","shade":"gray","required":false,"visible":true,"auto":""},{"id":"tds","label":"نسبة الأملاح","unit":"ppm","shade":"purple","required":false,"visible":true,"auto":""}],"groups":[{"id":"tanks","title":"منسوب الخزان","kind":"tanks","items":[{"id":"tank","label":"الخزان"}],"visible":true}],"noteFields":[{"id":"status","label":"حالة التشغيل"},{"id":"cause","label":"سبب انخفاض الإنتاج / التوقف"},{"id":"notes","label":"الملاحظات التشغيلية"}]}
];
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=x=>JSON.stringify(x).replace(/'/g,'&#39;');
const num=x=>{if(x===null||x===undefined||String(x).trim()==='')return null;let n=Number(String(x).replace(/,/g,''));return Number.isFinite(n)?n:null};
const fmt=x=>{let n=num(x);return n===null?(String(x||'').trim()||'–'):new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n)};
const dateToday=()=>{let d=new Date();let pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const formatDate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '';let parts=d.split('-');let day=new Date(d+'T12:00:00').getDay();return `${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][day]} ${parts[2]}/${parts[1]}/${parts[0]}`};
const currentDate=dateToday();
function load(key,fallback){try{let o=JSON.parse(localStorage.getItem(key));return o===null?clone(fallback):o}catch(e){return clone(fallback)}}
function store(key,v){try{localStorage.setItem(key,JSON.stringify(v));return true}catch(e){toast('تعذر الحفظ محليًا. صدّر نسخة JSON للاحتفاظ بالبيانات.',true);return false}}
const allowedStationIds=['jizan','matari','marbah','muhayil','bish','damad'];
const allowedStations=()=>allowedStationIds.map(id=>defaults.find(s=>s.id===id)).filter(Boolean);
let stations=clone(allowedStations()),reports={};
if(!Array.isArray(stations)||!stations.length)stations=clone(allowedStations());
for(const station of stations)if(station.id==='matari'&&station.name==='وحدة تحلية المياه الجوفية بالمطاري')station.name='وحدة تحلية المياه الجوفية بالماطري';
if(typeof reports!=='object'||!reports)reports={};
let stationId=stations[0].id,date=currentDate,record={},drafts=load(DRAFTS_KEY,{}),editorStationId=stationId,toastTimer=null;receipts=load(RECEIPTS_KEY,{});requestIds=load(REQUESTS_KEY,{});
const selected=()=>archiveViewing&&archiveConfig?archiveConfig:(stations.find(s=>s.id===stationId)||stations[0]);
const reportKey=(s=stationId,d=date)=>s+'@'+d;
function emptyRecord(){return{metrics:{},groups:{},notes:{},excel:{},lastModified:null}}
function fetchRecord(){let k=reportKey();return clone(drafts[k]||emptyRecord())}
function preserveDraft(){if(!signedIn()||archiveViewing)return;drafts[reportKey()]=clone(record);store(perUserKey(DRAFTS_KEY),drafts)}
function toast(message,error=false){let t=$('toast');t.textContent=message;t.className='toast '+(error?'error':'success');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),3600)}
function isExcelImportedReport(r){return !!r&&r.source==='migration'&&String(r.imported_from||'').startsWith('google_drive_xlsx:')}
function importedReportTimestamp(r){return r?(isExcelImportedReport(r)?r.created_at:r.source==='migration'?(r.source_sent_at||r.created_at):r.created_at):null}
function reportImportLabel(r){return isExcelImportedReport(r)?'Excel — مزامنة آلية':r?.source==='migration'?'واتساب — أرشيف تاريخي':'الموقع'}
function updateSaveStatus(){
 const x=$('saveStatus'),key=reportKey();
 const saved=dailySelectedReport;
 const sourceTime=importedReportTimestamp(saved);
 const stamp=sourceTime?dashboardSubmitTime(sourceTime):null;
 if(dailyLookupBusy)x.textContent='جارٍ استرجاع التقرير من قاعدة البيانات…';
 else if(dailyLookupError)x.textContent='تعذّر التحقق من بيانات هذا التاريخ؛ لا يمكن الإرسال قبل إعادة المحاولة';
 else if(editingReportId)x.textContent='تعديل تقرير محفوظ — سوبر أدمن';
 else if(archiveViewing&&saved){
  x.textContent=isExcelImportedReport(saved)
   ?'تقرير مستورد من ملف Excel — تاريخ ووقت حفظه في الموقع: '+(stamp?.date||'—')+'، '+(stamp?.time||'—')
   :saved.source==='migration'
   ?'تقرير يومي محفوظ — وقت رسالة واتساب الأصلية: '+(stamp?.date||'—')+'، '+(stamp?.time||'—')+' (استيراد تاريخي لاحق)'
   :'تقرير يومي محفوظ — وقت إرساله عبر الموقع: '+(stamp?.date||'—')+'، '+(stamp?.time||'—');
 }else if(archiveViewing)x.textContent='تقرير محفوظ — للقراءة فقط';
 else x.textContent=isAdmin()&&!isSuperAdmin()?'الأدمن — عرض فقط':receipts[key]?'تم الإرسال مركزيًا':cloudReady?'مسودة لم ترسل':'جارٍ الاتصال أو تعذّر';
 $('saveBtn').textContent=editingReportId?'☁ حفظ تعديل التقرير':'☁ إرسال التقرير';
 $('saveBtn').disabled=!signedIn()||!cloudReady||dailyLookupBusy||dailyLookupError||
  archiveViewing||cloudSubmitting||(isAdmin()&&!isSuperAdmin())||(!editingReportId&&!!receipts[key]);
 if(archiveViewing){
  for(const field of $('reportInputFields').querySelectorAll('input,textarea,select'))field.disabled=true;
 }
}
async function loadSelectedDailyReport(){
 const request=++dailyLookupVersion,lookupStation=stationId,lookupDate=date;
 if(!signedIn()||!cloudReady)return;
 dailyLookupBusy=true;dailyLookupError=false;updateSaveStatus();
 try{
  const query=new URLSearchParams({select:'id,station_id,report_date,data,config_snapshot,created_at,source,source_sent_at,imported_from',
    station_id:'eq.'+lookupStation,report_date:'eq.'+lookupDate,limit:'1'});
  const response=await authedFetch('/rest/v1/reports?'+query.toString());
  if(!response.ok)throw Error('تعذّر جلب التقرير من قاعدة البيانات ('+response.status+').');
  const result=await response.json();
  if(request!==dailyLookupVersion||lookupStation!==stationId||lookupDate!==date)return;
  if(!Array.isArray(result))throw Error('وصلت استجابة غير صحيحة من قاعدة البيانات.');
  const r=result[0];
  if(r){
   archiveViewing=true;
   dailySelectedReport=r;
   archiveConfig=r.config_snapshot&&Array.isArray(r.config_snapshot.metrics)?r.config_snapshot:null;
   record={...emptyRecord(),metrics:r.data?.metrics||{},groups:r.data?.groups||{},notes:r.data?.notes||{},excel:r.data?.excel||{}};
  }else{
   archiveViewing=false;archiveConfig=null;dailySelectedReport=null;
   record=fetchRecord();
  }
  renderInputs();renderReport();
 }catch(error){
  if(request!==dailyLookupVersion)return;
  dailyLookupError=true;
  toast(error.message||'تعذّر التحقق من التقرير المحفوظ.',true);
 }finally{
  if(request===dailyLookupVersion){dailyLookupBusy=false;updateSaveStatus();}
 }
}
function goTo(s,d){
 if(!stations.some(x=>x.id===s)||(currentRole==='station'&&s!==currentStationId))return;
 preserveDraft();
 ++dailyLookupVersion;dailyLookupBusy=false;dailyLookupError=false;dailySelectedReport=null;
 archiveViewing=false;archiveConfig=null;editingReportId=null;
 $('reportDate').disabled=false;$('stationSelect').disabled=!isAdmin();
 stationId=s;date=d;record=fetchRecord();
 $('reportDate').value=date;$('stationSelect').value=stationId;
 renderInputs();renderReport();updateSaveStatus();
 if(signedIn()&&cloudReady)loadSelectedDailyReport();
}
function refreshSelects(){let val=stationId;$('stationSelect').innerHTML=stations.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');if(!stations.some(s=>s.id===val))stationId=stations[0].id;$('stationSelect').value=stationId}
function fieldHtml(label,value,attrs={},unit='',wide=false){let attr=Object.entries(attrs).map(([k,v])=>`${k}="${esc(v)}"`).join(' ');return `<div class="field${wide?' wide':''}"><label>${esc(label)}</label><div class="input-group"><input class="control" type="${attrs['data-text']==='1'?'text':'number'}" ${attrs['data-text']==='1'?'':'step="any" inputmode="decimal"'} value="${esc(value??'')}" ${attr} placeholder="—"><span class="unit">${esc(unit)}</span></div></div>`}
function metricAuto(m){if(!m.auto)return null;if(m.auto==='meter'){let g=record.groups.meter||{};let a=num((g.current||{}).value),b=num((g.previous||{}).value);return a!==null&&b!==null&&a>=b?a-b:null}if(m.auto==='wtp'){let w=selected().groups.find(x=>x.kind==='wtp'),g=w?(record.groups[w.id]||{}):{},r=g[m.id]||{};if(!m.additive)return num(r.total);let values=Array.from({length:w?.units||2},(_,i)=>num(r['wtp'+(i+1)]));return values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):num(r.total)}let g=selected().groups.find(x=>x.id===m.auto);if(!g)return null;let values=g.items.map(it=>num(((record.groups[g.id]||{})[it.id]||{}).value));return values.some(v=>v!==null)?values.reduce((a,b)=>a+(b??0),0):null}
function metricValue(m){let v=record.metrics[m.id];if(v!==undefined&&v!==null&&String(v)!=='')return v;let a=metricAuto(m);return a===null?'':a}
function renderInputs(){let s=selected();let html=`<section class="edit-section"><h3>المؤشرات الرئيسية <small>${s.metrics.filter(m=>m.visible!==false).length} مؤشر</small></h3><div class="section-fields">`;
for(let m of s.metrics.filter(x=>x.visible!==false)){let v=record.metrics[m.id]??'';let auto=metricAuto(m);html+=fieldHtml(m.label,v,{'data-metric':m.id,'data-text':m.type==='text'?'1':'0'},m.unit);if(m.auto&&auto!==null)html+=`<div class="field-note" style="grid-column:1/-1;margin-top:-7px">الحساب المتاح لـ ${esc(m.label)}: ${fmt(auto)} ${esc(m.unit)}${String(v).trim()!==''&&num(v)!==null&&num(v)!==auto?' — القيمة اليدوية محفوظة':''}</div>`}
html+='</div></section>';
for(let g of s.groups.filter(x=>x.visible!==false&&x.items.length)){
html+=`<section class="edit-section"><h3>${esc(g.title)} <small>${g.items.length} عناصر</small></h3><div class="section-fields">`;
for(let it of g.items){let r=((record.groups[g.id]||{})[it.id]||{});
if(g.kind==='tanks'){
html+=`<div class="field wide"><label style="font-weight:900;color:#145a8f">${esc(it.label)}</label><div class="three-inputs">${fieldHtml('الكمية',r.qty??'',{'data-group':g.id,'data-item':it.id,'data-prop':'qty'},numberUnit)}${fieldHtml('المنسوب %',r.pct??'',{'data-group':g.id,'data-item':it.id,'data-prop':'pct'},'%')}${fieldHtml('السعة (اختياري)',r.capacity??'',{'data-group':g.id,'data-item':it.id,'data-prop':'capacity'},numberUnit)}</div></div>`;
for(let c of (it.children||[]))html+=fieldHtml(it.label+' — '+c.label,(r.children||{})[c.id]??'',{'data-group':g.id,'data-item':it.id,'data-child':c.id},numberUnit);
}else if(g.kind==='wtp'){
let units=Array.from({length:g.units||2},(_,i)=>fieldHtml('WTP'+(i+1),r['wtp'+(i+1)]??'',{'data-group':g.id,'data-item':it.id,'data-prop':'wtp'+(i+1)},it.unit)).join('');html+=`<div class="field wide"><label style="font-weight:900;color:#145a8f">${esc(it.label)}</label><div class="three-inputs">${units}${fieldHtml(it.additive?'المجموع (يدوي اختياري)':'قراءة المجموع',r.total??'',{'data-group':g.id,'data-item':it.id,'data-prop':'total'},it.unit)}</div></div>`;
}else {html+=fieldHtml(it.label,r.value??'',{'data-group':g.id,'data-item':it.id,'data-prop':'value'},it.unit||(g.kind==='values'?'':numberUnit),true)}
}
html+='</div></section>'
}
html+='<section class="edit-section"><h3>الحالة والملاحظات</h3><div class="section-fields">';
for(let f of s.noteFields||[]){html+=`<div class="field wide"><label>${esc(f.label)}</label>${f.id==='status'?`<input class="control" type="text" data-note="${esc(f.id)}" value="${esc(record.notes[f.id]??'')}" placeholder="مثال: تعمل / متوقفة / احتياطية">`:`<textarea class="control" rows="2" data-note="${esc(f.id)}" placeholder="أدخل ${esc(f.label)}">${esc(record.notes[f.id]??'')}</textarea>`}</div>`}
html+='</div></section>';$('reportInputFields').innerHTML=html;
}
function computePct(r){let p=num(r.pct);if(p===null){let q=num(r.qty),c=num(r.capacity);return q!==null&&c!==null&&c>0?100*q/c:null}return p}
function fraction(n,total){return total===null||total===0?0:Math.min(100,Math.max(0,100*n/total))}
function showVal(v){return fmt(v)}
function rowUnit(v,unit=numberUnit){return `${showVal(v)} <small style="font-size:11px;color:#96a0aa">${esc(unit)}</small>`}
function renderGroup(g){let body='';let gRec=record.groups[g.id]||{};
if(g.kind==='tanks'){
for(let it of g.items){let r=gRec[it.id]||{},p=computePct(r);let pct=p===null?'–':fmt(p)+'%';let child=(it.children||[]).map(c=>{let val=(r.children||{})[c.id];return `${esc(c.label)}: ${rowUnit(val)}`}).join('　 ·　 ');
body+=`<div class="report-data-row"><div class="tank-head"><span class="tank-name">${esc(it.label)}</span>${r.qty!==undefined&&r.qty!==''?`<span class="tank-value">${rowUnit(r.qty)}</span>`:''}</div><div class="tank-subline"><div class="bar-track"><div class="bar-fill" style="width:${p===null?0:Math.min(100,Math.max(0,p))}%"></div></div><span class="tank-percent">${pct}</span></div>${child?`<div class="tank-details">${child}</div>`:''}</div>`}
}else if(g.kind==='bars'){
let groupNumbers=g.items.map(it=>num((gRec[it.id]||{}).value));let sum=groupNumbers.some(v=>v!==null)?groupNumbers.reduce((a,b)=>a+(b??0),0):null;
let m=selected().metrics.find(m=>m.id===g.metricKey);let official=m?num(metricValue(m)):null;let total=official!==null?official:sum;
for(let [i,it] of g.items.entries()){let v=groupNumbers[i];let pct=v!==null&&total!==null?fraction(v,total):0;body+=`<div class="report-data-row bar-row"><span class="row-label">${esc(it.label)}</span><div class="bar-track"><div class="bar-fill purple" style="width:${pct}%"></div></div><span class="row-percent">${v!==null&&total!==null?Math.round(pct)+'%':'–'}</span><span class="row-number">${rowUnit(v===null?'':v)}</span></div>`}
}else if(g.kind==='wtp'){
let items=g.items;let html='';for(let it of items){let r=gRec[it.id]||{},values=Array.from({length:g.units||2},(_,i)=>num(r['wtp'+(i+1)])),manual=num(r.total);let t=manual!==null?manual:it.additive&&values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;let cells=values.map((v,i)=>`<div class="wtp-cell"><small>WTP${i+1}</small><strong>${showVal(v===null?'':v)}</strong></div>`).join('');html+=`<div class="report-data-row"><div class="wtp-row-head">${esc(it.label)} <small style="color:#8c9ba5">${esc(it.unit||'')}</small></div><div class="wtp-values" style="grid-template-columns:repeat(${Math.min(4,values.length+1)},minmax(0,1fr))">${cells}<div class="wtp-cell"><small>${it.additive?'المجموع':'قراءة مشتركة'}</small><strong>${showVal(t===null?'':t)}</strong></div></div></div>`}body=html;
}else if(g.kind==='meter'){
for(let it of g.items){let val=(gRec[it.id]||{}).value;body+=`<div class="report-data-row simple-stat"><span>${esc(it.label)}</span><span class="row-number">${showVal(val)}</span></div>`}
let dif=metricAuto({id:'receipt',auto:'meter'});if(dif!==null)body+=`<div class="report-data-row simple-stat"><span>الفرق بين القراءتين</span><span class="row-number">${rowUnit(dif)}</span></div>`;
}else{
for(let it of g.items){let val=(gRec[it.id]||{}).value;body+=`<div class="report-data-row simple-stat"><span>${esc(it.label)}</span><span class="row-number">${rowUnit(val,it.unit||numberUnit)}</span></div>`}
}
return `<section class="report-group"><h3 class="report-group-title">${esc(g.title)}</h3>${body||'<div class="no-data">—</div>'}</section>`
}
function sourceData(){return {metrics:record.metrics||{},groups:record.groups||{},notes:record.notes||{},excel:record.excel||{}}}
function excelSourceRows(data,source){return window.WSExcelReadings?.entries?.(data,source)||[]}
function excelSourceCard(item){
 const n=num(item.value);
 return '<div class="excel-source-card'+(item.category==='tanks'?' is-tank':'')+'"><small>'+esc(item.label)+'</small>'+
  '<strong>'+esc(fmt(item.value))+' <em>'+esc(item.unit)+'</em></strong>'+
  (item.unit==='%'&&n!==null?'<div class="excel-tank-track"><div class="excel-tank-fill" style="width:'+Math.max(0,Math.min(100,n))+'%"></div></div>':'')+'</div>';
}
function excelExtraPanel(){
 const entries=excelSourceRows(sourceData(),dailySelectedReport?.imported_from);
 if(!entries.length)return '';
 const main=entries.filter(x=>x.category!=='capacity'),capacity=entries.filter(x=>x.category==='capacity');
 return '<section class="excel-source-panel"><div class="excel-source-heading"><h3>بيانات الإنتاج والخزانات من Excel</h3>'+
  '<small>نسبة الخزن الداخلي الإجمالي لا تُنسب إلى خزان بعينه</small></div>'+
  '<div class="excel-source-grid">'+main.map(excelSourceCard).join('')+'</div>'+
  (capacity.length?'<div class="excel-capacities">'+capacity.map(x=>
   '<span>'+esc(x.label)+': '+esc(fmt(x.value))+' '+esc(x.unit)+'</span>').join('')+'</div>':'')+'</section>';
}
function excelDashboardFields(r){
 const entries=excelSourceRows(r?.data,r?.imported_from);
 if(!entries.length)return '';
 const main=entries.filter(x=>x.category!=='capacity'),capacity=entries.filter(x=>x.category==='capacity');
 return '<div class="dashboard-excel-readings"><h5>قراءات الإنتاج والخزانات</h5>'+
  '<div class="dashboard-excel-grid">'+main.map(x=>{
   const n=num(x.value);
   return '<div class="dashboard-excel-value"><small>'+esc(x.label)+'</small><strong>'+esc(fmt(x.value))+
    ' <em>'+esc(x.unit)+'</em></strong>'+
    (x.unit==='%'&&n!==null?'<div class="excel-tank-track"><div class="excel-tank-fill" style="width:'+Math.max(0,Math.min(100,n))+'%"></div></div>':'')+
    '</div>';
  }).join('')+'</div>'+
  (capacity.length?'<div class="dashboard-excel-capacity">'+capacity.map(x=>'<span>'+esc(x.label)+': '+esc(fmt(x.value))+' '+esc(x.unit)+'</span>').join('')+'</div>':'')+'</div>';
}
function renderReport(){let s=selected();let metrics=s.metrics.filter(m=>m.visible!==false);let groups=s.groups.filter(g=>g.visible!==false&&g.items.length);let title=`${formatDate(date)}`;
let cls=metrics.length>=8?'metrics-many':metrics.length===6?'metrics-medium':metrics.length<=4?'metrics-few':'';
let cards=metrics.map((m,i)=>{let v=metricValue(m);let shade=m.shade==='purple'?'purple':m.shade==='gray'?'gray':'blue';return `<div class="metric-card ${shade}"><div class="metric-label">${esc(m.label)}</div><div class="metric-value">${showVal(v)}</div><div class="metric-unit">${esc(m.unit||'')}</div></div>`}).join('');
let noteParts=(s.noteFields||[]).map(f=>({label:f.label,v:f.id==='notes'&&dailySelectedReport?.imported_from?(window.WSExcelReadings?.qualitativeNote?.(sourceData(),dailySelectedReport.imported_from)??record.notes[f.id]):record.notes[f.id]})).filter(x=>String(x.v??'').trim());
let footer=noteParts.map(x=>`${esc(x.label)}: ${esc(x.v)}`).join('　 |　 ');
let sections=groups.map(g=>renderGroup(g)).join('');
let emptyGroups=groups.length===1?' one-section':'';
let html=`<header class="report-header"><svg class="header-wave" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 135" preserveAspectRatio="none"><path d="M0 0H1280V41C1050 -10 880 31 673 58C455 89 242 110 0 105Z" fill="#50B4F2"/></svg><div class="report-brand-line"><img class="report-company-logo" alt="شعار شركة حلول المياه" src="${LOGO}"><div class="report-title-area"><div class="report-small-title">تقرير التشغيل اليومي</div><div class="report-plant-title">${esc(s.name)}</div><div class="report-date">${esc(title)}</div></div></div></header><div class="report-overlap"><div class="report-metrics">${cards}</div></div><div class="report-content">${excelExtraPanel()}<div class="report-sections${emptyGroups}">${sections||''}</div></div>${footer?`<footer class="report-footer"><div class="footer-notes">${footer}</div></footer>`:''}<div class="report-index"></div>`;
let sheet=$('reportSheet');sheet.className='report-sheet '+cls+(groups.length===0?' compact':'')+' station-'+s.id;sheet.innerHTML=html;
let n=groups.length;if(n===1)sheet.querySelector('.report-group').classList.add('full');
scalePreview();
}
function scalePreview(){let v=$('previewViewport'),s=$('reportSheet'),w=$('scaleWrap');if(!s||!v)return;let available=Math.max(220,v.clientWidth-24);let k=Math.min(1,available/1280);s.style.transform=`scale(${k})`;s.style.transformOrigin='top right';w.style.width=(1280*k)+'px';w.style.height=(s.offsetHeight*k)+'px';}
function applyField(target){let m=target.dataset.metric,n=target.dataset.note,g=target.dataset.group,i=target.dataset.item,p=target.dataset.prop,child=target.dataset.child;let v=target.value;
if(m!==undefined){record.metrics[m]=v}else if(n!==undefined){record.notes[n]=v}else if(g&&i){record.groups[g]||={};record.groups[g][i]||={};if(child){record.groups[g][i].children||={};record.groups[g][i].children[child]=v}else record.groups[g][i][p||'value']=v}
record.lastModified=new Date().toISOString();preserveDraft();updateSaveStatus();renderReport();}
$('reportInputFields').addEventListener('input',ev=>{if(ev.target.matches('[data-metric],[data-group],[data-note]'))applyField(ev.target)});
$('stationSelect').addEventListener('change',e=>goTo(e.target.value,date));$('reportDate').addEventListener('change',e=>{if(e.target.value)goTo(stationId,e.target.value)});
function validateReport(){
const errors=[],s=selected();
for(let m of s.metrics){let value=metricValue(m);if(m.required&&(value===null||value===undefined||String(value).trim()===''))errors.push('المؤشر المطلوب: '+m.label);if(m.type!=='text'&&num(value)!==null&&num(value)<0)errors.push('قيمة سالبة: '+m.label)}
for(let g of s.groups){let gr=record.groups[g.id]||{};for(let it of g.items){let r=gr[it.id]||{};if(g.kind==='tanks'){let p=computePct(r);if(p!==null&&(p<0||p>100))errors.push('منسوب غير صحيح: '+it.label);if(num(r.capacity)!==null&&num(r.capacity)<=0)errors.push('سعة خزان غير صحيحة: '+it.label)}}}
return errors;
}


async function saveReport(){
 if(!signedIn()||!cloudReady||cloudSubmitting){toast('يجب تسجيل الدخول والاتصال بالقاعدة المركزية.',true);return}
 if(isAdmin()&&!isSuperAdmin()){toast('حساب الأدمن للمتابعة والطباعة فقط.',true);return}
 if(currentRole==='station'&&stationId!==currentStationId){toast('ليس لديك صلاحية إرسال تقارير هذه المحطة.',true);return}
 if(archiveViewing){toast('التقارير المؤرشفة للقراءة فقط.',true);return}
 const k=reportKey();
 if(receipts[k]&&!editingReportId){toast('سبق إرسال هذا التقرير من حسابك.',true);return}
 const errors=validateReport();
 if(errors.length){toast('راجع الحقول: '+errors.slice(0,3).join('، '),true);return}
 if(!confirm((editingReportId?'تعديل التقرير المؤرشف':'اعتماد وإرسال التقرير')+' — '+selected().name+' بتاريخ '+date+'؟'))return;
 cloudSubmitting=true;updateSaveStatus();
 try{
  const requestId=requestIds[k]||(crypto.randomUUID?crypto.randomUUID():null);
  if(!requestId)throw Error('هذا المتصفح لا يدعم معرفات الطلب الآمنة');
  requestIds[k]=requestId;store(perUserKey(REQUESTS_KEY),requestIds);
  const data={metrics:record.metrics,groups:record.groups,notes:record.notes};
   if(record.excel&&Object.keys(record.excel).length)data.excel=record.excel;
  const response=editingReportId?
   await authedFetch('/rest/v1/reports?id=eq.'+encodeURIComponent(editingReportId),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data})}):
   await authedFetch('/rest/v1/reports',{method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({station_id:stationId,report_date:date,request_id:requestId,source:'public',data})});
  const body=await response.json().catch(()=>[]);
  if(!response.ok){
   if(response.status===409)throw Error('يوجد بالفعل تقرير لهذا التاريخ والمحطة. افتح الأرشيف لعرضه.');
   if(response.status===401||response.status===403)throw Error('حسابك لا يملك صلاحية إرسال تقرير هذه المحطة.');
   throw Error('تعذر حفظ التقرير مركزيًا (HTTP '+response.status+').');
  }
  if(!Array.isArray(body)||!body[0]?.id)throw Error('لم يتم تأكيد رقم التقرير من Supabase');
  receipts[k]={receiptId:body[0].id,receivedAt:new Date().toISOString()};
  store(perUserKey(RECEIPTS_KEY),receipts);
  delete drafts[k];store(perUserKey(DRAFTS_KEY),drafts);
  editingReportId=null;$('reportDate').disabled=false;$('stationSelect').disabled=!isAdmin();
  await loadSelectedDailyReport();
  cloudNotice('تم حفظ التقرير.','ok');
  toast('تم حفظ التقرير مركزيًا بنجاح');
 }catch(e){toast(e.message||'تعذر الإرسال',true)}
 finally{cloudSubmitting=false;updateSaveStatus()}
}

async function restoreReport(){
 if(!signedIn()||!cloudReady)return toast('يلزم الاتصال بقاعدة البيانات.',true);
 if(dailyLookupBusy)return;
 if(!dailySelectedReport){
  try{
   const params=new URLSearchParams({select:'report_date',station_id:'eq.'+stationId,order:'report_date.desc',limit:'1'});
   const response=await authedFetch('/rest/v1/reports?'+params);
   if(!response.ok)throw Error('تعذر قراءة التقارير المركزية.');
   const rows=await response.json();
   if(!Array.isArray(rows)||!rows.length)return toast('لا توجد تقارير محفوظة لهذه المحطة.',true);
   goTo(stationId,rows[0].report_date);
   return;
  }catch(err){return toast(err.message,true);}
 }
 await loadSelectedDailyReport();
 toast('تم فتح التقرير المحفوظ للمراجعة.');
}
function newReport(){
 goTo(stationId,currentDate);
 toast('تم فتح نموذج اليوم.');
}
function clearFields(){
 if(archiveViewing||dailyLookupBusy||dailyLookupError){toast('التقرير المحفوظ للقراءة فقط؛ لا يمكن مسحه.',true);return;}
 if(!confirm('هل تريد مسح جميع قيم التقرير الحالي غير المحفوظة؟'))return;
 record=emptyRecord();preserveDraft();renderInputs();renderReport();updateSaveStatus();toast('تم مسح حقول الإدخال');
}
function downloadBlob(blob,name){let u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),45000)}
const fileStem=()=>selected().name.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_')+'_'+date;
// Offline PNG renderer: paints the actual layout geometry and text from the live report.
// This avoids cross-origin canvas security restrictions imposed on SVG foreignObject screenshots.
async function reportBlob(){
  await document.fonts.ready;
  return await renderDomToCanvas();
}
async function renderDomToCanvas(){
  const root=$('reportSheet');
  const rr=root.getBoundingClientRect(), scale=rr.width/root.offsetWidth;
  const W=1280,H=Math.ceil(root.scrollHeight),ratio=2;
  const canvas=document.createElement('canvas');canvas.width=W*ratio;canvas.height=H*ratio;
  const ctx=canvas.getContext('2d',{alpha:false});ctx.scale(ratio,ratio);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const pos=r=>({x:(r.left-rr.left)/scale,y:(r.top-rr.top)/scale,w:r.width/scale,h:r.height/scale});
  const isTransparent=s=>s==='transparent'||s==='rgba(0, 0, 0, 0)'||!s;
  const radii=s=>{let v=parseFloat(s)||0;return Math.max(0,v)};
  function rectangle(p,color,r=0,borderColor='',borderWidth=0){
    if(!p||p.w<0.1||p.h<0.1)return;
    const rad=Math.min(r,Math.min(p.w,p.h)/2);
    ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,rad);
    if(color&&!isTransparent(color)){ctx.fillStyle=color;ctx.fill()}
    if(borderWidth>0&&borderColor&&!isTransparent(borderColor)){ctx.strokeStyle=borderColor;ctx.lineWidth=borderWidth;ctx.stroke()}
  }
  function wave(el){const p=pos(el.getBoundingClientRect());ctx.fillStyle='#50B4F2';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+p.w,p.y);ctx.lineTo(p.x+p.w,p.y+p.h*.30);ctx.bezierCurveTo(p.x+p.w*.82,p.y-p.h*.07,p.x+p.w*.69,p.y+p.h*.23,p.x+p.w*.53,p.y+p.h*.43);ctx.bezierCurveTo(p.x+p.w*.36,p.y+p.h*.66,p.x+p.w*.19,p.y+p.h*.82,p.x,p.y+p.h*.78);ctx.closePath();ctx.fill()}
  function drawTextNode(node,parent){
    const text=node.textContent||'';if(!text.trim())return;
    const st=getComputedStyle(parent),fontSize=parseFloat(st.fontSize)||16, weight=st.fontWeight;
    ctx.font=`${weight} ${fontSize}px ${st.fontFamily}`;
    ctx.fillStyle=st.color||'#333';ctx.textBaseline='alphabetic';
    ctx.direction=st.direction==='ltr'?'ltr':'rtl';
    const len=text.length;
    let range=document.createRange(), groups=[];
    for(let i=0;i<len;i++){
      if(text[i]==='\n' || text[i]==='\r')continue;
      range.setStart(node,i);range.setEnd(node,i+1);
      let r=range.getBoundingClientRect();if(!r.width&&!r.height)continue;
      let p=pos(r);
      let last=groups[groups.length-1];
      if(!last||Math.abs(last.y-p.y)>4){last={y:p.y,x:p.x,right:p.x+p.w,bottom:p.y+p.h,text:''};groups.push(last)}
      last.text+=text[i];last.x=Math.min(last.x,p.x);last.right=Math.max(last.right,p.x+p.w);last.bottom=Math.max(last.bottom,p.y+p.h);
    }
    for(let g of groups){if(!g.text.trim())continue;
      ctx.textAlign=ctx.direction==='ltr'?'left':'right';
      let x=ctx.direction==='ltr'?g.x:g.right;
      let y=g.bottom-(Math.max(0,(g.bottom-g.y-fontSize)/2))-(fontSize*.08);
      ctx.fillText(g.text.trim(),x,y);
    }
    range.detach?.();
  }
  function paint(node){
    if(node.nodeType===3){drawTextNode(node,node.parentElement);return}
    if(node.nodeType!==1)return;
    const el=node,tag=el.tagName.toLowerCase(),style=getComputedStyle(el);
    if(style.display==='none'||style.visibility==='hidden'||parseFloat(style.opacity)===0)return;
    if(tag==='svg'&&el.classList.contains('header-wave')){wave(el);return}
    const p=pos(el.getBoundingClientRect());
    if(!isTransparent(style.backgroundColor))rectangle(p,style.backgroundColor,radii(style.borderTopLeftRadius));
    let bw=parseFloat(style.borderTopWidth)||0;
    if(bw>0&&style.borderTopStyle!=='none'&&style.borderTopStyle!=='dashed'&&style.borderTopStyle!=='dotted'){
      rectangle(p,'',radii(style.borderTopLeftRadius),style.borderTopColor,bw);
    }
    if(el.classList.contains('metric-card')){
      let band=el.classList.contains('purple')?'#87329A':el.classList.contains('gray')?'#c8d5e0':'#50B4F2';
      rectangle({x:p.x,y:p.y,w:p.w,h:7},band,0);
    }
    if(el.classList.contains('report-group-title')){
      rectangle({x:p.x+p.w-6,y:p.y+(p.h-24)/2,w:6,h:24},'#87329A',3);
    }
    if(tag==='img'){
      if(el.complete&&el.naturalWidth){
        ctx.save();ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,Math.min(18,p.h/3));ctx.clip();ctx.drawImage(el,p.x,p.y,p.w,p.h);ctx.restore();
      }return;
    }
    for(const child of el.childNodes)paint(child);
  }
  paint(root);
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('تعذر تحويل لوحة التقرير إلى صورة')),'image/png'));
}

async function exportPNG(){let btn=$('exportBtn');btn.disabled=true;try{let png=await reportBlob();downloadBlob(png,fileStem()+'.png');logActivity('IMAGE_EXPORTED');toast('تم تجهيز صورة PNG بدقة 2x')}catch(e){console.error(e);toast('تعذر تصدير الصورة على هذا المتصفح: '+e.message,true)}finally{btn.disabled=false}}
async function sharePNG(){let b=$('shareBtn');b.disabled=true;try{let image=await reportBlob(),file=new File([image],fileStem()+'.png',{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'تقرير التشغيل اليومي - '+selected().name});logActivity('SHARE_REQUESTED');toast('تم فتح نافذة مشاركة الصورة')}else{downloadBlob(image,file.name);logActivity('IMAGE_EXPORTED');toast('تم حفظ الصورة؛ افتح واتساب وأرفق الصورة من جهازك.') }}catch(e){if(e.name!=='AbortError'){console.error(e);toast('تعذرت المشاركة المباشرة؛ استخدم زر حفظ PNG ثم أرسل الصورة في واتساب.',true)}}finally{b.disabled=false}}
function backup(){let data={format:'wsc-water-daily-v2',exportedAt:new Date().toISOString(),stations,reports};downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),'نسخة_التقارير_التشغيلية_'+currentDate+'.json');toast('تم تصدير نسخة احتياطية للإعدادات والتقارير')}
async function importBackup(file){try{let data=JSON.parse(await file.text());if(data.format!=='wsc-water-daily-v2'||!Array.isArray(data.stations)||typeof data.reports!=='object'||!data.reports)throw Error('الملف ليس نسخة احتياطية من هذا النظام');if(!confirm('سيتم استبدال بيانات المحطات والتقارير الحالية بالنسخة المستوردة. هل تريد المتابعة؟'))return;stations=data.stations;reports=data.reports;store(KEY_STATIONS,stations);store(KEY_REPORTS,reports);drafts={};stationId=stations[0].id;date=currentDate;refreshSelects();record=fetchRecord();$('reportDate').value=date;renderInputs();renderReport();updateSaveStatus();toast('تم استيراد النسخة الاحتياطية بنجاح')}catch(e){toast('تعذر استيراد الملف: '+e.message,true)}}
function openFullscreen(){let overlay=$('fullscreenOverlay');let copy=$('reportSheet').cloneNode(true);copy.removeAttribute('id');copy.style.transform='none';copy.style.width='1280px';$('fullscreenContent').replaceChildren(copy);overlay.classList.remove('hidden');document.body.style.overflow='hidden'}
function closeFullscreen(){$('fullscreenOverlay').classList.add('hidden');$('fullscreenContent').replaceChildren();document.body.style.overflow=''}
$('saveBtn').onclick=saveReport;$('restoreBtn').onclick=restoreReport;$('newBtn').onclick=newReport;$('clearBtn').onclick=clearFields;$('exportBtn').onclick=exportPNG;$('shareBtn').onclick=sharePNG;$('printBtn').onclick=()=>{logActivity('PRINT_REQUESTED');window.print()};$('fullBtn').onclick=openFullscreen;$('exitFullBtn').onclick=closeFullscreen;$('exportFullBtn').onclick=exportPNG;$('backupBtn').onclick=backup;$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=e=>{let file=e.target.files[0];if(file)importBackup(file);e.target.value=''};
$('fullscreenOverlay').addEventListener('click',e=>{if(e.target.id==='fullscreenOverlay')closeFullscreen()});
// Settings editor: all changes are made through the interface; no code edits necessary.
const editStation=()=>stations.find(s=>s.id===editorStationId)||stations[0];
let settingsBackup=null;
function saveStations(){refreshSelects()}

function openSettings(){
 if(!signedIn()||!cloudReady)return;
 preserveDraft();
 settingsEditing=true;
 settingsBackup=clone(stations);
 pendingInactiveIds=[];
 editorStationId=currentRole==='station'?currentStationId:stationId;
 $('deleteStationBtn').classList.toggle('hidden',!isAdmin());
 $('settingsTitle').textContent=currentRole==='station'?'إدارة المحطة':'إدارة المحطات';
 renderSettings();
 $('modalBackdrop').classList.remove('hidden');
}
function discardSettings(){
 if(!settingsEditing||!signedIn())return;
 if(settingsBackup)stations=clone(settingsBackup);
 pendingInactiveIds=[];
 settingsEditing=false;
 settingsBackup=null;
 $('modalBackdrop').classList.add('hidden');
 refreshSelects();renderInputs();renderReport();updateSaveStatus();
}
async function closeSettings(){
 if(!signedIn()||!settingsEditing)return;
 const button=$('settingsDone');button.disabled=true;
 try{
  if(stations.length===0)throw Error('يجب الإبقاء على محطة واحدة على الأقل.');
  if(currentRole==='station'&&(stations.length!==1||stations[0]?.id!==currentStationId||pendingInactiveIds.length))
   throw Error('التعديل متاح لمحطتك فقط.');
  for(const item of stations){
   if(item.name.trim().length<2||item.name.length>200)throw Error('اسم محطة غير صالح.');
   if(!Array.isArray(item.metrics)||!Array.isArray(item.groups)||!Array.isArray(item.noteFields))
    throw Error('إعدادات المحطة غير مكتملة: '+item.id);
   const previous=settingsBackup?.find(s=>s.id===item.id);
   if(previous&&JSON.stringify(previous)===JSON.stringify(item))continue;
   const response=await authedFetch('/functions/v1/station-settings',{
    method:'POST',body:JSON.stringify({
     action:'save',config:item,expectedUpdatedAt:stationVersions[item.id]||null
    })
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok){
    if(response.status===409)throw Error('تغيّرت إعدادات '+item.name+' من حساب آخر. أغلق النافذة وحدّث الصفحة ثم حاول مجددًا.');
    throw Error('تعذر حفظ '+item.name+' ('+(result.error||response.status)+').');
   }
   stationVersions[item.id]=result.station?.updated_at||stationVersions[item.id];
  }
  if(pendingInactiveIds.length&&!isAdmin())throw Error('تعطيل المحطات متاح للإدارة فقط.');
  for(const id of pendingInactiveIds){
   const response=await authedFetch('/functions/v1/station-settings',{
    method:'POST',body:JSON.stringify({
     action:'deactivate',stationId:id,expectedUpdatedAt:stationVersions[id]||null
    })
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error('تعذر تعطيل المحطة ('+(result.error||response.status)+').');
   delete stationVersions[id];
  }
  settingsEditing=false;
  pendingInactiveIds=[];
  settingsBackup=null;
  $('modalBackdrop').classList.add('hidden');
  await loadCloudStations();
  toast('تم حفظ إعدادات المحطة.');
 }catch(err){toast(err.message||'تعذر الحفظ.',true)}
 finally{button.disabled=false}
}
function setAttr(e,object,key,value){object[key]=value;saveStations();if(['visible','kind','auto'].includes(key))renderSettings()}
function renderSettings(){let s=editStation();let options=stations.map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?'selected':''}>${esc(x.name)}</option>`).join('');let html=(isAdmin()?`<div class="settings-controls"><div class="field" style="flex:1;min-width:200px"><label>المحطة الجاري إعدادها</label><select class="control" id="editStationSelect">${options}</select></div><button class="btn primary" data-action="addStation">＋ إضافة محطة</button></div>`:`<div class="settings-controls"><strong>${esc(s.name)}</strong></div>`)+`<div class="settings-controls"><div class="field" style="flex:1"><label>الاسم الرسمي للمحطة</label><input class="control" data-settings-name="1" value="${esc(s.name)}"></div></div>`;
html+=`<div class="setting-group"><h3>المؤشرات التشغيلية (${s.metrics.length})</h3>`;
for(let [i,m] of s.metrics.entries()){
let opts=[['','يدوي'],['lines','مجموع الخطوط'],['gates','مجموع البوابات'],['pumps','مجموع محطات الضخ'],['meter','فرق العداد'],['wtp','مجموع WTP']].map(([v,l])=>`<option value="${v}" ${m.auto===v?'selected':''}>${l}</option>`).join('');
html+=`<div class="setting-item" data-metric-row="${i}"><input class="control" title="اسم المؤشر" data-m-setting="label" data-index="${i}" value="${esc(m.label)}"><input class="control" style="flex:0 1 100px" title="الوحدة" data-m-setting="unit" data-index="${i}" value="${esc(m.unit||'')}"><select class="control" style="flex:0 1 130px" title="مصدر الحساب" data-m-setting="auto" data-index="${i}">${opts}</select><label class="setting-inline"><input type="checkbox" data-m-setting="visible" data-index="${i}" ${m.visible!==false?'checked':''}>ظاهر</label><label class="setting-inline"><input type="checkbox" data-m-setting="required" data-index="${i}" ${m.required?'checked':''}>إلزامي</label><button class="btn icon-btn" data-action="moveMetricUp" data-index="${i}" title="للأعلى">↑</button><button class="btn icon-btn" data-action="moveMetricDown" data-index="${i}" title="للأسفل">↓</button><button class="btn danger icon-btn" data-action="removeMetric" data-index="${i}" title="حذف">×</button></div>`}
html+=`<button class="btn" data-action="addMetric">＋ إضافة مؤشر</button></div>`;
html+='<div class="setting-group"><h3>الأقسام والعناصر</h3>';
for(let [gi,g] of s.groups.entries()){
html+=`<div class="setting-group" style="background:#f9fbfd"><div class="settings-controls"><input class="control" style="flex:1;min-width:150px" data-g-setting="title" data-gi="${gi}" value="${esc(g.title)}"><select class="control" style="flex:0 1 145px" data-g-setting="kind" data-gi="${gi}">${[['tanks','خزانات'],['bars','أشرطة ضخ/بوابات'],['values','كميات مواد ومرافق'],['wtp','WTP / RO'],['meter','قراءات عداد']].map(([k,l])=>`<option value="${k}" ${k===g.kind?'selected':''}>${l}</option>`).join('')}</select>${g.kind==='wtp'?`<select class="control" style="flex:0 1 110px" title="عدد وحدات WTP" data-g-setting="units" data-gi="${gi}">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===(g.units||2)?'selected':''}>${n} WTP</option>`).join('')}</select>`:''}<label class="setting-inline"><input type="checkbox" data-g-setting="visible" data-gi="${gi}" ${g.visible!==false?'checked':''}>إظهار</label><button class="btn danger" data-action="removeGroup" data-gi="${gi}">حذف القسم</button></div>`;
for(let [ii,it] of g.items.entries())html+=`<div class="setting-item"><input class="control" data-it-setting="label" data-gi="${gi}" data-ii="${ii}" value="${esc(it.label)}"><input class="control" style="flex:0 1 105px" title="الوحدة" data-it-setting="unit" data-gi="${gi}" data-ii="${ii}" value="${esc(it.unit||'')}">${g.kind==='wtp'?`<label class="setting-inline"><input type="checkbox" data-it-setting="additive" data-gi="${gi}" data-ii="${ii}" ${it.additive?'checked':''}>قابل للجمع</label>`:''}<button class="btn danger icon-btn" data-action="removeItem" data-gi="${gi}" data-ii="${ii}" title="حذف العنصر">×</button></div>`;
html+=`<button class="btn" data-action="addItem" data-gi="${gi}">＋ إضافة عنصر</button></div>`
}html+=`<button class="btn" data-action="addGroup">＋ إضافة قسم جديد</button></div>`;
html+='<div class="setting-group"><h3>حقول الملاحظات</h3>';for(let [i,f] of (s.noteFields||[]).entries())html+=`<div class="setting-item"><input class="control" data-note-setting="label" data-ni="${i}" value="${esc(f.label)}"><button class="btn danger icon-btn" data-action="removeNote" data-ni="${i}">×</button></div>`;html+='<button class="btn" data-action="addNote">＋ إضافة حقل ملاحظات</button></div>';
$('settingsBody').innerHTML=html;
}
$('settingsBody').addEventListener('change',e=>{let t=e.target,s=editStation();if(t.id==='editStationSelect'){if(!isAdmin())return;editorStationId=t.value;renderSettings();return}if(t.dataset.settingsName){s.name=t.value.trim()||s.name;saveStations();renderSettings();return}if(t.dataset.mSetting){let m=s.metrics[Number(t.dataset.index)];m[t.dataset.mSetting]=t.type==='checkbox'?t.checked:t.value;saveStations();return}if(t.dataset.gSetting){let g=s.groups[Number(t.dataset.gi)];g[t.dataset.gSetting]=t.type==='checkbox'?t.checked:t.dataset.gSetting==='units'?Number(t.value):t.value;saveStations();if(t.dataset.gSetting==='kind')renderSettings();return}if(t.dataset.itSetting){let i=s.groups[Number(t.dataset.gi)].items[Number(t.dataset.ii)];i[t.dataset.itSetting]=t.type==='checkbox'?t.checked:t.value;saveStations();return}if(t.dataset.noteSetting){s.noteFields[Number(t.dataset.ni)].label=t.value;saveStations()}});
$('settingsBody').addEventListener('click',e=>{let b=e.target.closest('[data-action]');if(!b)return;let action=b.dataset.action,s=editStation(),idx=Number(b.dataset.index),gi=Number(b.dataset.gi),ii=Number(b.dataset.ii),ni=Number(b.dataset.ni);
const unique=(prefix,arr)=>{let id;do{id=prefix+'_'+Math.random().toString(36).slice(2,7)}while(arr.some(x=>x.id===id));return id};
if(action==='addStation'){if(!isAdmin())return;let name=prompt('اسم المحطة الجديدة:');if(!name?.trim())return;let id=unique('station',stations);stations.push({id,name:name.trim(),metrics:[metric('production','الإنتاج')],groups:[],noteFields:notes('حالة التشغيل','سبب التوقف','ملاحظات التشغيل')});editorStationId=id}
if(action==='addMetric'){let label=prompt('اسم المؤشر الجديد:');if(!label?.trim())return;let unit=prompt('وحدة القياس (اتركه فارغًا إذا لا توجد وحدة):',numberUnit)||'';s.metrics.push(metric(unique('metric',s.metrics),label.trim(),unit))}
if(action==='removeMetric'){if(confirm('حذف المؤشر من إعدادات هذه المحطة؟'))s.metrics.splice(idx,1)}
if(action==='moveMetricUp'&&idx>0)[s.metrics[idx-1],s.metrics[idx]]=[s.metrics[idx],s.metrics[idx-1]];
if(action==='moveMetricDown'&&idx<s.metrics.length-1)[s.metrics[idx+1],s.metrics[idx]]=[s.metrics[idx],s.metrics[idx+1]];
if(action==='addGroup'){let title=prompt('اسم القسم الجديد (مثل: خزانات المياه):');if(!title?.trim())return;let kind=prompt('نوع القسم: tanks أو bars أو values أو wtp أو meter','tanks');if(!['tanks','bars','values','wtp','meter'].includes(kind))kind='values';s.groups.push(group(unique('group',s.groups),title.trim(),kind,[]))}
if(action==='removeGroup'){if(confirm('حذف القسم وجميع أسماء عناصره؟'))s.groups.splice(gi,1)}
if(action==='addItem'){let name=prompt('اسم العنصر الجديد:');if(!name?.trim())return;let g=s.groups[gi];g.items.push(item(unique('item',g.items),name.trim(),g.kind==='wtp'?{unit:dayUnit,additive:true}:{}))}
if(action==='removeItem'){if(confirm('حذف هذا العنصر؟'))s.groups[gi].items.splice(ii,1)}
if(action==='addNote'){let label=prompt('عنوان حقل الملاحظات الجديد:');if(!label?.trim())return;s.noteFields||=[];s.noteFields.push(item(unique('note',s.noteFields),label.trim()))}
if(action==='removeNote'){if(confirm('حذف حقل الملاحظات؟'))s.noteFields.splice(ni,1)}
saveStations();renderSettings();});
$('settingsBtn').onclick=openSettings;$('closeSettings').onclick=closeSettings;$('settingsDone').onclick=closeSettings;
$('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')discardSettings()});
$('deleteStationBtn').onclick=()=>{if(!isAdmin())return;let s=editStation();if(stations.length<=1){toast('يجب الإبقاء على محطة واحدة على الأقل',true);return}if(!confirm('تعطيل محطة «'+s.name+'» وإخفاؤها من الدخول والتقارير الجديدة؟ ستبقى السجلات السابقة محفوظة.'))return;
 if(settingsBackup?.some(x=>x.id===s.id))pendingInactiveIds.push(s.id);
 stations=stations.filter(x=>x.id!==s.id);editorStationId=stations[0].id;if(stationId===s.id)stationId=editorStationId;saveStations();renderSettings()};
$('resetStationsBtn').onclick=discardSettings;
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('fullscreenOverlay').classList.contains('hidden'))closeFullscreen();else if(!$('modalBackdrop').classList.contains('hidden'))discardSettings()}});
window.addEventListener('resize',scalePreview);
// Boot
refreshSelects();$('reportDate').value=date;record=fetchRecord();renderInputs();renderReport();updateSaveStatus();



const ARCHIVE_PAGE_SIZE=1000;
const ARCHIVE_SHOW_STEP=60;
let archiveMode='daily',archiveRows=[],archiveHistoricalRows=[],archiveVisibleCount=ARCHIVE_SHOW_STEP;
let archiveQueryInfo=null,archiveSearchVersion=0,archiveSuggestedMonth='';

function archiveChosenStation(){
 if(!signedIn())throw Error('سجّل الدخول أولًا.');
 if(!isAdmin())return currentStationId;
 const chosen=$('archiveStation').value;
 if(chosen&&!stations.some(s=>s.id===chosen))throw Error('المحطة المحددة غير متاحة.');
 return chosen;
}
function archivePeriod(){
 const mode=archiveMode;
 if(mode==='monthly'){
  const month=$('archiveMonth').value;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('اختر شهرًا صحيحًا.');
  const [year,mm]=month.split('-').map(Number);
  const last=new Date(Date.UTC(year,mm,0)).toISOString().slice(0,10);
  return {mode,from:month+'-01',to:last,month,year};
 }
 if(mode==='yearly'){
  const year=Number($('archiveYear').value);
  if(!Number.isInteger(year)||year<2020||year>2100)throw Error('اختر سنة صحيحة.');
  return {mode,from:year+'-01-01',to:year+'-12-31',year};
 }
 const from=$('archiveFrom').value,to=$('archiveTo').value;
 if(from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))throw Error('تاريخ البداية غير صحيح.');
 if(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('تاريخ النهاية غير صحيح.');
 if(from&&to&&from>to)throw Error('تاريخ البداية أكبر من تاريخ النهاية.');
 return {mode,from,to,year:from?Number(from.slice(0,4)):null};
}
function archiveSetMode(mode){
 if(!['daily','monthly','yearly'].includes(mode))return;
 archiveMode=mode;
 for(const el of document.querySelectorAll('[data-archive-mode]')){
  const active=el.dataset.archiveMode===mode;
  el.classList.toggle('active',active);
  el.setAttribute('aria-selected',String(active));
 }
 $('archiveDailyFields').classList.toggle('hidden',mode!=='daily');
 $('archiveMonthField').classList.toggle('hidden',mode!=='monthly');
 $('archiveYearField').classList.toggle('hidden',mode!=='yearly');
 $('archiveResults').innerHTML='<div class="archive-empty">اضغط «عرض التقارير» لعرض البيانات.</div>';
 $('archiveExports').classList.add('hidden');
 archiveRows=[];archiveQueryInfo=null;archiveVisibleCount=ARCHIVE_SHOW_STEP;
 archiveSearchVersion++;
 $('archiveSearch').disabled=false;
 $('archiveResults').setAttribute('aria-busy','false');
}
function archiveOpen(){
 if(!signedIn())return;
 $('archiveModal').classList.remove('hidden');
 if(!isAdmin()&&!stations.some(s=>s.id===currentStationId))return;
 $('archiveStation').innerHTML=isAdmin()
  ?'<option value="">جميع المحطات</option>'+stations.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')
  :'<option value="'+esc(currentStationId)+'">'+esc(stations.find(s=>s.id===currentStationId)?.name||currentStationId)+'</option>';
 $('archiveStation').value=isAdmin()?'':currentStationId;
 $('archiveStation').disabled=!isAdmin();
 $('archiveStationField').classList.toggle('hidden',!isAdmin());
 const end=dashboardSaudiDate();
 $('archiveFrom').value=dashboardShiftDate(end,-89);
 $('archiveTo').value=end;
 $('archiveMonth').value=archiveSuggestedMonth||end.slice(0,7);
 $('archiveYear').value=end.slice(0,4);
 archiveSetMode('daily');
 archiveSearch();
}
function archiveClose(){
 archiveSearchVersion++;
 $('archiveModal').classList.add('hidden');
}
async function archiveFetchAll(scope,period,searchVersion){
 const results=[];
 for(let offset=0;offset<=20000;offset+=ARCHIVE_PAGE_SIZE){
  if(searchVersion!==archiveSearchVersion)throw Error('تم تغيير البحث.');
  const p=new URLSearchParams({
   select:'id,station_id,report_date,data,config_snapshot,created_at,source,source_sent_at,imported_from',
   order:'report_date.desc,created_at.desc',limit:String(ARCHIVE_PAGE_SIZE),offset:String(offset)
  });
  if(scope)p.set('station_id','eq.'+scope);
  if(period.from)p.append('report_date','gte.'+period.from);
  if(period.to)p.append('report_date','lte.'+period.to);
  const resp=await authedFetch('/rest/v1/reports?'+p.toString());
  if(!resp.ok)throw Error(resp.status===403?'ليس لديك صلاحية الوصول لهذه التقارير.':'تعذر تحميل التقارير ('+resp.status+').');
  const page=await resp.json();
  if(!Array.isArray(page))throw Error('البيانات المسترجعة غير صحيحة.');
  // Defense in depth: only use rows within account scope, even if a backend policy changes.
  const allowed=new Set((scope?[scope]:stations.map(s=>s.id)));
  results.push(...page.filter(r=>allowed.has(r.station_id)));
  if(page.length<ARCHIVE_PAGE_SIZE)return results;
 }
 throw Error('نتائج كثيرة جدًا. حدد محطة أو فترة زمنية أقصر.');
}

const HIST_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
async function archiveFetchHistorical(scope,period,version){
 if(!['monthly','yearly'].includes(period.mode))return [];
 const q=new URLSearchParams({select:'station_id,report_year,report_month,production_m3,diesel_consumption_m3,electricity_consumption_mw,source_file,source_note',order:'station_id.asc,report_month.asc'});
 q.set('report_year','eq.'+period.year);
 if(scope)q.set('station_id','eq.'+scope);
 if(period.mode==='monthly')q.set('report_month','eq.'+Number(period.month.slice(5,7)));
 const res=await authedFetch('/rest/v1/station_monthly_reports?'+q);
 if(!res.ok)throw Error('تعذّر تحميل السجل الشهري التاريخي ('+res.status+').');
 const rows=await res.json();
 if(version!==archiveSearchVersion)throw Error('تغيّر البحث.');
 const allowed=new Set(scope?[scope]:stations.map(s=>s.id));
 return Array.isArray(rows)?rows.filter(r=>allowed.has(r.station_id)):[];
}
function archiveHistoricalSection(records,period){
 if(!records.length)return '';
 const stationIds=[...new Set(records.map(r=>r.station_id))];
 let html='';
 for(const stationId of stationIds){
  const station=stations.find(s=>s.id===stationId)?.name||stationId;
  const rows=records.filter(r=>r.station_id===stationId);
  const map=new Map(rows.map(r=>[Number(r.report_month),r]));
  const months=period.mode==='yearly'?Array.from({length:12},(_,i)=>i+1):[Number(period.month.slice(5,7))];
  const value=(r,key)=>r?dashboardNumeric(r[key]):null;
  const sum=(key)=>rows.reduce((n,r)=>n+(value(r,key)??0),0);
  const fileNames=[...new Set(rows.map(r=>r.source_file).filter(Boolean))];
  const cards=[['إجمالي الإنتاج (م³)',fmt(sum('production_m3'))],['الأشهر المسجلة',fmt(rows.length)],['الديزل (م³)',fmt(sum('diesel_consumption_m3'))],['الكهرباء (MW)',fmt(sum('electricity_consumption_mw'))]];
  html+='<section class="archive-block"><h3>إنتاج شهري تاريخي — '+esc(station)+' — '+esc(period.year)+'</h3>'+
        '<div class="archive-overview">'+cards.map(([label,num])=>'<div class="archive-kpi"><strong>'+esc(num)+'</strong><small>'+esc(label)+'</small></div>').join('')+'</div>';
  if(period.mode==='yearly')html+=archiveChart(months.map(m=>({id:period.year+'-'+String(m).padStart(2,'0'),label:HIST_MONTHS[m-1],production:value(map.get(m),'production_m3')})));
  let tableRows='';
  for(const m of months){
   const r=map.get(m),p=value(r,'production_m3'),prev=value(map.get(m-1),'production_m3');
   let change='—';
   if(p!==null&&prev!==null)change=prev===0?(p===0?'مستقر':'بدء إنتاج'):((p-prev>0?'+':'')+(100*(p-prev)/prev).toFixed(1)+'%');
   tableRows+='<tr><td>'+esc(HIST_MONTHS[m-1])+'</td>'+
    '<td class="archive-num">'+esc(p===null?'غير مسجل':fmt(p))+'</td>'+
    '<td class="archive-num">'+esc(value(r,'diesel_consumption_m3')===null?'—':fmt(value(r,'diesel_consumption_m3')))+'</td>'+
    '<td class="archive-num">'+esc(value(r,'electricity_consumption_mw')===null?'—':fmt(value(r,'electricity_consumption_mw')))+'</td><td>'+esc(change)+'</td></tr>';
  }
  html+='<div class="archive-table-scroll"><table class="archive-table"><thead><tr><th>الشهر</th><th>الإنتاج (م³)</th><th>الديزل (م³)</th><th>الكهرباء (MW)</th><th>تغير الإنتاج</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
      (rows.some(r=>r.source_note)?'<p class="archive-hint">'+esc(rows.find(r=>r.source_note)?.source_note||'')+'</p>':'')+
   '</section>';
 }
 return html;
}

function archiveAggregate(rows,metric){
 const values=rows.map(r=>dashboardNumeric(r.data?.metrics?.[metric])).filter(n=>n!==null);
 return {total:values.length?values.reduce((a,b)=>a+b,0):null,count:values.length};
}
function archiveFormatNum(n){return n===null?'غير مسجل':fmt(n)}
function archiveExpectedDays(from,to){
 const now=dashboardSaudiDate();
 const end=to&&to<now?to:now;
 if(!from||!to||end<from)return null;
 const beginMs=Date.parse(from+'T12:00:00Z'),endMs=Date.parse(end+'T12:00:00Z');
 if(!Number.isFinite(beginMs)||!Number.isFinite(endMs))return null;
 return Math.floor((endMs-beginMs)/86400000)+1;
}
function archiveSummary(rows,period,scope){
 const chosenCount=scope?1:stations.length;
 const expected=archiveExpectedDays(period.from,period.to);
 const days=new Set(rows.map(r=>r.report_date)).size;
 const kpis=[
  ['التقارير المحفوظة',rows.length],
  ['الأيام المسجلة',days],
  ['إجمالي الإنتاج (م³)',archiveAggregate(rows,'production').total],
  ['المياه الخام (م³)',archiveAggregate(rows,'raw').total],
  ['التصدير (م³)',archiveAggregate(rows,'export').total]
 ];
 if(expected!==null&&chosenCount){
  const allDays=expected*chosenCount;
  kpis.splice(2,0,['اكتمال التقارير',fmt(100*rows.length/Math.max(1,allDays))+'%']);
 }
 return '<div class="archive-overview">'+kpis.map(([label,value])=>
  '<div class="archive-kpi"><strong>'+esc(value===null?'—':typeof value==='number'?fmt(value):value)+'</strong><small>'+esc(label)+'</small></div>').join('')+'</div>'+
  (expected!==null?'<p class="archive-missing-note">تقارير غير مرسلة: '+esc(fmt(Math.max(0,expected*chosenCount-rows.length)))+
   '</p>':'');
}
function archiveTimeLabel(r){
 if(isExcelImportedReport(r)){
  const d=dashboardSubmitTime(r.created_at);
  return 'استيراد Excel: '+d.date+'، '+d.time;
 }
 if(r.source==='migration'){
  const d=r.source_sent_at?dashboardSubmitTime(r.source_sent_at):null;
  return d?'رسالة واتساب: '+d.date+'، '+d.time:'تقرير واتساب مستورد (وقت الرسالة غير متاح)';
 }
 const d=dashboardSubmitTime(r.created_at);
 return 'إرسال الموقع: '+d.date+'، '+d.time;
}
function archiveReportEntries(rows){
 const subset=rows.slice(0,archiveVisibleCount);
 const list=subset.map(r=>{
  const station=stations.find(s=>s.id===r.station_id);
  return '<div class="archive-entry"><div><strong>'+esc(station?.name||r.station_id)+'</strong>'+
   '<small>تاريخ التقرير: '+esc(dashboardShortDate(r.report_date))+' — '+esc(archiveTimeLabel(r))+'</small></div>'+
   '<div class="sec-actions"><button class="btn primary" data-archive-id="'+esc(r.id)+'">عرض</button>'+
   (isSuperAdmin()?'<button class="btn" data-archive-edit="'+esc(r.id)+'">تعديل</button>'+
   '<button class="btn danger" data-archive-delete="'+esc(r.id)+'">حذف</button>':'')+'</div></div>';
 }).join('');
 return '<div class="archive-report-list">'+(list||'<div class="archive-empty">لا توجد تقارير ضمن الفترة المحددة.</div>')+'</div>'+
  (rows.length>archiveVisibleCount?'<button class="btn archive-more" data-archive-more="1">عرض المزيد ('+
   esc(fmt(rows.length-archiveVisibleCount))+' متبقية)</button>':'');
}
function archivePeriodGroups(rows,period){
 const key=period.mode==='yearly'?'month':'day';
 const buckets=[];
 if(key==='month'){
  for(let i=1;i<=12;i++){
   const month=period.year+'-'+String(i).padStart(2,'0');
   buckets.push({id:month,label:new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{month:'short',timeZone:'UTC'}).format(new Date(month+'-15T12:00:00Z'))});
  }
 }else{
  const n=new Date(period.year,Number(period.month.slice(5,7)),0).getDate();
  for(let i=1;i<=n;i++){
   const id=period.month+'-'+String(i).padStart(2,'0');
   buckets.push({id,label:String(i)});
  }
 }
 return buckets.map(b=>{
  const subset=rows.filter(r=>key==='month'?r.report_date.startsWith(b.id):r.report_date===b.id);
  const production=archiveAggregate(subset,'production').total;
  const days=new Set(subset.filter(r=>dashboardNumeric(r.data?.metrics?.production)!==null).map(r=>r.report_date)).size;
  return {...b,reports:subset.length,production,readingDays:days,average:production===null||!days?null:production/days};
 });
}
function archiveDailyGroups(rows){
 const bucket=new Map();
 for(const r of rows){
  if(!bucket.has(r.report_date))bucket.set(r.report_date,[]);
  bucket.get(r.report_date).push(r);
 }
 return [...bucket].sort(([a],[b])=>a.localeCompare(b)).map(([id,list])=>({
  id,label:dashboardShortDate(id).slice(0,5),reports:list.length,
  production:archiveAggregate(list,'production').total,
  raw:archiveAggregate(list,'raw').total,
  export:archiveAggregate(list,'export').total
 }));
}
function archiveDailySummary(rows){
 const groups=archiveDailyGroups(rows);
 const table=groups.slice().reverse().map(row=>'<tr><td>'+esc(dashboardShortDate(row.id))+'</td>'+
  '<td class="archive-num">'+esc(fmt(row.reports))+'</td>'+
  '<td class="archive-num">'+esc(archiveFormatNum(row.production))+'</td>'+
  '<td class="archive-num">'+esc(archiveFormatNum(row.raw))+'</td>'+
  '<td class="archive-num">'+esc(archiveFormatNum(row.export))+'</td></tr>').join('');
 return (groups.length?archiveChart(groups.slice(-35)):'')+
  '<div class="archive-block"><h3>البيانات اليومية المسجلة حسب التاريخ</h3>'+
  '<div class="archive-table-scroll"><table class="archive-table"><thead><tr>'+
  '<th>تاريخ التقرير</th><th>عدد تقارير المحطات</th><th>الإنتاج (م³)</th><th>الخام (م³)</th><th>التصدير (م³)</th>'+
  '</tr></thead><tbody>'+table+'</tbody></table></div>'+
  ''+
  '</div>';
}
function archiveChart(groups){
 const max=Math.max(0,...groups.map(g=>g.production??0));
 const width=groups.length>12?Math.max(690,groups.length*32):0;
 const bars=groups.map(g=>{
  const height=g.production===null?0:g.production===0?2:Math.max(4,Math.round(g.production/Math.max(max,1)*100));
  return '<div class="archive-baritem" title="'+esc(g.id+' — '+archiveFormatNum(g.production))+'">'+
   '<div class="archive-barvalue">'+esc(g.production===null?'—':fmt(g.production))+'</div>'+
   '<div class="archive-bartrack"><div class="archive-barfill" style="height:'+height+'%"></div></div>'+
   '<div class="archive-barlabel">'+esc(g.label)+'</div></div>';
 }).join('');
 return '<div class="archive-block"><h3>اتجاه الإنتاج</h3><div class="archive-chart-scroll">'+
  '<div class="archive-barset"'+(width?' style="min-width:'+width+'px"':'')+'>'+bars+'</div></div>'+
  '</div>';
}

function archiveAnnualChanges(groups){
 return groups.map((row,i)=>{
  const prev=groups[i-1];
  if(row.average===null||!prev||prev.average===null)return {...row,delta:null,percent:null,direction:'none'};
  const delta=row.average-prev.average;
  return {...row,delta,percent:prev.average===0?null:100*delta/prev.average,
    direction:delta>0?'up':delta<0?'down':'flat'};
 });
}
function archiveChangeText(row){
 if(row.direction==='none')return '—';
 if(row.direction==='flat')return 'مستقر';
 if(row.percent===null)return row.direction==='up'?'بدء إنتاج':'انخفاض إلى صفر';
 return (row.direction==='up'?'+':'−')+Math.abs(row.percent).toFixed(1)+'%';
}
function archiveAnnualTrend(groups){
 const trend=archiveAnnualChanges(groups);
 const present=trend.filter(g=>g.average!==null);
 if(!present.length)return '';
 const increases=trend.filter(g=>g.direction==='up'&&g.percent!==null);
 const decreases=trend.filter(g=>g.direction==='down'&&g.percent!==null);
 const top=present.reduce((a,b)=>a.average>b.average?a:b);
 const rise=increases.length?increases.reduce((a,b)=>a.percent>b.percent?a:b):null;
 const fall=decreases.length?decreases.reduce((a,b)=>a.percent<b.percent?a:b):null;
 const info=[
  ['أعلى متوسط إنتاج يومي',fmt(top.average)+' م³',top.label,''],
  ['أكبر ارتفاع عن الشهر السابق',rise?'+'+rise.percent.toFixed(1)+'%':'—',rise?.label||'لا توجد مقارنة','up'],
  ['أكبر انخفاض عن الشهر السابق',fall?fall.percent.toFixed(1)+'%':'—',fall?.label||'لا توجد مقارنة','down']
 ];
 const cards='<div class="archive-trend-cards">'+info.map(([label,value,month,kind])=>
  '<div class="archive-trend-kpi '+esc(kind)+'"><small>'+esc(label)+'</small><strong>'+esc(value)+
  '</strong><span>'+esc(month)+'</span></div>').join('')+'</div>';
 const max=Math.max(1,...trend.map(g=>g.average??0));
 const bars='<div class="archive-trend-bars">'+trend.map(g=>{
  const height=g.average===null?0:g.average===0?2:Math.max(4,Math.round(100*g.average/max));
  return '<div class="archive-trend-col" title="'+esc(g.label+': '+(g.average===null?'لا توجد قراءة':fmt(g.average)+' م³/يوم'))+'">'+
  '<span class="archive-trend-shift '+esc(g.direction)+'">'+esc(archiveChangeText(g))+'</span>'+
  '<span class="archive-trend-figure">'+esc(g.average===null?'—':fmt(g.average))+'</span>'+
  '<div class="archive-trend-track"><div class="archive-trend-fill '+esc(g.direction)+'" style="height:'+height+'%"></div></div>'+
  '<span class="archive-trend-month">'+esc(g.label)+'</span></div>';
 }).join('')+'</div>';
 return '<div class="archive-block"><h3>ارتفاع وانخفاض الإنتاج خلال السنة</h3>'+
    cards+'<div class="archive-chart-scroll">'+bars+'</div>'+
  '</div>';
}


function archiveGroupTable(groups,period){
 const annual=period.mode==='yearly',data=annual?archiveAnnualChanges(groups):groups;
 const headings='<th>الفترة</th><th>عدد التقارير</th><th>إجمالي الإنتاج (م³)</th>'+
  (annual?'<th>أيام بها قراءات</th><th>متوسط الإنتاج اليومي (م³)</th><th>التغير عن الشهر السابق</th><th>التفاصيل</th>':'');
 const body=data.map(row=>
  '<tr><td>'+esc(annual?row.label:dashboardShortDate(row.id))+'</td>'+
  '<td class="archive-num">'+esc(fmt(row.reports))+'</td>'+
  '<td class="archive-num">'+esc(row.production===null?'—':fmt(row.production))+'</td>'+
  (annual?'<td class="archive-num">'+esc(fmt(row.readingDays))+'</td>'+
  '<td class="archive-num">'+esc(row.average===null?'—':fmt(row.average))+'</td>'+
  '<td><span class="archive-trend-tag '+esc(row.direction)+'">'+esc(archiveChangeText(row))+'</span></td>'+
  '<td><button type="button" class="btn archive-row-action" data-archive-month="'+esc(row.id)+'">عرض الشهر</button></td>':'')+
  '</tr>'
 ).join('');
 return '<div class="archive-block"><h3>'+(annual?'المقارنة الشهرية للإنتاج':'تفاصيل الأيام')+'</h3>'+
  '<div class="archive-table-scroll"><table class="archive-table"><thead><tr>'+headings+
  '</tr></thead><tbody>'+body+'</tbody></table></div>'+
  ''+
  '</div>';
}
function archiveStationTable(rows){
 if(!isAdmin())return '';
 const table=stations.map(s=>{
  const filtered=rows.filter(r=>r.station_id===s.id);
  const total=archiveAggregate(filtered,'production');
  return '<tr><td>'+esc(s.name)+'</td><td class="archive-num">'+esc(fmt(filtered.length))+
    '</td><td class="archive-num">'+esc(total.total===null?'—':fmt(total.total))+'</td></tr>';
 }).join('');
 return '<div class="archive-block"><h3>ملخص المحطات</h3><div class="archive-table-scroll">'+
  '<table class="archive-table"><thead><tr><th>المحطة</th><th>عدد التقارير</th><th>إجمالي الإنتاج (م³)</th></tr></thead>'+
  '<tbody>'+table+'</tbody></table></div></div>';
}
function archiveCustomMetrics(rows,scope){
 if(!scope)return '';
 const st=stations.find(s=>s.id===scope);
 if(!st?.metrics?.length)return '';
 const entries=st.metrics.map(metric=>{
  const nums=rows.map(r=>dashboardNumeric(r.data?.metrics?.[metric.id])).filter(n=>n!==null);
  if(!nums.length)return null;
  const avg=nums.reduce((a,b)=>a+b,0)/nums.length;
  return '<tr><td>'+esc(metric.label)+'</td><td>'+esc(metric.unit||'—')+'</td>'+
   '<td class="archive-num">'+esc(fmt(avg))+'</td><td class="archive-num">'+esc(fmt(nums.length))+'</td></tr>';
 }).filter(Boolean);
 if(!entries.length)return '';
 return '<div class="archive-block"><h3>متوسط المؤشرات المسجلة — '+esc(st.name)+'</h3>'+
    '<div class="archive-table-scroll"><table class="archive-table"><thead><tr>'+
  '<th>المؤشر</th><th>الوحدة</th><th>متوسط القراءات</th><th>أيام القراءة</th></tr></thead>'+
  '<tbody>'+entries.join('')+'</tbody></table></div></div>';
}
function archiveRender(){
 const rows=archiveRows,historical=archiveHistoricalRows,scope=archiveQueryInfo?.scope,period=archiveQueryInfo?.period;
 if(!period){$('archiveResults').innerHTML='<div class="archive-empty">اختر الفترة واضغط عرض التقارير.</div>';return}
 const name=scope?stations.find(s=>s.id===scope)?.name||scope:'جميع المحطات';
 let content='<div class="archive-station-tag">'+esc(name)+'</div>';
 if(!rows.length){
  content+=historical.length?archiveHistoricalSection(historical,period):
   '<div class="archive-empty">لا توجد تقارير للفترة المحددة.</div>';
 }else if(period.mode==='daily'){
  content+=archiveSummary(rows,period,scope)+archiveDailySummary(rows)+archiveStationTable(rows)+
   '<div class="archive-block"><h3>التقارير اليومية المحفوظة لكل محطة</h3>'+archiveReportEntries(rows)+'</div>';
 }else{
  const groups=archivePeriodGroups(rows,period);
  content+=archiveSummary(rows,period,scope)+(period.mode==='yearly'?archiveAnnualTrend(groups):archiveChart(groups))+archiveGroupTable(groups,period)+
   archiveStationTable(rows)+archiveCustomMetrics(rows,scope)+
   '<div class="archive-block"><h3>التقارير اليومية المحفوظة</h3>'+archiveReportEntries(rows)+'</div>'+
   archiveHistoricalSection(historical,period);
 }
 $('archiveResults').classList.remove('archive-empty');
 $('archiveResults').innerHTML=content;
 window.WSMotion?.animate($('archiveResults'));
 $('archiveScopeLabel').textContent=name+' — '+(period.mode==='yearly'?'عام '+period.year:
  period.mode==='monthly'?'شهر '+period.month:'التقارير اليومية');
 $('archiveExports').classList.toggle('hidden',rows.length===0&&historical.length===0);
}
async function archiveSearch(){
 if(!signedIn())return;
 const out=$('archiveResults'),button=$('archiveSearch');
 const searchVersion=++archiveSearchVersion;
 archiveRows=[];archiveHistoricalRows=[];archiveQueryInfo=null;archiveVisibleCount=ARCHIVE_SHOW_STEP;
 button.disabled=true;out.setAttribute('aria-busy','true');
 out.innerHTML='<div class="archive-empty">جاري تحميل التقارير…</div>';
 $('archiveExports').classList.add('hidden');
 try{
  const scope=archiveChosenStation(),period=archivePeriod();
  const [rows,historical]=await Promise.all([archiveFetchAll(scope,period,searchVersion),archiveFetchHistorical(scope,period,searchVersion)]);
  if(searchVersion!==archiveSearchVersion)return;
  archiveRows=rows;archiveHistoricalRows=historical;archiveQueryInfo={scope,period};
  if(period.mode==='daily'&&rows.length){
   const counts=new Map();
   for(const item of rows){const month=item.report_date.slice(0,7);counts.set(month,(counts.get(month)||0)+1);}
   const eligible=[...counts].filter(([,n])=>n>=5).sort(([a],[b])=>b.localeCompare(a));
   const candidate=eligible.length?eligible[0][0]:[...counts.keys()].sort().reverse()[0];
   if(candidate){archiveSuggestedMonth=candidate;$('archiveMonth').value=candidate;}
  }
  archiveRender();
 }catch(e){
  if(searchVersion!==archiveSearchVersion)return;
  out.innerHTML='<div class="archive-empty">'+esc(e.message||'تعذر تحميل الأرشيف.')+'</div>';
 }finally{if(searchVersion===archiveSearchVersion){button.disabled=false;out.setAttribute('aria-busy','false')}}
}

function archiveCsvCell(value){
 let textValue=String(value===null||value===undefined?'':value);
 // Excel formula injection protection for free-text notes and station labels.
 if(/^[\s]*[=+\-@\t\r]/.test(textValue))textValue="'"+textValue;
 return '"'+textValue.replace(/"/g,'""')+'"';
}
function archiveAddField(row,prefix,value,depth=0){
 if(value===null||value===undefined||depth>6)return;
 if(typeof value==='object'&&!Array.isArray(value)){
  for(const [key,val] of Object.entries(value)){
   archiveAddField(row,prefix+' / '+key,val,depth+1);
  }
 }else if(Array.isArray(value)){
  value.forEach((val,index)=>archiveAddField(row,prefix+' / '+(index+1),val,depth+1));
 }else row[prefix]=String(value);
}
function archiveExportDataRow(r){
 const s=stations.find(x=>x.id===r.station_id);
 const config=r.config_snapshot&&Array.isArray(r.config_snapshot.metrics)?r.config_snapshot:s;
 const row={
  'المحطة':s?.name||r.station_id,
  'تاريخ التقرير':r.report_date,
  'المصدر':reportImportLabel(r),
  'تاريخ الإرسال الأصلي':isExcelImportedReport(r)?'غير متاح من ملف Excel':r.source==='migration'?(r.source_sent_at||''):r.created_at,
  'وقت حفظه في النظام':r.created_at
 };
 const metrics=r.data?.metrics||{};
 for(const [id,value] of Object.entries(metrics)){
  const label=config?.metrics?.find(m=>m.id===id)?.label||id;
  archiveAddField(row,'مؤشر / '+label,value);
 }
 for(const [gid,content] of Object.entries(r.data?.groups||{})){
  const g=config?.groups?.find(x=>x.id===gid);
  const groupName=g?.title||gid;
  for(const [iid,entry] of Object.entries(content||{})){
   const item=g?.items?.find(x=>x.id===iid);
   archiveAddField(row,'قسم / '+groupName+' / '+(item?.label||iid),entry);
  }
 }
 for(const item of excelSourceRows(r.data,r.imported_from))archiveAddField(row,'قراءات Excel / '+item.label,item.value+(item.unit?' '+item.unit:''));
 for(const [nid,value] of Object.entries(r.data?.notes||{})){
  const label=config?.noteFields?.find(n=>n.id===nid)?.label||nid;
  archiveAddField(row,'ملاحظات / '+label,value);
 }
 return row;
}
function archiveExcel(){
 if(!archiveQueryInfo||(!archiveRows.length&&!archiveHistoricalRows.length)||!signedIn())return;
 const scope=archiveQueryInfo.scope;
 if(!isAdmin()&&scope!==currentStationId)return;
 const rows=archiveRows.map(archiveExportDataRow);
 for(const r of archiveHistoricalRows)rows.push({
  'المحطة':stations.find(s=>s.id===r.station_id)?.name||r.station_id,
  'نوع السجل':'إنتاج شهري تاريخي',
  'الفترة':r.report_year+'-'+String(r.report_month).padStart(2,'0'),
  'الإنتاج (م³)':r.production_m3,
  'الديزل (م³)':r.diesel_consumption_m3,
  'الكهرباء (MW)':r.electricity_consumption_mw,
  'ملف المصدر':r.source_file,
  'ملاحظات المصدر':r.source_note||''
 });
 const headers=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
 const textFile='\uFEFF'+headers.map(archiveCsvCell).join(',')+'\r\n'+
  rows.map(r=>headers.map(h=>archiveCsvCell(r[h]??'')).join(',')).join('\r\n');
 const label=archiveQueryInfo.period.mode==='yearly'?String(archiveQueryInfo.period.year):
  archiveQueryInfo.period.mode==='monthly'?archiveQueryInfo.period.month:'يومي';
 const station=scope||'جميع_المحطات';
 const filename=('تقارير_حلول_المياه_'+station+'_'+label+'.csv').replace(/[^\w\u0600-\u06ff.-]/g,'_');
 downloadBlob(new Blob([textFile],{type:'text/csv;charset=utf-8;'}),filename);
}
function archivePdf(){
 if(!archiveQueryInfo||(!archiveRows.length&&!archiveHistoricalRows.length)||!signedIn())return;
 if(!isAdmin()&&archiveQueryInfo.scope!==currentStationId)return;
 const info=archiveQueryInfo,station=info.scope?stations.find(s=>s.id===info.scope)?.name||info.scope:'جميع المحطات';
 const period=info.period.mode==='yearly'?'التقرير السنوي '+info.period.year:
  info.period.mode==='monthly'?'التقرير الشهري '+info.period.month:'التقارير اليومية';
 const clone=$('archiveResults').cloneNode(true);
 clone.removeAttribute('id');
 for(const button of clone.querySelectorAll('button'))button.remove();
 if(info.period.mode!=='daily'){
  for(const list of clone.querySelectorAll('.archive-report-list'))list.remove();
  for(const block of clone.querySelectorAll('.archive-block')){
   if(block.querySelector('.archive-report-list')||block.textContent.trim()==='التقارير اليومية المحفوظة')block.remove();
  }
 }
 const printWindow=window.open('','_blank');
 if(!printWindow){toast('فعّل السماح بالنوافذ المنبثقة لطباعة التقرير.',true);return}
 const title='شركة حلول المياه — '+period+' — '+station;
 const currentStyles=document.getElementById('app-css')?.textContent||'';
 const printOnlyStyle=String.raw`
  body{background:#fff;padding:20px!important;margin:0;font-family:Tahoma,Arial,sans-serif;color:#24445d}
  .archive-print-header{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:8px 0 16px;border-bottom:3px solid #0362AF;margin-bottom:20px}
  .archive-print-header img{height:75px;width:145px;object-fit:contain}
  .archive-print-header h1{font-size:20px;color:#0362AF;margin:0 0 8px}
  .archive-print-header p{font-size:12px;color:#555;margin:0}
  .archive-print-actions{padding:10px 0 16px;text-align:center}
  .archive-print-actions button{background:#0362AF;color:white;border:0;padding:10px 20px;border-radius:8px;cursor:pointer}
  .archive-block,.archive-kpi{break-inside:avoid-page}
  .archive-barset{min-width:0!important}
  .archive-report-list{max-height:none}
  .archive-entry button,.archive-row-action,.archive-more{display:none!important}
  @media print{
   @page{size:A4 landscape;margin:12mm}
   body{padding:0!important}
   .archive-print-actions{display:none!important}
   .archive-block,.archive-kpi{break-inside:avoid-page}
  }
 `;
 const safeTitle=esc(title);
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+safeTitle+'</title>'+
  '<style>'+currentStyles+'\n'+printOnlyStyle+'</style></head><body>'+
  '<header class="archive-print-header"><div><h1>'+safeTitle+'</h1><p>نظام التقارير التشغيلية اليومية</p></div>'+
  '<img alt="شعار شركة حلول المياه" src="'+LOGO+'"></header>'+
  '<div class="archive-print-actions"><button type="button" onclick="window.print()">طباعة / حفظ PDF</button></div>'+
  '<main>'+clone.innerHTML+'</main>'+
    '</body></html>';
 printWindow.document.open();
 printWindow.document.write(html);
 printWindow.document.close();
 printWindow.focus();
}

async function archiveDelete(id){
 if(!isSuperAdmin())return;
 if(!confirm('حذف التقرير نهائيًا من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.'))return;
 try{
  const result=await authedFetch('/rest/v1/reports?id=eq.'+encodeURIComponent(id),{
    method:'DELETE',headers:{Prefer:'return=representation'}
  });
  if(!result.ok)throw Error('الصلاحية أو الاتصال لا يسمح بالحذف: '+result.status);
  const deleted=await result.json();
  if(!Array.isArray(deleted)||!deleted.length)throw Error('لم يتم العثور على التقرير لحذفه.');
  for(const x of deleted){const key=x.station_id+'@'+x.report_date;delete receipts[key];delete requestIds[key]}
  store(perUserKey(RECEIPTS_KEY),receipts);store(perUserKey(REQUESTS_KEY),requestIds);
  await archiveSearch();
  toast('تم حذف التقرير، مع الإبقاء على باقي السجلات.');
 }catch(err){toast(err.message,true)}
}

async function archiveShow(id,editable=false){
 if(!signedIn())return;
 const lookupGuard=++dailyLookupVersion;
 try{
  const resp=await authedFetch('/rest/v1/reports?select=id,station_id,report_date,data,config_snapshot,created_at,source,source_sent_at,imported_from&id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(!resp.ok)throw Error('تعذر الوصول للتقرير.');
  const arr=await resp.json(),r=arr[0];
  if(!r||!r.data||!stations.some(x=>x.id===r.station_id))throw Error('ليس لديك صلاحية عرض التقرير.');
  if(editable&&!isSuperAdmin())throw Error('فقط السوبر أدمن يستطيع تعديل التقارير.');
  if(lookupGuard!==dailyLookupVersion)return;
  preserveDraft();stationId=r.station_id;date=r.report_date;
  dailyLookupBusy=false;dailyLookupError=false;dailySelectedReport=r;
  archiveViewing=!editable;editingReportId=editable?r.id:null;archiveConfig=r.config_snapshot&&Array.isArray(r.config_snapshot.metrics)?r.config_snapshot:null;
  record={...emptyRecord(),metrics:r.data.metrics||{},groups:r.data.groups||{},notes:r.data.notes||{},excel:r.data.excel||{}};
  refreshSelects();$('reportDate').value=date;renderInputs();renderReport();updateSaveStatus();
  $('reportDate').disabled=editable;$('stationSelect').disabled=editable||!isAdmin();
  archiveClose();logActivity('VIEW_REPORT',r.id);toast(editable?'وضع تعديل التقرير — احفظ التغييرات عبر زر الحفظ المركزي.':isExcelImportedReport(r)?'تقرير إنتاج مستورد آليًا من ملف Excel — للقراءة فقط.':r.source==='migration'?'تقرير تاريخي مستورد من واتساب — للقراءة فقط.':'عرض التقرير المحفوظ — للقراءة فقط.');
 }catch(e){toast(e.message,true)}
}


async function loadCloudStations(){
 if(!signedIn())throw Error('يرجى تسجيل الدخول أولًا.');
 cloudReady=false;cloudNotice('تحميل المحطات…');
 const response=await authedFetch('/rest/v1/stations?select=id,config,updated_at&active=eq.true');
 if(!response.ok)throw Error('تعذر قراءة المحطات: '+response.status);
 const rows=await response.json();
 const valid=rows.filter(r=>r&&typeof r.id==='string'&&r.config&&r.config.id===r.id&&Array.isArray(r.config.metrics)&&Array.isArray(r.config.groups));
 const indexed=new Map(valid.map(r=>[r.id,r.config]));
 stationVersions=Object.fromEntries(valid.map(r=>[r.id,r.updated_at]));
 stations=isAdmin()?[...allowedStationIds.map(id=>indexed.get(id)).filter(Boolean),...valid.filter(r=>!allowedStationIds.includes(r.id)).map(r=>r.config)]:[indexed.get(currentStationId)].filter(Boolean);
 if(!stations.length)throw Error('لا توجد محطة مفعلة مرتبطة بهذا الحساب.');
 stationId=isAdmin()&&stations.some(s=>s.id===stationId)?stationId:stations[0].id;
 drafts=load(perUserKey(DRAFTS_KEY),{});
 receipts=load(perUserKey(RECEIPTS_KEY),{});
 requestIds=load(perUserKey(REQUESTS_KEY),{});
 archiveViewing=false;archiveConfig=null;record=fetchRecord();
 refreshSelects();$('stationSelect').disabled=!isAdmin();
 $('reportDate').value=date;renderInputs();renderReport();
 cloudReady=true;updateSaveStatus();
 cloudNotice('متصل','ok');
 await loadSelectedDailyReport();
}
async function authRefresh(){
 const refresh=authSession?.refresh_token;
 if(!refresh)throw Error('انتهت الجلسة.');
 const r=await fetch(CLOUD_AUTH+'/token?grant_type=refresh_token',{method:'POST',
  headers:{'Content-Type':'application/json',apikey:CLOUD_PUBLIC_KEY},
  body:JSON.stringify({refresh_token:refresh})});
 const next=await r.json().catch(()=>({}));
 if(!r.ok||!next.access_token)throw Error('انتهت الجلسة، أعد تسجيل الدخول.');
 authSession={...next,expires_at:Math.floor(Date.now()/1000)+next.expires_in};
 sessionStorage.setItem(AUTH_KEY,JSON.stringify(authSession));
}
async function authedFetch(path,opts={},retried=false){
 if(!authSession?.access_token)throw Error('مطلوب تسجيل الدخول.');
 if(authSession.expires_at&&authSession.expires_at<Date.now()/1000+45)await authRefresh();
 const headers={apikey:CLOUD_PUBLIC_KEY,Authorization:'Bearer '+authSession.access_token,...(opts.headers||{})};
 if(opts.body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(CLOUD_URL+path,{...opts,headers});
 if(r.status===401&&!retried){await authRefresh();return authedFetch(path,opts,true)}
 return r;
}
async function getCurrentProfile(){
 const [admRes,memberRes,maintenanceRes]=await Promise.all([
  authedFetch('/rest/v1/admin_users?select=user_id,role'),
  authedFetch('/rest/v1/station_users?select=user_id,station_id,username'),
  authedFetch('/rest/v1/maintenance_users?select=user_id,station_id,username')
 ]);
 if(!admRes.ok||!memberRes.ok||!maintenanceRes.ok)throw Error('تعذر التحقق من صلاحيات الحساب.');
 const [admins,members,engineers]=await Promise.all([admRes.json(),memberRes.json(),maintenanceRes.json()]);
 const adminRecord=admins.find(a=>a.user_id===currentUserId&&['superadmin','admin'].includes(a.role));
 const stationMember=members.find(m=>m.user_id===currentUserId);
 const engineer=engineers.find(m=>m.user_id===currentUserId);
 if([!!adminRecord,!!stationMember,!!engineer].filter(Boolean).length>1)
  throw Error('توجد صلاحيات متعارضة لهذا الحساب. تواصل مع السوبر أدمن.');
 if(adminRecord){
  currentRole=adminRecord.role;currentStationId='';
  currentLoginName=currentRole==='superadmin'?'السوبر أدمن':'الأدمن';
 }else if(stationMember){
  currentRole='station';currentStationId=stationMember.station_id;currentLoginName=stationMember.username;
 }else if(engineer){
  currentRole='maintenance';currentStationId=engineer.station_id;currentLoginName=engineer.username;
 }else throw Error('هذا المستخدم غير مرتبط بأي محطة. تواصل مع المسؤول.');
}
async function openEngineerWorkspace(){
 const response=await authedFetch('/rest/v1/stations?select=id,config&active=eq.true&id=eq.'+encodeURIComponent(currentStationId));
 if(!response.ok)throw Error('تعذر تحميل بيانات محطة الصيانة.');
 const rows=await response.json();
 const row=rows.find(x=>x.id===currentStationId&&x.config?.id===currentStationId);
 if(!row)throw Error('المحطة غير مفعلة أو غير مصرح بها.');
 if(!window.WSMaintenance?.open)throw Error('واجهة الصيانة غير جاهزة. يرجى تحديث الصفحة.');
 stations=[row.config];
 stationId=currentStationId;
 document.body.dataset.auth='maintenance';
 $('loginScreen').classList.add('hidden');
 $('loginPassword').value='';
 $('accountRole').textContent='مهندس صيانة — '+(row.config?.name||currentStationId);
 $('accountRole').classList.remove('hidden');
 if(location.hash)history.replaceState(null,document.title,location.pathname+location.search);
 try{window.WSMaintenance.open('overview')}
 catch(error){
  document.body.dataset.auth='locked';
  $('loginScreen').classList.remove('hidden');
  throw error;
 }
}
async function enterApplication(){
 if(!authSession?.access_token)throw Error('أدخل بيانات الدخول');
 const user=await authedFetch('/auth/v1/user');
 if(!user.ok)throw Error('تعذّر التحقق من الجلسة.');
 const actor=await user.json();
 currentUserId=actor.id||'';
 if(!currentUserId)throw Error('هوية الحساب غير متاحة.');
 await getCurrentProfile();
 if(currentRole==='maintenance'){
  await openEngineerWorkspace();
  return;
 }
 await loadCloudStations();
 $('dashboardBtn').classList.toggle('hidden',!isAdmin());
 $('accountsBtn').classList.toggle('hidden',!isSuperAdmin());
 $('auditBtn').classList.toggle('hidden',!isSuperAdmin());
 $('settingsBtn').classList.remove('hidden');
 $('settingsBtn').textContent=currentRole==='station'?'⚙ إدارة المحطة':'⚙ إدارة المحطات';
 $('changeOwnPasswordBtn').classList.remove('hidden');
 $('accountRole').classList.remove('hidden');
 $('accountRole').textContent=isSuperAdmin()?'سوبر أدمن':isAdmin()?'أدمن':'محطة '+currentLoginName;
 document.body.dataset.auth='ready';
 window.WSMotion?.enterApplication();
 $('loginScreen').classList.add('hidden');
 $('loginPassword').value='';
 $('accessNote').textContent=isAdmin()?'إدارة المحطات':selected().name;
 if(location.hash==='#chemicals'){
  // Keep the legacy chemical deep link, but use the new page router when enabled.
  if(window.WSShellUI?.enabled)window.WSShellUI.navigate('chemicals/overview',{history:'replace'});
  else{
   history.replaceState(null,document.title,location.pathname+location.search);
   chemicalsOpen();
  }
 }else if(isAdmin()&&!window.WSShellUI?.enabled)dashboardOpen();
}
async function loginSubmit(e){
 e.preventDefault();
 const button=$('loginButton'),error=$('loginError');
 const raw=$('loginUsername').value.trim().toLowerCase(),pwd=$('loginPassword').value;
 if(!raw||!pwd)return;
 button.disabled=true;
 $('loginButtonLabel').textContent='جارٍ التحقق…';
 error.textContent='';
 try{
   const r=await fetch(CLOUD_STATION_LOGIN,{method:'POST',
     headers:{apikey:CLOUD_PUBLIC_KEY,'Content-Type':'application/json'},
     body:JSON.stringify({username:raw,password:pwd})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.access_token)throw Error('بيانات الدخول غير صحيحة، أو الحساب غير مفعّل.');
   authSession={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};
   sessionStorage.setItem(AUTH_KEY,JSON.stringify(authSession));
   await enterApplication();error.textContent='';
 }catch(err){
   authSession=null;currentRole='';currentStationId='';currentUserId='';sessionStorage.removeItem(AUTH_KEY);
   error.textContent=err.message||'تعذّر تسجيل الدخول';
 }finally{
   button.disabled=false;
   $('loginButtonLabel').textContent='دخول النظام';
 }
}
async function logout(){
 if(currentRole!=='maintenance')preserveDraft();
 window.WSMaintenance?.lock?.();
 ++dailyLookupVersion;dailyLookupBusy=false;dailyLookupError=false;dailySelectedReport=null;
 const token=authSession?.access_token;
 authSession=null;currentRole='';currentStationId='';currentUserId='';cloudReady=false;
 sessionAssignedPasswords.clear();
 sessionStorage.removeItem(AUTH_KEY);
 stations=allowedStations();drafts={};receipts={};requestIds={};
 for(const m of ['archiveModal','dashboardModal','chemicalsModal','accountsModal','auditModal','passwordModal'])$(m).classList.add('hidden');
 chemicalPanel.reset();
 $('changeOwnPasswordBtn').classList.add('hidden');
 for(const id of ['selfPasswordOld','selfPasswordNew','selfPasswordConfirm'])$(id).value='';
 document.body.dataset.auth='locked';$('loginScreen').classList.remove('hidden');
 $('accountRole').classList.add('hidden');
 $('dashboardBtn').classList.add('hidden');$('accountsBtn').classList.add('hidden');$('settingsBtn').classList.add('hidden');$('auditBtn').classList.add('hidden');
 $('loginPassword').value='';
 $('loginUsername').value='';
 $('loginError').textContent='';
 $('loginPassword').type='password';
 $('loginTogglePassword').textContent='إظهار';
 $('loginTogglePassword').setAttribute('aria-pressed','false');
 $('loginButtonLabel').textContent='دخول النظام';editingReportId=null;
 $('loginUsername').focus();
 if(token)fetch(CLOUD_AUTH+'/logout',{method:'POST',headers:{apikey:CLOUD_PUBLIC_KEY,Authorization:'Bearer '+token}}).catch(()=>{});
}
async function restoreSession(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(AUTH_KEY)||'null');
  if(!saved?.access_token)return;
  authSession=saved;
  await enterApplication();
 }catch(err){
  authSession=null;currentRole='';currentStationId='';currentUserId='';sessionStorage.removeItem(AUTH_KEY);
  $('loginError').textContent='أعد تسجيل الدخول للمتابعة.';
 }
}

const DASHBOARD_TIME_ZONE='Asia/Riyadh';
let dashboardUpdating=false;
function dashboardSaudiDate(value=new Date()){
 const fields=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:DASHBOARD_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return fields.year+'-'+fields.month+'-'+fields.day;
}
function dashboardShiftDate(value,days){
 const stamp=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(stamp.getTime()))return value;
 stamp.setUTCDate(stamp.getUTCDate()+days);
 return stamp.toISOString().slice(0,10);
}
function dashboardShortDate(value){
 const parts=String(value||'').split('-');
 return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:'—';
}
function dashboardSubmitTime(value){
 const d=new Date(value);
 if(!value||!Number.isFinite(d.getTime()))return {date:'—',time:'—'};
 return {
  date:new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{
   timeZone:DASHBOARD_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'
  }).format(d),
  time:new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{
   timeZone:DASHBOARD_TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true
  }).format(d)
 };
}
function dashboardNumeric(value){
 const n=num(value);
 return n===null?null:n;
}
function dashboardTotal(rows,metric){
 const present=rows.map(row=>dashboardNumeric(row?.data?.metrics?.[metric])).filter(x=>x!==null);
 return present.length?present.reduce((a,b)=>a+b,0):null;
}
function dashboardMetricLabel(value){
 return value===null?'غير مسجل':fmt(value);
}

/* Paired values only: no fabricated zero for a missing daily report. */
function wsCompare(rows,dayMap,previousDate,key){
 let a=0,b=0,count=0;
 rows.forEach(row=>{
  const old=dayMap.get(row.station_id+'@'+previousDate);
  const nowValue=dashboardNumeric(row?.data?.metrics?.[key]);
  const oldValue=dashboardNumeric(old?.data?.metrics?.[key]);
  if(nowValue===null||oldValue===null)return;
  a+=nowValue;b+=oldValue;count++;
 });
 return {count,delta:a-b,pct:count&&b!==0?(a-b)/b*100:null};
}
function wsTrend(c){
 if(!c.count)return {cls:'neutral',txt:'لا تتوفر قراءة للمقارنة'};
 if(c.pct===null)return {cls:'neutral',txt:'الفرق '+(c.delta<0?'−':'+')+fmt(Math.abs(c.delta))+' (قراءة الأمس صفر)'};
 const cls=c.pct>0?'up':c.pct<0?'down':'neutral';
 return {cls,txt:(c.pct>0?'↑ +':c.pct<0?'↓ −':'= ')+
  Math.abs(c.pct).toLocaleString('en-US',{maximumFractionDigits:1})+'% عن أمس'};
}

/* Reference dashboard's semicircular needle, adapted for day-over-day changes.
   A negative change is on the red left, zero in the middle, positive on the green right. */
function wsDial(value,tint,kind='delta'){
 const valid=value!==null&&Number.isFinite(value),cx=70,cy=64,R=48;
 const at=(p,r)=>[(cx+r*Math.cos(Math.PI*(1-p/100))).toFixed(2),(cy-r*Math.sin(Math.PI*(1-p/100))).toFixed(2)];
 const seg=(a,b,c,active)=>'<path d="M'+at(a,R)[0]+','+at(a,R)[1]+' A'+R+','+R+' 0 0 1 '+at(b,R)[0]+','+at(b,R)[1]+'" fill="none" stroke="'+c+'" stroke-width="12.5" opacity="'+(active?1:0.3)+'"/>';
 const pos=valid?(kind==='level'?Math.max(0,Math.min(100,value)):Math.max(0,Math.min(100,(value+100)/2))):50;
 let low=kind==='level'?60:45,high=kind==='level'?90:55;
 const active=valid?(pos<low?0:pos<=high?1:2):-1;
 let ticks='';for(let p=10;p<100;p+=10){const q=at(p,R-9),r=at(p,R-12);ticks+='<line x1="'+q[0]+'" y1="'+q[1]+'" x2="'+r[0]+'" y2="'+r[1]+'" stroke="#a2b3c1" stroke-width="1"/>'}
 const mark=(p,label)=>{const xy=at(p,R+13);return '<text x="'+xy[0]+'" y="'+(Number(xy[1])+4)+'" font-size="10" text-anchor="middle" font-weight="800" fill="#17324d">'+label+'</text>'};
 const needle=valid?'<g class="ws-needle" data-target-angle="'+(-90+1.8*pos)+'" style="transform:rotate(-90deg)"><path d="M66.8,64 L70,21 L73.2,64 Z" fill="#17324d"/></g><circle cx="70" cy="64" r="6.5" fill="#17324d"/><circle cx="70" cy="64" r="2.5" fill="#fff"/>':'';
 const marks=kind==='level'?(mark(60,'60')+mark(90,'90')):(mark(25,'−50')+mark(50,'0')+mark(75,'+50'));
 return '<svg class="ws-dial" viewBox="0 0 140 84" role="img" aria-label="'+esc(valid?(kind==='level'?'نسبة '+value+'%':'تغير '+value+'%'):'لا توجد بيانات للمقارنة')+'">'+
 seg(0,low-0.7,'#e05252',active===0)+seg(low+0.7,high-0.7,'#f0a92b',active===1)+seg(high+0.7,100,'#2fa865',active===2)+ticks+
 marks+
 '<text x="15" y="78" font-size="9" fill="#8a97a6" text-anchor="middle">'+(kind==='level'?'0':'−100')+'</text>'+
 '<text x="125" y="78" font-size="9" fill="#8a97a6" text-anchor="middle">'+(kind==='level'?'100':'100+')+'</text>'+
 needle+'</svg>';
}

/* Identical motion pattern to the reference dashboard's animate(root):
   a newly drawn dial starts at -90deg; after two frames the needle turns
   to its true value and production history bars fill up. */
function wsAnimateInstruments(root){
 if(!root)return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(!root.isConnected)return;
  root.querySelectorAll('.ws-needle[data-target-angle]').forEach(el=>{
   el.style.transform='rotate('+el.dataset.targetAngle+'deg)';
  });
  root.querySelectorAll('.dashboard-week-fill[data-target-height]').forEach(el=>{
   el.style.height=el.dataset.targetHeight+'%';
  });
 }));
}
function wsInstruments(rows,dayMap,date,rate){
 const previousDate=dashboardShiftDate(date,-1);
 const defs=[['production','الإنتاج','م³','#0362AF'],['raw','المياه الخام','م³','#87329A'],['export','التصدير','م³','#1B998B']];
 const cards=defs.map(([key,label,unit,base])=>{
  const total=dashboardTotal(rows,key),cmp=wsCompare(rows,dayMap,previousDate,key),t=wsTrend(cmp);
  const tint=t.cls==='up'?'#2e9e5b':t.cls==='down'?'#d64545':base;
  return '<article class="ws-instrument">'+wsDial(cmp.pct,tint)+'<div class="ws-instrument-meta">'+
   '<span class="ws-instrument-label">'+label+'</span><strong class="ws-instrument-number">'+(total===null?'غير مسجل':fmt(total))+'</strong>'+
   '<span class="ws-instrument-unit">'+unit+'</span><span class="ws-instrument-status '+t.cls+'">'+esc(t.txt)+'</span>'+
   '<div class="ws-instrument-sub">'+(cmp.count?cmp.count+' محطة متطابقة في اليومين':'تستلزم المقارنة تقريرين متتاليين')+'</div></div></article>';
 });
 cards.unshift('<article class="ws-instrument">'+wsDial(rate,'#0362AF','level')+'<div class="ws-instrument-meta"><span class="ws-instrument-label">نسبة استلام التقارير</span>'+
  '<strong class="ws-instrument-number">'+rate+'%</strong><span class="ws-instrument-unit">من المحطات المفعلة</span>'+
  '<span class="ws-instrument-status neutral">بتاريخ '+esc(dashboardShortDate(date))+'</span></div></article>');
 return '<section class="ws-dashboard-instruments" aria-label="مؤشرات التشغيل">'+cards.join('')+'</section>';
}

function dashboardOpen(){
 if(!isAdmin())return;
 $('dashboardModal').classList.remove('hidden');
 logActivity('DASHBOARD_VIEW');
 // The reporting day has completed at midnight: open yesterday in Riyadh.
 $('dashboardDate').value=dashboardShiftDate(dashboardSaudiDate(),-1);
 dashboardRefresh();
}
async function dashboardRefresh(){
 if(!isAdmin()||dashboardUpdating)return;
 dashboardUpdating=true;
 const view=$('dashboardContent');
 const button=$('dashboardRefresh');
 const date=$('dashboardDate').value||dashboardShiftDate(dashboardSaudiDate(),-1);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){dashboardUpdating=false;return}
 button.disabled=true;
 view.setAttribute('aria-busy','true');
 if(!view.querySelector('.dashboard-summary'))view.innerHTML='<div class="archive-empty">جارٍ تحميل بيانات التشغيل…</div>';
 try{
  const begin=dashboardShiftDate(date,-6);
  const windowQuery=new URLSearchParams({
   select:'id,station_id,report_date,data,created_at,source,source_sent_at,imported_from,updated_at',
   order:'report_date.desc,created_at.desc',limit:String(Math.max(300,stations.length*8))
  });
  windowQuery.append('report_date','gte.'+begin);
  windowQuery.append('report_date','lte.'+date);
  const latestQuery=new URLSearchParams({
   select:'id,station_id,report_date,created_at,source,source_sent_at,imported_from,effective_sent_at',order:'effective_sent_at.desc',limit:'50'
  });
  const [rangeResponse,latestResponse]=await Promise.all([
   authedFetch('/rest/v1/reports?'+windowQuery.toString()),
   authedFetch('/rest/v1/reports?'+latestQuery.toString())
  ]);
  if(!rangeResponse.ok||!latestResponse.ok)throw Error('تعذّر تحميل تقارير المحطات.');
  const [rangeItems,latestItems]=await Promise.all([rangeResponse.json(),latestResponse.json()]);
  if(!Array.isArray(rangeItems)||!Array.isArray(latestItems))throw Error('تعذّر قراءة بيانات التقارير.');
  const ids=new Set(stations.map(s=>s.id));
  const reports=rangeItems.filter(r=>ids.has(r.station_id));
  const byDayStation=new Map();
  for(const r of reports){
   const k=r.station_id+'@'+r.report_date;
   if(!byDayStation.has(k)||Date.parse(r.created_at)>Date.parse(byDayStation.get(k).created_at))byDayStation.set(k,r);
  }
  const selectedRows=stations.map(s=>byDayStation.get(s.id+'@'+date)).filter(Boolean);
  const received=selectedRows.length;
  const readyRate=stations.length?Math.round(100*received/stations.length):0;
  const totals=[['إجمالي المحطات',stations.length],['التقارير المستلمة',received],['لم تُرسل',stations.length-received],
    ['إجمالي الإنتاج (م³)',dashboardTotal(selectedRows,'production')],
    ['إجمالي المياه الخام (م³)',dashboardTotal(selectedRows,'raw')],
    ['إجمالي التصدير (م³)',dashboardTotal(selectedRows,'export')]];
  const summary='<section class="dashboard-summary" aria-label="ملخص التقارير">'+
   totals.map(([label,value],i)=>'<div class="dashboard-kpi'+(i===1?' good':i===2?' pending':'')+'"><strong>'+
     esc(value===null?'—':i<3?String(value):fmt(value))+'</strong><small>'+esc(label)+'</small></div>').join('')+
   '</section>';
  const sorted=stations.slice().sort((a,b)=>Number(!byDayStation.has(b.id+'@'+date))-Number(!byDayStation.has(a.id+'@'+date)));
  const cards=sorted.map(s=>{
   const r=byDayStation.get(s.id+'@'+date);
   const submit=r?dashboardSubmitTime(importedReportTimestamp(r)):null;
   const metrics=r?.data?.metrics||{};
   const present=[['الإنتاج',dashboardNumeric(metrics.production)],['الخام',dashboardNumeric(metrics.raw)],['التصدير',dashboardNumeric(metrics.export)],['الضخ',dashboardNumeric(metrics.pumping)],['TDS',dashboardNumeric(metrics.tds??metrics.tds_product)],['المستلم من شركة نقل المياه',dashboardNumeric(metrics.nwc)]].filter(([label,value])=>value!==null||['الإنتاج','الخام','التصدير'].includes(label));
   const status=r?'تقرير محفوظ':'لم يُرسل';
   const past=byDayStation.get(s.id+'@'+dashboardShiftDate(date,-1));
   const nowProduction=dashboardNumeric(r?.data?.metrics?.production),pastProduction=dashboardNumeric(past?.data?.metrics?.production);
   const trend=nowProduction!==null&&pastProduction!==null?wsTrend({count:1,delta:nowProduction-pastProduction,
    pct:pastProduction===0?null:100*(nowProduction-pastProduction)/pastProduction}):{cls:'neutral',txt:'مقارنة الإنتاج غير متاحة'};
   return '<div class="dashboard-plant '+(r?'received':'pending')+'">'+
    '<div class="dashboard-plant-head"><h4 class="dashboard-plant-name">'+esc(s.name)+(isExcelImportedReport(r)?'<small style="display:block;font-size:10px;font-weight:500">مزامنة آلية من Excel</small>':r?.source==='migration'?'<small style="display:block;font-size:10px;font-weight:500">من سجل واتساب التاريخي</small>':'')+'</h4>'+
     '<span class="dashboard-status '+(r?'received':'pending')+'">'+status+'</span></div>'+
    '<div class="dashboard-submission">'+
     '<div class="dashboard-field"><small>'+(isExcelImportedReport(r)?'تاريخ حفظ التقرير الآلي':r?.source==='migration'?'تاريخ رسالة واتساب':'تاريخ إرسال التقرير')+'</small><strong>'+esc(submit?.date||'—')+'</strong></div>'+
     '<div class="dashboard-field"><small>'+(isExcelImportedReport(r)?'وقت الحفظ الآلي — السعودية':r?.source==='migration'?'وقت رسالة واتساب — السعودية':'وقت إرسال الموقع — السعودية')+'</small><strong dir="auto">'+esc(submit?.time||'—')+'</strong></div>'+
    '</div>'+
    '<div class="dashboard-station-values">'+present.map(([label,value])=>
     '<div class="dashboard-station-value"><small>'+esc(label)+'</small><strong>'+esc(dashboardMetricLabel(value))+'</strong></div>').join('')+'</div>'+
    '<div class="ws-station-trend '+trend.cls+'">'+esc(trend.txt)+'</div>'+excelDashboardFields(r)+ 
    (r?'<div class="dashboard-plant-actions"><button type="button" class="btn" data-dashboard-report="'+esc(r.id)+'">عرض التقرير</button></div>':'')+
    '</div>';
  }).join('');
  const stationSection='<section class="dashboard-section"><div class="dashboard-section-head">'+
   '<h3>تقارير المحطات — '+esc(dashboardShortDate(date))+'</h3><small>نسبة الاستلام: '+readyRate+'%</small></div>'+
   '<div class="dashboard-plant-grid">'+cards+'</div></section>';
  const days=Array.from({length:7},(_,i)=>dashboardShiftDate(begin,i));
  const history=days.map(day=>{
   const selected=stations.map(s=>byDayStation.get(s.id+'@'+day)).filter(Boolean);
   return {day,total:dashboardTotal(selected,'production'),reports:selected.length};
  });
  const maxima=Math.max(0,...history.map(r=>r.total===null?0:r.total));
  const bars=history.map(v=>{
   const height=v.total===null?0:v.total===0?3:Math.max(5,Math.round(v.total/Math.max(maxima,1)*100));
   return '<div class="dashboard-week-col'+(v.day===date?' dashboard-week-today':'')+'" title="'+
    esc(dashboardShortDate(v.day)+' — '+(v.total===null?'لا توجد قراءة إنتاج':fmt(v.total)+' م³'))+'">'+
    '<span class="dashboard-week-value">'+esc(v.total===null?'—':fmt(v.total))+'</span>'+
    '<div class="dashboard-week-track"><div class="dashboard-week-fill" data-target-height="'+height+'" style="height:0%"></div></div>'+
    '<span class="dashboard-week-date">'+esc(dashboardShortDate(v.day).slice(0,5))+'</span></div>';
  }).join('');
  const historySection='<section class="dashboard-section"><div class="dashboard-section-head"><h3>اتجاه الإنتاج خلال 7 أيام</h3>'+
   '<small>إجمالي الإنتاج المسجل يوميًا (م³)</small></div><div class="dashboard-week">'+
   '<div class="dashboard-week-bars" role="img" aria-label="إنتاج المحطات في الأيام السبعة">'+bars+'</div>'+
   '<div class="dashboard-section-head" style="margin:12px 0 0"><small>الشرطة (—) تعني عدم وجود قراءة إنتاج، ولا تُحسب صفرًا.</small></div></div></section>';
  const recent=latestItems.filter(r=>ids.has(r.station_id)).slice(0,10);
  const recentRows=recent.length?recent.map(r=>{
   const station=stations.find(s=>s.id===r.station_id);
   const stamp=dashboardSubmitTime(importedReportTimestamp(r));
   return '<div class="dashboard-recent-row"><div class="dashboard-recent-station">'+esc(station?.name||r.station_id)+'</div>'+
    '<div><span class="dashboard-recent-label">تاريخ التقرير</span><div class="dashboard-recent-value">'+esc(dashboardShortDate(r.report_date))+'</div></div>'+
    '<div><span class="dashboard-recent-label">'+(isExcelImportedReport(r)?'وقت الحفظ الآلي من Excel':r.source==='migration'?'وقت رسالة واتساب':'وقت الإرسال من الموقع')+'</span><div class="dashboard-recent-value">'+esc(stamp.date)+' — '+esc(stamp.time)+'</div></div></div>';
  }).join(''):'<div class="dashboard-empty">لا توجد تقارير مرسلة حتى الآن.</div>';
  const recentSection='<section class="dashboard-section"><div class="dashboard-section-head"><h3>آخر عمليات إرسال التقارير</h3>'+
   '<small>توقيت السعودية (UTC+3)</small></div><div class="dashboard-recent">'+recentRows+'</div></section>';
  view.innerHTML=wsInstruments(selectedRows,byDayStation,date,readyRate)+summary+stationSection+historySection+recentSection;
  wsAnimateInstruments(view);
  window.WSMotion?.animate(view);
 }catch(e){
  view.innerHTML='<div class="archive-empty">'+esc(e.message||'تعذّر تحميل الداشبورد.')+'</div>';
 }finally{
  view.setAttribute('aria-busy','false');
  button.disabled=false;
  dashboardUpdating=false;
 }
}



async function accountAdminRequest(action,params={}){
 if(!isSuperAdmin())throw Error('يتطلب هذا الإجراء صلاحية أدمن');
 const resp=await authedFetch('/functions/v1/account-admin',{
  method:'POST',body:JSON.stringify({action,...params})
 });
 const out=await resp.json().catch(()=>({}));
 if(!resp.ok){
  const messages={superadmin_required:'هذه العملية متاحة للسوبر أدمن فقط',
   username_unavailable:'اسم المستخدم مستخدم بالفعل',
   invalid_account_data:'تحقق من اسم المستخدم وكلمة المرور',
   invalid_password:'أدخل كلمة مرور من رمزين على الأقل',
   user_not_found:'الحساب غير موجود',station_not_active:'المحطة غير مفعّلة',
   last_superadmin:'لا يمكن حذف آخر حساب سوبر أدمن',
   cannot_delete_current_account:'لا يمكن حذف الحساب المستخدم حاليًا'};
  throw Error(messages[out.error]||'تعذر تنفيذ العملية: '+(out.error||resp.status));
 }
 return out;
}
function accountsOpen(){
 if(!isSuperAdmin())return;
 $('accountsModal').classList.remove('hidden');
 $('accountType').value='station';
 for(const role of ['admin','superadmin']){
  $('accountType').querySelector('option[value="'+role+'"]').disabled=!isSuperAdmin();
 }
 $('accountStation').innerHTML=stations.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
 $('accountStation').value=stations[0]?.id||'';
 $('accountUsername').value=STATION_PLANT_CODES[stations[0]?.id]||'';
 $('accountPassword').value=STATION_PLANT_CODES[stations[0]?.id]||'';
 $('accountResponse').classList.add('hidden');
 $('accountResetPanel').classList.add('hidden');
 accountTypeChanged();
 accountsRefresh();
}
function accountTypeChanged(){
 const role=$('accountType').value;
 const station=['station','maintenance'].includes(role);
 $('accountStationField').classList.toggle('hidden',!station);
 if(role==='maintenance'&&Object.values(STATION_PLANT_CODES).includes($('accountUsername').value)){
  $('accountUsername').value='maint_'+$('accountStation').value;
  $('accountPassword').value='';
 }
 $('accountUsername').readOnly=false;
 $('accountPassword').readOnly=false;
 $('generatePassword').classList.remove('hidden');
 $('accountUsername').placeholder=role==='maintenance'?'مثال: maint_jizan':station?'رمز المحطة أو اسم مخصص':'اسم المستخدم';
 if(!station&&Object.values(STATION_PLANT_CODES).includes($('accountUsername').value)){
  $('accountUsername').value='';
  $('accountPassword').value='';
 }
 $('createAccount').disabled=false;
}
const sessionAssignedPasswords=new Map();
async function accountsRefresh(){
 if(!isSuperAdmin())return;
 $('accountList').innerHTML='<div class="archive-empty">جاري تحميل الحسابات…</div>';
 try{
  const result=await accountAdminRequest('list');
  const accounts=result.accounts||[];
  $('accountList').innerHTML=accounts.length?accounts.map(acc=>{
   const type=acc.role==='superadmin'?'سوبر أدمن':acc.role==='admin'?'أدمن':acc.role==='maintenance'?'مهندس صيانة':'حساب محطة';
   const name=acc.username||acc.email||'حساب إداري';
   const station=acc.stationId?stations.find(s=>s.id===acc.stationId)?.name||acc.stationId:'جميع المحطات';
   const canManage=['station','maintenance'].includes(acc.role)||isSuperAdmin();
   const canDelete=canManage&&acc.id!==currentUserId;
   return '<div class="sec-row" data-account-id="'+esc(acc.id)+'"><div><span class="account-username">'+esc(name)+'</span><small>'+esc(type)+' • '+esc(station)+'</small></div>'+
    '<div class="admin-row-btns">'+
     (canManage?'<button class="btn" data-user-action="reset_password" data-id="'+esc(acc.id)+'" data-role="'+esc(acc.role)+'" data-name="'+esc(name)+'">تغيير كلمة المرور</button>':'')+
     (isSuperAdmin()&&sessionAssignedPasswords.has(acc.id)?'<button class="btn" data-user-action="show_session_password" data-id="'+esc(acc.id)+'" data-name="'+esc(name)+'">عرض كلمة المرور المعينة</button>':'')+
     (isSuperAdmin()&&['station','maintenance'].includes(acc.role)?'<button class="btn" data-user-action="move_station" data-id="'+esc(acc.id)+'" data-name="'+esc(name)+'">نقل المحطة</button>':'')+
     (canDelete?'<button class="btn danger" data-user-action="delete" data-id="'+esc(acc.id)+'" data-role="'+esc(acc.role)+'" data-name="'+esc(name)+'">حذف الحساب</button>':'')+
    '</div></div>';
  }).join(''):'<div class="archive-empty">لا توجد حسابات بعد.</div>';
  window.WSMotion?.animate($('accountList'));
 }catch(err){$('accountList').innerHTML='<div class="archive-empty">'+esc(err.message)+'</div>'}
}
function makePassword(){
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
 const bytes=new Uint32Array(26);crypto.getRandomValues(bytes);
 const chars=Array.from(bytes,x=>alphabet[x%alphabet.length]);
 chars[0]='ABCDEFGHJKLMNPQRSTUVWXYZ'[bytes[0]%24];
 chars[1]='abcdefghijkmnopqrstuvwxyz'[bytes[1]%25];
 chars[2]='23456789'[bytes[2]%8];
 return chars.join('');
}
function strongPassword(){$('accountPassword').value=makePassword()}
function accountMessage(message){
 $('accountResponse').textContent=message;
 $('accountResponse').classList.remove('hidden');
}
async function userWrite(){
 if(!isSuperAdmin())return;
 const role=$('accountType').value;
 const username=$('accountUsername').value.trim().toLowerCase();
 const password=$('accountPassword').value;
 const stationId=$('accountStation').value;
 if(!isValidLoginName(username)){toast('أدخل اسم مستخدم صحيحًا (حتى 64 حرفًا).',true);return}
 if(!isValidAccountPassword(password)){toast('كلمة المرور يجب أن تكون من رمزين على الأقل.',true);return}
 if(role!=='station'&&!isSuperAdmin()){toast('إضافة الحسابات الإدارية متاحة للسوبر أدمن.',true);return}
 if(role==='superadmin'&&!confirm('إنشاء حساب بصلاحية سوبر أدمن كاملة؟'))return;
 const button=$('createAccount');button.disabled=true;
 try{
  const output=await accountAdminRequest('create',{role,username,password,stationId});
  accountMessage('تم إنشاء الحساب.\nنوع الحساب: '+(role==='superadmin'?'سوبر أدمن':role==='admin'?'أدمن':role==='maintenance'?'مهندس صيانة — '+(stations.find(s=>s.id===stationId)?.name||stationId):'محطة '+(stations.find(s=>s.id===stationId)?.name||stationId))+
   '\nاسم المستخدم: '+output.username+'\nكلمة المرور: '+password);
  if(isSuperAdmin())sessionAssignedPasswords.set(output.id,password);
  $('accountUsername').value='';
  $('accountPassword').value='';
  await accountsRefresh();
  toast('تم إنشاء الحساب');
 }catch(err){toast(err.message,true)}
 finally{button.disabled=false}
}
let resettingAccount=null;
function preparePasswordReset(id,name){
 resettingAccount={id,name};
 $('accountResetName').textContent=name;
 $('accountResetPassword').value='';
 $('accountResetPanel').classList.remove('hidden');
 $('accountResetPassword').focus();
}
function closePasswordReset(){
 resettingAccount=null;
 $('accountResetPassword').value='';
 $('accountResetPanel').classList.add('hidden');
}
async function savePasswordReset(){
 if(!resettingAccount||!isSuperAdmin())return;
 const password=$('accountResetPassword').value;
 if(!isValidAccountPassword(password)){toast('كلمة المرور يجب أن تكون من رمزين على الأقل.',true);return}
 const btn=$('accountResetSave');btn.disabled=true;
 try{
  await accountAdminRequest('reset_password',{id:resettingAccount.id,password});
  if(isSuperAdmin())sessionAssignedPasswords.set(resettingAccount.id,password);
  accountMessage('تم تعيين كلمة المرور لحساب '+resettingAccount.name+'.\nكلمة المرور الجديدة: '+password);
  closePasswordReset();
  await accountsRefresh();
  toast('تم حفظ كلمة المرور');
 }catch(err){toast(err.message,true)}
 finally{btn.disabled=false}
}
async function accountListAction(e){
 const button=e.target.closest('[data-user-action]');
 if(!button||!isSuperAdmin())return;
 const action=button.dataset.userAction,id=button.dataset.id,name=button.dataset.name;
 if(action==='reset_password'){preparePasswordReset(id,name);return}
 if(action==='show_session_password'){
  if(!isSuperAdmin()||!sessionAssignedPasswords.has(id))return;
  accountMessage('الحساب: '+name+'\nكلمة المرور التي عيّنتها خلال الجلسة: '+sessionAssignedPasswords.get(id)+'\nقد تتغير إذا عدّلها صاحب الحساب.');
  return;
 }
 try{
  const params={id};
  if(action==='delete'){
   if(!isSuperAdmin()&&button.dataset.role!=='station')throw Error('هذه العملية متاحة للسوبر أدمن فقط.');
   if(!confirm('حذف حساب '+name+'؟'))return;
  }else if(action==='move_station'){
   if(!isSuperAdmin())return;
   const choices=stations.map(s=>s.id+' : '+s.name).join('\n');
   const stationId=prompt('اختر رمز المحطة:\n'+choices,stations[0]?.id||'');
   if(stationId===null)return;
   if(!stations.some(s=>s.id===stationId.trim()))throw Error('المحطة غير موجودة.');
   params.stationId=stationId.trim();
  }else return;
  button.disabled=true;
  await accountAdminRequest(action,params);
  accountMessage(action==='delete'?'تم حذف حساب '+name+'.':'تم تحديث محطة الحساب '+name+'.');
  await accountsRefresh();
  toast('تم تنفيذ العملية');
 }catch(err){toast(err.message,true)}
 finally{button.disabled=false}
}

async function createStationAccounts(){
 if(!isSuperAdmin())return;
 const available=stations.filter(s=>STATION_PLANT_CODES[s.id]);
 if(!available.length)return toast('لا توجد محطات ذات رموز معتمدة لإنشاء حساباتها.',true);
 if(!confirm('إنشاء حسابات المحطات برمز PLANT نفسه لاسم المستخدم وكلمة المرور؟\n'+available.map(s=>s.name+' ('+STATION_PLANT_CODES[s.id]+')').join('، ')))return;
 const button=$('createStationAccounts');button.disabled=true;
 const created=[],skipped=[],failures=[];
 try{
  const list=await accountAdminRequest('list');
  const accounts=list.accounts||[];
  const stationUsers=new Set(accounts.filter(a=>a.role==='station').map(a=>a.stationId));
  for(const station of available){
   const code=STATION_PLANT_CODES[station.id];
   if(stationUsers.has(station.id)){skipped.push(station.name+' ('+code+')');continue}
   const password=code;
   try{
    await accountAdminRequest('create',{role:'station',stationId:station.id,username:code,password});
    created.push({name:station.name,username:code,password});
    accountMessage('جارٍ تجهيز حسابات المحطات… تم إنشاء '+created.length+' حساب.');
   }catch(err){failures.push(station.name+': '+err.message)}
  }
  const summary=created.length
   ?'تم إنشاء '+created.length+' حساب محطة:\n\n'+created.map(a=>a.name+'\nاسم المستخدم: '+a.username+'\nكلمة المرور المؤقتة: '+a.password).join('\n\n')+
      '\n\nكل محطة تستطيع تغيير كلمة المرور بعد الدخول، والأدمن والسوبر أدمن يستطيعان إعادتها إلى رمز المحطة.'
   :'لم يتم إنشاء حسابات جديدة.';
  accountMessage(summary+
   (skipped.length?'\n\nحسابات موجودة (لم نغير كلمات مرورها): '+skipped.join('، '):'')+
   (failures.length?'\n\nتعذّر إنشاء: '+failures.join('، '):'')+
   '\n\nمربة مستبعدة لعدم وجود رمز PLANT لها في الملف.');
  await accountsRefresh();
  toast(failures.length?'اكتملت العملية مع بعض الأخطاء':'تم تجهيز حسابات المحطات المحددة',!!failures.length);
 }catch(err){toast(err.message,true)}
 finally{button.disabled=false}
}

function openOwnPassword(){
 if(!signedIn())return;
 $('fixedStationUsername').textContent=currentRole==='station'?currentLoginName:(authSession?.user?.email||currentLoginName);
 for(const id of ['selfPasswordOld','selfPasswordNew','selfPasswordConfirm'])$(id).value='';
 $('selfPasswordFeedback').textContent='';
 $('passwordModal').classList.remove('hidden');
 $('selfPasswordOld').focus();
}
function closeOwnPassword(){
 $('passwordModal').classList.add('hidden');
 for(const id of ['selfPasswordOld','selfPasswordNew','selfPasswordConfirm'])$(id).value='';
}
async function changeOwnPassword(event){
 event.preventDefault();
 if(!signedIn())return;
 const oldPassword=$('selfPasswordOld').value,password=$('selfPasswordNew').value,
  confirmPassword=$('selfPasswordConfirm').value;
 const feedback=$('selfPasswordFeedback');feedback.textContent='';
 if(!isValidAccountPassword(password)){feedback.textContent='أدخل كلمة مرور من رمزين على الأقل.';return}
 if(password!==confirmPassword){feedback.textContent='تأكيد كلمة المرور غير مطابق.';return}
 if(oldPassword===password){feedback.textContent='اختر كلمة مرور مختلفة عن الحالية.';return}
 const btn=$('saveOwnPassword');btn.disabled=true;
 try{
  const resp=await authedFetch('/functions/v1/account-admin',{
   method:'POST',body:JSON.stringify({action:'change_own_password',oldPassword,password})
  });
  const result=await resp.json().catch(()=>({}));
  if(!resp.ok){
   const error=result.error==='incorrect_current_password'?'كلمة المرور الحالية غير صحيحة.':
    result.error==='same_password'?'اختر كلمة مرور مختلفة.':
    'تعذّر تغيير كلمة المرور ('+(result.error||resp.status)+').';
   throw Error(error);
  }
  closeOwnPassword();
  await logout();
  $('loginError').textContent='تم تغيير كلمة المرور.';
 }catch(err){feedback.textContent=err.message||'تعذّر تغيير كلمة المرور.'}
 finally{btn.disabled=false}
}

/* These logs indicate requested interface actions, not proof of a completed physical print. */
function logActivity(action,reportId=''){
 if(!signedIn())return;
 const payload={action,stationId,reportDate:date,reportId:reportId||''};
 authedFetch('/functions/v1/activity-log',{method:'POST',body:JSON.stringify(payload)})
  .then(response=>{if(!response.ok)console.warn('Activity audit log unavailable',response.status)})
  .catch(error=>console.warn('Activity audit request failed',error));
}

let auditPage=0,auditPageSize=60,auditLastRows=[],auditTotal=0,auditBusy=false;
const auditOperationLabel={
 INSERT:'إضافة',UPDATE:'تعديل',DELETE:'حذف',
 CREATE_ACCOUNT:'إنشاء حساب',RESET_PASSWORD:'تغيير كلمة مرور',MOVE_STATION:'نقل حساب إلى محطة',DELETE_ACCOUNT:'حذف حساب',
 login:'تسجيل دخول',logout:'تسجيل خروج',PRINT_REQUESTED:'طلب طباعة',IMAGE_EXPORTED:'تصدير PNG',SHARE_REQUESTED:'مشاركة تقرير',VIEW_REPORT:'فتح تقرير مؤرشف',DASHBOARD_VIEW:'فتح الداشبورد',user_signedup:'إنشاء مستخدم',user_deleted:'حذف مستخدم',
 token_refreshed:'تجديد جلسة',token_revoked:'إنهاء جلسة',user_updated_password:'تحديث كلمة مرور',AUTH_EVENT:'حدث مصادقة'
};
const auditScopeLabel={reports:'التقارير',stations:'المحطات',users:'إدارة الحسابات',auth:'تسجيل الدخول',activity:'التصدير والطباعة والعرض'};
function auditFilters(offset=0){
 const from=$('auditFrom').value,to=$('auditTo').value;
 let until=null;
 if(to){const stop=new Date(to+'T00:00:00+03:00');stop.setUTCDate(stop.getUTCDate()+1);until=stop.toISOString()}
 return {
   p_limit:auditPageSize,p_offset:offset,
   p_since:from?new Date(from+'T00:00:00+03:00').toISOString():null,
   p_until:until,p_actor:$('auditActor').value.trim()||null,
   p_scope:$('auditScope').value||null,
   p_operation:$('auditOperation').value||null
 };
}
async function auditRequest(offset=0){
 if(!isSuperAdmin())throw Error('السجل متاح للسوبر أدمن فقط');
 const r=await authedFetch('/rest/v1/rpc/superadmin_activity',{
   method:'POST',body:JSON.stringify(auditFilters(offset))
 });
 if(!r.ok)throw Error('تعذر قراءة سجل النشاط أو انتهت صلاحية الدخول ('+r.status+').');
 const data=await r.json();
 if(!data||!Array.isArray(data.rows))throw Error('استجابة سجل النشاط غير صالحة.');
 return data;
}
function auditOpen(){
 if(!isSuperAdmin())return;
 $('auditModal').classList.remove('hidden');
 auditPage=0;
 auditSearch();
}
function auditClose(){$('auditModal').classList.add('hidden')}
function auditValueText(value){
 if(value===undefined)return '—';
 if(value===null)return 'فارغ';
 if(typeof value==='string')return value.length>450?value.slice(0,450)+'…':value;
 const raw=JSON.stringify(value);
 return raw.length>450?raw.slice(0,450)+'…':raw;
}
function auditDeltas(before,after,path='',depth=0,out=[]){
 if(out.length>=70)return out;
 const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(depth<6&&plain(before)&&plain(after)){
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);
  for(const key of keys){
   if(key==='updated_at')continue;
   const a=before[key],b=after[key];
   if(JSON.stringify(a)===JSON.stringify(b))continue;
   auditDeltas(a,b,path?path+'.'+key:key,depth+1,out);
   if(out.length>=70)break;
  }
 }else if(JSON.stringify(before)!==JSON.stringify(after)){
   out.push({field:path||'القيمة',before,after});
 }
 return out;
}
function auditChangesMarkup(entry){
 const details=entry.details||{};
 if(details.before===undefined&&details.after===undefined){
  const fields=Object.entries(details).filter(([k])=>!['actor_name','note'].includes(k));
  if(!fields.length)return '<div class="audit-legacy-note">لا تتوفر قيم تفصيلية لهذه العملية.</div>';
  return fields.map(([name,value])=>
   '<div class="audit-change"><strong>'+esc(name)+'</strong><code>—</code><code class="new-val">'+esc(auditValueText(value))+'</code></div>').join('');
 }
 const changes=auditDeltas(details.before||{},details.after||{});
 if(!changes.length)return '<div class="audit-legacy-note">لا يوجد اختلاف في القيم الرئيسية.</div>';
 const header='<div class="audit-change" style="font-weight:900"><strong>الحقل</strong><span>قبل</span><span>بعد</span></div>';
 return header+changes.slice(0,70).map(x=>
  '<div class="audit-change"><strong>'+esc(x.field)+'</strong><code>'+esc(auditValueText(x.before))+'</code><code class="new-val">'+esc(auditValueText(x.after))+'</code></div>'
 ).join('')+(changes.length>=70?'<div class="audit-legacy-note">تم عرض أول 70 قيمة متغيرة من هذه العملية.</div>':'');
}
function auditRowHtml(row){
 const op=row.operation||'EVENT',scope=row.scope||'',
    time=row.created_at?new Date(row.created_at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}):'—';
 const operation=auditOperationLabel[op]||op;
 const color=/DELETE|REVOKE|deleted/i.test(op)?'danger':/UPDATE|RESET|MOVE/i.test(op)?'warn':'';
 const d=row.details||{};
 const target=d.target_username||d.station_id||d.station||row.row_id||'';
 const reportDate=d.report_date?' • تاريخ التقرير '+d.report_date:'';
 return '<div class="audit-row">'+
  '<div class="audit-row-main"><div><div class="audit-row-actor">'+esc(row.actor_name||row.actor_id||'النظام / غير معروف')+'</div>'+
  '<div class="audit-row-meta">'+esc(time)+' • '+esc(auditScopeLabel[scope]||scope)+
    ' • '+esc(row.actor_role||'')+'</div></div>'+
  '<span class="audit-action '+color+'">'+esc(operation)+'</span></div>'+
  (target?'<div class="audit-target">المستهدف: <strong>'+esc(target)+'</strong>'+esc(reportDate)+'</div>':'')+
  '<details class="audit-detail"><summary>عرض تفاصيل العملية والتغييرات</summary><div style="margin-top:9px">'+
  auditChangesMarkup(row)+'</div></details></div>';
}
async function auditSearch(reset=false){
 if(!isSuperAdmin()||auditBusy)return;
 if(reset)auditPage=0;
 auditBusy=true;
 $('auditSearch').disabled=true;$('auditResults').innerHTML='<div class="archive-empty">جاري تحميل سجل النشاط…</div>';
 try{
  const data=await auditRequest(auditPage*auditPageSize);
  auditLastRows=data.rows;auditTotal=Number(data.total)||0;
  $('auditResults').innerHTML=auditLastRows.length?auditLastRows.map(auditRowHtml).join(''):
      '<div class="archive-empty">لا توجد عمليات مسجلة تطابق الفلاتر.</div>';
  window.WSMotion?.animate($('auditResults'));
  $('auditCount').textContent='إجمالي العمليات: '+auditTotal.toLocaleString('ar-SA');
  $('auditPageLabel').textContent='صفحة '+(auditPage+1)+' من '+Math.max(1,Math.ceil(auditTotal/auditPageSize));
  $('auditPrevious').disabled=auditPage===0;
  $('auditNext').disabled=(auditPage+1)*auditPageSize>=auditTotal;
  $('auditExport').disabled=auditTotal===0;
 }catch(err){
  $('auditResults').innerHTML='<div class="archive-empty">'+esc(err.message)+'</div>';
  $('auditCount').textContent='تعذّر جلب السجلات';
  $('auditPrevious').disabled=true;$('auditNext').disabled=true;$('auditExport').disabled=true;
 }finally{auditBusy=false;$('auditSearch').disabled=false}
}
async function auditExportCsv(){
 if(!isSuperAdmin()||auditBusy||!auditTotal)return;
 const button=$('auditExport');button.disabled=true;
 try{
  let rows=[];
  const maxRows=3000;
  const count=Math.min(auditTotal,maxRows);
  for(let at=0;at<count;at+=auditPageSize){
    const result=await auditRequest(at);rows.push(...result.rows);
    button.textContent='جاري تجهيز '+rows.length+' من '+count;
    if(!result.rows.length)break;
  }
  const fields=['الوقت','اسم المستخدم','معرف المستخدم','الدور','القسم','العملية','المستهدف','التفاصيل'];
  function csvCell(v){
   let value=String(v??'');
   if(/^[\s]*[=+\-@]/.test(value))value="'"+value; // Avoid spreadsheet formula injection.
   return '"'+value.replace(/"/g,'""')+'"';
  }
  const csv=[fields.map(csvCell).join(','),...rows.map(r=>[
   r.created_at,r.actor_name,r.actor_id,r.actor_role,auditScopeLabel[r.scope]||r.scope,
   auditOperationLabel[r.operation]||r.operation,r.details?.target_username||r.row_id||r.details?.station_id||'',
   JSON.stringify(r.details||{})
  ].map(csvCell).join(','))].join('\r\n');
  const blob=new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Water_Solutions_Audit_Log_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  if(auditTotal>maxRows)toast('تم تصدير أول '+maxRows+' سجل. استخدم فلاتر التاريخ لتقسيم باقي السجل.',true);
  else toast('تم تصدير سجل العمليات.');
 }catch(err){toast('تعذر تصدير سجل التدقيق: '+err.message,true)}
 finally{button.disabled=false;button.textContent='↓ تصدير نتائج البحث CSV'}
}

$('loginForm').addEventListener('submit',loginSubmit);
$('loginTogglePassword').addEventListener('click',()=>{
 const fld=$('loginPassword'),revealed=fld.type==='password';
 fld.type=revealed?'text':'password';
 $('loginTogglePassword').textContent=revealed?'إخفاء':'إظهار';
 $('loginTogglePassword').setAttribute('aria-pressed',revealed?'true':'false');
 $('loginTogglePassword').setAttribute('aria-label',revealed?'إخفاء كلمة المرور':'إظهار كلمة المرور');
 fld.focus();
});
$('signoutBtn').addEventListener('click',logout);
$('dashboardBtn').addEventListener('click',dashboardOpen);
$('dashboardClose').onclick=()=>{$('dashboardModal').classList.add('hidden')};
$('dashboardRefresh').onclick=dashboardRefresh;
$('dashboardDate').addEventListener('change',dashboardRefresh);
$('dashboardToday').onclick=()=>{$('dashboardDate').value=dashboardSaudiDate();dashboardRefresh()};
$('dashboardYesterday').onclick=()=>{$('dashboardDate').value=dashboardShiftDate(dashboardSaudiDate(),-1);dashboardRefresh()};
$('dashboardLastHistorical').onclick=async()=>{
 if(!isAdmin())return;
 const button=$('dashboardLastHistorical');button.disabled=true;
 try{
  const q=new URLSearchParams({select:'report_date',source:'eq.migration',order:'report_date.desc',limit:'1'});
  const response=await authedFetch('/rest/v1/reports?'+q);
  if(!response.ok)throw Error('تعذر الوصول للتقارير التاريخية.');
  const rows=await response.json();
  if(!rows.length)throw Error('لا يوجد سجل تاريخي بعد.');
  $('dashboardDate').value=rows[0].report_date;
  dashboardRefresh();
 }catch(error){toast(error.message,true);}
 finally{button.disabled=false;}
};
$('dashboardContent').addEventListener('click',event=>{
 const button=event.target.closest('[data-dashboard-report]');
 if(button&&isAdmin())archiveShow(button.dataset.dashboardReport);
});
setInterval(()=>{
 if(isAdmin()&&!$('dashboardModal').classList.contains('hidden')&&document.visibilityState!=='hidden')dashboardRefresh();
},60000);
$('accountsBtn').addEventListener('click',accountsOpen);
$('auditBtn').addEventListener('click',auditOpen);
$('auditClose').onclick=auditClose;
$('auditSearch').onclick=()=>auditSearch(true);
$('auditPrevious').onclick=()=>{if(auditPage>0){auditPage--;auditSearch()}};
$('auditNext').onclick=()=>{if((auditPage+1)*auditPageSize<auditTotal){auditPage++;auditSearch()}};
$('auditExport').onclick=auditExportCsv;
$('auditModal').addEventListener('click',e=>{if(e.target.id==='auditModal')auditClose()});
$('auditActor').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();auditSearch(true)}});

$('accountsClose').onclick=()=>{$('accountsModal').classList.add('hidden')};
$('accountType').addEventListener('change',accountTypeChanged);
$('accountStation').addEventListener('change',()=>{
 const code=STATION_PLANT_CODES[$('accountStation').value]||'';
 const role=$('accountType').value;
 if(role==='maintenance'){
  const name=$('accountUsername').value;
  if(!name||name.startsWith('maint_')||Object.values(STATION_PLANT_CODES).includes(name))
   $('accountUsername').value='maint_'+$('accountStation').value;
  return;
 }
 if(role!=='station')return;
 if(!$('accountUsername').value||Object.values(STATION_PLANT_CODES).includes($('accountUsername').value)){
  $('accountUsername').value=code;
  $('accountPassword').value=code;
 }
});
$('generatePassword').onclick=strongPassword;
$('createAccount').onclick=userWrite;
$('refreshAccounts').onclick=accountsRefresh;
$('accountResetSave').onclick=savePasswordReset;
$('accountResetCancel').onclick=closePasswordReset;
$('createStationAccounts').onclick=createStationAccounts;
$('changeOwnPasswordBtn').onclick=openOwnPassword;
function setupPasswordEye(inputId,buttonId){
 const field=$(inputId),button=$(buttonId);
 if(!field||!button)return;
 button.onclick=()=>{
  const visible=field.type==='password';
  field.type=visible?'text':'password';
  button.textContent=visible?'إخفاء كلمة المرور':'إظهار كلمة المرور المدخلة';
 };
}
setupPasswordEye('accountPassword','accountPasswordToggle');
setupPasswordEye('accountResetPassword','accountResetToggle');
$('closeOwnPassword').onclick=closeOwnPassword;
$('selfPasswordForm').onsubmit=changeOwnPassword;
$('passwordModal').addEventListener('click',event=>{if(event.target.id==='passwordModal')closeOwnPassword()});
$('accountList').addEventListener('click',accountListAction);

$('archiveBtn').onclick=archiveOpen;
$('archiveClose').onclick=archiveClose;
$('archiveSearch').onclick=archiveSearch;
$('archiveExcel').onclick=archiveExcel;
$('archivePdf').onclick=archivePdf;
for(const id of ['archiveFrom','archiveTo','archiveMonth','archiveYear']){
 $(id).addEventListener('change',()=>{
  archiveSearchVersion++;archiveRows=[];archiveQueryInfo=null;
  $('archiveSearch').disabled=false;
  $('archiveExports').classList.add('hidden');
  $('archiveResults').innerHTML='<div class="archive-empty">اضغط عرض التقارير لتحديث النتائج.</div>';
 });
}
document.querySelector('.archive-modes').addEventListener('click',e=>{
 const button=e.target.closest('[data-archive-mode]');
 if(button){archiveSetMode(button.dataset.archiveMode);if(button.dataset.archiveMode==='monthly'&&archiveSuggestedMonth)$('archiveMonth').value=archiveSuggestedMonth;archiveSearch();}
});
$('archiveStation').onchange=()=>{
 archiveSearchVersion++;archiveRows=[];archiveQueryInfo=null;
 $('archiveSearch').disabled=false;
 $('archiveResults').setAttribute('aria-busy','false');
 $('archiveExports').classList.add('hidden');
 $('archiveResults').innerHTML='<div class="archive-empty">اضغط عرض التقارير لتحديث النتائج.</div>';
};
$('archiveResults').onclick=e=>{
 const more=e.target.closest('[data-archive-more]'),month=e.target.closest('[data-archive-month]');
 const see=e.target.closest('[data-archive-id]'),edit=e.target.closest('[data-archive-edit]'),del=e.target.closest('[data-archive-delete]');
 if(more){archiveVisibleCount+=ARCHIVE_SHOW_STEP;archiveRender()}
 else if(month){archiveSetMode('monthly');$('archiveMonth').value=month.dataset.archiveMonth;archiveSearch()}
 else if(see)archiveShow(see.dataset.archiveId);
 else if(edit&&isSuperAdmin())archiveShow(edit.dataset.archiveEdit,true);
 else if(del&&isSuperAdmin())archiveDelete(del.dataset.archiveDelete);
};
$('archiveModal').addEventListener('click',e=>{if(e.target.id==='archiveModal')archiveClose()});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('archiveModal').classList.contains('hidden'))archiveClose()});


let resetBearer='',resetEmail='';
function showResetNotice(el,text,error=false){$(el).textContent=text;$(el).classList.toggle('error',error)}
function resetToLogin(){
 resetBearer='';$('newRecoveryPassword').value='';$('confirmRecoveryPassword').value='';
 $('recoveryScreen').classList.add('hidden');$('loginScreen').classList.remove('hidden');
 $('forgotForm').classList.add('hidden');$('loginForm').classList.remove('hidden');
 $('forgotButton').classList.remove('hidden');$('loginPassword').value='';
 if(resetEmail)$('loginUsername').value=resetEmail;
}
function forgotFormOpen(message='',error=false){
 $('loginForm').classList.add('hidden');$('forgotButton').classList.add('hidden');
 $('forgotForm').classList.remove('hidden');$('loginError').textContent='';
 const raw=$('loginUsername').value.trim();if(raw.includes('@'))$('forgotEmail').value=raw;
 showResetNotice('forgotNotice',message,error);
}
async function sendRecovery(event){
 event.preventDefault();
 const btn=$('sendRecoveryButton'),email=$('forgotEmail').value.trim().toLowerCase();
 if(!email.includes('@'))return showResetNotice('forgotNotice','أدخل البريد الإلكتروني.',true);
 btn.disabled=true;
 showResetNotice('forgotNotice','جارٍ طلب رابط الاستعادة من Supabase…');
 try{
  const resp=await fetch(CLOUD_AUTH+'/recover?redirect_to='+encodeURIComponent(location.origin+'/'),{
   method:'POST',headers:{apikey:CLOUD_PUBLIC_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({email})
  });
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok){
   if(resp.status===429||data.code==='over_email_send_rate_limit'||data.code==='over_request_rate_limit'){
    throw Error('وصلت خدمة البريد في Supabase إلى حد الإرسال المؤقت. لا يمكن تجاوز هذا الحد بتحديث الصفحة أو تكرار الضغط. أعد المحاولة بعد انتهاء فترة التقييد.');
   }
   throw Error(data.msg||data.message||'تعذر إرسال الرابط. تحقق من إعدادات البريد في Supabase.');
  }
  showResetNotice('forgotNotice','تم قبول طلب الاستعادة. افتح أحدث رسالة في بريدك واضغط رابط تغيير كلمة المرور مباشرة. يمكنك طلب رابط آخر لاحقًا ما دامت خدمة البريد تسمح بذلك.');
 }catch(err){showResetNotice('forgotNotice',err.message||'حدث خطأ عند إرسال الرابط.',true)}
 finally{btn.disabled=false}
}

/* One-time recovery tokens arrive through the original Supabase email link.
   Tokens stay in memory and are removed from the browser URL immediately. */
async function completeRecoveryFromToken(accessToken='',tokenHash=''){
 let token=accessToken;
 if(!token&&tokenHash){
  const res=await fetch(CLOUD_AUTH+'/verify',{
   method:'POST',headers:{apikey:CLOUD_PUBLIC_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({type:'recovery',token_hash:tokenHash})
  });
  const verified=await res.json().catch(()=>({}));
  if(!res.ok||!verified.access_token)
   throw Error('رابط الاستعادة غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا بعد انتهاء حد الإرسال.');
  token=verified.access_token;
 }
 if(!token)throw Error('رابط الاستعادة لا يحتوي على رمز صحيح.');
 const resp=await fetch(CLOUD_AUTH+'/user',{
   headers:{apikey:CLOUD_PUBLIC_KEY,Authorization:'Bearer '+token}
 });
 if(!resp.ok)throw Error('انتهت صلاحية رابط الاستعادة. اطلب رابطًا جديدًا بعد انتهاء حد الإرسال.');
 const identity=await resp.json();
 if(!identity?.id||!identity?.email)throw Error('تعذر التحقق من هوية صاحب الرابط.');
 resetBearer=token;
 resetEmail=identity.email;
 $('loginScreen').classList.add('hidden');
 $('recoveryScreen').classList.remove('hidden');
 $('recoveryForm').classList.remove('hidden');
 showResetNotice('recoveryNotice','تم التحقق من الرابط لحساب '+identity.email+'. يمكنك تعيين كلمة المرور الجديدة الآن.');
}
async function checkRecoveryLink(){
 const frag=new URLSearchParams(location.hash.replace(/^#/,'')),q=new URLSearchParams(location.search);
 const recovery=frag.get('type')==='recovery'||q.get('type')==='recovery';
 const failure=frag.get('error')||q.get('error');
 if(!recovery&&!failure)return false;
 const access=frag.get('access_token'),hash=q.get('token_hash');
 // Clear sensitive bearer tokens from URL before async calls.
 history.replaceState(null,document.title,location.origin+location.pathname);
 if(failure||(!access&&!hash)){
  forgotFormOpen('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',true);return true;
 }
 try{
  await completeRecoveryFromToken(access||'',hash||'');
 }catch(err){forgotFormOpen(err.message||'تعذر التحقق من الرابط.',true)}
 return true;
}
async function applyRecoveredPassword(event){
 event.preventDefault();
 const a=$('newRecoveryPassword').value,b=$('confirmRecoveryPassword').value;
 if(!resetBearer)return showResetNotice('recoveryNotice','انتهت جلسة الاستعادة. اطلب رابطًا جديدًا.',true);
 if(a.length<12||!/[a-z]/.test(a)||!/[A-Z]/.test(a)||!/\d/.test(a))
   return showResetNotice('recoveryNotice','كلمة المرور: 12 رمزًا على الأقل مع أحرف كبيرة وصغيرة ورقم.',true);
 if(a!==b)return showResetNotice('recoveryNotice','كلمتا المرور غير متطابقتين.',true);
 const btn=$('saveRecoveryButton');btn.disabled=true;
 try{
  const resp=await fetch(CLOUD_AUTH+'/user',{method:'PUT',headers:{apikey:CLOUD_PUBLIC_KEY,Authorization:'Bearer '+resetBearer,'Content-Type':'application/json'},body:JSON.stringify({password:a})});
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(data.msg||data.message||'تعذر تحديث كلمة المرور. أعد طلب الرابط.');
  resetBearer='';$('newRecoveryPassword').value='';$('confirmRecoveryPassword').value='';
  $('recoveryForm').classList.add('hidden');
  showResetNotice('recoveryNotice','تم تغيير كلمة المرور. استخدمها لتسجيل الدخول.');
 }catch(err){showResetNotice('recoveryNotice',err.message||'تعذر حفظ كلمة المرور.',true)}
 finally{btn.disabled=false}
}
$('forgotButton').onclick=()=>forgotFormOpen();
$('backFromForgot').onclick=resetToLogin;
$('backFromRecovery').onclick=resetToLogin;
$('forgotForm').onsubmit=sendRecovery;
$('recoveryRefreshButton').onclick=()=>location.reload();
$('recoveryForm').onsubmit=applyRecoveredPassword;


const chemicalPanel=(function(host){
'use strict';

const $=id=>document.getElementById('chem-widget-'+id);
let user=null,role='',ownStation='',stations=[],records=[],filterStage='ALL',initialUid='';
const stages={PRE:'المعالجة الأولية',RO:'التناضح العكسي',POST:'المعالجة النهائية',CIP:'الغسيل الكيميائي',GENERAL:'غير محدد'};
const esc=value=>String(value??'').replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]});
const fixed=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
function today(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
function ageDays(d){const a=Date.parse(d+'T12:00:00Z'),b=Date.parse(today()+'T12:00:00Z');return Number.isFinite(a)?Math.max(0,Math.floor((b-a)/86400000)):0}
function state(days){return days===null?'unknown':days<30?'critical':days<=60?'warning':'good'}
function color(days){return {critical:'#d64545',warning:'#e6a117',good:'#2e9e5b',unknown:'#93a3b6'}[state(days)]}

/* Scale and needle follow the original chemical dashboard's half-circle instrument. */
function dial(days,title=''){
 const value=days===null?null:Number(days),safe=value===null?0:Math.max(0,Math.min(120,value)),cx=70,cy=64,R=48;
 const P=(a,r)=>[(cx+r*Math.cos(Math.PI*(1-a/120))).toFixed(2),(cy-r*Math.sin(Math.PI*(1-a/120))).toFixed(2)];
 const segment=(a,b,col,active)=>'<path d="M'+P(a,R)[0]+','+P(a,R)[1]+' A'+R+','+R+' 0 0 1 '+P(b,R)[0]+','+P(b,R)[1]+'" fill="none" stroke="'+col+'" stroke-width="13" opacity="'+(active?1:0.31)+'"/>';
 const z=state(value),active=x=>z===x;
 let ticks='';for(let a=10;a<120;a+=10){const [x1,y1]=P(a,R-8),[x2,y2]=P(a,R-13);ticks+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#9caebf" stroke-width="1"/>'}
 const label=(a,n)=>{const pt=P(a,R+14);return '<text x="'+pt[0]+'" y="'+(Number(pt[1])+4)+'" text-anchor="middle" font-size="10" font-weight="800" fill="#17324d">'+n+'</text>'};
 const angle=-90+safe/120*180,stroke=color(value);
 return '<svg viewBox="0 0 140 82" aria-label="'+esc(title+' — '+(value===null?'مدة غير مسجلة':fixed(value)+' يوم'))+'" role="img">'+
 segment(0,29.3,'#e05252',active('critical'))+segment(30.7,59.3,'#f0a92b',active('warning'))+segment(60.7,120,'#2fa865',active('good'))+
 ticks+label(30,'30')+label(60,'60')+
 '<text x="16" y="76" font-size="9" fill="#8998a8" text-anchor="middle">0</text><text x="124" y="76" font-size="9" fill="#8998a8" text-anchor="middle">120+</text>'+
 '<g class="ws-needle" data-target-angle="'+angle+'" style="transform:rotate(-90deg)"><path d="M66.8,64 L70,22 L73.2,64 Z" fill="#17324d"/></g>'
 '<circle cx="70" cy="64" r="7" fill="#17324d"/><circle cx="70" cy="64" r="2.7" fill="#fff"/></svg>';
}
function packIcon(row,dayState){
 const material=String(row.material||'').toLowerCase(),tint=color(row.coverage_days),gas=/chlorine gas|غاز|أسطوانة|cylinder/.test(material+' '+row.unit);
 const powder=/polymer|بودر|مسحوق|powder/.test(material);
 let shapes='';
 if(gas){for(let x=9;x<=45;x+=18){shapes+='<rect x="'+x+'" y="12" width="13" height="38" rx="5" fill="'+tint+'" opacity=".93"/><rect x="'+(x+4)+'" y="6" width="5" height="8" rx="1" fill="#849eb2"/><rect x="'+(x+5)+'" y="3" width="3" height="4" fill="#476a87"/>'}}
 else if(powder){for(let x=9;x<=45;x+=18){shapes+='<path d="M'+(x+3)+' 10 L'+(x+13)+' 10 L'+(x+16)+' 49 L'+x+' 49 Z" fill="'+tint+'"/><path d="M'+(x+4)+' 18 L'+(x+13)+' 18" stroke="white" opacity=".65" stroke-width="2"/>'}}
 else {for(let x=7;x<=45;x+=19){shapes+='<rect x="'+x+'" y="16" width="16" height="33" rx="4" fill="'+tint+'"/><ellipse cx="'+(x+8)+'" cy="16" rx="8" ry="4" fill="#e8f1f7" stroke="'+tint+'" stroke-width="2"/><path d="M'+(x+3)+' 28 h10" stroke="white" opacity=".6" stroke-width="2"/>'}}
 return '<div class="ws-pack" style="color:'+tint+'"><svg viewBox="0 0 72 59" aria-hidden="true">'+shapes+'</svg>'+
 '<span class="qty-pill">'+(row.quantity===null?'—':fixed(row.quantity))+' '+esc(row.quantity===null?'':row.unit)+'</span></div>';
}
const api=(path,options={})=>host.authedFetch(path,options);
async function init(){
 try{
  if(!host.signedIn())throw Error('يجب تسجيل الدخول إلى الموقع أولًا.');
  user={id:host.uid()};
  role=host.role();
  ownStation=host.station();
  if(!user.id||!['station','admin','superadmin'].includes(role))throw Error('تعذّر قراءة صلاحيات الحساب.');
  stations=host.stations().filter(v=>role!=='station'||v.id===ownStation).map(v=>({id:v.id,name:v.name}));
  if(role==='station'&&!ownStation)throw Error('حساب المستخدم غير مرتبط بمحطة.');
  if(!stations.length)throw Error('لا توجد محطات مسموح بعرضها.');
  $('account').textContent=role==='superadmin'?'حساب السوبر أدمن':role==='admin'?'حساب الإدارة':'حساب محطة';
  const options='<option value="ALL">جميع المحطات</option>'+stations.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('');
  $('stationFilter').innerHTML=role==='station'?options.replace('<option value="ALL">جميع المحطات</option>',''):options;
  $('fStation').innerHTML=stations.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('');
  $('fStation').value=ownStation||stations[0]?.id||'';
  $('fDate').value=today();
  $('editor').hidden=role==='admin';
  $('goEditor').hidden=role==='admin';
  await load();
  return true;
 }catch(e){
  $('plantGrid').innerHTML='<div class="empty">'+esc(e.message||'تعذّر فتح لوحة المواد الكيميائية')+'</div>';
  $('editor').hidden=true;$('goEditor').hidden=true;
  return false;
 }
}
async function load(){
 $('plantGrid').innerHTML='<div class="empty">جارٍ تحديث المخزون…</div>';
 try{const q=new URLSearchParams({select:'id,station_id,material,stage,quantity,unit,coverage_days,reading_date,notes,updated_at',order:'reading_date.desc,updated_at.desc',limit:'2000'});
 if(role==='station')q.set('station_id','eq.'+ownStation);
 const r=await api('/rest/v1/chemical_inventory?'+q.toString());
 if(!r.ok)throw Error('تعذّر جلب المخزون ('+r.status+')');
 const all=await r.json(),seen=new Set();
 records=all.filter(v=>{const key=v.station_id+'|'+v.material.trim().toLowerCase()+'|'+v.stage;if(seen.has(key))return false;seen.add(key);return true});
 render();
 }catch(e){$('plantGrid').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; $('stats').innerHTML=''}
}

/* Same two-frame animation trigger as the user's reference dashboard:
   render at zero first, then animate needle and fill to their data values. */
function animateChemicalIn(root){
 if(!root)return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(!root.isConnected)return;
  root.querySelectorAll('.ws-needle[data-target-angle]').forEach(el=>{
   el.style.transform='rotate('+el.dataset.targetAngle+'deg)';
  });
  root.querySelectorAll('.track i[data-target-width]').forEach(el=>{
   el.style.width=el.dataset.targetWidth+'%';
  });
 }));
}
function render(shouldAnimate=true){
 const query=$('search').value.trim().toLowerCase(),station=$('stationFilter').value,sort=$('sort').value;
 const selected=records.filter(r=>(!station||station==='ALL'||r.station_id===station)&&(filterStage==='ALL'||r.stage===filterStage)&&(!query||(r.material+' '+(stations.find(s=>s.id===r.station_id)?.name||'')).toLowerCase().includes(query)));
 const allRecords=records,crit=allRecords.filter(x=>x.coverage_days!==null&&x.coverage_days<30);
 const warn=allRecords.filter(x=>x.coverage_days!==null&&x.coverage_days>=30&&x.coverage_days<=60);
 const good=allRecords.filter(x=>x.coverage_days!==null&&x.coverage_days>60);
 const stale=allRecords.filter(x=>ageDays(x.reading_date)>14);
 const st=[['محطات لها قراءات',new Set(allRecords.map(x=>x.station_id)).size,''],['مواد مراقبة',allRecords.length,''],['أقل من 30 يوم',crit.length,'critical'],['30–60 يومًا',warn.length,'warning'],['أكثر من 60 يومًا',good.length,'good'],['قراءات قديمة',stale.length,'warning']];
 $('stats').innerHTML=st.map(x=>'<div class="stat '+x[2]+'"><strong>'+fixed(x[1])+'</strong><small>'+esc(x[0])+'</small></div>').join('');
 const groups=new Map();
 selected.forEach(r=>{if(!groups.has(r.station_id))groups.set(r.station_id,[]);groups.get(r.station_id).push(r)});
 let entries=Array.from(groups.entries());
 if(sort==='risk')entries.sort((a,b)=>Math.min(...a[1].map(v=>v.coverage_days??1e9))-Math.min(...b[1].map(v=>v.coverage_days??1e9)));
 else entries.sort((a,b)=>(stations.find(s=>s.id===a[0])?.name||a[0]).localeCompare(stations.find(s=>s.id===b[0])?.name||b[0],'ar'));
 $('plantGrid').innerHTML=entries.length?entries.map(function([id,all]){
 const rows=all.slice().sort((a,b)=>(a.coverage_days??1e9)-(b.coverage_days??1e9)),name=stations.find(s=>s.id===id)?.name||id;
 const min=Math.min(...rows.map(v=>v.coverage_days??1e9)),level=min===1e9?'unknown':state(min);
 const risk=level==='critical'?'تنبيه نقص المخزون':level==='warning'?'تغطية تحتاج متابعة':level==='good'?'تغطية جيدة':'بدون بيانات تغطية';
 const focus=rows.filter(v=>v.coverage_days!==null&&v.coverage_days<=60).slice(0,3);
 if(!focus.length)focus.push(...rows.filter(v=>v.coverage_days!==null).slice(0,1));
 return '<article class="plant"><div class="cardheader"><div><h2>'+esc(name)+'</h2><div class="plant-sub">مواد تحت المتابعة: '+rows.length+' · آخر تاريخ بيانات '+esc(rows.reduce((m,r)=>r.reading_date>m?r.reading_date:m,''))+'</div></div>'+
 '<span class="tag plant-risk '+level+'">'+risk+'</span>'+
 '<div class="plant-gauges">'+(focus.length?focus.map(r=>{
 const n=Number(r.coverage_days),col=color(n);
 return '<div class="gauge-item">'+dial(n,r.material)+
 '<div class="gauge-days" style="color:'+col+'">'+fixed(n)+' <small>يوم</small></div>'+
 '<div class="gauge-name">'+esc(r.material)+'</div><div class="gauge-date">'+esc(r.reading_date)+'</div></div>';
 }).join(''):'<div class="gauge-item gauge-empty">لا توجد فترة تغطية مسجلة</div>')+'</div></div>'+
 rows.map(r=>{
 const n=r.coverage_days===null?null:Number(r.coverage_days),status=state(n),shade=color(n),width=n===null?0:Math.round(Math.min(100,Math.max(0,n/120*100)));
 return '<section class="material">'+packIcon(r,status)+'<div class="material-detail"><h3>'+esc(r.material)+' <span class="tag">'+esc(stages[r.stage]||'غير محدد')+'</span></h3>'+
 '<div class="mat-balance"><span class="days-text" style="color:'+shade+'">'+(n===null?'تغطية غير مسجلة':'يكفي '+fixed(n)+' <small>يوم</small>')+'</span>'+
 '<span class="quant">· المتوفر '+(r.quantity===null?'غير مسجل':fixed(r.quantity))+'</span><span class="unit">'+esc(r.quantity===null?'':r.unit)+'</span></div>'+
 '<div class="track"><i class="'+status+'" data-target-width="'+width+'" style="width:0%"></i>'
 '<em class="mark" style="right:25%"></em><em class="mark" style="right:50%"></em><em class="mark" style="right:75%"></em></div>'+
 '<div class="footerrow"><small>قراءة المخزون: '+esc(r.reading_date)+'</small>'+(ageDays(r.reading_date)>14?'<span class="outdate">تاريخ قديم</span>':'')+'</div>'+
 (r.notes?'<span class="note">'+esc(r.notes)+'</span>':'')+'</div></section>';
 }).join('')+'</article>';
 }).join(''):'<div class="empty">لا توجد قراءات مطابقة.</div>';
 const grid=$('plantGrid');
 grid.classList.toggle('ws-no-motion',!shouldAnimate);
 if(shouldAnimate){
  animateChemicalIn(grid);
  window.WSMotion?.animate(grid);
  window.WSMotion?.animate($('stats'));
 }else{
  // Searches update immediately, without replaying needle motion per keystroke.
  grid.querySelectorAll('.ws-needle[data-target-angle]').forEach(el=>{
   el.style.transition='none';el.style.transform='rotate('+el.dataset.targetAngle+'deg)';
  });
  grid.querySelectorAll('.track i[data-target-width]').forEach(el=>{
   el.style.transition='none';el.style.width=el.dataset.targetWidth+'%';
  });
 }
}
async function save(e){
 e.preventDefault();if(!user||role==='admin')return;
 const quantity=$('fQuantity').value===''?null:Number($('fQuantity').value),days=$('fDays').value===''?null:Number($('fDays').value);
 if(quantity===null&&days===null){$('feedback').textContent='أدخل كمية أو مدة تغطية على الأقل';return}
 const payload={station_id:role==='station'?ownStation:$('fStation').value,material:$('fMaterial').value.trim(),stage:$('fStage').value,quantity,unit:$('fUnit').value,coverage_days:days,reading_date:$('fDate').value,notes:$('fNotes').value.trim(),recorded_by:user.id};
 if(!payload.station_id||payload.material.length<2||!/^\d{4}-\d{2}-\d{2}$/.test(payload.reading_date)){$('feedback').textContent='تحقق من البيانات المدخلة';return}
 const btn=$('save');btn.disabled=true;$('feedback').textContent='جارٍ الحفظ…';
 try{const q='?on_conflict=station_id,material,stage,reading_date';
 const resp=await api('/rest/v1/chemical_inventory'+q,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
 if(!resp.ok){const details=await resp.json().catch(()=>({}));throw Error(details.message||'تعذّر حفظ القراءة')}
 $('feedback').textContent='تم حفظ القراءة في قاعدة البيانات';$('fQuantity').value='';$('fDays').value='';$('fNotes').value='';await load();
 }catch(err){$('feedback').textContent='تعذّر الحفظ: '+err.message}finally{btn.disabled=false}
}
$('refresh').onclick=()=>load();
$('goEditor').onclick=()=>$('editor').scrollIntoView({behavior:'smooth',block:'start'});
$('chemForm').onsubmit=save;
$('search').oninput=()=>render(false);$('sort').onchange=()=>render(true);$('stationFilter').onchange=()=>render(true);
document.querySelectorAll('#chemRoot [data-stage]').forEach(el=>el.onclick=()=>{filterStage=el.dataset.stage;document.querySelectorAll('#chemRoot [data-stage]').forEach(b=>b.classList.toggle('active',b===el));render()});

function reset(){
 initialUid='';user=null;role='';ownStation='';stations=[];records=[];filterStage='ALL';
 $('plantGrid').innerHTML='<div class="empty">جارٍ تحميل بيانات المواد الكيميائية…</div>';
 $('stats').innerHTML='';
 $('search').value='';$('sort').value='risk';$('feedback').textContent='';
 $('fMaterial').value='';$('fQuantity').value='';$('fDays').value='';$('fNotes').value='';
 $('editor').hidden=true;$('goEditor').hidden=true;
 document.querySelectorAll('#chemRoot [data-stage]').forEach(el=>el.classList.toggle('active',el.dataset.stage==='ALL'));
}
return {
 async open(){
  if(!host.signedIn())return;
  if(initialUid!==host.uid()){
   reset();
   if(await init())initialUid=host.uid();
  }else await load();
 },
 reset
};

})({
 authedFetch:(path,options)=>authedFetch(path,options),
 uid:()=>currentUserId,
 role:()=>currentRole,
 station:()=>currentStationId,
 stations:()=>stations,
 signedIn:()=>signedIn()
});

function chemicalsOpen(){
 if(!signedIn())return;
 $('chemicalsModal').classList.remove('hidden');
 $('chemicalsClose').focus();
 void chemicalPanel.open();
}
function chemicalsClose(){
 $('chemicalsModal').classList.add('hidden');
 $('chemicalsLink').focus();
}
$('chemicalsLink').addEventListener('click',chemicalsOpen);
$('maintenanceLink').addEventListener('click',()=>{
 if(window.WSMaintenance?.open)window.WSMaintenance.open('daily');
 else toast('تعذّر تحميل قسم الصيانة. حدّث الصفحة وحاول مجددًا.',true);
});
$('chemicalsClose').addEventListener('click',chemicalsClose);
$('chemicalsModal').addEventListener('click',event=>{
 if(event.target===$('chemicalsModal'))chemicalsClose();
});
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!$('chemicalsModal').classList.contains('hidden'))chemicalsClose();
});

// Read-only workspace bridge. Existing business rules remain inside this module.
window.WSPlatformHost=Object.freeze({
 saveDraft:()=>{if(signedIn()&&currentRole!=='maintenance')preserveDraft();},
 role:()=>currentRole,
 station:()=>currentStationId
});

// Scoped integration API for the embedded maintenance panel.
window.WSMaintenanceHost=Object.freeze({
 signedIn:()=>signedIn(),
 role:()=>currentRole,
 stationId:()=>currentStationId,
 stations:()=>stations.map(s=>({id:s.id,name:s.name})),
 userId:()=>currentUserId,
 authedFetch:(path,options)=>authedFetch(path,options),
 logo:()=>MARK,
 gauge:(value,color,mode='level')=>wsDial(value,color,mode),
 animateGauges:node=>wsAnimateInstruments(node),
 logout:()=>logout()
});

void (async()=>{if(!(await checkRecoveryLink()))await restoreSession()})();
})();
