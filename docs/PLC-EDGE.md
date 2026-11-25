# PLC، Tag Mapping و Edge

## ۱. پروتکل‌های پشتیبانی‌شده

مقادیر مجاز فیلد `plcs.protocol`:
- `modbus-tcp`
- `modbus-rtu`
- `s7`
- `simulator`

Driverها در `backend/app/plc_drivers.py` قرار دارند و Polling در `backend/app/plc_service.py` انجام می‌شود.

## ۲. تعریف PLC

اطلاعات اصلی شامل نام، پروتکل، آدرس، Factory و تنظیمات وابسته به پروتکل است.

### Modbus TCP
- آدرس Host یا Host:Port
- پورت پیش‌فرض ۵۰۲
- Unit ID از `unit` یا `unit_id` خوانده می‌شود؛ پیش‌فرض ۱
- Timeout قابل تنظیم است و در Driver بین ۰٫۲ تا ۱۵ ثانیه محدود می‌شود.

### Modbus RTU
- `address` به‌عنوان نام پورت سریال مانند COM3
- `baudrate`، `bytesize`، `parity`، `stopbits` و `timeout`
- نیازمند پورت سریال واقعی/درایور مناسب سیستم‌عامل و `pySerial` است.

### Siemens S7
- آدرس IP PLC
- Rack و Slot؛ مقادیر پیش‌فرض رایج باید با سخت‌افزار تأیید شوند.
- پورت S7 معمولاً ۱۰۲ است.
- برای S7-1200، تنظیمات PUT/GET و دسترسی DB باید در TIA Portal و با پروژه‌ی واقعی بررسی شوند.

## ۳. آدرس‌های Modbus

Driver از Referenceهای پنج‌رقمی و Offset با Area صریح پشتیبانی می‌کند.

| Reference نمونه | Area | Offset پایه |
|---|---|---|
| `00001` | Coil | 0 |
| `10001` | Discrete Input | 0 |
| `30001` | Input Register | 0 |
| `40001` | Holding Register | 0 |

Aliasهای صریح نیز پشتیبانی می‌شوند:
- `COIL:n`
- `DI:n`
- `IR:n`
- `HR:n`

فیلدهای کمکی:
- `address_area` یا `area`
- `address_base` برای Offset با مبنای ۰ یا ۱
- `bit` برای انتخاب Bit در Register
- `byte_order` و `word_order` برای داده‌های چندبایتی

Coil و Discrete Input فقط برای BOOL استفاده می‌شوند. Input Register و Discrete Input ورودی/Read-only هستند.

## ۴. انواع داده‌ی Tag

نوع‌های مجاز:
- `bool`
- `int16`
- `uint16`
- `int32`
- `uint32`
- `float32`
- `string`

در Modbus، داده‌ی ۳۲ بیتی معمولاً دو Register می‌خواهد. ترتیب Byte و Word باید با PLC/دستگاه تطبیق داده شود.

برای تگ می‌توان `scale` و `offset` تعریف کرد:
`engineering_value = raw_value × scale + offset`

در نوشتن، تبدیل معکوس انجام می‌شود. Scale صفر مجاز نیست و مقادیر NaN/Infinity رد می‌شوند.

## ۵. آدرس‌های Siemens S7

الگوهای پشتیبانی‌شده در Parser:
- `DB5.DBD4`
- `DB7.DBW2`
- `DB5.DBX0.0`
- `M10.0`
- `MW10`
- `I0.0`
- `Q0.0`

عرض X برای Bit، B برای Byte، W برای Word و D برای Double Word استفاده می‌شود. برای BOOL آدرس Bit لازم است. نوع Tag و عرض آدرس باید سازگار باشد.

### STRING در S7

- برای String بومی S7، `type=string` و `string_format=s7` استفاده می‌شود.
- آدرس از Byte داخل DB شروع می‌شود، مانند `DB5.DBB0`.
- طول بیشینه باید مشخص شود.
- Driver Header دو‌بایتی Max Length/Current Length مربوط به STRING بومی را مدیریت می‌کند.
- برای داده‌ی Byte خام، `string_format=raw` است.

در Modbus، طول String برحسب تعداد Register شانزده‌بیتی است؛ نه تعداد Byte.

## ۶. چرخه‌ی Polling

1. حلقه‌ی `plc_poll_loop` فهرست PLCها را بررسی می‌کند.
2. فقط PLCهای دارای `enabled=true` یا `active` معادل true و پروتکل فیزیکی وارد Poll می‌شوند.
3. زمان Poll از فیلد `poll` خوانده می‌شود.
4. `poll_plc_once` تمام Tagهای متعلق به همان PLC و Factory را می‌خواند.
5. برای خواندن موفق، آخرین مقدار، `last_source`، `last_quality=GOOD` و `last_poll_at` به‌روزرسانی می‌شود.
6. برای خطا، کیفیت `BAD` و متن خطا ثبت می‌شود؛ آخرین مقدار قبلی حفظ می‌شود.
7. در سررسید `history_interval`، نمونه‌ی GOOD یا BAD در `telemetry_samples` ثبت می‌شود.
8. وضعیت PLC بر اساس تعداد Tagهای سالم تعیین می‌شود:
   - همه سالم: `ONLINE`
   - بخشی سالم: `DEGRADED`
   - هیچ‌کدام سالم نیست: `OFFLINE`

### تست و خواندن دستی

- `POST /api/plc/{id}/test`: تست ارتباط، بدون نوشتن به PLC.
- `POST /api/plc/{id}/poll`: خواندن فوری Tagهای PLC.
- `GET /api/plc/{id}/status`: وضعیت و آخرین خطا/موفقیت.

ابتدا Test Connection و سپس Read Now انجام بده. فعال کردن Polling پس از تأیید مستقل آدرس، نوع، Signedness، Byte/Word Order، Scale و مقدار مهندسی انجام شود.

## ۷. Edge

ثبت Edge از `POST /api/edge/register` انجام می‌شود و فقط مدیر سازمان یا مدیر کارخانه مجاز است.

در ثبت:
- Edge به یک Factory متصل می‌شود.
- Token تصادفی ساخته می‌شود.
- Token خام فقط یک بار در پاسخ برگردانده می‌شود.
- Hash Token در دیتابیس ذخیره می‌شود.

Heartbeat:
`POST /api/edge/heartbeat` با Header `X-Edge-Token`.

ارسال تله‌متری:
`POST /api/telemetry/edge/ingest` با همان Header و Batch از Sampleها.

سرور مالکیت Factory را کنترل می‌کند؛ Edge نمی‌تواند برای Tag کارخانه‌ی دیگر داده بفرستد. Timestamp نمونه باید Timezone داشته باشد و در سرور به UTC تبدیل می‌شود.

لغو:
`POST /api/edge/{edge_id}/revoke`، وضعیت را REVOKED می‌کند و Token Hash را حذف می‌کند.

## ۸. نوشتن Tag؛ دو مسیر کاملاً متفاوت

### Web Tag Write / Simulation

`POST /api/telemetry/tags/{tag_id}/write`

- مقدار در رکورد Tag و SQLite ذخیره می‌شود.
- یک Sample با Quality برابر DEMO و Source برابر `web-write-simulation` ثبت می‌شود.
- پاسخ `execution_mode=SIMULATION` دارد.
- این مسیر هیچ فرمانی به PLC فیزیکی نمی‌فرستد.

### Physical PLC Write

`POST /api/plc/tags/{tag_id}/write`

همه‌ی شروط زیر لازم‌اند:
1. `SCADA_PLC_WRITES_ENABLED=true` در محیط سرور.
2. PLC فیزیکی فعال باشد.
3. همان PLC دارای `allow_writes=true` باشد.
4. `safety_confirmed=true` برای همان PLC ثبت شده باشد.
5. Tag دارای `access=read_write` باشد.
6. کاربر نقش Organization Admin، Factory Admin یا Engineer داشته باشد.
7. عبارت دقیق `WRITE TO PLC` در Confirmation ارسال شود.
8. Driver نوشتن را انجام دهد و Read-back Verification موفق شود.

پس از موفقیت، مقدار، کیفیت GOOD، Source و Audit ثبت می‌شود. در خطا، API پاسخ خطا می‌دهد و موفقیت را اعلام نمی‌کند.

**هشدار:** این قفل‌ها جایگزین مدار Safety، Interlock، E-Stop، Risk Assessment و Commissioning نیستند. نوشتن روی ماشین در حال کار بدون رویه‌ی ایمنی مستند ممنوع است.

## ۹. چک‌لیست راه‌اندازی PLC واقعی

1. مدل PLC، IP/Port یا COM، Unit ID و پروتکل را تأیید کن.
2. PLC و سرور را در شبکه‌ی قابل مسیریابی قرار بده.
3. Tagها را با Address، Data Type، Access، Scale و Byte/Word Order صحیح بساز.
4. ابتدا Test Connection را اجرا کن.
5. Read Now را انجام بده و مقدار را با ابزار رسمی سازنده یا HMI مرجع مقایسه کن.
6. فقط بعد از تأیید، PLC Polling را فعال کن.
7. برای شروع، نوشتن فیزیکی خاموش بماند.
8. بعد از پایداری Read، کیفیت BAD، قطع ارتباط، Reconnect و رفتار Fail-safe را تست کن.

## ۱۰. محدودیت‌های فعلی ارتباط صنعتی

- تست CI از PLC فیزیکی واقعی یا سخت‌افزار در Loop استفاده نمی‌کند.
- آدرس و نوع داده برای سایت واقعی باید با نقشه‌ی رجیستر و TIA Portal تأیید شوند.
- عملیات Production Run و Batch فرمان PLC نیستند.
- توزین هاپر فعلی دستی/DEMO است، مگر اینکه Adapter واقعی جداگانه توسعه و Commission شود.
- منطق Recipe، Interlock، Counter capture و محاسبه‌ی OEE/انرژی نیازمند Signal Map و منطق سایت‌محور است.
