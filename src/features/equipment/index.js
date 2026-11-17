import { store } from "../../services/demo-store.js";
import { escapeHtml } from "../../core/format.js";
import { button, dataTable, pageHeader, panel, pill, tabs } from "../../shared/ui.js";

function plcsPage() {
  const rows = store.list("plcs");
  const columns = [
    { key: "name", label: "نام" },
    { key: "protocol", label: "پروتکل" },
    { key: "address", label: "آدرس" },
    { key: "unit", label: "Unit" },
    { key: "poll", label: "Poll" },
    { key: "enabled", label: "Polling", render: row => row.enabled === true ? pill("فعال", "success") : row.protocol === "simulator" ? pill("شبیه‌ساز", "warning") : pill("غیرفعال", "muted") },
    { key: "last_poll", label: "آخرین قرائت", render: row => row.last_poll ? new Date(row.last_poll).toLocaleString("fa-IR") : "—" },
    { key: "connection_status", label: "وضعیت ارتباط", render: row => {
      const state = row.connection_status || (row.protocol === "simulator" ? "SIMULATOR" : "NOT_TESTED");
      const tone = state === "ONLINE" ? "success" : state === "DEGRADED" ? "warning" : state === "OFFLINE" ? "danger" : "muted";
      return pill(state, tone);
    } },
    { key: "last_error", label: "آخرین خطا", render: row => escapeHtml(row.last_error || "—") },
    { key: "hardware_actions", label: "ارتباط", render: row => row.protocol === "simulator"
      ? pill("DEMO", "warning")
      : `${button("آزمایش اتصال", "test-plc", { variant: "light", small: true, attrs: `data-id="${row.id}"` })} ${button("خواندن فوری", "poll-plc", { variant: "light", small: true, attrs: `data-id="${row.id}"` })}` },
  ];
  return `<div data-collection-name="plcs" data-edit-action="new-plc">${pageHeader("PLC ها", "تعریف اتصال Modbus TCP/RTU یا Siemens S7، آزمایش ارتباط و خواندن تگ‌ها.", `${button("به‌روزرسانی", "refresh-demo", { variant: "light" })} ${button("PLC جدید", "new-plc", { icon: "+" })}`)}
    ${panel("فهرست PLC ها", dataTable(columns, rows, { actions: true }))}
    <p class="muted-note">آزمایش اتصال و خواندن فوری فقط داده را می‌خواند. Polling خودکار فقط برای PLCهایی فعال می‌شود که گزینه «فعال‌سازی ارتباط» روی «بله» باشد. نوشتن فیزیکی به PLC به‌صورت پیش‌فرض غیرفعال است و مجوزهای جداگانه لازم دارد.</p>
  </div>`;
}

function tagsPage() {
  const rows = store.list("tags");
  const plcs = store.list("plcs");
  const mapped = rows.map(row => ({
    ...row,
    plc_name: plcs.find(plc => plc.id === row.plc)?.name || row.plc || "—",
    tag_id: row.id,
    quality: row.quality || "UNSAMPLED",
  }));
  return `<div data-collection-name="tags" data-edit-action="new-tag">${pageHeader("مدیریت تگ", "تعریف آدرس، نوع داده، دسترسی و واحد تگ‌ها", `${button("تگ جدید", "new-tag", { icon: "+" })}${button("فقط read/write", "filter-read-write", { variant: "light" })}${button("خروجی CSV تگ‌ها", "export-csv", { variant: "light", icon: "⇩" })}`)}
    ${panel("تگ‌های کارخانه", dataTable([
      { key: "name", label: "نام" },
      { key: "tag_id", label: "شناسه تگ" },
      { key: "plc_name", label: "PLC" },
      { key: "type", label: "نوع" },
      { key: "address", label: "آدرس" },
      { key: "access", label: "دسترسی" },
      { key: "unit", label: "واحد" },
      { key: "quality", label: "کیفیت آخرین نمونه", render: row => pill(row.quality, row.quality === "GOOD" ? "success" : row.quality === "DEMO" ? "warning" : "muted") },
    ], mapped, { actions: true }))}
  </div>`;
}

export function renderEquipment(path) {
  if (path === "/equipment/tags") return tagsPage();
  if (path === "/equipment/plcs") return plcsPage();
  return `<div>${pageHeader("تجهیزات", "مدیریت PLC ها و تگ‌های کارخانه")}${tabs(["PLC ها", "تگ‌ها"])}${panel("انتخاب بخش", `<a class="btn btn-primary" href="#/equipment/plcs">مدیریت PLC ها</a><a class="btn btn-light" href="#/equipment/tags">مدیریت تگ‌ها</a>`)}</div>`;
}
