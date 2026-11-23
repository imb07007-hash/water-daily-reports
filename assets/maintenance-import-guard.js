/* Water Solutions maintenance import preflight: pure, testable source matching.
   No database writes. Identity is source month/type/row, not the upload filename. */
(function(global){
 'use strict';
 const text=v=>String(v==null?'':v).normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/\s+/g,' ').trim();
 const norm=v=>text(v).toUpperCase().replace(/[إأآ]/g,'ا').replace(/[ؤ]/g,'و').replace(/[ئى]/g,'ي').replace(/[^A-Z0-9\u0621-\u064A]+/g,' ').trim();
 const month=v=>String(v||'').slice(0,7);
 const sourceRow=r=>Number(r.source_row)||0;
 const key=r=>{
  const m=month(r.period_month),t=String(r.work_type||''),row=sourceRow(r);
  return m&&t&&row>0?m+'|'+t+'|'+row:'';
 };
 const datesEqual=(a,b)=>String(a||'').slice(0,10)===String(b||'').slice(0,10);
 const numberEqual=(a,b)=>{
  const blankA=a==null||a==='',blankB=b==null||b==='';
  if(blankA||blankB)return blankA===blankB;
  return Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Number(a)===Number(b);
 };
 const name=r=>norm(r.original_equipment||r.asset_name||'');
 const area=r=>norm(r.original_area||r.area||'');
 const fields=(r,planned)=>planned
   ?[r.frequency,r.notes,r.work_type]
   :[r.status,r.description,r.notes,r.work_type];
 function same(a,b,planned){
  if(name(a)!==name(b)||area(a)!==area(b))return false;
  const A=fields(a,planned),B=fields(b,planned);
  if(A.some((v,i)=>norm(v)!==norm(B[i])))return false;
  if(planned)return datesEqual(a.period_month,b.period_month);
  return datesEqual(a.work_date,b.work_date)&&numberEqual(a.cost,b.cost);
 }
 function byIndex(rows){
  const identities=new Map(),bySource=new Map();
  for(const r of rows){
   const k=key(r);if(k){
    if(!identities.has(k))identities.set(k,[]);
    identities.get(k).push(r);
   }
   if(r.source_key)bySource.set(r.source_key,r);
  }
  return {identities,bySource};
 }
 function classify(incoming,existing,planned=false){
  const index=byIndex(existing),newRows=[],duplicates=[],conflicts=[],seen=new Map();
  for(const r of incoming){
   const k=key(r),candidates=[];
   if(index.bySource.has(r.source_key))candidates.push(index.bySource.get(r.source_key));
   if(k&&index.identities.has(k))candidates.push(...index.identities.get(k));
   const unique=[...new Map(candidates.map(x=>[x.id||x.source_key,x])).values()];
   if(unique.length){
    if(unique.some(x=>same(x,r,planned)))duplicates.push(r);
    else conflicts.push({incoming:r,existing:unique[0],reason:'نفس الشهر ونوع العمل ورقم الصف، مع اختلاف البيانات'});
    continue;
   }
   // Repeated source rows inside one workbook must not be inserted twice.
   const prior=k?seen.get(k):null;
   if(prior){
    if(same(prior,r,planned))duplicates.push(r);
    else conflicts.push({incoming:r,existing:prior,reason:'تعارض صفوف داخل ملف Excel'});
   }else{
    newRows.push(r);
    if(k)seen.set(k,r);
   }
  }
  return {newRows,duplicates,conflicts};
 }
 global.WSMaintenanceImportGuard=Object.freeze({classify,key,same,norm});
})(window);
