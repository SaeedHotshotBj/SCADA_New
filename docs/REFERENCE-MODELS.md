# مرجع مدل‌های داده و وضعیت‌ها

این سند جزئیات ساختار Payloadهای مهم و محدودیت‌های اعتبارسنجی را از `backend/app/routers/resources.py`، `backend/app/routers/operations.py`، Driverها و Schema دیتابیس خلاصه می‌کند.

> نکته: بیشتر Collectionهای کسب‌وکار در جدول عمومی `resources` و در ستون JSON به نام `payload` ذخیره می‌شوند. بنابراین فیلدهای این سند قراردادهای لایه‌ی برنامه هستند، نه ستون‌های مستقل SQLite؛ مگر آنجا که صریحاً جدول جدا ذکر شده باشد.

## ۱. قواعد عمومی Resource

- مدل ورودی `ResourceInput` مقدارهای اضافه را می‌پذیرد (`extra=allow`)، اما `clean_payload` و `validate_references` روی فیلدهای شناخته‌شده اعتبارسنجی اعمال می‌کنند.
- در Create، فیلدهای اجباری هر Collection بررسی می‌شوند.
- کل Payload سریال‌شده حداکثر ۲۴٬۰۰۰ کاراکتر/بایت طبق اندازه‌ی JSON مجاز است.
- رشته‌های فیلدها Trim می‌شوند و طول رشته‌ی منفرد نباید از ۴٬۰۰۰ بیشتر باشد.
- `id`، `password_hash` و `temporary_password` از Payload ورودی کنار گذاشته می‌شوند.
- رکوردهای غیرکاربر با شناسه‌ی تولیدشده توسط سرور در جدول `resources` ذخیره می‌شوند.
- زمان‌های ثبت در سرور با UTC ساخته می‌شوند.
- Update از PATCH استفاده می‌کند و باید Scope کارخانه و مجوز Role را رعایت کند.

## ۲. مدل PLC

### فیلدهای اصلی

| فیلد | کاربرد | اعتبارسنجی/مقدار |
|---|---|---|
| `name` | نام قابل‌نمایش | اجباری |
| `protocol` | پروتکل | `modbus-tcp`، `modbus-rtu`، `s7` یا `simulator` |
| `address` | IP/Port یا پورت سریال | اجباری؛ TCP/S7 آدرس کنترلر، RTU نام COM |
| `factory_id` | مالکیت کارخانه | اجباری و باید Factory موجود باشد |
| `unit` | Modbus Unit ID | ۰ تا ۲۵۵؛ پیش‌فرض Driver برابر ۱ |
| `rack` | S7 Rack | ۰ تا ۷ |
| `slot` | S7 Slot | ۰ تا ۳۱ |
| `poll` | فاصله‌ی Poll | رشته‌ی قابل‌تفسیر مانند `500 ms` یا `1 s`؛ ۰٫۱ تا ۶۰ ثانیه |
| `history_interval` | فاصله‌ی ثبت تاریخچه | رشته‌ی زمان؛ ۱ تا ۶۰ ثانیه در Validator |
| `enabled` | اجازه‌ی Poll فیزیکی | Boolean؛ باید صریحاً true شود |
| `allow_writes` | اجازه‌ی نوشتن فیزیکی | Boolean؛ فقط همراه تأیید ایمنی |
| `safety_confirmed` | ثبت تأیید بررسی ایمنی | Boolean |
| `baudrate` | سرعت RTU | ۳۰۰ تا ۱۱۵۲۰۰ |
| `bytesize` | Data Bits | ۷ یا ۸ |
| `parity` | Parity | `N`، `E` یا `O` |
| `stopbits` | Stop Bits | ۱ یا ۲ |
| `timeout` | Timeout Driver | محدودسازی ۰٫۲ تا ۱۵ ثانیه در Modbus Driver |

### قواعد

- هر PLC باید به یک Factory تعلق داشته باشد.
- اگر `allow_writes=true` باشد، `safety_confirmed=true` نیز باید باشد.
- Polling حلقه‌ای فقط PLCهای فعال با پروتکل فیزیکی را انتخاب می‌کند؛ `simulator` از Poller فیزیکی عبور نمی‌کند.
- مقدار `active` قدیمی نیز در Poller برای سازگاری پذیرفته می‌شود، اما قرارداد توصیه‌شده `enabled` بولی است.
- تست ارتباط به‌تنهایی PLC را برای Polling فعال نمی‌کند.

## ۳. مدل Tag

### فیلدهای اصلی

| فیلد | کاربرد | محدودیت |
|---|---|---|
| `name` | نام تگ | اجباری |
| `plc` | شناسه‌ی PLC مالک | اجباری و باید موجود باشد |
| `type` | نوع داده | `bool`، `int16`، `uint16`، `int32`، `uint32`، `float32`، `string` |
| `address` | آدرس در PLC | اجباری |
| `access` | سطح دسترسی | `read` یا `read_write` |
| `unit` | واحد مهندسی | اختیاری |
| `address_area` | ناحیه Modbus | `auto`، `coil`، `discrete_input`، `input_register`، `holding_register` |
| `address_base` | مبنای Offset | صفر یا یک |
| `bit` | شماره بیت | ۰ تا ۱۵ برای Bit داخل Register |
| `length` | طول داده | Validator عمومی ۱ تا ۲۵۴ |
| `byte_order` | ترتیب بایت | `big` یا `little` |
| `word_order` | ترتیب Word | `big` یا `little` |
| `scale` | ضریب تبدیل | عدد محدود و غیرصفر |
| `offset` | Offset مهندسی | عدد محدود |
| `string_format` | قالب رشته | `raw` یا `s7`؛ قالب s7 فقط برای string با length |
| `value` | مقدار جاری | آخرین مقدار شناخته‌شده |
| `last_quality` | کیفیت آخرین مقدار | GOOD/BAD/DEMO/UNSAMPLED بر اساس مسیر منبع |
| `last_source` | منبع آخرین مقدار | مانند plc:id یا edge:id |
| `last_poll_at` | زمان آخرین به‌روزرسانی | UTC |
| `last_history_at` | زمان آخرین درج تاریخچه | UTC |

### قواعد سازگاری

- PLC انتخابی و Tag باید به یک Factory تعلق داشته باشند.
- برای PLC از نوع S7، ناحیه‌ی Modbus کاربرد ندارد.
- Coil و Discrete Input فقط برای BOOL مجازند.
- ناحیه‌های ورودی Modbus فقط خواندنی‌اند؛ برای نوشتن باید Coil یا Holding Register مناسب انتخاب شود.
- String در Modbus حداکثر ۱۲۰ Register در Driver دارد؛ در حالی که حد عمومی `length` در Resource Validator تا ۲۵۴ است. بنابراین برای Modbus String باید محدودیت Driver (۱۲۰) رعایت شود.
- `string_format=s7` فقط با PLC نوع S7 و طول مشخص استفاده می‌شود.
- برای آدرس‌های چندبایتی، Byte/Word Order باید با دستگاه واقعی تطبیق داده شود.
- تبدیل مقدار مهندسی: `raw × scale + offset`. در نوشتن، تبدیل معکوس انجام می‌شود.
- برای BOOL آدرس Bit مناسب لازم است؛ ناحیه و عرض حافظه باید با نوع داده سازگار باشند.

## ۴. مدل Alarm

فیلدهای الزامی:
`name`، `severity`، `tag`، `operator` و `threshold`.

عملگرهای مجاز:
`>`، `>=`، `<`، `<=`، `==` و `!=`.

- `threshold` باید عدد محدود باشد.
- تگ مرجع باید وجود داشته باشد.
- ارزیابی با مقدار دریافت‌شده‌ی Tag اجرا می‌شود.
- Payload نگهدارنده‌ی وضعیت شامل فیلدهایی مانند `condition_active`، `last_value`، `evaluated_at`، `trigger_count` و زمان‌های Trigger/Resolve است.
- رخدادهای فعال‌شدن و رفع‌شدن در `audit_events` ثبت می‌شوند.
- تأیید Alarm لزوماً به معنای رفع شدن شرط فرآیندی نیست؛ Condition و Status باید جدا تفسیر شوند.

## ۵. مدل Trend و Report

### Trend

فیلدهای Create:
`name`، `tags` و `period`.

`tags` در صفحه‌ی Trend به‌صورت نام/فهرست Tagها مصرف می‌شود و History از API Telemetry خوانده می‌شود. مقدار این فیلد باید با Tagهای واقعی و نام آن‌ها هماهنگ باشد.

### Report

فیلدهای Create:
`name` و `type`.

اجرای Report در نسخه‌ی فعلی Snapshot JSON ایجاد می‌کند. فایل PDF/XLSX یا Scheduler خودکار وجود ندارد.

## ۶. مدل HMI Page

فیلدهای پایه‌ی Create:
`name`، `machine`، `description` و `layout`.

- تم صفحه یکی از `light`، `dark`، `blue` و `industrial` است.
- چیدمان باید آرایه‌ای با حداکثر ۵۰ جزء باشد.
- انواع ویجت با کتابخانه‌ی سمت مرورگر و Validator سمت سرور هماهنگ باشند.
- هر جزء باید `type` معتبر داشته باشد و Bindingهای لازم آن نوع را فراهم کند.
- Tagهای انتخاب‌شده باید موجود، قابل‌دسترسی و از نظر نوع با ویجت سازگار باشند.
- تم جزء می‌تواند `inherit` یا یکی از تم‌های صفحه باشد.
- فونت باید یکی از Tahoma، Segoe UI، Arial، Verdana یا Courier New باشد.
- اندازه‌ی فونت متن ۸ تا ۲۴ و عدد ۱۰ تا ۴۸ است.
- ابعاد/مختصات آزاد کارت از طریق اعتبارسنجی HMI کنترل می‌شوند؛ Grid fieldهای سازگاری قدیمی نیز بررسی می‌شوند.
- هم‌پوشانی کارت‌ها مجاز است.

### Bindingهای متداول

| ویجت | Binding |
|---|---|
| value/status/gauge/indicator/needle/thermometer/chart/write | `tag_id` |
| motor/pump/fan | `run_tag_id` الزامی، `fault_tag_id` و `speed_tag_id` اختیاری |
| conveyor | `run_tag_id` الزامی، `fault_tag_id` اختیاری |
| tank | `level_tag_id` |
| valve | `open_tag_id` الزامی، `fault_tag_id` اختیاری |
| media | بدون Tag Binding |

در HMI، `write` یک کنترل تعاملی است؛ مسیر واقعی نوشتن فقط تحت قفل‌های جداگانه‌ی Physical PLC Write ممکن می‌شود. UI به‌تنهایی مجوز نوشتن ایجاد نمی‌کند.

## ۷. مدل Calendar ماشین

Create نیازمند:
`machine`، `year`، `month` و `days`.

Validator انتظار دارد:
- دقیقاً هفت روز باشد.
- روزهای هفته تکراری نباشند.
- وضعیت کاری هر روز Boolean باشد.
- ساعت شروع، پایان و استراحت در قالب `HH:MM` باشد.
- پایان شیفت و زمان استراحت برای روز فعال معتبر باشند.

## ۸. مدل Batch Config

Create نیازمند:
`code`، `name`، `loadcell`، `formula` و `hoppers`.

- فرمول بین ۱ تا ۲۰ هاپر دارد.
- هر هاپر باید شناسه/کلید، ماده، نسبت و Target معتبر داشته باشد.
- مجموع نسبت مواد باید دقیقاً ۱۰۰ درصد باشد.
- تعداد نمونه بین ۱ تا ۱۰۰ است.
- تلرانس بین صفر تا ۱۰۰ درصد است.
- زمان پایدارسازی بین صفر تا ۶۰۰ ثانیه است.
- اگر `weight_tag_id` استفاده شود، Tag باید عددی، فقط‌خواندنی و متعلق به همان Factory باشد.

## ۹. مدل Control Plan

Create نیازمند:
`product`، `process`، `sampling_interval`، `sample_count` و `parameters`.

- تعداد پارامترهای طرح ۱ تا ۵۰ است.
- `sample_count` بین ۱ تا ۱۰۰۰ است.
- الزام تأیید باید Boolean باشد.
- هر پارامتر باید داده‌ی لازم را داشته باشد.
- حداقل و حداکثر باید عدد معتبر باشند و حداقل از حداکثر بیشتر نباشد.

## ۱۰. User و Factory Scope

### User

جدول مستقل `users` شامل:
`id`، `email`، `name`، `role`، `status`، `factory_id`، `password_hash`، `must_change_password`، `created_at` و `updated_at`.

- Email یکتا و Case-insensitive است.
- Password Hash با Scrypt نگهداری می‌شود.
- Temporary Password در ایجاد کاربر از API برگردانده می‌شود و باید در اولین ورود/فرآیند تعیین‌شده تغییر کند.
- حساب Organization Admin به Factory محدود نیست؛ سایر حساب‌ها باید Factory داشته باشند.

### Factory

Factory در `resources` با Collection برابر `factories` ذخیره می‌شود و حداقل `name` و `code` لازم دارد. ایجاد و ویرایش آن محدود به Organization Admin است.

## ۱۱. وضعیت‌های عملیاتی و گذارها

| موجودیت | وضعیت/گذار | قاعده |
|---|---|---|
| PLC | NOT_TESTED / ONLINE / DEGRADED / OFFLINE / SIMULATOR | وضعیت ارتباط و Poll |
| Edge | PENDING / ONLINE / REVOKED | Heartbeat وضعیت را ONLINE می‌کند؛ Revoke توکن را حذف می‌کند |
| Tag Quality | GOOD / BAD / DEMO / UNSAMPLED | کیفیت مستقل از مقدار است |
| Production Run | در حال تولید → متوقف یا تکمیل‌شده | Start روی Run تکمیل‌شده ممنوع؛ Stop و Complete فقط برای Run فعال |
| Batch | در حال توزین / متوقف‌شده / تکمیل‌شده / لغوشده | شروع مجدد Batch نهایی‌شده ممنوع؛ لغو در حالت فعال ممنوع |
| Workflow Task | در انتظار → تکمیل‌شده | فقط وظیفه‌ی در انتظار تأیید می‌شود |
| QC | قبول / مشروط / رد | Decision از مسیر QC؛ Measurement خارج از حدود FAIL می‌شود |
| Alarm | فعال / تأییدشده / رفع‌شده | Condition و تأیید اپراتور دو مفهوم جدا هستند |

### شرط تکمیل Batch

- Batch باید در وضعیت `در حال توزین` باشد.
- حداقل یک توزین ثبت شده باشد.
- اگر Config هاپرهای مورد انتظار دارد، برای همه‌ی آنها آخرین مقدار لازم ثبت شده باشد.
- نتیجه‌ی آخرین توزین تمام هاپرهای مورد انتظار باید `IN_TOLERANCE` باشد.

## ۱۲. مدل‌های ورودی عملیات

| مدل | فیلدها و حدود |
|---|---|
| `ProductionQuantityRequest` | quantity بزرگ‌تر از صفر تا ۱ میلیارد؛ scrap_quantity از صفر تا ۱ میلیارد؛ unit تا ۲۴ کاراکتر؛ note تا ۱۰۰۰ |
| `HopperWeighment` | hopper_key و material اجباری؛ target_weight بزرگ‌تر از صفر تا ۱۰۰ میلیون؛ actual_weight از صفر تا ۱۰۰ میلیون؛ unit پیش‌فرض kg |
| `BatchWeighmentsRequest` | بین ۱ تا ۱۰۰ آیتم و note حداکثر ۱۰۰۰ |
| `QCMeasurementRequest` | parameter اجباری؛ actual الزامی؛ nominal/minimum/maximum اختیاری؛ unit تا ۲۴ و note تا ۱۰۰۰ |

ثبت توزین Batch در حال حاضر با کیفیت `DEMO` و منبع `manual-demo-entry` ثبت می‌شود. QC نیز ورودی دستی/اپراتوری است مگر Adapter واقعی اضافه شود.

## ۱۳. نکته‌ی مهم در آمار Storage

Endpoint `GET /api/analytics/storage` اندازه‌ی DB، WAL و SHM، تعداد Sample، تعداد Tag و تعداد نمونه به تفکیک Tag را می‌دهد.

در پیاده‌سازی فعلی، مقدار خروجی `retention_days` در این Endpoint به‌صورت ثابت `30` است؛ در حالی که پاک‌سازی واقعی Telemetry از `SCADA_PLC_HISTORY_RETENTION_DAYS` می‌خواند. پس اگر مقدار Environment عوض شود، این فیلد آمار الزاماً مقدار تنظیم‌شده‌ی واقعی را نشان نمی‌دهد. این تفاوت باید در توسعه‌ی آینده اصلاح یا روشن شود.

## ۱۴. فایل‌های مرجع پیاده‌سازی

- `backend/app/database.py`: ستون‌ها، جدول‌ها، Indexها و Audit
- `backend/app/routers/resources.py`: Required fields، Enumها و Validation
- `backend/app/routers/operations.py`: مدل‌های ورودی و انتقال وضعیت‌ها
- `backend/app/plc_drivers.py`: قرارداد آدرس و نوع داده‌ی PLC
- `src/features/live/hmi-widgets.js`: فهرست ویجت و Binding سمت UI
- `backend/app/routers/analytics.py`: آمار Storage و Analytics
