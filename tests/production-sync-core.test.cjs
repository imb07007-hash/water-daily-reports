'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const sync=require('../scripts/production-sync-core.cjs');
function mock(){
 const m={Q2:{value:'الأحد 2026/11/15'},C3:{value:'اسم المحطة'},F3:{value:'المياه الخام (م3)'},G3:{value:'الإنتاج الفعلي (م3)'},H3:{value:'الإنتاج الاحتياطي (م3)'},I3:{value:'Pypass (m3)'},J3:{value:'الرجيع'},K3:{value:'كفاءة RO'},L3:{value:'الكميات المستلمة من شركة نقل المياه (م3)'},M3:{value:'مجموع كميات الضخ (م3)'},N3:{value:'TDS'},O3:{value:'نسبة الخزن (خزان داخلي)'},P3:{value:'نسبة الخزن (خزان خارجي)'},R3:{value:'ملاحظات'}};
 const rows=[
 ['وحدة تنقية المياه الجوفية والسطحية في مربه ',56100,53800,21200,0,0,0,0,52900,390,'98%','-', 'قلة الطلب'],
 ['وحدة تحلية المياه الجوفية في محايل',0,0,739,'','','',0,0,'-','97%','-', 'احتياطية'],
 ['منظومة تحلية المياه الجوفية والسطحية في سد بيش 1&2',87701,80255,69745,'','','',0,79975,451,'85.6%','-','قلة الطلب'],
 ['وحدة تنقية المياه السطحية في سد جيزان',0,0,10000,'','','',0,0,'-',0.96,'-','احتياطية'],
 ['وحدة تحلية المياه الجوفية في الماطري',24047,19007,'','',5040,0.7,5402,23843,398,0.74,'-','قلة الطلب'],
 ['وحدة تنقية المياه الجوفية والسطحية في ضمد',0,0,20000,'','','',0,'','-','100%','-','احتياطية']
 ];
 rows.forEach((r,i)=>{const row=i+4;for(const [j,col]of ['C','F','G','H','I','J','K','L','M','N','O','P','R'].entries())m[col+row]={value:r[j]};});
 return {rowCount:100,getCell:(coord)=>m[coord]??{value:null}};
}
test('production date always equals previous Saudi calendar day, ignoring the Excel header',()=>{
 const fake=mock(),read=fake.getCell;
 // Header can be wrong, absent, or unchanged across reporting days.
 fake.getCell=cell=>cell==='Q2'?{value:'Date shown here is wrong'}:read(cell);
 const nov17=sync.parse(fake,new Date('2026-11-17T04:00:00Z'));
 assert.equal(nov17.productionDate,'2026-11-16');
 assert.equal(nov17.rows.length,6);
 const nov18=sync.parse(fake,new Date('2026-11-18T04:00:00Z'));
 assert.equal(nov18.productionDate,'2026-11-17');
 const nov21=sync.parse(fake,new Date('2026-11-21T04:00:00Z'));
 assert.equal(nov21.productionDate,'2026-11-20');
});
test('production date uses Riyadh local midnight, not UTC midnight',()=>{
 const fake=mock();
 assert.equal(sync.parse(fake,new Date('2026-11-17T20:59:59Z')).productionDate,'2026-11-16');
 assert.equal(sync.parse(fake,new Date('2026-11-17T21:00:00Z')).productionDate,'2026-11-17');
});
test('correct metric mapping with no fabricated mixed tank percentages',()=>{
 const rows=sync.parse(mock(),new Date('2026-11-17T04:00:00Z')).rows;
 const row=id=>rows.find(x=>x.stationId===id);
 assert.equal(row('jizan').data.groups.tanks.tank.pct,'96');
 assert.equal(row('damad').data.groups.tanks.tank.pct,'100');
 assert.equal(row('bish').data.groups.tanks,undefined);
 assert.equal(row('matari').data.metrics.tds_product,'398');
 assert.equal(row('matari').data.metrics.tds_raw,undefined);
 assert.equal(row('muhayil').data.metrics.export,undefined);
 assert.equal(row('marbah').data.metrics.pumping,'52900');
 assert.match(row('matari').data.notes.notes,/الرجيع: 5040/);
});
test('fail closed on modified spreadsheet headers and invalid production values',()=>{
 const a=mock();const original=a.getCell;a.getCell=x=>x==='G3'?{value:'المنتج فقط'}:original(x);
 assert.throws(()=>sync.parse(a,new Date('2026-11-17T04:00:00Z')),/layout changed/);
 const b=mock();const o=b.getCell;b.getCell=x=>x==='G4'?{value:'غير معروف'}:o(x);
 assert.throws(()=>sync.parse(b,new Date('2026-11-17T04:00:00Z')),/Invalid production/);
});
test('Arabic separators and percentage fractions',()=>{
 assert.equal(sync.num('١٢٬٣٤٥٫٥'),12345.5);
 assert.equal(sync.num('-'),null);
 assert.equal(sync.pct(0.96),'96');
 assert.equal(sync.pct('85.6%'),'85.6');
 assert.equal(sync.pct('٩٧٪'),'97');
});
