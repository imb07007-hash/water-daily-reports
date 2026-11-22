const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path'),base='http://127.0.0.1:4173/',API='https://vksbjasfoysuwxdyeaed.supabase.co';
const out=path.join(process.cwd(),'tutorial-output');fs.mkdirSync(out,{recursive:true});
setTimeout(()=>{console.error('TUTORIAL_WATCHDOG: browser step exceeded 105 seconds');process.exit(24)},105000).unref();
const delay=ms=>new Promise(r=>setTimeout(r,ms));const dt='2026-11-22';
const cfg={id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true,required:true},{id:'raw',label:'المياه الخام',unit:'م³',visible:true},{id:'export',label:'التصدير',unit:'م³',visible:true},{id:'electricity',label:'استهلاك الكهرباء',unit:'MWh',visible:true},{id:'diesel',label:'استهلاك الديزل',unit:'لتر',visible:true}],groups:[],noteFields:[]};
const record={id:'11111111-1111-4111-8111-111111111111',station_id:'jizan',report_date:dt,created_at:'2026-11-22T09:00:00Z',source:'public',data:{metrics:{production:0},groups:{},notes:{}},config_snapshot:cfg};
function ok(route,data){return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)})}
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'}).catch(()=>chromium.launch({headless:true}));
const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,locale:'ar-SA',timezoneId:'Asia/Riyadh',recordVideo:{dir:out,size:{width:1440,height:900}}});
const page=await ctx.newPage(),video=page.video(),state={record:null,posts:0};
page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
await page.route(API+'/**',route=>{
const req=route.request(),u=new URL(req.url()),p=u.pathname;
if(p==='/functions/v1/station-login')return ok(route,{access_token:'training-token',refresh_token:'training-refresh',expires_in:3600});
if(p==='/auth/v1/user')return ok(route,{id:'training-user'});
if(p==='/rest/v1/admin_users')return ok(route,[]);
if(p==='/rest/v1/station_users')return ok(route,[{user_id:'training-user',station_id:'jizan',username:'training.operator'}]);
if(p==='/rest/v1/maintenance_users')return ok(route,[]);
if(p==='/rest/v1/stations')return ok(route,[{id:'jizan',config:cfg,active:true,updated_at:'2026-11-22T09:00:00Z'}]);
if(p==='/rest/v1/reports'){
if(req.method()==='POST'){state.posts++;const b=JSON.parse(req.postData()||'{}');state.record={...record,...b,created_at:'2026-11-22T09:15:00Z'};return ok(route,[state.record]);}
const selected=state.record||record;
if(u.searchParams.get('id')?.startsWith('eq.'))return ok(route,[selected]);
const wanted=u.searchParams.get('report_date');
if(wanted?.startsWith('eq.'))return ok(route,state.record&&state.record.report_date===wanted.slice(3)?[state.record]:[]);
if(wanted?.startsWith('lt.'))return ok(route,[]);
return ok(route,state.record?[state.record]:[]);}
if(p.startsWith('/rest/v1/'))return ok(route,[]);
return ok(route,{});});
await page.addInitScript(()=>{
document.addEventListener('DOMContentLoaded',()=>{
let s=document.createElement('style');
s.textContent='#trsafe{position:fixed;top:8px;left:12px;z-index:2147483640;background:#87329A;color:#fff;padding:8px 12px;border-radius:8px;font:700 14px Tahoma;pointer-events:none}#trcap{position:fixed;bottom:16px;left:15%;right:15%;z-index:2147483642;background:#073e71ec;color:#fff;border:2px solid #50B4F2;border-radius:12px;padding:15px;text-align:center;direction:rtl;font:800 20px Tahoma;pointer-events:none}#trcur{position:fixed;z-index:2147483645;width:22px;height:22px;border:4px solid #ef4599;border-radius:50%;background:#ffcedd44;transform:translate(-50%,-50%);left:80px;top:70px;pointer-events:none;box-shadow:0 0 0 5px #ffffffaa}#trcur.tap{animation:pulse .4s}@keyframes pulse{from{box-shadow:0 0 0 2px #ee4499cc}to{box-shadow:0 0 0 26px #ee449900}}';document.head.appendChild(s);
const safe=document.createElement('div');safe.id='trsafe';safe.textContent='واجهة الموقع الحقيقية • حساب تدريبي';document.body.appendChild(safe);
const cap=document.createElement('div');cap.id='trcap';cap.textContent='شركة حلول المياه | شرح التقرير اليومي';document.body.appendChild(cap);
const cur=document.createElement('div');cur.id='trcur';document.body.appendChild(cur);
document.addEventListener('mousemove',e=>{cur.style.left=e.clientX+'px';cur.style.top=e.clientY+'px';});
document.addEventListener('mousedown',()=>{cur.classList.remove('tap');void cur.offsetWidth;cur.classList.add('tap');});
window.setTutorialCaption=t=>{cap.textContent=t};
});});
const caption=async(t,ms)=>{await page.evaluate(x=>window.setTutorialCaption?.(x),t);await delay(ms)};
let error;
try{
console.log('stage: open real login page');await page.goto(base,{waitUntil:'domcontentloaded'});
await page.locator('#loginUsername').waitFor({timeout:20000});
await caption('1. افتح الموقع ثم أدخل اسم المستخدم وكلمة المرور',4000);
await page.locator('#loginUsername').click();await page.locator('#loginUsername').pressSequentially('training.operator',{delay:50});
await page.locator('#loginPassword').click();await page.locator('#loginPassword').pressSequentially('Tutorial123!',{delay:60});
await caption('هذا حساب تدريبي؛ لا نعرض كلمات مرور حقيقية',2500);
await page.locator('#loginForm button[type="submit"]').first().click();
console.log('stage: login submitted');await page.locator('body[data-auth="ready"]').waitFor({timeout:15000});
await caption('2. افتح التقرير التشغيلي اليومي من القائمة',4800);
const nav=page.locator('#wsV3Nav [data-ws-to="reports"]').first();
if(await nav.isVisible().catch(()=>false))await nav.click();
console.log('stage: report entry');await page.locator('#wsV43Completion').waitFor({timeout:15000});
await caption('3. راجع تاريخ التقرير والحقول التابعة لمحطتك',4200);
const metric=page.locator('#reportInputFields [data-metric="production"]');
await metric.scrollIntoViewIfNeeded();await metric.click();await metric.fill('0');
for(const [id,v] of [['raw','0'],['export','0'],['electricity','1.2'],['diesel','0']]){const input=page.locator('#reportInputFields [data-metric="'+id+'"]');await input.scrollIntoViewIfNeeded();await input.fill(v);await delay(320);}
await page.locator('#wsV43Completion').scrollIntoViewIfNeeded();
await caption('4. الصفر قراءة فعلية، بينما الحقل الفارغ لا يعني صفرًا',4800);
await caption('5. راجع نسبة اكتمال البيانات ومعاينة التقرير',4200);
await page.locator('#wsV3ReportBar [data-ws-original="saveBtn"]').click();
console.log('stage: report final review');await page.locator('.ws-v43-dialog').waitFor({timeout:15000});
await caption('6. تظهر المراجعة النهائية قبل اعتماد التقرير',5700);
await caption('تأكد من اسم المحطة وتاريخ التقرير وقيم المؤشرات',5200);
await page.locator('.ws-v43-dialog [data-ws43-confirm]').click();
await delay(1200);
await caption('7. أُرسلت البيانات داخل بيئة التدريب فقط',3500);
await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
console.log('stage: daily archive');await page.locator('#archiveModal').waitFor({timeout:15000});
await caption('8. افتح الأرشيف لعرض التقارير السابقة',5700);
await caption('شركة حلول المياه • نهاية شرح التقرير اليومي',3900);
if(state.posts<1)throw new Error('No mocked report submission was captured');
}catch(e){error=e;console.error(e.stack||e)}
finally{console.log('stage: closing browser and saving capture');await delay(300);await ctx.close();const vp=await video.path();fs.copyFileSync(vp,path.join(out,'live-ui.webm'));await browser.close();}
console.log('Mock submissions:',state.posts);if(error)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
