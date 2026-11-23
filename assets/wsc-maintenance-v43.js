/* Water Solutions V4.3 maintenance insights.
 * Read-only suggestions. Never merges assets, never edits status or costs.
 * Queries use the existing authenticated RLS endpoint.
 */
(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const host=()=>window.WSMaintenanceHost;
let assetCache=new Map();
const maxAge=45_000;
const cap=800;
const norm=value=>String(value||'').normalize('NFKC')
 .replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
 .replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
 .toUpperCase().replace(/[^A-Z0-9\u0600-\u06FF]+/g,' ')
 .replace(/\s+/g,' ').trim();
const tokens=x=>norm(x).split(' ').filter(Boolean);
const signature=x=>tokens(x).slice().sort((a,b)=>a.localeCompare(b)).join(' ');
const numbers=x=>tokens(x).filter(t=>/^\d+$/.test(t)).map(n=>String(Number(n))).sort().join(',');
function boundedDistance(a,b,max){
 if(Math.abs(a.length-b.length)>max)return max+1;
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const cur=[i];let min=i;
  for(let j=1;j<=b.length;j++){
   const v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
   cur[j]=v;if(v<min)min=v;
  }
  if(min>max)return max+1;
  prev=cur;
 }
 return prev[b.length];
}
function maybePair(a,b){
 if(a.id===b.id||!a.asset_name||!b.asset_name)return null;
 if(numbers(a.asset_name)!==numbers(b.asset_name))return null;
 const areaA=norm(a.area),areaB=norm(b.area);
 if(areaA&&areaB&&areaA!==areaB)return null;
 const one=signature(a.asset_name),two=signature(b.asset_name);
 if(!one||!two||one.length<7||two.length<7)return null;
 if(one===two)return {left:a,right:b,reason:'الكلمات متطابقة مع اختلاف محتمل في الترتيب أو التنسيق',level:'strong'};
 const oneWords=new Set(tokens(a.asset_name)),twoWords=new Set(tokens(b.asset_name));
 const intersection=[...oneWords].filter(x=>twoWords.has(x)).length;
 if(intersection<1||intersection/Math.max(oneWords.size,twoWords.size)<0.32)return null;
 const cutoff=Math.floor(Math.max(one.length,two.length)*0.24);
 if(cutoff<1||boundedDistance(one,two,cutoff)>cutoff)return null;
 return {left:a,right:b,reason:'تشابه في التسمية يحتاج تحققًا من هوية المعدة',level:'candidate'};
}
function findPairs(rows){
 const list=rows.filter(x=>x?.asset_name&&x?.id).slice(0,cap);
 const bucket=new Map();
 for(const r of list){
  const key=numbers(r.asset_name);
  if(!bucket.has(key))bucket.set(key,[]);
  bucket.get(key).push(r);
 }
 const found=[];
 for(const entries of bucket.values()){
  for(let i=0;i<entries.length;i++){
   for(let j=i+1;j<entries.length;j++){
    const item=maybePair(entries[i],entries[j]);
    if(item)found.push(item);
    if(found.length>=15)break;
   }
   if(found.length>=15)break;
  }
  if(found.length>=15)break;
 }
 return found;
}
async function fetchAssets(stationId){
 const user=host()?.userId?.()||'';
 const k=user+'@'+stationId,old=assetCache.get(k);
 if(old&&Date.now()-old.time<maxAge)return old;
 const params=new URLSearchParams({select:'id,asset_name,area,asset_code',
  station_id:'eq.'+stationId,asset_code:'neq.UNVERIFIED_LINK',
  order:'asset_name.asc',limit:String(cap)});
 const response=await host().authedFetch('/rest/v1/maintenance_assets?'+params);
 if(!response.ok)throw Error('تعذّر التحقق من تشابه أسماء المعدات.');
 const rows=await response.json();
 if(!Array.isArray(rows))throw Error('نتيجة غير متوقعة');
 const result={time:Date.now(),rows,limited:rows.length===cap};
 assetCache.set(k,result);
 if(assetCache.size>15)assetCache.delete(assetCache.keys().next().value);
 return result;
}
async function renderSuggestions(stationId,container){
 if(!container||!(host()?.stations?.()||[]).some(s=>s.id===stationId))return;
 container.innerHTML='<span class="ws-v43-asset-loading">جارٍ فحص تشابه أسماء الأصول المسجلة…</span>';
 try{
  const {rows,limited}=await fetchAssets(stationId);
  if(!container.isConnected||container.dataset.station!==stationId||!host()?.signedIn?.())return;
  const pairs=findPairs(rows);
  const message=limited?'الفحص شمل أول '+cap+' معدة مسجلة؛ قد توجد أسماء أخرى خارج هذا النطاق.':
   'الفحص شمل '+rows.length+' معدة مسجلة ظاهرة لصلاحيات حسابك.';
  container.innerHTML='<div class="ws-v43-duplicate-head"><h3>مراجعة تسميات المعدات المتشابهة</h3>'+
   '<span class="ws-v43-duplicate-count">'+pairs.length+' اقتراح للمراجعة</span></div>'+
   '<p class="ws-v43-asset-subtitle">هذه اقتراحات فقط، وليست إثباتًا أن المعدتين أصل واحد. لن يتم دمج أو تعديل أي معدة تلقائيًا.</p>'+
   (pairs.length?'<div class="ws-v43-duplicate-grid">'+pairs.map(p=>
    '<article class="ws-v43-duplicate-pair"><strong>'+esc(p.left.asset_name)+'</strong>'+
    '<span>قد تتطابق مع</span><strong>'+esc(p.right.asset_name)+'</strong>'+
    '<small>'+esc(p.reason)+'</small>'+
    '<small>AREA: '+esc(p.left.area||p.right.area||'غير محددة')+'</small></article>'
   ).join('')+'</div>':'<p class="ws-v43-asset-empty">لم تُكتشف أسماء متشابهة ضمن العينة المفحوصة.</p>')+
   '<small class="ws-v43-asset-coverage">'+esc(message)+'</small>';
 }catch(error){
  if(container.isConnected)container.innerHTML='<div class="ws-v43-asset-empty">'+esc(error.message||'تعذر الفحص')+'</div>';
 }
}
async function renderAssetCard(stationId,assetId,assetName,container){
 if(!container||!(host()?.stations?.()||[]).some(s=>s.id===stationId))return;
 container.innerHTML='<p class="ws-v43-asset-loading">جارٍ تحميل بطاقة المعدة…</p>';
 try{
  const p=new URLSearchParams({select:'id,station_id,asset_id,status,work_date,period_month,frequency,work_type,description',
   station_id:'eq.'+stationId,asset_id:'eq.'+assetId,
   order:'work_date.desc.nullslast,created_at.desc',limit:'8'});
  const response=await host().authedFetch('/rest/v1/maintenance_records?'+p);
  if(!response.ok)throw Error('تعذّر قراءة سجل المعدة.');
  const list=await response.json();
  if(!Array.isArray(list))throw Error('نتيجة غير متوقعة');
  if(!container.isConnected||!host()?.signedIn?.()||container.dataset.asset!==assetId)return;
  const latest=list.find(r=>r.work_date)||list[0]||null;
  const frequency=latest?.frequency||'غير محدد';
  const status=latest?.status||'غير محددة';
  const dated=latest?.work_date||'لا يوجد تاريخ تنفيذ مسجل';
  const recent=list.slice(0,5).map(r=>
   '<div class="ws-v43-asset-event"><time>'+esc(r.work_date||r.period_month||'دون تاريخ')+'</time>'+
   '<span>'+esc(r.work_type||'عمل')+'</span><strong>'+esc(r.status||'غير محدد')+'</strong></div>'
  ).join('');
  container.innerHTML='<div class="ws-v43-asset-card-head"><div><small>بطاقة المعدة · بيانات سجل الصيانة</small><h3>'+esc(assetName||'المعدة المختارة')+'</h3></div>'+
   '<span class="ws-v43-asset-readonly">عرض فقط</span></div>'+
   '<div class="ws-v43-asset-stat-grid">'+
   '<div><span>آخر سجل عمل مؤرخ</span><strong>'+esc(dated)+'</strong></div>'+
   '<div><span>الحالة المسجلة</span><strong>'+esc(status)+'</strong></div>'+
   '<div><span>التكرار المسجل</span><strong>'+esc(frequency)+'</strong></div>'+
   '<div><span>السجلات المستعرضة</span><strong>'+list.length+' من آخر السجلات</strong></div></div>'+
   '<div class="ws-v43-asset-events">'+(recent||'<p>لا توجد أعمال مسجلة لهذه المعدة.</p>')+'</div>'+
   '<small class="ws-v43-asset-coverage">آخر حالة ليست حكمًا على الحالة التشغيلية الحالية. هذه البطاقة مبنية على أحدث السجلات المتاحة فقط.</small>';
 }catch(error){
  if(container.isConnected)container.innerHTML='<p class="ws-v43-asset-empty">'+esc(error.message||'تعذر عرض البطاقة')+'</p>';
 }
}
function invalidate(){assetCache.clear()}
window.WSV43Maintenance=Object.freeze({findPairs,norm,renderSuggestions,renderAssetCard,invalidate});
})();
