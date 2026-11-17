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
  "new-batch": { title: "ثبت بچ جدید", collection: "batches", fields: [["code", "کد بچ", "text"], ["formula", "فرمول", "select", []], ["target", "وزن هدف (kg)", "number"], ["material", "ماده", "text"]] },
  "new-run": { title: "شروع اجرای تولید", collection: "productionRuns", fields: [["order", "شماره سفارش", "text"], ["machine", "ماشین", "text"], ["product", "محصول", "text"], ["target", "هدف تولید", "number"]] },
  "new-product": { title: "محصول جدید", collection: "products", fields: [["code", "کد محصول", "text"], ["name", "نام محصول", "text"], ["unit", "واحد اصلی", "select", ["m", "kg", "عدد"]], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-price": { title: "قیمت یا تعرفه جدید", collection: "prices", fields: [["kind", "نوع", "select", ["مواد اولیه", "تعرفه انرژی"]], ["code", "کد", "text"], ["name", "نام", "text"], ["price", "مبلغ واحد", "number"], ["currency", "واحد پول", "select", ["ریال", "تومان"]], ["unit", "واحد اندازه‌گیری", "select", ["kg", "m", "kWh", "عدد"]], ["valid_from", "تاریخ اعتبار", "text"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-machine": { title: "ماشین جدید", collection: "machines", fields: [["name", "نام ماشین", "text"], ["code", "کد تجهیز", "text"], ["status", "وضعیت", "select", ["متصل", "آماده‌به‌کار", "غیرفعال"]]] },
  "new-hmi-page": { title: "صفحه HMI جدید", collection: "hmiPages", fields: [["name", "نام صفحه", "text"], ["machine", "ماشین", "text"], ["description", "توضیحات", "text"], ["components", "تعداد قطعات", "number"], ["status", "وضعیت", "select", ["فعال", "غیرفعال"]]] },
  "new-batch-config": { title: "تنظیم خط توزین", collection: "batchConfigs", fields: [["code", "کد تنظیمات", "text"], ["name", "نام تنظیمات", "text"], ["line", "خط تولید", "text"], ["samples", "تعداد نمونه", "number"], ["tolerance_percent", "حد مجاز خطا (%)", "number"], ["stabilization_seconds", "زمان پایدارسازی (ثانیه)", "number"]] }
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
        : name === "formula" && schema.collection === "batches"
          ? store.list("batchConfigs").map(config => ({ value: config.name || config.formula || config.code, label: config.name || config.formula || config.code }))
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
  const rows = store.list("tags");
  const headers = ["name", "plc", "type", "address", "access", "unit", "value"];
  const csv = [headers.join(","), ...rows.map(row => headers.map(key => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "scada-demo-export.csv"; a.click(); URL.revokeObjectURL(url);
}

function applyTableFilters(button) {
  const group = button.closest(".filter-bar, .report-builder");
  if (!group) { toast("بخش فیلتر این صفحه مشخص نیست.", "warning"); return; }
  const terms = [...group.querySelectorAll("input, select")]
    .filter(field => field.type !== "date" && field.type !== "time")
    .map(field => {
      if (field.tagName === "SELECT") {
        const selectedText = field.selectedOptions?.[0]?.textContent || "";
        if (field.selectedIndex === 0 || /همه|انتخاب کنید|انتخاب/u.test(selectedText)) return "";
      }
      return String(field.value || "").trim().toLocaleLowerCase();
    }).filter(Boolean);
  const page = button.closest(".page-content") || document;
  const candidateTables = [...page.querySelectorAll(".panel table tbody")];
  const nextPanel = group.nextElementSibling?.matches(".panel") ? group.nextElementSibling : null;
  const tableBodies = nextPanel ? [...nextPanel.querySelectorAll("table tbody")] : candidateTables.slice(0, 1);
  const rows = tableBodies.flatMap(body => [...body.querySelectorAll("tr")]);
  if (!rows.length) { toast("جدولی برای اعمال این فیلترها وجود ندارد.", "info"); return; }
  let visible = 0;
  rows.forEach(row => {
    const text = row.textContent.toLocaleLowerCase();
    const match = terms.every(term => text.includes(term));
    row.hidden = !match;
    if (match) visible += 1;
  });
  toast(terms.length ? `${visible} ردیف از ${rows.length} ردیف نمایش داده شد.` : "همه ردیف‌ها نمایش داده شدند.", "info");
}

function openStartRunModal(machine) {
  const orders = store.list("orders").filter(order => ["در انتظار", "آزادشده"].includes(order.status));
  if (!orders.length) { toast("سفارش آزاد برای شروع تولید وجود ندارد.", "warning"); return; }
  const options = orders.map(order => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.code)} — ${escapeHtml(order.product)}</option>`).join("");
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="شروع تولید"><header class="modal-header"><h2>شروع تولید · ${escapeHtml(machine)}</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><form id="start-run-form" data-machine="${escapeHtml(machine)}"><div class="modal-fields"><label class="field"><span>سفارش تولید</span><select name="order_id" required>${options}</select></label></div><footer class="modal-footer"><button type="button" class="btn btn-light" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ایجاد و شروع اجرا</button></footer></form></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
}

function openQcReviewModal(qcId) {
  const row = store.list("qc").find(item => item.id === qcId);
  if (!row) { toast("رکورد کنترل کیفیت پیدا نشد.", "warning"); return; }
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="بررسی کنترل کیفیت"><header class="modal-header"><h2>بررسی ${escapeHtml(row.code || row.product || qcId)}</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><form id="qc-review-form" data-id="${escapeHtml(qcId)}"><div class="modal-fields"><label class="field"><span>پارامتر</span><input name="parameter" value="اندازه‌گیری دستی" required></label><label class="field"><span>مقدار واقعی</span><input name="actual" type="number" step="any" required></label><label class="field"><span>مقدار اسمی (اختیاری)</span><input name="nominal" type="number" step="any"></label><label class="field"><span>حداقل مجاز (اختیاری)</span><input name="minimum" type="number" step="any"></label><label class="field"><span>حداکثر مجاز (اختیاری)</span><input name="maximum" type="number" step="any"></label><label class="field"><span>واحد</span><input name="unit" placeholder="mm / Ω / kg"></label><label class="field"><span>تصمیم نهایی</span><select name="decision" required><option value="قبول">قبول</option><option value="مشروط">مشروط</option><option value="رد">رد</option></select></label><label class="field"><span>توضیحات</span><input name="note"></label></div><footer class="modal-footer"><button type="button" class="btn btn-light" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ثبت اندازه‌گیری و تصمیم</button></footer></form></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
}

function openProductionQuantityModal(runId) {
  const run = store.list("productionRuns").find(item => item.id === runId);
  if (!run) { toast("اجرای تولید پیدا نشد.", "warning"); return; }
  if (run.status !== "در حال تولید") { toast("ثبت مقدار فقط برای اجرای فعال مجاز است.", "warning"); return; }
  document.getElementById("modal-root").innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="ثبت مقدار تولید"><header class="modal-header"><h2>ثبت مقدار تولید · ${escapeHtml(run.order || run.product)}</h2><button class="icon-btn" data-action="close-modal" aria-label="بستن">×</button></header><form id="production-quantity-form" data-id="${escapeHtml(runId)}"><div class="modal-fields"><label class="field"><span>مقدار تولید در این ثبت (${escapeHtml(run.unit || "واحد")})</span><input name="quantity" type="number" min="0.001" step="any" required></label><label class="field"><span>ضایعات این ثبت (${escapeHtml(run.unit || "واحد")})</span><input name="scrap_quantity" type="number" min="0" step="any" value="0" required></label><label class="field"><span>توضیحات</span><input name="note" maxlength="1000"></label></div><footer class="modal-footer"><button type="button" class="btn btn-light" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ثبت مقدار در سرور</button></footer></form></section></div>`;
  document.querySelector(".modal-backdrop .modal")?.addEventListener("click", event => event.stopPropagation());
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function handleAction(action, element) {
  switch (action) {
    case "new-user": case "new-factory": case "new-plc": case "new-tag": case "new-alarm": case "new-trend": case "new-report": case "new-process": case "new-template": case "new-order": case "new-unit": case "new-qc": case "new-run": case "new-product": case "new-price": case "new-machine": case "new-hmi-page": case "new-batch-config":
      openModal(action); break;
    case "new-batch":
      if (!store.list("batchConfigs").length) { toast("ابتدا در تنظیمات توزین، حداقل یک فرمول و هاپر ذخیره کنید.", "warning"); break; }
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
    case "toggle-plc": {
      toast("تغییر وضعیت PLC فقط پس از پیاده‌سازی و آزمون درایور ارتباطی مجاز است؛ وضعیت سخت‌افزار از این دکمه جعل نمی‌شود.", "warning");
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
      const selectedMachine = card?.dataset.machine || document.querySelector('[name="operator-machine"]')?.value || "";
      if (!runId && card?.dataset.orderId) {
        runId = store.list("productionRuns").find(item => item.order_id === card.dataset.orderId && item.status !== "تکمیل‌شده")?.id;
      }
      if (!runId && card?.dataset.machine) {
        runId = store.list("productionRuns").find(item => item.machine === card.dataset.machine && item.status !== "تکمیل‌شده")?.id;
      }
      const currentRun = runId ? store.list("productionRuns").find(item => item.id === runId) : null;
      if (action === "start-run" && currentRun?.status === "در حال تولید") {
        toast("این اجرای تولید از قبل فعال است.", "info");
        break;
      }
      if (action === "stop-run" && currentRun && currentRun.status !== "در حال تولید") {
        toast("این اجرای تولید در حال حاضر فعال نیست.", "warning");
        break;
      }
      if (!runId && action === "start-run" && !card?.dataset.orderId && selectedMachine) {
        openStartRunModal(selectedMachine);
        break;
      }
      if (!runId && action === "start-run" && card?.dataset.orderId) {
        const order = store.list("orders").find(item => item.id === card.dataset.orderId);
        if (!order) throw new Error("سفارش انتخاب‌شده پیدا نشد.");
        const created = await store.add("productionRuns", {
          order: order.code, order_id: order.id, machine: selectedMachine || "نامشخص",
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
    case "approve-task": await api.decideWorkflowTask(element.dataset.id, "approve", ""); await store.refresh(); toast("وظیفه در Backend تأیید شد."); break;
    case "reject-task": {
      const note = prompt("دلیل رد وظیفه را وارد کنید:", "");
      if (note === null) break;
      await api.decideWorkflowTask(element.dataset.id, "reject", note);
      await store.refresh();
      toast("رد وظیفه در Backend ثبت شد.", "info");
      break;
    }
    case "review-qc": openQcReviewModal(element.dataset.id); break;
    case "apply-filter": applyTableFilters(element); break;
    case "start-batch": {
      const batchId = element.dataset.id || store.list("batches").find(item => item.status !== "تکمیل‌شده" && item.status !== "لغوشده")?.id;
      if (!batchId) { toast("ابتدا از دکمه «بچ جدید» یک بچ ثبت کنید.", "warning"); break; }
      await api.startBatch(batchId); await store.refresh();
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "در حال توزین (حالت شبیه‌سازی)";
      toast("وضعیت بچ در سرور شروع شد؛ هیچ فرمانی به هاپر واقعی ارسال نشد.", "info"); break;
    }
    case "stop-batch": {
      const batchId = element.dataset.id || store.list("batches").find(item => item.status === "در حال توزین")?.id || store.list("batches")[0]?.id;
      if (!batchId) { toast("بچ فعالی برای توقف وجود ندارد.", "warning"); break; }
      await api.stopBatch(batchId); await store.refresh();
      const status = document.querySelector("[data-batch-status]");
      if (status) status.textContent = "متوقف‌شده";
      toast("بچ در سرور متوقف شد؛ عملیات توزین سخت‌افزاری انجام نشد.", "info"); break;
    }
    case "record-production-quantity": openProductionQuantityModal(element.dataset.id); break;
    case "complete-run": {
      const runId = element.dataset.id;
      if (!runId) break;
      await api.completeRun(runId);
      await store.refresh();
      toast("اجرای تولید تکمیل و در سرور ثبت شد.");
      break;
    }
    case "complete-batch": {
      const batchId = element.dataset.id || store.list("batches").find(item => item.status === "در حال توزین")?.id;
      if (!batchId) { toast("بچ فعالی برای تکمیل وجود ندارد.", "warning"); break; }
      await api.completeBatch(batchId);
      await store.refresh();
      toast("بچ پس از بررسی تلرانس‌ها تکمیل شد.");
      break;
    }
    case "record-production-quantity":
      openProductionQuantityModal(element.dataset.id);
      break;
    case "complete-run": {
      const run = store.list("productionRuns").find(item => item.id === element.dataset.id);
      if (!run || run.status !== "در حال تولید") { toast("اجرای فعال برای تکمیل وجود ندارد.", "warning"); break; }
      if (!confirm("اجرای تولید تکمیل شود؟ پس از تکمیل ثبت مقدار جدید امکان‌پذیر نیست.")) break;
      await api.completeRun(run.id);
      await store.refresh();
      toast("اجرای تولید در Backend تکمیل شد.");
      break;
    }
    case "print-label": window.print(); break;
    case "run-report": {
      const group = element.closest(".report-builder, .filter-bar");
      const parameters = group ? Object.fromEntries([...group.querySelectorAll("input, select")].filter(field => field.name && field.value).map(field => [field.name, field.value])) : {};
      const reportId = element.dataset.id || store.list("reports").find(item => item.status !== "غیرفعال")?.id;
      if (!reportId) { toast("ابتدا یک قالب گزارش فعال ثبت کنید.", "warning"); break; }
      const result = await api.runReport(reportId, parameters);
      await store.refresh();
      downloadJson(`scada-report-${result.id}.json`, result.result || result);
      toast(`گزارش ذخیره‌شده تولید و فایل JSON آن دریافت شد: ${result.id}`);
      break;
    }
    case "write-tag": { const tag = store.list("tags").find(item => item.id === element.dataset.id); if (!tag) break; const raw = prompt(`مقدار جدید برای ${tag.name} (${tag.type})`, String(tag.value ?? "")); if (raw === null) break; let value = raw; if (tag.type === "bool") { const normalized = raw.trim().toLowerCase(); if (!["true","false","1","0"].includes(normalized)) throw new Error("Boolean باید true / false یا 1 / 0 باشد."); value = normalized === "true" || normalized === "1"; } else if (["int16","uint16","int32","uint32"].includes(tag.type)) { if (!/^-?\d+$/.test(raw.trim())) throw new Error("مقدار این تگ باید عدد صحیح باشد."); value = Number.parseInt(raw, 10); } else if (tag.type === "float32") { value = Number(raw); if (!Number.isFinite(value)) throw new Error("مقدار این تگ باید عدد معتبر باشد."); } await api.writeTag(tag.id, value); await store.refresh(); toast("مقدار در دیتابیس شبیه‌سازی تغییر کرد؛ PLC واقعی نوشته نشد.", "info"); break; }
    case "open-modal-info": toast("این عملیات هنوز در نسخه متصل تعریف نشده است.", "info"); break;
    default: toast("این فرمان در نسخه نمایشی تعریف نشده است.", "info");
  }
}

export async function handleSubmit(event) {
  if (event.target.matches('[data-local-form]:not([data-local-form="batch-weighment"])')) {
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
        const match = key.match(/^hopper_(\d+)_(bin|material|ratio|target)$/);
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
        const match = key.match(/^parameter_(\d+)_(parameter|nominal|min|max|unit|method)$/);
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
  if (event.target.id === "production-report-filter") {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    const filters = Object.fromEntries(Object.entries(values).filter(([, value]) => String(value).trim() !== ""));
    const result = await api.analyticsProduction(filters);
    store.replaceCollection("productionReportRows", result.items || []);
    store.replaceCollection("productionReportSummary", [result.summary || {}]);
    toast(`${(result.items || []).length} ردیف گزارش از Backend دریافت شد.`);
    return true;
  }
  if (event.target.id === "production-quantity-form") {
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    const quantity = Number(values.quantity);
    const scrap_quantity = Number(values.scrap_quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(scrap_quantity) || scrap_quantity < 0) {
      throw new Error("مقدار تولید و ضایعات باید اعداد معتبر باشند.");
    }
    await api.recordProductionQuantity(form.dataset.id, {
      quantity, scrap_quantity, note: values.note || ""
    });
    await store.refresh();
    document.getElementById("modal-root").innerHTML = "";
    toast("مقدار تولید و ضایعات در سوابق سرور ثبت شد.");
    return true;
  }
  if (event.target.id === "production-quantity-form") {
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    const quantity = Number(values.quantity);
    const scrap = Number(values.scrap_quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(scrap) || scrap < 0) {
      throw new Error("مقدار تولید و ضایعات باید عدد معتبر باشند.");
    }
    await api.recordProductionQuantity(form.dataset.id, {
      quantity, scrap_quantity: scrap, note: values.note || ""
    });
    await store.refresh();
    document.getElementById("modal-root").innerHTML = "";
    toast("مقدار تولید و ضایعات در تاریخچه Backend ثبت شد.");
    return true;
  }
  if (event.target.id === "start-run-form") {
    event.preventDefault();
    const form = event.target;
    const order = store.list("orders").find(item => item.id === new FormData(form).get("order_id"));
    if (!order) throw new Error("سفارش انتخاب‌شده پیدا نشد.");
    const created = await store.add("productionRuns", {
      order: order.code, order_id: order.id, machine: form.dataset.machine,
      product: order.product, target: Number(order.quantity), unit: order.unit,
      quantity_actual: 0, scrap_quantity: 0, status: "آماده"
    });
    await api.startRun(created.id);
    await store.refresh();
    document.getElementById("modal-root").innerHTML = "";
    toast("اجرای تولید در سرور ایجاد و شروع شد.");
    return true;
  }
  if (event.target.id === "qc-review-form") {
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    const measurement = {
      parameter: values.parameter,
      actual: Number(values.actual),
      nominal: values.nominal === "" ? null : Number(values.nominal),
      minimum: values.minimum === "" ? null : Number(values.minimum),
      maximum: values.maximum === "" ? null : Number(values.maximum),
      unit: values.unit,
      note: values.note
    };
    if (!Number.isFinite(measurement.actual)) throw new Error("مقدار واقعی باید عدد معتبر باشد.");
    await api.recordQcMeasurement(form.dataset.id, measurement);
    await api.decideQc(form.dataset.id, values.decision, values.note);
    await store.refresh();
    document.getElementById("modal-root").innerHTML = "";
    toast("اندازه‌گیری و تصمیم کنترل کیفیت در سرور ثبت شد.");
    return true;
  }
  if (event.target.matches('[data-local-form="batch-weighment"]')) {
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    const items = [];
    for (let index = 0; index < Number(form.dataset.hopperCount || 0); index += 1) {
      const target = Number(values[`hopper_${index}_target`]);
      const actual = Number(values[`hopper_${index}_actual`]);
      if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(actual) || actual < 0) {
        throw new Error("وزن هدف و وزن واقعی هر هاپر باید عدد معتبر باشند.");
      }
      items.push({
        hopper_key: values[`hopper_${index}_key`],
        material: values[`hopper_${index}_material`],
        target_weight: target,
        actual_weight: actual,
        unit: "kg"
      });
    }
    if (!items.length) throw new Error("حداقل یک هاپر برای ثبت توزین لازم است.");
    const batchId = form.dataset.batchId;
    const result = await api.recordBatchWeighments(batchId, { items });
    await store.refresh();
    toast(result.items.some(item => item.result !== "IN_TOLERANCE")
      ? "توزین ثبت شد؛ حداقل یک ماده خارج از تلرانس است."
      : "توزین آزمایشی در سرور ثبت شد؛ داده از لودسل واقعی نیست.",
      result.items.some(item => item.result !== "IN_TOLERANCE") ? "warning" : "info");
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
  if (schema.collection === "batches") {
    const config = store.list("batchConfigs").find(item => [item.name, item.code, item.formula].includes(values.formula));
    if (!config) throw new Error("فرمول انتخاب‌شده در تنظیمات توزین پیدا نشد.");
    values.tolerance_percent = Number(config.tolerance_percent ?? 0.5);
    values.batch_config_id = config.id;
  }
  let saved;
  if (form.dataset.editId) saved = await store.update(schema.collection, form.dataset.editId, values);
  else saved = await store.add(schema.collection, values);
  if (saved?.temporary_password) alert(`رمز موقت کاربر (فقط همین یک‌بار):\\n${saved.temporary_password}`);
  document.getElementById("modal-root").innerHTML = "";
  toast("اطلاعات در پایگاه داده سرور ذخیره شد.");
  return true;
}

export function showToast(message, type = "success") { toast(message, type); }
