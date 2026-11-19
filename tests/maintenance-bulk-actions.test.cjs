'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('assets/maintenance-bulk.js','utf8');
const sql=fs.readFileSync('database/maintenance-bulk-actions.sql','utf8');
const css=fs.readFileSync('assets/maintenance-bulk.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const core=fs.readFileSync('assets/maintenance.js','utf8');

function expose(role='admin'){
 const instrument=js.replace(
  'window.WSMaintenanceBulk=Object.freeze({enhance});',
  'window.TEST_BULK={B,normalValues,changes,scopeOf,isAdmin};window.WSMaintenanceBulk=Object.freeze({enhance});'
 );
 const window={addEventListener(){},WSMaintenanceHost:{role:()=>role,signedIn:()=>true}};
 vm.runInNewContext(instrument,{window,document:{},console,URLSearchParams,Set,Map},{timeout:2500});
 return window.TEST_BULK;
}
const record={
 id:'11111111-1111-4111-8111-111111111111',station_id:'jizan',
 work_type:'PM',frequency:'M',work_date:'2026-11-19',status:'DONE',
 description:'Maintenance complete',notes:'Original note',
 cost:100,spare_parts_cost:0,workers:2,hours:4,materials:'',spares:''
};
test('bulk editor can only be used by admin and superadmin',()=>{
 assert.equal(expose('admin').isAdmin(),true);
 assert.equal(expose('superadmin').isAdmin(),true);
 assert.equal(expose('maintenance').isAdmin(),false);
 assert.equal(expose('station').isAdmin(),false);
});
test('pagination does not clear batch selection but changing filters/station does',()=>{
 const {scopeOf}=expose();
 const p={station_id:'eq.jizan',status:'eq.DONE',order:'created_at.desc',offset:'0',limit:'40',select:'*'};
 const q={...p,offset:'40'};
 assert.equal(scopeOf('jizan',p),scopeOf('jizan',q));
 assert.notEqual(scopeOf('jizan',p),scopeOf('damad',p));
 assert.notEqual(scopeOf('jizan',p),scopeOf('jizan',{...p,status:'eq.NOT DONE'}));
});
test('comment-only change leaves all other maintenance fields unchanged',()=>{
 const {B,changes}=expose();
 B.original=[{...record}];
 B.working=new Map([[record.id,{...record,notes:'Updated comment'}]]);
 const updated=changes();
 assert.equal(updated.length,1);
 assert.equal(updated[0].fields.length,1);
 assert.equal(updated[0].fields[0],'notes');
 assert.equal(updated[0].expected.notes,'Original note');
 assert.equal(updated[0].values.notes,'Updated comment');
 for(const f of ['work_date','status','cost','spare_parts_cost','workers','hours','frequency']){
  assert.equal(updated[0].expected[f],updated[0].values[f]);
 }
});
test('no-op comments are never sent; invalid comments and numbers are rejected',()=>{
 const {B,changes,normalValues}=expose();
 B.original=[{...record}];
 B.working=new Map([[record.id,{...record}]]);
 assert.equal(changes().length,0);
 assert.throws(()=>normalValues({...record,status:'DONE WITH COMMENT',notes:''}),/DONE WITH COMMENT/);
 assert.throws(()=>normalValues({...record,cost:-1}),/القيمة الرقمية/);
 assert.throws(()=>normalValues({...record,work_date:'2026-02-31'}),/تاريخ تنفيذ/);
});
test('client supports all batch modes, preview, and uses audited atomic RPCs',()=>{
 for(const marker of ['data-bulk-action="filtered"','data-bulk-action="editNotes"','data-bulk-action="editAll"',
   'data-bulk-action="lock"','data-bulk-action="unlock"','data-bulk-editor-action="replaceNotes"',
   'data-bulk-editor-action="appendNotes"','data-bulk-editor-action="findReplace"',
   'data-bulk-editor-action="applyField"','data-bulk-editor-action="preview"']){
  assert.ok(js.includes(marker),marker);
 }
 assert.match(js,/const LIMIT=200,EDIT_LIMIT=50/);
 assert.match(core,/p_expected_locked/); // single-record lock remains supported in the main app
 assert.match(js,/p_items:items\.map\(x=>\(\{id:x\.id,expected:x\.expected,values:x\.values\}\)\)/);
 assert.match(js,/\/rest\/v1\/rpc\/maintenance_bulk_edit_records/);
 assert.match(js,/\/rest\/v1\/rpc\/maintenance_bulk_set_lock/);
 assert.match(core,/WSMaintenanceBulk\?\.enhance\?\./);
 assert.match(html,/maintenance-bulk\.js\?v=20261119-bulk1/);
 assert.match(html,/maintenance-bulk\.css\?v=20261119-bulk1/);
 assert.match(css,/mw-bulk-overlay/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.doesNotThrow(()=>new Function(js));
});
test('database is all-or-nothing, admin-only and reuses validation/audit single-record RPCs',()=>{
 for(const name of ['maintenance_bulk_edit_records','maintenance_bulk_set_lock']){
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.'+name));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+name));
 }
 assert.match(sql,/a\.role IN \('admin','superadmin'\)/);
 assert.match(sql,/public\.maintenance_edit_record\(/);
 assert.match(sql,/public\.maintenance_set_lock\(/);
 assert.match(sql,/count\(DISTINCT item->>'id'\)/);
 assert.match(sql,/v_count > 50/);
 assert.match(sql,/v_count > 200/);
 assert.doesNotMatch(sql,/COMMIT;\s*COMMIT;/);
});
