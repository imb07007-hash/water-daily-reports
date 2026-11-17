/* Exact WADI JAZAN Excel-template writer. Preserves every original ZIP entry except
   sheet1.xml and workbook.xml. The original workbook (including SJI and drawings)
   is held in a station-scoped private database table, not in public site assets. */
(function(global){
 'use strict';
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const statuses=new Set(['DONE','NOT DONE','OTHERS','DONE WITH COMMENT']);
 const norm=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9\u0621-\u064A]+/g,' ').trim();
 const num=v=>(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))?null:Number(v);
 const isoDate=v=>/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(v||''))?String(v):'';
 const dateSerial=iso=>Math.round((Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
 const error=msg=>{throw Error(msg)};
 const yearMonth=s=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(s||'')?s:error('اختر شهرًا صحيحًا.');
 const excelSheetName=s=>{yearMonth(s);return months[Number(s.slice(5))-1]+' '+s.slice(2,4)};
 const extractDate=r=>isoDate(r.work_date||r.original_date);
 function plan(rows,layout,month){
  yearMonth(month);
  const byName=new Map(),byNamedArea=new Map(),byRow=new Map();
  for(const t of layout){
   const name=norm(t.unit),area=norm(t.area),id=Number(t.row);
   if(id<8||id>284||!name)continue;
   byRow.set(id,t);
   if(!byName.has(name))byName.set(name,[]);
   byName.get(name).push(t);
   const k=area+'|'+name;
   if(!byNamedArea.has(k))byNamedArea.set(k,[]);
   byNamedArea.get(k).push(t);
  }
  const pm=new Map(),cm=[],ss=[],unmapped=[],invalidStatus=[],invalidDate=[];
  for(const r of rows){
   if(String(r.period_month||'').slice(0,7)!==month)continue;
   const date=extractDate(r);
   if(!date){invalidDate.push(r);continue}
   if(!statuses.has(String(r.status||''))){invalidStatus.push(r);continue}
   if(r.work_type==='CM'){cm.push(r);continue}
   if(r.work_type==='SS'){ss.push(r);continue}
   if(r.work_type!=='PM'){unmapped.push(r);continue}
   const explicit=Number(r.raw_data?.template_row);
   let target=Number.isInteger(explicit)?byRow.get(explicit):null;
   if(!target){
    const name=norm(r.original_equipment||r.maintenance_assets?.asset_name);
    const area=norm(r.original_area||r.maintenance_assets?.area);
    const hits=byNamedArea.get(area+'|'+name)||[];
    if(hits.length===1)target=hits[0];
    else if((byName.get(name)||[]).length===1)target=byName.get(name)[0];
   }
   if(!target){unmapped.push(r);continue}
   if(!pm.has(target.row))pm.set(target.row,[]);
   pm.get(target.row).push(r);
  }
  const sorter=(a,b)=>String(a.work_date||'').localeCompare(String(b.work_date||''))||String(a.created_at||'').localeCompare(String(b.created_at||''));
  for(const arr of pm.values())arr.sort(sorter);
  cm.sort(sorter);ss.sort(sorter);
  const insertions=[];
  for(const [row,items] of pm){if(items.length>1)insertions.push({after:row,count:items.length-1,type:'PM'})}
  if(cm.length>4)insertions.push({after:290,count:cm.length-4,type:'CM'});
  if(ss.length>5)insertions.push({after:298,count:ss.length-5,type:'SS'});
  insertions.sort((a,b)=>b.after-a.after);
  const totalInserted=insertions.reduce((n,p)=>n+p.count,0);
  return {pm,cm,ss,unmapped,invalidStatus,invalidDate,insertions,totalInserted,
   included:[...pm.values()].reduce((n,a)=>n+a.length,0)+cm.length+ss.length};
 }
 function attrCell(ref,after,count){
  return ref.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g,(_,col,n)=>col+((Number(n)>after)?Number(n)+count:n));
 }
 function rangeShift(ref,after,count){
  return String(ref).replace(/(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/g,(all,a,b)=>{
   if(!b)return attrCell(a,after,count);
   const row1=Number(a.match(/\d+$/)?.[0]||0),row2=Number(b.match(/\d+$/)?.[0]||0);
   const na=row1>after?attrCell(a,after,count):a;
   const nb=(row2>after||row2===after&&row1<row2)?attrCell(b,row2===after?after-1:after,count):b;
   return na+':'+nb;
  });
 }
 const xmlParse=str=>{
  const doc=new DOMParser().parseFromString(str,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('تعذر قراءة عناصر القالب الأصلي.');
  return doc;
 };
 const serialize=doc=>new XMLSerializer().serializeToString(doc);
 const all=(root,tag)=>Array.from(root.getElementsByTagNameNS(NS,tag));
 function findRow(doc,rowNo){return all(doc,'row').find(r=>Number(r.getAttribute('r'))===rowNo)}
 function updateRefs(doc,after,count){
  for(const row of all(doc,'row')){
   const n=Number(row.getAttribute('r'));if(n<=after)continue;
   row.setAttribute('r',String(n+count));
   for(const cell of Array.from(row.children)){
    if(cell.localName==='c'&&cell.hasAttribute('r'))cell.setAttribute('r',attrCell(cell.getAttribute('r'),after,count));
   }
  }
  for(const tag of ['mergeCell','conditionalFormatting','dataValidation','hyperlink','dimension','autoFilter','selection']){
   for(const item of all(doc,tag))for(const attr of ['ref','sqref']){
    if(item.hasAttribute(attr))item.setAttribute(attr,rangeShift(item.getAttribute(attr),after,count));
   }
  }
 }
 function clearCell(doc,cell){
  for(const child of Array.from(cell.children)){
   if(['v','is','f'].includes(child.localName))cell.removeChild(child);
  }
  cell.removeAttribute('t');
 }
 function insertRows(doc,at,count,type){
  if(count<=0)return;
  const source=findRow(doc,at);if(!source)throw Error('تعذر العثور على صف أساسي في القالب: '+at);
  const parent=source.parentNode;
  const clones=[];
  for(let i=0;i<count;i++){
   const clone=source.cloneNode(true);
   clone.setAttribute('r',String(at+i+1));
   for(const c of Array.from(clone.children)){
    if(c.localName!=='c')continue;
    const old=c.getAttribute('r');
    c.setAttribute('r',old.replace(/\d+$/,String(at+i+1)));
    const col=old.match(/^[A-Z]+/)?.[0];
    if(type!=='PM'||col==='B'||'HIJKLMNO'.includes(col||''))clearCell(doc,c);
   }
   clones.push(clone);
  }
  updateRefs(doc,at,count);
  let following=source.nextSibling;
  for(const clone of clones)parent.insertBefore(clone,following);
 }
 function put(doc,rowNo,col,value){
  const row=findRow(doc,rowNo);if(!row)throw Error('صف غير موجود: '+rowNo);
  const address=col+rowNo;
  let cell=Array.from(row.children).find(c=>c.localName==='c'&&c.getAttribute('r')===address);
  if(!cell){
   cell=doc.createElementNS(NS,'c');cell.setAttribute('r',address);
   const colN=s=>{let v=0;for(const ch of s)v=v*26+ch.charCodeAt(0)-64;return v};
   const next=Array.from(row.children).find(c=>c.localName==='c'&&colN(c.getAttribute('r').match(/^[A-Z]+/)[0])>colN(col));
   row.insertBefore(cell,next||null);
  }
  clearCell(doc,cell);
  if(value===null||value===undefined||value==='')return;
  if(typeof value==='number'){
   if(!Number.isFinite(value))return;
   const node=doc.createElementNS(NS,'v');node.textContent=String(value);cell.appendChild(node);
  }else{
   cell.setAttribute('t','inlineStr');
   const is=doc.createElementNS(NS,'is'),t=doc.createElementNS(NS,'t');
   t.setAttribute('xml:space','preserve');t.textContent=String(value);
   is.appendChild(t);cell.appendChild(is);
  }
 }
 function frequencyColumn(value){
  const key=String(value??'').normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' ');
  const columns={M:'D',MONTHLY:'D',Q:'E',QUARTERLY:'E',
   H:'F','H YEARLY':'F','HALF YEARLY':'F',SEMIANNUAL:'F',
   Y:'G',YEARLY:'G',ANNUAL:'G'};
  return columns[key]||null;
 }
 function recordCells(doc,row,r,type){
  const date=extractDate(r),description=String(r.description||'').trim();
  let notes=String(r.notes||'').trim();
  if(type!=='PM'&&r.frequency){notes+=(notes?' — ':'')+'FREQUENCY: '+String(r.frequency).toUpperCase()}
  if(type==='PM'&&description)notes=(description+(notes?' — '+notes:''));
  const spares=String(r.spares||'').trim();
  if(spares&&!num(spares)&&num(r.spare_parts_cost)===null){notes+=(notes?' — ':'')+'قطع غيار: '+spares}
  if(type!=='PM'){
   put(doc,row,'B',r.original_area||r.maintenance_assets?.area||'');
   put(doc,row,'C',r.original_equipment||r.maintenance_assets?.asset_name||'');
   put(doc,row,'D',description);
  }else{
   const marked=frequencyColumn(r.frequency);
   if(marked){
    // PM frequency uses the existing M/Q/H/Y columns D/E/F/G in the original template.
    for(const col of ['D','E','F','G'])put(doc,row,col,col===marked?'✓':'');
   }
  }
  put(doc,row,'H',dateSerial(date));
  put(doc,row,'I',num(r.workers));
  put(doc,row,'J',num(r.hours));
  put(doc,row,'K',r.materials||'');
  put(doc,row,'L',num(r.spare_parts_cost)??num(r.spares));
  put(doc,row,'M',num(r.cost));
  put(doc,row,'N',String(r.status||''));
  put(doc,row,'O',notes);
 }
 async function zipLoader(){
  if(global.JSZip)return global.JSZip;
  const srcs=['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'];
  for(const src of srcs){
   try{await new Promise((resolve,reject)=>{
    const tag=document.createElement('script');tag.src=src;tag.async=true;
    tag.onload=resolve;tag.onerror=()=>reject(Error('تعذر تحميل محرر Excel'));document.head.appendChild(tag);
   });if(global.JSZip)return global.JSZip}catch(_){}
  }
  throw Error('تعذر تحميل أداة تحرير ملف Excel. تحقق من الاتصال بالإنترنت.');
 }
 function rawBytes(b64){
  const str=atob(b64),bytes=new Uint8Array(str.length);
  for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);
  return bytes;
 }
 function downloadBlob(blob,name){
  const a=document.createElement('a'),url=URL.createObjectURL(blob);
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function exportMonth(input){
  const {template,rows,month}=input;
  if(!template?.template_b64||!Array.isArray(template.template_rows))throw Error('قالب Excel غير متوفر للمحطة.');
  const work=plan(rows,template.template_rows,month);
  if(work.unmapped.length||work.invalidStatus.length||work.invalidDate.length){
   const messages=[];
   if(work.unmapped.length)messages.push(work.unmapped.length+' سجلًا غير مرتبط بصف واضح في القالب');
   if(work.invalidStatus.length)messages.push(work.invalidStatus.length+' حالة ليست ضمن قائمة القالب');
   if(work.invalidDate.length)messages.push(work.invalidDate.length+' تاريخًا غير محدد');
   throw Error('لا يمكن التصدير دون فقد بيانات: '+messages.join('، ')+'. راجع السجلات أولًا.');
  }
  const JSZip=await zipLoader(),zip=await JSZip.loadAsync(rawBytes(template.template_b64),{checkCRC32:true});
  const sheetEntry=zip.file('xl/worksheets/sheet1.xml'),bookEntry=zip.file('xl/workbook.xml');
  if(!sheetEntry||!bookEntry)throw Error('ملف القالب يفتقد البنية الأساسية.');
  const doc=xmlParse(await sheetEntry.async('string'));
  for(const ins of work.insertions)insertRows(doc,ins.after,ins.count,ins.type);
  const before=row=>row+work.insertions.filter(p=>p.after<row).reduce((n,p)=>n+p.count,0);
  put(doc,4,'B',dateSerial(month+'-01'));
  for(const [old,records] of work.pm){
   records.forEach((r,i)=>recordCells(doc,before(old)+i,r,'PM'));
  }
  const cmExtra=Math.max(0,work.cm.length-4),ssExtra=Math.max(0,work.ss.length-5);
  const cmSlots=[288,289,290].map(before).concat(Array.from({length:cmExtra},(_,i)=>before(290)+i+1),[before(291)]);
  const ssSlots=[295,296,297,298].map(before).concat(Array.from({length:ssExtra},(_,i)=>before(298)+i+1),[before(299)]);
  work.cm.forEach((r,i)=>recordCells(doc,cmSlots[i],r,'CM'));
  work.ss.forEach((r,i)=>recordCells(doc,ssSlots[i],r,'SS'));
  const originalSheet='NOV 26',targetSheet=excelSheetName(month);
  const workbook=xmlParse(await bookEntry.async('string'));
  const sheets=all(workbook,'sheet'),current=sheets.find(s=>s.getAttribute('name')===originalSheet);
  if(!current)throw Error('اسم ورقة القالب الأصلية تغير.');
  current.setAttribute('name',targetSheet);
  for(const d of all(workbook,'definedName')){
   if(d.getAttribute('name')==='_xlnm.Print_Area'&&d.getAttribute('localSheetId')==='0'){
    d.textContent="'"+targetSheet.replace(/'/g,"''")+"'!$B$2:$O$"+(310+work.totalInserted);
   }
  }
  zip.file('xl/worksheets/sheet1.xml',serialize(doc));
  zip.file('xl/workbook.xml',serialize(workbook));
  const appPart=zip.file('docProps/app.xml');
  if(appPart){
   const appXml=await appPart.async('string');
   zip.file('docProps/app.xml',appXml.replace(/NOV 26/g,targetSheet));
  }
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  const output='WADI JAZAN '+month.slice(5)+'-'+month.slice(2,4)+'.xlsx';
  downloadBlob(blob,output);
  return {filename:output,included:work.included,insertedRows:work.totalInserted,size:blob.size};
 }
 global.WSMaintenanceExcel=Object.freeze({plan,exportMonth,excelSheetName,dateSerial,frequencyColumn});
})(window);