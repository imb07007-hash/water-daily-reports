'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=fs.readFileSync('assets/core-app.js','utf8');
const maintenance=fs.readFileSync('assets/maintenance.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/maintenance.css','utf8');

function fromCore(){
 const from=core.indexOf('function dashboardSaudiDate('),to=core.indexOf('function dashboardShortDate(',from);
 assert.ok(from>0&&to>from);
 return new Function("const DASHBOARD_TIME_ZONE='Asia/Riyadh';"+core.slice(from,to)+
  'return {day:dashboardSaudiDate,previous:dashboardShiftDate};')();
}
function fromMaintenance(){
 const from=maintenance.indexOf('function maintenanceSaudiDate(');
 const to=maintenance.indexOf('// Exact counts using PostgREST',from);
 assert.ok(from>0&&to>from);
 return new Function(maintenance.slice(from,to)+
  'return {day:maintenanceSaudiDate,previous:maintenanceYesterday,shift:maintenanceShiftDay};')();
}
test('operations dashboard opens the previous complete Riyadh day and still allows Today button',()=>{
 const date=fromCore();
 const nov18=new Date('2026-11-17T21:30:00Z'); // Nov 18 00:30 in Riyadh
 assert.equal(date.day(nov18),'2026-11-18');
 assert.equal(date.previous(date.day(nov18),-1),'2026-11-17');
 assert.match(core,/function dashboardOpen\(\)[\s\S]*?dashboardDate'\)\.value=dashboardShiftDate\(dashboardSaudiDate\(\),-1\)/);
 assert.match(core,/const date=\$\('dashboardDate'\)\.value\|\|dashboardShiftDate\(dashboardSaudiDate\(\),-1\)/);
 assert.ok(core.includes("dashboardToday').onclick"));
 assert.ok(core.includes("dashboardYesterday').onclick"));
});
test('maintenance current month and yesterday are computed in Saudi time, not browser UTC',()=>{
 const dt=fromMaintenance();
 assert.equal(dt.day(new Date('2026-11-17T20:59:59Z')),'2026-11-17');
 assert.equal(dt.day(new Date('2026-11-17T21:00:00Z')),'2026-11-18');
 assert.equal(dt.shift('2026-12-01',-1),'2026-11-30');
 assert.equal(dt.shift('2027-01-01',-1),'2026-12-31');
 assert.match(maintenance,/overviewMonth:''.overviewHistory:false/);
 assert.match(maintenance,/M\.overviewMonth=maintenanceSaudiDate\(\)\.slice\(0,7\)/);
 assert.ok(core.includes("window.WSMaintenance.open('overview')"));
});
test('month-first maintenance KPI draws only explicitly stored month records, not lifetime totals',()=>{
 assert.ok(maintenance.includes("getRows('maintenance_monthly_summary'"));
 assert.ok(maintenance.includes("period_month:'eq.'+month+'-01'"));
 assert.ok(maintenance.includes("getRows('maintenance_records'"));
 assert.ok(maintenance.includes("getRows('maintenance_definitions'"));
 assert.ok(maintenance.includes("const monthTotal=n(m,'work_count'),done=n(m,'done_count'),remaining=Math.max(0,monthTotal-done)"));
 assert.ok(maintenance.includes('لا يمثل أعمالًا لم تُسجّل في النظام'));
 assert.ok(maintenance.includes('M.overviewShowPlanned'));
 assert.ok(maintenance.includes('toggleHistory'));
 assert.ok(maintenance.includes('إجمالي السجلات'));
});
test('yesterday maintenance is counted by actual work_date and DONE WITH COMMENT is completed',()=>{
 assert.ok(maintenance.includes("work_date:'eq.'+workDate"));
 assert.ok(maintenance.includes("['DONE','DONE WITH COMMENT']"));
 assert.ok(maintenance.includes("Prefer:'count=exact'"));
 assert.ok(maintenance.includes("r.headers.get('Content-Range')"));
 assert.ok(maintenance.includes('صيانة أمس · '));
 assert.ok(maintenance.includes('صيانة أمس ('));
});
test('monthly dashboard changes remain view-only and render on mobile',()=>{
 assert.ok(html.includes('/assets/maintenance.css?v=20261118-monthly-first1'));
 assert.ok(html.includes('/assets/core-app.js?v=20261119-v43b'));
 assert.ok(html.includes('/assets/maintenance.js?v=20261119-v43a'));
 assert.ok(css.includes('.mw-month-kpis'));
 assert.ok(css.includes('.mw-yesterday-strip'));
 assert.ok(css.includes('.mw-history-corner'));
 assert.ok(css.includes('@media(max-width:720px)'));
 assert.doesNotThrow(()=>new Function(core));
 assert.doesNotThrow(()=>new Function(maintenance));
});
