const {test,expect}=require('@playwright/test');
const SB='https://vksbjasfoysuwxdyeaed.supabase.co';
const stations=[
 {id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true}],groups:[],noteFields:[]},
 {id:'damad',name:'محطة سد وادي ضمد',metrics:[{id:'production',label:'الإنتاج',unit:'م³',visible:true}],groups:[],noteFields:[]}
];
const ok=(route,data)=>route.fulfill({status:200,contentType:'application/json',
 headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)});
async function cloud(page,role){
 await page.route(SB+'/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/functions/v1/station-login')return ok(route,{access_token:'ws-v3-test',refresh_token:'ws-v3-refresh',expires_in:3600});
  if(path==='/auth/v1/user')return ok(route,{id:'test-user'});
  if(path==='/rest/v1/admin_users')return ok(route,['admin','superadmin'].includes(role)?[{user_id:'test-user',role}]:[]);
  if(path==='/rest/v1/station_users')return ok(route,role==='station'?[{user_id:'test-user',station_id:'jizan',username:'plant'}]:[]);
  if(path==='/rest/v1/maintenance_users')return ok(route,role==='maintenance'?[{user_id:'test-user',station_id:'jizan',username:'engineer'}]:[]);
  if(path==='/rest/v1/stations'){
   const list=role==='maintenance'||role==='station'?stations.slice(0,1):stations;
   return ok(route,list.map(s=>({id:s.id,config:s,active:true,updated_at:'2026-11-18T00:00:00Z'})));
  }
  if(path.startsWith('/rest/v1/'))return ok(route,[]);
  return ok(route,{});
 });
}
async function login(page,role='admin'){
 await cloud(page,role);
 await page.goto('/');
 await page.locator('#loginUsername').fill('test-user');
 await page.locator('#loginPassword').fill('correct-password');
 await page.locator('#loginForm button[type="submit"]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth',role==='maintenance'?'maintenance':'ready');
}
test('admin opens a real executive home and navigates every existing workspace without changing the official logo',async({page})=>{
 await login(page);
 await expect(page.locator('#wsV3Home')).toBeVisible();
 await expect(page.locator('#wsV3Nav')).toBeVisible();
 await expect(page.locator('.ws-v3-logo')).toHaveAttribute('src','/assets/wsc-logo.svg?v=20261118-identity2');
 await expect(page.locator('#loginScreen .brand-logo-login')).toHaveAttribute('src','/assets/wsc-logo.svg?v=20261118-identity2');
 await page.locator('#wsV3Nav [data-ws-to="reports"]').click();
 await expect(page.locator('#wsV3ReportBar')).toBeVisible();
 await expect(page.locator('#wsV3ReportBar [data-ws-original="newBtn"]')).toBeVisible();
 await expect(page.locator('#reportSheet')).toBeVisible();
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await expect(page.locator('#archiveModal')).toHaveClass(/ws-v3-docked/);
 await page.locator('#wsV3Nav [data-ws-to="archive/monthly"]').click();
 await expect(page.locator('[data-archive-mode="monthly"]')).toHaveAttribute('aria-selected','true');
 await page.locator('#wsV3Nav [data-ws-to="dashboard"]').click();
 await expect(page.locator('#dashboardModal')).toBeVisible();
 await expect(page.locator('#dashboardModal')).toHaveClass(/ws-v3-docked/);
 await page.locator('#wsV3Nav [data-ws-to="chemicals/overview"]').first().click();
 await expect(page.locator('#chemicalsModal')).toBeVisible();
 await expect(page.locator('#chemicalsModal')).toHaveClass(/ws-v3-docked/);
 await page.locator('#wsV3Nav [data-ws-to="maintenance/overview"]').first().click();
 await expect(page.locator('#maintenanceModal')).toBeVisible();
 await expect(page.locator('#maintenanceModal')).toHaveClass(/ws-v3-docked/);
 await expect(page.locator('#mw-station')).toBeVisible();
});
test('station role receives report workspace with send button and cannot see superadmin sections',async({page})=>{
 await login(page,'station');
 await expect(page.locator('#wsV3ReportBar')).toBeVisible();
 await expect(page.locator('#wsV3ReportBar [data-ws-original="saveBtn"]')).toBeVisible();
 await expect(page.locator('#wsV3Nav [data-ws-to="dashboard"]')).toHaveCount(0);
 await expect(page.locator('#wsV3Nav [data-ws-to="admin/accounts"]')).toHaveCount(0);
 await expect(page.locator('#wsV3Nav [data-ws-to="admin/audit"]')).toHaveCount(0);
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveStation')).toBeDisabled();
});
test('superadmin can navigate to users, audit and data administration separately',async({page})=>{
 await login(page,'superadmin');
 await page.locator('#wsV3Nav [data-ws-toggle="admin"]').click();
 await page.locator('#wsV3Nav [data-ws-to="admin/accounts"]').click();
 await expect(page.locator('#accountsModal')).toBeVisible();
 await page.locator('#wsV3Nav [data-ws-to="admin/audit"]').click();
 await expect(page.locator('#auditModal')).toBeVisible();
 await page.locator('#wsV3Nav [data-ws-to="admin/data"]').click();
 await expect(page.locator('#wsV3Data')).toBeVisible();
 await expect(page.locator('#auditModal')).toBeHidden();
 await expect(page.locator('#wsV3Data [data-ws-original="backupBtn"]')).toBeVisible();
});
test('engineer retains dedicated maintenance workspace and original role protection',async({page})=>{
 await login(page,'maintenance');
 await expect(page.locator('#maintenanceModal')).toBeVisible();
 await expect(page.locator('#wsV3Nav')).toBeHidden();
 await expect(page.locator('[data-mw="tab"][data-tab="daily"]')).toBeVisible();
});
test('mobile sidebar and report submit toolbar work without overflowing the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await login(page,'station');
 await expect(page.locator('#wsV3ReportBar')).toBeVisible();
 const dimensions=await page.evaluate(()=>{
  const el=document.getElementById('wsV3ReportBar').getBoundingClientRect();
  return {top:el.top,left:el.left,right:el.right,width:innerWidth};
 });
 expect(dimensions.top).toBeGreaterThan(40);
 expect(dimensions.left).toBeGreaterThanOrEqual(-2);
 expect(dimensions.right).toBeLessThanOrEqual(dimensions.width+2);
 await page.locator('[data-ws-open-menu]').click();
 await expect(page.locator('body')).toHaveClass(/ws-v3-nav-open/);
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await expect(page.locator('body')).not.toHaveClass(/ws-v3-nav-open/);
});

test('authentic company mark and tricolor corporate language appear across pages without touching the original logo',async({page})=>{
 await login(page,'admin');
 const fullLogo=page.locator('.ws-v3-sidebar .ws-v3-logo');
 const topMark=page.locator('.ws-v4-top-signature img');
 await expect(fullLogo).toBeVisible();
 await expect(topMark).toBeVisible();
 await expect(fullLogo).toHaveAttribute('src',/\/assets\/wsc-logo\.svg/);
 await expect(topMark).toHaveAttribute('src',/\/assets\/wsc-mark\.svg/);
 const brand=await page.evaluate(()=>{
  const logo=document.querySelector('.ws-v3-sidebar .ws-v3-logo');
  const sidebar=getComputedStyle(document.querySelector('.ws-v3-sidebar'));
  const hero=getComputedStyle(document.querySelector('.ws-v3-hero'));
  const marker=getComputedStyle(document.querySelector('.ws-v4-hero-stripe'));
  return {logoFit:getComputedStyle(logo).objectFit,logoWidth:logo.getBoundingClientRect().width,
   logoLoaded:logo.complete&&logo.naturalWidth>0,
   sidebar:sidebar.backgroundImage,hero:hero.backgroundImage,
   marker:marker.backgroundImage};
 });
 expect(brand.logoLoaded).toBe(true);
 expect(brand.logoFit).toBe('contain');
 expect(brand.logoWidth).toBeGreaterThan(190);
 expect(brand.sidebar).toContain('linear-gradient');
 expect(brand.hero).toContain('linear-gradient');
 expect(brand.marker).toContain('linear-gradient');
 await expect(page.locator('#wsV4Coverage')).toBeVisible();
 await expect(page.locator('#wsV4Coverage')).toContainText('0 من 2 محطة');
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await expect(page.locator('#archiveModal')).toHaveClass(/ws-v3-docked/);
 const bar=await page.locator('#archiveModal .modal-head').evaluate(el=>getComputedStyle(el,'::before').backgroundImage);
 expect(bar).toContain('linear-gradient');
});

test('V4.1 remembers compact sidebar preference and still permits navigation after sign-in',async({page})=>{
 await login(page,'admin');
 const sidebar=page.locator('#wsV3Sidebar');
 await expect(page.locator('#wsV41Collapse')).toBeVisible();
 const expanded=await sidebar.evaluate(el=>el.getBoundingClientRect().width);
 await page.locator('#wsV41Collapse').click();
 await expect(page.locator('body')).toHaveClass(/ws-v41-collapsed/);
 const compact=await sidebar.evaluate(el=>el.getBoundingClientRect().width);
 expect(compact).toBeLessThan(expanded-100);
 await expect(page.locator('.ws-v41-compact-logo')).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ws-company-ux-v41')));
 expect(saved.collapsed).toBe(true);
 await page.reload();
 await page.locator('#loginUsername').fill('test-user');
 await page.locator('#loginPassword').fill('correct-password');
 await page.locator('#loginForm button[type="submit"]').first().click();
 await expect(page.locator('body')).toHaveAttribute('data-auth','ready');
 await expect(page.locator('body')).toHaveClass(/ws-v41-collapsed/);
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await page.locator('#wsV41Collapse').click();
 await expect(page.locator('body')).not.toHaveClass(/ws-v41-collapsed/);
 await expect(page.locator('.ws-v3-logo')).toBeVisible();
});
test('V4.1 restores archive filters and dashboard date when switching workspaces',async({page})=>{
 await login(page,'admin');
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveModal')).toBeVisible();
 await page.locator('#archiveStation').selectOption('jizan');
 await page.locator('#archiveFrom').fill('2026-10-01');
 await page.locator('#archiveTo').fill('2026-10-31');
 await page.locator('#archiveSearch').click();
 await page.locator('#wsV3Nav [data-ws-to="dashboard"]').click();
 await expect(page.locator('#dashboardModal')).toBeVisible();
 await page.locator('#dashboardDate').fill('2026-10-12');
 await page.locator('#dashboardRefresh').click();
 await page.locator('#wsV3Nav [data-ws-to="home"]').click();
 await page.locator('#wsV3Nav [data-ws-to="dashboard"]').click();
 await expect(page.locator('#dashboardDate')).toHaveValue('2026-10-12');
 await page.locator('#wsV3Nav [data-ws-to="archive/daily"]').first().click();
 await expect(page.locator('#archiveStation')).toHaveValue('jizan');
 await expect(page.locator('#archiveFrom')).toHaveValue('2026-10-01');
 await expect(page.locator('#archiveTo')).toHaveValue('2026-10-31');
});
