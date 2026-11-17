import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, lineChart, emptyState } from "../../shared/ui.js";

const lines = ["کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "قرقره‌پیچ"];

function runPage() {
  const runs = store.list("productionRuns");
  const machines = store.list("machines");
  const active = runs.filter(run => run.status === "در حال تولید");
  const completed = runs.filter(run => run.status === "تکمیل‌شده");
  const cards = machines.map(machine => {
    const current = active.find(run => run.machine === machine.name);
    const run = current || runs.find(item => item.machine === machine.name);
    return `<article class="machine-status-card" data-run-card data-machine="${machine.name}" data-run-id="${current?.id || ""}"><div class="machine-status-top"><b>${machine.name}</b>${pill(current ? "در حال تولید" : machine.status || "بدون اجرای فعال", current ? "success" : "warning")}</div><small>${machine.code || "—"}</small><div class="machine-status-value"><span>اجرای فعال</span><b>${current?.order || "بدون سفارش"}</b></div><div class="machine-status-value"><span>مقدار ثبت‌شده</span><b>${Number(current?.quantity_actual || run?.quantity_actual || 0).toLocaleString("fa-IR")} <small>${run?.unit || ""}</small></b></div><div class="machine-status-actions"><button class="btn btn-light btn-sm" data-action="start-run" ${current ? "disabled" : ""}>شروع</button><button class="btn btn-light btn-sm" data-action="stop-run" ${current ? "" : "disabled"}>توقف</button></div><small data-run-status>${current ? "وضعیت از Backend" : "بدون اجرای فعال"}</small></article>`;
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
  const products = [
    { code: "CB-001", name: "کابل قدرت NYY 4×16mm²", unit: "m", fields: "قرارداد، مشتری، قرقره" },
    { code: "WR-010", name: "سیم 1×10 افشان", unit: "m", fields: "قرارداد، رنگ، وزن" },
    { code: "WR-004", name: "سیم افشان H07V-K 4mm²", unit: "m", fields: "قرارداد، رنگ" }
  ];
  return `<div>${pageHeader("پیکربندی کارخانه", "اطلاعات پایه، محصولات، اپراتورها و قواعد اجرای تولید")}
    ${tabs(["محصولات و فیلدها", "اپراتورها", "علل توقف", "نوع ورودی", "خطوط توقف", "نوع خروجی قرقره", "شماره‌گذاری اسناد", "قواعد برنامه"])}
    ${panel("محصولات", dataTable([{ key: "code", label: "کد محصول" }, { key: "name", label: "نام محصول" }, { key: "unit", label: "واحد اصلی" }, { key: "fields", label: "فیلدهای اختصاصی" }, { key: "action", label: "تنظیم", render: () => `<button class="btn btn-light btn-sm" data-action="open-modal-info">فیلدها</button>` }], products))}
    <div class="two-col-grid">${panel("اپراتورها", dataTable([{ key: "name", label: "نام" }, { key: "code", label: "کد" }, { key: "role", label: "نقش" }], [{ name: "اپراتور نمونه", code: "OP-01", role: "اپراتور تولید" }, { name: "سرپرست شیفت", code: "SP-01", role: "سرپرست" }]))}${panel("علل توقف", dataTable([{ key: "code", label: "کد" }, { key: "reason", label: "علت توقف" }, { key: "group", label: "گروه" }], [{ code: "DWN-01", reason: "تنظیم / تعویض قالب", group: "فرآیندی" }, { code: "DWN-02", reason: "کمبود مواد اولیه", group: "تأمین" }, { code: "DWN-03", reason: "خرابی دستگاه", group: "فنی" }]))}</div>
    <div class="two-col-grid">${panel("قواعد شماره‌گذاری", `<div class="storage-list"><div><span>شماره سفارش</span><b>PO-{YEAR}-{SEQ:6}</b></div><div><span>قرقره تولید</span><b>RL-{YEAR}-{SEQ:6}</b></div><div><span>شماره قرارداد</span><b>CT-{YEAR}-{SEQ:5}</b></div></div>`)}${panel("قواعد اجرای برنامه", `<div class="rule-list"><p>الزام انتخاب سفارش پیش از شروع تولید</p><p>ثبت کنتور تولید در زمان توقف و شروع مجدد</p><p>ثبت علت برای توقف‌های برنامه‌ریزی‌نشده</p></div>`)}</div>
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
