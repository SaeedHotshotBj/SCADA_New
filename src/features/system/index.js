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
  const edges = store.list("edgeDevices");
  const online = edges.filter(edge => edge.status === "ONLINE").length;
  return `<div class="edge-page">
    ${gradientBanner("وضعیت Edge", "وضعیت ثبت‌شده از Heartbeat های دریافت‌شده توسط Backend", button("به‌روزرسانی", "refresh-demo", { variant: "light" }), "▣")}
    <div class="stats-grid stats-grid-4">
      ${statCard("Edge ثبت‌شده", edges.length, "دستگاه", "blue")}
      ${statCard("آنلاین", online, "دستگاه", "green")}
      ${statCard("در انتظار", edges.filter(edge => edge.status === "PENDING").length, "دستگاه", "orange")}
      ${statCard("لغوشده", edges.filter(edge => edge.status === "REVOKED").length, "دستگاه", "red")}
    </div>
    ${panel("وضعیت واقعی ثبت‌شده Edge ها", edges.length ? dataTable([
      { key: "name", label: "نام Edge" },
      { key: "factory_id", label: "شناسه کارخانه" },
      { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "ONLINE" ? "success" : row.status === "REVOKED" ? "danger" : "warning") },
      { key: "last_seen", label: "آخرین Heartbeat", render: row => row.last_seen || "هنوز دریافت نشده" },
      { key: "version", label: "نسخه", render: row => row.metadata?.version || "—" },
      { key: "host", label: "میزبان", render: row => row.metadata?.hostname || "—" },
      { key: "pending", label: "ارسال معوق", render: row => row.metadata?.pending_count ?? "—" }
    ], edges) : emptyState("هنوز هیچ Edge ای ثبت نشده است."))}
  </div>`;
}

function edgeRegisterPage() {
  const factories = store.list("factories");
  return `${pageHeader("ثبت Edge", "برای هر کارخانه توکن یکتا بسازید؛ توکن فقط یک‌بار پس از ثبت نمایش داده می‌شود.")}${panel("ایجاد توکن ثبت", `<form class="inline-form" data-local-form="edge-token">
    <label class="field"><span>نام Edge</span><input name="name" placeholder="EDGE-LINE-01" minlength="2" maxlength="120" required /></label>
    <label class="field"><span>کارخانه</span><select name="factory_id" required>${factories.map(factory => `<option value="${factory.id}">${factory.name}</option>`).join("")}</select></label>
    <label class="field field-grow"><span>یادداشت</span><input name="note" placeholder="مثلاً Edge خط تولید شماره ۱" /></label>
    <button class="btn btn-primary" type="submit">ساخت توکن</button>
  </form><p class="muted-note">توکن به‌صورت Hash ذخیره می‌شود و مقدار خام فقط همین یک‌بار در مرورگر نمایش داده می‌شود.</p>` )}`;
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
