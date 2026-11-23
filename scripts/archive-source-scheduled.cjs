#!/usr/bin/env node
'use strict';
// Captures the complete source workbook (all stations) in private Supabase Storage.
// Runs after the existing production import schedule; the original Drive file is GET-only.
const SECRET=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL='https://vksbjasfoysuwxdyeaed.supabase.co/functions/v1/plant-source-archive';
async function main(){
 if(!SECRET||SECRET.length<25)throw Error('Missing GitHub secret SUPABASE_SECRET_KEY; no archive was created');
 const res=await fetch(URL,{
  method:'POST',
  headers:{'Content-Type':'application/json','x-archive-scheduler-key':SECRET},
  body:JSON.stringify({action:'run',mode:'both'}),
  signal:AbortSignal.timeout(120000)
 });
 const text=await res.text();
 if(!res.ok)throw Error('Daily Excel snapshot failed (HTTP '+res.status+'): '+text.slice(0,350));
 const result=JSON.parse(text);
 if(!result?.snapshot?.id||!result?.snapshot?.date)throw Error('No verified snapshot metadata returned');
 console.log(JSON.stringify({
  status:'snapshot_saved',
  date:result.snapshot.date,
  source_report_date:result.snapshot.reportDate,
  rows:result.snapshot.rows,
  stale_source:result.snapshot.stale,
  already_saved:result.snapshot.alreadyStored,
  production_added:result.sync?.inserted||0,
  production_sync_issue:result.syncError||null,
  linked_stations:result.linked?.length||0
 }));
 if(result.syncError)process.exitCode=1;
}
main().catch(e=>{console.error('ARCHIVE FAILED:',e.message);process.exitCode=1});
