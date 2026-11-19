'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=x=>fs.readFileSync(x,'utf8');
const page=read('index.html'),platform=read('assets/wsc-platform-v3.js');
const css=read('assets/wsc-platform-v3.css'),core=read('assets/core-app.js');
const maintenance=read('assets/maintenance.js');
const v4=read('assets/wsc-corporate-v4.css');
const crypto=require('node:crypto');
function gitBlobHash(value){const bytes=Buffer.from(value);return crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')}
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
 assert.ok(page.includes('/assets/wsc-platform-v3.js?v=20261119-ux41-2'));
});

test('original logo and original mark remain byte-for-byte identical to the approved Git blobs',()=>{
 assert.equal(gitBlobHash(read('assets/wsc-logo.svg')),'95b97adcce3a020346d8eb9d9123f78c885566dd');
 assert.equal(gitBlobHash(read('assets/wsc-mark.svg')),'92ead9adb56d6295abf8ac363418e54a7ec43243');
});
test('Water Solutions V4 creates a distinctive brand system without modifying report print layout',()=>{
 assert.ok(page.includes('/assets/wsc-corporate-v4.css?v=20261119-brand4b'));
 for(const item of [
  '.ws-v4-logo-panel','.ws-v4-top-signature','.ws-v4-coverage',
  '.ws-v4-hero-stripe','wsc-mark.svg','--ws4-blue:#0362AF','--ws4-purple:#87329A'
 ])assert.ok(v4.includes(item),item);
 assert.ok(platform.includes('ws-v4-logo-panel'));
 assert.ok(platform.includes('ws-v4-top-signature'));
 assert.ok(platform.includes('wsV4Coverage'));
 assert.ok(platform.includes('sent.size/visible.length'));
 assert.ok(v4.includes('.report-sheet'));
 assert.ok(v4.includes('@media print'));
 assert.doesNotThrow(()=>new Function(platform));
});
