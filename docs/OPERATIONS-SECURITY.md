# نصب، اجرا، تنظیمات و امنیت

## ۱. پیش‌نیازها

طبق CI فعلی:
- Python 3.12
- Node.js 22 برای Checkها
- مرورگر Chromium و Playwright برای E2E مرورگری
- دسترسی شبکه به PLC یا Edge فقط برای تست‌های سخت‌افزاری واقعی

برای اجرای محلی، Python و مرورگر کافی‌اند؛ نصب Node فقط برای اجرای `npm run check` و تست‌های JS/HMI لازم است.

## ۲. راه‌اندازی در Windows با CMD

از Clone جداگانه‌ی شاخه‌ی یکپارچه استفاده کن؛ مسیر کاری مستندشده:

`F:\SCADA_New_backend_integrated+`

### گام ۱: دریافت آخرین کد

```cmd
cd /d "F:\SCADA_New_backend_integrated+"
git status
git pull --ff-only origin backend-integrated
git rev-parse --short HEAD
```

قبل از Pull، وضعیت فایل‌های محلی را بررسی کن؛ تغییر محلیِ ذخیره‌نشده را با Reset پاک نکن.

### گام ۲: ساخت/فعال‌سازی محیط Python

اگر محیط مجازی وجود ندارد:

```cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
py -3.12 -m venv .venv
```

فعال‌سازی:

```cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### گام ۳: ساخت تنظیمات محلی

```cmd
if not exist .env copy .env.example .env
```

فایل `backend/.env` را بررسی کن. مقدار Secret را با یک کلید تصادفی و قوی جایگزین کن. فایل واقعی `.env` نباید وارد Git شود.

### گام ۴: اجرای Backend

در CMD اول:

```cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
.venv\Scripts\activate.bat
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health:
`http://127.0.0.1:8000/health`

Swagger:
`http://127.0.0.1:8000/docs`

### گام ۵: اجرای Frontend

در CMD دوم:

```cmd
cd /d "F:\SCADA_New_backend_integrated+"
py -m http.server 4173 --bind 127.0.0.1
```

آدرس:
`http://127.0.0.1:4173`

برای جلوگیری از مشکل Cookie، هر دو را با Host یکسان باز کن؛ در این مثال هر دو `127.0.0.1` هستند.

## ۳. حساب Demo

در دیتابیس تازه، Seed فقط وقتی اجرا می‌شود که جدول `users` خالی باشد.

- Email: `admin@demo-cable.local`
- Password اولیه: `demo1234`

این اطلاعات فقط برای محیط Demo است. قبل از استفاده از اطلاعات واقعی کارخانه، رمز را تغییر بده و Secret Key منحصربه‌فرد تنظیم کن. اگر دیتابیس از قبل کاربر داشته باشد، Seed مجدداً اجرا نمی‌شود.

## ۴. متغیرهای محیطی

| Variable | پیش‌فرض | کارکرد |
|---|---|---|
| `SCADA_DB_PATH` | `backend/data/scada_new.sqlite3` | مسیر SQLite |
| `SCADA_SECRET_KEY` | کلید توسعه‌ی ناامن | HMAC نشست/توکن؛ باید تعویض شود |
| `SCADA_SESSION_TTL_HOURS` | `12` | عمر نشست |
| `SCADA_DEMO_TELEMETRY` | `true` | اجرای تولیدکننده‌ی داده‌ی نمایشی |
| `SCADA_ALLOW_ORIGINS` | خالی | Originهای CORS با کاما |
| `SCADA_PLC_POLLING_ENABLED` | `true` | فعال‌بودن حلقه‌ی PLC Polling |
| `SCADA_PLC_WRITES_ENABLED` | `false` | قفل اصلی نوشتن فیزیکی PLC |
| `SCADA_PLC_HISTORY_RETENTION_DAYS` | `30` | مدت نگهداری Telemetry |

نکته: روشن بودن `SCADA_PLC_POLLING_ENABLED` باعث Poll شدن همه‌ی PLCها نمی‌شود؛ خود PLC نیز باید صریحاً فعال باشد و پروتکل آن فیزیکی باشد.

## ۵. Check و Test

از ریشه‌ی مخزن:

```cmd
npm run check
```

تست Backend:

```cmd
cd /d "F:\SCADA_New_backend_integrated+\backend"
.venv\Scripts\activate.bat
python -m pip install pytest httpx
set PYTHONPATH=.
python -m pytest -q tests
```

تست HMI مرورگر در CI با Playwright و Chromium اجرا می‌شود. برای اجرای محلی باید Playwright و Chromium نیز نصب شده باشند؛ دستورهای دقیق در Workflow و [سند تست](./TESTING-LIMITATIONS.md) آمده است.

## ۶. امنیت ضروری

- سرور توسعه‌ی Python HTTP Server و Uvicorn را مستقیم روی اینترنت منتشر نکن.
- برای هر محیط عملیاتی HTTPS، Secret قوی، CORS محدود، Firewall، احراز هویت و دسترسی محدود لازم است.
- توکن Edge را فقط در زمان نصب/ثبت منتقل کن؛ آن را در Log یا Screenshot عمومی قرار نده.
- فایل `.env`، دیتابیس واقعی، Tokenها و Dumpهای کاربران را Commit نکن.
- برای دسترسی بین کارخانه‌ها، Role و `factory_id` را سمت سرور کنترل کن؛ کنترل UI کافی نیست.
- نوشتن فیزیکی PLC را خاموش نگه دار، مگر اینکه Risk Assessment و رویه‌ی ایمنی سایت تکمیل شده باشد.
- برای SVGهای HMI، اعتبارسنجی فعلی مفید است ولی جایگزین سیاست کامل امنیت فایل و محدودسازی دسترسی نیست.
- پورت‌های API، فایل‌های HMI Media و دیتابیس باید فقط در محدوده‌ی موردنیاز در دسترس باشند.

## ۷. نگهداری و پشتیبان‌گیری

پشتیبان لازم:
1. فایل SQLite.
2. پوشه‌ی `hmi-media`.
3. فایل تنظیمات محیطی در محل امن و خارج از مخزن.
4. نسخه‌ی نرم‌افزار/Commit فعال.

در حالت WAL، از کپی غیرهماهنگ فایل اصلی دیتابیس هنگام نوشتن فعال خودداری کن. روش Backup سازگار SQLite را اجرا و Restore را در محیط جداگانه آزمایش کن. مخزن فعلی Backup Scheduler یا Restore Wizard عملیاتی ندارد.

## ۸. عیب‌یابی اولیه

| نشانه | بررسی |
|---|---|
| UI وارد Login می‌شود | فعال بودن Backend، Cookie و تطابق Host فرانت‌اند/API |
| خطای 401 | Session منقضی، رمز اشتباه، کاربر غیرفعال یا Cookie ارسال‌نشده |
| خطای 403 | Role یا Factory Scope |
| Tag مقدار ندارد | PLC/Edge، Quality، Mapping، زمان آخرین Poll |
| کیفیت BAD | آدرس، Type، Unit ID، شبکه، Rack/Slot و خطای Driver |
| PLC در فهرست هست اما Poll نمی‌شود | `enabled`، نوع پروتکل و متغیر Polling |
| HMI Media نمایش داده نمی‌شود | مجوز Factory، وجود فایل در `hmi-media` و Metadata دیتابیس |
| فضای دیتابیس رشد می‌کند | آمار `/api/analytics/storage`، تعداد تله‌متری، Retention و اندازه‌ی WAL |
