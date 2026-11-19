const {test,expect}=require('@playwright/test');
const API='https://vksbjasfoysuwxdyeaed.supabase.co';
const ID='11111111-1111-4111-8111-111111111111';
const configs=[
 {id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true,required:true}],groups:[],noteFields:[]},
 {id:'damad',name:'محطة سد وادي ضمد',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true}],groups:[],noteFields:[]}
];
function respond(route,data){return route.fulfill({status:200,contentType:'application/json',
 headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)})}
async function mock(page,role){
 const record={id:ID,station_id:'jizan',report_date:'2026-11-18',source:'public',
  created_at:'2026-11-19T08:00:00Z',data:{metrics:{production:0},groups:{},notes:{}},
  config_snapshot:configs[0]};
 const state={posts:0,record:null};
 await page.route(API+'/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(p==='/functions/v1/station-login')return respond(route,{access_token:'v43-test',refresh_token:'v43-refresh',expires_in:3600});
  if(p==='/auth/v1/user')return respond(route,{id:'test-v43'});
  if(p==='/rest/v1/admin_users')return respond(route,role==='admin'?[{user_id:'test-v43',role:'admin'}]:[]);
  if(p==='/rest/v1/station_users')return respond(route,role==='station'?[{user_id:'test-v43',station_id:'jizan',username:'operator'}]:[]);
  if(p==='/rest/v1/maintenance_users')return respond(route,[]);
  if(p==='/rest/v1/stations'){
   const list=role==='station'?configs.slice(0,1):configs;
   return respond(route,list.map(c=>({id:c.id,config:c,active:true,updated_at:'2026-11-19T00:00:00Z'})));
  }
  if(p==='/rest/v1/reports'){
   if(req.method()==='POST'){
    state.posts++;
    const body=JSON.parse(req.postData()||'{}');
    state.record={...record,...body,id:ID,created_at:'2026-11-19T08:10:00Z'};
    return respond(route,[state.record]);
   }
   const id=u.searchParams.get('id');
   if(id?.startsWith('eq.'))return respond(route,[record]);
   const station=u.searchParams.get('station_id');
   const date=u.searchParams.get('report_date');
   if(date?.startsWith('eq.')){
    if(role==='station')return respond(route,state.record&&state.record.report_date===date.slice(3)?[state.record]:[]);
    return respond(route,[record].filter(x=>x.report_date===date.slice(3)));
   }
   if(date?.startsWith('lt.'))return respond(route,[]);
   return respond(route,role==='admin'?[record]:[]);
  }
  if(p==='/rest/v1/maintenance_assets')return respond(route,[]);
  if(p.startsWith('/rest/v1/'))return respond(route,[]);
  return respond(route,{});
 });
 await page.goto('/');
 await page.locator('#loginUsername').fill('tester');
 await page.locator('#loginPassword').fill('password');
 await page.locator('#loginForm button[type="submit"]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth','ready');
 return state;
}
test('V4.3 shows honest required-field completion, reviews before send, and prevents duplicate confirmation',async({page})=>{
 const state=await mock(page,'station');
 await expect(page.locator('#wsV43Completion')).toBeVisible();
 const metric=page.locator('#reportInputFields [data-metric="production"]');
 await metric.fill('0');
 await expect(page.locator('#wsV43Completion')).toContainText('100%');
 await expect(page.locator('#wsV43Completion')).toContainText('1 من 1');
 await expect(page.locator('#saveBtn')).toBeEnabled();
 await page.locator('#wsV3ReportBar [data-ws-original="saveBtn"]').click();
 await expect(page.locator('.ws-v43-dialog')).toContainText('مراجعة نهائية قبل الاعتماد');
 await expect(page.locator('.ws-v43-dialog')).toContainText('محطة وادي جيزان');
 expect(state.posts).toBe(0);
 await page.locator('.ws-v43-dialog [data-ws43-close]').first().click();
 await expect(page.locator('.ws-v43-dialog')).toHaveCount(0);
 expect(state.posts).toBe(0);
 await page.locator('#wsV3ReportBar [data-ws-original="saveBtn"]').click();
 await page.locator('.ws-v43-dialog [data-ws43-confirm]').click();
 await expect.poll(()=>state.posts).toBe(1);
});
test('V4.3 dashboard separates imported reports and lists exact stations without a report',async({page})=>{
 await mock(page,'admin');
 await page.locator('#wsV3Nav [data-ws-to="dashboard"]').click();
 await expect(page.locator('#dashboardModal')).toBeVisible();
 await page.locator('#dashboardDate').fill('2026-11-18');
 await page.locator('#dashboardRefresh').click();
 await expect(page.locator('.ws-v43-dashboard')).toBeVisible();
 await expect(page.locator('.ws-v43-dashboard')).toContainText('محطة سد وادي ضمد');
 await expect(page.locator('.ws-v43-dashboard')).toContainText('100%');
 await expect(page.locator('.ws-v43-dashboard')).toContainText('تقارير أُدخلت بالموقع');
 await page.locator('[data-ws43-missing="damad"]').click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await expect(page.locator('#archiveStation')).toHaveValue('damad');
});
test('V4.3 archive preview is RLS-scoped, quick, and leaves the current list on screen',async({page})=>{
 await mock(page,'admin');
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 const previous=await page.locator('#archiveFrom').inputValue();
 await page.evaluate(id=>{
  const btn=document.createElement('button');
  btn.type='button';btn.dataset.ws43PreviewId=id;btn.textContent='معاينة سريعة';
  document.getElementById('archiveModal').querySelector('.modal-body').appendChild(btn);
 },ID);
 await page.locator('#archiveModal [data-ws43-preview-id]').click();
 await expect(page.locator('.ws-v43-dialog')).toBeVisible();
 await expect(page.locator('.ws-v43-dialog')).toContainText('محطة وادي جيزان');
 await expect(page.locator('.ws-v43-dialog')).toContainText('الإنتاج');
 await expect(page.locator('.ws-v43-dialog')).toContainText('وقت التسجيل بالموقع');
 await page.locator('.ws-v43-dialog [data-ws43-close]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 expect(await page.locator('#archiveFrom').inputValue()).toBe(previous);
});
