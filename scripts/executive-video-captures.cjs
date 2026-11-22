const {chromium}=require('@playwright/test');
const fs=require('fs');
const path=require('path');
const out='executive-assets';
fs.mkdirSync(out,{recursive:true});
const API='https://vksbjasfoysuwxdyeaed.supabase.co';
const stationConf=[
{id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',required:true,visible:true},{id:'raw',label:'المياه الخام',unit:'م³',visible:true},{id:'export',label:'التصدير',unit:'م³',visible:true},{id:'electricity',label:'استهلاك الكهرباء',unit:'MWh',visible:true},{id:'diesel',label:'استهلاك الديزل',unit:'L',visible:true}],groups:[],noteFields:[]},
{id:'damad',name:'محطة سد وادي ضمد',metrics:[{id:'production',label:'الإنتاج',unit:'م³',required:true,visible:true}],groups:[],noteFields:[]}
];
const date='2026-11-18';
const report={id:'11111111-1111-4111-8111-111111111111',station_id:'jizan',report_date:date,source:'public',created_at:'2026-11-19T08:12:00Z',data:{metrics:{production:8500,raw:9200,export:8000,electricity:1.7,diesel:0},groups:{},notes:{}},config_snapshot:stationConf[0]};
function reply(route,data){return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)})}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}).catch(()=>chromium.launch({headless:true}));
 const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,locale:'ar-SA',timezoneId:'Asia/Riyadh'});
 const page=await context.newPage();
 page.setDefaultTimeout(9000);
 await page.route(API+'/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(p==='/functions/v1/station-login')return reply(route,{access_token:'executive-demo',refresh_token:'demo',expires_in:3600});
  if(p==='/auth/v1/user')return reply(route,{id:'executive-demo-user'});
  if(p==='/rest/v1/admin_users')return reply(route,[{user_id:'executive-demo-user',role:'superadmin'}]);
  if(p==='/rest/v1/station_users')return reply(route,[]);
  if(p==='/rest/v1/maintenance_users')return reply(route,[]);
  if(p==='/rest/v1/stations')return reply(route,stationConf.map(config=>({id:config.id,config,active:true,updated_at:'2026-11-22T09:00:00Z'})));
  if(p==='/rest/v1/reports'){
   const reqDate=u.searchParams.get('report_date');
   if(reqDate?.startsWith('eq.'))return reply(route,reqDate.slice(3)===date?[report]:[]);
   if(reqDate?.startsWith('lt.'))return reply(route,[]);
   return reply(route,[report]);
  }
  if(p.startsWith('/rest/v1/'))return reply(route,[]);
  return reply(route,{});
 });
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.locator('#loginUsername').waitFor();
 await page.screenshot({path:path.join(out,'01-login.png')});
 await page.locator('#loginUsername').fill('demo.manager');
 await page.locator('#loginPassword').fill('Training-Only-123');
 await page.locator('#loginForm button[type=submit]').click();
 await page.locator('body[data-auth=ready]').waitFor({timeout:15000});
 await delay(850);
 const shot=async(name)=>{await delay(1000);await page.screenshot({path:path.join(out,name+'.png')});console.log('SCREENSHOT '+name)};
 await shot('02-home');
 const nav=async(route,dialog)=>{
   await page.locator('#wsV3Nav [data-ws-to="'+route+'"]').first().click({timeout:9000});
   if(dialog)await page.locator(dialog).waitFor({state:'visible',timeout:8000}).catch(()=>{});
 };
 await nav('reports');await shot('03-reports');
 await nav('dashboard','#dashboardModal');
 const d=page.locator('#dashboardDate');if(await d.count()){await d.fill(date);await page.locator('#dashboardRefresh').click().catch(()=>{});}
 await shot('04-dashboard');
 await nav('archive/daily','#archiveModal');await shot('05-archive-daily');
 await nav('archive/monthly','#archiveModal');await shot('06-archive-monthly');
 await nav('archive/yearly','#archiveModal');await shot('07-archive-yearly');
 await nav('chemicals/overview','#chemicalsModal');await shot('08-chemicals');
 await nav('chemicals/entry','#chemicalsModal');await shot('09-chemicals-entry');
 await nav('maintenance/overview','#maintenanceModal');await shot('10-maintenance');
 await nav('maintenance/daily','#maintenanceModal');await shot('11-maintenance-entry');
 await nav('maintenance/assets','#maintenanceModal');await shot('12-assets');
 await nav('maintenance/records','#maintenanceModal');await shot('13-maintenance-records');
 await nav('maintenance/planned','#maintenanceModal');await shot('14-maintenance-planned');
 await nav('admin/stations','#modalBackdrop');await shot('15-station-settings');
 await nav('admin/accounts','#accountsModal');await shot('16-accounts');
 await nav('admin/audit','#auditModal');await shot('17-audit');
 await nav('admin/data');await shot('18-data');
 await context.close();await browser.close();
 console.log('DONE: 18 real application screenshots captured with mocked Supabase data');
})().catch(err=>{console.error('EXECUTIVE_SCREEN_CAPTURE_FAILED',err.stack||err);process.exitCode=1});
