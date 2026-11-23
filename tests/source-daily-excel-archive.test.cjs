'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
test('superadmin sees manual production sync, full Excel snapshots and history-link actions',()=>{
 const js=read('assets/wsc-platform-v3.js');
 assert.match(js,/isSuper\(\)\?'<section class="ws-v3-card ws-source-archive"/);
 assert.match(js,/sourceArchiveApi\('run',\{mode:'both'\}\)/);
 assert.match(js,/sourceArchiveApi\('download',\{id\}\)/);
 assert.match(js,/sourceArchiveApi\('backfill',\{stationId,sourceKey\}\)/);
 assert.match(js,/sourceArchiveRunNow|archiveRunNow/);
 assert.match(js,/data-ws-source-download/);
 assert.match(js,/sourceArchiveBusy/);
});
test('daily source archive is independent from the six-station import and keeps Google read-only',()=>{
 const scheduler=read('scripts/archive-source-scheduled.cjs');
 const workflow=read('.github/workflows/daily-full-excel-archive.yml');
 const source=read('scripts/sync-production.cjs');
 assert.match(workflow,/32 5 \* \* \*/);
 assert.match(workflow,/SUPABASE_SECRET_KEY/);
 assert.match(scheduler,/x-archive-scheduler-key/);
 assert.match(scheduler,/action:'run',mode:'both'/);
 assert.match(source,/method:'GET'/);
 assert.doesNotMatch(scheduler,/drive\.google\.com.*POST/);
});
test('private, additive, station-independent snapshot schema',()=>{
 const sql=read('database/source-daily-excel-archive.sql');
 assert.match(sql,/source_daily_snapshots/);
 assert.match(sql,/source_daily_rows/);
 assert.match(sql,/source_station_links/);
 assert.match(sql,/public\.source_daily_snapshots enable row level security/);
 assert.match(sql,/revoke all on public\.source_daily_snapshots/);
 assert.match(sql,/plant-source-excel','plant-source-excel',false/);
 assert.doesNotMatch(sql,/drop table|truncate|delete from public\.reports/i);
});
test('deployment references fresh version of daily archive controls',()=>{
 const html=read('index.html');
 assert.match(html,/wsc-platform-v3\.js\?v=20261122-source-archive2/);
 assert.match(html,/wsc-platform-v3\.css\?v=20261122-source-archive1/);
});
