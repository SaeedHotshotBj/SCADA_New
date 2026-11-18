import { store } from "../../services/demo-store.js";
import { escapeHtml } from "../../core/format.js";
import { button, dataTable, pageHeader, panel, pill, statCard, emptyState } from "../../shared/ui.js";

function currentConfig(batch) {
  const configs = store.list("batchConfigs");
  if (batch?.config_id) return configs.find(item => item.id === batch.config_id) || null;
  if (batch?.formula) return configs.find(item => item.formula === batch.formula) || null;
  return null;
}

function latestWeighments(rows) {
  const latest = new Map();
  for (const item of rows) latest.set(item.hopper_key, item);
  return latest;
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
  const weightQuality = weightTag?.quality || "UNSAMPLED";
  const weightAvailable = Number.isFinite(weightValue) && weightQuality === "GOOD";
  const weighments = latestWeighments(store.list("batchWeighments").filter(item => item.batch_id === latest?.id));
  const hopperRows = hoppers.map(hopper => {
    const reading = weighments.get(String(hopper.bin));
    return {
      bin: hopper.bin,
      material: hopper.material,
      ratio: hopper.ratio,
      target: hopper.target,
      actual: reading ? reading.actual_weight : "ثبت نشده",
      result: reading ? reading.result : "—",
      quality: reading ? reading.quality : "—",
      created_at: reading?.created_at || "",
    };
  });
  return \`<div class="batch-page">\${pageHeader("توزین و اجرای بچ", "ثبت وضعیت بچ، ثبت وزن دستی آزمایشی هر هاپر و مشاهده قرائت تگ لودسل", button("بچ جدید", "new-batch", { icon: "+" }))}
    <div class="batch-control-layout">
      <section class="panel">
        <div class="panel-heading"><h3>بچ جاری</h3>\${pill(latest?.status || "بدون بچ ثبت‌شده", isRunning ? "success" : latest ? "info" : "muted")}</div>
        <div class="panel-body">
          <div class="storage-list">
            <div><span>شماره بچ</span><b>\${escapeHtml(latest?.code || "—")}</b></div>
            <div><span>فرمول</span><b>\${escapeHtml(latest?.formula || config?.formula || "—")}</b></div>
            <div><span>خط توزین</span><b>\${escapeHtml(config?.name || "—")}</b></div>
            <div><span>وزن هدف</span><b>\${target === null ? "—" : target.toLocaleString("fa-IR") + " kg"}</b></div>
            <div><span>شروع</span><b>\${latest?.started_at ? new Date(latest.started_at).toLocaleString("fa-IR") : "—"}</b></div>
          </div>
          <div class="batch-main-actions">
            <button class="btn btn-primary" data-action="start-batch" data-id="\${latest?.id || ""}" \${!latest || isRunning || ["لغوشده","تکمیل‌شده"].includes(latest?.status) ? "disabled" : ""}>شروع / ادامه وضعیت</button>
            <button class="btn btn-light" data-action="stop-batch" data-id="\${latest?.id || ""}" \${!latest || !isRunning ? "disabled" : ""}>توقف وضعیت</button>
            <button class="btn btn-light" data-action="record-batch-weighments" data-id="\${latest?.id || ""}" \${!latest || !isRunning || !hoppers.length ? "disabled" : ""}>ثبت وزن هاپرها (DEMO)</button>
            <button class="btn btn-primary" data-action="complete-batch" data-id="\${latest?.id || ""}" \${!latest || !isRunning || !hoppers.length ? "disabled" : ""}>تکمیل بچ</button>
            <button class="btn btn-danger" data-action="cancel-batch" data-id="\${latest?.id || ""}" \${!latest || isRunning || ["لغوشده","تکمیل‌شده"].includes(latest?.status) ? "disabled" : ""}>لغو بچ</button>
          </div>
          <p class="muted-note">تکمیل فقط پس از ثبت وزن همه هاپرها و قرارگرفتن آخرین وزن هر هاپر در تلرانس مجاز پذیرفته می‌شود.</p>
        </div>
      </section>
      <section class="panel batch-weight-panel">
        <div class="panel-heading"><h3>مقدار تگ لودسل</h3>\${pill(weightQuality, weightQuality === "GOOD" ? "success" : weightQuality === "DEMO" ? "warning" : "muted")}</div>
        <div class="panel-body">
          <div class="weight-display"><small>\${escapeHtml(weightTag?.name || "تگ لودسل تخصیص داده نشده")}</small><strong>\${weightAvailable ? weightValue.toLocaleString("fa-IR", { maximumFractionDigits: 3 }) : "—"}</strong><span>\${escapeHtml(weightTag?.unit || "")}</span></div>
          <div class="weight-status"><span class="online-dot"></span><span>\${weightAvailable ? \`منبع: \${escapeHtml(weightTag.source || "ثبت‌شده")}\` : "داده وزن از تگ مشخص‌شده دریافت نشده است."}</span></div>
          <p class="muted-note">مقدار فقط زمانی معتبر است که تگ به منبع Edge/PLC تأییدشده متصل باشد و کیفیت آن GOOD باشد. حالت DEMO مقدار واقعی لودسل نیست.</p>
        </div>
      </section>
    </div>
    \${panel("مواد و هاپرهای فرمول", hoppers.length ? dataTable([
      { key: "bin", label: "هاپر" },
      { key: "material", label: "ماده" },
      { key: "ratio", label: "درصد فرمول", render: row => row.ratio === undefined ? "—" : \`\${Number(row.ratio).toLocaleString("fa-IR")}%\` },
      { key: "target", label: "وزن هدف", render: row => row.target === undefined ? "—" : \`\${Number(row.target).toLocaleString("fa-IR")} kg\` },
      { key: "actual", label: "آخرین وزن ثبت‌شده", render: row => typeof row.actual === "number" ? \`\${row.actual.toLocaleString("fa-IR")} kg\` : row.actual },
      { key: "result", label: "نتیجه", render: row => row.result === "IN_TOLERANCE" ? pill("داخل تلرانس", "success") : row.result === "OUT_OF_TOLERANCE" ? pill("خارج تلرانس", "danger") : "—" },
    ], hopperRows) : emptyState("برای این بچ فرمول دارای هاپر پیدا نشد. در صفحه تنظیمات توزین، فرمول را ذخیره و نام آن را دقیقاً با فرمول بچ یکسان کنید."))}
    \${panel("سوابق آخرین توزین هر هاپر", weighments.size ? dataTable([
      { key: "bin", label: "هاپر" },
      { key: "material", label: "ماده" },
      { key: "target_weight", label: "هدف (kg)" },
      { key: "actual_weight", label: "واقعی (kg)" },
      { key: "result", label: "نتیجه", render: row => pill(row.result, row.result === "IN_TOLERANCE" ? "success" : "danger") },
      { key: "quality", label: "کیفیت" },
      { key: "created_at", label: "زمان", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—" },
    ], [...weighments.values()]) : emptyState("هنوز برای این بچ وزن هاپری ثبت نشده است."))}
    \${panel("وضعیت مراحل توزین", latest?.steps?.length ? dataTable([
      { key: "name", label: "مرحله" },
      { key: "status", label: "وضعیت" },
      { key: "started_at", label: "شروع" },
      { key: "completed_at", label: "پایان" },
    ], latest.steps) : emptyState("برای این بچ هنوز داده مرحله‌ای از سیستم توزین ثبت نشده است."))}
  </div>\`;
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
  const hoppers = config.hoppers?.length ? config.hoppers : [{ bin: "Hopper 01", material: "", ratio: 100, target: 0 }];
  return \`<div>\${pageHeader("تنظیمات توزین بچ", "پیکربندی خط، تعداد نمونه، تگ لودسل و نسبت مواد در هر هاپر", \`<button class="btn btn-primary" type="submit" form="batch-config-form">ذخیره تنظیمات</button>\`)}
    <form id="batch-config-form" data-local-form="batch-config" data-id="\${config.id || ""}">
      <div class="two-col-grid">
        \${panel("اطلاعات خط توزین", \`<div class="form-grid">
          <label class="field"><span>کد خط</span><input name="code" value="\${escapeHtml(config.code || "")}" required></label>
          <label class="field"><span>نام خط</span><input name="name" value="\${escapeHtml(config.name || "")}" required></label>
          <label class="field"><span>شناسه لودسل</span><input name="loadcell" value="\${escapeHtml(config.loadcell || "")}" placeholder="شناسه تجهیز / باسکول" required></label>
          <label class="field"><span>تگ وزن در Backend</span><select name="weight_tag_id"><option value="">بدون تخصیص</option>\${numericTags.map(tag => \`<option value="\${tag.id}" \${tag.id === config.weight_tag_id ? "selected" : ""}>\${escapeHtml(tag.name)} · \${tag.type} · \${escapeHtml(tag.unit || "بدون واحد")}</option>\`).join("")}</select></label>
          <label class="field"><span>تعداد نمونه</span><input name="samples" type="number" min="1" max="100" value="\${config.samples ?? 5}" required></label>
          <label class="field"><span>حد مجاز خطا (%)</span><input name="tolerance_percent" type="number" min="0" max="100" step="0.01" value="\${config.tolerance_percent ?? 0.5}" required></label>
          <label class="field"><span>زمان پایدارسازی (ثانیه)</span><input name="stabilization_seconds" type="number" min="0" max="600" value="\${config.stabilization_seconds ?? 3}" required></label>
        </div>\`)}
        \${panel("انتخاب فرمول", \`<label class="field"><span>فرمول فعال</span><input name="formula" value="\${escapeHtml(config.formula || "")}" required></label><label class="field"><span>توضیحات</span><textarea name="description" rows="3">\${escapeHtml(config.description || "")}</textarea></label><div class="storage-list"><div><span>تعداد هاپرهای تعریف‌شده</span><b>\${hoppers.length.toLocaleString("fa-IR")}</b></div><div><span>مجموع درصد مواد</span><b>\${hoppers.reduce((sum, hopper) => sum + Number(hopper.ratio || 0), 0).toLocaleString("fa-IR")}%</b></div></div>\`)}
      </div>
      \${panel("مواد و هاپرها", \`<div class="table-wrap"><table class="data-table"><thead><tr><th>هاپر</th><th>ماده</th><th>درصد فرمول</th><th>وزن هدف (kg)</th><th>عملیات</th></tr></thead><tbody id="batch-hopper-rows" data-next-index="\${hoppers.length}">\${hoppers.map((hopper,index) => hopperEditorRow(hopper,index)).join("")}</tbody></table></div><button type="button" class="btn btn-light" data-action="add-batch-hopper">افزودن هاپر</button>\`)}
    </form>
    <p class="muted-note">درصد همه هاپرها باید در مجموع دقیقاً ۱۰۰ باشد. وزن‌ها و تلرانس این بخش تنظیمات فرمول هستند؛ ثبت وزن دستی در زمان اجرای بچ با برچسب DEMO ذخیره می‌شود و جایگزین داده باسکول واقعی نیست.</p>
  </div>\`;
}

function hopperEditorRow(hopper, index) {
  return \`<tr>
    <td><input name="hopper_\${index}_bin" value="\${escapeHtml(hopper.bin || "")}" required></td>
    <td><input name="hopper_\${index}_material" value="\${escapeHtml(hopper.material || "")}" required></td>
    <td><input type="number" min="0" max="100" step="0.01" name="hopper_\${index}_ratio" value="\${hopper.ratio ?? 0}" required></td>
    <td><input type="number" min="0" step="0.001" name="hopper_\${index}_target" value="\${hopper.target ?? 0}" required></td>
    <td><button type="button" class="btn btn-light btn-sm" data-action="remove-batch-hopper">حذف</button></td>
  </tr>\`;
}

function batchReportPage() {
  const rows = store.list("batches");
  return \`<div>\${pageHeader("گزارش بچ‌ها", "سوابق ذخیره‌شده عملیات بچ، مقدار هدف و وضعیت اجرا", button("خروجی CSV", "export-csv", { variant: "light" }))}
    <div class="filter-bar"><label class="field"><span>فرمول</span><select><option>همه فرمول‌ها</option>\${[...new Set(rows.map(row => row.formula).filter(Boolean))].map(formula => \`<option>\${escapeHtml(formula)}</option>\`).join("")}</select></label><label class="field"><span>وضعیت</span><select><option>همه</option><option>در حال توزین</option><option>متوقف‌شده</option><option>لغوشده</option><option>تکمیل‌شده</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    \${panel("سوابق بچ", rows.length ? dataTable([
      { key: "code", label: "کد بچ" },
      { key: "formula", label: "فرمول" },
      { key: "target", label: "وزن هدف" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", row.status === "در حال توزین" ? "success" : row.status === "لغوشده" ? "danger" : "warning") },
      { key: "created_at", label: "زمان ثبت", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—" },
    ], rows) : emptyState("هنوز بچی ثبت نشده است."))}
  </div>\`;
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
  const weighments = latestWeighments(store.list("batchWeighments").filter(item => item.batch_id === batch?.id));
  const rows = hoppers.map(item => {
    const measured = weighments.get(String(item.bin));
    const actualWeight = measured ? Number(measured.actual_weight) : null;
    return {
      bin: item.bin,
      material: item.material,
      target: item.target ?? "—",
      actual: actualWeight === null ? "ثبت نشده" : actualWeight,
      deviation: actualWeight === null || item.target === undefined ? "—" :
        \`\${(actualWeight - Number(item.target)).toLocaleString("fa-IR", { maximumFractionDigits: 3 })} kg\`,
      quality: measured?.quality || "—",
    };
  });
  return \`<div>\${pageHeader("مقایسه مقدار اسمی و واقعی بچ", "مقایسه وزن کل تگ لودسل و وزن ثبت‌شده هر هاپر")}
    <div class="filter-bar"><label class="field"><span>بچ انتخاب‌شده</span><select disabled><option>\${escapeHtml(batch?.code || "بچی ثبت نشده است")}</option></select></label><label class="field"><span>تگ لودسل</span><input value="\${escapeHtml(tag?.name || "تگ لودسل تخصیص داده نشده")}" readonly></label></div>
    <div class="stats-grid stats-grid-4">
      \${statCard("وزن هدف", target === null ? "—" : target.toLocaleString("fa-IR"), "kg", "blue")}
      \${statCard("وزن دریافتی", actual === null ? "داده معتبر موجود نیست" : actual.toLocaleString("fa-IR"), actual === null ? "" : "kg", "green")}
      \${statCard("اختلاف", difference === null ? "—" : difference.toLocaleString("fa-IR"), difference === null ? "" : "kg", "orange")}
      \${statCard("انحراف", deviation === null ? "—" : deviation.toLocaleString("fa-IR", { maximumFractionDigits: 3 }), deviation === null ? "" : "%", "purple")}
    </div>
    \${panel("آخرین قرائت معتبر لودسل", actual !== null ? \`<div class="storage-list"><div><span>مقدار</span><b>\${actual.toLocaleString("fa-IR", { maximumFractionDigits: 3 })} \${escapeHtml(tag?.unit || "")}</b></div><div><span>زمان نمونه</span><b>\${tag?.sampled_at ? new Date(tag.sampled_at).toLocaleString("fa-IR") : "—"}</b></div><div><span>منبع</span><b>\${escapeHtml(tag?.source || "—")}</b></div></div>\` : emptyState("تا این لحظه مقدار واقعی با کیفیت GOOD از Edge برای تگ لودسل ثبت نشده است."))}
    \${panel("مقایسه بر اساس ماده و هاپر", rows.length ? dataTable([
      { key: "bin", label: "هاپر" },
      { key: "material", label: "ماده" },
      { key: "target", label: "وزن هدف" },
      { key: "actual", label: "وزن واقعی" },
      { key: "deviation", label: "اختلاف" },
      { key: "quality", label: "کیفیت" },
    ], rows) : emptyState("برای فرمول بچ، هاپری ثبت نشده است."))}
    <p class="muted-note">وزن کلی فقط از تگ تخصیص‌یافته خوانده می‌شود. وزن جداگانه هر هاپر در این صفحه با برچسب DEMO از API نمایش داده می‌شود و تا اتصال درایور توزین، مقدار واقعی سخت‌افزار محسوب نمی‌شود.</p>
  </div>\`;
}

export function renderBatch(path) {
  switch (path) {
    case "/batch/setup": return batchSetupPage();
    case "/batch/report": return batchReportPage();
    case "/batch/compare": return batchComparePage();
    default: return batchRunPage();
  }
}
