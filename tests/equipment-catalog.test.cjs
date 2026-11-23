const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync('assets/maintenance-equipment-catalog.js','utf8'),{window});
const catalog=window.WSMaintenanceCatalog;
const sample=Array.from({length:277},(_,i)=>({
 row:i+8,area:i<5?'INTAKE':i<140?'FLASH MIXER BUILDING':'SAND FILTER BUILDING',
 unit:'WATER PUMP '+String(i+1)
}));
test('all 277 original template rows are visible by default',()=>{
 const rows=catalog.list(sample);
 assert.equal(rows.length,277);
 assert.equal(rows.at(0).row,8);
 assert.equal(rows.at(-1).row,284);
});
test('AREA filter is optional and never silently selected',()=>{
 assert.equal(catalog.list(sample,'INTAKE').length,5);
 assert.equal(catalog.list(sample,'').length,277);
 assert.equal(catalog.areas(sample).length,3);
});
test('search matches UNIT and AREA regardless of capitalization and extra spaces',()=>{
 assert.equal(catalog.list(sample,'','pump 277').length,1);
 assert.equal(catalog.list(sample,'','  sand FILTER  ').length,137);
});
test('duplicate names in the original workbook remain separate row identities',()=>{
 const rows=[{row:8,area:'INTAKE',unit:'PUMP'},{row:12,area:'INTAKE',unit:'PUMP'}];
 const matches=catalog.list(rows,'INTAKE','pump');
 assert.equal(matches.length,2);
 assert.deepEqual(Array.from(matches,x=>x.row),[8,12]);
});
test('registered assets do not override template equipment selection',()=>{
 const assets=[{id:'x',asset_name:'UNIT 1',area:'INTAKE',asset_code:'EQ-1'},
               {id:'y',asset_name:'UNIT 2',area:'INTAKE',asset_code:'UNVERIFIED_LINK'}];
 assert.equal(catalog.assetOptions(assets,'').length,1);
});
test('daily form and source report use same frequency codes',()=>{
 const daily=fs.readFileSync('assets/maintenance-daily.js','utf8');
 const exporter=fs.readFileSync('assets/maintenance-template-export.js','utf8');
 for(const code of ['M','Q','H','Y']){
  assert.ok(daily.includes('value="'+code+'"'),code);
  assert.ok(exporter.includes(code+':'),code);
 }
 assert.ok(daily.includes("frequency:freq"));
 assert.ok(exporter.includes("for(const col of ['D','E','F','G'])"));
});
