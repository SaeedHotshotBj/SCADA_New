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
  const rows = [...store.list("qc"), ...qcSamples.filter(sample => !store.list("qc").some(row => row.code === sample.code))];
  return `<div class="collection-page" data-collection-name="qc" data-edit-action="new-qc">${pageHeader("سوابق کنترل کیفیت", "جستجو و مشاهده نتایج بازرسی‌های ثبت‌شده", button("ثبت کنترل کیفیت", "new-qc", { icon: "+" }))}
    <div class="filter-bar"><label class="field"><span>محصول</span><select><option>همه محصولات</option><option>سیم 1×10 افشان</option><option>کابل قدرت NYY</option></select></label><label class="field"><span>تصمیم</span><select><option>همه</option><option>قبول</option><option>مشروط</option><option>رد</option></select></label><label class="field"><span>ماشین</span><select><option>همه ماشین‌ها</option><option>اکسترودر عایق</option><option>کابل‌کشی</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("سوابق بازرسی", dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "inspector", label: "بازرس", render: row => row.inspector || "کارشناس کیفیت" }, { key: "decision", label: "تصمیم", render: row => pill(row.decision, row.decision === "قبول" ? "success" : row.decision === "رد" ? "danger" : "warning") }, { key: "time", label: "زمان" }], rows, { actions: true }))}
  </div>`;
}

function pendingPage() {
  const pending = store.list("qc").filter(row => row.status === "در انتظار" || !row.status);
  return `<div>${pageHeader("در انتظار بررسی", "نمونه‌ها و بازرسی‌هایی که منتظر تصمیم کارشناس کیفیت هستند.")}${statCard("موارد در انتظار", pending.length, "مورد", "orange")}${panel("صف بررسی کیفیت", pending.length ? dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "inspector", label: "بازرس" }, { key: "action", label: "اقدام", render: row => `<button class="btn btn-primary btn-sm" data-action="review-qc" data-id="${row.id}">بررسی نتیجه</button>` }], pending) : emptyState("موردی در انتظار بررسی نیست."))}</div>`;
}
function planPage() {
  const plan = store.list("controlPlans")[0] || {
    product:"سیم 1×10 افشان", process:"اکستروژن عایق", version:"نسخه ۱",
    sampling_interval:"هر ۳۰ دقیقه", sample_count:3, responsible:"کارشناس کیفیت", approval_required:true,
    parameters:[
      {parameter:"قطر عایق",nominal:"۲٫۴۰",min:"۲٫۳۵",max:"۲٫۴۵",unit:"mm",method:"اندازه‌گیری"},
      {parameter:"مقاومت هادی",nominal:"۱٫۸۳",min:"—",max:"۱٫۹۰",unit:"Ω/km",method:"آزمون الکتریکی"},
      {parameter:"ضخامت عایق",nominal:"۰٫۸",min:"۰٫۷۵",max:"۰٫۸۵",unit:"mm",method:"اندازه‌گیری"},
      {parameter:"ظاهر محصول",nominal:"بدون عیب",min:"—",max:"—",unit:"—",method:"بازرسی چشمی"}
    ]
  };
  return `<div>${pageHeader("طرح کنترل کیفیت", "تعریف پارامترهای کنترل، حدود مجاز و روش بازرسی برای محصول و مرحله تولید", `<button class="btn btn-primary" type="submit" form="control-plan-form">ذخیره تغییرات</button>`)}
    <form id="control-plan-form" data-local-form="control-plan" data-id="${plan.id || ""}">
      <div class="filter-bar"><label class="field"><span>محصول</span><select name="product">${["سیم 1×10 افشان","کابل قدرت NYY 4×16","سیم افشان H07V-K 4mm²"].map(value => `<option ${value === plan.product ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>مرحله فرآیند</span><select name="process">${["اکستروژن عایق","کابل‌کشی","بسته‌بندی"].map(value => `<option ${value === plan.process ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>نسخه طرح</span><input name="version" value="${plan.version || "نسخه ۱"}" required></label></div>
      ${panel("پارامترهای قابل کنترل", `<div class="table-wrap"><table class="data-table"><thead><tr><th>پارامتر</th><th>مقدار اسمی</th><th>حداقل مجاز</th><th>حداکثر مجاز</th><th>واحد</th><th>روش کنترل</th></tr></thead><tbody>${(plan.parameters || []).map((item,index) => `<tr><td><input type="hidden" name="parameter_${index}_parameter" value="${item.parameter}">${item.parameter}</td><td><input name="parameter_${index}_nominal" value="${item.nominal || ""}"></td><td><input name="parameter_${index}_min" value="${item.min || ""}"></td><td><input name="parameter_${index}_max" value="${item.max || ""}"></td><td><input name="parameter_${index}_unit" value="${item.unit || ""}"></td><td><input name="parameter_${index}_method" value="${item.method || ""}"></td></tr>`).join("")}</tbody></table></div>`)}
      <div class="two-col-grid">${panel("تناوب نمونه‌برداری", `<div class="form-grid"><label class="field"><span>فاصله نمونه‌برداری</span><input name="sampling_interval" value="${plan.sampling_interval || "هر ۳۰ دقیقه"}" required></label><label class="field"><span>تعداد نمونه</span><input name="sample_count" type="number" min="1" max="1000" value="${plan.sample_count ?? 3}" required></label><label class="field"><span>مسئول کنترل</span><input name="responsible" value="${plan.responsible || "کارشناس کیفیت"}" required></label><label class="field"><span>الزام تأیید</span><select name="approval_required"><option value="true" ${plan.approval_required ? "selected" : ""}>بله</option><option value="false" ${!plan.approval_required ? "selected" : ""}>خیر</option></select></label></div>`)}${panel("قواعد تصمیم‌گیری", `<div class="rule-list"><p>${pill("قبول", "success")} تمام پارامترها داخل محدوده مجاز باشند.</p><p>${pill("مشروط", "warning")} انحراف جزئی با تأیید مسئول کیفیت قابل قبول باشد.</p><p>${pill("رد", "danger")} خروج از حدود بحرانی یا عدم انطباق ظاهری.</p></div>`)}</div>
    </form>
  </div>`;
}
export function renderQuality(path) {
  switch (path) {
    case "/quality/pending": return pendingPage();
    case "/quality/history": return qualityRecordsPage();
    case "/quality/plan": return planPage();
    default: return qualityDashboard();
  }
}
