import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, emptyState } from "../../shared/ui.js";

function inboxPage() {
  const tasks = store.list("workflowTasks");
  const pending = tasks.filter(task => task.status === "در انتظار");
  const completed = tasks.filter(task => task.status !== "در انتظار");
  return `<div class="workflow-page">${pageHeader("کارتابل من", "وظایف گردش‌کار ذخیره‌شده در Backend؛ تصمیم‌ها همراه با کاربر و زمان ثبت می‌شوند.")}
    <div class="stats-grid stats-grid-3">${statCard("در انتظار اقدام", pending.length, "وظیفه", "orange")}${statCard("تعیین تکلیف‌شده", completed.length, "وظیفه", "green")}${statCard("کل وظایف", tasks.length, "وظیفه", "blue")}</div>
    ${tabs(["در انتظار من", "تاریخچه", "مدیریت وظایف"])}
    ${panel("وظایف جاری", pending.length ? dataTable([
      { key: "title", label: "عنوان وظیفه" }, { key: "flow", label: "گردش کار" },
      { key: "from", label: "ارجاع از" }, { key: "created_at", label: "زمان ثبت" },
      { key: "priority", label: "اولویت", render: row => pill(row.priority || "عادی", row.priority === "بالا" ? "warning" : "muted") },
      { key: "action", label: "اقدام", render: row => `<button class="btn btn-primary btn-sm" data-action="approve-task" data-id="${row.id}">تأیید</button> <button class="btn btn-light btn-sm" data-action="reject-task" data-id="${row.id}">رد</button>` }
    ], pending) : emptyState("وظیفه‌ای برای بررسی ثبت نشده است."))}
    ${panel("تاریخچه تصمیم‌ها", completed.length ? dataTable([{ key: "title", label: "وظیفه" }, { key: "decision", label: "تصمیم" }, { key: "decided_by", label: "تصمیم‌گیرنده" }, { key: "decided_at", label: "زمان تصمیم" }, { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "تکمیل‌شده" ? "success" : "danger") }], completed) : emptyState("تصمیمی ثبت نشده است."))}
  </div>`;
}

function templatesPage() {
  const rows = store.list("templates");
  return `<div class="collection-page" data-collection-name="templates" data-edit-action="new-template">${pageHeader("قالب‌های گردش کار", "تعریف مراحل و مسیر تأیید برای فرآیندهای کارخانه", button("قالب جدید", "new-template", { icon: "+" }))}
    ${rows.length ? `<div class="workflow-cards">${rows.map((row, i) => `<article class="workflow-card"><div class="workflow-card-top"><span class="workflow-icon">⇄</span>${pill(row.status || "فعال", "info")}</div><h3>${row.name}</h3><div class="workflow-steps">${(Array.isArray(row.steps) ? row.steps : String(row.steps || "").split(",")).map((step, index) => `<div class="workflow-step"><span>${index + 1}</span><b>${step}</b></div>`).join("")}</div><div class="workflow-card-footer"><small>${Array.isArray(row.steps) ? row.steps.length : 0} مرحله</small><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش قالب</button></div></article>`).join("")}</div>` : emptyState("قالب گردش‌کاری ثبت نشده است.")}
    ${panel("فهرست قالب‌ها", rows.length ? dataTable([{ key: "name", label: "نام قالب" }, { key: "steps", label: "مراحل", render: row => Array.isArray(row.steps) ? row.steps.join(" ← ") : row.steps }, { key: "status", label: "وضعیت" }], rows, { actions: true }) : emptyState("قالبی برای نمایش وجود ندارد."))}
  </div>`;
}

export function renderWorkflow(path) {
  return path === "/workflow/templates" ? templatesPage() : inboxPage();
}