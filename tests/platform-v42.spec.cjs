const {test,expect}=require('@playwright/test');
const SB='https://vksbjasfoysuwxdyeaed.supabase.co';
const stations=[
 {id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true}],groups:[],noteFields:[]},
 {id:'damad',name:'محطة سد وادي ضمد',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true}],groups:[],noteFields:[]}
];
const fulfill=(route,data)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
async function login(page,role='admin'){
 await page.route(SB+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==='/functions/v1/station-login')return fulfill(route,{access_token:'test-v42',refresh_token:'test-refresh',expires_in:3600});
  if(path==='/auth/v1/user')return fulfill(route,{id:'tester-v42'});
  if(path==='/rest/v1/admin_users')return fulfill(route,role==='admin'?[{user_id:'tester-v42',role:'admin'}]:[]);
  if(path==='/rest/v1/station_users')return fulfill(route,role==='station'?[{user_id:'tester-v42',station_id:'jizan',username:'plant'}]:[]);
  if(path==='/rest/v1/maintenance_users')return fulfill(route,[]);
  if(path==='/rest/v1/stations'){
   const list=role==='station'?stations.slice(0,1):stations;
   return fulfill(route,list.map(s=>({id:s.id,config:s,active:true,updated_at:'2026-11-19T00:00:00Z'})));
  }
  if(path==='/rest/v1/reports'&&url.searchParams.get('report_date')?.startsWith('lt.')){
   return fulfill(route,[{id:'prev-1',station_id:'jizan',report_date:'2026-11-17',
    source:'public',created_at:'2026-11-18T08:00:00Z',data:{metrics:{production:'1000'}}}]);
  }
  if(path.startsWith('/rest/v1/'))return fulfill(route,[]);
  return fulfill(route,{});
 });
 await page.goto('/');
 await page.locator('#loginUsername').fill('tester');
 await page.locator('#loginPassword').fill('pass');
 await page.locator('#loginForm button[type="submit"]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth','ready');
}
test('station operator gets previous report comparison, zero-safe validation and original report template',async({page})=>{
 await login(page,'station');
 await page.locator('#reportDate').fill('2026-11-19');
 await expect(page.locator('#wsV42ReportReview')).toBeVisible();
 await expect(page.locator('#wsV42ReportReview')).toContainText('2026-11-17');
 const input=page.locator('#reportInputFields [data-metric="production"]');
 await input.fill('4000');
 await expect(page.locator('#wsV42ReportReview')).toContainText('4,000');
 await expect(page.locator('#wsV42ReportReview')).toContainText('تغير كبير');
 await expect(page.locator('#reportSheet .report-company-logo')).toHaveAttribute('src',/\/assets\/wsc-logo\.svg/);
 await expect(page.locator('#wsV42ReportReview')).not.toBeEmpty();
});
test('admin sees pinned home sections and authenticated station search without a new page',async({page})=>{
 await login(page,'admin');
 const pin=page.locator('#wsV42Pin');
 await expect(pin).toBeVisible();
 await pin.click();
 await expect(pin).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#wsV42QuickPanel')).toContainText('المفضلة');
 await page.keyboard.press('Control+k');
 const field=page.locator('#wsV3CommandInput');
 await field.fill('وادي جيزان');
 await expect(page.locator('#wsV42DataResults [data-ws42-go="station"]')).toHaveCount(1);
 await page.locator('#wsV42DataResults [data-ws42-go="station"]').click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await expect(page.locator('#archiveStation')).toHaveValue('jizan');
});
test('station search never returns another station just because it is mentioned in query',async({page})=>{
 await login(page,'station');
 await page.keyboard.press('Control+k');
 await page.locator('#wsV3CommandInput').fill('وادي ضمد');
 await expect(page.locator('#wsV42DataResults [data-ws42-go="station"]')).toHaveCount(0);
});
