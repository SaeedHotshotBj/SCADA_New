import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, statCard, distributionDonutChart, distributionBarChart, emptyState } from "../../shared/ui.js";

function qualityDashboard() {
  const rows = store.list("qc");
  const decisions = ["قبول", "مشروط", "رد"].map(name => ({
    name,
    count: rows.filter(row => row.decision === name).length,
  }));
  const total = rows.length;
  const accepted = rows.filter(row => row.decision === "قبول").length;
  const rejected = rows.filter(row => row.decision === "رد").length;
  const pending = rows.filter(row => row.status === "در انتظار" || !row.status).length;
  const acceptanceRate = total ? (accepted * 100 / total).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) : "—";
  const rejectionRate = total ? (rejected * 100 / total).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) : "—";
  const machineCounts = new Map();
  for (const row of rows) {
    const machine = row.machine || "بدون ماشین";
    machineCounts.set(machine, (machineCounts.get(machine) || 0) + 1);
  }
  const machineRows = [...machineCounts.entries()].map(([machine, count]) => ({ machine, count }));
  return `<div class="quality-page">${pageHeader("داشبورد کنترل کیفیت", "شاخص‌های محاسبه‌شده از سوابق بازرسی ذخیره‌شده در Backend")}
    <div class="stats-grid stats-grid-4">
      ${statCard("تعداد بازرسی ثبت‌شده", total.toLocaleString("fa-IR"), "مورد", "blue")}
      ${statCard("نرخ پذیرش", acceptanceRate, total ? "%" : "", "green", "", "فقط بر اساس تصمیم‌های ثبت‌شده")}
      ${statCard("نرخ مردودی", rejectionRate, total ? "%" : "", "red", "", "فقط بر اساس تصمیم‌های ثبت‌شده")}
      ${statCard("در انتظار بررسی", pending.toLocaleString("fa-IR"), "مورد", "orange")}
    </div>
    <div class="two-col-grid">
      ${distributionDonutChart("نتیجه بازرسی‌های ثبت‌شده", decisions)}
      ${distributionBarChart("تعداد بازرسی بر اساس ماشین", machineRows.map(item => ({ name: item.machine, count: item.count })))}
    </div>
    <div class="two-col-grid">
      ${panel("خلاصه سوابق کنترل کیفیت", `<div class="storage-list"><div><span>کل بازرسی‌های ذخیره‌شده</span><b>${total.toLocaleString("fa-IR")}</b></div><div><span>تصمیم‌های ثبت‌شده</span><b>${(accepted + rejected + rows.filter(row => row.decision === "مشروط").length).toLocaleString("fa-IR")}</b></div><div><span>موارد در انتظار</span><b>${pending.toLocaleString("fa-IR")}</b></div></div>`)}
      ${panel("عملکرد ثبت‌شده خطوط", machineRows.length ? dataTable([
        { key: "machine", label: "ماشین" },
        { key: "count", label: "تعداد بازرسی", render: row => row.count.toLocaleString("fa-IR") },
      ], machineRows) : emptyState("هنوز سابقه کنترل کیفیت ثبت نشده است."))}
    </div>
  </div>`;
}

function qualityRecordsPage() {
  const rows = store.list("qc");
  return `<div class="collection-page" data-collection-name="qc" data-edit-action="new-qc">${pageHeader("سوابق کنترل کیفیت", "جستجو و مشاهده نتایج بازرسی‌های ثبت‌شده", button("ثبت کنترل کیفیت", "new-qc", { icon: "+" }))}
    <div class="filter-bar"><label class="field"><span>محصول</span><select><option>همه محصولات</option>${[...new Set(rows.map(row => row.product).filter(Boolean))].map(value => `<option>${value}</option>`).join("")}</select></label><label class="field"><span>تصمیم</span><select><option>همه</option><option>قبول</option><option>مشروط</option><option>رد</option></select></label><label class="field"><span>ماشین</span><select><option>همه ماشین‌ها</option>${[...new Set(rows.map(row => row.machine).filter(Boolean))].map(value => `<option>${value}</option>`).join("")}</select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("سوابق بازرسی", rows.length ? dataTable([
      { key: "code", label: "شماره کنترل" },
      { key: "product", label: "محصول" },
      { key: "machine", label: "ماشین" },
      { key: "inspector", label: "بازرس", render: row => row.inspector || "—" },
      { key: "decision", label: "تصمیم", render: row => pill(row.decision || "در انتظار", row.decision === "قبول" ? "success" : row.decision === "رد" ? "danger" : "warning") },
      { key: "time", label: "زمان", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : row.time || "—" },
    ], rows, { actions: true }) : emptyState("هیچ سابقه کنترل کیفیتی ثبت نشده است."))}
  </div>`;
}

function pendingPage() {
  const pending = store.list("qc").filter(row => row.status === "در انتظار" || !row.status);
  return `<div>${pageHeader("در انتظار بررسی", "نمونه‌ها و بازرسی‌هایی که منتظر تصمیم کارشناس کیفیت هستند.")}${statCard("موارد در انتظار", pending.length, "مورد", "orange")}${panel("صف بررسی کیفیت", pending.length ? dataTable([
    { key: "code", label: "شماره کنترل" },
    { key: "product", label: "محصول" },
    { key: "machine", label: "ماشین" },
    { key: "inspector", label: "بازرس" },
    { key: "action", label: "اقدام", render: row => `<button class="btn btn-primary btn-sm" data-action="review-qc" data-id="${row.id}">بررسی نتیجه</button>` },
  ], pending) : emptyState("موردی در انتظار بررسی نیست."))}</div>`;
}

function planPage() {
  const plan = store.list("controlPlans")[0] || {
    product: "", process: "", version: "", sampling_interval: "",
    sample_count: 1, responsible: "", approval_required: true, parameters: [],
  };
  return `<div>${pageHeader("طرح کنترل کیفیت", "تعریف پارامترهای کنترل، حدود مجاز و روش بازرسی برای محصول و مرحله تولید", `<button class="btn btn-primary" type="submit" form="control-plan-form">ذخیره تغییرات</button>`)}
    <form id="control-plan-form" data-local-form="control-plan" data-id="${plan.id || ""}">
      <div class="filter-bar"><label class="field"><span>محصول</span><select name="product" required>${store.list("products").map(product => `<option value="${product.name}" ${product.name === plan.product ? "selected" : ""}>${product.name}</option>`).join("")}</select></label><label class="field"><span>مرحله فرآیند</span><input name="process" value="${plan.process || ""}" required></label><label class="field"><span>نسخه طرح</span><input name="version" value="${plan.version || ""}" required></label></div>
      ${panel("پارامترهای قابل کنترل", plan.parameters?.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>پارامتر</th><th>مقدار اسمی</th><th>حداقل مجاز</th><th>حداکثر مجاز</th><th>واحد</th><th>روش کنترل</th></tr></thead><tbody>${plan.parameters.map((item,index) => `<tr><td><input type="hidden" name="parameter_${index}_parameter" value="${item.parameter}">${item.parameter}</td><td><input name="parameter_${index}_nominal" value="${item.nominal || ""}"></td><td><input name="parameter_${index}_min" value="${item.min || ""}"></td><td><input name="parameter_${index}_max" value="${item.max || ""}"></td><td><input name="parameter_${index}_unit" value="${item.unit || ""}"></td><td><input name="parameter_${index}_method" value="${item.method || ""}"></td></tr>`).join("")}</tbody></table></div>` : emptyState("برای این طرح هنوز پارامتری تعریف نشده است."))}
      <div class="two-col-grid">
        ${panel("تناوب نمونه‌برداری", `<div class="form-grid">
          <label class="field"><span>فاصله نمونه‌برداری</span><input name="sampling_interval" value="${plan.sampling_interval || ""}" required></label>
          <label class="field"><span>تعداد نمونه</span><input name="sample_count" type="number" min="1" max="1000" value="${plan.sample_count ?? 1}" required></label>
          <label class="field"><span>مسئول کنترل</span><input name="responsible" value="${plan.responsible || ""}" required></label>
          <label class="field"><span>الزام تأیید</span><select name="approval_required"><option value="true" ${plan.approval_required ? "selected" : ""}>بله</option><option value="false" ${!plan.approval_required ? "selected" : ""}>خیر</option></select></label>
        </div>`)}
        ${panel("قواعد تصمیم‌گیری", `<div class="rule-list"><p>${pill("قبول", "success")} تمام پارامترها داخل محدوده مجاز باشند.</p><p>${pill("مشروط", "warning")} انحراف جزئی با تأیید مسئول کیفیت قابل قبول باشد.</p><p>${pill("رد", "danger")} خروج از حدود بحرانی یا عدم انطباق ظاهری.</p></div>`)}
      </div>
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
