/* Read-only presentation adapter for production readings imported from the official XLSX.
 * A single internal tank percentage is an AGGREGATE and must never be mapped
 * to individual physical tanks on multi-tank stations.
 */
(function(root){
 'use strict';
 const FIELDS=Object.freeze([
  {key:'reserve_production',label:'الإنتاج الاحتياطي',unit:'م³',category:'operations'},
  {key:'bypass',label:'التمرير الجانبي (Bypass)',unit:'م³',category:'operations'},
  {key:'reject',label:'الرجيع',unit:'م³',category:'operations'},
  {key:'ro_efficiency',label:'كفاءة RO',unit:'%',category:'operations'},
  {key:'received',label:'المستلم من شركة نقل المياه',unit:'م³',category:'operations'},
  {key:'total_pumping',label:'مجموع كميات الضخ',unit:'م³',category:'operations'},
  {key:'internal_tank_pct',label:'مستوى الخزن الداخلي الإجمالي',unit:'%',category:'tanks'},
  {key:'external_tank_pct',label:'مستوى الخزن الخارجي',unit:'%',category:'tanks'},
  {key:'design_capacity',label:'السعة التصميمية',unit:'م³/يوم',category:'capacity'},
  {key:'operating_capacity',label:'السعة التشغيلية',unit:'م³/يوم',category:'capacity'}
 ]);
 const LEGACY=[
  ['reserve_production',/^(?:الإنتاج الاحتياطي)\s*:\s*([\d,٫.]+)/],
  ['bypass',/^(?:Bypass|Pypass|التمرير الجانبي)\s*:\s*([\d,٫.]+)/i],
  ['reject',/^(?:الرجيع)\s*:\s*([\d,٫.]+)/],
  ['ro_efficiency',/^كفاءة\s*RO\s*:\s*([\d,٫.]+)/i],
  ['received',/^الكميات المستلمة من شركة نقل المياه\s*:\s*([\d,٫.]+)/],
  ['total_pumping',/^مجموع كميات الضخ\s*:\s*([\d,٫.]+)/],
  ['internal_tank_pct',/^نسبة الخزن الداخلي(?: الإجمالية)?\s*:\s*([\d,٫.]+)/],
  ['external_tank_pct',/^نسبة الخزن الخارجي\s*:\s*([\d,٫.]+)/]
 ];
 function numeric(x){
  if(x===undefined||x===null||String(x).trim()==='')return null;
  const s=String(x).replace(/,/g,'').replace(/٫/g,'.').trim();
  if(!/^\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)?String(n):null;
 }
 function parseNotes(notes){
  const fields={},qualitative=[];
  for(const part of String(notes||'').split(/[؛\n]/)){
   const piece=part.trim();
   if(!piece)continue;
   let consumed=false;
   for(const [key,pattern] of LEGACY){
    const match=piece.match(pattern);
    if(match){
     const n=numeric(match[1]);
     if(n!==null){fields[key]=n;consumed=true}
     break;
    }
   }
   if(!consumed)qualitative.push(piece);
  }
  return {fields,notes:qualitative.join('؛ ')};
 }
 function isExcel(importedFrom){return typeof importedFrom==='string'&&importedFrom.startsWith('google_drive_xlsx:')}
 function resolve(data,importedFrom){
  if(!isExcel(importedFrom))return null;
  const old=parseNotes(data?.notes?.notes);
  const declared=data?.excel&&typeof data.excel==='object'&&!Array.isArray(data.excel)?data.excel:{};
  const fields={...old.fields};
  for(const [k,v]of Object.entries(declared)){
   if(k==='ro_applicable'){if(typeof v==='string'&&v.trim())fields[k]=v.trim()}
   else {const n=numeric(v);if(n!==null)fields[k]=n}
  }
  // Old Excel imports stored some values in the normal station metrics.
  if(fields.total_pumping===undefined&&data?.metrics?.pumping!==undefined){
   const n=numeric(data.metrics.pumping);if(n!==null)fields.total_pumping=n;
  }
  if(fields.received===undefined&&data?.metrics?.nwc!==undefined){
   const n=numeric(data.metrics.nwc);if(n!==null)fields.received=n;
  }
  if(fields.internal_tank_pct===undefined){
   const g=data?.groups?.tanks?.tank?.pct;
   const n=numeric(g);if(n!==null)fields.internal_tank_pct=n;
  }
  // The source note is qualitative only. Numeric labels are rendered separately.
  return {fields,notes:old.notes};
 }
 function entries(data,importedFrom){
  const resolved=resolve(data,importedFrom);
  if(!resolved)return [];
  return FIELDS.filter(d=>resolved.fields[d.key]!==undefined).map(d=>({
   ...d,value:resolved.fields[d.key]
  }));
 }
 function qualitativeNote(data,importedFrom){
  const res=resolve(data,importedFrom);
  return res?res.notes:String(data?.notes?.notes||'');
 }
 const api=Object.freeze({FIELDS,isExcel,parseNotes,resolve,entries,qualitativeNote});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.WSExcelReadings=api;
})(typeof window!=='undefined'?window:null);
