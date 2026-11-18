'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const readings=require('../assets/excel-report-readings.js');
const core=fs.readFileSync('assets/core-app.js','utf8');
const parser=fs.readFileSync('scripts/production-sync-core.cjs','utf8');
const index=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/wsc-brand.css','utf8');
const source='google_drive_xlsx:source-id:تقرير الإنتاج:2026-11-17:sha256=abc';

test('old Excel-imported note metrics become typed dashboard cards without changing original records',()=>{
 const data={metrics:{production:'18049',raw:'23089',pumping:'23790',tds_product:'389'},
  notes:{notes:'قلة الطلب على المياه؛ الرجيع: 5040 م³؛ كفاءة RO: 70 %؛ الكميات المستلمة من شركة نقل المياه: 5047 م³؛ نسبة الخزن الداخلي الإجمالية: 67%'}};
 const result=readings.resolve(data,source);
 assert.equal(result.fields.reject,'5040');
 assert.equal(result.fields.ro_efficiency,'70');
 assert.equal(result.fields.received,'5047');
 assert.equal(result.fields.total_pumping,'23790');
 assert.equal(result.fields.internal_tank_pct,'67');
 assert.equal(result.notes,'قلة الطلب على المياه');
 const values=readings.entries(data,source);
 for(const key of ['reject','ro_efficiency','received','total_pumping','internal_tank_pct']){
  assert.ok(values.some(v=>v.key===key),'missing card: '+key);
 }
 // User-authored WhatsApp notes are never reinterpreted as Excel values.
 assert.equal(readings.resolve(data,'whatsapp:group'),null);
 assert.equal(readings.qualitativeNote(data,'whatsapp:group'),data.notes.notes);
});
test('Excel with separate fields uses values directly; retain zero and avoid inventing missing tank splits',()=>{
 const data={excel:{design_capacity:'50000',operating_capacity:'15000',
  reject:'5040',ro_efficiency:'70',received:'5047',
  total_pumping:'23790',internal_tank_pct:'67',bypass:'0'},
  groups:{tanks:{}},notes:{notes:'قلة الطلب على المياه'}};
 const result=readings.resolve(data,source);
 assert.equal(result.fields.bypass,'0');
 assert.equal(result.fields.internal_tank_pct,'67');
 assert.equal(data.groups.tanks.raw,undefined);
 assert.equal(data.groups.tanks.product,undefined);
 assert.equal(readings.qualitativeNote(data,source),'قلة الطلب على المياه');
 assert.equal(readings.entries(data,source).filter(r=>r.category==='capacity').length,2);
 const tank=readings.entries(data,source).find(v=>v.key==='internal_tank_pct');
 assert.equal(tank.unit,'%');
 assert.match(tank.label,/الإجمالي/);
});
test('older 16 Nov station notes recover reservoir percentage and reserved production, not fake export',()=>{
 const data={metrics:{production:'0'},notes:{notes:'احتياطية\nنسبة الخزن الداخلي: 97%؛ الإنتاج الاحتياطي: 739 م³؛ مجموع كميات الضخ: 0 م³'}};
 const fields=readings.resolve(data,source).fields;
 assert.equal(fields.internal_tank_pct,'97');
 assert.equal(fields.reserve_production,'739');
 assert.equal(fields.total_pumping,'0');
 assert.equal(data.metrics.export,undefined);
 assert.equal(readings.qualitativeNote(data,source),'احتياطية');
});
test('source values render before qualitative notes in report, dashboard, and archived Excel export',()=>{
 assert.ok(parser.includes("data:{metrics,groups,notes,excel}"));
 assert.ok(parser.includes("metrics.nwc=String(received)"));
 assert.ok(parser.includes("notes.notes=note"));
 assert.ok(!parser.includes('lines.push'));
 assert.ok(core.includes('function excelExtraPanel()'));
 assert.ok(core.includes('${excelExtraPanel()}'));
 assert.ok(core.includes('excelDashboardFields(r)'));
 assert.ok(core.includes('excelSourceRows(r.data,r.imported_from)'));
 assert.ok(core.includes("data.excel=record.excel"));
 assert.ok(index.indexOf('excel-report-readings.js')<index.indexOf('core-app.js'));
 assert.ok(css.includes('dashboard-excel-readings'));
 assert.ok(css.includes('excel-tank-track'));
 assert.doesNotThrow(()=>new Function(core));
});
