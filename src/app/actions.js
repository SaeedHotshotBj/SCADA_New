import { store } from "../services/demo-store.js";
import { escapeHtml } from "../core/format.js";

const schemas = {
  "new-user": { title: "کاربر جدید", collection: "users", fields: [["name", "نام", "text"], ["email", "ایمیل", "email"], ["role", "نقش", "select", ["Engineer", "Operator", "Production Planner", "Quality Control", "Production Manager"]], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-factory": { title: "کارخانه جدید", collection: "factories", fields: [["name", "نام کارخانه", "text"], ["code", "کد", "text"], ["edge", "Edge", "text"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-plc": { title: "PLC جدید", collection: "plcs", fields: [["name", "نام", "text"], ["protocol", "پروتکل", "select", ["modbus-tcp", "modbus-rtu", "s7", "simulator"]], ["address", "آدرس", "text"], ["unit", "شناسه Unit", "text"], ["poll", "Poll interval", "text"]] },
  "new-tag": { title: "تگ جدید", collection: "tags", fields: [["name", "نام تگ", "text"], ["plc", "PLC", "text"], ["type", "نوع", "select", ["bool", "int16", "uint16", "float32", "string"]], ["address", "آدرس", "text"], ["access", "دسترسی", "select", ["read", "read_write"]], ["unit", "واحد", "text"]] },
  "new-alarm": { title: "آلارم جدید", collection: "alarms", fields: [["name", "نام آلارم", "text"], ["severity", "شدت", "select", ["بحرانی", "زیاد", "متوسط", "کم"]], ["tag", "تگ مرتبط", "text"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-trend": { title: "روند جدید", collection: "trends", fields: [["name", "نام روند", "text"], ["tags", "تگ‌ها", "text"], ["period", "بازه نمونه‌برداری", "select", ["۱ دقیقه", "۵ دقیقه", "۱۵ دقیقه", "۱ ساعت"]], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-report": { title: "گزارش جدید", collection: "reports", fields: [["name", "نام گزارش", "text"], ["type", "دوره", "select", ["ساعتی", "روزانه", "هفتگی", "ماهانه"]], ["tags", "تعداد تگ", "number"]] },
  "new-process": { title: "فرآیند جدید", collection: "processes", fields: [["name", "نام فرآیند", "text"], ["code", "کد فرآیند", "text"], ["fields", "تعداد فیلد", "number"]] },
  "new-template": { title: "قالب گردشکار جدید", collection: "templates", fields: [["name", "نام قالب", "text"], ["steps", "مراحل (با ویرگول جدا کنید)", "text"], ["status", "وضعیت", "select", ["پیش‌فرض", "فعال"]]] },
  "new-order": { title: "سفارش تولید جدید", collection: "orders", fields: [["code", "شماره سفارش", "text"], ["product", "محصول", "text"], ["quantity", "مقدار", "number"], ["unit", "واحد", "select", ["m", "kg", "عدد"]], ["status", "وضعیت", "select", ["در انتظار", "آزادشده", "در حال تولید"]]] },
  "new-unit": { title: "واحد تولید جدید", collection: "units", fields: [["code", "کد واحد", "text"], ["quantity", "مقدار", "number"], ["unit", "واحد", "select", ["m", "kg", "عدد"]], ["status", "وضعیت", "select", ["باز", "بسته"]]] },
  "new-qc": { title: "ثبت کنترل کیفیت", collection: "qc", fields: [["code", "شماره کنترل", "text"], ["product", "محصول", "text"], ["machine", "ماشین", "text"], ["decision", "تصمیم", "select", ["قبول", "مشروط", "رد"]]] },
  "new-batch": { title: "ثبت بچ جدید", collection: "batches", fields: [["code", "کد بچ", "text"], ["formula", "فرمول", "text"], ["target", "وزن هدف (kg)", "number"], ["material", "ماده", "text"]] },
  "new-run": { title: "شروع اجرای تولید", collection: "productionRuns", fields: [["order", "شماره سفارش", "text"], ["machine", "ماشین", "text"], ["product", "محصول", "text"], ["target", "هدف تولید", "number"]] }
};

function toast(message, type = "success") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  root.innerHTML = `<div class="toast toast-${type}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { root.innerHTML = ""; }, 2600);
}

function openModal(action, record = null) {
  const schema = schemas[action];
  if (!schema) return;
  const fields = schema.fields.map(([name, label, type, options]) => {
    const value = record?.[name] ?? "";
    if (type === "select") return `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}">${options.map(option => `<option ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
    return `<label class="field"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${type === "number" ? "min=0 step=any" : ""} required /></label>`;
  }).join("");
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(schema.title)}"><header class="modal-header"><h2>${escapeHtml(record ? "ویرایش " + schema.title : schema.title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><form id="record-form" data-collection="${schema.collection}" data-edit-id="${record?.id ?? ""}" data-schema="${action}"><div class="modal-fields">${fields}</div><footer class="modal-footer"><button type="button" class="btn btn-light" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ذخیره</button></footer></form></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
}

function downloadCsv() {
  const rows = store.list("tags");
  const headers = ["name", "plc", "type", "address", "access", "unit", "value"];
  const csv = [headers.join(","), ...rows.map(row => headers.map(key => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "scada-demo-export.csv"; a.click(); URL.revokeObjectURL(url);
}

export function handleAction(action, element) {
  switch (action) {
    case "new-user": case "new-factory": case "new-plc": case "new-tag": case "new-alarm": case "new-trend": case "new-report": case "new-process": case "new-template": case "new-order": case "new-unit": case "new-qc": case "new-batch": case "new-run":
      openModal(action); break;
    case "edit-record": {
      const collection = document.querySelector("[data-collection-name]")?.dataset.collectionName;
      const row = collection ? store.list(collection).find(item => item.id === element.dataset.id) : null;
      const actionName = document.querySelector(`[data-edit-action]`)?.dataset.editAction;
      if (row && actionName) openModal(actionName, row); else toast("ویرایش برای این بخش در نسخه نمایشی فعال نیست.", "info");
      break;
    }
    case "delete-record": {
      const collection = element.dataset.collection || document.querySelector("[data-collection-name]")?.dataset.collectionName;
      if (collection && confirm("این مورد حذف شود؟")) { store.remove(collection, element.dataset.id); toast("رکورد حذف شد."); }
      break;
    }
    case "close-modal":
      document.getElementById("modal-root").innerHTML = ""; break;
    case "refresh-demo": toast("اطلاعات نمایشی به‌روزرسانی شد."); break;
    case "export-csv": downloadCsv(); break;
    case "reset-demo": if (confirm("اطلاعات نمایشی به حالت اولیه برگردد؟")) { store.reset(); toast("اطلاعات اولیه بازیابی شد."); } break;
    case "toggle-status": {
      const collection = element.dataset.collection;
      const row = store.list(collection).find(item => item.id === element.dataset.id);
      if (row) store.update(collection, row.id, { status: row.status === "فعال" ? "غیرفعال" : "فعال" });
      break;
    }
    case "toggle-plc": {
      const row = store.list("plcs").find(item => item.id === element.dataset.id);
      if (row) store.update("plcs", row.id, { status: row.status === "CONNECTED" ? "DISCONNECTED" : "CONNECTED" });
      break;
    }
    case "ack-alarm": {
      store.update("alarms", element.dataset.id, { status: "تأییدشده" }); toast("آلارم تأیید شد."); break;
    }
    case "select-tab": {
      const group = element.closest(".tabs");
      group?.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === element));
      const pane = element.closest(".page-content")?.querySelector("[data-tab-pane]");
      if (pane) pane.dataset.activeTab = element.dataset.tab;
      break;
    }
    case "toggle-sidebar": document.body.classList.toggle("sidebar-collapsed"); break;
    case "start-run": case "stop-run": {
      const card = element.closest("[data-run-card]");
      if (card) { card.dataset.runState = action === "start-run" ? "running" : "stopped"; const status = card.querySelector("[data-run-status]"); if (status) status.textContent = action === "start-run" ? "در حال اجرا" : "متوقف"; }
      toast(action === "start-run" ? "فرمان شروع در حالت شبیه‌سازی ثبت شد." : "فرمان توقف در حالت شبیه‌سازی ثبت شد.", "info");
      break;
    }
    case "select-range": {
      const group = element.closest(".range-pills");
      group?.querySelectorAll("button").forEach(button => button.classList.toggle("active", button === element));
      toast(`بازه ${element.textContent.trim()} انتخاب شد.`, "info"); break;
    }
    case "approve-task": toast("وظیفه در محیط نمایشی تأیید شد."); element.disabled = true; element.textContent = "تأیید شد"; break;
    case "review-qc": toast(`فرم بررسی ${element.dataset.id} در حالت نمایشی باز شد.`, "info"); break;
    case "apply-filter": toast("فیلترهای نمایشی اعمال شدند.", "info"); break;
    case "start-batch": {
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "در حال توزین (شبیه‌سازی)";
      const weight = document.getElementById("batch-weight");
      if (weight) weight.textContent = "۰٫۰۰";
      toast("شروع بچ در حالت شبیه‌سازی ثبت شد.", "info"); break;
    }
    case "stop-batch": {
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "متوقف‌شده";
      toast("توزین نمایشی متوقف شد.", "info"); break;
    }
    case "print-label": window.print(); break;
    case "open-modal-info": toast("این عملیات در نسخه نمایشی به سرویس بیرونی متصل نیست.", "info"); break;
    default: toast("این فرمان در نسخه نمایشی تعریف نشده است.", "info");
  }
}

export function handleSubmit(event) {
  if (event.target.matches("[data-local-form]")) {
    event.preventDefault();
    if (event.target.dataset.localForm === "edge-token") toast("درخواست ایجاد توکن نمایشی ثبت شد؛ توکن واقعی از سرور صادر نمی‌شود.", "info");
    event.target.reset();
    return true;
  }
  if (event.target.id !== "record-form") return false;
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  const schema = schemas[form.dataset.schema];
  if (values.steps) values.steps = values.steps.split(/[،,]/).map(step => step.trim()).filter(Boolean);
  if (values.fields) values.fields = Number(values.fields);
  if (form.dataset.editId) store.update(schema.collection, form.dataset.editId, values);
  else store.add(schema.collection, values);
  document.getElementById("modal-root").innerHTML = "";
  toast("اطلاعات در فضای نمایشی ذخیره شد.");
  return true;
}

export function showToast(message, type = "success") { toast(message, type); }
