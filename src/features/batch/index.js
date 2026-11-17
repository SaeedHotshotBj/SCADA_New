import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, statCard, lineChart, emptyState } from "../../shared/ui.js";

function batchRunPage() {
  const batches = store.list("batches");
  const active = batches.find(row => row.status === "در حال توزین");
  const latest = active || batches.find(row => !["تکمیل‌شده", "لغوشده"].includes(row.status)) || batches[0];
  const configs = store.list("batchConfigs");
  const config = configs.find(row => latest && (row.name === latest.formula || row.code === latest.formula))
    || configs[0];
  const hoppers = Array.isArray(config?.hoppers) ? config.hoppers : [];
  const canWeigh = Boolean(latest && latest.status === "در حال توزین" && hoppers.length);
  const weighmentForm = canWeigh
    ? `<form class="panel-body" data-local-form="batch-weighment" data-batch-id="${latest.id}" data-hopper-count="${hoppers.length}">
        <div class="form-grid">${hoppers.map((hopper, index) => `<div class="field"><span>${hopper.bin || `Hopper ${index + 1}`} · ${hopper.material || "ماده"} · هدف ${Number(hopper.target || 0).toLocaleString("fa-IR")} kg</span><input name="hopper_${index}_actual" type="number" min="0" step="0.001" placeholder="وزن واقعی (kg)" required /><input type="hidden" name="hopper_${index}_key" value="${hopper.bin || `Hopper ${index + 1}`}" /><input type="hidden" name="hopper_${index}_material" value="${hopper.material || "ماده"}" /><input type="hidden" name="hopper_${index}_target" value="${Number(hopper.target || 0)}" /></div>`).join("")}</div>
        <button class="btn btn-primary" type="submit">ثبت توزین آزمایشی در سرور</button>
        <p class="muted-note">وزن‌ها به‌صورت دستی وارد می‌شوند و داده‌ی لودسل واقعی نیستند.</p>
      </form>`
    : emptyState(latest ? "برای این بچ تنظیمات هاپر ثبت نشده یا بچ در حالت توزین نیست. ابتدا تنظیمات خط را کامل کنید." : "ابتدا یک تنظیم خط توزین بسازید و سپس بچ جدید ثبت کنید.");
  const hopperRows = hoppers.map(hopper => ({
    bin: hopper.bin, material: hopper.material,
    target: `${Number(hopper.target || 0).toLocaleString("fa-IR")} kg`,
    actual: "پس از ثبت توزین نمایش داده می‌شود",
    ratio: `${Number(hopper.ratio || 0).toLocaleString("fa-IR")}٪`
  }));
  return `<div class="batch-page">
    ${pageHeader("توزین و اجرای بچ", "ثبت وضعیت بچ و توزین دستی آزمایشی؛ بدون فرمان به لودسل یا هاپر واقعی", `${button("تنظیم خط", "new-batch-config", { variant: "light" })}${button("بچ جدید", "new-batch", { icon: "+" })}`)}
    <div class="batch-control-layout">
      <section class="panel">
        <div class="panel-heading"><h3>بچ انتخاب‌شده</h3>${pill(latest?.status || "بدون بچ", latest?.status === "در حال توزین" ? "success" : "muted")}</div>
        <div class="panel-body">
          <div class="storage-list">
            <div><span>کد بچ</span><b>${latest?.code || "—"}</b></div>
            <div><span>فرمول</span><b>${latest?.formula || "—"}</b></div>
            <div><span>وزن هدف</span><b>${latest?.target ? `${Number(latest.target).toLocaleString("fa-IR")} kg` : "—"}</b></div>
            <div><span>تلرانس</span><b>${latest?.tolerance_percent ?? config?.tolerance_percent ?? 0.5}%</b></div>
          </div>
          <div class="batch-main-actions">
            <button class="btn btn-primary" data-action="start-batch" ${latest ? `data-id="${latest.id}"` : ""} ${!latest || latest.status === "در حال توزین" || latest.status === "تکمیل‌شده" ? "disabled" : ""}>شروع توزین</button>
            <button class="btn btn-light" data-action="stop-batch" ${active ? `data-id="${active.id}"` : "disabled"}>توقف</button>
            <button class="btn btn-light" data-action="complete-batch" ${active ? `data-id="${active.id}"` : "disabled"}>تکمیل بچ</button>
          </div>
        </div>
      </section>
      <section class="panel batch-weight-panel">
        <div class="panel-heading"><h3>وضعیت توزین</h3>${pill("ورود دستی / DEMO", "warning")}</div>
        <div class="panel-body">
          <div class="weight-display"><small>وزن واقعی از هاپر متصل دریافت نشده است</small><strong>—</strong><span>kg</span></div>
          <div class="weight-status"><span class="online-dot"></span><span data-batch-status>${latest?.status || "آماده به کار"}</span></div>
        </div>
      </section>
    </div>
    ${panel("مواد و هاپرهای تنظیم‌شده", hopperRows.length ? dataTable([{ key: "bin", label: "هاپر" }, { key: "material", label: "ماده" }, { key: "ratio", label: "درصد فرمول" }, { key: "target", label: "وزن هدف" }, { key: "actual", label: "وزن ثبت‌شده" }], hopperRows) : emptyState("تنظیمات هاپر هنوز ثبت نشده است."))}
    ${panel("ثبت وزن واقعی (ورود دستی آزمایشی)", weighmentForm)}
    ${panel("سوابق بچ", dataTable([{ key: "code", label: "کد بچ" }, { key: "formula", label: "فرمول" }, { key: "target", label: "هدف (kg)" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", row.status === "تکمیل‌شده" ? "success" : "info") }], batches))}
  </div>`;
}
function batchSetupPage() {
  const configs = store.list("batchConfigs");
  const current = configs[0];
  const defaults = current?.hoppers || [
    { bin: "Hopper 01", material: "گرانول PVC", ratio: 50, target: 250 },
    { bin: "Hopper 02", material: "کربنات کلسیم", ratio: 30, target: 150 },
    { bin: "Hopper 03", material: "افزودنی", ratio: 20, target: 100 }
  ];
  return `<div>${pageHeader("تنظیمات توزین بچ", "ذخیره پیکربندی خط، لودسل، تلرانس و سهم مواد در پایگاه داده", button("بازگشت به اجرای بچ", "refresh-demo", { variant: "light" }))}
    <form class="panel" data-local-form="batch-config">
      <div class="panel-body">
        <div class="form-grid">
          <label class="field"><span>کد تنظیمات</span><input name="code" value="${current?.code || "BATCH-01"}" required></label>
          <label class="field"><span>نام تنظیمات</span><input name="name" value="${current?.name || "خط ترکیب مواد ۱"}" required></label>
          <label class="field"><span>لودسل (شناسه تجهیز)</span><input name="loadcell" value="${current?.loadcell || "Loadcell-01"}" required></label>
          <label class="field"><span>فرمول</span><input name="formula" value="${current?.formula || "کابل NYY 4×16"}" required></label>
          <label class="field"><span>تعداد نمونه</span><input name="samples" type="number" min="1" value="${current?.samples ?? 5}" required></label>
          <label class="field"><span>حد مجاز خطا (%)</span><input name="tolerance_percent" type="number" min="0" max="100" step="0.01" value="${current?.tolerance_percent ?? 0.5}" required></label>
          <label class="field"><span>زمان پایدارسازی (ثانیه)</span><input name="stabilization_seconds" type="number" min="0" value="${current?.stabilization_seconds ?? 3}" required></label>
        </div>
      </div>
      ${panel("مواد و هاپرها", `<div class="panel-body">${defaults.map((hopper, index) => `<div class="form-grid hopper-config-row">
        <label class="field"><span>هاپر ${index + 1}</span><input name="hopper_${index}_bin" value="${hopper.bin || ""}" required></label>
        <label class="field"><span>ماده</span><input name="hopper_${index}_material" value="${hopper.material || ""}" required></label>
        <label class="field"><span>درصد فرمول</span><input name="hopper_${index}_ratio" type="number" min="0" max="100" step="0.01" value="${hopper.ratio ?? 0}" required></label>
        <label class="field"><span>وزن هدف در بچ ۵۰۰ kg</span><input name="hopper_${index}_target" type="number" min="0.001" step="0.001" value="${hopper.target ?? 0}" required></label>
      </div>`).join("")}</div>`)}
      <div class="panel-actions"><button class="btn btn-primary" type="submit">ذخیره تنظیمات خط</button><span class="muted-note">مجموع درصد مواد باید دقیقاً ۱۰۰٪ باشد.</span></div>
    </form>
    ${panel("تنظیمات ذخیره‌شده", configs.length ? dataTable([{ key: "code", label: "کد" }, { key: "name", label: "نام" }, { key: "loadcell", label: "لودسل" }, { key: "formula", label: "فرمول" }, { key: "tolerance_percent", label: "تلرانس (%)" }], configs) : emptyState("هنوز تنظیمی در پایگاه داده ذخیره نشده است."))}
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
