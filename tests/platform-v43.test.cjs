'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const read=x=>fs.readFileSync(x,'utf8');
const core=read('assets/core-app.js');
const maintenance=read('assets/maintenance.js');
const workflow=read('assets/wsc-workflow-v43.js');
const advisory=read('assets/wsc-maintenance-v43.js');
const css=read('assets/wsc-workflow-v43.css'),html=read('index.html');
const hash=value=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(value)+'\0').update(value).digest('hex');
function sandbox(script){
 const window={WSMaintenanceHost:{
  signedIn:()=>true,stations:()=>[{id:'jizan',name:'محطة وادي جيزان'},{id:'damad',name:'محطة سد وادي ضمد'}],
  userId:()=> 'tester',authedFetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve([])})
 },WSPlatformHost:{
  stationBlueprints:()=>[
   {id:'jizan',metrics:[{id:'production',label:'الإنتاج',required:true},{id:'raw',label:'الخام'}]},
   {id:'damad',metrics:[{id:'production',label:'الإنتاج'}]}
  ],
  reportReadOnly:()=>({metrics:[{id:'production',label:'الإنتاج',required:true,value:0}]})
 }};
 const nodes={reportInputFields:{
  querySelectorAll:()=>[
   {value:'0',closest:()=>null,type:'number'},
   {value:'',closest:()=>null,type:'number'},
   {value:'  ',closest:()=>null,type:'text'}
  ]
 }};
 const document={readyState:'loading',addEventListener(){},body:{dataset:{auth:'ready'}},
  getElementById:id=>nodes[id]||null};
 vm.runInNewContext(script,{window,document,console,Intl,Date,URLSearchParams,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),cancelAnimationFrame(){}},{timeout:2000});
 return {window,document};
}
test('unchanged official full logo and official mark on latest production sources',()=>{
 assert.equal(hash(read('assets/wsc-logo.svg')),'95b97adcce3a020346d8eb9d9123f78c885566dd');
 assert.equal(hash(read('assets/wsc-mark.svg')),'92ead9adb56d6295abf8ac363418e54a7ec43243');
 assert.ok(!workflow.includes('data:image/svg'));
});
test('report completion differentiates zero from blank without claiming validation',()=>{
 const {window}=sandbox(workflow);
 const filled=window.WSV43.fieldCoverage();
 assert.equal(filled.total,3);
 assert.equal(filled.filled,1);
 assert.equal(filled.percent,33);
 assert.equal(filled.mandatory,1);
 assert.equal(filled.requiredDone,1);
});
test('dashboard missing-station and quality summary count only real source records',()=>{
 const {window}=sandbox(workflow);
 const all=[{id:'r1',station_id:'jizan',report_date:'2026-11-18',
  source:'migration',data:{metrics:{production:0,raw:''}}}];
 const out=window.WSV43.dashboardSections({
  stations:window.WSMaintenanceHost.stations(),selectedRows:all,allRows:all,date:'2026-11-18'
 });
 assert.match(out,/محطة سد وادي ضمد/);
 assert.match(out,/50%/); // zero is a registered reading, blank is not
 assert.match(out,/تقارير مستوردة/);
 assert.match(out,/لا يوجد لها تقرير/);
 assert.ok(!out.includes('محطة وادي جيزان</span><small>عرض أرشيف المحطة'));
});
test('no percentage is fabricated when no station has measurable metric definitions',()=>{
 const {window}=sandbox(workflow);
 const html=window.WSV43.dashboardSections({
  stations:window.WSMaintenanceHost.stations(),selectedRows:[],allRows:[],date:'2026-11-18'
 });
 assert.match(html,/لا توجد تعريفات مؤشرات قابلة للقياس/);
 assert.match(html,/—/);
});
test('similar equipment names are suggestions; different unit numbers and areas remain distinct',()=>{
 const {window}=sandbox(advisory);
 const rows=[
  {id:'a',asset_name:'INTAKE GENERATOR 1',area:'INTAKE'},
  {id:'b',asset_name:'GENERATOR INTAKE 1',area:'INTAKE'},
  {id:'c',asset_name:'GENERATOR INTAKE 2',area:'INTAKE'},
  {id:'d',asset_name:'INTAKE GENERATOR 1',area:'PUMP ROOM'}
 ];
 const pairs=window.WSV43Maintenance.findPairs(rows);
 assert.equal(pairs.length,1);
 assert.equal(pairs[0].left.id,'a');
 assert.equal(pairs[0].right.id,'b');
 assert.match(pairs[0].reason,/الكلمات متطابقة/);
});
test('final review cannot silently bypass existing server validation or role guards',()=>{
 assert.match(core,/reviewBeforeSubmit/);
 assert.match(core,/cloudSubmitting=true;updateSaveStatus/);
 assert.match(core,/if\(!approved\)return/);
 assert.match(core,/stationId!==reviewStation\|\|date!==reviewDate/);
 assert.match(core,/const refreshedErrors=validateReport/);
 assert.match(core,/if\(isAdmin\(\)&&!isSuperAdmin\(\)\)/);
 assert.match(core,/return=representation/);
 assert.match(workflow,/data-ws43-confirm/);
 assert.match(workflow,/dismiss\(false\)/);
 assert.doesNotMatch(workflow,/fetch\(.+method:'POST'/s);
});
test('quick preview is RLS-authorized, read only and never changes report sheet',()=>{
 assert.match(core,/data-ws43-preview-id/);
 assert.match(workflow,/authedFetch\('\/rest\/v1\/reports\?/);
 assert.match(workflow,/station_id\)\)throw Error\('لا توجد صلاحية/);
 assert.match(workflow,/ws-v43-dialog/);
 assert.match(css,/@media print/);
 assert.doesNotMatch(css,/\.report-sheet\s*\{/);
});
test('maintenance caches only catalog metadata, not editable work records',()=>{
 assert.match(maintenance,/const wsV43ReadCache=new Map/);
 assert.match(maintenance,/maintenance_assets','maintenance_templates/);
 assert.match(maintenance,/if\(!catalog\)return request\(resource\)/);
 assert.match(maintenance,/host\(\)\?\.userId/);
 assert.match(maintenance,/if\(table==='maintenance_assets'\)/);
 assert.match(maintenance,/WSV43Maintenance\?\.invalidate/);
 assert.match(maintenance,/WSV43Maintenance\?\.renderSuggestions/);
 assert.match(maintenance,/WSV43Maintenance\?\.renderAssetCard/);
});
test('V4.3 loads all code and styles without new route, logo or SQL migration',()=>{
 for(const ref of ['wsc-workflow-v43.js?v=20261119-v43b','wsc-maintenance-v43.js?v=20261119-v43a',
  'wsc-workflow-v43.css?v=20261119-v43a'])assert.ok(html.includes(ref));
 assert.doesNotThrow(()=>new Function(core));
 assert.doesNotThrow(()=>new Function(maintenance));
 assert.doesNotThrow(()=>new Function(workflow));
 assert.doesNotThrow(()=>new Function(advisory));
});
