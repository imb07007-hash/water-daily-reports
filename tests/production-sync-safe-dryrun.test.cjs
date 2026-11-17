'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {main}=require('../scripts/sync-production.cjs');

const FIELDS={C:'اسم المحطة',F:'المياه الخام',G:'الإنتاج الفعلي',H:'الإنتاج الاحتياطي',I:'Pypass',J:'الرجيع',K:'كفاءة RO',L:'الكميات المستلمة من',M:'مجموع كميات الضخ',N:'TDS',O:'نسبة الخزن',P:'نسبة الخزن',R:'ملاحظات'};
const STATIONS=[
 ['jizan','وحدة تنقية المياه السطحية في سد جيزان',0,0],
 ['damad','وحدة تنقية المياه الجوفية والسطحية في ضمد',0,0],
 ['bish','منظومة تحلية المياه الجوفية والسطحية في سد بيش 1&2',87701,80255],
 ['marbah','وحدة تنقية المياه الجوفية والسطحية في مربه',56100,53800],
 ['matari','وحدة تحلية المياه الجوفية في الماطري',24047,19007],
 ['muhayil','وحدة تحلية المياه الجوفية في محايل',0,0]
];
const config={
 jizan:{metrics:[{id:'raw'},{id:'production'},{id:'tds'}],groups:[{id:'tanks',items:[{id:'tank'}]}]},
 damad:{metrics:[{id:'production'},{id:'tds'}],groups:[{id:'tanks',items:[{id:'tank'}]}]},
 bish:{metrics:[{id:'raw'},{id:'production'},{id:'tds'}],groups:[]},
 marbah:{metrics:[{id:'raw'},{id:'production'},{id:'pumping'},{id:'tds'}],groups:[]},
 matari:{metrics:[{id:'raw'},{id:'production'},{id:'pumping'},{id:'tds_product'}],groups:[]},
 muhayil:{metrics:[{id:'production'}],groups:[]}
};
async function workbookBuffer(){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('تقرير الإنتاج');
 for(const [col,name]of Object.entries(FIELDS))sheet.getCell(col+'3').value=name;
 STATIONS.forEach(([id,name,raw,production],i)=>{
  const r=4+i;
  for(const [c,v]of Object.entries({C:name,F:raw,G:production,H:10000,N:390,R:'ملاحظة اختبار',O:id==='jizan'?.96:id==='damad'?1:null,
   M:id==='marbah'?52900:id==='matari'?23843:null}))if(v!==null)sheet.getCell(c+r).value=v;
 });
 return Buffer.from(await book.xlsx.writeBuffer());
}
const response=(data)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
async function scenario({existing=[],duplicate=false,badConfig=false}={}){
 const buffer=await workbookBuffer();
 const initialFetch=global.fetch,oldKey=process.env.SUPABASE_SECRET_KEY;
 const called=[];
 process.env.SUPABASE_SECRET_KEY='sb_secret_testing_dummy_not_real_credentials';
 process.argv.push('--dry-run');
 global.fetch=async(url,opts={})=>{
  const u=String(url),method=opts.method||'GET';
  called.push({u,method});
  if(method!=='GET')throw Error('UNEXPECTED DATABASE OR SOURCE WRITE: '+method+' '+u);
  if(u.includes('drive.usercontent.google.com')){
   return new Response(buffer,{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  }
  if(u.includes('/rest/v1/stations?')){
   return response(STATIONS.map(([id])=>({id,active:true,config:{id,...config[id],metrics:badConfig&&id==='jizan'?[]:config[id].metrics}})));
  }
  if(u.includes('/rest/v1/reports?select=station_id,report_date,imported_from'))return response(existing);
  if(u.includes('/rest/v1/reports?select=imported_from'))return response(duplicate?[{imported_from:'sha256=xxx'}]:[]);
  throw Error('Unexpected query in dry-run: '+u);
 };
 let error;
 try{await main()}catch(e){error=e}
 finally{
  global.fetch=initialFetch;
  process.argv.pop();
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
 return {called,error};
}
test('full import preflight covers the real Excel parser and Supabase config without database writes',async()=>{
 const {called,error}=await scenario();
 assert.equal(error,undefined);
 assert.ok(called.some(x=>x.u.includes('drive.usercontent.google.com')));
 assert.ok(called.some(x=>x.u.includes('/rest/v1/stations?')));
 assert.ok(called.some(x=>x.u.includes('/rest/v1/reports?')));
 assert.ok(called.every(x=>x.method==='GET'));
});
test('existing station report does not need to be overwritten',async()=>{
 const d=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const date=new Date(d+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-1);
 const day=date.toISOString().slice(0,10);
 const {called,error}=await scenario({existing:[{station_id:'jizan',report_date:day,imported_from:'manual'}]});
 assert.equal(error,undefined);
 assert.ok(called.every(x=>x.method==='GET'));
});
test('invalid station config stops before any write',async()=>{
 const {called,error}=await scenario({badConfig:true});
 assert.match(String(error),/Unconfigured metric raw in jizan/);
 assert.ok(called.every(x=>x.method==='GET'));
});
