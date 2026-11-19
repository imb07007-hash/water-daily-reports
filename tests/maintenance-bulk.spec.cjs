const {test,expect}=require('@playwright/test');
const API='https://vksbjasfoysuwxdyeaed.supabase.co';
const ID1='11111111-1111-4111-8111-111111111111';
const ID2='22222222-2222-4222-8222-222222222222';
const config={id:'jizan',name:'محطة وادي جيزان',metrics:[],groups:[],noteFields:[]};
const source=[
 {id:ID1,station_id:'jizan',created_by:'test-user',is_locked:false,locked_at:null,locked_by:null,
  asset_id:null,work_type:'PM',frequency:'M',work_date:'2026-11-18',period_month:'2026-11-01',status:'DONE',
  description:'Routine maintenance',notes:'Old comment 1',cost:100,spare_parts_cost:10,workers:2,hours:3,
  materials:'',spares:'',source_file:'manual',source_sheet:'',source_row:1,original_equipment:'PUMP 1',
  original_area:'INTAKE',maintenance_assets:{asset_name:'PUMP 1',area:'INTAKE',asset_code:'A1'},
  import_issues:[],original_date:'',original_status:''},
 {id:ID2,station_id:'jizan',created_by:'test-user',is_locked:false,locked_at:null,locked_by:null,
  asset_id:null,work_type:'CM',frequency:'Q',work_date:'2026-11-17',period_month:'2026-11-01',status:'NOT DONE',
  description:'Needs attention',notes:'Old comment 2',cost:0,spare_parts_cost:0,workers:1,hours:1,
  materials:'',spares:'',source_file:'manual',source_sheet:'',source_row:2,original_equipment:'GENERATOR',
  original_area:'INTAKE',maintenance_assets:{asset_name:'GENERATOR',area:'INTAKE',asset_code:'A2'},
  import_issues:[],original_date:'',original_status:''}
];
function reply(route,body,headers={}){
 return route.fulfill({status:200,contentType:'application/json',
  headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*',...headers},
  body:JSON.stringify(body)});
}
async function mocked(page,role='admin'){
 const records=source.map(x=>({...x})),rpc=[];
 await page.route(API+'/**',async route=>{
  const request=route.request(),u=new URL(request.url()),path=u.pathname;
  if(path==='/functions/v1/station-login')return reply(route,{access_token:'bulk-test-token',refresh_token:'bulk-refresh',expires_in:3600});
  if(path==='/auth/v1/user')return reply(route,{id:'test-user'});
  if(path==='/rest/v1/admin_users')return reply(route,role==='admin'?[{user_id:'test-user',role:'admin'}]:[]);
  if(path==='/rest/v1/station_users')return reply(route,[]);
  if(path==='/rest/v1/maintenance_users')return reply(route,role==='maintenance'?[{user_id:'test-user',station_id:'jizan',username:'engineer'}]:[]);
  if(path==='/rest/v1/stations')return reply(route,[{id:'jizan',config,updated_at:'2026-11-17T00:00:00Z'}]);
  if(path==='/rest/v1/maintenance_records'){
   let result=[...records],id=u.searchParams.get('id');
   if(id?.startsWith('in.(')){const ids=id.slice(4,-1).split(',');result=result.filter(r=>ids.includes(r.id))}
   if(id?.startsWith('eq.'))result=result.filter(r=>r.id===id.slice(3));
   if(u.searchParams.has('work_date'))result=result.filter(r=>r.work_date===u.searchParams.get('work_date').slice(3));
   if(u.searchParams.has('period_month'))result=result.filter(r=>r.period_month===u.searchParams.get('period_month').slice(3));
   if(u.searchParams.has('station_id'))result=result.filter(r=>r.station_id===u.searchParams.get('station_id').slice(3));
   const select=u.searchParams.get('select')||'';
   if(select==='id')result=result.map(r=>({id:r.id}));
   else if(select==='id,station_id,is_locked')result=result.map(r=>({id:r.id,station_id:r.station_id,is_locked:r.is_locked}));
   const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||1000);
   return reply(route,result.slice(offset,offset+limit),{'Content-Range':'0-'+Math.max(0,result.length-1)+'/'+result.length});
  }
  if(path==='/rest/v1/rpc/maintenance_bulk_edit_records'){
   const payload=JSON.parse(request.postData());
   rpc.push({type:'edit',payload});
   for(const item of payload.p_items){const found=records.find(r=>r.id===item.id);Object.assign(found,item.values)}
   return reply(route,{updated:true,changed:payload.p_items.length});
  }
  if(path==='/rest/v1/rpc/maintenance_bulk_set_lock'){
   const payload=JSON.parse(request.postData());
   rpc.push({type:'lock',payload});
   for(const item of payload.p_items){const found=records.find(r=>r.id===item.id);found.is_locked=payload.p_locked}
   return reply(route,{updated:true,changed:payload.p_items.length,is_locked:payload.p_locked});
  }
  return reply(route,[]);
 });
 return {records,rpc};
}
async function loginOpenRecords(page){
 await page.goto('/');
 await page.locator('#loginUsername').fill('test-admin');
 await page.locator('#loginPassword').fill('correct-password');
 await page.locator('#loginForm button[type=submit]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth','ready');
 if(await page.locator('#dashboardModal').isVisible())await page.locator('#dashboardClose').click();
 await page.locator('#wsV3Nav [data-ws-to="maintenance/overview"]').first().click();
 await page.locator('[data-mw="tab"][data-tab="records"]').click();
 await expect(page.locator('.mw-bulk-toolbar')).toBeVisible();
}
test('admin edits multiple comments in one scrolling window and saves only changed notes',async({page})=>{
 const state=await mocked(page);
 page.on('dialog',dialog=>dialog.accept());
 await loginOpenRecords(page);
 await expect(page.locator('[data-bulk-record]')).toHaveCount(2);
 await page.locator('[data-bulk-page-all]').check();
 await expect(page.locator('[data-bulk-count]')).toContainText('2');
 await page.locator('[data-bulk-action="editNotes"]').click();
 const overlay=page.locator('.mw-bulk-overlay');
 await expect(overlay).toBeVisible();
 await expect(overlay.locator('[data-bulk-field="notes"]')).toHaveCount(2);
 await overlay.locator('[data-bulk-record-id="'+ID1+'"][data-bulk-field="notes"]').fill('Reviewed corrected note');
 await overlay.locator('[data-bulk-editor-action="preview"]').click();
 await expect(overlay.locator('#mw-bulk-preview')).toContainText('1 سجلًا');
 await overlay.locator('#mw-bulk-reason').fill('مراجعة التعليقات وتوثيق التصحيح');
 await overlay.locator('[data-bulk-editor-action="save"]').click();
 await expect(overlay).toHaveCount(0);
 const saved=state.rpc.find(r=>r.type==='edit');
 expect(saved).toBeTruthy();
 expect(saved.payload.p_items).toHaveLength(1);
 expect(saved.payload.p_items[0].values.notes).toBe('Reviewed corrected note');
 expect(saved.payload.p_items[0].values.cost).toBe(100);
 expect(state.records[1].notes).toBe('Old comment 2');
});
test('admin can lock selected records in a single audited request',async({page})=>{
 const state=await mocked(page);
 page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('قفل السجلات بعد مراجعة الصيانة'):dialog.accept());
 await loginOpenRecords(page);
 await page.locator('[data-bulk-page-all]').check();
 await page.locator('[data-bulk-action="lock"]').click();
 await expect(page.locator('[data-bulk-count]')).toContainText('0 سجل');
 const lock=state.rpc.find(r=>r.type==='lock');
 expect(lock).toBeTruthy();
 expect(lock.payload.p_items).toHaveLength(2);
 expect(lock.payload.p_locked).toBe(true);
 expect(state.records.every(x=>x.is_locked)).toBe(true);
});
test('multi-line Excel comment paste distributes one line per selected maintenance record',async({page})=>{
 const state=await mocked(page);
 page.on('dialog',dialog=>dialog.accept());
 await loginOpenRecords(page);
 await page.locator('[data-bulk-page-all]').check();
 await page.locator('[data-bulk-action="editNotes"]').click();
 const modal=page.locator('.mw-bulk-overlay');
 await modal.locator('#mw-bulk-multi-paste').fill('Updated PUMP comment\nUpdated GENERATOR comment');
 await modal.locator('[data-bulk-editor-action="pasteLines"]').click();
 await expect(modal.locator('[data-bulk-record-id="'+ID1+'"][data-bulk-field="notes"]')).toHaveValue('Updated PUMP comment');
 await expect(modal.locator('[data-bulk-record-id="'+ID2+'"][data-bulk-field="notes"]')).toHaveValue('Updated GENERATOR comment');
 await modal.locator('[data-bulk-editor-action="preview"]').click();
 await expect(modal.locator('#mw-bulk-preview')).toContainText('2 سجلًا');
 expect(state.rpc).toHaveLength(0); // Preview and paste never save until explicit confirmation
});

test('maintenance engineer never sees admin bulk actions',async({page})=>{
 await mocked(page,'maintenance');
 await page.goto('/');
 await page.locator('#loginUsername').fill('engineer');
 await page.locator('#loginPassword').fill('correct-password');
 await page.locator('#loginForm button[type=submit]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth','maintenance');
 await page.locator('[data-mw="tab"][data-tab="records"]').click();
 await expect(page.locator('.mw-bulk-toolbar')).toHaveCount(0);
 await expect(page.locator('[data-bulk-record]')).toHaveCount(0);
});
