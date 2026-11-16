const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const window={};
vm.runInNewContext(fs.readFileSync('assets/maintenance-import-guard.js','utf8'),{window});
const {classify,key,same}=window.WSMaintenanceImportGuard;
const row=(x={})=>({
 id:'existing',source_key:'WJ-HISTORY:2024-03-PM-10',
 source_sheet:'2024-03',source_row:10,period_month:'2024-03-01',
 work_type:'PM',original_equipment:'INTAKE WATER PUMP 1',
 original_area:'INTAKE',status:'DONE',work_date:'2024-03-12',
 description:'greasing',notes:'Checked',cost:150,
 ...x
});

test('identifies original Jizan history despite renamed Excel filename/key',()=>{
 const incoming=row({id:undefined,source_key:'XLS-renamed-book-10'});
 const result=classify([incoming],[row()]);
 assert.equal(result.newRows.length,0);
 assert.equal(result.duplicates.length,1);
 assert.equal(result.conflicts.length,0);
});
test('does not silently override an existing maintenance result',()=>{
 const incoming=row({id:undefined,source_key:'XLS-new',status:'NOT DONE'});
 const result=classify([incoming],[row()]);
 assert.equal(result.conflicts.length,1);
 assert.equal(result.newRows.length,0);
 assert.equal(result.duplicates.length,0);
});
test('same source row in a new month is a separate maintenance event',()=>{
 const incoming=row({id:undefined,source_key:'XLS-April',period_month:'2024-04-01',work_date:'2024-04-12'});
 const result=classify([incoming],[row()]);
 assert.equal(result.newRows.length,1);
});
test('different equipment in same source coordinate requires review',()=>{
 const incoming=row({id:undefined,source_key:'XLS-changed',original_equipment:'INTAKE WATER PUMP 3'});
 assert.equal(classify([incoming],[row()]).conflicts.length,1);
});
test('repeated rows within the same workbook are skipped or flagged',()=>{
 const sameRow=row({id:undefined,source_key:'XLS-copy'});
 const result=classify([sameRow,{...sameRow} ],[]);
 assert.equal(result.newRows.length,1);
 assert.equal(result.duplicates.length,1);
 const conflicting=classify([sameRow,{...sameRow,status:'NEED CM'}],[]);
 assert.equal(conflicting.conflicts.length,1);
});
test('missing cost is not the same as a recorded zero cost',()=>{
 assert.equal(same(row({cost:null}),row({cost:0}),false),false);
});
test('scheduled definitions are deduplicated separately from executed work',()=>{
 const base=row({frequency:'MONTHLY',notes:'',status:undefined,description:undefined,cost:undefined,work_date:undefined});
 const incoming={...base,id:undefined,source_key:'XLS-PLAN-new'};
 const result=classify([incoming],[base],true);
 assert.equal(result.duplicates.length,1);
 assert.equal(key(base),'2024-03|PM|10');
});
