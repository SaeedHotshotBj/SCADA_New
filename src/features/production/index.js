import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, lineChart, emptyState } from "../../shared/ui.js";

function runPage() {
  const runs = store.list("productionRuns");
  const machines = store.list("machines");
  const active = runs.filter(run => run.status === "در حال تولید");
  const completed = runs.filter(run => run.status === "تکمیل‌شده");
  const cards = machines.map(machine => {
    const current = active.find(run => run.machine === machine.name);
    const run = current || runs.find(item => item.machine === machine.name);
    return `<article class="machine-status-card" data-run-card data-machine="${machine.name}" data-run-id="${current?.id || ""}"><div class="machine-status-top"><b>${machine.name}</b>${pill(current ? "در حال تولید" : "بدون اجرای فعال", current ? "success" : "warning")}</div><small>${machine.code || "—"}</small><div class="machine-status-value"><span>اجرای فعال</span><b>${current?.order || "بدون سفارش"}</b></div><div class="machine-status-value"><span>مقدار ثبت‌شده</span><b>${Number(current?.quantity_actual || run?.quantity_actual || 0).toLocaleString("fa-IR")} <small>${run?.unit || ""}</small></b></div><div class="machine-status-actions"><button class="btn btn-light btn-sm" data-action="start-run" ${current ? "disabled" : ""}>شروع</button><button class="btn btn-light btn-sm" data-action="stop-run" ${current ? "" : "disabled"}>توقف</button></div><small data-run-status>${current ? "وضعیت از Backend" : "بدون اجرای فعال"}</small></article>`;
  }).join("");
  return `<div class="production-page">${pageHeader("اجرای تولید", "شروع، توقف، ثبت مقدار تولید و تکمیل اجرای سفارش در Backend", `${button("اجرای جدید", "new-run", { icon: "+" })}${button("ماشین جدید", "new-machine", { variant: "light" })}`)}
    <div class="stats-grid stats-grid-4">${statCard("کل اجراها", runs.length, "اجرا", "blue")}${statCard("در حال تولید", active.length, "اجرا", "green")}${statCard("متوقف / آماده", runs.filter(run => ["متوقف", "آماده"].includes(run.status)).length, "اجرا", "orange")}${statCard("تکمیل‌شده", completed.length, "اجرا", "purple")}</div>
    ${panel("وضعیت ماشین‌های ثبت‌شده", cards || emptyState("هنوز ماشینی در Backend ثبت نشده است."))}
    ${panel("تاریخچه اجرای تولید", runs.length ? dataTable([
      { key: "order", label: "سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" },
      { key: "target", label: "هدف" }, { key: "quantity_actual", label: "مقدار تولید" },
      { key: "scrap_quantity", label: "ضایعات" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "آماده", row.status === "در حال تولید" ? "success" : row.status === "تکمیل‌شده" ? "info" : "warning") },
      { key: "actions", label: "عملیات", render: row => row.status === "در حال تولید"
        ? `<button class="btn btn-light btn-sm" data-action="record-production-quantity" data-id="${row.id}">ثبت مقدار</button> <button class="btn btn-light btn-sm" data-action="stop-run" data-id="${row.id}">توقف</button> <button class="btn btn-primary btn-sm" data-action="complete-run" data-id="${row.id}">تکمیل</button>`
        : row.status === "تکمیل‌شده" ? "—" : `<button class="btn btn-light btn-sm" data-action="start-run" data-id="${row.id}">شروع مجدد</button>` }
    ], runs) : emptyState("هنوز اجرای تولیدی ثبت نشده است."))}
  </div>`;
}
function machinesPage() {
  const rows = store.list("machines");
  return `<div data-collection-name="machines" data-edit-action="new-machine">${pageHeader("ماشین‌ها و خطوط تولید", "تعریف ماشین‌ها و مشخصات خطوط؛ وضعیت آنلاین فقط از درایور سخت‌افزاری معتبر می‌شود.", button("ماشین جدید", "new-machine", { icon: "+" }))}
    ${rows.length ? panel("فهرست ماشین‌ها", dataTable([
      { key: "name", label: "ماشین" }, { key: "code", label: "کد تجهیز" },
      { key: "status", label: "وضعیت تعریف", render: row => pill(row.status || "ثبت‌شده", "info") },
      { key: "actions", label: "عملیات", render: row => `<button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش</button> <button class="btn btn-light btn-sm" data-action="delete-record" data-collection="machines" data-id="${row.id}">حذف</button>` }
    ], rows)) : emptyState("ماشینی تعریف نشده است.")}
  </div>`;
}
function configPage() {
  const products = store.list("products");
  const fields = store.list("productFields");
  const users = store.list("users");
  const reasons = store.list("downtimeReasons");
  const inputTypes = store.list("inputTypes");
  const stopLines = store.list("stopLines");
  const outputTypes = store.list("outputTypes");
  const sequences = store.list("documentSequences");
  const rules = store.list("productionRules");
  const dictionaryTable = (rows, columns, empty) => rows.length ? dataTable(columns, rows, { actions: true }) : emptyState(empty);
  return `<div class="factory-config-page">${pageHeader("پیکربندی کارخانه", "تعاریف پایه و قواعد اجرایی از Backend خوانده و در همان‌جا ذخیره می‌شوند.")}
    <div class="two-col-grid">
      <section data-collection-name="products" data-edit-action="new-product">${panel("محصولات", `${button("محصول جدید", "new-product", { icon: "+" })}${dictionaryTable(products, [{ key: "code", label: "کد محصول" }, { key: "name", label: "نام محصول" }, { key: "unit", label: "واحد اصلی" }, { key: "status", label: "وضعیت" }], "محصولی ثبت نشده است.")}`)}</section>
      <section data-collection-name="productFields" data-edit-action="new-product-field">${panel("فیلدهای اختصاصی محصول", `${button("فیلد جدید", "new-product-field", { icon: "+" })}${dictionaryTable(fields, [{ key: "product_code", label: "محصول" }, { key: "name", label: "نام فیلد" }, { key: "field_type", label: "نوع" }, { key: "required", label: "الزامی" }, { key: "options", label: "گزینه‌ها" }], "فیلد اختصاصی تعریف نشده است.")}`)}</section>
      ${panel("اپراتورها و کاربران", users.length ? dataTable([{ key: "name", label: "نام" }, { key: "email", label: "ایمیل" }, { key: "role", label: "نقش" }, { key: "status", label: "وضعیت" }], users) : emptyState("کاربری برای نمایش در دسترس نیست."))}
      <section data-collection-name="downtimeReasons" data-edit-action="new-downtime-reason">${panel("علل توقف", `${button("علت توقف جدید", "new-downtime-reason", { icon: "+" })}${dictionaryTable(reasons, [{ key: "code", label: "کد" }, { key: "reason", label: "علت توقف" }, { key: "group", label: "گروه" }], "علت توقفی تعریف نشده است.")}`)}</section>
      <section data-collection-name="inputTypes" data-edit-action="new-input-type">${panel("انواع ورودی", `${button("نوع ورودی جدید", "new-input-type", { icon: "+" })}${dictionaryTable(inputTypes, [{ key: "code", label: "کد" }, { key: "name", label: "عنوان" }, { key: "unit", label: "واحد" }, { key: "description", label: "توضیحات" }], "نوع ورودی تعریف نشده است.")}`)}</section>
      <section data-collection-name="stopLines" data-edit-action="new-stop-line">${panel("خطوط توقف", `${button("خط توقف جدید", "new-stop-line", { icon: "+" })}${dictionaryTable(stopLines, [{ key: "code", label: "کد" }, { key: "name", label: "نام" }, { key: "description", label: "توضیحات" }], "خط توقفی تعریف نشده است.")}`)}</section>
      <section data-collection-name="outputTypes" data-edit-action="new-output-type">${panel("انواع خروجی قرقره", `${button("نوع خروجی جدید", "new-output-type", { icon: "+" })}${dictionaryTable(outputTypes, [{ key: "code", label: "کد" }, { key: "name", label: "عنوان" }, { key: "unit", label: "واحد" }, { key: "description", label: "توضیحات" }], "نوع خروجی تعریف نشده است.")}`)}</section>
      <section data-collection-name="documentSequences" data-edit-action="new-document-sequence">${panel("قواعد شماره‌گذاری اسناد", `${button("قاعده جدید", "new-document-sequence", { icon: "+" })}${dictionaryTable(sequences, [{ key: "document", label: "نوع سند" }, { key: "prefix", label: "پیشوند" }, { key: "year_pattern", label: "الگوی سال" }, { key: "sequence_length", label: "طول توالی" }], "قاعده شماره‌گذاری تعریف نشده است.")}`)}</section>
      <section data-collection-name="productionRules" data-edit-action="new-production-rule">${panel("قواعد اجرای تولید", `${button("قاعده جدید", "new-production-rule", { icon: "+" })}${dictionaryTable(rules, [{ key: "code", label: "کد" }, { key: "name", label: "نام قاعده" }, { key: "rule", label: "شرح قاعده" }, { key: "status", label: "وضعیت" }], "قاعده‌ای تعریف نشده است.")}`)}</section>
    </div>
    <div class="insight insight-info">این صفحه تعاریف و قواعد را ذخیره می‌کند؛ موتور اجرای خودکار قواعد و تولید شماره ترتیبی هنوز به چرخه سفارش/تولید متصل نشده است.</div>
  </div>`;
}
function pricesPage() {
  const prices = store.list("prices");
  const products = store.list("products");
  return `<div data-collection-name="prices" data-edit-action="new-price">${pageHeader("قیمت‌ها و تعرفه‌ها", "مدیریت قیمت مواد اولیه و تعرفه انرژی در پایگاه داده", button("قیمت جدید", "new-price", { icon: "+" }))}${tabs(["مواد اولیه و قیمت", "تعرفه انرژی"])}
    <div class="two-col-grid">${panel("محصولات / مواد ثبت‌شده", products.length ? dataTable([{ key: "code", label: "کد" }, { key: "name", label: "نام" }, { key: "unit", label: "واحد" }, { key: "status", label: "وضعیت" }], products) : emptyState("محصول یا ماده‌ای ثبت نشده است."))}
      ${panel("قیمت‌ها و تعرفه‌ها", prices.length ? dataTable([{ key: "kind", label: "نوع" }, { key: "code", label: "کد" }, { key: "name", label: "نام" }, { key: "price", label: "قیمت" }, { key: "currency", label: "واحد پول" }, { key: "unit", label: "واحد اندازه‌گیری" }, { key: "valid_from", label: "اعتبار از" }], prices) : emptyState("قیمت یا تعرفه‌ای ثبت نشده است."))}
    </div>
  </div>`;
}
function productionReportPage() {
  const snapshot = store.snapshot();
  const data = snapshot.productionAnalytics || {};
  const rows = Array.isArray(snapshot.productionReportRows) ? snapshot.productionReportRows : (data.items || []);
  const byDay = data.by_day || [];
  const summary = (snapshot.productionReportSummary || [])[0] || data.summary || {};
  const filters = `<form id="production-report-filter" class="report-builder">
    <label class="field"><span>از تاریخ</span><input type="date" name="start_date"></label>
    <label class="field"><span>تا تاریخ</span><input type="date" name="end_date"></label>
    <label class="field"><span>وضعیت</span><select name="status"><option value="">همه وضعیت‌ها</option><option>در حال تولید</option><option>متوقف</option><option>تکمیل‌شده</option></select></label>
    <label class="field"><span>خط تولید</span><input name="machine" placeholder="نام دقیق ماشین"></label>
    <label class="field"><span>محصول</span><input name="product" placeholder="نام دقیق محصول"></label>
    <button class="btn btn-primary" type="submit">اعمال فیلتر از سرور</button>
  </form>`;
  return `<div>${pageHeader("گزارش تولید", "گزارش از اجرای تولید، مقدار واقعی، ضایعات و روند روزانه در Backend", button("خروجی CSV", "export-csv", { variant: "light" }))}
    ${filters}
    <div class="stats-grid stats-grid-3">${statCard("تعداد اجرا", Number(summary.run_count || rows.length).toLocaleString("fa-IR"), "اجرا", "blue")}${statCard("مقدار تولید ثبت‌شده", Number(summary.quantity_actual || 0).toLocaleString("fa-IR"), "واحد", "green")}${statCard("ضایعات ثبت‌شده", Number(summary.scrap_quantity || 0).toLocaleString("fa-IR"), "واحد", "orange")}</div>
    ${lineChart("روند مقدار تولید روزانه", undefined, "#1699c8", byDay.length ? byDay.map(item => Number(item.quantity || 0)) : [0])}
    ${panel("جزئیات اجرای تولید", rows.length ? dataTable([{ key: "order", label: "سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "خط" }, { key: "target", label: "هدف" }, { key: "quantity_actual", label: "مقدار تولید" }, { key: "scrap_quantity", label: "ضایعات" }, { key: "status", label: "وضعیت" }, { key: "started_at", label: "تاریخ شروع" }], rows) : emptyState("در بازه انتخاب‌شده اجرای تولیدی ثبت نشده است."))}
  </div>`;
}
export function renderProduction(path) {
  switch (path) {
    case "/production/machines": return machinesPage();
    case "/production/config": return configPage();
    case "/production/prices": return pricesPage();
    case "/production/report": return productionReportPage();
    default: return runPage();
  }
}
