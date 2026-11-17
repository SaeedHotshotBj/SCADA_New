import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, lineChart, emptyState } from "../../shared/ui.js";

const lines = ["کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "قرقره‌پیچ"];

function runPage() {
  const runs = store.list("productionRuns");
  return `<div class="production-page">${pageHeader("اجرای تولید", "ثبت اجرای سفارش و پیگیری وضعیت عملیات روی ماشین‌ها", button("شروع اجرای جدید", "new-run", { icon: "+" }))}
    <div class="stats-grid stats-grid-4">${statCard("اجراهای امروز", "۱۲", "اجرا", "blue")}${statCard("در حال اجرا", "۴", "ماشین", "green")}${statCard("متوقف", "۲", "ماشین", "red")}${statCard("تکمیل‌شده", "۶", "سفارش", "orange")}</div>
    ${panel("وضعیت ماشین‌ها", `<div class="machine-status-grid">${lines.map((machine, i) => `<article class="machine-status-card" data-run-card data-machine="${machine}"><div class="machine-status-top"><b>${machine}</b>${pill(i % 3 === 1 ? "متوقف" : "در حال تولید", i % 3 === 1 ? "warning" : "success")}</div><small>LINE-${String(i + 1).padStart(2, "0")}</small><div class="machine-status-value"><span>سرعت فعلی</span><b>${[31.7, 599.7, 120.1, 300, 60.2, 120][i]} <small>m/min</small></b></div><div class="machine-status-value"><span>توان</span><b>${[67.8, 220.4, 115.4, 191.2, 89.9, 63][i]} <small>kW</small></b></div><div class="machine-status-actions"><button class="btn btn-light btn-sm" data-action="start-run">شروع</button><button class="btn btn-light btn-sm" data-action="stop-run">توقف</button></div><small data-run-status>وضعیت نمایشی</small></article>`).join("")}</div>`)}
    ${panel("تاریخچه اجرای تولید", dataTable([{ key: "order", label: "سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "target", label: "هدف" }, { key: "started_at", label: "شروع", render: row => row.started_at || "—" }, { key: "quantity_actual", label: "تولیدشده", render: row => `${Number(row.quantity_actual || 0).toLocaleString("fa-IR")} ${row.unit || ""}` }, { key: "scrap_quantity", label: "ضایعات", render: row => Number(row.scrap_quantity || 0).toLocaleString("fa-IR") }, { key: "status", label: "وضعیت", render: row => pill(row.status || "آماده", row.status === "در حال تولید" ? "success" : "warning") }, { key: "actions", label: "عملیات", render: row => row.status === "در حال تولید" ? `<button class="btn btn-light btn-sm" data-action="record-production-quantity" data-id="${row.id}">ثبت مقدار</button> <button class="btn btn-light btn-sm" data-action="complete-run" data-id="${row.id}">تکمیل</button>` : "—" }], runs))}
  </div>`;
}

function machinesPage() {
  return `<div>${pageHeader("ماشین‌ها و خطوط تولید", "نمایش ساختار خطوط، ماشین‌ها و وضعیت دسترسی تجهیزات")}
    <div class="machine-directory">${lines.map((machine, i) => `<article class="directory-card"><div class="directory-icon">${["⚙", "◉", "▤", "♨", "⇄", "▣"][i]}</div><div><h3>${machine}</h3><p>کد تجهیز: ${["RBD-01", "MWD-01", "BUN-01", "EXI-01", "LAY-01", "CPK-01"][i]}</p></div><div class="directory-meta">${pill(i === 4 ? "آماده‌به‌کار" : "متصل", "success")}<small>PLC · کنترل‌کننده خط</small></div><button class="btn btn-light btn-sm" data-action="open-modal-info">جزئیات</button></article>`).join("")}</div>
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
  return `<div>${pageHeader("قیمت‌ها و تعرفه‌ها", "مدیریت قیمت مواد اولیه، بهای مصرفی و تعرفه انرژی")}${tabs(["مواد اولیه", "قیمت مواد", "تعرفه انرژی"])}
    <div class="two-col-grid">${panel("مواد اولیه", dataTable([{ key: "code", label: "کد" }, { key: "name", label: "ماده" }, { key: "unit", label: "واحد" }, { key: "status", label: "وضعیت" }], [{ code: "CU-01", name: "مفتول مس", unit: "kg", status: pill("فعال", "success") }, { code: "PVC-01", name: "گرانول PVC", unit: "kg", status: pill("فعال", "success") }, { code: "XLPE-01", name: "گرانول XLPE", unit: "kg", status: pill("فعال", "success") }]))}${panel("آخرین قیمت مواد", dataTable([{ key: "name", label: "ماده" }, { key: "price", label: "قیمت واحد" }, { key: "currency", label: "واحد پول" }, { key: "date", label: "تاریخ اعتبار" }], [{ name: "مفتول مس", price: "۹۸۰٬۰۰۰", currency: "ریال / kg", date: "۱۴۰۵/۰۸/۰۱" }, { name: "گرانول PVC", price: "۲۸۰٬۰۰۰", currency: "ریال / kg", date: "۱۴۰۵/۰۸/۰۱" }]))}</div>
    ${panel("تعرفه انرژی", dataTable([{ key: "type", label: "نوع انرژی" }, { key: "period", label: "بازه مصرف" }, { key: "rate", label: "تعرفه" }, { key: "unit", label: "واحد" }], [{ type: "برق", period: "کم‌باری", rate: "۱٬۲۰۰", unit: "ریال / kWh" }, { type: "برق", period: "میان‌باری", rate: "۲٬۴۰۰", unit: "ریال / kWh" }, { type: "برق", period: "اوج بار", rate: "۴٬۸۰۰", unit: "ریال / kWh" }]))}
  </div>`;
}

function productionReportPage() {
  const rows = store.list("productionRuns");
  return `<div>${pageHeader("گزارش تولید", "گزارش‌گیری از مقدار تولید بر اساس خط، محصول، سفارش و بازه زمانی", button("خروجی CSV", "export-csv", { variant: "light" }))}
    <div class="report-builder">${dateFilter()}<label class="field"><span>وضعیت</span><select><option>همه وضعیت‌ها</option><option>تکمیل‌شده</option><option>در حال تولید</option></select></label><label class="field"><span>خط تولید</span><select><option>همه خطوط</option>${lines.map(x => `<option>${x}</option>`).join("")}</select></label><label class="field"><span>گروه‌بندی</span><select><option>روزانه</option><option>سفارش</option><option>محصول</option><option>ماشین</option></select></label><button class="btn btn-primary" data-action="apply-filter">ساخت گزارش</button></div>
    <div class="stats-grid stats-grid-3">${statCard("مقدار تولید", "۱۳٫۴", "میلیون m", "blue")}${statCard("مقدار ضایعات", "۶۸٫۸", "هزار kg", "orange")}${statCard("تعداد اجرای تولید", rows.length || "۱۲", "اجرا", "green")}</div>
    ${lineChart("روند مقدار تولید", undefined, "#1699c8", [18, 22, 19, 26, 24, 31, 35])}
    ${panel("جزئیات تولید", dataTable([{ key: "order", label: "سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "خط" }, { key: "quantity", label: "مقدار تولید" }, { key: "scrap", label: "ضایعات" }, { key: "date", label: "تاریخ", render: () => "۱۴۰۵/۰۸/۲۵" }], rows))}
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
