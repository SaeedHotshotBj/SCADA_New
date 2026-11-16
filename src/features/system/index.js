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
  const factories = store.list("factories");
  const online = edges.filter(edge => edge.status === "ONLINE").length;
  const columns = [
    { key: "name", label: "نام Edge" },
    { key: "factory_id", label: "کارخانه", render: row => factories.find(factory => factory.id === row.factory_id)?.name || "—" },
    { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "ONLINE" ? "success" : row.status === "REVOKED" ? "danger" : "warning") },
    { key: "last_seen", label: "آخرین Heartbeat", render: row => row.last_seen ? new Date(row.last_seen).toLocaleString("fa-IR") : "دریافت نشده" },
    { key: "version", label: "نسخه", render: row => row.metadata?.version || "—" },
    { key: "hostname", label: "Host", render: row => row.metadata?.hostname || "—" }
  ];
  return `<div class="edge-page">${gradientBanner("وضعیت Edge", "وضعیت واقعی Heartbeat های ثبت‌شده در Backend", button("به‌روزرسانی", "refresh-demo", { variant: "light" }), "▣")}
    <div class="stats-grid stats-grid-4">${statCard("Edge ثبت‌شده", edges.length, "دستگاه", "blue")}${statCard("آنلاین", online, "دستگاه", "green")}${statCard("در انتظار اتصال", edges.filter(edge => edge.status === "PENDING" || edge.status === "DEMO").length, "دستگاه", "orange")}${statCard("قطع / لغوشده", edges.filter(edge => edge.status === "REVOKED" || edge.status === "OFFLINE").length, "دستگاه", "red")}</div>
    ${panel("وضعیت ارتباط Edge", edges.length ? dataTable(columns, edges) : emptyState("هنوز Edge ثبت نشده است. از بخش ثبت Edge یک دستگاه تعریف کنید."))}
    ${panel("وضعیت ارتباط PLC", `<p class="muted-note">وضعیت PLC فقط زمانی واقعی خواهد بود که یک آداپتور پروتکل مشخص و تأییدشده به Backend متصل شود. در این نسخه هیچ اتصال سخت‌افزاری ادعا نمی‌شود.</p>`)}
  </div>`;
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
