# بک‌اند و مرجع API

## ۱. فناوری و فایل‌های اصلی

بک‌اند با FastAPI و Pydantic 2 نوشته شده است.

| فایل | مسئولیت |
|---|---|
| `backend/app/main.py` | ساخت FastAPI، CORS، Lifespan و ثبت Routerها |
| `backend/app/config.py` | خواندن متغیرهای محیطی |
| `backend/app/database.py` | اتصال SQLite، Schema، JSON helper و Audit |
| `backend/app/dependencies.py` | Session فعلی و کنترل Role |
| `backend/app/security.py` | Scrypt، توکن تصادفی و HMAC Token Hash |
| `backend/app/seed.py` | داده‌ی Demo اولیه |
| `backend/app/plc_drivers.py` | Driverهای PLC |
| `backend/app/plc_service.py` | Poll و ذخیره‌ی Telemetry |
| `backend/app/routers/auth.py` | ورود، خروج و تغییر رمز |
| `backend/app/routers/resources.py` | CRUD و اعتبارسنجی موجودیت‌ها |
| `backend/app/routers/operations.py` | تولید، Batch، QC، Workflow و Report Execution |
| `backend/app/routers/telemetry.py` | Live، History، Alarm Evaluation و Edge Ingest |
| `backend/app/routers/edges.py` | ثبت، Heartbeat، فهرست و لغو Edge |
| `backend/app/routers/plc.py` | تست، Poll دستی و Physical Write |
| `backend/app/routers/analytics.py` | خلاصه‌ها، Storage و Audit |
| `backend/app/routers/hmi_media.py` | بارگذاری و ارائه‌ی رسانه‌ی HMI |

## ۲. شروع و اجرای برنامه

نقطه‌ی ASGI:
`app.main:app`

فرمان:
`python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

در شروع:
- Schema ساخته می‌شود.
- Seed در دیتابیس خالی انجام می‌شود.
- Taskهای Demo و PLC Poller بر اساس Environment شروع می‌شوند.

مسیرهای عملیاتی:
- `GET /health`
- `GET /docs` برای Swagger UI
- `GET /openapi.json` برای OpenAPI JSON

## ۳. احراز هویت

### روش

- مسیر ورود: `POST /api/auth/login`
- پس از بررسی رمز، یک توکن Session تصادفی ساخته می‌شود.
- خود توکن در Cookie با نام `scada_session` به مرورگر داده می‌شود.
- مقدار ذخیره‌شده در جدول `sessions`، Hash توکن است، نه خود Secret.
- Cookie دارای `HttpOnly` و `SameSite=Lax` است؛ مقدار `Secure` فقط وقتی فعال می‌شود که درخواست روی HTTPS باشد.
- زمان انقضا با `SCADA_SESSION_TTL_HOURS` تنظیم می‌شود؛ پیش‌فرض ۱۲ ساعت.
- رمز عبور با Scrypt ذخیره می‌شود.

### مسیرها

| Method | Path | شرح |
|---|---|---|
| POST | `/api/auth/login` | ورود و ساخت Session |
| POST | `/api/auth/logout` | حذف Session جاری |
| POST | `/api/auth/change-password` | تغییر رمز با رمز قبلی |
| GET | `/api/auth/me` | اطلاعات کاربر جاری |

## ۴. Roleها و محدوده‌ی Factory

Roleهای تعریف‌شده:
- `Organization Admin`
- `Factory Admin`
- `Engineer`
- `Operator`
- `Production Planner`
- `Quality Control`
- `Production Manager`

رفتار کلی:
- Organization Admin در سطح سازمان داده‌ها را می‌بیند.
- حساب‌های دیگر باید به یک Factory تخصیص داده شوند.
- Factory Admin مدیریت کاربران همان Factory را انجام می‌دهد.
- ایجاد Factory مختص Organization Admin است.
- تعریف/ویرایش PLC و Tag به نقش‌های مدیر سازمان، مدیر کارخانه یا Engineer محدود شده است.
- Operator مجاز به CRUD عمومی منابع نیست؛ بعضی عملیات مشخص مثل ثبت رویداد تولید/بچ طبق Endpoint جداگانه ممکن است مجاز باشد.

کنترل دسترسی در `dependencies.py` و Routerها انجام می‌شود؛ برای تصمیم امنیتی به بررسی Role در Endpoint مربوط تکیه کن، نه صرفاً مخفی بودن دکمه در UI.

## ۵. Bootstrap و مدل Resource

### Bootstrap

`GET /api/bootstrap` یک Snapshot از داده‌های صفحه‌ها برای کاربر جاری می‌دهد. مجموعه‌های بارگیری‌شده شامل:
`factories`, `plcs`, `tags`, `alarms`, `trends`, `reports`, `processes`, `templates`, `orders`, `units`, `qc`, `batches`, `productionRuns`, `workflowTasks`, `products`, `machines`, `prices`, `hmiPages`, `machineCalendars`, `batchConfigs` و `controlPlans`.

داده‌ی کاربران و Edgeها جداگانه در همان Snapshot قرار می‌گیرند.

### CRUD عمومی

| Method | Path | شرح |
|---|---|---|
| GET | `/api/resources/{collection}` | فهرست، با limit/offset و فیلتر مجاز Factory |
| POST | `/api/resources/{collection}` | ایجاد رکورد |
| GET | `/api/resources/{collection}/{record_id}` | دریافت یک رکورد |
| PATCH | `/api/resources/{collection}/{record_id}` | ویرایش |
| DELETE | `/api/resources/{collection}/{record_id}` | حذف |

مجموعه‌های مجاز:
`factories`, `plcs`, `tags`, `alarms`, `trends`, `reports`, `processes`, `templates`, `orders`, `units`, `qc`, `batches`, `productionRuns`, `workflowTasks`, `products`, `machines`, `prices`, `hmiPages`, `machineCalendars`, `batchConfigs`, `controlPlans` و `users`.

رکوردهای بیشتر مجموعه‌ها در جدول عمومی `resources` ذخیره می‌شوند؛ کاربران در جدول مستقل `users` هستند.

### الزامات پایه‌ی ایجاد رکوردها

| Collection | فیلدهای اجباری در Create |
|---|---|
| users | name, email, role |
| factories | name, code |
| plcs | name, protocol, address, factory_id |
| tags | name, plc, type, address, access |
| alarms | name, severity, tag, operator, threshold |
| trends | name, tags, period |
| reports | name, type |
| processes | name, code |
| templates | name, steps |
| workflowTasks | title, flow, from, status |
| orders | code, product, quantity, unit |
| units | code, quantity, unit |
| qc | code, product, machine, decision |
| batches | code, formula, target |
| productionRuns | order, machine, product, target |
| products | code, name, unit |
| machines | name, code |
| prices | kind, code, name, price, currency, unit |
| hmiPages | name, machine, description, layout |
| machineCalendars | machine, year, month, days |
| batchConfigs | code, name, loadcell, formula, hoppers |
| controlPlans | product, process, sampling_interval, sample_count, parameters |

اعتبارسنجی‌های تکمیلی، ارجاع به رکوردهای دیگر، Typeها و حدود HMI در `resources.py` قرار دارند. Payload عمومی به JSON تبدیل می‌شود و در Create حداکثر ۲۴٬۰۰۰ بایت/کاراکتر سریال‌شده مجاز است؛ متن فیلدها نیز محدودیت طول دارد.

## ۶. عملیات کسب‌وکار

### Production Run

| Method | Path |
|---|---|
| POST | `/api/operations/production-runs/{run_id}/start` |
| POST | `/api/operations/production-runs/{run_id}/stop` |
| POST | `/api/operations/production-runs/{run_id}/complete` |
| POST | `/api/operations/production-runs/{run_id}/quantity` |
| GET | `/api/operations/production-runs/{run_id}/events` |

### Batch

| Method | Path |
|---|---|
| POST | `/api/operations/batches/{batch_id}/start` |
| POST | `/api/operations/batches/{batch_id}/stop` |
| POST | `/api/operations/batches/{batch_id}/cancel` |
| POST | `/api/operations/batches/{batch_id}/weighments` |
| GET | `/api/operations/batches/{batch_id}/weighments` |
| POST | `/api/operations/batches/{batch_id}/complete` |

### Workflow، QC و Report

| Method | Path |
|---|---|
| POST | `/api/operations/workflow-tasks/{task_id}/approve` |
| POST | `/api/operations/qc/{qc_id}/decision` |
| POST | `/api/operations/qc/{qc_id}/measurements` |
| POST | `/api/operations/reports/{report_id}/run` |
| GET | `/api/operations/reports/{report_id}/executions` |
| GET | `/api/operations/reports/{report_id}/executions/{execution_id}` |

اجرای Report در نسخه‌ی فعلی یک Snapshot JSON در سمت سرور تولید و ذخیره می‌کند؛ زمان‌بندی خودکار و PDF/XLSX Export در این پیاده‌سازی وجود ندارد.

## ۷. Telemetry و Alarm

| Method | Path | شرح |
|---|---|---|
| GET | `/api/telemetry/latest` | آخرین مقدار، کیفیت و منبع |
| GET | `/api/telemetry/history` | تاریخچه‌ی یک Tag با hours یا seconds |
| POST | `/api/telemetry/edge/ingest` | دریافت Batch از Edge با Header توکن |
| POST | `/api/telemetry/tags/{tag_id}/write` | نوشتن شبیه‌سازی‌شده در دیتابیس |
| WS | `/api/telemetry/ws/live` | Snapshot زنده |

در History، ارسال هم‌زمان `hours` و `seconds` مجاز نیست. محدودیت فعلی: حداکثر ۷۴۴ ساعت یا ۲٬۶۷۸٬۴۰۰ ثانیه و حداکثر ۱۰۰٬۰۰۰ ردیف در هر درخواست.

Alarmها بر اساس مقدار Tag و Rule تعریف‌شده ارزیابی می‌شوند. Transition فعال‌شدن/رفع‌شدن در Audit ثبت می‌شود.

## ۸. Edge API

| Method | Path | شرح |
|---|---|---|
| POST | `/api/edge/register` | ثبت Edge توسط مدیر و صدور توکن یک‌باره |
| GET | `/api/edge` | فهرست Edgeهای مجاز |
| POST | `/api/edge/heartbeat` | Heartbeat با `X-Edge-Token` |
| POST | `/api/edge/{edge_id}/revoke` | لغو Edge |

توکن خام فقط هنگام ثبت برگردانده می‌شود. در دیتابیس Hash آن نگهداری می‌شود؛ پس از Revoke، Token Hash پاک می‌شود.

## ۹. PLC API

| Method | Path | شرح |
|---|---|---|
| GET | `/api/plc/{plc_id}/status` | وضعیت و آخرین Poll |
| POST | `/api/plc/{plc_id}/test` | تست ارتباط |
| POST | `/api/plc/{plc_id}/poll` | خواندن فوری Tagهای نگاشت‌شده |
| POST | `/api/plc/tags/{tag_id}/write` | نوشتن فیزیکی با کنترل‌های ایمنی |

سه Endpoint ارتباط PLC نیازمند Role مهندسی/مدیریتی هستند. نوشتن فیزیکی جدا از Web Tag Write است و به Environment، مجوز PLC، تأیید ایمنی و متن تأیید نیاز دارد. جزئیات در [PLC و Edge](./PLC-EDGE.md) آمده است.

## ۱۰. Analytics و HMI Media

| Method | Path | شرح |
|---|---|---|
| GET | `/api/analytics/summary` | شاخص‌های خلاصه و بازه‌ی زمانی |
| GET | `/api/analytics/storage` | حجم دیتابیس، WAL/SHM و تعداد/بازه‌ی نمونه‌ها |
| GET | `/api/analytics/audit` | رویدادهای Audit |
| POST | `/api/hmi/media` | Upload رسانه‌ی HMI |
| GET | `/api/hmi/media/{media_id}` | دریافت رسانه‌ی مجاز |

## ۱۱. قرارداد خطا و امنیت

- برای Endpointهای کاربر، Cookie نشست لازم است؛ نبود Session معتبر معمولاً `401` می‌دهد.
- نداشتن Role یا Scope مناسب `403` می‌دهد.
- رکورد خارج از Factory مجاز معمولاً به‌صورت `404` پاسخ داده می‌شود تا وجود آن افشا نشود.
- داده‌ی نامعتبر `422`، تضاد وضعیت Workflow `409` و نوع/اندازه‌ی فایل نامجاز `415/413` می‌دهد.
- Endpoint تله‌متری Edge با Header `X-Edge-Token` احراز هویت می‌شود.
- جزئیات Schema درخواست و پاسخ هر مسیر را در `/docs` و OpenAPI بررسی کن؛ این سند فهرست مسیرها و قرارداد رفتاری کلان را پوشش می‌دهد.
