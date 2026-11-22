const {test,expect}=require('@playwright/test');
const API='https://vksbjasfoysuwxdyeaed.supabase.co';
const conf={id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true,required:true}],groups:[],noteFields:[]};
function reply(route,data){return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)})}
async function login(page,role='station'){
 await page.route(API+'/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(p==='/functions/v1/station-login')return reply(route,{access_token:'context-help-test',refresh_token:'context-help-refresh',expires_in:3600});
  if(p==='/auth/v1/user')return reply(route,{id:'context-help-user'});
  if(p==='/rest/v1/admin_users')return reply(route,role==='admin'?[{user_id:'context-help-user',role:'admin'}]:[]);
  if(p==='/rest/v1/station_users')return reply(route,role==='station'?[{user_id:'context-help-user',station_id:'jizan',username:'trainer'}]:[]);
  if(p==='/rest/v1/maintenance_users')return reply(route,[]);
  if(p==='/rest/v1/stations')return reply(route,[{id:'jizan',config:conf,active:true,updated_at:'2026-11-22T00:00:00Z'}]);
  if(p==='/rest/v1/reports')return reply(route,[]);
  if(p.startsWith('/rest/v1/'))return reply(route,[]);
  return reply(route,{});
 });
 await page.goto('/');
 await page.locator('#loginUsername').fill('trainer');
 await page.locator('#loginPassword').fill('testing-only');
 await page.locator('#loginForm button[type=submit]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth','ready');
}
test('login has contextual guide, FAQs, and password recovery context',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#wsHelpLaunch')).toBeVisible();
 await page.locator('#wsHelpLaunch').click();
 await expect(page.locator('#wsHelpTitle')).toHaveText('مساعدة تسجيل الدخول');
 await expect(page.locator('#wsHelpBody')).toContainText('اسم المستخدم');
 await page.locator('[data-tab=faq]').click();
 await expect(page.locator('#wsHelpBody')).toContainText('نسيت كلمة المرور');
 await page.locator('#wsHelpClose').click();
 await page.locator('#forgotButton').click();
 await page.locator('#wsHelpLaunch').click();
 await expect(page.locator('#wsHelpTitle')).toHaveText('استعادة كلمة المرور');
 await expect(page.locator('#wsHelpBody')).toContainText('البريد');
});
test('station sees help for its page, not superadmin account management',async({page})=>{
 await login(page,'station');
 await page.locator('#wsHelpLaunch').click();
 await expect(page.locator('#wsHelpTitle')).toHaveText('مساعدة التقرير التشغيلي اليومي');
 await expect(page.locator('#wsHelpBody')).toContainText('الخانة الفارغة ليست صفرًا');
 await page.locator('#wsHelpClose').click();
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await page.locator('#wsHelpLaunch').click();
 await expect(page.locator('#wsHelpTitle')).toHaveText('مساعدة أرشيف التقارير اليومية');
 expect(await page.locator('#wsV3Nav [data-ws-to="admin/accounts"]').count()).toBe(0);
});
test('admin sees dashboard guide and never account-management guide',async({page})=>{
 await login(page,'admin');
 await page.locator('#wsV3Nav [data-ws-to="dashboard"]').first().click();
 await page.locator('#wsHelpLaunch').click();
 await expect(page.locator('#wsHelpTitle')).toHaveText('مساعدة لوحة المتابعة التشغيلية');
 await expect(page.locator('#wsHelpBody')).toContainText('وقت تسجيله');
 expect(await page.locator('#wsV3Nav [data-ws-to="admin/accounts"]').count()).toBe(0);
});
