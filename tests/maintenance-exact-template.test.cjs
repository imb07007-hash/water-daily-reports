const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const window={};
vm.runInNewContext(fs.readFileSync('assets/maintenance-template-export.js','utf8'),{window});
const {plan,excelSheetName,dateSerial,frequencyColumn}=window.WSMaintenanceExcel;
const layout=[{row:8,unit:'INTAKE WATER PUMP 1',area:'INTAKE'},{row:9,unit:'INTAKE WATER PUMP 2',area:'INTAKE'}];
const rec=(id,type,row,more={})=>({
 id:String(id),work_type:type,period_month:'2026-11-01',
 work_date:'2026-11-17',status:'DONE',notes:'Checked',cost:100,
 original_equipment:type==='PM'?'INTAKE WATER PUMP 1':'GENERATOR INTAKE',
 original_area:'INTAKE',raw_data:type==='PM'?{template_row:row}: {},
 ...more
});

test('template sheet month is renamed without replacing workbook structure',()=>{
 assert.equal(excelSheetName('2026-11'),'NOV 26');
 assert.equal(excelSheetName('2026-12'),'DEC 26');
 assert.equal(excelSheetName('2027-01'),'JAN 27');
 assert.equal(dateSerial('2026-11-01'),46327);
});
test('each PM record is kept even when equipment repeats in same month',()=>{
 const result=plan([rec(1,'PM',8),rec(2,'PM',8),rec(3,'PM',8)],layout,'2026-11');
 assert.equal(result.included,3);
 assert.equal(result.pm.get(8).length,3);
 assert.equal(result.insertions.find(x=>x.type==='PM').count,2);
 assert.equal(result.totalInserted,2);
});
test('CM and SS can grow beyond original four/five rows without truncating records',()=>{
 const rows=[...Array.from({length:6},(_,i)=>rec(i,'CM')),...Array.from({length:7},(_,i)=>rec(i+100,'SS'))];
 const result=plan(rows,layout,'2026-11');
 assert.equal(result.included,13);
 assert.equal(result.insertions.find(x=>x.type==='CM').count,2);
 assert.equal(result.insertions.find(x=>x.type==='SS').count,2);
});
test('unmapped and unsupported-status entries are flagged instead of silently omitted',()=>{
 const missing=rec(1,'PM',0,{raw_data:{},original_equipment:'UNKNOWN UNIT'});
 const unsupported=rec(2,'PM',8,{status:'UNSUPPORTED SOURCE STATUS'});
 const result=plan([missing,unsupported],layout,'2026-11');
 assert.equal(result.unmapped.length,1);
 assert.equal(result.invalidStatus.length,1);
 assert.equal(result.included,0);
});
test('a named PM item can match unique canonical name without row ID',()=>{
 const result=plan([rec(1,'PM',null,{raw_data:{},original_equipment:'INTAKE WATER PUMP 2'})],layout,'2026-11');
 assert.equal(result.pm.get(9).length,1);
});
test('records from adjacent months never enter selected export',()=>{
 const result=plan([rec(1,'PM',8,{period_month:'2026-10-01'}),rec(2,'PM',8)],layout,'2026-11');
 assert.equal(result.included,1);
});

test('selected frequency follows the original D/E/F/G PM columns',()=>{
 assert.equal(frequencyColumn('M'),'D');
 assert.equal(frequencyColumn('Q'),'E');
 assert.equal(frequencyColumn('H'),'F');
 assert.equal(frequencyColumn('Y'),'G');
 assert.equal(frequencyColumn('monthly'),'D');
 assert.equal(frequencyColumn('half yearly'),'F');
 assert.equal(frequencyColumn(''),null);
});
