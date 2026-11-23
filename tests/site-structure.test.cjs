const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const read=path=>fs.readFileSync(path,'utf8');

test('all existing user-facing controls are present exactly once',()=>{
 const ids=[
  'saveBtn','newBtn','restoreBtn','clearBtn','exportBtn','shareBtn','printBtn','fullBtn',
  'backupBtn','importBtn','settingsBtn','archiveBtn','dashboardBtn','chemicalsLink',
  'maintenanceLink','accountsBtn','auditBtn','changeOwnPasswordBtn','signoutBtn'
 ];
 for(const id of ids){
  const count=[...html.matchAll(new RegExp('\\bid="'+id+'"','g'))].length;
  assert.equal(count,1,id+' must appear once');
 }
});
test('all static document IDs are unique',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
});
test('original report sheet, archives and cloud application remain in the same site',()=>{
 for(const value of ['id="reportSheet"','id="archiveModal"','id="dashboardModal"','id="chemicalsModal"','id="maintenanceLink"']){
  assert.ok(html.includes(value),value);
 }
});
test('core application remains bundled and valid after extraction from HTML',()=>{
 const core=read('assets/core-app.js');
 assert.ok(core.includes('window.WSMaintenanceHost=Object.freeze'));
 assert.ok(core.includes('restoreSession()'));
 assert.ok(core.includes('function dashboardOpen()'));
 assert.ok(core.includes('function archiveOpen()'));
 assert.doesNotThrow(()=>new Function(core));
});
test('maintenance helper precedes maintenance UI and core executes at document end',()=>{
 const pre=html.indexOf('/assets/maintenance-import-guard.js');
 const main=html.indexOf('/assets/maintenance.js');
 const core=html.indexOf('/assets/core-app.js');
 assert.ok(pre>0&&main>pre&&core>main);
 assert.ok(html.includes('/assets/site-navigation.css'));
 for(const file of ['assets/maintenance.js','assets/maintenance-import-guard.js','assets/site-navigation.js','assets/ops-motion.js']){
  assert.doesNotThrow(()=>new Function(read(file)),file);
 }
});
test('maintenance panel stays above operational modal and preserves audit/rollback actions',()=>{
 assert.match(read('assets/maintenance.css'),/#maintenanceModal\s*\{\s*z-index:390/);
 const code=read('assets/maintenance.js');
 for(const term of ['maintenance_edit_record','maintenance_rollback_import','WSMaintenanceImportGuard','preflightImport','restoreFocus']){
  assert.ok(code.includes(term),term);
 }
});
