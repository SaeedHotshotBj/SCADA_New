import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, lineChart, emptyState } from "../../shared/ui.js";

const lines = ["کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "قرقره‌پیچ"];

function runPage() {
  const runs = store.list("productionRuns");
  return `<div class="production-page">${pageHeader("اجرای تولید", "ثبت اجرای سفارش و پیگیری وضعیت عملیات روی ماشین‌ها", button("شروع اجرای جدید", "new-run", { icon: "+" }))}
    <div class="stats-grid stats-grid-4">${statCard("اجراهای امروز", "۱۲", "اجرا", "blue")}${statCard("در حال اجرا", "۴", "ماشین", "green")}${statCard("متوقف", "۲", "ماشین", "red")}${statCard("تکمیل‌شده", "۶", "سفارش", "orange")}</div>
    ${panel("وضعیت ماشین‌ها", `<div class="machine-status-grid">${lines.map((machine, i) => `<article class="machine-status-card" data-run-card><div class="machine-status-top"><b>${machine}</b>${pill(i % 3 === 1 ? "متوقف" : "در حال تولید", i % 3 === 1 ? "warning" : "success")}</div><small>LINE-${String(i + 1).padStart(2, "0")}</small><div class="machine-status-value"><span>سرعت فعلی</span><b>${[31.7, 599.7, 120.1, 300, 60.2, 120][i]} <small>m/min</small></b></div><div class="machine-status-value"><span>توان</span><b>${[67.8, 220.4, 115.4, 191.2, 89.9, 63][i]} <small>kW</small></b></div><div class="machine-status-actions"><a class="btn btn-light btn-sm" href="#/planning/operator">ایستگاه اپراتور</a></div><small data-run-status>وضعیت نمایشی</small></article>`).join("")}</div>`)}
    ${panel("تاریخچه اجرای تولید", dataTable([{ key: "order", label: "سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "target", label: "هدف" }, { key: "started_at", label: "شروع" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", row.status === "در حال تولید" ? "success" : "warning") }, { key: "actions", label: "عملیات", render: row => row.status === "در حال تولید" ? `<button class="btn btn-light btn-sm" data-action="stop-run" data-id="${row.id}">توقف</button>` : `<button class="btn btn-primary btn-sm" data-action="start-run" data-id="${row.id}">شروع</button>` }], runs))}
  </div>`;
}

function machinesPage() {
  const rows = store.list("machines");
  return `<div class="machine-directory" data-collection-name="machines" data-edit-action="new-machine">${pageHeader("ماشین‌ها و خطوط تولید", "مدیریت فهرست ماشین‌ها و کدهای تجهیز", button("ماشین جدید", "new-machine", { icon: "+" }))}
    ${rows.length ? rows.map(machine => `<article class="directory-card"><div class="directory-icon">⚙</div><div><h3>${machine.name}</h3><p>کد تجهیز: ${machine.code || "—"}</p></div><div class="directory-meta">${pill(machine.status || "تعریف‌شده", machine.status === "متصل" ? "success" : "info")}<small>وضعیت ثبت‌شده در سامانه</small></div><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${machine.id}">ویرایش</button><button class="btn btn-light btn-sm" data-action="delete-record" data-collection="machines" data-id="${machine.id}">حذف</button></article>`).join("") : emptyState("ماشینی ثبت نشده است.")}
  </div>`;
}

function configPage() {
  const products = store.list("products");
  return `<div class="factory-config" data-collection-name="products" data-edit-action="new-product">${pageHeader("پیکربندی کارخانه", "مدیریت محصولات ثبت‌شده و قواعد پایه کارخانه", button("محصول جدید", "new-product", { icon: "+" }))}
    ${tabs(["محصولات و فیلدها", "اپراتورها", "علل توقف", "نوع ورودی", "خطوط توقف", "نوع خروجی قرقره", "شماره‌گذاری اسناد", "قواعد برنامه"])}
    ${panel("محصولات", dataTable([{ key: "code", label: "کد محصول" }, { key: "name", label: "نام محصول" }, { key: "unit", label: "واحد اصلی" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") }], products, { actions: true }))}
    <div class="two-col-grid">${panel("قواعد شماره‌گذاری", `<div class="storage-list"><div><span>شماره سفارش</span><b>PO-{YEAR}-{SEQ:6}</b></div><div><span>قرقره تولید</span><b>RL-{YEAR}-{SEQ:6}</b></div><div><span>شماره قرارداد</span><b>CT-{YEAR}-{SEQ:5}</b></div></div>`)}${panel("قواعد اجرای برنامه", `<div class="rule-list"><p>الزام انتخاب سفارش پیش از شروع تولید</p><p>ثبت کنتور تولید در زمان توقف و شروع مجدد</p><p>ثبت علت برای توقف‌های برنامه‌ریزی‌نشده</p></div>`)}</div>
  </div>`;
}

function pricesPage() {
  const rows = store.list("prices");
  return `<div class="price-page" data-collection-name="prices" data-edit-action="new-price">${pageHeader("قیمت‌ها و تعرفه‌ها", "مدیریت قیمت مواد اولیه و تعرفه انرژی", button("ثبت قیمت / تعرفه", "new-price", { icon: "+" }))}
    ${tabs(["مواد اولیه", "قیمت مواد", "تعرفه انرژی"])}
    ${panel("فهرست قیمت‌ها و تعرفه‌های ثبت‌شده", rows.length ? dataTable([{ key: "kind", label: "گروه" }, { key: "code", label: "کد" }, { key: "name", label: "عنوان" }, { key: "price", label: "مبلغ واحد", render: row => Number(row.price || 0).toLocaleString("fa-IR") }, { key: "currency", label: "واحد پول" }, { key: "unit", label: "واحد اندازه‌گیری" }, { key: "valid_from", label: "تاریخ اعتبار" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") }], rows, { actions: true }) : emptyState("قیمت یا تعرفه‌ای ثبت نشده است.")}
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
