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
  "new-order": { title: "سفارش تولید جدید", collection: "orders", fields: [["code", "شماره سفارش", "text"], ["product", "محصول", "text"], ["quantity", "مقدار", "number"], ["unit", "واحد", "select", ["m", "kg", "عدد"]], ["machine", "ماشین تخصیص‌یافته", "text"], ["planned_date", "تاریخ برنامه‌ریزی", "date"], ["status", "وضعیت", "select", ["در انتظار", "آزادشده", "در حال تولید"]]] },
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

function openChangePasswordModal() {
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="تغییر رمز عبور"><header class="modal-header"><h2>تغییر رمز عبور</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><form id="password-change-form"><div class="modal-fields"><label class="field"><span>رمز فعلی</span><input name="old_password" type="password" autocomplete="current-password" required></label><label class="field"><span>رمز جدید (حداقل ۸ نویسه)</span><input name="new_password" type="password" autocomplete="new-password" minlength="8" required></label><label class="field"><span>تکرار رمز جدید</span><input name="confirm_password" type="password" autocomplete="new-password" minlength="8" required></label></div><footer class="modal-footer"><button type="button" class="btn btn-light" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ثبت رمز جدید</button></footer></form></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
}

function downloadCsv() {
  const collection = document.querySelector("[data-collection-name]")?.dataset.collectionName || "tags";
  const rows = store.list(collection);
  if (!rows.length) {
    toast("برای خروجی گرفتن، داده‌ای در این بخش وجود ندارد.", "info");
    return;
  }
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csvCell = value => {
    const text = value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [headers.map(csvCell).join(","), ...rows.map(row => headers.map(key => csvCell(row[key])).join(","))].join("\\r\\n");
  const blob = new Blob(["\\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `scada-${collection}-export.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function showRecord(collection, id) {
  const record = store.list(collection).find(item => item.id === id);
  if (!record) throw new Error("رکورد موردنظر پیدا نشد.");
  const rows = Object.entries(record).map(([key, value]) => {
    const display = value && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—");
    return `<div class="storage-list"><div><span>${escapeHtml(key)}</span><b>${escapeHtml(display)}</b></div></div>`;
  }).join("");
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><header class="modal-header"><h2>جزئیات ${escapeHtml(collection)}</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><div class="modal-fields">${rows}</div><footer class="modal-footer"><button type="button" class="btn btn-primary" data-action="close-modal">بستن</button></footer></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
}

function applyTableFilters(element) {
  const filterBar = element.closest(".filter-bar, .report-builder");
  const page = element.closest(".page-content") || document;
  const selected = [...(filterBar?.querySelectorAll("select") || [])]
    .map(select => select.value?.trim())
    .filter(value => value && !/^(همه|انتخاب|تمام)/.test(value));
  const rows = [...page.querySelectorAll(".data-table tbody tr")];
  if (!rows.length) {
    toast("در این صفحه جدول قابل فیلتر کردن وجود ندارد.", "info");
    return;
  }
  let visible = 0;
  for (const row of rows) {
    const text = row.textContent || "";
    const matches = selected.every(value => text.includes(value));
    row.hidden = !matches;
    if (matches) visible += 1;
  }
  toast(`${visible.toLocaleString("fa-IR")} ردیف مطابق فیلتر است.`, "info");
}

function openActionInfo(title, message) {
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><header class="modal-header"><h2>${escapeHtml(title || "اطلاعات")}</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><div class="modal-fields"><p>${escapeHtml(message)}</p></div><footer class="modal-footer"><button type="button" class="btn btn-primary" data-action="close-modal">متوجه شدم</button></footer></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
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
    case "change-password": openChangePasswordModal(); break;
    case "logout":
      await api.logout();
      store.clearSession();
      sessionStorage.removeItem("scada-demo-auth");
      location.hash = "/login";
      toast("از سامانه خارج شدید.");
      break;
    case "refresh-demo": await store.refresh(); toast("اطلاعات از سرور دریافت شد."); break;
    case "export-csv": downloadCsv(); break;
    case "reset-demo": toast("بازنشانی دیتابیس سرور از این پنل غیرفعال است.", "info"); break;
    case "toggle-status": {
      const collection = element.dataset.collection;
      const row = store.list(collection).find(item => item.id === element.dataset.id);
      if (row) await store.update(collection, row.id, { status: row.status === "فعال" ? "غیرفعال" : "فعال" });
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
    case "toggle-bi-layout": {
      const page = document.querySelector(".bi-page");
      if (!page) break;
      const compact = page.dataset.compact !== "true";
      page.dataset.compact = String(compact);
      page.querySelectorAll(".stats-grid, .two-col-grid, .bi-grid").forEach(block => {
        block.style.gap = compact ? "8px" : "";
        block.style.marginBottom = compact ? "8px" : "";
      });
      toast(compact ? "فاصله‌گذاری داشبورد فشرده شد." : "چیدمان عادی داشبورد فعال شد.", "info");
      break;
    }
    case "filter-read-write": {
      const table = document.querySelector('[data-collection-name="tags"] .data-table tbody');
      if (!table) break;
      const active = element.dataset.active !== "true";
      element.dataset.active = String(active);
      let shown = 0;
      table.querySelectorAll("tr").forEach(row => {
        const match = (row.textContent || "").includes("read_write");
        row.hidden = active && !match;
        if (!row.hidden) shown += 1;
      });
      toast(active ? `${shown.toLocaleString("fa-IR")} تگ read/write نمایش داده شد.` : "همه تگ‌ها نمایش داده شدند.", "info");
      break;
    }
    case "start-run": case "stop-run": {
      const card = element.closest("[data-run-card]");
      let runId = element.dataset.id || element.dataset.runId || card?.dataset.runId;
      const selectedMachine = document.querySelector('[name="operator_machine"]')?.value;
      if (!runId && action === "start-run" && card?.dataset.orderId) {
        const order = store.list("orders").find(item => item.id === card.dataset.orderId);
        if (!order) throw new Error("سفارش انتخاب‌شده پیدا نشد.");
        const created = await store.add("productionRuns", {
          order: order.code, order_id: order.id, machine: card.dataset.machine || selectedMachine || "نامشخص",
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
    case "apply-filter": applyTableFilters(element); break;
    case "show-record": showRecord(element.dataset.collection, element.dataset.id); break;
    case "move-week": store.setWeekOffset(store.weekOffset() + Number(element.dataset.delta || 1)); break;
    case "toggle-fullscreen":
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      break;
    case "start-batch": {
      const batchId = element.dataset.id || store.list("batches")[0]?.id;
      if (!batchId) { toast("ابتدا از دکمه «بچ جدید» یک بچ ثبت کنید.", "warning"); break; }
      await api.startBatch(batchId); await store.refresh();
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "در حال توزین (حالت شبیه‌سازی)";
      toast("وضعیت بچ در سرور شروع شد؛ هیچ فرمانی به هاپر واقعی ارسال نشد.", "info"); break;
    }
    case "cancel-batch": {
      const batchId = element.dataset.id || store.list("batches")[0]?.id;
      if (!batchId) { toast("بچی برای لغو وجود ندارد.", "warning"); break; }
      if (!confirm("بچ انتخاب‌شده لغو شود؟")) break;
      await api.cancelBatch(batchId);
      await store.refresh();
      toast("بچ در پایگاه داده لغو شد. هیچ فرمانی به تجهیزات ارسال نشد.", "warning");
      break;
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
    case "run-report": {
      const result = await api.runReport(element.dataset.id);
      downloadJson(result.result, `scada-report-${result.id}.json`);
      toast(`گزارش اجرا و فایل JSON دریافت شد: ${result.id}`);
      break;
    }
    case "write-tag": { const tag = store.list("tags").find(item => item.id === element.dataset.id); if (!tag) break; const raw = prompt(`مقدار جدید برای ${tag.name} (${tag.type})`, String(tag.value ?? "")); if (raw === null) break; let value = raw; if (tag.type === "bool") { const normalized = raw.trim().toLowerCase(); if (!["true","false","1","0"].includes(normalized)) throw new Error("Boolean باید true / false یا 1 / 0 باشد."); value = normalized === "true" || normalized === "1"; } else if (["int16","uint16","int32","uint32"].includes(tag.type)) { if (!/^-?\\d+$/.test(raw.trim())) throw new Error("مقدار این تگ باید عدد صحیح باشد."); value = Number.parseInt(raw, 10); } else if (tag.type === "float32") { value = Number(raw); if (!Number.isFinite(value)) throw new Error("مقدار این تگ باید عدد معتبر باشد."); } await api.writeTag(tag.id, value); await store.refresh(); toast("مقدار در دیتابیس شبیه‌سازی تغییر کرد؛ PLC واقعی نوشته نشد.", "info"); break; }
    case "open-modal-info": openActionInfo(element.textContent.trim(), "برای این کنترل هنوز سرویس عملیاتی و تنظیمات مستقل در Backend تعریف نشده است. هیچ تغییری در داده‌های سامانه انجام نشده است."); break;
    default: toast("این فرمان در نسخه نمایشی تعریف نشده است.", "info");
  }
}

export async function handleSubmit(event) {
  if (event.target.matches("[data-local-form]")) {
    event.preventDefault();
    const form = event.target;
    const localForm = form.dataset.localForm;
    const values = Object.fromEntries(new FormData(form).entries());
    if (localForm === "edge-token") {
      const created = await api.registerEdge(values);
      await store.refresh();
      alert(`توکن ثبت Edge (فقط همین یک‌بار نمایش داده می‌شود):\\n\\n${created.edge_token}\\n\\nآن را محرمانه در تنظیمات Edge ذخیره کنید.`);
      toast("Edge در سرور ثبت شد.");
    } else if (localForm === "batch-config") {
      for (const field of ["samples","tolerance_percent","stabilization_seconds"]) values[field] = Number(values[field]);
      const hoppers = new Map();
      for (const [key, value] of Object.entries(values)) {
        const match = key.match(/^hopper_(\\d+)_(bin|material|ratio|target)$/);
        if (!match) continue;
        const index = Number(match[1]);
        const field = match[2];
        if (!hoppers.has(index)) hoppers.set(index, {});
        hoppers.get(index)[field] = ["ratio","target"].includes(field) ? Number(value) : value;
        delete values[key];
      }
      values.hoppers = [...hoppers.entries()].sort((a,b) => a[0]-b[0]).map(([,hopper]) => hopper);
      const ratioTotal = values.hoppers.reduce((sum, hopper) => sum + Number(hopper.ratio || 0), 0);
      if (!values.hoppers.length || Math.abs(ratioTotal - 100) > 0.01) throw new Error("مجموع درصد مواد باید دقیقاً ۱۰۰٪ باشد.");
      if (form.dataset.id) await store.update("batchConfigs", form.dataset.id, values);
      else await store.add("batchConfigs", values);
      toast("تنظیمات خط توزین در پایگاه داده ذخیره شد.");
    } else if (localForm === "machine-calendar") {
      const days = ["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"].map((day,index) => ({
        day,
        enabled: values[`day_${index}_enabled`] === "true",
        start: values[`day_${index}_start`],
        end: values[`day_${index}_end`],
        break: values[`day_${index}_break`],
      }));
      for (const key of Object.keys(values)) if (key.startsWith("day_")) delete values[key];
      values.days = days;
      const existing = store.list("machineCalendars").find(row => row.machine === values.machine && row.year === values.year && row.month === values.month);
      if (existing) await store.update("machineCalendars", existing.id, values);
      else await store.add("machineCalendars", values);
      toast("تقویم ماشین در پایگاه داده ذخیره شد.");
    } else if (localForm === "control-plan") {
      values.sample_count = Number(values.sample_count);
      values.approval_required = values.approval_required === "true";
      const parameters = new Map();
      for (const [key, value] of Object.entries(values)) {
        const match = key.match(/^parameter_(\\d+)_(parameter|nominal|min|max|unit|method)$/);
        if (!match) continue;
        const index = Number(match[1]);
        if (!parameters.has(index)) parameters.set(index, {});
        parameters.get(index)[match[2]] = value;
        delete values[key];
      }
      values.parameters = [...parameters.entries()].sort((a,b) => a[0]-b[0]).map(([,item]) => item);
      const existing = form.dataset.id;
      if (existing) await store.update("controlPlans", existing, values);
      else await store.add("controlPlans", values);
      toast("تنظیمات طرح کنترل کیفیت ذخیره شد.");
    }
    form.reset();
    return true;
  }
  if (event.target.id === "password-change-form") {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    if (values.new_password !== values.confirm_password) throw new Error("رمز جدید و تکرار آن یکسان نیستند.");
    await api.changePassword({ old_password: values.old_password, new_password: values.new_password });
    await store.refresh();
    document.getElementById("modal-root").innerHTML = "";
    toast("رمز عبور با موفقیت تغییر کرد.");
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
