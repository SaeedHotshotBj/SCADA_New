import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs } from "../../shared/ui.js";

function plcsPage() {
  const rows = store.list("plcs");
  const columns = [
    { key: "name", label: "نام" }, { key: "protocol", label: "پروتکل" }, { key: "address", label: "آدرس" },
    { key: "unit", label: "Unit" }, { key: "poll", label: "Poll" },
    { key: "active", label: "فعال" }, { key: "status", label: "وضعیت", render: row => pill("درایور متصل نیست", "warning") }
  ];
  const actions = rows.map(row => `<button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش تنظیمات</button>`).join(" ");
  return `<div data-collection-name="plcs" data-edit-action="new-plc">${pageHeader("PLC ها", "تعریف ارتباط با کنترلرها و وضعیت اتصال", button("PLC جدید", "new-plc", { icon: "+" }))}${panel("فهرست PLC ها", `${dataTable(columns, rows, { actions: true })}<div class="table-actions">${actions}</div>`)}</div>`;
}

function tagsPage() {
  const rows = store.list("tags");
  return `<div data-collection-name="tags" data-edit-action="new-tag">${pageHeader("مدیریت تگ", "تعریف آدرس، نوع داده، دسترسی و واحد تگ‌ها", `${button("تگ جدید", "new-tag", { icon: "+" })}${button("JSON تگ‌ها (ESP)", "export-csv", { variant: "light", icon: "⇩" })}`)}${panel("تگ‌های کارخانه", dataTable([{ key: "name", label: "نام" }, { key: "id", label: "شناسه رکورد", render: row => `<code>${row.id}</code>` }, { key: "plc", label: "PLC" }, { key: "type", label: "نوع" }, { key: "address", label: "آدرس" }, { key: "access", label: "دسترسی" }, { key: "unit", label: "واحد" }], rows, { actions: true }))}</div>`;
}

export function renderEquipment(path) {
  if (path === "/equipment/tags") return tagsPage();
  if (path === "/equipment/plcs") return plcsPage();
  return `<div>${pageHeader("تجهیزات", "مدیریت PLC ها و تگ‌های کارخانه")}${tabs(["PLC ها", "تگ‌ها"])}${panel("انتخاب بخش", `${button("مدیریت PLC ها", "open-modal-info")}${button("مدیریت تگ‌ها", "open-modal-info")}`)}</div>`;
}
