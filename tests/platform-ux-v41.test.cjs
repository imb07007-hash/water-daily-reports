'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const read=name=>fs.readFileSync(name,'utf8');
const js=read('assets/wsc-platform-v3.js'),css=read('assets/wsc-ux-v41.css');
const html=read('index.html'),bulk=read('assets/maintenance-bulk.js');
const blob=text=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
test('smart sidebar uses original brand mark and never edits original logo assets',()=>{
 assert.equal(blob(read('assets/wsc-logo.svg')),'95b97adcce3a020346d8eb9d9123f78c885566dd');
 assert.equal(blob(read('assets/wsc-mark.svg')),'92ead9adb56d6295abf8ac363418e54a7ec43243');
 assert.ok(js.includes('ws-v41-compact-logo'));
 assert.ok(css.includes("wsc-mark.svg")===false); // image source stays in the HTML/JS, not replaced in styles
 assert.ok(css.includes('.ws-v41-compact-logo'));
});
test('V4.1 sidebar preferences persist only layout details and never maintenance/report contents',()=>{
 for(const marker of ['localStorage.setItem(WS_UI_PREFS','state.expandedGroups','setCollapsed(',
  "data-ws-toggle-collapse","persistPreferences();buildNav()","ws-v41-collapsed"])
  assert.ok(js.includes(marker),marker);
 const prefs=js.slice(js.indexOf('function persistPreferences()'),js.indexOf('function setCollapsed('));
 assert.ok(prefs.includes('collapsed:state.collapsed'));
 assert.ok(prefs.includes('density:'));
 assert.ok(prefs.includes('expanded:'));
 assert.ok(!prefs.includes('station_id'));
 assert.ok(!prefs.includes('data:'));
 assert.ok(css.includes('@media(min-width:921px)'));
 assert.ok(css.includes('@media(max-width:920px)'));
});
test('view context preserves authorized filters and scroll positions without saving report data',()=>{
 assert.ok(js.includes('const VIEW_FIELDS='));
 for(const marker of ['dashboardDate','archiveStation','archiveFrom','archiveTo','archiveMonth','archiveYear',
  'function captureView(route)','function restoreView(route)','captureView(previous)','restoreView(route)',
  "state.viewState.clear()","if(input&&!input.disabled","currentViewport(route)"])
  assert.ok(js.includes(marker),marker);
 assert.ok(!js.slice(js.indexOf('function captureView('),js.indexOf('function dateSaudi()')).includes('localStorage.setItem('));
});
test('selected-only maintenance actions remain secured by existing admin checks',()=>{
 assert.ok(bulk.includes("node.dataset.wsBulkActive=String(count>0)"));
 assert.ok(bulk.includes("if(!isAdmin()||!root||!stationId)return"));
 assert.ok(css.includes('data-ws-bulk-active="false"'));
 assert.ok(css.includes('data-ws-bulk-active="true"'));
 assert.ok(css.includes('pointer-events:auto!important;'));
 assert.ok(css.includes('> .mw-bulk-overlay'));
 assert.ok(bulk.includes("maintenance_bulk_edit_records"));
 assert.ok(bulk.includes("maintenance_bulk_set_lock"));
});
test('production index includes and versions both new client assets without modifying print reports',()=>{
 assert.ok(html.includes('/assets/wsc-ux-v41.css?v=20261119-ux41-2'));
 assert.ok(html.includes('/assets/wsc-platform-v3.js?v=20261119-v43c'));
 assert.ok(html.includes('/assets/maintenance-bulk.js?v=20261119-ux41-1'));
 assert.ok(css.includes('@media print'));
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotThrow(()=>new Function(bulk));
});
