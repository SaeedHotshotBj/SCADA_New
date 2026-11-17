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
  const snapshot = store.snapshot();
  const edges = snapshot.edges || store.list("edgeDevices");
  const factories = store.list("factories");
  const plcs = store.list("plcs");
  const metrics = snapshot.analytics?.metrics || {};
  const rows = edges.map(edge => ({
    factory: factories.find(factory => factory.id === edge.factory_id)?.name || "بدون کارخانه",
    edge: edge.name, status: edge.status,
    last: edge.last_seen || "هنوز Heartbeat دریافت نشده",
    note: edge.metadata?.hostname || edge.metadata?.version || "—",
  }));
  return `<div class="edge-page">${gradientBanner("وضعیت Edge", "وضعیت آخرین Heartbeat دریافت‌شده از Edge", button("به‌روزرسانی", "refresh-demo", { variant: "light" }), "▣")}
    <div class="stats-grid stats-grid-4">${statCard("Edge ثبت‌شده", edges.length, "دستگاه", "blue")}${statCard("آنلاین", edges.filter(x => x.status === "ONLINE").length, "دستگاه", "green")}${statCard("PLC تعریف‌شده", plcs.length, "دستگاه", "orange")}${statCard("نمونه‌های Telemetry", Number(metrics.telemetry_sample_count || 0).toLocaleString("fa-IR"), "نمونه", "purple")}</div>
    ${panel("لینک Edge", rows.length ? dataTable([{ key: "factory", label: "کارخانه" }, { key: "edge", label: "Edge" }, { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "ONLINE" ? "success" : row.status === "REVOKED" ? "danger" : "warning") }, { key: "last", label: "آخرین پیام" }, { key: "note", label: "نسخه / میزبان" }], rows) : emptyState("هنوز Edge در سرور ثبت نشده است."))}
    ${panel("PLC ها", plcs.length ? dataTable([{ key: "name", label: "نام" }, { key: "protocol", label: "پروتکل تعریف‌شده" }, { key: "address", label: "آدرس" }, { key: "status", label: "وضعیت ارتباط", render: () => pill("درایور متصل نیست", "warning") }], plcs) : emptyState("PLC تعریف نشده است."))}
    <div class="insight insight-warning">تعریف PLC در Backend به معنی برقرار بودن ارتباط سخت‌افزاری نیست. درایور Modbus/S7 هنوز Commission نشده است.</div>
  </div>`;
}
function edgeRegisterPage() {
  const factories = store.list("factories");
  const factoryOptions = factories.map(factory => `<option value="${factory.id}">${factory.name}</option>`).join("");
  return `${pageHeader("ثبت Edge", "برای هر کارخانه یک توکن یکتا بسازید و آن را در نرم‌افزار Edge نصب کنید.")}
    ${panel("ایجاد توکن ثبت", `<form class="inline-form" data-local-form="edge-token">
      <label class="field field-grow"><span>نام Edge</span><input name="name" placeholder="مثلاً EDGE-LINE-01" minlength="2" required /></label>
      <label class="field field-grow"><span>کارخانه</span><select name="factory_id" required>${factoryOptions}</select></label>
      <label class="field field-grow"><span>یادداشت</span><input name="note" placeholder="موقعیت یا توضیحات Edge" /></label>
      <button class="btn btn-primary" type="submit">ساخت توکن</button>
    </form><p class="muted-note">توکن واقعی فقط یک‌بار از Backend صادر می‌شود. آن را محرمانه نگه دارید. ثبت Edge هنوز به‌معنی اتصال PLC نیست.</p>`)}
  `;
}
function storagePage() {
  const snapshot = store.snapshot();
  const metrics = snapshot.analytics?.metrics || {};
  const tags = store.list("tags");
  const rows = tags.map(tag => ({ tag: tag.name, type: tag.type, address: tag.address,
    latest: tag.value ?? "—", quality: tag.last_quality || "DEMO" }));
  return `<div class="storage-page">
    ${pageHeader("مرکز مدیریت و استفاده از داده", "آمار از دیتابیس SQLite سمت Backend و نمونه‌های ثبت‌شده خوانده می‌شود.")}
    ${tabs(["تاریخچه‌ی روندها", "وضعیت ذخیره‌سازی"], 0)}
    <div class="stats-grid stats-grid-4">
      ${statCard("تگ‌های ثبت‌شده", Number(metrics.tag_count || tags.length).toLocaleString("fa-IR"), "تگ", "blue")}
      ${statCard("نمونه‌های ذخیره‌شده", Number(metrics.telemetry_sample_count || 0).toLocaleString("fa-IR"), "نمونه", "green")}
      ${statCard("آخرین نمونه", snapshot.analytics?.last_telemetry_at || "—", "", "purple")}
      ${statCard("نوع پایگاه داده", "SQLite", "Backend", "orange")}
    </div>
    ${panel("وضعیت ذخیره‌سازی", `<div class="storage-list">
      <div><span>محل اجرا</span><b>Backend / SQLite</b></div>
      <div><span>وضعیت</span>${pill(snapshot.analytics?.error ? "خطا در دریافت آمار" : "متصل", snapshot.analytics?.error ? "danger" : "success")}</div>
      <div><span>منبع داده</span><b>نمونه‌های Telemetry و عملیات ثبت‌شده</b></div>
      <div><span>نگهداری نمونه‌ها</span><b>طبق پاکسازی دوره‌ای Backend</b></div>
      <div><span>کیفیت</span><b>مقادیر DEMO و Edge با برچسب کیفیت ذخیره می‌شوند</b></div>
    </div>`)}
    ${panel("تگ‌های قابل پایش", rows.length ? dataTable([{ key: "tag", label: "تگ" }, { key: "type", label: "نوع" }, { key: "address", label: "آدرس" }, { key: "latest", label: "آخرین مقدار" }, { key: "quality", label: "کیفیت" }], rows) : emptyState("هنوز تگی تعریف نشده است."))}
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
