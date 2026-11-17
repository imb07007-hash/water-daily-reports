#!/usr/bin/env node
'use strict';
// Source policy: Only HTTP GET to public Google Drive download; NEVER write/rename/convert.
// Destination policy: add previously-missing station/date rows only.
const ExcelJS=require('exceljs');
const core=require('./production-sync-core.cjs');
const ID=core.SOURCE_ID;
const ALLOWED_URL='https://vksbjasfoysuwxdyeaed.supabase.co';
const IDS=['jizan','damad','bish','marbah','matari','muhayil'];
const URLS=[
 `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`,
 `https://drive.google.com/uc?export=download&id=${ID}&confirm=t`
];
async function getWorkbook(){
 const errors=[];
 for(const url of URLS){
  try{
   const r=await fetch(url,{method:'GET',redirect:'follow',headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},signal:AbortSignal.timeout(45000)});
   if(!r.ok){errors.push('HTTP '+r.status);continue;}
   const len=Number(r.headers.get('content-length')||0);
   if(len>8000000)throw Error('XLSX too large');
   const bytes=Buffer.from(await r.arrayBuffer());
   if(bytes.length<1000||bytes.length>8000000||bytes.subarray(0,4).toString('hex')!=='504b0304'){errors.push('Google returned HTML, not Excel ('+r.status+')');continue;}
   return bytes;
  }catch(e){errors.push(e.message);}
 }
 throw Error('Read-only Google download failed: '+errors.join(' | '));
}
async function db(path,key,options={}){
 const r=await fetch(ALLOWED_URL+'/rest/v1/'+path,{
  method:options.method||'GET',
  headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),'Content-Type':'application/json',
   ...(options.method==='POST'?{'Prefer':'resolution=ignore-duplicates,return=representation'}:{})},
  body:options.body?JSON.stringify(options.body):undefined,
  signal:AbortSignal.timeout(25000)
 });
 const out=await r.text();
 if(!r.ok)throw Error('Supabase '+r.status+': '+out.slice(0,350));
 return out?JSON.parse(out):[];
}
async function main(){
 const buffer=await getWorkbook(),hash=core.fingerprint(buffer);
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(buffer);
 const sheet=book.getWorksheet(core.REPORT_SHEET);
 if(!sheet)throw Error('Required worksheet not found');
 const parsed=core.parse(sheet);
 if(parsed.reason){console.log('No import: stale/future source date '+parsed.productionDate);return;}
 console.log(`Excel read-only check: date=${parsed.productionDate}, stations=${parsed.rows.length}, sha256=${hash.slice(0,12)}`);
 if(process.argv.includes('--dry-run')||process.argv.includes('--check-source')){
  console.log('Validation mode: no database writes');
  return;
 }
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key.length<25)throw Error('Missing protected SUPABASE_SERVICE_ROLE_KEY, database write blocked');
 const confRows=await db(`stations?select=id,active,config&id=in.(${IDS.join(',')})`,key);
 if(confRows.length!==IDS.length||confRows.some(x=>!x.active))throw Error('Station configuration invalid, no import');
 const configs=new Map(confRows.map(x=>[x.id,x.config]));
 for(const row of parsed.rows){
  const c=configs.get(row.stationId);
  if(!c||c.id!==row.stationId)throw Error('Station ID mismatch: '+row.stationId);
  const allowed=new Set((c.metrics||[]).map(x=>x.id));
  for(const m of Object.keys(row.data.metrics))if(!allowed.has(m))throw Error(`Unconfigured metric ${m} in ${row.stationId}`);
  if(row.data.groups.tanks){
   const g=(c.groups||[]).find(x=>x.id==='tanks');
   if(!g||g.items?.length!==1||g.items[0]?.id!=='tank')throw Error('Incompatible tank layout: '+row.stationId);
  }
 }
 const from=core.plusDays(parsed.productionDate,-10);
 const history=await db(`reports?select=station_id,report_date,imported_from&station_id=in.(${IDS.join(',')})&report_date=gte.${from}&order=report_date.desc&limit=150`,key);
 const marker='sha256='+hash.slice(0,16);
 if(history.some(x=>(x.imported_from||'').includes(marker))){console.log('Same source revision was already imported; no writes');return;}
 const exists=new Set(history.map(x=>`${x.station_id}:${x.report_date}`));
 const inserts=parsed.rows.filter(r=>!exists.has(`${r.stationId}:${parsed.productionDate}`)).map(r=>({
  station_id:r.stationId,
  report_date:parsed.productionDate,
  data:r.data,
  config_snapshot:configs.get(r.stationId),
  source:'migration',
  imported_from:`google_drive_xlsx:${ID}:${core.REPORT_SHEET}:${parsed.productionDate}:${marker}:row=${r.excelRow}`
 }));
 if(!inserts.length){console.log('All station reports already exist; no writes');return;}
 const created=await db('reports?on_conflict=station_id,report_date',key,{method:'POST',body:inserts});
 const verify=await db(`reports?select=station_id,report_date,imported_from&station_id=in.(${IDS.join(',')})&report_date=eq.${parsed.productionDate}`,key);
 for(const row of inserts){if(!verify.some(x=>x.station_id===row.station_id))throw Error('DB verification failed: '+row.station_id);}
 console.log(`Successfully added ${created.length} reports, verified ${verify.length}, date ${parsed.productionDate}`);
}
if(require.main===module){main().catch(e=>{console.error('SYNC ERROR:',e.message);process.exitCode=1;});}
module.exports={main,getWorkbook};
