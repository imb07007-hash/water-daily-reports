'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=x=>fs.readFileSync(x,'utf8');
const page=read('index.html'),platform=read('assets/wsc-platform-v3.js');
const css=read('assets/wsc-platform-v3.css'),core=read('assets/core-app.js');
const maintenance=read('assets/maintenance.js');
test('official Water Solutions identity is retained verbatim in the unified workspace',()=>{
 const oldLogo='/assets/wsc-logo.svg?v=20261118-identity2';
 const oldMark='/assets/wsc-mark.svg?v=20261118-identity2';
 assert.ok(platform.includes(oldLogo));
 assert.ok(page.includes(oldLogo));
 assert.ok(page.includes(oldMark));
 assert.ok(core.includes("const LOGO='"+oldLogo+"'"));
 assert.ok(core.includes("const MARK='"+oldMark+"'"));
 assert.ok(fs.existsSync('assets/wsc-logo.svg'));
 assert.ok(fs.existsSync('assets/wsc-mark.svg'));
});
test('all production sections remain reachable from one native-app route manifest',()=>{
 for(const route of [
  'home','reports','dashboard','archive/daily','archive/monthly','archive/yearly',
  'chemicals/overview','chemicals/entry','maintenance/overview','maintenance/daily',
  'maintenance/assets','maintenance/records','maintenance/planned','maintenance/monthly',
  'maintenance/import','admin/stations','admin/accounts','admin/audit','admin/data'
 ])assert.ok(platform.includes("'"+route+"'")||platform.includes(route+':'),route);
 for(const control of [
  'archiveBtn','dashboardBtn','chemicalsLink','maintenanceModal',
  'settingsBtn','accountsBtn','auditBtn','backupBtn','importBtn',
  'newBtn','saveBtn','exportBtn','shareBtn','printBtn','fullBtn'
 ])assert.ok(platform.includes(control),control);
 assert.ok(platform.includes('window.WSShellUI=Object.freeze'));
 assert.ok(core.includes("window.WSShellUI?.enabled"));
});
test('reports, layout, data and database authorization remain independent',()=>{
 assert.ok(platform.includes('data-ws-original="saveBtn"'));
 assert.ok(platform.includes("window.WSPlatformHost?.saveDraft?.()"));
 assert.ok(platform.includes("p.manager||isManager()"));
 assert.ok(platform.includes("p.super||isSuper()"));
 assert.ok(platform.includes("host()?.signedIn?.()"));
 assert.ok(platform.includes("role!=='maintenance'"));
 assert.ok(platform.includes("window.WSMaintenance.open(tab)"));
 assert.ok(maintenance.includes("if(root.classList.contains('ws-v3-docked'))return;"));
 assert.match(css,/\.ws-v3-report-bar/);
 assert.match(css,/@media print/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.doesNotThrow(()=>new Function(platform));
 assert.doesNotThrow(()=>new Function(core));
 assert.doesNotThrow(()=>new Function(maintenance));
});
test('sidebar logo is drawn from original vector and cannot be clipped or replaced by CSS',()=>{
 assert.match(css,/\.ws-v3-logo\{[^}]*object-fit:contain/);
 assert.doesNotMatch(css,/\.ws-v3-logo\{[^}]*clip-path:/);
 assert.doesNotMatch(css,/\.ws-v3-logo\{[^}]*filter:/);
 assert.ok(page.includes('/assets/wsc-platform-v3.css?v=20261119-v3-3'));
 assert.ok(page.includes('/assets/wsc-platform-v3.js?v=20261119-v3-3'));
});
