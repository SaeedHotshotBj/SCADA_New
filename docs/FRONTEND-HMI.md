# فرانت‌اند و HMI

## ۱. ساختار فرانت‌اند

فرانت‌اند در نسخه‌ی فعلی با JavaScript بومی و ES Modules اجرا می‌شود؛ ابزار Build یا Bundler در `package.json` تعریف نشده است. فایل `index.html` نقطه‌ی ورود است و `styles/app.css` قالب کلی RTL، پوسته‌ی برنامه و اجزای HMI را تأمین می‌کند.

| مسیر | مسئولیت |
|---|---|
| `src/app/main.js` | Bootstrap UI، Event Delegation، اتصال Live و مدیریت Modal |
| `src/app/router.js` | انتخاب Renderer صفحه با Hash route |
| `src/app/actions.js` | عملیات فرم‌ها، جدول‌ها، Modalها و Commandهای UI |
| `src/app/action-events.js` | تشخیص Action مجاز از کلیک؛ جلوگیری از تبدیل کلیک فیلد فرم به Action |
| `src/core/navigation.js` | تعریف گروه‌ها و مسیرهای منو |
| `src/core/format.js` | Escape و توابع قالب‌بندی عمومی |
| `src/layouts/shell.js` | Sidebar، Header و قاب مشترک |
| `src/shared/ui.js` | جدول، کارت، دکمه، ورودی، نمودار و اجزای مشترک |
| `src/services/api-client.js` | ارتباط با Backend |
| `src/services/demo-store.js` | State و Hydration داده از API |
| `src/features/*` | Rendererهای مستقل ماژول‌ها |
| `styles/app.css` | استایل و Responsive UI |

## ۲. مسیرها و ماژول‌های رابط کاربری

مسیریابی از Hash مرورگر استفاده می‌کند. مسیرها در `src/core/navigation.js` تعریف می‌شوند و `src/app/router.js` آنها را به Renderer ماژول متناظر می‌فرستد.

| گروه | مسیرهای اصلی | کاربرد |
|---|---|---|
| سیستم | `/system/factories`، `/system/users`، `/system/edge`، `/system/edge/register`، `/system/storage` | کارخانه، کاربران، Edge و آمار ذخیره‌سازی |
| BI | `/bi/dashboard` | شاخص‌ها، وضعیت‌ها و فعالیت‌های اخیر |
| تجهیزات | `/equipment/plcs`، `/equipment/tags` | تعریف PLC و نگاشت Tag |
| نمایش زنده | `/live/data`، `/live/hmi-pages`، `/live/hmi-designer/new`، `/live/classic`، `/live/alarms`، `/live/trends` | پایش، HMI، آلارم و Trend |
| گزارش/فرآیند | `/reports/list`، `/reports/processes` | تعریف گزارش و فرآیند |
| گردش‌کار | `/workflow/inbox`، `/workflow/templates` | کارتابل و قالب Workflow |
| برنامه‌ریزی | `/planning/board`، `/planning/calendar`، `/planning/operator`، `/planning/units`، `/planning/orders` | برنامه تولید، تقویم، سفارش و واحد |
| کیفیت | `/quality/dashboard`، `/quality/pending`، `/quality/history`، `/quality/plan` | داشبورد و سوابق QC |
| تولید | `/production/run`، `/production/machines`، `/production/config`، `/production/prices`، `/production/report` | اجرای تولید، ماشین، قیمت و گزارش |
| بچ | `/batch/run`، `/batch/setup`، `/batch/report`، `/batch/compare` | اجرای بچ، تنظیم فرمول و مقایسه |

## ۳. چرخه‌ی داده در مرورگر

1. `initialize()` در `src/app/main.js` اجرا می‌شود.
2. بعد از ورود، `store.initialize()` داده‌ی اصلی را از `/api/bootstrap` می‌گیرد.
3. وضعیت Tagها و خلاصه‌ی Telemetry از API دریافت و در Store سمت مرورگر Hydrate می‌شود.
4. رویداد `scada:state-changed` باعث Render مجدد می‌شود.
5. در مسیرهای نیازمند Live، WebSocket برقرار می‌شود و مقادیر دریافتی به Tagهای Store اعمال می‌شوند.
6. صفحه‌ی جاری دوباره Render یا بخش‌های زنده‌ی HMI به‌روزرسانی می‌شوند.

`sessionStorage["scada-demo-auth"]` یک نشانگر سمت مرورگر برای کنترل ورود به صفحه‌هاست؛ مرجع امنیتی واقعی، Session Cookie و احراز هویت Backend است.

## ۴. API Client

فایل `src/services/api-client.js` مقدار Base URL را به این شکل انتخاب می‌کند:

- اگر `window.SCADA_API_BASE` تنظیم شده باشد، همان استفاده می‌شود.
- در غیر این صورت Host فعلی مرورگر با پورت `8000` استفاده می‌شود.

برای ارتباط محلی، فرانت‌اند و API را با Host یکسان اجرا کن؛ مثلاً هر دو با `127.0.0.1`. ترکیب `localhost` و `127.0.0.1` می‌تواند در رفتار Cookie تفاوت ایجاد کند.

## ۵. کتابخانه‌ی ویجت‌های HMI

کتابخانه در `src/features/live/hmi-widgets.js` تعریف شده است.

| نوع فنی | نام نمایشی/کاربرد |
|---|---|
| `value` | باکس عددی |
| `indicator` | چراغ وضعیت |
| `status` | وضعیت متنی |
| `gauge` | گیج نیم‌دایره |
| `needle` | نشانگر عقربه‌ای |
| `thermometer` | دماسنج |
| `chart` | نمودار روند |
| `motor` | موتور با RUN، FAULT و سرعت اختیاری |
| `pump` | پمپ |
| `fan` | فن |
| `conveyor` | نوار نقاله |
| `tank` | مخزن و سطح |
| `valve` | شیر |
| `write` | کنترل تعاملی Tag |
| `media` | تصویر، SVG، GIF/WebP یا ویدئو |

Bindingهای هر ویجت نیز در `HMI_BINDINGS` تعریف شده‌اند. برای مثال، `chart` به Tag عددی نیاز دارد؛ `motor` از Tag وضعیت RUN و Tagهای اختیاری خطا/سرعت استفاده می‌کند؛ و `tank` به Tag عددی سطح متصل می‌شود.

## ۶. تم، تایپوگرافی و ظاهر

تم‌های صفحه:
- `light`
- `dark`
- `blue`
- `industrial`

هر ویجت می‌تواند از تم صفحه پیروی کند (`inherit`) یا تم خودش را انتخاب کند.

فونت‌های مجاز: Tahoma، Segoe UI، Arial، Verdana و Courier New.

محدوده‌ی اندازه‌ی فونت در تنظیمات:
- متن: ۸ تا ۲۴ پیکسل
- عدد: ۱۰ تا ۴۸ پیکسل

برای کارت و نمودار، رنگ پس‌زمینه‌ی سفارشی Hex از نوع `#RRGGBB` پذیرفته می‌شود. نمودار همچنین رنگ خط سفارشی، عرض خط، Smoothness، Fill Opacity، رنگ و اندازه‌ی مقدار، Grid Opacity، تعداد خطوط Grid، شدت سطح و Glow دارد. محدودیت‌ها و Defaultهای دقیق در ثابت‌های `hmi-widgets.js` و اعتبارسنجی متناظر در `backend/app/routers/resources.py` قرار دارند.

## ۷. اندازه و موقعیت کارت‌ها

- Canvas طراحی HMI عرض مرجع ۱۲۰۰ پیکسل دارد.
- هندسه‌ی آزاد کارت با `x`، `y`، `width` و `height` نگهداری می‌شود.
- توابع Pointer Gesture برای Drag و Resize در `hmi-designer.js` و `hmi-widgets.js` هستند.
- داده‌ی هندسه در ذخیره‌ی صفحه‌ی HMI به Backend ارسال و در آنجا اعتبارسنجی می‌شود.
- هم‌پوشانی کارت‌ها در طراحی فعلی مجاز است.
- توابع Grid قدیمی همچنان برای نرمال‌سازی/سازگاری داده‌های قدیمی موجودند.

## ۸. رفتار نمودار HMI و معنای حالت یک‌ثانیه‌ای

بازه‌های تعریف‌شده برای نمودار:
`1`، `5`، `10`، `30`، `60`، `300`، `600`، `900`، `1800`، `3600`، `21600`، `43200` و `86400` ثانیه.

نکته‌ی مهم:
- گزینه‌ی یک‌ثانیه‌ای با عنوان Live برای ۶۰ ثانیه‌ی اخیر در نظر گرفته شده است.
- بافر Live نمودار در مرورگر نگهداری می‌شود و محدودیت آن ۶۰ ثانیه و حداکثر ۹۰ نمونه برای هر Tag است.
- این بافر حافظه‌ای معادل ذخیره‌ی پایدار هر نمونه در دیتابیس نیست.
- نمودارهای بازه‌ی تاریخی از API تاریخچه استفاده می‌کنند؛ در سمت PLC، پریود پیش‌فرض ذخیره‌ی تاریخچه `5 s` است.
- WebSocket با فاصله‌ی یک یا پنج ثانیه Snapshot می‌فرستد؛ Polling واقعی PLC تنظیم مستقل خودش را دارد.

بنابراین «تازه‌سازی یک‌ثانیه‌ای HMI»، «پریود Polling PLC» و «پریود ذخیره‌ی تاریخچه» سه تنظیم متفاوت‌اند.

## ۹. رسانه‌ی HMI

API رسانه:
- `POST /api/hmi/media` برای Upload
- `GET /api/hmi/media/{media_id}` برای نمایش

فرمت‌ها: PNG، JPEG، GIF، WebP، SVG، MP4 و WebM.

حداکثر حجم فایل: ۶۴ مگابایت. فایل در پوشه‌ی `hmi-media` کنار دیتابیس نگهداری می‌شود؛ اطلاعات آن در جدول `hmi_media` است. SVG قبل از ذخیره از نظر بعضی عناصر و ارجاع‌های اجرایی/خارجی بررسی می‌شود.

## ۱۰. نکات توسعه‌ی فرانت‌اند

- Renderer جدید را در `src/features/<feature>/index.js` اضافه کن.
- مسیر منو را در `src/core/navigation.js` تعریف کن.
- نگاشت مسیر به Renderer را در `src/app/router.js` به‌روزرسانی کن.
- برای ارتباط سرور از API Client و Store موجود استفاده کن؛ منطق Backend را داخل Renderer تکرار نکن.
- Actionهای تعاملی را از مسیر Event Delegation موجود عبور بده.
- فیلدهای فرم نباید به‌عنوان دکمه یا Action والد تفسیر شوند.
- CSS جدید را تا حد امکان در محدوده‌ی کلاس‌های همان ماژول نگه دار تا تم عمومی آسیب نبیند.
