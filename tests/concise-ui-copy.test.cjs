const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const files=['index.html','assets/core-app.js','assets/maintenance.js','assets/maintenance-daily.js'];
const contents=Object.fromEntries(files.map(file=>[file,fs.readFileSync(file,'utf8')]));
const all=Object.values(contents).join('\n');
test('redundant prose is absent from operational screens',()=>{
 for(const phrase of [
  'تم نقل بيانات الصيانة من ملف المصدر',
  'لا تغيّر عملية النقل تاريخ الصيانة الأصلي',
  'السجلات غير المرتبطة بمعدة مؤكدة محفوظة مع اسمها الأصلي',
  'احتفظنا بورقتي القالب، وشعار الملف وألوانه وخطوطه',
  'القسم يمثل مجموعة خزانات أو خطوط أو بوابات',
  'تعكس هذه اللوحة آخر قراءة مخزون محفوظة لكل مادة',
  'يظهر ملخص المحطات التي تم إدخال بياناتها فقط',
 ]){
   assert.equal(all.includes(phrase),false,'Unwanted prose: '+phrase);
 }
});
test('actions, original data fields and safe statuses are retained',()=>{
 const m=contents['assets/maintenance.js'],d=contents['assets/maintenance-daily.js'];
 for(const action of ['mw-daily-form','mw-search-form','mw-exact-month','mw-equipment-count'])
  assert.ok(all.includes(action),'Missing functional control: '+action);
 for(const field of ['name="frequency"','name="equipment"','name="notes"','name="cost"'])
  assert.ok(d.includes(field),'Missing maintenance field: '+field);
 assert.ok(m.includes('rollbackClick'));
 assert.ok(m.includes('maintenance_record_change_log'));
 assert.ok(d.includes('يتعذر التصدير:'));
});
