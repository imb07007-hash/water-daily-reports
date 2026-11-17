'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('assets/core-app.js','utf8');
function helper(name){
 const re=new RegExp('function '+name+'\\([^)]*\\)\\{[^}]*\\}');
 const match=app.match(re);
 assert.ok(match,'missing '+name);
 return match[0];
}
function classify(){
 const code=['isExcelImportedReport','importedReportTimestamp','reportImportLabel'].map(helper).join('\n')+'\nresult={isExcelImportedReport,importedReportTimestamp,reportImportLabel};';
 const sandbox={};vm.runInNewContext(code,sandbox,{timeout:1000});return sandbox.result;
}
test('historical Excel import reports are correctly labeled in all views',()=>{
 const f=classify(),r={source:'migration',imported_from:'google_drive_xlsx:source:تقرير الإنتاج:2026-11-17',created_at:'2026-11-18T04:00:00Z',source_sent_at:null};
 assert.equal(f.isExcelImportedReport(r),true);
 assert.equal(f.reportImportLabel(r),'Excel — مزامنة آلية');
 assert.equal(f.importedReportTimestamp(r),'2026-11-18T04:00:00Z');
 assert.ok(app.includes('مزامنة آلية من Excel'));
 assert.ok(app.includes('وقت الحفظ الآلي من Excel'));
 assert.ok(app.includes('استيراد Excel: '));
});
test('historical WhatsApp and site reports retain their original labels',()=>{
 const f=classify();
 const whatsapp={source:'migration',imported_from:'whatsapp:group',source_sent_at:'2026-11-08T05:00:00Z',created_at:'2026-11-10T11:00:00Z'};
 const site={source:'public',created_at:'2026-11-16T11:00:00Z'};
 assert.equal(f.isExcelImportedReport(whatsapp),false);
 assert.equal(f.reportImportLabel(whatsapp),'واتساب — أرشيف تاريخي');
 assert.equal(f.importedReportTimestamp(whatsapp),whatsapp.source_sent_at);
 assert.equal(f.reportImportLabel(site),'الموقع');
 assert.equal(f.importedReportTimestamp(site),site.created_at);
});
test('queries include the source identity required for accurate dashboard and archive labeling',()=>{
 assert.ok([...app.matchAll(/source,source_sent_at,imported_from/g)].length>=5);
 assert.doesNotThrow(()=>new Function(app));
});
