import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, statCard, lineChart, emptyState } from "../../shared/ui.js";

function currentConfig(batch) {
  const configs = store.list("batchConfigs");
  return configs.find(item => item.id === batch?.config_id)
    || configs.find(item => item.formula === batch?.formula)
    || configs[0]
    || null;
}

function batchRunPage() {
  const batches = store.list("batches");
  const latest = batches[0] || null;
  const config = currentConfig(latest);
  const tags = store.list("tags");
  const weightTag = config?.weight_tag_id ? tags.find(tag => tag.id === config.weight_tag_id) : null;
  const hoppers = config?.hoppers || latest?.hoppers || [];
  const isRunning = latest?.status === "در حال توزین";
  const target = Number(latest?.target ?? hoppers.reduce((sum, hopper) => sum + Number(hopper.target || 0), 0)) || null;
  const weightValue = weightTag && weightTag.value !== undefined ? Number(weightTag.value) : null;
  const weightAvailable = Number.isFinite(weightValue);
  const weightQuality = weightTag?.quality || "UNSAMPLED";
  return `<div class="batch-page">${pageHeader("توزین و اجرای بچ", "ثبت وضعیت بچ و مشاهده مقدار تگ لودسل تخصیص‌یافته", button("بچ جدید", "new-batch", { icon: "+" }))}
    <div class="batch-control-layout">
      <section class="panel">
        <div class="panel-heading"><h3>بچ جاری</h3>${pill(latest?.status || "بدون بچ ثبت‌شده", isRunning ? "success" : latest ? "info" : "muted")}</div>
        <div class="panel-body">
          <div class="storage-list">
            <div><span>شماره بچ</span><b>${latest?.code || "—"}</b></div>
            <div><span>فرمول</span><b>${latest?.formula || config?.formula || "—"}</b></div>
            <div><span>خط توزین</span><b>${config?.name || "—"}</b></div>
            <div><span>وزن هدف</span><b>${target === null ? "—" : target.toLocaleString("fa-IR") + " kg"}</b></div>
            <div><span>شروع</span><b>${latest?.started_at ? new Date(latest.started_at).toLocaleString("fa-IR") : "—"}</b></div>
          </div>
          <div class="batch-main-actions">
            <button class="btn btn-primary" data-action="start-batch" data-id="${latest?.id || ""}" ${!latest || isRunning ? "disabled" : ""}>شروع / ادامه وضعیت</button>
            <button class="btn btn-light" data-action="stop-batch" data-id="${latest?.id || ""}" ${!latest || !isRunning ? "disabled" : ""}>توقف وضعیت</button>
            <button class="btn btn-danger" data-action="cancel-batch" data-id="${latest?.id || ""}" ${!latest || isRunning || ["لغوشده","تکمیل‌شده"].includes(latest.status) ? "disabled" : ""}>لغو بچ</button>
          </div>
        </div>
      </section>
      <section class="panel batch-weight-panel">
        <div class="panel-heading"><h3>مقدار تگ لودسل</h3>${pill(weightQuality, weightQuality === "GOOD" ? "success" : weightQuality === "DEMO" ? "warning" : "muted")}</div>
        <div class="panel-body">
          <div class="weight-display"><small>${weightTag?.name || "تگ لودسل تخصیص داده نشده"}</small><strong>${weightAvailable ? weightValue.toLocaleString("fa-IR", { maximumFractionDigits: 3 }) : "—"}</strong><span>${weightTag?.unit || ""}</span></div>
          <div class="weight-status"><span class="online-dot"></span><span>${weightAvailable ? `منبع: ${weightTag.source || "ثبت‌شده"}` : "داده وزن از تگ مشخص‌شده دریافت نشده است."}</span></div>
          <p class="muted-note">مقدار فقط زمانی معتبر است که تگ به منبع Edge/PLC تأییدشده متصل باشد و کیفیت آن GOOD باشد. حالت DEMO مقدار واقعی لودسل نیست.</p>
        </div>
      </section>
    </div>
    ${panel("مواد و هاپرهای فرمول", hoppers.length ? dataTable([
      { key: "bin", label: "هاپر" },
      { key: "material", label: "ماده" },
      { key: "ratio", label: "درصد فرمول", render: row => row.ratio === undefined ? "—" : `${Number(row.ratio).toLocaleString("fa-IR")}%` },
      { key: "target", label: "وزن هدف", render: row => row.target === undefined ? "—" : `${Number(row.target).toLocaleString("fa-IR")} kg` },
      { key: "actual", label: "وزن واقعی", render: row => row.actual === undefined ? "ثبت نشده" : `${Number(row.actual).toLocaleString("fa-IR")} kg` },
    ], hoppers) : emptyState("برای خط توزین، فرمول و هاپر تعریف نشده است."))}
    ${panel("وضعیت مراحل توزین", latest?.steps?.length ? dataTable([
      { key: "name", label: "مرحله" },
      { key: "status", label: "وضعیت" },
      { key: "started_at", label: "شروع" },
      { key: "completed_at", label: "پایان" },
    ], latest.steps) : emptyState("برای این بچ هنوز داده مرحله‌ای از سیستم توزین ثبت نشده است."))}
  </div>`;
}

function batchSetupPage() {
  const config = store.list("batchConfigs")[0] || {
    code: "", name: "", loadcell: "", samples: 5,
    tolerance_percent: 0.5, stabilization_seconds: 3,
    formula: "", description: "", weight_tag_id: "", hoppers: [],
  };
  const numericTags = store.list("tags").filter(tag =>
    ["float32","int16","uint16","int32","uint32"].includes(tag.type)
  );
  return `<div>${pageHeader("تنظیمات توزین بچ", "پیکربندی خط، تعداد نمونه، تگ لودسل و نسبت مواد در هر هاپر", `<button class="btn btn-primary" type="submit" form="batch-config-form">ذخیره تنظیمات</button>`)}
    <form id="batch-config-form" data-local-form="batch-config" data-id="${config.id || ""}">
      <div class="two-col-grid">
        ${panel("اطلاعات خط توزین", `<div class="form-grid">
          <label class="field"><span>کد خط</span><input name="code" value="${config.code || ""}" required></label>
          <label class="field"><span>نام خط</span><input name="name" value="${config.name || ""}" required></label>
          <label class="field"><span>شناسه لودسل</span><input name="loadcell" value="${config.loadcell || ""}" placeholder="شناسه تجهیز / باسکول" required></label>
          <label class="field"><span>تگ وزن در Backend</span><select name="weight_tag_id"><option value="">بدون تخصیص</option>${numericTags.map(tag => `<option value="${tag.id}" ${tag.id === config.weight_tag_id ? "selected" : ""}>${tag.name} · ${tag.type} · ${tag.unit || "بدون واحد"}</option>`).join("")}</select></label>
          <label class="field"><span>تعداد نمونه</span><input name="samples" type="number" min="1" max="100" value="${config.samples ?? 5}" required></label>
          <label class="field"><span>حد مجاز خطا (%)</span><input name="tolerance_percent" type="number" min="0" max="100" step="0.01" value="${config.tolerance_percent ?? 0.5}" required></label>
          <label class="field"><span>زمان پایدارسازی (ثانیه)</span><input name="stabilization_seconds" type="number" min="0" max="600" value="${config.stabilization_seconds ?? 3}" required></label>
        </div>`)}
        ${panel("انتخاب فرمول", `<label class="field"><span>فرمول فعال</span><input name="formula" value="${config.formula || ""}" required></label><label class="field"><span>توضیحات</span><textarea name="description" rows="3">${config.description || ""}</textarea></label><div class="storage-list"><div><span>تعداد هاپرهای تعریف‌شده</span><b>${(config.hoppers || []).length.toLocaleString("fa-IR")}</b></div><div><span>مجموع درصد مواد</span><b>${(config.hoppers || []).reduce((sum, hopper) => sum + Number(hopper.ratio || 0), 0).toLocaleString("fa-IR")}%</b></div></div>`)}
      </div>
      ${panel("مواد و هاپرها", config.hoppers?.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>هاپر</th><th>ماده</th><th>درصد فرمول</th><th>وزن هدف (kg)</th></tr></thead><tbody>${config.hoppers.map((hopper,index) => `<tr><td><input name="hopper_${index}_bin" value="${hopper.bin || ""}" required></td><td><input name="hopper_${index}_material" value="${hopper.material || ""}" required></td><td><input type="number" min="0" max="100" step="0.01" name="hopper_${index}_ratio" value="${hopper.ratio ?? 0}" required></td><td><input type="number" min="0" step="0.001" name="hopper_${index}_target" value="${hopper.target ?? 0}" required></td></tr>`).join("")}</tbody></table></div>` : emptyState("برای ذخیره فرمول، ابتدا رکوردی از خط/فرمول با هاپرها ثبت کنید."))}
    </form>
    <p class="muted-note">تخصیص تگ فقط انتخاب داده را مشخص می‌کند. خواندن واقعی باسکول/لودسل، کالیبراسیون، کنترل خروجی هاپرها و توالی ایمن هنوز به درایور و مشخصات سخت‌افزار نیاز دارد.</p>
  </div>`;
}

function batchReportPage() {
  const rows = store.list("batches");
  return `<div>${pageHeader("گزارش بچ‌ها", "سوابق ذخیره‌شده عملیات بچ، مقدار هدف و وضعیت اجرا", button("خروجی CSV", "export-csv", { variant: "light" }))}
    <div class="filter-bar"><label class="field"><span>فرمول</span><select><option>همه فرمول‌ها</option>${[...new Set(rows.map(row => row.formula).filter(Boolean))].map(formula => `<option>${formula}</option>`).join("")}</select></label><label class="field"><span>وضعیت</span><select><option>همه</option><option>در حال توزین</option><option>متوقف‌شده</option><option>لغوشده</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("سوابق بچ", rows.length ? dataTable([
      { key: "code", label: "کد بچ" },
      { key: "formula", label: "فرمول" },
      { key: "target", label: "وزن هدف" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", row.status === "در حال توزین" ? "success" : row.status === "لغوشده" ? "danger" : "warning") },
      { key: "created_at", label: "زمان ثبت", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—" },
    ], rows) : emptyState("هنوز بچی ثبت نشده است."))}
  </div>`;
}

function batchComparePage() {
  const batches = store.list("batches");
  const batch = batches[0] || null;
  const config = currentConfig(batch);
  const hoppers = config?.hoppers || batch?.hoppers || [];
  const tag = config?.weight_tag_id ? store.list("tags").find(item => item.id === config.weight_tag_id) : null;
  const target = Number(batch?.target ?? hoppers.reduce((sum, item) => sum + Number(item.target || 0), 0)) || null;
  const actual = tag && tag.quality === "GOOD" && Number.isFinite(Number(tag.value)) ? Number(tag.value) : null;
  const difference = actual !== null && target !== null ? actual - target : null;
  const deviation = difference !== null && target ? difference * 100 / target : null;
  const rows = hoppers.map(item => ({
    bin: item.bin,
    material: item.material,
    target: item.target ?? "—",
    actual: item.actual ?? "ثبت نشده",
    deviation: item.actual === undefined || item.target === undefined ? "—" :
      `${(Number(item.actual) - Number(item.target)).toLocaleString("fa-IR", { maximumFractionDigits: 3 })} kg`,
  }));
  return `<div>${pageHeader("مقایسه مقدار اسمی و واقعی بچ", "مقایسه هدف فرمول با داده‌ای که از تگ لودسل با کیفیت GOOD ذخیره شده است")}
    <div class="filter-bar"><label class="field"><span>بچ انتخاب‌شده</span><select disabled><option>${batch?.code || "بچی ثبت نشده است"}</option></select></label><label class="field"><span>تگ لودسل</span><input value="${tag?.name || "تگ لودسل تخصیص داده نشده"}" readonly></label></div>
    <div class="stats-grid stats-grid-4">
      ${statCard("وزن هدف", target === null ? "—" : target.toLocaleString("fa-IR"), "kg", "blue")}
      ${statCard("وزن دریافتی", actual === null ? "داده معتبر موجود نیست" : actual.toLocaleString("fa-IR"), actual === null ? "" : "kg", "green")}
      ${statCard("اختلاف", difference === null ? "—" : difference.toLocaleString("fa-IR"), difference === null ? "" : "kg", "orange")}
      ${statCard("انحراف", deviation === null ? "—" : deviation.toLocaleString("fa-IR", { maximumFractionDigits: 3 }), deviation === null ? "" : "%", "purple")}
    </div>
    ${actual !== null ? lineChart("وزن لحظه‌ای ثبت‌شده در تگ", undefined, "#1699c8", [actual]) : panel("مقایسه وزن", emptyState("تا این لحظه مقدار واقعی با کیفیت GOOD از Edge برای تگ لودسل ثبت نشده است."))}
    ${panel("مقایسه بر اساس ماده و هاپر", rows.length ? dataTable([
      { key: "bin", label: "هاپر" },
      { key: "material", label: "ماده" },
      { key: "target", label: "وزن هدف" },
      { key: "actual", label: "وزن واقعی" },
      { key: "deviation", label: "اختلاف" },
    ], rows) : emptyState("برای فرمول بچ، هاپری ثبت نشده است."))}
    <p class="muted-note">این صفحه وزن کلی را فقط از تگ تخصیص‌یافته می‌خواند. وزن واقعی جداگانه هر هاپر باید توسط درایور توزین ثبت شود؛ تا آن زمان مقدارها خالی می‌مانند.</p>
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
