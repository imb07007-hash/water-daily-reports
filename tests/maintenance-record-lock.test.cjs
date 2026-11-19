'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const core=fs.readFileSync('assets/maintenance.js','utf8');
const daily=fs.readFileSync('assets/maintenance-daily.js','utf8');
const sql=fs.readFileSync('database/maintenance-record-lock.sql','utf8');
const html=fs.readFileSync('index.html','utf8');

function allowed(role,user,station,record){
 const host={
  role:()=>role,userId:()=>user,stationId:()=>station,
  signedIn:()=>true,stations:()=>[{id:'jizan'},{id:'damad'}]
 };
 const win={WSMaintenanceHost:host};
 const doc={readyState:'loading',body:{dataset:{auth:role==='maintenance'?'maintenance':'ready'}},addEventListener(){}};
 const instrumented=core.replace(/\}\)\(\);\s*$/,'window.TEST_PERMISSION=canEditRecord;})();');
 assert.notEqual(instrumented,core);
 vm.runInNewContext(instrumented,{window:win,document:doc,console},{timeout:2000});
 return win.TEST_PERMISSION(record);
}

const base={id:'example',station_id:'jizan',created_by:'engineer'};
test('engineer can edit own unlocked record, but cannot edit it when locked',()=>{
 assert.equal(allowed('maintenance','engineer','jizan',{...base,is_locked:false}),true);
 assert.equal(allowed('maintenance','engineer','jizan',{...base,is_locked:true}),false);
 assert.equal(allowed('maintenance','someone-else','jizan',{...base,is_locked:false}),false);
 assert.equal(allowed('station','engineer','jizan',{...base,is_locked:true}),false);
});
test('admin and superadmin retain editing permission for locked maintenance records',()=>{
 for(const role of ['admin','superadmin']){
  assert.equal(allowed(role,'manager','jizan',{...base,is_locked:true}),true);
 }
});
test('lock status is visible but only admins receive the lock/unlock actions',()=>{
 assert.match(core,/const canReview=isMaintenanceAdmin\(\)/);
 assert.match(core,/data-mw="toggleRecordLock"/);
 assert.match(core,/if\(action==='toggleRecordLock'\)/);
 assert.match(core,/p_expected_locked:!!r\.is_locked/);
 assert.match(core,/p_record_id:id,p_locked:next/);
 assert.match(core,/🔓 فتح التعديل/);
 assert.match(core,/🔒 قفل التعديل/);
 assert.match(core,/is_locked,locked_at,locked_by/);
 assert.match(core,/r\.is_locked\?'🔒 مقفل/);
 assert.match(daily,/select:'id,created_by,is_locked,/);
 assert.match(daily,/\(!r\.is_locked&&!!r\.created_by&&r\.created_by===uid\)/);
 assert.match(daily,/مقفل للتعديل/);
 assert.match(html,/maintenance\.js\?v=20261119-v42a/);
 assert.match(html,/maintenance-daily\.js\?v=20261119-lock-admin1/);
});
test('database forbids engineer lock edits and deletes, checks actor and audits locks',()=>{
 assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.maintenance_records/);
 assert.match(sql,/IF OLD\.is_locked AND NOT v_admin/);
 assert.match(sql,/NEW\.is_locked OR NEW\.locked_at IS NOT NULL/);
 assert.match(sql,/a\.role IN \('admin','superadmin'\)/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.maintenance_set_lock/);
 assert.match(sql,/v_record\.is_locked IS DISTINCT FROM p_expected_locked/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/maintenance_record_change_log/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.maintenance_set_lock[\s\S]*TO authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.maintenance_set_lock[\s\S]*FROM PUBLIC, anon/);
 assert.doesNotThrow(()=>new Function(core));
 assert.doesNotThrow(()=>new Function(daily));
});
