/* Integration smoke test for the actual public Render deployment.
 * Does not use login credentials or modify data.
 * Runs after a push to main, and verifies that Render serves the matching browser assets.
 */
const fs=require('node:fs');
const source=fs.readFileSync('index.html','utf8');
const match=source.match(/\/assets\/maintenance-template-export\.js\?v=[A-Za-z0-9_-]+/);
if(!match)throw new Error('Missing versioned Excel export asset from repository HTML.');
const expectedAsset=match[0];
const bulkScript=source.match(/\/assets\/maintenance-bulk\.js\?v=[A-Za-z0-9_-]+/);
const bulkStyle=source.match(/\/assets\/maintenance-bulk\.css\?v=[A-Za-z0-9_-]+/);
if(!bulkScript||!bulkStyle)throw new Error('Missing versioned admin batch maintenance assets.');

const base=process.env.RENDER_SITE_URL||'https://water-daily-reports.onrender.com';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function check(){
 const cacheBust='verification='+encodeURIComponent(process.env.GITHUB_SHA||Date.now());
 const indexResponse=await fetch(base+'/?'+cacheBust,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});
 if(!indexResponse.ok)throw new Error('Render homepage returned HTTP '+indexResponse.status);
 const html=await indexResponse.text();
 if(!html.includes(expectedAsset))throw new Error('Render HTML has not reached expected asset: '+expectedAsset);
 for(const asset of [bulkScript[0],bulkStyle[0]]){
  if(!html.includes(asset))throw new Error('Production HTML has not reached batch maintenance asset: '+asset);
  const assetResponse=await fetch(new URL(asset,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});
  if(!assetResponse.ok)throw new Error('Batch maintenance asset returned '+assetResponse.status+': '+asset);
  const body=await assetResponse.text();
  if(asset.endsWith('css?v=20261119-bulk1')){
   if(!body.includes('.mw-bulk-overlay'))throw new Error('Production batch editor styling is stale.');
  }else if(!body.includes('maintenance_bulk_edit_records')||!body.includes('pasteLines')){
   throw new Error('Production batch editor does not contain current edit and paste actions.');
  }
 }
 const fileResponse=await fetch(new URL(expectedAsset,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});
 if(!fileResponse.ok)throw new Error('Excel script returned HTTP '+fileResponse.status);
 const js=await fileResponse.text();
 for(const status of ['NEED CM','NOT IN SERVICE','UNVERIFIED','NOT DONE','DONE WITH COMMENT']){
  if(!js.includes("'"+status+"'"))throw new Error('Production Excel script does not preserve '+status);
 }
 if(!js.includes("status==='DONE WITH COMMENT'"))throw new Error('Production script has not applied execution-date requirements.');
 return {bytes:html.length,scriptBytes:js.length};
}
(async()=>{
 for(let attempt=1;attempt<=18;attempt++){
  try{
   const data=await check();
   console.log('PASS: Render serves current HTML and updated XLSX code',data);
   return;
  }catch(err){
   console.error('Attempt '+attempt+'/18:',err.message);
   if(attempt===18)process.exitCode=1;
   else await delay(8000);
  }
 }
})().catch(err=>{console.error(err);process.exitCode=1});
// Deployment trigger probe (2026-11-17): no application behavior or credentials changed.
