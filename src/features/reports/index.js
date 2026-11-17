import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, dateFilter, statCard, lineChart, emptyState } from "../../shared/ui.js";

function reportsPage() {
  const rows = store.list("reports");
  const executions = store.list("reportExecutions");
  const latest = executions[0];
  return `<div class="collection-page" data-collection-name="reports" data-edit-action="new-report">
    ${pageHeader("گزارش‌ها", "قالب‌های گزارش و اجرای گزارش از اطلاعات ذخیره‌شده در Backend", button("گزارش جدید", "new-report", { icon: "+" }))}
    <div class="stats-grid stats-grid-3">${statCard("قالب‌های گزارش", rows.length, "قالب", "blue")}${statCard("قالب فعال", rows.filter(x => x.status !== "غیرفعال").length, "قالب", "green")}${statCard("اجرای دریافت‌شده در این نشست", executions.length, "اجرا", "orange")}</div>
    ${tabs(["گزارش‌ها", "خروجی‌های آماده", "زمان‌بندی"])}
    ${panel("فهرست گزارش‌ها", rows.length ? dataTable([
      { key: "name", label: "نام گزارش" }, { key: "type", label: "دوره اجرا" }, { key: "tags", label: "تعداد تگ" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") },
      { key: "last_run_at", label: "آخرین اجرا", render: row => row.last_run_at || "—" },
      { key: "format", label: "خروجی", render: () => "JSON" },
      { key: "run", label: "اجرا", render: row => `<button class="btn btn-primary btn-sm" data-action="run-report" data-id="${row.id}">اجرای گزارش</button>` }
    ], rows, { actions: true }) : emptyState("قالب گزارشی ثبت نشده است."))}
    ${panel("آخرین خروجی‌های همین نشست", executions.length ? dataTable([{ key: "report_id", label: "شناسه قالب" }, { key: "id", label: "شناسه اجرا" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "success") }, { key: "created_at", label: "زمان اجرا" }, { key: "download", label: "دریافت", render: row => `<button class="btn btn-light btn-sm" data-action="download-report-execution" data-id="${row.id}">دانلود JSON</button>` }], executions) : emptyState("هنوز گزارشی در این نشست اجرا نشده است."))}
    <div class="panel-actions">${button("دریافت CSV از جدول جاری", "export-csv", { variant: "light" })}</div>
  </div>`;
}

function processesPage() {
  const rows = store.list("processes");
  return `<div class="collection-page" data-collection-name="processes" data-edit-action="new-process">
    ${pageHeader("فرآیندها و سوابق", "تعریف فرآیندهای عملیاتی و مشاهده تعاریف ذخیره‌شده", button("فرآیند جدید", "new-process", { icon: "+" }))}
    ${panel("تعاریف فرآیند", rows.length ? dataTable([{ key: "name", label: "فرآیند" }, { key: "code", label: "کد" }, { key: "fields", label: "تعداد فیلد" }, { key: "status", label: "وضعیت" }], rows, { actions: true }) : emptyState("فرآیندی ثبت نشده است."))}
    <div class="insight insight-info">این صفحه فعلاً تعریف فرآیندها را نگهداری می‌کند؛ اجرای گردش‌کار از کارتابل گردش‌کار انجام می‌شود.</div>
  </div>`;
}

export function renderReports(path) {
  return path === "/reports/processes" ? processesPage() : reportsPage();
}