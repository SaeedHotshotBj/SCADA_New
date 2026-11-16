import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, dateFilter, statCard, lineChart, emptyState } from "../../shared/ui.js";

function reportsPage() {
  const rows = store.list("reports");
  return `<div class="collection-page" data-collection-name="reports" data-edit-action="new-report">
    ${pageHeader("گزارش‌ها", "مدیریت گزارش‌های زمان‌بندی‌شده، انتخاب تگ‌ها و دریافت خروجی", button("گزارش جدید", "new-report", { icon: "+" }))}
    <div class="stats-grid stats-grid-3">${statCard("قالب‌های گزارش", rows.length, "قالب", "blue")}${statCard("گزارش فعال", rows.filter(x => x.status !== "غیرفعال").length, "قالب", "green")}${statCard("آخرین اجرا", "امروز", "", "orange")}</div>
    ${tabs(["گزارش‌ها", "خروجی‌های آماده", "زمان‌بندی"])}
    ${panel("فهرست گزارش‌ها", dataTable([
      { key: "name", label: "نام گزارش" }, { key: "type", label: "دوره اجرا" }, { key: "tags", label: "تعداد تگ" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") },
      { key: "last", label: "آخرین اجرا", render: () => "امروز · ۱۱:۰۰" },
      { key: "format", label: "قالب خروجی", render: () => "CSV / Excel" }
    ], rows, { actions: true }))}
    <div class="panel-actions">${button("دریافت CSV", "export-csv", { variant: "light" })}${button("اجرای گزارش", "open-modal-info", { variant: "primary" })}</div>
  </div>`;
}

function processesPage() {
  const rows = store.list("processes");
  return `<div class="collection-page" data-collection-name="processes" data-edit-action="new-process">
    ${pageHeader("فرآیندها و سوابق", "تعریف فرآیندهای عملیاتی و مشاهده رکوردهای ثبت‌شده", button("فرآیند جدید", "new-process", { icon: "+" }))}
    ${tabs(["سوابق", "تعاریف فرآیند"])}
    <div class="filter-bar">${dateFilter()}<label class="field"><span>وضعیت</span><select><option>همه وضعیت‌ها</option><option>تکمیل‌شده</option><option>در انتظار</option></select></label><label class="field"><span>فرآیند</span><select><option>همه فرآیندها</option>${rows.map(row => `<option>${row.name}</option>`).join("")}</select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">اعمال فیلتر</button></div>
    ${panel("فهرست سوابق فرآیند", dataTable([
      { key: "code", label: "کد" }, { key: "name", label: "نام فرآیند" },
      { key: "operator", label: "اپراتور", render: () => "اپراتور نمونه" }, { key: "created", label: "زمان ثبت", render: () => "امروز · ۱۰:۴۵" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "تکمیل‌شده", "success") }
    ], rows.map(row => ({ ...row, status: row.status === "فعال" ? "تکمیل‌شده" : row.status }))))}
    ${panel("تعاریف فرآیند", dataTable([{ key: "name", label: "فرآیند" }, { key: "code", label: "کد" }, { key: "fields", label: "تعداد فیلد" }, { key: "status", label: "وضعیت" }], rows, { actions: true }))}
  </div>`;
}

export function renderReports(path) {
  return path === "/reports/processes" ? processesPage() : reportsPage();
}
