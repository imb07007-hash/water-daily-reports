/* Source-faithful equipment catalogue: each original PM row remains a distinct option.
   Do not infer new equipment from minor spelling differences and do not truncate results. */
(function(global){
 'use strict';
 const normalize=value=>String(value??'').normalize('NFKC').toUpperCase()
   .replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[إأآ]/g,'ا')
   .replace(/[^A-Z0-9\u0621-\u064A]+/g,' ').trim();
 // Canonical keys only support linking; source labels remain untouched.
 function areaKey(value){
  let key=normalize(value).replace(/\b(BULDING|BULIDING)\b/g,'BUILDING')
    .replace(/\bCLAIRFIER\b/g,'CLARIFIER').replace(/\bGENRATOR\b/g,'GENERATOR');
  if(key==='CARBON BUILDING')key='CARBON FILTER BUILDING';
  if(key==='FILTERED BUILDING')key='FILTERED WATER BUILDING';
  if(key==='RB RAW WATER BUILDING')key='INTAKE';
  if(key.startsWith('GENERATOR BUILDING '))key='GENERATOR BUILDING';
  return key;
 }
 function unitKey(value){
  return normalize(value).replace(/\bDISRIBUTION\b/g,'DISTRIBUTION')
    .replace(/\bGENERATOR INTAKE\b/g,'INTAKE GENERATOR')
    .replace(/\bPUMP\s*([0-9]+)\b/g,'PUMP $1');
 }
 function matchTemplateAsset(row,assets){
  if(!row||!Array.isArray(assets))return null;
  const area=areaKey(row.area),unit=unitKey(row.unit);
  if(!unit)return null;
  const hits=assets.filter(asset=>{
   if(!asset||areaKey(asset.area)!==area)return false;
   const labels=[asset.asset_name,...(Array.isArray(asset.source_aliases)?asset.source_aliases:[])];
   return labels.some(label=>unitKey(label)===unit);
  });
  return hits.length===1?hits[0]:null;
 }
 function areas(layout){
  return [...new Set((Array.isArray(layout)?layout:[])
   .map(row=>String(row?.area||'').trim()||'غير محددة'))];
 }
 function list(layout,area='',search=''){
  const term=normalize(search);
  return (Array.isArray(layout)?layout:[]).filter(row=>
   row&&Number.isInteger(Number(row.row))&&Number(row.row)>0&&String(row.unit||'').trim()
   &&(!area||(String(row.area||'').trim()||'غير محددة')===area)
   &&(!term||normalize([row.area,row.unit,row.row].join(' ')).includes(term))
  );
 }
 function assetOptions(assets,area='',search=''){
  const term=normalize(search);
  return (Array.isArray(assets)?assets:[]).filter(a=>
   a&&a.id&&a.asset_code!=='UNVERIFIED_LINK'
   &&(!area||(String(a.area||'').trim()||'غير محددة')===area)
   &&(!term||normalize([a.area,a.asset_name,a.asset_code].join(' ')).includes(term))
  );
 }
 global.WSMaintenanceCatalog=Object.freeze({areas,list,assetOptions,normalize,areaKey,unitKey,matchTemplateAsset});
})(window);
