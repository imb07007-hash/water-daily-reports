'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync('assets/maintenance.js','utf8');
const daily=fs.readFileSync('assets/maintenance-daily.js','utf8');
const sql=fs.readFileSync('database/maintenance-owner-admin-edit.sql','utf8');

function checkPermission(role,user,stationId,record,stations=['jizan']){
 const host={
  role:()=>role,
  userId:()=>user,
  stationId:()=>stationId,
  signedIn:()=>true,
  stations:()=>stations.map(id=>({id}))
 };
 const win={WSMaintenanceHost:host};
 const doc={
  readyState:'loading',
  body:{dataset:{auth:role==='maintenance'?'maintenance':'ready'}},
  addEventListener(){}
 };
 const expose=core.replace(/\}\)\(\);\s*$/,'window.TEST_PERMISSION=canEditRecord;})();');
 assert.notEqual(expose,core,'the test should instrument the actual maintenance module');
 vm.runInNewContext(expose,{window:win,document:doc,console}, {timeout:2000});
 return win.TEST_PERMISSION(record);
}

const mine={id:'record-1',station_id:'jizan',created_by:'engineer-a'};
const colleague={...mine,created_by:'engineer-b'};
const imported={...mine,created_by:null};
const otherStation={...mine,station_id:'damad'};
test('maintenance engineer can edit only their own entries in their assigned station',()=>{
 assert.equal(checkPermission('maintenance','engineer-a','jizan',mine),true);
 assert.equal(checkPermission('maintenance','engineer-a','jizan',colleague),false);
 assert.equal(checkPermission('maintenance','engineer-a','jizan',imported),false);
 assert.equal(checkPermission('maintenance','engineer-a','jizan',otherStation),false);
});
test('ordinary station account cannot edit a colleague record',()=>{
 assert.equal(checkPermission('station','worker-a','jizan',{...mine,created_by:'worker-a'}),true);
 assert.equal(checkPermission('station','worker-a','jizan',mine),false);
});
test('admin and superadmin may edit historical records with no creator',()=>{
 for(const role of ['admin','superadmin']){
  assert.equal(checkPermission(role,'administrator','',imported,['jizan','damad']),true);
  assert.equal(checkPermission(role,'administrator','',otherStation,['jizan','damad']),true);
 }
});
test('client saves through audited owner-checking RPC, never direct maintenance PATCH',()=>{
 assert.ok(core.includes('/rest/v1/rpc/maintenance_edit_record'));
 assert.ok(core.includes('p_expected:expected'));
 assert.ok(core.includes('p_reason:reason'));
 assert.ok(core.includes('record_changed_reload')===false,'DB owns stale record enforcement');
 assert.ok(daily.includes("r.created_by===uid"));
 assert.ok(daily.includes('data-mw="dailyEdit"'));
 assert.doesNotThrow(()=>new Function(core));
 assert.doesNotThrow(()=>new Function(daily));
});
test('DB RPC checks creator and membership or admin role, locks row, records change history',()=>{
 assert.match(sql,/v_record\.created_by = v_actor/);
 assert.match(sql,/mu\.user_id = v_actor AND mu\.station_id = v_record\.station_id/);
 assert.match(sql,/a\.role IN \('admin','superadmin'\)/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/v_previous IS DISTINCT FROM p_expected/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.maintenance_edit_record/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.maintenance_edit_record[\s\S]*TO authenticated/);
 assert.match(sql,/maintenance_record_change_log/);
 // The edited row's immutable ownership, asset, station and source fields are never updated.
 const update=sql.slice(sql.indexOf('UPDATE public.maintenance_records'),sql.indexOf('WHERE id = p_record_id;',sql.indexOf('UPDATE public.maintenance_records')));
 for(const field of ['created_by','station_id','asset_id','source_key','source_file','import_id']){
  assert.doesNotMatch(update,new RegExp('\\b'+field+'\\s*=','i'),field);
 }
});
