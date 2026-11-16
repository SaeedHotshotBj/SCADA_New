import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, emptyState } from "../../shared/ui.js";

function inboxPage() {
  const tasks = store.list("workflowTasks");
  const pendingCount = tasks.filter(task => task.status === "در انتظار").length;
  const completeCount = tasks.filter(task => task.status === "تکمیل‌شده").length;
  return `<div class="workflow-page">${pageHeader("کارتابل من", "وظایف و درخواست‌هایی که برای بررسی و تأیید به شما ارجاع شده‌اند.")}
    <div class="stats-grid stats-grid-3">${statCard("در انتظار اقدام", pendingCount, "وظیفه", "orange")}${statCard("تکمیل‌شده", completeCount, "وظیفه", "green")}${statCard("کل وظایف", tasks.length, "وظیفه", "blue")}</div>
    ${tabs(["در انتظار من", "تاریخچه", "مدیریت وظایف"])}
    ${panel("وظایف جاری", dataTable([
      { key: "title", label: "عنوان وظیفه" }, { key: "flow", label: "گردش کار" }, { key: "from", label: "ارجاع از" },
      { key: "date", label: "زمان ارجاع" }, { key: "priority", label: "اولویت", render: row => pill(row.priority || "عادی", row.priority === "بالا" ? "warning" : "muted") },
      { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "در انتظار" ? "warning" : "success") },
      { key: "action", label: "اقدام", render: row => row.status === "در انتظار" ? `<button class="btn btn-light btn-sm" data-action="approve-task" data-id="${row.id}">تأیید</button>` : "—" }
    ], tasks))}
  </div>`;
}
function templatesPage() {
  const rows = store.list("templates");
  return `<div class="collection-page" data-collection-name="templates" data-edit-action="new-template">
    ${pageHeader("قالب‌های گردش کار", "تعریف مراحل، نقش‌ها و مسیر تأیید برای فرآیندهای کارخانه", button("قالب جدید", "new-template", { icon: "+" }))}
    <div class="workflow-cards">${rows.map((row, i) => `<article class="workflow-card"><div class="workflow-card-top"><span class="workflow-icon">⇄</span>${pill(row.status || "پیش‌فرض", "info")}</div><h3>${row.name}</h3><p>مسیر تأیید چندمرحله‌ای برای فرآیندهای عملیاتی</p><div class="workflow-steps">${(Array.isArray(row.steps) ? row.steps : String(row.steps || "").split(",")).map((step, index) => `<div class="workflow-step"><span>${index + 1}</span><b>${step}</b></div>`).join("")}</div><div class="workflow-card-footer"><small>${row.steps?.length || 2} مرحله</small><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش قالب</button></div></article>`).join("")}</div>
    ${panel("فهرست قالب‌ها", dataTable([{ key: "name", label: "نام قالب" }, { key: "steps", label: "مراحل", render: row => Array.isArray(row.steps) ? row.steps.join(" ← ") : row.steps }, { key: "status", label: "وضعیت" }], rows, { actions: true }))}
  </div>`;
}

export function renderWorkflow(path) {
  return path === "/workflow/templates" ? templatesPage() : inboxPage();
}
