const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),core=read('assets/core-app.js');
const maintenance=read('assets/maintenance.js'),daily=read('assets/maintenance-daily.js');
const css=read('assets/maintenance-engineer.css');

test('superadmin can select a station-scoped maintenance engineer account',()=>{
 assert.ok(html.includes('<option value="maintenance">'),"new maintenance account role is selectable");
 assert.ok(core.includes("role==='maintenance'?'مهندس صيانة"));
 assert.ok(core.includes("maint_'+$('accountStation').value"));
});
test('maintenance engineer session never loads operational daily report dashboard',()=>{
 const start=core.indexOf('async function enterApplication(){');
 const end=core.indexOf('async function loginSubmit(',start);
 const block=core.slice(start,end);
 assert.ok(block.includes("if(currentRole==='maintenance'){"));
 assert.ok(block.indexOf("await openEngineerWorkspace()")<block.indexOf('await loadCloudStations()'));
 assert.ok(block.includes('return;'));
});
test('maintenance role resolution uses dedicated station membership',()=>{
 assert.ok(core.includes("/rest/v1/maintenance_users?select=user_id,station_id,username"));
 assert.ok(core.includes("currentRole='maintenance';currentStationId=engineer.station_id"));
 assert.ok(core.includes("if([!!adminRecord,!!stationMember,!!engineer].filter(Boolean).length>1"));
});
test('maintenance engineer has only maintenance UI and cannot dismiss it into other screens',()=>{
 assert.ok(css.includes('body[data-auth="maintenance"] > :not(#maintenanceModal)'));
 assert.ok(css.includes('#maintenanceModal .mw-engineer-logout'));
 assert.ok(css.includes('.mw-regular-close{display:none!important}'));
 assert.ok(maintenance.includes("if(M.importing||isMaintenance())return"));
 assert.ok(maintenance.includes("if(action==='engineerLogout')"));
 assert.ok(maintenance.includes("role?.()==='maintenance'"));
 assert.ok(core.includes("window.WSMaintenance?.lock?.()"));
});
test('station-specific daily maintenance remains available without Jizan template',()=>{
 assert.ok(daily.includes('if(!ctx.assets.length&&!ctx.layout.length)'));
 assert.ok(daily.includes("const template=templates[0]||null"));
 assert.ok(daily.includes("type==='PM'&&ctx.template"));
 assert.ok(daily.includes("source_key:'SITE-DAILY:'+crypto.randomUUID()"));
 assert.ok(daily.includes('تصدير Excel غير متاح: قالب المحطة غير مرفوع.'));
});
test('maintenance code remains valid after role addition',()=>{
 for(const path of ['assets/core-app.js','assets/maintenance.js','assets/maintenance-daily.js','assets/maintenance-template-export.js'])
 assert.doesNotThrow(()=>new Function(read(path)),path);
});
