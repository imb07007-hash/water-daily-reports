/* Source-faithful equipment catalogue: each original PM row remains a distinct option.
   Do not infer new equipment from minor spelling differences and do not truncate results. */
(function(global){
 'use strict';
 const normalize=value=>String(value??'').normalize('NFKC').toUpperCase()
   .replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[إأآ]/g,'ا')
   .replace(/[^A-Z0-9\u0621-\u064A]+/g,' ').trim();
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
 global.WSMaintenanceCatalog=Object.freeze({areas,list,assetOptions,normalize});
})(window);
