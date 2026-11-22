/* Water Solutions · page-aware, role-aware help. Read-only UI; no auth or data writes. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=(question,answer)=>({question,answer});
const media=(file,caption)=>({file,caption});
const d=(title,intro,steps,faq=[],issues=[],demos=[])=>({title,intro,steps,faq,issues,demos});
const COMMON_LOGIN=q('نسيت كلمة المرور، ماذا أفعل؟','من صفحة تسجيل الدخول اضغط «نسيت كلمة المرور؟»، ثم أدخل البريد الإلكتروني المرتبط بالحساب واتبع رابط الاستعادة. إذا لم يكن للحساب بريد مرتبط أو لم يصل الرابط، تواصل مع المسؤول المختص.');
const COMMON_PW=q('كيف أغير كلمة المرور وأنا داخل النظام؟','افتح قائمة «حسابي» واختر «تغيير كلمة المرور». تختلف خيارات الإدارة عن تغيير كلمة مرور حسابك الشخصي.');
const content={
login:d('مساعدة تسجيل الدخول','هذه المساعدة تخص الدخول إلى نظام التقارير التشغيلية اليومية فقط.',
 ['اكتب اسم المستخدم أو بريد المدير في خانة اسم المستخدم.','أدخل كلمة المرور في الخانة التالية، ثم اختر «دخول النظام».','يمكنك استخدام زر «إظهار» للتحقق من الكتابة مع مراعاة الخصوصية.','إذا نسيت كلمة المرور، استخدم رابط الاستعادة أسفل نموذج الدخول.'],
 [q('هل أكتب اسم المحطة بدلًا من اسم المستخدم؟','استخدم اسم المستخدم المخصص لحسابك، لا تفترض أن اسم المحطة هو نفسه اسم الدخول.'),COMMON_LOGIN,q('لماذا تظهر رسالة فشل تسجيل الدخول؟','تحقق من اسم المستخدم وكلمة المرور واتصال الإنترنت. إذا استمرت المشكلة، اطلب المساعدة من المسؤول دون مشاركة كلمة مرورك.')],
 ['لا تشارك كلمة المرور أو رمز الاستعادة في الرسائل.','إذا لم يصلك رابط الاستعادة، تحقق من البريد غير الهام وصحة البريد المسجل.'],
 [media('login.gif','تسجيل الدخول — تسجيل من الواجهة الفعلية باستخدام بيانات تدريبية')]),
'password-recovery':d('استعادة كلمة المرور','اتبع هذه الخطوات إذا فقدت كلمة المرور أو فتحت رابط إعادة تعيينها.',
 ['في صفحة الدخول اختر «نسيت كلمة المرور؟».','اكتب البريد المسجل للحساب، ثم اضغط «إرسال رابط استعادة».','افتح الرابط الذي يصلك بالبريد، وأدخل كلمة مرور جديدة في حقلي التعيين والتأكيد.','احفظ كلمة المرور، ثم ارجع لتسجيل الدخول.'],
 [q('ما شروط كلمة المرور الجديدة؟','تتطلب شاشة إعادة التعيين 12 رمزًا على الأقل، تتضمن حرفًا إنجليزيًا كبيرًا وآخر صغيرًا ورقمًا.'),COMMON_LOGIN,q('هل يمكن معرفة كلمة المرور القديمة؟','لا تُعرض كلمة المرور القديمة بصيغة مقروءة؛ تُستخدم عملية إعادة التعيين عند فقدانها.')],
 ['إذا انتهت صلاحية رابط الاستعادة، ابدأ طلب استعادة جديد.','إذا لم يكن بريدك مرتبطًا بالحساب، تواصل مع المسؤول المختص.']),
home:d('مساعدة الصفحة الرئيسية','تعرف على الأقسام التي يسمح بها دور حسابك.',
 ['استخدم القائمة الجانبية للانتقال إلى القسم المطلوب.','اختر التقرير اليومي لإدخال بيانات المحطة إذا كانت صلاحيتك تسمح بذلك.','يمكنك فتح الأرشيف لمراجعة التقارير المسموح لك بعرضها.','تجد تغيير كلمة المرور في قائمة حسابك.'],
 [q('لماذا لا أرى جميع أقسام النظام؟','تُعرض الصفحات والمهام بحسب نوع حسابك وصلاحياته.'),COMMON_PW],
 ['إذا لم يظهر القسم الذي تتوقعه، تحقق مع المسؤول من الدور المخصص لحسابك.']),
reports:d('مساعدة التقرير التشغيلي اليومي','تعلم إدخال قراءات المحطة ومراجعتها واعتماد إرسال التقرير.',
 ['افتح «التقرير اليومي» وراجع اسم المحطة وتاريخ التقرير.','أدخل القراءة الفعلية في كل خانة متاحة حسب نموذج محطتك.','اكتب صفرًا فقط عندما تكون القراءة الفعلية صفرًا؛ الخانة الفارغة ليست صفرًا.','راجع نسبة اكتمال الحقول المطلوبة، والملاحظات، ومعاينة التقرير.','اضغط زر الإرسال أو الاعتماد، وراجع نافذة «مراجعة نهائية قبل الاعتماد»، ثم أكد العملية.','افتح الأرشيف للتأكد من تسجيل التقرير ضمن التقارير المتاحة لحسابك.'],
 [q('هل أترك القراءة الفارغة صفرًا؟','لا. الصفر قيمة تشغيلية فعلية، أما عدم وجود قراءة فلا يصح تحويله إلى صفر.'),q('لماذا لا أستطيع إرسال التقرير؟','تحقق من الحقول الإلزامية ومن تاريخ التقرير، ومن أي رسالة توضيحية أو مراجعة نهائية ظاهرة.'),q('هل يمكن تعديل التقرير بعد اعتماده؟','تتوقف إمكانية تعديل التقرير المعتمد على صلاحيات الحساب وحالة التقرير؛ لا تفترض أن كل حساب يستطيع تعديل التقارير المرسلة.')],
 ['إذا ظهرت القراءات للقراءة فقط، فقد يكون التاريخ المختار مرتبطًا بتقرير موجود مسبقًا أو أن الحساب لا يملك التعديل.','إن كانت نافذة المراجعة تعرض قيمًا غير صحيحة، أغلقها وصحح البيانات قبل الاعتماد.'],
 [media('report.gif','تعبئة بيانات التقرير — تسجيل تدريبي من واجهة النظام'),media('review.gif','مراجعة التقرير واعتماده — تسجيل تدريبي')]),
dashboard:d('مساعدة لوحة المتابعة التشغيلية','مساعدة المشرف في قراءة التقارير المستلمة وغير المستلمة.',
 ['اختر تاريخ المتابعة المطلوب؛ تاريخ التقرير يختلف عن وقت تسجيله في النظام.','راجع عدد التقارير المستلمة والمحطات التي لم ترسل تقريرها.','افتح تفاصيل المحطة أو التقرير عند الحاجة.','راجع وقت وتاريخ الإرسال الفعلي بتوقيت السعودية، ولا تخلط بينه وبين تاريخ التقرير.'],
 [q('هل الإنتاج صفر يعني توقف المحطة؟','لا؛ قراءة إنتاج صفر لا تعني وحدها وجود عطل أو توقف غير مخطط.'),q('ما الفرق بين تاريخ التقرير ووقت الإرسال؟','تاريخ التقرير هو اليوم الذي تخصه البيانات؛ أما وقت الإرسال فهو وقت تسجيل العملية الفعلي.'),q('لماذا تُظهر اللوحة محطة دون تقرير؟','لم يُسجل تقرير لهذه المحطة في التاريخ المحدد ضمن البيانات التي تعرضها اللوحة.')],
 ['تأكد من تاريخ المتابعة قبل تفسير أرقام اللوحة.','لا تعتبر الخانات التي لا تحتوي قراءة مساوية للصفر.']),
'archive/daily':d('مساعدة أرشيف التقارير اليومية','البحث واستعراض التقارير اليومية السابقة.',
 ['افتح «الأرشيف» ثم «التقارير اليومية».','حدد الفترة الزمنية، واختر المحطة إذا كان حسابك يسمح بأكثر من محطة.','نفذ البحث، ثم افتح معاينة التقرير المطلوب.','راجع تاريخ التقرير ووقت تسجيله والقراءات المعروضة.'],
 [q('لماذا لا أرى تقريرًا قديمًا؟','راجع فترة البحث والمحطة المختارة ونطاق صلاحية الحساب. بعض الأيام قد لا تحتوي تقريرًا.'),q('هل يمكن حذف تقرير من الأرشيف؟','تعتمد إجراءات تعديل أو حذف التقرير على صلاحيات الدور، ولا تتاح لجميع الحسابات.')],
 ['إذا لم تجد تقريرًا، وسّع فترة البحث أو تحقق من تاريخ التقرير المطلوب.'],
 [media('archive.gif','فتح الأرشيف — تسجيل تدريبي من واجهة الموقع')]),
'archive/monthly':d('مساعدة التقارير الشهرية','الوصول إلى ملخصات وسجلات التقارير الشهرية.',
 ['افتح «الأرشيف» ثم «التقارير الشهرية».','حدد الشهر والسنة أو عوامل التصفية المعروضة.','افتح التقرير أو الملخص المطلوب وراجع نطاق المحطة والمدة.'],
 [q('لماذا لا تظهر بيانات الشهر؟','تأكد من الفترة والمحطة المختارة، وتوفر بيانات مسجلة لتلك الفترة.')],
 ['تحقق من اختيار الشهر والسنة قبل المقارنة.']),
'archive/yearly':d('مساعدة التقارير السنوية','استعراض البيانات السنوية المتاحة بحسب صلاحية الحساب.',
 ['افتح «الأرشيف» ثم «التقارير السنوية».','اختر السنة المطلوبة والمرشحات المتاحة.','راجع المحطات والفترة والبيانات المجمعة قبل استخدام النتائج.'],
 [q('هل غياب البيانات يعني أن القيمة صفر؟','لا؛ البيانات غير المسجلة تختلف عن القيمة الصفرية المسجلة فعليًا.')],
 ['راجع نطاق التاريخ والمحطة إذا ظهرت نتائج غير متوقعة.']),
'chemicals/overview':d('مساعدة لوحة مخزون الكيماويات','متابعة القراءات وحالة مخزون المواد الكيميائية.',
 ['افتح «المواد الكيميائية» ثم «لوحة مخزون الكيماويات».','اختر المحطة أو النطاق المتاح لحسابك.','راجع المواد والكميات والتواريخ الظاهرة، ثم افتح السجلات عند الحاجة.'],
 [q('لماذا تختلف قراءة المخزون عن السابقة؟','راجع تاريخ القراءة والمادة والوحدة، وتحقق من صحة الإدخال قبل الاستنتاج.')],
 ['تحقق من وحدة قياس المادة، ولا تستخدم قراءة قديمة على أنها قراءة اليوم.']),
'chemicals/entry':d('مساعدة تسجيل قراءة المخزون','إدخال قراءة مخزون كيماويات ضمن صلاحيات حسابك.',
 ['افتح «المواد الكيميائية» ثم «تسجيل قراءة مخزون».','حدد المحطة والمادة والتاريخ أو الوقت إذا ظهرت الحقول.','أدخل القيمة الفعلية بوحدتها الصحيحة ثم راجع المدخلات قبل الحفظ.'],
 [q('ماذا أفعل إذا لم تتوفر قراءة اليوم؟','لا تضع صفرًا افتراضيًا؛ اتبع تعليمات تسجيل القراءة غير المتاحة داخل القسم.')],
 ['إذا لم يسمح النظام بالتسجيل، راجع صلاحياتك والحقول المطلوبة.']),
'maintenance/overview':d('مساعدة لوحة الصيانة','التعرف على أعمال الصيانة وسجلاتها.',
 ['افتح قسم «الصيانة» ثم «لوحة الصيانة».','راجع ملخص الأعمال والبيانات المعروضة.','انتقل إلى «إدخال أعمال الصيانة» أو «سجلات الصيانة» بحسب المهمة.'],
 [q('لماذا لا أرى أعمال الصيانة؟','تأكد من المحطة أو الفترة وعوامل التصفية المتاحة لحسابك.'),COMMON_PW],
 ['تأكد من التاريخ والمعدة قبل المقارنة بين السجلات.']),
'maintenance/daily':d('مساعدة إدخال أعمال الصيانة','خطوات إدخال وتوثيق أعمال الصيانة.',
 ['افتح «إدخال أعمال الصيانة».','حدد المحطة والمعدة أو الأصل المطلوب بحسب الحقول المتاحة.','اختر نوع العمل وتاريخه وأدخل الحالة والملاحظات بدقة.','راجع المدخلات ثم احفظ السجل، وانتقل إلى «سجلات الصيانة» للتحقق منه.'],
 [q('متى أستخدم DONE وNOT DONE؟','استخدم DONE للعمل المنفذ، وNOT DONE للعمل غير المنفذ، وفق حالات القسم المتاحة. لا تسجل إنجازًا لم يحدث.'),q('لا تظهر المعدة المطلوبة، ماذا أفعل؟','ابحث ضمن صفحة المعدات والأصول، وتحقق من المحطة أو التصفية قبل إنشاء سجل.'),COMMON_PW],
 ['لا تكرر سجل الصيانة دون التأكد من عدم وجوده مسبقًا.','تحقق من صحة المعدة والتاريخ وحالة التنفيذ قبل الحفظ.']),
'maintenance/assets':d('مساعدة المعدات والأصول','التعرف على المعدات المسجلة وربطها بسجلات الصيانة.',
 ['افتح «المعدات والأصول».','ابحث عن المعدة بالاسم أو عوامل التصفية المتاحة.','افتح بيانات المعدة وراجع سجلاتها عند الحاجة.'],
 [q('المعدة غير موجودة أو اسمها مختلف؟','تحقق من الاسم المعتمد والمرشحات؛ لا تُنشئ معدة مكررة بسبب اختلاف إملائي.')],
 ['تجنب تكرار المعدات بأسماء متشابهة.']),
'maintenance/records':d('مساعدة سجلات الصيانة','استرجاع ومراجعة الصيانة السابقة.',
 ['افتح «سجلات الصيانة».','حدد المدة أو المعدة أو الحالة من عوامل التصفية.','افتح السجل المطلوب وراجع تاريخ التنفيذ والحالة والملاحظات.'],
 [q('هل يمكن تعديل سجل محفوظ؟','تتوقف إمكانات التعديل على الدور والصلاحيات المعتمدة في القسم.')],
 ['راجع حالة السجل وتاريخه قبل الاعتماد عليه.']),
'maintenance/planned':d('مساعدة الجدول والدوريات','متابعة أعمال الصيانة المجدولة.',
 ['افتح «الجدول والدوريات».','حدد الفترة أو المعدة المطلوب مراجعتها.','راجع تواريخ الاستحقاق وحالات التنفيذ المتاحة.'],
 [q('ما الفرق بين العمل المخطط والمنفذ؟','الجدولة تعني التخطيط للعمل، أما التنفيذ فيُثبت في سجل الصيانة وفق إجراء القسم.')],
 ['لا تعتبر وجود العمل في الجدول دليلًا على تنفيذه.']),
'maintenance/monthly':d('مساعدة تقرير الصيانة الشهري','استعراض أو إعداد ملخص أعمال الصيانة للشهر.',
 ['افتح «تقرير الصيانة الشهري».','اختر الشهر والمحطة أو النطاق المتاح.','راجع السجلات والحالات قبل اعتماد أو تصدير أي ملخص متاح.'],
 [q('ماذا لو كان الشهر بلا سجلات؟','تحقق أولًا من فترة البحث وتوفر البيانات قبل اعتبار الأعمال غير منفذة.')],
 ['راجع الشهر المحدد قبل مشاركة التقرير.']),
'maintenance/import':d('مساعدة استيراد صيانة Excel','استيراد ملفات الصيانة لمن يملك صلاحية الإدارة.',
 ['افتح «استيراد صيانة Excel».','راجع بنية الملف والأعمدة المطلوبة المعروضة في القسم.','نفذ المعاينة أو التحقق إن توفر، ثم راجع النتائج قبل إتمام الاستيراد.'],
 [q('كيف أتجنب تكرار السجلات؟','راجع تنسيق الملف والمحطات والمعدات والتواريخ، ولا تعِد استيراد ملف سبق اعتماده دون تحقق.')],
 ['احتفظ بنسخة من الملف قبل الاستيراد ولا تغيّر أسماء المعدات عشوائيًا.']),
'admin/stations':d('مساعدة إعدادات المحطة','تعديل نموذج المحطة ضمن الصلاحيات الممنوحة للحساب.',
 ['افتح «إعدادات المحطات» أو «إعدادات المحطة».','اختر المؤشر أو القسم المطلوب داخل المحطة المسموح لك بها.','راجع الاسم والوحدة والترتيب والإظهار أو الإخفاء حسب عناصر الإعداد المتاحة.','تحقق من النتيجة قبل حفظ التعديلات.'],
 [q('هل يستطيع حساب المحطة تعديل محطات أخرى؟','لا؛ حساب المحطة مقيد بمحطته فقط.'),q('هل يمكن تغيير وحدات القياس؟','يستطيع الحساب المصرح تعديل حقول النموذج ضمن حدود صلاحياته. تحقق من أثر تغيير الوحدة على القراءات الجديدة.')],
 ['تغيير نموذج المحطة قد يؤثر على نماذج التقارير اللاحقة؛ راجع التعديلات قبل حفظها.']),
'admin/accounts':d('مساعدة إدارة الحسابات','هذه التعليمات متاحة للسوبر أدمن فقط.',
 ['افتح «إدارة الحسابات».','اختر إضافة حساب أو مراجعة حساب موجود.','حدد الدور المناسب والمحطة المرتبطة إذا تطلب نوع الحساب ذلك.','راجع الصلاحيات قبل الحفظ، واستخدم إعادة التعيين بدل محاولة استخراج كلمة مرور قديمة.'],
 [q('هل يستطيع الأدمن العادي إنشاء حسابات؟','لا؛ إدارة الحسابات مقصورة على السوبر أدمن.'),q('هل يمكن معرفة كلمة المرور الحالية؟','لا تُسترجع كلمات المرور القديمة بصيغة مقروءة؛ يمكن تعيين كلمة مرور جديدة وفق الصلاحية.')],
 ['لا تمنح صلاحية السوبر أدمن إلا لمن يحتاجها فعليًا.']),
'admin/audit':d('مساعدة سجل النشاط والمراجعة','مراجعة الإجراءات المسجلة في النظام بواسطة السوبر أدمن.',
 ['افتح «سجل النشاط والمراجعة».','اختر نوع النشاط أو الفترة المتاحة من المرشحات.','افتح تفاصيل السجل المطلوب للتحقق من العملية وتاريخها.'],
 [q('لماذا لا يظهر سجل معين؟','تحقق من فترة البحث ونوع النشاط وعوامل التصفية.')],
 ['استخدم السجل للتحقق من الإجراءات، ولا تستنتج وقوع إجراء بلا دليل مسجل.']),
'admin/data':d('مساعدة إدارة البيانات والنسخ','إرشادات لصفحة البيانات والأرشفة المخصصة للأدوار الإدارية.',
 ['افتح «إدارة البيانات والنسخ».','راجع الإجراء المطلوب ونطاق البيانات والمحطات المتأثرة.','تحقق من أي رسالة تأكيد ومخاطر قبل تطبيق تغييرات على البيانات.'],
 [q('هل النسخة المصدرة تعني وجود نسخ احتياطي كامل قابل للاستعادة؟','ليس بالضرورة؛ تحقق من نوع البيانات التي تشملها النسخة وطريقة استعادتها قبل الاعتماد عليها.')],
 ['لا تنفذ حذفًا أو استيرادًا واسع النطاق دون مراجعة محتوى العملية.'])
};
const isOpen=el=>el&&!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none';
const getRole=()=>{try{return window.WSMaintenanceHost?.role?.()||''}catch{return ''}};
const signedIn=()=>['ready','maintenance'].includes(document.body.dataset.auth);
const routeNow=()=>{
 if(!signedIn()){
  if(isOpen($('recoveryScreen'))||isOpen($('forgotForm')))return 'password-recovery';
  return 'login';
 }
 const role=getRole();
 const maintenance=$('maintenanceModal');
 if(isOpen(maintenance)){
  const selected=maintenance.querySelector('.mw-tab.active[data-tab]');
  const tab=selected?.dataset.tab||'overview';
  const route='maintenance/'+tab;
  if(content[route])return route;
 }
 if(role==='maintenance'){
  const raw=location.hash.match(/^#ws\/(maintenance\/[a-z-]+)/);
  return raw?.[1]||'maintenance/overview';
 }
 let raw=location.hash.match(/^#ws\/([a-z0-9/-]+)/);
 return raw?.[1]&&content[raw[1]]?raw[1]:(role==='station'?'reports':'home');
};
const permitted=(route,role)=>{
 if(!signedIn())return route==='login'||route==='password-recovery';
 if(role==='maintenance')return route.startsWith('maintenance/');
 if(['admin/accounts','admin/audit'].includes(route))return role==='superadmin';
 if(['dashboard','admin/data','maintenance/import'].includes(route))return ['admin','superadmin'].includes(role);
 if(route==='chemicals/entry'&&role==='admin')return false;
 return true;
};
const roleLabel=role=>({'station':'حساب محطة','maintenance':'حساب صيانة','admin':'حساب أدمن','superadmin':'حساب سوبر أدمن'})[role]||'قبل تسجيل الدخول';
const stepsTabs=['steps','faq','issues'];
let activeTab='steps',opened=false,currentRoute='',lastFocus=null,searchValue='';
let launch,overlay,drawer,body;
function demoHtml(doc){
 const items=(doc.demos||[]).map(x=>'<figure class="ws-help-video"><img data-ws-help-media src="/assets/help/'+escape(x.file)+'" alt="'+escape(x.caption)+'" loading="lazy" decoding="async"><figcaption>'+escape(x.caption)+'</figcaption></figure>');
 return items.join('');
}
function selectedDoc(){
 let route=routeNow(),role=getRole();
 if(!permitted(route,role))route=role==='maintenance'?'maintenance/daily':role==='station'?'reports':'home';
 return {route,role,doc:content[route]||content.home};
}
function filterItems(items,search,type){
 if(!search)return items;
 return items.filter(x=>(type==='steps'?x:x.question+' '+x.answer).toLocaleLowerCase('ar').includes(search));
}
function render(){
 const {route,role,doc}=selectedDoc();
 currentRoute=route;
 launch.querySelector('.ws-help-label').textContent=signedIn()?'مساعدة هذه الصفحة':'مساعدة تسجيل الدخول';
 drawer.querySelector('#wsHelpTitle').textContent=doc.title;
 drawer.querySelector('#wsHelpIntro').textContent=doc.intro;
 drawer.querySelector('#wsHelpScope').textContent=roleLabel(role);
 drawer.querySelectorAll('.ws-help-tab').forEach(tab=>{
  const selected=tab.dataset.tab===activeTab;
  tab.setAttribute('aria-selected',String(selected));
  tab.tabIndex=selected?0:-1;
 });
 const search=searchValue.trim().toLocaleLowerCase('ar');
 let html='';
 if(activeTab==='steps'){
  const steps=filterItems(doc.steps,search,'steps');
  html=search?'':'<p class="ws-help-lead">'+escape(doc.intro)+'</p>'+demoHtml(doc);
  if(steps.length)html+='<h3>الخطوات</h3><ol class="ws-help-steps">'+steps.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ol>';
  else html+='<p class="ws-help-empty">لا توجد خطوات مطابقة لبحثك في هذه الصفحة.</p>';
 }else if(activeTab==='faq'){
  const items=filterItems(doc.faq,search,'faq');
  html=items.length?items.map(x=>'<details class="ws-help-details"><summary>'+escape(x.question)+'</summary><p>'+escape(x.answer)+'</p></details>').join(''):'<p class="ws-help-empty">لا توجد أسئلة مطابقة في هذه الصفحة.</p>';
 }else{
  const items=doc.issues.filter(x=>!search||x.toLocaleLowerCase('ar').includes(search));
  html=items.length?'<h3>مشكلات وحلول</h3><ol class="ws-help-steps">'+items.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ol>':'<p class="ws-help-empty">لا توجد مشكلات مطابقة في هذه الصفحة.</p>';
 }
 body.innerHTML=html;
 body.querySelectorAll('[data-ws-help-media]').forEach(img=>img.addEventListener('error',()=>img.closest('figure')?.remove(),{once:true}));
}
function openHelp(tab){
 if(!opened){opened=true;lastFocus=document.activeElement;overlay.classList.add('is-open');drawer.classList.add('is-open');drawer.setAttribute('aria-hidden','false');launch.setAttribute('aria-expanded','true');}
 if(stepsTabs.includes(tab))activeTab=tab;
 render();
 drawer.querySelector('#wsHelpSearch').focus();
}
function closeHelp(){
 opened=false;overlay.classList.remove('is-open');drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');launch.setAttribute('aria-expanded','false');
 if(lastFocus&&document.contains(lastFocus)&&typeof lastFocus.focus==='function')lastFocus.focus();
}
function update(){
 const next=selectedDoc().route;
 if(next===currentRoute)return;
 if(opened){activeTab='steps';searchValue='';drawer.querySelector('#wsHelpSearch').value='';}
 render();
}
function addInlineHelp(){
 const hint=(selector,tab)=>{
  const label=document.querySelector(selector);
  if(!label||label.querySelector('.ws-help-inline'))return;
  const b=document.createElement('button');b.type='button';b.className='ws-help-inline';b.textContent='؟';b.title='شرح هذا الحقل';b.setAttribute('aria-label','شرح هذا الحقل');
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openHelp(tab)});
  label.appendChild(b);
 };
 hint('label[for="loginPassword"]','faq');
 hint('label[for="forgotEmail"]','steps');
 hint('label[for="newRecoveryPassword"]','faq');
}
function start(){
 if($('wsHelpLaunch'))return;
 launch=document.createElement('button');launch.type='button';launch.id='wsHelpLaunch';launch.className='ws-help-launch';
 launch.setAttribute('aria-expanded','false');launch.setAttribute('aria-controls','wsHelpDrawer');
 launch.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/></svg><span class="ws-help-label">مساعدة هذه الصفحة</span>';
 overlay=document.createElement('div');overlay.className='ws-help-backdrop';overlay.id='wsHelpBackdrop';
 drawer=document.createElement('section');drawer.id='wsHelpDrawer';drawer.className='ws-help-drawer';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-hidden','true');drawer.setAttribute('aria-label','مساعدة هذه الصفحة');
 drawer.innerHTML='<header class="ws-help-head"><div class="ws-help-head-top"><div><div class="ws-help-kicker">شركة حلول المياه · مركز المساعدة</div><h2 id="wsHelpTitle" class="ws-help-heading">مساعدة هذه الصفحة</h2><p id="wsHelpIntro" class="ws-help-subtitle"></p></div><button type="button" class="ws-help-close" id="wsHelpClose" aria-label="إغلاق المساعدة">✕</button></div><div class="ws-help-search-wrap"><input type="search" id="wsHelpSearch" class="ws-help-search" placeholder="ابحث داخل مساعدة هذه الصفحة..." autocomplete="off"></div></header><nav class="ws-help-tabs" aria-label="نوع المساعدة" role="tablist"><button class="ws-help-tab" role="tab" data-tab="steps">شرح سريع</button><button class="ws-help-tab" role="tab" data-tab="faq">الأسئلة الشائعة</button><button class="ws-help-tab" role="tab" data-tab="issues">حل المشكلات</button></nav><div class="ws-help-body" id="wsHelpBody" role="tabpanel"></div><footer class="ws-help-footer"><span id="wsHelpScope" class="ws-help-scope"></span><span>المساعدة تتغير مع الصفحة والصلاحية</span></footer>';
 document.body.append(overlay,drawer,launch);body=$('wsHelpBody');
 launch.addEventListener('click',()=>opened?closeHelp():openHelp('steps'));
 overlay.addEventListener('click',closeHelp);
 $('wsHelpClose').addEventListener('click',closeHelp);
 $('wsHelpSearch').addEventListener('input',e=>{searchValue=e.target.value;render();});
 drawer.querySelectorAll('.ws-help-tab').forEach(tab=>tab.addEventListener('click',()=>{activeTab=tab.dataset.tab;render();}));
 document.addEventListener('keydown',e=>{
  if(!opened)return;
  if(e.key==='Escape'){e.preventDefault();closeHelp();return;}
  if(e.key==='Tab'){
   const all=[...drawer.querySelectorAll('button:not([disabled]),input:not([disabled]),summary')].filter(x=>x.getClientRects().length);
   if(!all.length)return;
   const first=all[0],last=all[all.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 window.addEventListener('hashchange',update);
 window.addEventListener('popstate',update);
 const observer=new MutationObserver(()=>{update();addInlineHelp();});
 observer.observe(document.body,{attributes:true,attributeFilter:['data-auth','data-ws-page'],subtree:false});
 const checkScreens=new MutationObserver(()=>{update();addInlineHelp();});
 for(const id of ['recoveryScreen','forgotForm','wsV3PageTitle']){const el=$(id);if(el)checkScreens.observe(el,{attributes:true,attributeFilter:['class'],childList:true,subtree:true})}
 setInterval(update,1250);
 render();addInlineHelp();
 window.WSContextHelp=Object.freeze({open:()=>openHelp('steps'),close:closeHelp,current:()=>selectedDoc().route});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();