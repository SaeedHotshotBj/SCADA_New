import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, donutChart, barChart, lineChart, emptyState } from "../../shared/ui.js";

const qcSamples = [
  { code: "QC-CB-001148", product: "سیم 1×10 افشان", machine: "اکسترودر عایق", decision: "قبول", inspector: "qc1 b208", time: "امروز · ۱۰:۴۵" },
  { code: "QC-CB-001147", product: "کابل قدرت NYY 4×16", machine: "کابل‌کشی", decision: "مشروط", inspector: "qc1 b208", time: "امروز · ۰۹:۳۵" },
  { code: "QC-CB-001146", product: "سیم افشان H07V-K", machine: "بانچر", decision: "قبول", inspector: "کارشناس کیفیت", time: "دیروز · ۱۶:۲۰" }
];

function qualityDashboard() {
  return `<div class="quality-page">${pageHeader("داشبورد کنترل کیفیت", "شاخص‌های کیفی محصولات، نتایج بازرسی و عملکرد خطوط تولید")}
    <div class="stats-grid stats-grid-4">${statCard("تعداد بازرسی", "۱٬۲۸۴", "مورد", "blue")}${statCard("درصد پذیرش", "۹۶٫۸", "%", "green")}${statCard("درصد مردودی", "۱٫۷", "%", "red")}${statCard("در انتظار بررسی", "۱۹", "مورد", "orange")}</div>
    <div class="two-col-grid">${donutChart("نتیجه بازرسی‌ها", [82, 12, 6, 0])}${barChart("تعداد بازرسی بر اساس ماشین", ["بانچر", "اکسترودر", "کشش", "کابل‌کشی", "قرقره‌پیچ"], [74, 92, 66, 88, 58])}</div>
    <div class="two-col-grid">${lineChart("روند درصد پذیرش روزانه", undefined, "#16b98c", [92, 94, 91, 96, 95, 98, 97])}${panel("عملکرد خطوط", dataTable([{ key: "machine", label: "ماشین" }, { key: "count", label: "بازرسی" }, { key: "accept", label: "پذیرش" }, { key: "reject", label: "مردودی" }], ["اکسترودر عایق", "کابل‌کشی", "بانچر", "مولتی‌وایر"].map((machine, i) => ({ machine, count: [284, 318, 221, 186][i], accept: [97.2, 96.4, 98.1, 94.8][i] + "%", reject: [1.2, 1.8, 0.9, 3.1][i] + "%" }))))}</div>
  </div>`;
}

function qualityRecordsPage() {
  const rows = store.list("qc");
  return `<div class="collection-page" data-collection-name="qc" data-edit-action="new-qc">${pageHeader("سوابق کنترل کیفیت", "جستجو و مشاهده نتایج بازرسی‌های ثبت‌شده", button("ثبت کنترل کیفیت", "new-qc", { icon: "+" }))}
    <div class="filter-bar"><label class="field"><span>محصول</span><select><option>همه محصولات</option><option>سیم 1×10 افشان</option><option>کابل قدرت NYY</option></select></label><label class="field"><span>تصمیم</span><select><option>همه</option><option>قبول</option><option>مشروط</option><option>رد</option></select></label><label class="field"><span>ماشین</span><select><option>همه ماشین‌ها</option><option>اکسترودر عایق</option><option>کابل‌کشی</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("سوابق بازرسی", dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "inspector", label: "بازرس", render: row => row.inspector || "کارشناس کیفیت" }, { key: "decision", label: "تصمیم", render: row => pill(row.decision, row.decision === "قبول" ? "success" : row.decision === "رد" ? "danger" : "warning") }, { key: "time", label: "زمان" }], rows, { actions: true }))}
  </div>`;
}

function pendingPage() {
  const pending = store.list("qc").filter(row => ["در انتظار", "در حال بررسی"].includes(row.status));
  return `<div>${pageHeader("در انتظار بررسی", "نمونه‌هایی که از پایگاه داده منتظر تصمیم کارشناس کیفیت هستند.")}${statCard("موارد در انتظار", pending.length, "مورد", "orange")}${panel("صف بررسی کیفیت", pending.length ? dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "created_at", label: "زمان ثبت" }, { key: "action", label: "اقدام", render: row => `<button class="btn btn-primary btn-sm" data-action="review-qc" data-id="${row.id}">بررسی نتیجه</button>` }], pending) : emptyState("رکوردی در انتظار بررسی وجود ندارد."))}</div>`;
}

function planPage() {
  const plans = store.list("controlPlans");
  const parameterRows = plans.flatMap(plan => (plan.parameters || []).map(item => ({ product: plan.product, process: plan.process, version: plan.version, ...item })));
  const editor = '<form class="panel" data-local-form="control-plan"><div class="panel-body"><div class="form-grid">' +
    '<label class="field"><span>محصول</span><input name="product" value="کابل قدرت NYY 4×16mm²" required></label>' +
    '<label class="field"><span>مرحله فرآیند</span><input name="process" value="اکستروژن عایق" required></label>' +
    '<label class="field"><span>نسخه</span><input name="version" value="نسخه ۱" required></label>' +
    '<label class="field"><span>تناوب نمونه‌برداری</span><input name="sampling_interval" value="هر ۳۰ دقیقه" required></label>' +
    '<label class="field"><span>تعداد نمونه</span><input name="sample_count" type="number" min="1" value="3" required></label>' +
    '<label class="field"><span>مسئول کنترل</span><input name="responsible" value="کارشناس کیفیت"></label>' +
    '<label class="field"><span>الزام تأیید</span><select name="approval_required"><option value="true" selected>بله</option><option value="false">خیر</option></select></label></div></div>' +
    '<div class="panel-body"><h3>پارامتر کنترل</h3><div class="form-grid">' +
    '<label class="field"><span>پارامتر</span><input name="parameter_0_parameter" value="قطر عایق" required></label>' +
    '<label class="field"><span>مقدار اسمی</span><input name="parameter_0_nominal" value="2.40"></label>' +
    '<label class="field"><span>حداقل مجاز</span><input name="parameter_0_min" value="2.35"></label>' +
    '<label class="field"><span>حداکثر مجاز</span><input name="parameter_0_max" value="2.45"></label>' +
    '<label class="field"><span>واحد</span><input name="parameter_0_unit" value="mm"></label>' +
    '<label class="field"><span>روش کنترل</span><input name="parameter_0_method" value="اندازه‌گیری"></label></div></div>' +
    '<div class="panel-actions"><button class="btn btn-primary" type="submit">ذخیره طرح کنترل</button></div></form>';
  return '<div>' + pageHeader("طرح کنترل کیفیت", "تعریف و ذخیره پارامترهای کنترل و حدود مجاز در پایگاه داده") + editor +
    panel("طرح‌های ذخیره‌شده", plans.length ? dataTable([{ key: "product", label: "محصول" }, { key: "process", label: "فرآیند" }, { key: "version", label: "نسخه" }, { key: "sample_count", label: "تعداد نمونه" }, { key: "sampling_interval", label: "تناوب" }], plans) : emptyState("هنوز طرح کنترل کیفیت ذخیره نشده است.")) +
    panel("پارامترهای ثبت‌شده", parameterRows.length ? dataTable([{ key: "parameter", label: "پارامتر" }, { key: "nominal", label: "اسمی" }, { key: "min", label: "حداقل" }, { key: "max", label: "حداکثر" }, { key: "unit", label: "واحد" }, { key: "method", label: "روش" }], parameterRows) : emptyState("پارامتری برای نمایش وجود ندارد.")) + '</div>';
}
export function renderQuality(path) {
  switch (path) {
    case "/quality/pending": return pendingPage();
    case "/quality/history": return qualityRecordsPage();
    case "/quality/plan": return planPage();
    default: return qualityDashboard();
  }
}
