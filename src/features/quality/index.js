import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, donutChart, barChart, lineChart, emptyState } from "../../shared/ui.js";

function qualityDashboard() {
  const summary = store.snapshot().qualityAnalytics?.summary || {};
  const machines = store.list("machines").map(row => row.name).filter(Boolean);
  const history = store.list("qc");
  const byMachine = machines.map(name => ({ name, count: history.filter(row => row.machine === name).length }));
  const total = Number(summary.total || history.length);
  const accepted = Number(summary.accepted || 0);
  const rejected = Number(summary.rejected || 0);
  const pending = Number(summary.pending || 0);
  return `<div class="quality-page">${pageHeader("داشبورد کنترل کیفیت", "شاخص‌ها از سوابق ثبت‌شده QC در Backend محاسبه می‌شوند.")}
    <div class="stats-grid stats-grid-4">${statCard("تعداد بازرسی", total.toLocaleString("fa-IR"), "مورد", "blue")}${statCard("درصد پذیرش", summary.acceptance_percent == null ? "—" : Number(summary.acceptance_percent).toLocaleString("fa-IR"), "%", "green")}${statCard("مردودی", rejected.toLocaleString("fa-IR"), "مورد", "red")}${statCard("در انتظار بررسی", pending.toLocaleString("fa-IR"), "مورد", "orange")}</div>
    <div class="two-col-grid">${donutChart("نتیجه بازرسی‌های ثبت‌شده", [accepted, Number(summary.conditional || 0), rejected, pending])}${barChart("تعداد بازرسی بر اساس ماشین", byMachine.length ? byMachine.map(row => row.name) : ["بدون داده"], byMachine.length ? byMachine.map(row => row.count) : [0])}</div>
    ${panel("آخرین سوابق کنترل کیفیت", history.length ? dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "decision", label: "تصمیم", render: row => pill(row.decision || "در انتظار", row.decision === "قبول" ? "success" : row.decision === "رد" ? "danger" : "warning") }, { key: "status", label: "وضعیت" }], history.slice(0, 10)) : emptyState("هنوز رکورد کنترل کیفیتی ثبت نشده است."))}
  </div>`;
}

function qualityRecordsPage() {
  const rows = store.list("qc");
  return `<div class="collection-page" data-collection-name="qc" data-edit-action="new-qc">${pageHeader("سوابق کنترل کیفیت", "جستجو و مشاهده نتایج بازرسی‌های ثبت‌شده", button("ثبت کنترل کیفیت", "new-qc", { icon: "+" }))}
    <div class="filter-bar"><label class="field"><span>محصول</span><input name="product" placeholder="نام محصول"></label><label class="field"><span>تصمیم</span><select name="decision"><option value="">همه</option><option>قبول</option><option>مشروط</option><option>رد</option></select></label><label class="field"><span>ماشین</span><input name="machine" placeholder="نام ماشین"></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("سوابق بازرسی", rows.length ? dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "inspector", label: "بازرس" }, { key: "decision", label: "تصمیم", render: row => pill(row.decision || "در انتظار", row.decision === "قبول" ? "success" : row.decision === "رد" ? "danger" : "warning") }, { key: "updated_at", label: "آخرین تغییر" }, { key: "action", label: "اقدام", render: row => `<button class="btn btn-light btn-sm" data-action="review-qc" data-id="${row.id}">ثبت اندازه‌گیری</button>` }], rows) : emptyState("هنوز سابقه‌ای برای کنترل کیفیت وجود ندارد."))}
  </div>`;
}

function pendingPage() {
  const pending = store.list("qc").filter(row => !["بررسی‌شده", "تکمیل‌شده"].includes(row.status) || ["مشروط"].includes(row.decision));
  return `<div>${pageHeader("در انتظار بررسی", "فقط درخواست‌های واقعی ذخیره‌شده در صف بررسی نمایش داده می‌شوند.")}${statCard("موارد نیازمند بررسی", pending.length, "مورد", "orange")}
    ${panel("صف بررسی کیفیت", pending.length ? dataTable([{ key: "code", label: "شماره کنترل" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "status", label: "وضعیت" }, { key: "action", label: "اقدام", render: row => `<button class="btn btn-primary btn-sm" data-action="review-qc" data-id="${row.id}">بررسی و ثبت اندازه‌گیری</button>` }], pending) : emptyState("در حال حاضر رکوردی در صف بررسی نیست."))}
  </div>`;
}

function planPage() {
  const plans = store.list("controlPlans");
  const plan = plans[0] || {};
  const parameters = Array.isArray(plan.parameters) && plan.parameters.length ? plan.parameters : [{}];
  return `<div>${pageHeader("طرح کنترل کیفیت", "تعریف حدود مجاز، تناوب نمونه‌برداری و روش کنترل؛ اطلاعات در Backend ذخیره می‌شود.", button("طرح جدید", "open-modal-info", { variant: "light" }))}
    <form data-local-form="control-plan" data-id="${plan.id || ""}">
      <div class="filter-bar"><label class="field"><span>محصول</span><input name="product" value="${plan.product || ""}" required></label><label class="field"><span>مرحله فرآیند</span><input name="process" value="${plan.process || ""}" required></label><label class="field"><span>تناوب نمونه‌برداری</span><input name="sampling_interval" value="${plan.sampling_interval || ""}" placeholder="مثلاً 30 دقیقه" required></label><label class="field"><span>تعداد نمونه</span><input name="sample_count" type="number" min="1" value="${plan.sample_count || 3}" required></label><label class="field"><span>الزام تأیید</span><select name="approval_required"><option value="true" ${plan.approval_required !== false ? "selected" : ""}>بله</option><option value="false" ${plan.approval_required === false ? "selected" : ""}>خیر</option></select></label></div>
      ${panel("پارامترهای کنترل", `<div class="form-grid">${parameters.map((item, index) => `<div class="field"><span>پارامتر ${index + 1}</span><input name="parameter_${index}_parameter" value="${item.parameter || ""}" placeholder="مثلاً قطر عایق"></div><div class="field"><span>مقدار اسمی</span><input name="parameter_${index}_nominal" value="${item.nominal || ""}"></div><div class="field"><span>حداقل</span><input name="parameter_${index}_min" value="${item.min || ""}"></div><div class="field"><span>حداکثر</span><input name="parameter_${index}_max" value="${item.max || ""}"></div><div class="field"><span>واحد</span><input name="parameter_${index}_unit" value="${item.unit || ""}"></div><div class="field"><span>روش کنترل</span><input name="parameter_${index}_method" value="${item.method || ""}"></div>`).join("")}</div>`) }
      <div class="panel-actions"><button type="submit" class="btn btn-primary">ذخیره طرح کنترل</button></div>
    </form>
    ${panel("طرح‌های ذخیره‌شده", plans.length ? dataTable([{ key: "product", label: "محصول" }, { key: "process", label: "فرآیند" }, { key: "sampling_interval", label: "تناوب" }, { key: "sample_count", label: "تعداد نمونه" }], plans) : emptyState("هنوز طرح کنترلی ذخیره نشده است."))}
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