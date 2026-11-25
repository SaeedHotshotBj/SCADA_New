# ماژول‌های کسب‌وکار

این سند مرز کاری ماژول‌های رابط کاربری و مسیرهای Backend متناظر را توضیح می‌دهد. بیشتر داده‌های Master این ماژول‌ها از طریق Collectionهای عمومی `/api/resources/{collection}` نگهداری می‌شوند؛ عملیات انتقال وضعیت از مسیرهای `/api/operations` استفاده می‌کند.

## ۱. سیستم و چندکارخانه‌ای

مسیرها: `/system/factories`، `/system/users`، `/system/edge`، `/system/edge/register` و `/system/storage`.

موجودیت‌ها:
- Factory در Collection `factories`
- User در جدول مستقل `users`
- Edge در جدول مستقل `edge_devices`
- PLC/Tag در Collectionهای `plcs` و `tags`

Scope کاربرهای غیر Organization Admin بر اساس `factory_id` کنترل می‌شود. Factory Admin برای مدیریت کاربران همان Factory محدود است.

## ۲. تجهیزات

مسیرها: `/equipment/plcs` و `/equipment/tags`.

کارکرد:
- تعریف PLC و تنظیم پروتکل
- تعریف Tag و اتصال آن به PLC
- انتخاب Type، Address، Access و واحد مهندسی
- نمایش آخرین کیفیت و وضعیت ارتباط
- Test، Poll دستی و Status PLC

Tag به PLC ارجاع دارد و Factory آن باید با Factory PLC هماهنگ باشد. اعتبارسنجی ارجاعات در `backend/app/routers/resources.py` انجام می‌شود.

## ۳. نمایش زنده، آلارم و Trend

مسیرها:
- `/live/data`
- `/live/alarms`
- `/live/trends`
- `/live/classic`
- `/live/hmi-pages`
- `/live/hmi-designer/new`

موجودیت‌ها:
- `tags`: تعریف Tag و مقدار جاری
- `alarms`: شرط، آستانه و شدت آلارم
- `trends`: گروه Tagهای قابل نمایش در Trend
- `hmiPages`: صفحه‌ی HMI، تنظیمات و Layout

Alarm با مقدار Tag ارزیابی می‌شود و Transition فعال/رفع‌شدن در `audit_events` ثبت می‌شود. تأیید آلارم وضعیت آن را تغییر می‌دهد، اما خود Trigger و Condition مستقل‌اند.

Trend از تاریخچه‌ی Telemetry استفاده می‌کند. محدوده‌ی درخواست History در API محدود است و هر Tag باید نمونه‌ی ثبت‌شده داشته باشد.

## ۴. گزارش و فرآیند

مسیرها: `/reports/list` و `/reports/processes`.

موجودیت‌ها:
- `reports`: تعریف گزارش
- `processes`: تعریف فرآیند
- `report_executions`: سابقه‌ی اجرای گزارش

اجرای Report از `POST /api/operations/reports/{report_id}/run` انجام می‌شود. خروجی فعلی Snapshot JSON سمت سرور است. زمان‌بندی خودکار، PDF و XLSX در نسخه‌ی فعلی ارائه نشده‌اند.

## ۵. گردش‌کار و تأیید

مسیرها:
- `/workflow/inbox`
- `/workflow/templates`

موجودیت‌ها:
- `templates`: قالب و مراحل
- `workflowTasks`: وظایف و وضعیت آنها

تأیید Task از `POST /api/operations/workflow-tasks/{task_id}/approve` انجام می‌شود و رویدادهای مهم Audit می‌شوند. نسخه‌ی فعلی Engine عمومی BPMN یا اجرای خودکار فرایند خارجی نیست؛ Workflowها در دامنه‌ی داده و انتقال وضعیت برنامه هستند.

## ۶. برنامه‌ریزی تولید

مسیرها:
- `/planning/board`
- `/planning/calendar`
- `/planning/operator`
- `/planning/units`
- `/planning/orders`

موجودیت‌ها:
- `orders`: سفارش تولید و وضعیت/مقدار برنامه
- `units`: واحد یا قرقره‌ی تولیدشده
- `machineCalendars`: تقویم شیفت ماشین
- `machines`: ماشین‌ها
- `products`: محصول

این ماژول برنامه‌ی تولید و رکوردهای سفارش را مدیریت می‌کند؛ به‌تنهایی برنامه را به PLC Download نمی‌کند.

## ۷. تولید

مسیرها:
- `/production/run`
- `/production/machines`
- `/production/config`
- `/production/prices`
- `/production/report`

موجودیت‌ها:
- `productionRuns`
- `machines`
- `products`
- `prices`
- `orders`

Run با Start/Stop/Complete تغییر وضعیت می‌دهد. مقدار تولید/ضایعات از عملیات ثبت مقدار به‌صورت رویداد ذخیره می‌شود. در نسخه‌ی فعلی این تغییرات فرمان Start/Stop موتور نیستند و شمارنده‌ی PLC به‌صورت خودکار منبع Quantity نشده است.

## ۸. بچ و توزین

مسیرها:
- `/batch/run`
- `/batch/setup`
- `/batch/report`
- `/batch/compare`

موجودیت‌ها:
- `batches`
- `batchConfigs`
- `batch_events`
- `batch_weighments`

برای هر Batch می‌توان پیکربندی هاپرها، ماده، Target و Tolerance تعریف کرد. ثبت توزین در نسخه‌ی فعلی از ورودی دستی UI انجام می‌شود و کیفیت آن DEMO است. تکمیل Batch کنترل می‌کند که هاپرهای لازم داده داشته باشند و آخرین نتیجه‌ی هر هاپر در محدوده‌ی تلرانس باشد.

اتصال لودسل واقعی و اجرای اتوماتیک توزین، نیازمند Adapter و تست سخت‌افزاری مستقل است.

## ۹. کنترل کیفیت

مسیرها:
- `/quality/dashboard`
- `/quality/pending`
- `/quality/history`
- `/quality/plan`

موجودیت‌ها:
- `qc`
- `controlPlans`
- `qc_measurements`

اندازه‌گیری QC با پارامتر، Nominal، حداقل/حداکثر، مقدار واقعی و واحد ذخیره می‌شود. اگر مقدار خارج از محدوده باشد، نتیجه FAIL ثبت شده و تصمیم QC می‌تواند به رد تغییر کند. این مقادیر در نسخه‌ی فعلی ورودی کاربر هستند؛ اتصال مستقیم ابزار آزمایشگاهی یا دستگاه اندازه‌گیری پیاده‌سازی نشده است.

## ۱۰. هوش تجاری

مسیر: `/bi/dashboard`.

داده از `GET /api/analytics/summary` و منابع اصلی برنامه استخراج می‌شود. خلاصه‌ها، وضعیت Runها، QC و فعالیت اخیر نمایش داده می‌شوند.

شاخصی را که منبع و فرمول معتبر ندارد، KPI اندازه‌گیری واقعی کارخانه تلقی نکن. OEE، انرژی، Scrap و تولید واقعی زمانی معتبر می‌شوند که Signal Map، قواعد محاسبه و اعتبار داده‌ی منبع تعریف و تأیید شده باشند.

## ۱۱. وابستگی‌های بین ماژول‌ها

نمونه‌ی روابط اصلی:
- Factory ← PLC ← Tag
- Tag → Alarm و Trend
- Machine ← Order ← Production Run
- Product → Order و QC
- Batch Config → Batch → Weighments
- Control Plan → QC
- Workflow Task → تأیید انسانی
- HMI Page → Tag Bindings و Media

این روابط در برخی موارد داخل JSON payload قرار دارند؛ بنابراین هنگام تغییر شناسه‌ها یا حذف رکوردهای مرجع باید اعتبارسنجی و رفتار Cascade را بررسی کرد. همه‌ی روابط مانند دیتابیس کاملاً نرمال‌شده با Foreign Key پیاده‌سازی نشده‌اند.
