import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, emptyState } from "../../shared/ui.js";

function inboxPage() {
  const tasks = store.list("workflowTasks");
  const pending = tasks.filter(task => task.status === "در انتظار");
  const completed = tasks.filter(task => task.status === "تکمیل‌شده");
  const taskColumns = [
    { key: "title", label: "عنوان وظیفه" },
    { key: "flow", label: "گردش کار" },
    { key: "from", label: "ارجاع از" },
    { key: "created_at", label: "زمان ثبت", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : row.date || "—" },
    { key: "priority", label: "اولویت", render: row => pill(row.priority || "عادی", row.priority === "فوری" ? "danger" : row.priority === "بالا" ? "warning" : "muted") },
    { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "در انتظار" ? "warning" : "success") },
    { key: "action", label: "اقدام", render: row => row.status === "در انتظار"
      ? `<button class="btn btn-light btn-sm" data-action="approve-task" data-id="${row.id}">تأیید</button>`
      : "—" },
  ];
  return `<div class="workflow-page" data-collection-name="workflowTasks" data-edit-action="new-task">
    ${pageHeader("کارتابل من", "وظایف ارجاع‌شده، ثبت وظیفه جدید و وضعیت تأییدهای ذخیره‌شده در سرور", button("وظیفه جدید", "new-task", { icon: "+" }))}
    <div class="stats-grid stats-grid-3">
      ${statCard("در انتظار اقدام", pending.length.toLocaleString("fa-IR"), "وظیفه", "orange")}
      ${statCard("تکمیل‌شده", completed.length.toLocaleString("fa-IR"), "وظیفه", "green")}
      ${statCard("کل وظایف", tasks.length.toLocaleString("fa-IR"), "وظیفه", "blue")}
    </div>
    ${panel("وظایف در انتظار اقدام", pending.length ? dataTable(taskColumns, pending) : emptyState("در حال حاضر وظیفه‌ای در انتظار تأیید نیست."))}
    ${panel("تاریخچه وظایف تکمیل‌شده", completed.length ? dataTable(taskColumns, completed) : emptyState("هنوز وظیفه تکمیل‌شده‌ای ثبت نشده است."))}
  </div>`;
}

function templatesPage() {
  const rows = store.list("templates");
  return `<div class="collection-page" data-collection-name="templates" data-edit-action="new-template">
    ${pageHeader("قالب‌های گردش کار", "تعریف مراحل و مسیر تأیید برای فرآیندهای کارخانه", button("قالب جدید", "new-template", { icon: "+" }))}
    ${rows.length ? `<div class="workflow-cards">${rows.map(row => {
      const steps = Array.isArray(row.steps) ? row.steps : String(row.steps || "").split(/[،,]/).map(item => item.trim()).filter(Boolean);
      return `<article class="workflow-card"><div class="workflow-card-top"><span class="workflow-icon">⇄</span>${pill(row.status || "پیش‌فرض", "info")}</div><h3>${row.name}</h3><p>مراحل تعریف‌شده برای گردش‌کار</p><div class="workflow-steps">${steps.map((step,index) => `<div class="workflow-step"><span>${index + 1}</span><b>${step}</b></div>`).join("")}</div><div class="workflow-card-footer"><small>${steps.length.toLocaleString("fa-IR")} مرحله</small><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش قالب</button><button class="btn btn-light btn-sm" data-action="delete-record" data-collection="templates" data-id="${row.id}">حذف</button></div></article>`;
    }).join("")}</div>` : emptyState("هنوز قالب گردش کاری ثبت نشده است.")}
    ${panel("فهرست قالب‌ها", rows.length ? dataTable([
      { key: "name", label: "نام قالب" },
      { key: "steps", label: "مراحل", render: row => Array.isArray(row.steps) ? row.steps.join(" ← ") : row.steps },
      { key: "status", label: "وضعیت" },
    ], rows) : emptyState("قالبی برای نمایش وجود ندارد."))}
  </div>`;
}

export function renderWorkflow(path) {
  return path === "/workflow/templates" ? templatesPage() : inboxPage();
}
