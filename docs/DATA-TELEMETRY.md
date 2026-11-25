# مدل داده، SQLite و Telemetry

## ۱. دیتابیس فعلی

دیتابیس پیاده‌سازی‌شده در این شاخه SQLite است.

مسیر پیش‌فرض در `backend/app/config.py`:
`backend/data/scada_new.sqlite3`

مسیر با `SCADA_DB_PATH` قابل تغییر است. پوشه‌ی رسانه‌های HMI نیز نسبت به مسیر فایل دیتابیس در پوشه‌ی `hmi-media` نگهداری می‌شود.

اتصال در `backend/app/database.py`:
- Foreign Key enforcement روشن است.
- Journal Mode برابر WAL است.
- Busy Timeout برابر ۱۵٬۰۰۰ میلی‌ثانیه است.
- Timeout اتصال ۱۵ ثانیه است.
- هر Connection در پایان Commit یا Rollback و سپس بسته می‌شود.

## ۲. جدول‌ها

### داده‌ی حساب و Session

| جدول | کاربرد و فیلدهای مهم |
|---|---|
| `users` | حساب: id، email، name، role، status، factory_id، password_hash، must_change_password و زمان‌ها |
| `sessions` | Hash نشست، user_id، expires_at و created_at |

### منبع‌ها و تجهیزات

| جدول | کاربرد و فیلدهای مهم |
|---|---|
| `resources` | رکوردهای عمومی با collection، id، factory_id، payload JSON، created_at و updated_at |
| `edge_devices` | هویت Edge، Factory، status، token_hash، metadata، last_seen و زمان‌ها |

مجموعه‌هایی مثل PLC، Tag، Alarm، Trend، سفارش، محصول، ماشین، صفحه‌ی HMI و غیره در `resources` ذخیره می‌شوند. ساختار Payload برای هر Collection متفاوت است و به‌صورت JSON در یک جدول عمومی نگهداری می‌شود. کاربران، Edge و داده‌های رویدادی/تاریخی جدول‌های مجزا دارند.

### داده‌های زمان‌محور و رویدادها

| جدول | کاربرد و فیلدهای مهم |
|---|---|
| `telemetry_samples` | مقدار Tag: id، factory_id، tag_id، value_json، quality، source، sampled_at |
| `audit_events` | ممیزی: actor_id، action، collection، record_id، details و created_at |
| `production_run_events` | رویداد Run: run_id، event، quantity، unit، details، actor_id و created_at |
| `batch_events` | رویداد Batch: batch_id، event، payload و created_at |
| `batch_weighments` | وزن هر هاپر: batch_id، hopper_key، material، target/actual، tolerance، result، quality، source و actor |
| `qc_measurements` | پارامتر QC، حدود، مقدار واقعی، نتیجه، یادداشت، بازرس و زمان |
| `report_executions` | اجرای Report، status، parameters، result، درخواست‌دهنده و زمان‌ها |

### رسانه و فایل

| جدول | کاربرد |
|---|---|
| `hmi_media` | Metadata فایل؛ خود فایل در پوشه‌ی روی دیسک ذخیره می‌شود |

## ۳. Indexهای فعلی

Indexهای تعریف‌شده در `database.py`:
- `idx_sessions_expiry`
- `idx_resources_collection`
- `idx_telemetry_tag_time` روی `tag_id, sampled_at DESC`
- `idx_hmi_media_factory_time`
- `idx_run_events_time`
- `idx_batch_weighments_time`
- `idx_users_factory`

برای Queryهای پرتکرار آینده، لازم است Query Plan و توزیع واقعی داده بررسی و Indexها براساس بار واقعی طراحی شوند؛ افزودن بی‌هدف Index هم حجم و هزینه‌ی نوشتن را زیاد می‌کند.

## ۴. مدل نگهداری مقدار آخر و تاریخچه

دو مفهوم مستقل وجود دارد:

1. **آخرین مقدار:** در Payload رکورد Tag در جدول `resources` قرار می‌گیرد و برای نمایش مقدار جاری استفاده می‌شود.
2. **تاریخچه:** هر نمونه‌ی ذخیره‌شده یک ردیف مستقل در `telemetry_samples` دارد.

پس Latest با History یکی نیست. به‌روزرسانی مقدار جاری لزوماً به معنی درج یک ردیف تاریخچه در همان لحظه نیست.

## ۵. کیفیت و منبع داده

مقادیر کیفیتی که در کد استفاده می‌شوند:

| Quality | معنی |
|---|---|
| `GOOD` | خواندن موفق PLC یا نمونه‌ی معتبر Edge |
| `BAD` | خواندن ناموفق Tag از PLC؛ مقدار قبلی ممکن است همچنان نمایش داده شود |
| `DEMO` | داده‌ی تولیدشده توسط Simulator یا Web Tag Write نمایشی |
| `UNSAMPLED` | هنوز نمونه‌ی واقعی/ثبت‌شده دریافت نشده |
| `MIXED` | کیفیت آیتم‌های Snapshot یکسان نیست |

منبع‌ها نمونه‌هایی مانند `plc:{id}`، `edge:{id}`، `demo-simulator` و `web-write-simulation` دارند.

در UI نباید مقدار `BAD` یا `UNSAMPLED` را بدون برچسب کیفیت، مقدار اندازه‌گیری معتبر فرض کرد.

## ۶. پریود Poll و پریود History

این تنظیمات در حال حاضر در سطح PLC تعریف می‌شوند، نه به‌صورت Policy مستقل برای هر Tag:

| مفهوم | فیلد | مقدار پیش‌فرض |
|---|---|---|
| فاصله‌ی Poll | `poll` | `1000 ms` |
| فاصله‌ی ثبت تاریخچه | `history_interval` | `5 s` |

`poll` در حلقه‌ی `plc_poll_loop` خوانده می‌شود و مقدار مجاز داخلی بین ۰٫۱ تا ۶۰ ثانیه محدود می‌شود.

`history_interval` در `poll_plc_once` بررسی می‌شود؛ به علت Timestamp با دقت ثانیه، فاصله‌ی مؤثر کمتر از یک ثانیه پشتیبانی عملی ندارد. در هر Poll مقدار جاری Tag به‌روزرسانی می‌شود، اما فقط وقتی فاصله‌ی History سررسید شده باشد ردیف جدید در `telemetry_samples` درج می‌شود.

برای Demo Simulator، حلقه تقریباً هر ثانیه اجرا می‌شود ولی تاریخچه‌ی پیش‌فرض را هر پنج ثانیه درج می‌کند.

Edge Ingest در نسخه‌ی فعلی هر نمونه‌ی دریافتی را ذخیره می‌کند و در آن مسیر، Throttle یا Deadband عمومی اعمال نشده است.

Web Tag Write نیز هر عمل نوشتن شبیه‌سازی‌شده را به‌عنوان یک نمونه ثبت می‌کند.

## ۷. Retention فعلی

متغیر:
`SCADA_PLC_HISTORY_RETENTION_DAYS`

- پیش‌فرض: ۳۰ روز
- حداقل: ۱ روز
- حداکثر: ۳۶۵۰ روز

پاک‌سازی `telemetry_samples` در حلقه‌ی PLC Polling حداکثر هر ساعت اجرا می‌شود؛ حلقه‌ی Demo نیز پاک‌سازی دارد. این مکانیزم، Retention جدول تله‌متری است؛ سیاست حذف عمومی برای همه‌ی رویدادها، Auditها، Report Executionها و فایل‌های HMI در کد فعلی تعریف نشده است.

API تاریخچه در حال حاضر حداکثر ۷۴۴ ساعت یا ۲٬۶۷۸٬۴۰۰ ثانیه را در یک Query می‌پذیرد؛ بنابراین زیاد کردن Retention به‌تنهایی دامنه‌ی Query API را بزرگ‌تر نمی‌کند.

## ۸. محدودیت‌های مدل ذخیره‌سازی فعلی

- تاریخچه به‌صورت ردیف‌های خام در SQLite ذخیره می‌شود.
- جدول تله‌متری به Chunk یا Partition زمانی تقسیم نشده است.
- Continuous Aggregate دقیقه‌ای/ساعتی/روزانه وجود ندارد.
- Deadband و Storage Mode مستقل در سطح Tag پیاده‌سازی نشده است.
- داده‌ی Edge به‌ازای هر Sample ارسالی ذخیره می‌شود.
- Index اصلی تاریخچه روی Tag و زمان است؛ طراحی Multi-Tenant در مقیاس بسیار بزرگ باید دوباره بررسی شود.
- جدول‌های عمومی `resources` روابط بسیاری را در JSON نگه می‌دارند و اعتبارسنجی Relation عمدتاً در لایه‌ی برنامه انجام می‌شود.

این موارد برای مرحله‌ی فعلی ساده‌اند، اما برای تعداد بسیار زیاد Tag و نرخ نمونه‌برداری بالا باید با Benchmark بررسی شوند.

## ۹. محاسبه‌ی رشد حجم

فرمول اولیه‌ی تعداد Sampleها:

```text
Samples per day = Number of tags × 86400 / interval_seconds
```

مثال برای ۱۰۰۰ Tag با فاصله‌ی یک ثانیه:
`86,400,000` نمونه در روز.

این عدد تعداد ردیف است، نه حجم دقیق بایت. فضای واقعی به اندازه‌ی JSON مقدار، Indexها، WAL، سربار SQLite، تعداد منبع‌ها و نوع داده وابسته است.

## ۱۰. اصول پشتیبان‌گیری

- از فایل دیتابیس و پوشه‌ی `hmi-media` هر دو پشتیبان بگیر؛ فایل‌های رسانه داخل SQLite نیستند.
- `-wal` و `-shm` فایل‌های جانبی SQLite در حالت WAL هستند؛ کپی ساده‌ی فایل اصلی هنگام نوشتن فعال، بدون روش Backup سازگار، کافی فرض نشود.
- مخزن فعلی اسکریپت Backup/Restore عملیاتی کامل ندارد.
- بازیابی Backup باید دوره‌ای روی محیط جداگانه تست شود.
