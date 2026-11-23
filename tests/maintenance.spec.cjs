const {test,expect}=require('@playwright/test');
const ExcelJS=require('exceljs');
const fs=require('node:fs/promises');
const SUPABASE='https://vksbjasfoysuwxdyeaed.supabase.co';

const configs=[
 {id:'jizan',name:'محطة وادي جيزان',metrics:[{id:'production',label:'الإنتاج',unit:'م³',shade:'blue',visible:true}],groups:[],noteFields:[]},
 {id:'damad',name:'محطة وادي ضمد',metrics:[{id:'production',label:'الإنتاج',unit:'م³',shade:'blue',visible:true}],groups:[],noteFields:[]}
];
const respond=(route,value,status=200)=>route.fulfill({
 status,contentType:'application/json',
 headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},
 body:JSON.stringify(value)
});
async function mockCloud(page,role='admin'){
 await page.route(SUPABASE+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/functions/v1/station-login'){
   const submitted=JSON.parse(request.postData()||'{}');
   return submitted.password==='correct-password'
    ?respond(route,{access_token:'integration-test-token',refresh_token:'integration-test-refresh',expires_in:3600})
    :respond(route,{error:'invalid_credentials'},401);
  }
  if(path==='/auth/v1/user')return respond(route,{id:'test-user'});
  if(path==='/rest/v1/admin_users')return respond(route,role==='admin'?[{user_id:'test-user',role:'admin'}]:[]);
  if(path==='/rest/v1/station_users')return respond(route,[]);
  if(path==='/rest/v1/maintenance_users')return respond(route,role==='maintenance'?[{user_id:'test-user',station_id:'jizan',username:'maint-test'}]:[]);
  if(path==='/rest/v1/stations'){
   const rows=role==='maintenance'?configs.filter(s=>s.id==='jizan'):configs;
   return respond(route,rows.map(s=>({id:s.id,config:s,updated_at:'2026-11-17T00:00:00Z'})));
  }
  if(path==='/rest/v1/maintenance_templates')return respond(route,[]);
  if(path==='/rest/v1/maintenance_assets')return respond(route,[]);
  if(path==='/rest/v1/maintenance_station_summary')return respond(route,[]);
  if(path.startsWith('/rest/v1/'))return respond(route,[]);
  return respond(route,{});
 });
}
async function login(page,username='test-admin',password='correct-password'){
 await page.locator('#loginUsername').fill(username);
 await page.locator('#loginPassword').fill(password);
 await page.locator('#loginForm button[type=submit]').first().click();
}
test('login UI rejects invalid credentials and leaves the application locked',async({page})=>{
 await mockCloud(page);
 await page.goto('/');
 await login(page,'test-admin','wrong');
 await expect(page.locator('#loginError')).toContainText('بيانات الدخول غير صحيحة');
 await expect(page.locator('body')).toHaveAttribute('data-auth','locked');
 await expect(page.locator('#maintenanceModal')).toBeHidden();
});
test('admin login and navigation keep the chosen station in daily and monthly maintenance',async({page})=>{
 await mockCloud(page);
 await page.goto('/');
 await login(page);
 await expect(page.locator('body')).toHaveAttribute('data-auth','ready');
 if(await page.locator('#dashboardModal').isVisible())await page.locator('#dashboardClose').click();
 await page.locator('#wsV3Nav [data-ws-to="maintenance/overview"]').first().click();
 const station=page.locator('#mw-station');
 await expect(station).toBeVisible();
 await station.selectOption('damad');
 await expect(station).toHaveValue('damad');
 await page.locator('[data-mw="tab"][data-tab="daily"]').click();
 await expect(station).toHaveValue('damad');
 await page.locator('[data-mw="tab"][data-tab="monthly"]').click();
 await expect(station).toHaveValue('damad');
 await expect(page.locator('#maintenanceModal')).toContainText('محطة وادي ضمد');
});
test('maintenance login opens only its assigned plant',async({page})=>{
 await mockCloud(page,'maintenance');
 await page.goto('/');
 await login(page,'maint-test');
 await expect(page.locator('body')).toHaveAttribute('data-auth','maintenance');
 await expect(page.locator('#maintenanceModal')).toBeVisible();
 await expect(page.locator('#mw-station')).toHaveCount(0);
 await expect(page.locator('#maintenanceModal')).toContainText('محطة وادي جيزان');
});
test('maintenance engineer opens PTW over workbench and returns safely without SAP actions',async({page})=>{
 await mockCloud(page,'maintenance');
 await page.goto('/');
 await login(page,'maint-test');
 await expect(page.locator('body')).toHaveAttribute('data-auth','maintenance');
 const shortcut=page.locator('#ptwEngineerShortcut');
 await expect(shortcut).toBeVisible();
 await shortcut.click();
 await expect(page.locator('#ptwModal')).toBeVisible();
 await expect(page.locator('#ptwModal')).toContainText('إدارة تصاريح العمل PTW');
 await expect(page.locator('#ptwModal [data-act="sapCancel"]')).toHaveCount(0);
 await page.locator('#ptwModal [data-act="close"]').click();
 await expect(page.locator('#ptwModal')).toBeHidden();
 await expect(page.locator('#maintenanceModal')).toBeVisible();
});
test('exports a readable multi-sheet XLSX with undated NOT DONE and unchanged source statuses',async({page})=>{
 await page.goto('/');
 await page.addScriptTag({path:require.resolve('jszip/dist/jszip.min.js')});
 const workbook=new ExcelJS.Workbook();
 const sheet=workbook.addWorksheet('NOV 26');
 sheet.getCell('B4').value=new Date('2026-11-01T00:00:00Z');
 const layout=[
  {row:8,area:'INTAKE',unit:'GENERATOR INTAKE'},
  {row:9,area:'FLASH MIXER BUILDING',unit:'ALUM. CONTROL PANEL'},
  {row:10,area:'CARBON FILTER BULDING',unit:'BACKWASH PUMP 1'},
  {row:11,area:'INTAKE',unit:'PUMP 1'},
  {row:12,area:'INTAKE',unit:'PUMP 2'},
  {row:13,area:'INTAKE',unit:'PUMP 3'},
  {row:14,area:'INTAKE',unit:'PUMP 4'}
 ];
 for(const row of layout){
  sheet.getCell('B'+row.row).value=row.area;
  sheet.getCell('C'+row.row).value=row.unit;
  sheet.getCell('H'+row.row).value=new Date('2026-10-01T00:00:00Z');
  sheet.getCell('N'+row.row).value='OLD';
 }
 sheet.getCell('B310').value='footer';
 const untouched=workbook.addWorksheet('SJI');
 untouched.getCell('A1').value='SJI content must stay unchanged';
 const input=Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
 const records=[
  {period_month:'2026-11-01',work_type:'PM',status:'NOT DONE',work_date:null,original_area:'INTAKE',original_equipment:'GENERATOR INTAKE',frequency:'M',raw_data:{template_row:8},notes:'Not performed'},
  {period_month:'2026-11-01',work_type:'PM',status:'DONE WITH COMMENT',work_date:'2026-11-15',original_area:'FLASH MIXER BUILDING',original_equipment:'ALUM CONTROL PANEL',frequency:'M',notes:'Checked'},
  {period_month:'2026-11-01',work_type:'PM',status:'DONE',work_date:'2026-11-16',original_area:'CARBON FILTER BUILDING',original_equipment:'BACKWASH PUMP 1',frequency:'Q'},
  {period_month:'2026-11-01',work_type:'PM',status:'NEED CM',work_date:null,original_area:'INTAKE',original_equipment:'PUMP 1',raw_data:{template_row:11}},
  {period_month:'2026-11-01',work_type:'PM',status:'NOT IN SERVICE',work_date:null,original_area:'INTAKE',original_equipment:'PUMP 2',raw_data:{template_row:12}},
  {period_month:'2026-11-01',work_type:'PM',status:'UNVERIFIED',work_date:null,original_area:'INTAKE',original_equipment:'PUMP 3',raw_data:{template_row:13}},
  {period_month:'2026-11-01',work_type:'PM',status:'OTHERS',work_date:null,original_area:'INTAKE',original_equipment:'PUMP 4',raw_data:{template_row:14}}
 ];
 const downloadStarted=page.waitForEvent('download');
 const result=await page.evaluate(async data=>window.WSMaintenanceExcel.exportMonth(data),{
  template:{template_b64:input,template_rows:layout},rows:records,month:'2026-11'
 });
 const download=await downloadStarted;
 expect(result.included).toBe(7);
 expect(download.suggestedFilename()).toBe('WADI JAZAN 11-26.xlsx');
 const produced=new ExcelJS.Workbook();
 await produced.xlsx.load(await fs.readFile(await download.path()));
 const output=produced.getWorksheet('NOV 26');
 expect(output).toBeTruthy();
 expect(output.getCell('N8').value).toBe('NOT DONE');
 expect(output.getCell('H8').value).toBeNull();
 expect(output.getCell('N9').value).toBe('DONE WITH COMMENT');
 expect(output.getCell('N10').value).toBe('DONE');
 for(const [row,status] of [[11,'NEED CM'],[12,'NOT IN SERVICE'],[13,'UNVERIFIED'],[14,'OTHERS']]){
  expect(output.getCell('N'+row).value).toBe(status);
  expect(output.getCell('H'+row).value).toBeNull();
 }
 expect(produced.getWorksheet('SJI').getCell('A1').value).toBe('SJI content must stay unchanged');
 const plan=await page.evaluate(({records,layout})=>window.WSMaintenanceExcel.plan(
  [{...records[0],status:'DONE'}],layout,'2026-11'),{records,layout});
 expect(plan.invalidDate).toHaveLength(1);
 expect(plan.included).toBe(0);
});
