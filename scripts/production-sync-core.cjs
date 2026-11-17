'use strict';
// Immutable read-only Excel parsing. No Google Drive write method exists here.
const {createHash}=require('node:crypto');
const SOURCE_ID='1bs0dVSr-YVtX87iZlYn1M_fXCN87b938', REPORT_SHEET='تقرير الإنتاج';
const STATIONS={
 'وحده تنقيه المياه السطحيه في سد جيزان':'jizan',
 'وحده تنقيه المياه الجوفيه والسطحيه في ضمد':'damad',
 'منظومه تحليه المياه الجوفيه والسطحيه في سد بيش 1&2':'bish',
 'وحده تنقيه المياه الجوفيه والسطحيه في مربه':'marbah',
 'وحده تحليه المياه الجوفيه في الماطري':'matari',
 'وحده تحليه المياه الجوفيه في محايل':'muhayil'
};
const HEADERS={C:'اسم المحطة',F:'المياه الخام',G:'الإنتاج الفعلي',H:'الإنتاج الاحتياطي',I:'Pypass',J:'الرجيع',K:'كفاءة RO',L:'الكميات المستلمة من',M:'مجموع كميات الضخ',N:'TDS',O:'نسبة الخزن',P:'نسبة الخزن',R:'ملاحظات'};
const ARABIC={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
function digits(s){return String(s).replace(/[٠-٩۰-۹]/g,c=>ARABIC[c]);}
function norm(s){return digits(s).trim().replace(/[\u064b-\u065fـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').toLowerCase();}
function value(c){if(c===undefined||c===null)return null;if(typeof c==='object'){if('value' in c)return value(c.value);if(Object.hasOwn(c,'result'))return value(c.result);if(Object.hasOwn(c,'text'))return c.text;if(Array.isArray(c.richText))return c.richText.map(x=>x.text||'').join('');return null;}return c;}
function num(c){const v=value(c);if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string')return null;const s=digits(v).trim().replace(/\u00a0/g,'').replace(/[٬,\s]/g,'').replace(/٫/g,'.');if(!s||!/^[-+]?\d+(\.\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;}
function pct(c){const v=value(c);if(v===null)return null;const t=digits(v).trim();const n=typeof v==='number'?v:num(t.replace(/[%٪]/g,''));if(n===null||n<0)return null;const result=t.includes('%')||t.includes('٪')?n:n<=1?n*100:n;return result<=100?String(Number(result.toFixed(4))):null;}
function validateDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Invalid date');const d=new Date(s+'T00:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==s)throw Error('Invalid date');return d;}
function plusDays(s,n){const d=validateDate(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function localDate(now=new Date()){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const d=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${d.year}-${d.month}-${d.day}`;}
function headerDate(c){const s=digits(value(c)||''),m=s.match(/(20\d{2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})/);if(!m)throw Error('Date missing in Q2');const d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;validateDate(d);return d;}
function txt(c){const v=value(c);return v===null?'':String(v).trim();}
function parse(sheet,now=new Date()){
 for(const [col,title]of Object.entries(HEADERS)){const actual=norm(txt(sheet.getCell(col+'3')));if(!actual.includes(norm(title)))throw Error(`Source layout changed: ${col}3 expected ${title}`);}
 const head=headerDate(sheet.getCell('Q2')),productionDate=plusDays(head,1),today=localDate(now);
 if(productionDate>plusDays(today,-1)||productionDate<plusDays(today,-3))return {productionDate,head,rows:[],reason:'stale_or_future'};
 const found=new Map();
 for(let r=4;r<=Math.min(sheet.rowCount,350);r++){
  const id=STATIONS[norm(txt(sheet.getCell('C'+r)))];if(!id)continue;
  if(found.has(id))throw Error('Duplicate station '+id);
  const get=col=>sheet.getCell(col+r),production=num(get('G'));
  if(production===null||production<0)throw Error('Invalid production for '+id);
  const metrics={production:String(production)},groups={},notes={};
  const raw=num(get('F')),tds=num(get('N')),pumping=num(get('M'));
  if(raw!==null&&raw>=0&&['jizan','bish','marbah','matari'].includes(id))metrics.raw=String(raw);
  if(tds!==null&&tds>=0){if(['jizan','damad','bish','marbah'].includes(id))metrics.tds=String(tds);if(id==='matari')metrics.tds_product=String(tds);}
  if(pumping!==null&&pumping>=0&&['marbah','matari'].includes(id))metrics.pumping=String(pumping);
  const tank=pct(get('O'));if(tank!==null&&['jizan','damad'].includes(id))groups.tanks={tank:{pct:tank}};
  const lines=[],note=txt(get('R'));if(note)lines.push(note);
  const extras=[['H','الإنتاج الاحتياطي','م³'],['I','Bypass','م³'],['J','الرجيع','م³'],['K','كفاءة RO','%'],['L','الكميات المستلمة من شركة نقل المياه','م³'],['M','مجموع كميات الضخ','م³']];
  for(const [col,label,unit]of extras){if(col==='M'&&['marbah','matari'].includes(id))continue;const x=col==='K'?pct(get(col)):num(get(col));if(x!==null&&x>=0)lines.push(`${label}: ${x} ${unit}`);}
  if(tank!==null&&!['jizan','damad'].includes(id))lines.push(`نسبة الخزن الداخلي الإجمالية: ${tank}%`);
  const ext=pct(get('P'));if(ext!==null)lines.push(`نسبة الخزن الخارجي: ${ext}%`);
  if(lines.length)notes.notes=lines.join('؛ ');
  found.set(id,{stationId:id,excelRow:r,data:{metrics,groups,notes}});
 }
 if(found.size!==6)throw Error('Expected six stations; found '+found.size);
 return {productionDate,head,rows:[...found.values()]};
}
function fingerprint(b){return createHash('sha256').update(b).digest('hex');}
module.exports={SOURCE_ID,REPORT_SHEET,norm,num,pct,plusDays,localDate,headerDate,parse,fingerprint};
