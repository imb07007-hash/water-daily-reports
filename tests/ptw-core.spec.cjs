'use strict';
const {test,expect}=require('@playwright/test');

const STATION='jizan', SAP='00000000-0000-4000-8000-000000000001', AP='00000000-0000-4000-8000-000000000002';
const EQUIP='00000000-0000-4000-8000-000000000003';
function makeBackend(){
 const permits=[],receivers=new Map(),isolation=new Map(),events=[];let seq=206;
 const ok=payload=>({status:200,payload});
 const bad=(message,status=400)=>({status,payload:{message}});
 const clone=x=>structuredClone(x);
 async function handle({path,method,body,user}){
   const u=new URL(path,'https://ptw.test'),name=u.pathname.split('/').pop(),args=body?JSON.parse(body):{};
   const find=id=>permits.find(p=>p.id===id);
   if(name==='maintenance_assets')return ok([{id:EQUIP,station_id:STATION,asset_name:'Intake Water Pump 1',asset_code:'INTAKE-P1',area:'INTAKE'}]);
   if(name==='ptw_account_candidates')return ok([{account_user_id:SAP,ptw_candidate_role:'SAP',display_name:'Operations Account',department:'OPERATIONS'},{account_user_id:AP,ptw_candidate_role:'AP',display_name:'Maintenance Account',department:'MAINTENANCE'}]);
   if(name==='ptw_create_draft'){
     const num=String(seq++).padStart(4,'0'),id='ptw-'+num;
     const p={id,permit_no:num,station_id:STATION,status:'draft',area:null,equipment_id:null,equipment_name:null,component_no:null,description:null,work_condition:null,activities:[],sap_account_user_id:SAP,version:1,updated_at:new Date().toISOString(),created_at:new Date().toISOString()};
     permits.push(p);receivers.set(id,[{ap_account_user_id:AP,department:'MAINTENANCE',full_name:'Maintenance Account',employee_id:''}]);isolation.set(id,[]);return ok(clone(p));
   }
   if(name==='ptw_save_draft'){
     const p=find(args.p_id);if(!p)return bad('Not found',404);
     if(p.status!=='draft')return bad('Not draft',409);
     if(p.version!==args.p_expected_version)return bad('VERSION_CONFLICT',409);
     const patch=args.p_patch||{};
     for(const [k,v] of Object.entries(patch)){if(k==='receivers')receivers.set(p.id,clone(v));else if(k==='isolation_items')isolation.set(p.id,clone(v));else p[k]=v;}
     p.version++;p.updated_at=new Date().toISOString();return ok(clone(p));
   }
   if(name==='ptw_permits'){
     const id=(u.searchParams.get('id')||'').replace(/^eq\./,'');
     const rows=id?permits.filter(p=>p.id===id):permits.slice().reverse();
     return ok(clone(rows));
   }
   if(name==='ptw_receivers')return ok(clone(receivers.get((u.searchParams.get('permit_id')||'').replace(/^eq\./,''))||[]));
   if(name==='ptw_isolation_items')return ok(clone(isolation.get((u.searchParams.get('permit_id')||'').replace(/^eq\./,''))||[]));
   if(name==='ptw_equipment_history'){
     const current=find(args.p_permit_id);if(!current)return bad('No permit',404);
     return ok(permits.filter(p=>p.id!==current.id&&p.station_id===current.station_id&&
       ((current.equipment_id&&p.equipment_id===current.equipment_id)||(current.component_no&&p.component_no===current.component_no)))
       .map(p=>({permit_id:p.id,permit_no:p.permit_no,permit_status:p.status,created_at:p.created_at,
        is_unresolved:p.status!=='normalized'&&p.status!=='archived'})));
   }
   if(['ptw_record_paper_issue','ptw_cancel_by_sap','ptw_record_normalization'].includes(name)){
     const p=find(args.p_id);if(!p)return bad('No permit',404);
     if(user.id!==SAP||p.sap_account_user_id!==SAP||user.role!=='station')return bad('Only station SAP',403);
     if(p.version!==args.p_expected_version)return bad('VERSION_CONFLICT',409);
     if(name==='ptw_record_paper_issue'){
       if(p.status!=='draft'||!args.p_paper_signatures_confirmed)return bad('Missing paper conditions');
       if(!p.area||!p.component_no||!p.description||!p.work_condition||!p.activities?.length)return bad('Incomplete');
       if(p.activities.some(x=>!['mechanical','electrical','instrumentation'].includes(x)))return bad('Supplementary not supported');
       if(!(receivers.get(p.id)||[]).some(x=>x.ap_account_user_id===AP))return bad('AP required');
       p.status='issued';
     }else if(name==='ptw_cancel_by_sap'){
       if(p.status!=='issued'||!args.p_ap_paper_clearance_confirmed||!args.p_sap_paper_cancellation_confirmed)return bad('Paper clearance required');
       p.status='cancelled';
     }else{
       if(p.status!=='cancelled'||!args.p_paper_normalization_confirmed)return bad('Normalization confirmation required');
       p.status='normalized';
     }
     p.version++;p.updated_at=new Date().toISOString();events.push({name,id:p.id,actor:user.id});return ok(clone(p));
   }
   return bad('Unmocked API '+name,500);
 }
 return {handle,permits,receivers,isolation,events};
}
async function client(browser,backend,role='station'){
 const page=await browser.newPage({viewport:{width:1320,height:900}});
 await page.route('**/ptw-e2e-harness',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body data-auth="ready"></body></html>'}));
 await page.goto('http://127.0.0.1:4173/ptw-e2e-harness');
 const user={id:role==='station'?SAP:AP,role,stationId:STATION};
 await page.exposeFunction('__mockPtW',x=>backend.handle(x));
 await page.evaluate(user=>{
  window.__testUser=user;
  window.WSMaintenanceHost={
   signedIn:()=>true,role:()=>window.__testUser.role,stationId:()=>window.__testUser.stationId,
   userId:()=>window.__testUser.id,stations:()=>[{id:'jizan',name:'وحدة تنقية سد وادي جيزان'}],
   authedFetch:async(path,options={})=>{
     const r=await window.__mockPtW({path,method:options.method||'GET',body:options.body||null,user:window.__testUser});
     return new Response(JSON.stringify(r.payload),{status:r.status,headers:{'Content-Type':'application/json'}});
   }
  };
 },user);
 await page.addStyleTag({url:'/assets/ptw-core.css'});
 await page.addScriptTag({url:'/assets/ptw-core.js'});
 await page.addScriptTag({url:'/assets/ptw-print.js'});
 await page.evaluate(()=>window.WSPTW.open('overview'));
 return page;
}
test('central draft, autosave, AP retrieval, same equipment warning and manual SAP close',async({browser})=>{
 const db=makeBackend(),sap=await client(browser,db,'station');
 await sap.locator('[data-act="new"]').first().click();
 await expect(sap.locator('[data-field="area"]')).toBeVisible();
 await expect(sap.locator('[data-sap-candidate]')).toHaveValue(SAP);
 await expect(sap.locator('[data-ap-rec="0"]')).toHaveValue(AP);
 const no=await sap.locator('[data-field="area"]').count();
 expect(no).toBe(1);
 await sap.locator('[data-field="area"]').selectOption('INTAKE');
 await sap.locator('[data-field="equipment_id"]').selectOption(EQUIP);
 await sap.locator('[data-field="description"]').fill('Inspection and maintenance of intake pump 1');
 await sap.locator('[data-field="work_condition"]').selectOption('dead');
 await sap.locator('[data-activity="mechanical"]').check();
 await sap.locator('[data-view="isolation"]').first().click();
 await sap.locator('[data-act="addIsolation"]').click();
 await sap.locator('[data-iso="0:tag_no"]').fill('R001');
 await sap.locator('[data-iso="0:component_no"]').fill('INTAKE-P1');
 await sap.locator('[data-iso="0:normal_position"]').selectOption('C');
 await sap.locator('[data-iso="0:tag_position"]').selectOption('O L T');
 const snapshot=await sap.evaluate(()=>window.WSPTW.snapshotForPrint());
 expect(snapshot.permit.permit_no).toBe('0206');
 expect(snapshot.isolation).toHaveLength(1);
 expect(snapshot.receivers[0].ap_account_user_id).toBe(AP);
 expect(db.permits[0].description).toContain('intake pump 1');
 // A second signed-in browser retrieves the same database-backed record.
 const ap=await client(browser,db,'maintenance');
 await ap.locator('[data-view="archive"]').first().click();
 await expect(ap.locator('[data-open="ptw-0206"]')).toBeVisible();
 await ap.locator('[data-open="ptw-0206"]').click();
 await expect(ap.locator('[data-field="description"]')).toHaveValue('Inspection and maintenance of intake pump 1');
 await expect(ap.locator('[data-act="paperIssue"]')).toHaveCount(0);
 await expect(ap.locator('[data-act="sapCancel"]')).toHaveCount(0);
 // Create a second PTW for the same component: visible prior-permit warning.
 await sap.locator('[data-view="overview"]').first().click();
 await sap.locator('[data-act="new"]').first().click();
 await sap.locator('[data-field="area"]').selectOption('INTAKE');
 await sap.locator('[data-field="equipment_id"]').selectOption(EQUIP);
 await expect(sap.locator('#ptwEquipmentHistory')).toContainText('0206');
 expect(db.permits).toHaveLength(2);
 // Reopen first PTW, record paper issuance, AP clearance and SAP closure.
 await sap.locator('[data-view="archive"]').first().click();
 await sap.locator('[data-open="ptw-0206"]').click();
 await expect(sap.locator('[data-act="paperIssue"]')).toBeVisible();
 sap.on('dialog',d=>d.accept());
 await sap.locator('[data-act="paperIssue"]').click();
 await expect(sap.locator('[data-act="sapCancel"]')).toBeVisible();
 await sap.locator('[data-act="sapCancel"]').click();
 await expect(sap.locator('[data-act="normalize"]')).toBeVisible();
 await sap.locator('[data-act="normalize"]').click();
 await expect.poll(()=>db.permits[0].status).toBe('normalized');
 expect(db.events.map(x=>x.name)).toEqual(['ptw_record_paper_issue','ptw_cancel_by_sap','ptw_record_normalization']);
 await sap.close();await ap.close();
});
test('native ST7-1 and ST7-11 print screens receive server-confirmed form fields',async({browser})=>{
 const db=makeBackend(),sap=await client(browser,db);
 await sap.locator('[data-act="new"]').first().click();
 await sap.locator('[data-field="area"]').selectOption('INTAKE');
 await sap.locator('[data-field="equipment_id"]').selectOption(EQUIP);
 await sap.locator('[data-field="description"]').fill('Valve inspection and manual isolation');
 await sap.locator('[data-field="work_condition"]').selectOption('dead');
 await sap.locator('[data-activity="mechanical"]').check();
 await sap.locator('[data-view="isolation"]').first().click();
 await sap.locator('[data-act="addIsolation"]').click();
 await sap.locator('[data-iso="0:tag_no"]').fill('TEST-TAG-44');
 await sap.locator('[data-iso="0:component_no"]').fill('INTAKE-P1');
 await sap.locator('[data-iso="0:tag_position"]').selectOption('O L T');
 await sap.evaluate(()=>window.WSPTW.snapshotForPrint());
 const pop= sap.waitForEvent('popup');
 await sap.locator('[data-act="printIso"]').click();
 const iso=await pop;await iso.waitForLoadState();
 await expect.poll(()=>iso.evaluate(()=>window.__WS_PTW_PRINT_DATA_LOADED)).toBe(true);
 await expect(iso.locator('[data-header="permitNo"]').first()).toHaveValue('0206');
 await expect(iso.locator('[data-point="0"][data-col="tagNo"]').first()).toHaveValue('TEST-TAG-44');
 await iso.close();
 await sap.locator('[data-view="details"]').first().click();
 const popMain=sap.waitForEvent('popup');
 await sap.locator('[data-act="printMain"]').click();
 const main=await popMain;await main.waitForLoadState();
 await expect.poll(()=>main.evaluate(()=>window.__WS_PTW_PRINT_DATA_LOADED)).toBe(true);
 await expect(main.locator('[data-key="ptwNo"]')).toHaveValue('0206');
 await expect(main.locator('[data-key="workDescription"]')).toHaveValue('Valve inspection and manual isolation');
 await main.close();await sap.close();
});
