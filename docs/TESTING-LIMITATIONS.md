# تست‌ها، CI و محدودیت‌های تأیید

## ۱. ساختار تست

### Backend

مسیر: `backend/tests`

| فایل | دامنه |
|---|---|
| `test_api.py` | Health، Login/Logout، CRUD، اعتبارسنجی، تله‌متری، Alarm، Edge، Analytics، Report و APIهای اصلی |
| `test_domain.py` | رویدادهای Production، تکمیل Run، پوشش هاپر و تلرانس Batch، اندازه‌گیری و تصمیم QC |
| `test_plc_drivers.py` | Parse آدرس Modbus و S7، Encode/Decode مقدار، ترتیب Byte/Word و رفتار Driver با Fake Client/Memory |

تست Driverها از Client یا حافظه‌ی Fake استفاده می‌کنند؛ این تست‌ها معادل ارتباط با PLC واقعی نیستند.

### Frontend

- `scripts/check.mjs`: Syntax Check و مجموعه‌ای از Regression/Invariantهای استاتیک.
- `scripts/hmi-browser-test.mjs`: آزمون مرورگری Chromium برای رفتارهای HMI، Drag/Resize و سناریوهای مرتبط UI.
- `scripts/modal-browser-fixture.*`: Fixture آزمون رگرسیون Modal با بارگذاری مسیر واقعی برنامه و بررسی تعامل فرم Tag.

## ۲. GitHub Actions

### Backend + Frontend Check

فایل:
`.github/workflows/backend-ci.yml`

- Python 3.12
- Node.js 22
- نصب Requirements و pytest/httpx
- `python -m compileall -q app`
- `PYTHONPATH=. pytest -q tests`
- `node scripts/check.mjs`

Trigger فعلی: Push روی شاخه‌های `backend-api` و `backend-integrated`؛ Pull Request به شاخه‌های `main` و `rebuild-from-video`؛ و Workflow Dispatch.

### HMI Browser E2E

فایل:
`.github/workflows/hmi-browser-e2e.yml`

- Playwright
- نصب Chromium
- اجرای `node scripts/hmi-browser-test.mjs`
- در شکست، Artifactهای تشخیصی ذخیره می‌شوند.

Trigger فعلی: Push روی `backend-integrated`؛ Pull Request به `rebuild-from-video`؛ و Workflow Dispatch.

## ۳. چه چیزی را تست‌ها پوشش می‌دهند؟

تست‌های فعلی بخشی از رفتار برنامه را تأیید می‌کنند:
- ساخت Session و محدودیت دسترسی بدون Login.
- اعتبارسنجی منابع و Tagهای اشتباه.
- رفتار چند جریان اصلی Production/Batch/QC.
- Parse آدرس‌های PLC و تبدیل انواع داده.
- رفتارهای کلیدی HMI در مرورگر.
- Syntax و بعضی Invariantهای استاتیک JavaScript.

## ۴. چه چیزی هنوز تأیید نشده است؟

- اتصال واقعی به PLCهای نصب‌شده در کارخانه (Hardware-in-the-Loop).
- پایداری طولانی‌مدت Polling در شبکه‌ی صنعتی پرنویز.
- بار چند کارخانه و ده‌ها/صدها هزار Tag.
- رفتار در زمان قطع شبکه‌ی Edge و ارسال حجم زیاد داده‌ی عقب‌افتاده.
- Backup/Restore در شرایط عملیاتی و Disaster Recovery.
- آزمون نفوذ و ارزیابی امنیتی مستقل.
- تست Interlock، E-Stop، Fail-safe یا ایمنی ماشین.
- دقت واقعی محاسبات OEE، انرژی، ضایعات و تولید در برابر سیگنال‌های PLC سایت.
- تأیید فرآیند توزین با Loadcell و دستگاه اندازه‌گیری واقعی.

## ۵. اصل تفسیر نتیجه‌ی CI

موفقیت CI یعنی کد با تست‌های نرم‌افزاری تعریف‌شده سازگار است. این نتیجه نباید به‌صورت «PLC واقعی وصل است»، «ماشین آماده‌ی فرمان‌گیری است» یا «سیستم برای بهره‌برداری صنعتی Commission شده» تفسیر شود.

برای تست عملیاتی، ابتدا محیط Bench ایزوله، Signal Map تأییدشده، روش Safe State و ثبت نتیجه‌ی هر تست لازم است.
