'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const get=p=>fs.readFileSync(p,'utf8');
const code=get('assets/wsc-intelligence-v42.js');
const css=get('assets/wsc-intelligence-v42.css');
const shell=get('assets/wsc-platform-v3.js');
const core=get('assets/core-app.js');
const maint=get('assets/maintenance.js');
const html=get('index.html');
const blob=string=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(string)+'\0').update(string).digest('hex');
test('official Water Solutions logos are byte-identical with approved assets',()=>{
 assert.equal(blob(get('assets/wsc-logo.svg')),'95b97adcce3a020346d8eb9d9123f78c885566dd');
 assert.equal(blob(get('assets/wsc-mark.svg')),'92ead9adb56d6295abf8ac363418e54a7ec43243');
 assert.doesNotMatch(code,/data:image\/svg/);
});
test('V4.2 search uses authenticated RLS API and limited field-only queries',()=>{
 assert.ok(code.includes('host().authedFetch'));
 assert.ok(code.includes("searchTable('reports'"));
 assert.ok(code.includes("searchTable('maintenance_assets'"));
 assert.ok(code.includes('allowedIds.has('));
 assert.ok(code.includes("asset_name:'ilike.*'"));
 assert.ok(code.includes("date:"));
 assert.ok(!code.includes('service_role'));
 assert.ok(!code.includes('/auth/v1/admin'));
});
test('report comparison is read only and separates zero from missing values',()=>{
 assert.ok(code.includes('function safeNumber'));
 assert.ok(code.includes("String(v).trim()===''"));
 assert.ok(code.includes("if(a===null||b===null)continue"));
 assert.ok(code.includes('priorFetched'));
 assert.ok(code.includes('report_date:'));
 assert.ok(code.includes("order:'report_date.desc,created_at.desc'"));
 assert.ok(code.includes('غير معطِّلة')||code.includes('تنبيه للمراجعة فقط'));
 assert.ok(core.includes('reportReadOnly:()=>'));
 assert.ok(core.includes('validation:validateReport()'));
 assert.ok(core.includes('window.WSV42?.onReportRendered?.()'));
});
test('archive source labels distinguish original WhatsApp timestamp from import timestamp',()=>{
 assert.ok(core.includes('ws-v42-provenance'));
 assert.ok(core.includes('وقت الرسالة الأصلية غير متوفر'));
 assert.ok(core.includes('وقت الحفظ في الموقع'));
 assert.ok(code.includes('وقت الرسالة غير متاح'));
 assert.ok(css.includes('ws-v42-evidence'));
});
test('maintenance summary does not treat every other status as explicitly NOT DONE',()=>{
 assert.ok(maint.includes('حالات أخرى غير DONE'));
 assert.ok(maint.includes('ليس حكمًا بعدم التنفيذ'));
 assert.ok(maint.includes("card('NOT DONE'"));
 assert.ok(!maint.includes("card('غير مكتمل من السجلات'"));
});
test('favorites store only navigation references and local client UI prefs, not report contents',()=>{
 const a=code.slice(code.indexOf('function persist(){'),code.indexOf('function same('));
 assert.ok(a.includes('favorites:'));
 assert.ok(a.includes('recents:'));
 assert.ok(!a.includes('metrics:'));
 assert.ok(!a.includes('data:'));
 assert.ok(code.includes("function validFav(item)"));
 assert.ok(code.includes('function paintPin()'));
});
test('release includes V4.2 scripts, source labels, charts and unchanged print template',()=>{
 assert.ok(html.includes('/assets/wsc-intelligence-v42.css?v=20261119-v42a'));
 assert.ok(html.includes('/assets/wsc-intelligence-v42.js?v=20261119-v42a'));
 assert.ok(html.includes('/assets/core-app.js?v=20261119-v42a'));
 assert.ok(html.includes('/assets/wsc-platform-v3.js?v=20261119-v42a'));
 assert.ok(css.includes('.dashboard-week-fill'));
 assert.ok(css.includes('.archive-barfill'));
 assert.ok(css.includes('@media print'));
 assert.ok(!core.includes('window.WSV42?.writeReport'));
 assert.ok(shell.includes('window.WSV42?.search?.(text)'));
 assert.ok(shell.includes('window.WSV42?.recordVisit?.(route)'));
 assert.doesNotThrow(()=>new Function(code));
 assert.doesNotThrow(()=>new Function(core));
 assert.doesNotThrow(()=>new Function(shell));
});
