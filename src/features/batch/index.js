import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, statCard, lineChart, emptyState } from "../../shared/ui.js";

function batchRunPage() {
  const latest = store.list("batches")[0];
  return `<div class="batch-page">${pageHeader("توزین و اجرای بچ", "انتخاب فرمول، تعیین وزن هدف و کنترل توالی توزین مواد", button("بچ جدید", "new-batch", { icon: "+" }))}
    <div class="batch-control-layout"><section class="panel"><div class="panel-heading"><h3>تنظیم بچ جاری</h3>${pill(latest?.status || (latest ? "ثبت‌شده" : "بدون بچ فعال"), latest ? "info" : "muted")}</div><div class="panel-body"><div class="form-grid"><label class="field"><span>فرمول</span><select><option>کابل NYY 4×16</option><option>سیم PVC 1×10</option><option>فرمول تست</option></select></label><label class="field"><span>خط تولید</span><select><option>خط ترکیب مواد ۱</option><option>خط ترکیب مواد ۲</option></select></label><label class="field"><span>وزن هدف (kg)</span><input type="number" value="500"></label><label class="field"><span>شماره بچ</span><input value="BATCH-1405-00021" readonly></label></div><div class="batch-main-actions"><button class="btn btn-primary" data-action="start-batch" data-id="${latest?.id || ""}">شروع توزین</button><button class="btn btn-light" data-action="stop-batch" data-id="${latest?.id || ""}">توقف</button><button class="btn btn-light" data-action="open-modal-info">ادامه</button><button class="btn btn-danger" data-action="open-modal-info">لغو بچ</button></div></div></section>
      <section class="panel batch-weight-panel"><div class="panel-heading"><h3>وزن لحظه‌ای</h3>${pill("شبیه‌سازی", "warning")}</div><div class="panel-body"><div class="weight-display"><small>وزن کل</small><strong id="batch-weight">۰٫۰۰</strong><span>kg</span></div><div class="weight-progress"><i></i></div><div class="weight-meta"><span>هدف: ۵۰۰ kg</span><b>۰٪</b></div><div class="weight-status"><span class="online-dot"></span> <span data-batch-status>آماده به کار</span></div></div></section></div>
    ${panel("مواد و هاپرها", dataTable([{ key: "bin", label: "هاپر" }, { key: "material", label: "ماده" }, { key: "target", label: "وزن هدف" }, { key: "actual", label: "وزن واقعی" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "info") }], [{ bin: "Hopper 01", material: "گرانول PVC", target: "250.00 kg", actual: "0.00 kg", status: "در انتظار" }, { bin: "Hopper 02", material: "کربنات کلسیم", target: "150.00 kg", actual: "0.00 kg", status: "در انتظار" }, { bin: "Hopper 03", material: "افزودنی", target: "100.00 kg", actual: "0.00 kg", status: "در انتظار" }]))}
    ${panel("وضعیت مراحل توزین", `<div class="batch-steps"><div class="active"><span>۱</span><b>آماده‌سازی</b></div><div><span>۲</span><b>توزین مواد</b></div><div><span>۳</span><b>تخلیه</b></div><div><span>۴</span><b>تکمیل بچ</b></div></div>`)}
  </div>`;
}

function batchSetupPage() {
  const config = store.list("batchConfigs")[0] || {
    code:"BATCH-01", name:"خط ترکیب مواد ۱", loadcell:"Loadcell-01", samples:5,
    tolerance_percent:0.5, stabilization_seconds:3, formula:"کابل NYY 4×16",
    description:"فرمول پایه ترکیب مواد عایق",
    hoppers:[
      {bin:"Hopper 01",material:"گرانول PVC",ratio:50,target:250},
      {bin:"Hopper 02",material:"کربنات کلسیم",ratio:30,target:150},
      {bin:"Hopper 03",material:"افزودنی",ratio:20,target:100}
    ]
  };
  return `<div>${pageHeader("تنظیمات توزین بچ", "پیکربندی خط، لودسل، تعداد نمونه و نسبت مواد در هر هاپر", `<button class="btn btn-primary" type="submit" form="batch-config-form">ذخیره تنظیمات</button>`)}
    <form id="batch-config-form" data-local-form="batch-config" data-id="${config.id || ""}">
      <div class="two-col-grid">${panel("اطلاعات خط توزین", `<div class="form-grid">
        <label class="field"><span>کد خط</span><input name="code" value="${config.code || ""}" required></label>
        <label class="field"><span>نام خط</span><input name="name" value="${config.name || ""}" required></label>
        <label class="field"><span>لودسل</span><select name="loadcell"><option ${config.loadcell === "Loadcell-01" ? "selected" : ""}>Loadcell-01</option><option ${config.loadcell === "Loadcell-02" ? "selected" : ""}>Loadcell-02</option></select></label>
        <label class="field"><span>تعداد نمونه</span><input name="samples" type="number" min="1" max="100" value="${config.samples ?? 5}" required></label>
        <label class="field"><span>حد مجاز خطا (%)</span><input name="tolerance_percent" type="number" min="0" max="100" step="0.01" value="${config.tolerance_percent ?? 0.5}" required></label>
        <label class="field"><span>زمان پایدارسازی (ثانیه)</span><input name="stabilization_seconds" type="number" min="0" max="600" value="${config.stabilization_seconds ?? 3}" required></label>
      </div>`)}${panel("انتخاب فرمول", `<label class="field"><span>فرمول فعال</span><select name="formula"><option ${config.formula === "کابل NYY 4×16" ? "selected" : ""}>کابل NYY 4×16</option><option ${config.formula === "سیم PVC 1×10" ? "selected" : ""}>سیم PVC 1×10</option></select></label><label class="field"><span>توضیحات</span><textarea name="description" rows="3">${config.description || ""}</textarea></label><div class="storage-list"><div><span>تعداد مواد</span><b>${(config.hoppers || []).length}</b></div><div><span>تعداد هاپرها</span><b>${(config.hoppers || []).length}</b></div></div>`)}</div>
      ${panel("مواد و هاپرها", `<div class="table-wrap"><table class="data-table"><thead><tr><th>هاپر</th><th>ماده</th><th>درصد فرمول</th><th>وزن در بچ ۵۰۰kg</th></tr></thead><tbody>${(config.hoppers || []).map((hopper,index) => `<tr><td><input name="hopper_${index}_bin" value="${hopper.bin || ""}" required></td><td><input name="hopper_${index}_material" value="${hopper.material || ""}" required></td><td><input type="number" min="0" max="100" step="0.01" name="hopper_${index}_ratio" value="${hopper.ratio ?? 0}" required></td><td><input type="number" min="0" step="0.001" name="hopper_${index}_target" value="${hopper.target ?? 0}" required></td></tr>`).join("")}</tbody></table></div>`)}
    </form>
    <p class="muted-note">این مقادیر فقط تنظیمات نرم‌افزاری را ذخیره می‌کنند. کالیبراسیون و خواندن لودسل واقعی هنوز به درایور و مشخصات سخت‌افزار نیاز دارد.</p>
  </div>`;
}

function batchReportPage() {
  const rows = store.list("batches");
  return `<div>${pageHeader("گزارش بچ‌ها", "سوابق عملیات توزین، مقدار هدف و وزن نهایی", button("خروجی CSV", "export-csv", { variant: "light" }))}
    <div class="filter-bar"><label class="field"><span>فرمول</span><select><option>همه فرمول‌ها</option><option>کابل NYY 4×16</option></select></label><label class="field"><span>وضعیت</span><select><option>همه</option><option>تکمیل‌شده</option><option>لغوشده</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("سوابق بچ", rows.length ? dataTable([{ key: "code", label: "کد بچ" }, { key: "formula", label: "فرمول" }, { key: "target", label: "وزن هدف" }, { key: "material", label: "ماده" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", "success") }], rows) : emptyState("هنوز بچی در فضای نمایشی ثبت نشده است."))}
  </div>`;
}

function batchComparePage() {
  return `<div>${pageHeader("مقایسه مقدار اسمی و واقعی بچ", "مقایسه وزن مورد انتظار فرمول با مقادیر ثبت‌شده در توزین")}
    <div class="filter-bar"><label class="field"><span>انتخاب بچ</span><select><option>BATCH-1405-00021</option><option>BATCH-1405-00020</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">نمایش مقایسه</button></div>
    <div class="stats-grid stats-grid-4">${statCard("وزن اسمی", "۵۰۰٫۰۰", "kg", "blue")}${statCard("وزن واقعی", "۴۹۹٫۶۲", "kg", "green")}${statCard("اختلاف", "۰٫۳۸-", "kg", "orange")}${statCard("انحراف", "۰٫۰۸", "%", "purple")}</div>
    ${lineChart("مقایسه وزن اسمی و واقعی مواد", undefined, "#1699c8", [50, 30, 20, 50, 30, 20, 50])}
    <div class="two-col-grid">${panel("مقایسه بر اساس ماده", dataTable([{ key: "material", label: "ماده" }, { key: "nominal", label: "وزن اسمی" }, { key: "actual", label: "وزن واقعی" }, { key: "deviation", label: "انحراف" }], [{ material: "گرانول PVC", nominal: "250.00", actual: "249.82", deviation: "-0.18 kg" }, { material: "کربنات کلسیم", nominal: "150.00", actual: "149.92", deviation: "-0.08 kg" }, { material: "افزودنی", nominal: "100.00", actual: "99.88", deviation: "-0.12 kg" }]))}${panel("مقایسه بر اساس هاپر", dataTable([{ key: "bin", label: "هاپر" }, { key: "target", label: "هدف" }, { key: "actual", label: "واقعی" }, { key: "result", label: "نتیجه", render: () => pill("در محدوده", "success") }], [{ bin: "Hopper 01", target: "250.00", actual: "249.82" }, { bin: "Hopper 02", target: "150.00", actual: "149.92" }, { bin: "Hopper 03", target: "100.00", actual: "99.88" }]))}</div>
  </div>`;
}

export function renderBatch(path) {
  switch (path) {
    case "/batch/setup": return batchSetupPage();
    case "/batch/report": return batchReportPage();
    case "/batch/compare": return batchComparePage();
    default: return batchRunPage();
  }
}
