import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, dateFilter, statCard, emptyState } from "../../shared/ui.js";

function lastRunFor(reportId) {
  const entry = (store.snapshot().audit || []).find(item =>
    item.action === "report.run" && item.collection === "reports" && item.record_id === reportId
  );
  return entry?.created_at ? new Date(entry.created_at).toLocaleString("fa-IR") : "هنوز اجرا نشده";
}

function reportsPage() {
  const rows = store.list("reports");
  const enabled = rows.filter(row => row.status !== "غیرفعال").length;
  const executed = rows.filter(row => lastRunFor(row.id) !== "هنوز اجرا نشده").length;
  return `<div class="collection-page" data-collection-name="reports" data-edit-action="new-report">
    ${pageHeader("گزارش‌ها", "مدیریت قالب گزارش و اجرای گزارش از داده‌های واقعی ذخیره‌شده در Backend", button("گزارش جدید", "new-report", { icon: "+" }))}
    <div class="stats-grid stats-grid-3">
      ${statCard("قالب‌های گزارش", rows.length.toLocaleString("fa-IR"), "قالب", "blue")}
      ${statCard("قالب فعال", enabled.toLocaleString("fa-IR"), "قالب", "green")}
      ${statCard("قالب دارای اجرا", executed.toLocaleString("fa-IR"), "قالب", "orange")}
    </div>
    ${tabs(["گزارش‌ها", "خروجی‌های اجراشده", "زمان‌بندی"])}
    ${panel("فهرست قالب‌های گزارش", rows.length ? dataTable([
      { key: "name", label: "نام گزارش" },
      { key: "type", label: "دوره تعریف‌شده" },
      { key: "tags", label: "تعداد تگ تعریف‌شده" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") },
      { key: "last_run", label: "آخرین اجرا", render: row => lastRunFor(row.id) },
      { key: "format", label: "خروجی", render: () => "JSON (داده ثبت‌شده)" },
      { key: "run", label: "اجرا", render: row => `<button class="btn btn-primary btn-sm" data-action="run-report" data-id="${row.id}" ${row.status === "غیرفعال" ? "disabled" : ""}>اجرا و دریافت</button>` },
    ], rows, { actions: true }) : emptyState("هنوز قالب گزارشی تعریف نشده است."))}
    <p class="muted-note">اجرای گزارش یک snapshot از اطلاعات فعلی سفارش‌ها، اجراها، تگ‌ها، آلارم‌ها، کنترل کیفیت، بچ‌ها و نمونه‌های تلمتری می‌سازد و فایل JSON را دانلود می‌کند. زمان‌بندی خودکار و خروجی Excel/PDF هنوز فعال نیست.</p>
  </div>`;
}

function processesPage() {
  const rows = store.list("processes");
  const audit = store.snapshot().audit || [];
  const processEvents = audit.filter(item => item.collection === "processes" || item.action?.startsWith("process."));
  const registered = rows.map(row => ({
    ...row,
    registered_at: row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—",
  }));
  return `<div class="collection-page" data-collection-name="processes" data-edit-action="new-process">
    ${pageHeader("فرآیندها و سوابق", "مدیریت تعاریف فرآیند و مشاهده رویدادهای ثبت‌شده", button("فرآیند جدید", "new-process", { icon: "+" }))}
    ${tabs(["رویدادهای ثبت‌شده", "تعاریف فرآیند"])}
    ${panel("رویدادهای فرآیند", processEvents.length ? dataTable([
      { key: "action", label: "رویداد" },
      { key: "record_id", label: "شناسه رکورد" },
      { key: "created_at", label: "زمان", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—" },
    ], processEvents) : emptyState("هنوز رویداد مستقلی برای فرآیندها ثبت نشده است."))}
    ${panel("تعاریف فرآیند", rows.length ? dataTable([
      { key: "name", label: "فرآیند" },
      { key: "code", label: "کد" },
      { key: "fields", label: "تعداد فیلد" },
      { key: "status", label: "وضعیت تعریف" },
      { key: "registered_at", label: "زمان ثبت" },
    ], registered, { actions: true }) : emptyState("هنوز تعریفی برای فرآیندها ثبت نشده است."))}
  </div>`;
}

export function renderReports(path) {
  return path === "/reports/processes" ? processesPage() : reportsPage();
}
