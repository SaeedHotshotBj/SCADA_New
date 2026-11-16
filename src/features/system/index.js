import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, statCard, gradientBanner, tabs, emptyState } from "../../shared/ui.js";

function usersPage() {
  const users = store.list("users");
  const columns = [
    { key: "email", label: "ایمیل" }, { key: "name", label: "نام" }, { key: "role", label: "نقش" },
    { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "فعال" ? "success" : "muted") },
    { key: "access", label: "دسترسی منو" }
  ];
  return `<div class="collection-page" data-collection-name="users" data-edit-action="new-user">${pageHeader("کاربران سازمان", "مدیریت کاربران، نقش‌ها و سطح دسترسی", button("کاربر جدید", "new-user", { icon: "+" }))}${panel("فهرست کاربران", dataTable(columns, users, { actions: true }))}</div>`;
}

function factoriesPage() {
  const rows = store.list("factories");
  const columns = [
    { key: "name", label: "نام کارخانه" }, { key: "code", label: "کد" },
    { key: "edge", label: "Edge" }, { key: "plcs", label: "تعداد PLC" },
    { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "فعال" ? "success" : "muted") }
  ];
  return `<div class="collection-page" data-collection-name="factories" data-edit-action="new-factory">${pageHeader("کارخانه‌ها", "مدیریت کارخانه‌ها و اتصال آن‌ها به Edge", button("کارخانه جدید", "new-factory", { icon: "+" }))}<div class="stats-grid stats-grid-3">${statCard("تعداد کارخانه‌ها", rows.length, "واحد", "blue")}${statCard("کارخانه فعال", rows.filter(x => x.status === "فعال").length, "واحد", "green")}${statCard("PLC متصل", rows.reduce((sum, x) => sum + Number(x.plcs || 0), 0), "دستگاه", "orange")}</div>${panel("فهرست کارخانه‌ها", dataTable(columns, rows, { actions: true }))}</div>`;
}

function edgeStatusPage() {
  return `<div class="edge-page">${gradientBanner("وضعیت Edge", "CENTRAL · central   |   آخرین پیام و وضعیت ارتباط Edge ها", button("به‌روزرسانی", "refresh-demo", { variant: "light" }), "▣")}<div class="stats-grid stats-grid-4">${statCard("MQTT", "غیرفعال", "", "red", "", "اتصال مرکزی")}${statCard("دیسک", "36.2", "%", "green", "", "مصرف ذخیره‌سازی")}${statCard("حافظه", "34.5", "%", "green", "", "RAM مصرفی")}${statCard("CPU", "7.9", "%", "blue", "", "مصرف پردازنده")}</div>${panel("لینک Edge", dataTable([{ key: "factory", label: "کارخانه" }, { key: "edge", label: "Edge" }, { key: "delay", label: "تأخیر" }, { key: "last", label: "آخرین پیام" }, { key: "account", label: "حساب MQTT" }], [{ factory: "تست ارسال به PLC", edge: "EDGE-LOCAL-001", delay: pill("طبیعی", "success"), last: "۱۱:۰۷ · امروز", account: "edge-local-demo" }, { factory: "سیما کابل — دمو", edge: "EDGE-LOCAL-001", delay: "—", last: "—", account: "edge-demo-secondary" }]))}<div class="two-col-grid">${panel("PLC ها", `<div class="panel-metric">${pill("۱ متصل", "success")}</div>${dataTable([{ key: "name", label: "نام" }, { key: "status", label: "وضعیت" }, { key: "address", label: "آدرس" }, { key: "last", label: "آخرین داده" }], [{ name: "PLC شبیه‌ساز کارخانه کابل", status: pill("متصل", "success"), address: "127.0.0.1:1502", last: "۱۱:۰۷" }])}`)}${panel("ذخیره‌سازی", `<div class="storage-list"><div><span>منبع</span><b>POSTGRES</b></div><div><span>Batch نوشته</span><b>۲۹۹٬۹۶۰</b></div><div><span>نمونه نوشته</span><b>۴٬۲۳۱٬۱۸۵</b></div><div><span>DuckDB فایل زنده</span><b>۱</b></div><div><span>Parquet پارتیشن</span><b>۶</b></div></div>`)}</div></div>`;
}

function edgeRegisterPage() {
  return `${pageHeader("ثبت Edge", "برای هر کارخانه یک توکن یکتا بسازید و آن را در نرم‌افزار Edge نصب کنید.")}${panel("ایجاد توکن ثبت", `<form class="inline-form" data-local-form="edge-token"><label class="field field-grow"><span>یادداشت</span><input placeholder="مثلاً Edge خط تولید شماره ۱" required /></label><button class="btn btn-primary" type="submit">ساخت توکن</button></form><p class="muted-note">پس از ساخت، توکن فقط یک‌بار نمایش داده می‌شود. در این نسخه مقدار واقعی صادر نمی‌شود.</p>`)}`;
}

function storagePage() {
  const groups = ["سرعت ماشین‌های خط", "دمای زون‌های اکسترودر روشن", "دمای زون‌های اکسترودر عایق", "قطر خارجی و فشار مذاب", "انرژی و تأسیسات", "قرقره‌پیچ و باسکول"];
  const groupRows = groups.map((name, i) => ({
    name, samples: [146972, 587888, 587888, 587888, 440916, 440916][i],
    size: [27.1, 108.3, 108.3, 108.3, 81.2, 81.2][i] + " مگابایت", period: "۳۰ روز اخیر"
  }));
  const tagRows = store.list("tags").map(tag => ({
    tag: tag.name, trend: pill("سرعت ماشین‌های خط", "success"), samples: "16,655", range: "۳۰ روز"
  }));
  return `<div class="storage-page">
    ${pageHeader("مرکز مدیریت و استفاده از داده", "روی این مرکز تلمتری خام و تاریخچه‌ی روندها نگهداری می‌شود؛ منبع داده در نسخه نمایشی شبیه‌سازی شده است.")}
    ${tabs(["تاریخچه‌ی روندها", "تنظیمات"], 0)}
    <div class="stats-grid stats-grid-4">
      ${statCard("حجم روی دیسک", "632.9", "مگابایت", "blue")}
      ${statCard("نمونه‌های این کارخانه", "3,380,356", "نمونه", "green")}
      ${statCard("رشد روزانه", "383,065", "نمونه", "purple")}
      ${statCard("حجم پیش‌بینی‌شده", "2.1", "گیگابایت", "orange")}
    </div>
    <div class="two-col-grid">
      ${panel("حجم و نحوه‌ی ذخیره", `<div class="storage-list">
        <div><span>محل</span><b>PostgreSQL › scada › trend_samples</b></div>
        <div><span>وضعیت</span>${pill("در حال ذخیره", "success")}</div>
        <div><span>منبع داده</span><b>دریافت از Edge و MQTT</b></div>
        <div><span>قاعده ثبت</span><b>عددی هر ۵ ثانیه · بولی فقط هنگام تغییر</b></div>
        <div><span>نگهداری</span><b>۳۰ روز · آخرین پاکسازی امروز</b></div>
      </div>`)}
      ${panel("داده‌های هر روند", dataTable([
        { key: "name", label: "روند" }, { key: "samples", label: "نمونه" },
        { key: "size", label: "حجم تقریبی" }, { key: "period", label: "بازه" }
      ], groupRows))}
    </div>
    ${panel("تگ‌های هر روند", dataTable([
      { key: "tag", label: "تگ" }, { key: "trend", label: "روند" },
      { key: "samples", label: "۲۴ ساعت اخیر" }, { key: "range", label: "بازه" }
    ], tagRows))}
  </div>`;
}

export function renderSystem(path) {
  switch (path) {
    case "/system/users": return usersPage();
    case "/system/factories": return factoriesPage();
    case "/system/edge": return edgeStatusPage();
    case "/system/edge/register": return edgeRegisterPage();
    case "/system/storage": return storagePage();
    default: return factoriesPage();
  }
}
