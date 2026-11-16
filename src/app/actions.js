import { store } from "../services/demo-store.js";
import { api } from "../services/api-client.js";
import { escapeHtml } from "../core/format.js";

const schemas = {
  "new-user": { title: "کاربر جدید", collection: "users", fields: [["name", "نام", "text"], ["email", "ایمیل", "email"], ["role", "نقش", "select", ["Engineer", "Operator", "Production Planner", "Quality Control", "Production Manager"]], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-factory": { title: "کارخانه جدید", collection: "factories", fields: [["name", "نام کارخانه", "text"], ["code", "کد", "text"], ["edge", "Edge", "text"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-plc": { title: "PLC جدید", collection: "plcs", fields: [["name", "نام", "text"], ["protocol", "پروتکل", "select", ["modbus-tcp", "modbus-rtu", "s7", "simulator"]], ["address", "آدرس", "text"], ["unit", "شناسه Unit", "text"], ["poll", "Poll interval", "text"]] },
  "new-tag": { title: "تگ جدید", collection: "tags", fields: [["name", "نام تگ", "text"], ["plc", "PLC", "select", []], ["type", "نوع", "select", ["bool", "int16", "uint16", "int32", "uint32", "float32", "string"]], ["address", "آدرس", "text"], ["access", "دسترسی", "select", ["read", "read_write"]], ["unit", "واحد", "text"]] },
  "new-alarm": { title: "آلارم جدید", collection: "alarms", fields: [["name", "نام آلارم", "text"], ["severity", "شدت", "select", ["بحرانی", "زیاد", "متوسط", "کم"]], ["tag", "تگ مرتبط", "text"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-trend": { title: "روند جدید", collection: "trends", fields: [["name", "نام روند", "text"], ["tags", "تگ‌ها", "text"], ["period", "بازه نمونه‌برداری", "select", ["۱ دقیقه", "۵ دقیقه", "۱۵ دقیقه", "۱ ساعت"]], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-report": { title: "گزارش جدید", collection: "reports", fields: [["name", "نام گزارش", "text"], ["type", "دوره", "select", ["ساعتی", "روزانه", "هفتگی", "ماهانه"]], ["tags", "تعداد تگ", "number"]] },
  "new-process": { title: "فرآیند جدید", collection: "processes", fields: [["name", "نام فرآیند", "text"], ["code", "کد فرآیند", "text"], ["fields", "تعداد فیلد", "number"]] },
  "new-template": { title: "قالب گردشکار جدید", collection: "templates", fields: [["name", "نام قالب", "text"], ["steps", "مراحل (با ویرگول جدا کنید)", "text"], ["status", "وضعیت", "select", ["پیش‌فرض", "فعال"]]] },
  "new-order": { title: "سفارش تولید جدید", collection: "orders", fields: [["code", "شماره سفارش", "text"], ["product", "محصول", "text"], ["quantity", "مقدار", "number"], ["unit", "واحد", "select", ["m", "kg", "عدد"]], ["status", "وضعیت", "select", ["در انتظار", "آزادشده", "در حال تولید"]]] },
  "new-unit": { title: "واحد تولید جدید", collection: "units", fields: [["code", "کد واحد", "text"], ["quantity", "مقدار", "number"], ["unit", "واحد", "select", ["m", "kg", "عدد"]], ["status", "وضعیت", "select", ["باز", "بسته"]]] },
  "new-qc": { title: "ثبت کنترل کیفیت", collection: "qc", fields: [["code", "شماره کنترل", "text"], ["product", "محصول", "text"], ["machine", "ماشین", "text"], ["decision", "تصمیم", "select", ["قبول", "مشروط", "رد"]]] },
  "new-batch": { title: "ثبت بچ جدید", collection: "batches", fields: [["code", "کد بچ", "text"], ["formula", "فرمول", "text"], ["target", "وزن هدف (kg)", "number"], ["material", "ماده", "text"]] },
  "new-run": { title: "شروع اجرای تولید", collection: "productionRuns", fields: [["order", "شماره سفارش", "text"], ["machine", "ماشین", "text"], ["product", "محصول", "text"], ["target", "هدف تولید", "number"]] },
  "new-product": { title: "محصول جدید", collection: "products", fields: [["code", "کد محصول", "text"], ["name", "نام محصول", "text"], ["unit", "واحد اصلی", "select", ["m", "kg", "عدد"]], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-price": { title: "قیمت یا تعرفه جدید", collection: "prices", fields: [["kind", "نوع", "select", ["مواد اولیه", "تعرفه انرژی"]], ["code", "کد", "text"], ["name", "نام", "text"], ["price", "مبلغ واحد", "number"], ["currency", "واحد پول", "select", ["ریال", "تومان"]], ["unit", "واحد اندازه‌گیری", "select", ["kg", "m", "kWh", "عدد"]], ["valid_from", "تاریخ اعتبار", "text"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-machine": { title: "ماشین جدید", collection: "machines", fields: [["name", "نام ماشین", "text"], ["code", "کد تجهیز", "text"], ["status", "وضعیت", "select", ["متصل", "آماده‌به‌کار", "غیرفعال"]]] },
  "new-hmi-page": { title: "صفحه HMI جدید", collection: "hmiPages", fields: [["name", "نام صفحه", "text"], ["machine", "ماشین", "text"], ["description", "توضیحات", "text"], ["components", "تعداد قطعات", "number"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] }
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
    if (type === "select") {
      const sourceOptions = name === "plc" && schema.collection === "tags"
        ? store.list("plcs").map(plc => ({ value: plc.id, label: plc.name }))
        : (options || []).map(option => ({ value: option, label: option }));
      return `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}" required>${sourceOptions.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`;
    }
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

export async function handleAction(action, element) {
  switch (action) {
    case "new-user": case "new-factory": case "new-plc": case "new-tag": case "new-alarm": case "new-trend": case "new-report": case "new-process": case "new-template": case "new-order": case "new-unit": case "new-qc": case "new-batch": case "new-run": case "new-product": case "new-price": case "new-machine": case "new-hmi-page":
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
      if (collection && confirm("این مورد حذف شود؟")) { await store.remove(collection, element.dataset.id); toast("رکورد از سرور حذف شد."); }
      break;
    }
    case "close-modal":
      document.getElementById("modal-root").innerHTML = ""; break;
    case "refresh-demo": await store.refresh(); toast("اطلاعات از سرور دریافت شد."); break;
    case "export-csv": downloadCsv(); break;
    case "reset-demo": toast("بازنشانی دیتابیس سرور از این پنل غیرفعال است.", "info"); break;
    case "toggle-status": {
      const collection = element.dataset.collection;
      const row = store.list(collection).find(item => item.id === element.dataset.id);
      if (row) await store.update(collection, row.id, { status: row.status === "فعال" ? "غیرفعال" : "فعال" });
      break;
    }
    case "toggle-plc": {
      const row = store.list("plcs").find(item => item.id === element.dataset.id);
      if (row) await store.update("plcs", row.id, { status: row.status === "CONNECTED" ? "DISCONNECTED" : "CONNECTED" });
      break;
    }
    case "ack-alarm": {
      await store.update("alarms", element.dataset.id, { status: "تأییدشده", acknowledged_at: new Date().toISOString() }); toast("آلارم تأیید شد."); break;
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
      let runId = element.dataset.id || element.dataset.runId || card?.dataset.runId;
      if (!runId && action === "start-run" && card?.dataset.orderId) {
        const order = store.list("orders").find(item => item.id === card.dataset.orderId);
        if (!order) throw new Error("سفارش انتخاب‌شده پیدا نشد.");
        const created = await store.add("productionRuns", {
          order: order.code, order_id: order.id, machine: card.dataset.machine || "نامشخص",
          product: order.product, target: Number(order.quantity), unit: order.unit,
          status: "آماده"
        });
        runId = created.id;
      }
      if (!runId) { toast("برای این ماشین اجرای تولیدی وجود ندارد؛ ابتدا از ایستگاه اپراتور شروع کنید.", "warning"); break; }
      const result = action === "start-run" ? await api.startRun(runId) : await api.stopRun(runId);
      if (card) card.dataset.runId = runId;
      await store.refresh();
      const status = card?.querySelector("[data-run-status]");
      if (status) status.textContent = result.status || (action === "start-run" ? "در حال تولید" : "متوقف");
      toast(action === "start-run" ? "اجرای سفارش در سرور شروع شد (ثبت وضعیت نرم‌افزاری)." : "اجرای سفارش در سرور متوقف شد (ثبت وضعیت نرم‌افزاری).");
      break;
    }
    case "select-range": {
      const group = element.closest(".range-pills");
      group?.querySelectorAll("button").forEach(button => button.classList.toggle("active", button === element));
      toast(`بازه ${element.textContent.trim()} انتخاب شد.`, "info"); break;
    }
    case "approve-task": await api.approveTask(element.dataset.id); await store.refresh(); toast("وظیفه در سرور تأیید شد."); break;
    case "review-qc": { const decision = prompt("تصمیم کنترل کیفیت را وارد کنید: قبول / مشروط / رد", "قبول"); if (!decision) break; await api.decideQc(element.dataset.id, decision.trim()); await store.refresh(); toast("تصمیم کنترل کیفیت ثبت شد."); break; }
    case "apply-filter": toast("فیلترهای نمایشی اعمال شدند.", "info"); break;
    case "start-batch": {
      const batchId = element.dataset.id || store.list("batches")[0]?.id;
      if (!batchId) { toast("ابتدا از دکمه «بچ جدید» یک بچ ثبت کنید.", "warning"); break; }
      await api.startBatch(batchId); await store.refresh();
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "در حال توزین (حالت شبیه‌سازی)";
      toast("وضعیت بچ در سرور شروع شد؛ هیچ فرمانی به هاپر واقعی ارسال نشد.", "info"); break;
    }
    case "stop-batch": {
      const batchId = element.dataset.id || store.list("batches")[0]?.id;
      if (!batchId) { toast("بچ فعالی برای توقف وجود ندارد.", "warning"); break; }
      await api.stopBatch(batchId); await store.refresh();
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "متوقف‌شده";
      toast("بچ در سرور متوقف شد؛ عملیات توزین سخت‌افزاری انجام نشد.", "info"); break;
    }
    case "print-label": window.print(); break;
    case "run-report": { const result = await api.runReport(element.dataset.id); toast(`گزارش اجرا شد: ${result.id}`); break; }
    case "write-tag": { const tag = store.list("tags").find(item => item.id === element.dataset.id); if (!tag) break; const raw = prompt(`مقدار جدید برای ${tag.name} (${tag.type})`, String(tag.value ?? "")); if (raw === null) break; let value = raw; if (tag.type === "bool") { const normalized = raw.trim().toLowerCase(); if (!["true","false","1","0"].includes(normalized)) throw new Error("Boolean باید true / false یا 1 / 0 باشد."); value = normalized === "true" || normalized === "1"; } else if (["int16","uint16","int32","uint32"].includes(tag.type)) { if (!/^-?\\d+$/.test(raw.trim())) throw new Error("مقدار این تگ باید عدد صحیح باشد."); value = Number.parseInt(raw, 10); } else if (tag.type === "float32") { value = Number(raw); if (!Number.isFinite(value)) throw new Error("مقدار این تگ باید عدد معتبر باشد."); } await api.writeTag(tag.id, value); await store.refresh(); toast("مقدار در دیتابیس شبیه‌سازی تغییر کرد؛ PLC واقعی نوشته نشد.", "info"); break; }
    case "open-modal-info": toast("این عملیات هنوز در نسخه متصل تعریف نشده است.", "info"); break;
    default: toast("این فرمان در نسخه نمایشی تعریف نشده است.", "info");
  }
}

export async function handleSubmit(event) {
  if (event.target.matches("[data-local-form]")) {
    event.preventDefault();
    if (event.target.dataset.localForm === "edge-token") {
      const values = Object.fromEntries(new FormData(event.target).entries());
      const created = await api.registerEdge(values);
      await store.refresh();
      alert(`توکن ثبت Edge (فقط همین یک‌بار نمایش داده می‌شود):\\n\\n${created.edge_token}\\n\\nآن را محرمانه در تنظیمات Edge ذخیره کنید.`);
      toast("Edge در سرور ثبت شد.");
    }
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
  let saved;
  if (form.dataset.editId) saved = await store.update(schema.collection, form.dataset.editId, values);
  else saved = await store.add(schema.collection, values);
  if (saved?.temporary_password) alert(`رمز موقت کاربر (فقط همین یک‌بار):\\n${saved.temporary_password}`);
  document.getElementById("modal-root").innerHTML = "";
  toast("اطلاعات در پایگاه داده سرور ذخیره شد.");
  return true;
}

export function showToast(message, type = "success") { toast(message, type); }
