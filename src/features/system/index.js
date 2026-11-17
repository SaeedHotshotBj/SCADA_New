import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, statCard, gradientBanner, tabs, emptyState } from "../../shared/ui.js";

function usersPage() {
  const users = store.list("users");
  const columns = [
    { key: "email", label: "ایمیل" }, { key: "name", label: "نام" }, { key: "role", label: "نقش" },
    { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "فعال" ? "success" : "muted") },
    { key: "role", label: "نقش و سطح دسترسی" }
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
  return `<div class="collection-page" data-collection-name="factories" data-edit-action="new-factory">${pageHeader("کارخانه‌ها", "مدیریت کارخانه‌ها و اتصال آن‌ها به Edge", button("کارخانه جدید", "new-factory", { icon: "+" }))}<div class="stats-grid stats-grid-3">${statCard("تعداد کارخانه‌ها", rows.length, "واحد", "blue")}${statCard("کارخانه فعال", rows.filter(x => x.status === "فعال").length, "واحد", "green")}${statCard("PLC تعریف‌شده", rows.reduce((sum, x) => sum + Number(x.plcs || 0), 0), "دستگاه", "orange")}</div>${panel("فهرست کارخانه‌ها", dataTable(columns, rows, { actions: true }))}</div>`;
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
    ${panel("وضعیت ارتباط PLC", `<p class="muted-note">تعریف PLC در سامانه به معنی اتصال سخت‌افزاری نیست. تا زمانی که درایور و نقشه آدرس معتبر نصب و راه‌اندازی نشده باشد، وضعیت PLC به‌عنوان اتصال واقعی گزارش نمی‌شود.</p>`)}
  </div>`;
}
function edgeRegisterPage() {
  const factories = store.list("factories");
  return `${pageHeader("ثبت Edge", "برای هر کارخانه یک توکن یکتا بسازید و آن را در نرم‌افزار Edge نصب کنید.")}${panel("ایجاد توکن ثبت", `<form class="inline-form" data-local-form="edge-token"><label class="field"><span>نام Edge</span><input name="name" placeholder="مثلاً EDGE-LINE-01" required /></label><label class="field"><span>کارخانه</span><select name="factory_id" required><option value="">انتخاب کارخانه</option>${factories.map(factory => `<option value="${factory.id}">${factory.name}</option>`).join("")}</select></label><label class="field field-grow"><span>یادداشت</span><input name="note" placeholder="مثلاً Edge خط تولید شماره ۱" /></label><button class="btn btn-primary" type="submit">ساخت توکن</button></form><p class="muted-note">توکن محرمانه فقط یک‌بار نمایش داده می‌شود. آن را در فایل تنظیمات Edge ذخیره کنید.</p>`)}`;
}
function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "۰ بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ${units[index]}`;
}

function storagePage() {
  const storage = store.snapshot().storage || {};
  const byTag = storage.telemetry_by_tag || [];
  const totalSize = storage.total_bytes || 0;
  const databaseSize = storage.database_bytes || 0;
  const walSize = storage.wal_bytes || 0;
  const shmSize = storage.shm_bytes || 0;
  const rows = byTag.map(item => ({
    tag_name: item.tag_name,
    type: item.type,
    unit: item.unit || "—",
    sample_count: Number(item.sample_count || 0).toLocaleString("fa-IR"),
    first_sample: item.first_sample ? new Date(item.first_sample).toLocaleString("fa-IR") : "—",
    last_sample: item.last_sample ? new Date(item.last_sample).toLocaleString("fa-IR") : "—",
  }));
  return `<div class="storage-page">
    ${pageHeader("مرکز مدیریت و استفاده از داده", "آمار واقعی پایگاه داده SQLite و نمونه‌های تلمتری ذخیره‌شده در Backend")}
    <div class="storage-nav"><a class="btn btn-light" href="#/live/trends">مشاهده تاریخچه روندها</a><span class="muted-note">اطلاعات این صفحه از پایگاه داده سرور خوانده می‌شود.</span></div>
    <div class="stats-grid stats-grid-4">
      ${statCard("حجم کل ذخیره‌سازی", formatBytes(totalSize), "", "blue", "", "فایل اصلی + WAL + SHM")}
      ${statCard("نمونه‌های ذخیره‌شده", Number(storage.telemetry_sample_count || 0).toLocaleString("fa-IR"), "نمونه", "green")}
      ${statCard("تگ‌های تعریف‌شده", Number(storage.tag_count || 0).toLocaleString("fa-IR"), "تگ", "purple")}
      ${statCard("تگ دارای تاریخچه", Number(byTag.length).toLocaleString("fa-IR"), "تگ", "orange")}
    </div>
    <div class="two-col-grid">
      ${panel("وضعیت واقعی ذخیره‌سازی", `<div class="storage-list">
        <div><span>موتور پایگاه داده</span><b>${storage.engine || "—"}</b></div>
        <div><span>فایل اصلی</span><b>${formatBytes(databaseSize)}</b></div>
        <div><span>فایل WAL</span><b>${formatBytes(walSize)}</b></div>
        <div><span>فایل SHM</span><b>${formatBytes(shmSize)}</b></div>
        <div><span>سیاست نگهداری نمونه‌ها</span><b>${storage.retention_days ?? "—"} روز</b></div>
        <div><span>حالت داده</span><b>${storage.telemetry_mode || "—"}</b></div>
      </div>`)}
      ${panel("بازه زمانی داده ذخیره‌شده", `<div class="storage-list">
        <div><span>قدیمی‌ترین نمونه</span><b>${storage.oldest_sample_at ? new Date(storage.oldest_sample_at).toLocaleString("fa-IR") : "هنوز داده‌ای ثبت نشده"}</b></div>
        <div><span>جدیدترین نمونه</span><b>${storage.newest_sample_at ? new Date(storage.newest_sample_at).toLocaleString("fa-IR") : "هنوز داده‌ای ثبت نشده"}</b></div>
        <div><span>جمع نمونه‌ها</span><b>${Number(storage.telemetry_sample_count || 0).toLocaleString("fa-IR")}</b></div>
      </div>`)}
    </div>
    ${panel("تاریخچه ذخیره‌شده به تفکیک تگ", rows.length ? dataTable([
      { key: "tag_name", label: "تگ" },
      { key: "type", label: "نوع داده" },
      { key: "unit", label: "واحد" },
      { key: "sample_count", label: "تعداد نمونه" },
      { key: "first_sample", label: "اولین نمونه" },
      { key: "last_sample", label: "آخرین نمونه" },
    ], rows) : emptyState("هنوز هیچ نمونه تلمتری در پایگاه داده ذخیره نشده است."))}
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
