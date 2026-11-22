import { api } from "../../services/api-client.js";
import { store } from "../../services/demo-store.js";
import { escapeHtml } from "../../core/format.js";
import { HMI_BINDINGS, HMI_CHART_RANGES, HMI_WIDGET_LIBRARY, createHmiWidget, hmiWidgetGridStyle, normalizeHmiWidgetGeometry, isBooleanTag, isNumericTag, renderHmiWidget } from "./hmi-widgets.js";

let activePageKey = null;
let draft = null;
let selectedWidgetId = null;
let jsonError = "";
let layoutPreviewOpen = false;
let layoutGesture = null;
let designerChartRefreshTimer = null;
let designerChartRefreshInFlight = false;
const chartHistory = new Map();
const chartHistoryStatus = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function initializeDraft(pageId) {
  const key = pageId || "new";
  if (activePageKey === key && draft) return;
  activePageKey = key;
  const existing = pageId ? store.list("hmiPages").find(item => item.id === pageId) : null;
  draft = existing ? clone(existing) : {
    name: "",
    machine: "",
    description: "",
    status: "فعال",
    layout: [],
  };
  if (!Array.isArray(draft.layout)) draft.layout = [];
  draft.layout = draft.layout.map((item, index) => normalizeHmiWidgetGeometry({
    ...item,
    widget_id: item.widget_id || ("hmi-existing-" + index + "-" + String(item.type || "widget")),
  }, index));
  selectedWidgetId = draft.layout[0]?.widget_id || null;
  jsonError = "";
}

function selectedWidget() {
  return draft?.layout?.find(item => item.widget_id === selectedWidgetId) || null;
}

function chartHistorySeconds(component) {
  if (component?.history_seconds !== undefined && component?.history_seconds !== null) {
    return Number(component.history_seconds);
  }
  const legacyHours = Number(component?.history_hours);
  return Number.isFinite(legacyHours) && legacyHours > 0 ? legacyHours * 3600 : 3600;
}

function chartHistoryKey(tagId, seconds) {
  return String(tagId) + ":" + String(seconds);
}

function chartHistoryState(tagId, seconds) {
  return chartHistoryStatus.get(chartHistoryKey(tagId, seconds)) || null;
}

function tagOptions(binding, selectedId) {
  const tags = store.list("tags").filter(tag => {
    if (binding.kind === "boolean") return isBooleanTag(tag);
    if (binding.kind === "numeric") return isNumericTag(tag);
    return true;
  });
  const placeholder = '<option value="">— انتخاب تگ —</option>';
  return placeholder + tags.map(tag =>
    '<option value="' + escapeHtml(tag.id) + '" ' + (tag.id === selectedId ? "selected" : "") + '>' +
    escapeHtml(tag.name) + " · " + escapeHtml(tag.type) + (tag.unit ? " · " + escapeHtml(tag.unit) : "") + '</option>'
  ).join("");
}

function fieldMarkup(label, key, value, type = "text", options = {}) {
  const required = options.required ? " required" : "";
  const min = options.min !== undefined ? ' min="' + options.min + '"' : "";
  const max = options.max !== undefined ? ' max="' + options.max + '"' : "";
  const step = type === "number" ? ' step="' + (options.step || "any") + '"' : "";
  return '<label class="field"><span>' + escapeHtml(label) + '</span><input type="' + type + '" data-hmi-prop="' + key + '" value="' + escapeHtml(value ?? "") + '"' + required + min + max + step + ' /></label>';
}

function selectMarkup(label, key, options, value) {
  return '<label class="field"><span>' + escapeHtml(label) + '</span><select data-hmi-prop="' + key + '">' +
    options.map(option => '<option value="' + escapeHtml(option.value) + '" ' + (String(option.value) === String(value) ? "selected" : "") + '>' +
      escapeHtml(option.label) + '</option>').join("") + '</select></label>';
}

function bindingMarkup(binding, component) {
  return '<label class="field"><span>' + escapeHtml(binding.label) + (binding.required ? ' <b class="hmi-required-mark">*</b>' : "") + '</span>' +
    '<select data-hmi-prop="' + binding.key + '">' + tagOptions(binding, component[binding.key]) + '</select>' +
    (binding.kind === "boolean" ? '<small class="hmi-field-help">فقط تگ‌های BOOL نمایش داده می‌شوند.</small>' :
      binding.kind === "numeric" ? '<small class="hmi-field-help">فقط تگ‌های عددی نمایش داده می‌شوند.</small>' : "") + '</label>';
}

function propertiesMarkup() {
  const component = selectedWidget();
  if (!component) {
    return '<section class="hmi-designer-side-panel"><div class="hmi-designer-side-heading"><b>ویژگی‌های جزء</b></div><div class="hmi-designer-empty">برای تنظیم ویژگی‌ها، یکی از اجزای محیط طراحی را انتخاب کن.</div></section>';
  }
  const definition = HMI_WIDGET_LIBRARY.find(item => item.type === component.type);
  const bindings = HMI_BINDINGS[component.type] || [];
  let fields = fieldMarkup("عنوان نمایشی", "label", component.label || "");
  fields += bindings.map(binding => bindingMarkup(binding, component)).join("");
  if (["gauge", "needle", "thermometer", "tank"].includes(component.type)) {
    fields += fieldMarkup("حداقل مقیاس", "min", component.min ?? 0, "number");
    fields += fieldMarkup("حداکثر مقیاس", "max", component.max ?? 100, "number");
  }
  if (component.type === "chart") {
    fields += selectMarkup("نوع نمودار", "chart_kind", [
      { value: "line", label: "خطی" },
      { value: "bar", label: "ستونی" },
    ], component.chart_kind || "line");
    fields += selectMarkup("بازه زمانی نمایش", "history_seconds", HMI_CHART_RANGES, chartHistorySeconds(component));
    fields += '<small class="hmi-field-help">این گزینه مدت تاریخچه‌ی قابل نمایش است، نه سرعت نمونه‌برداری. تعداد نقاط به Poll و فاصله ذخیره تاریخچه در تنظیمات PLC یا Edge بستگی دارد.</small>';
  }
  const warning = component.type === "write"
    ? '<div class="hmi-designer-warning">این جزء قابلیت ارسال مقدار دارد. نوشتن روی PLC واقعی فقط از مسیر مجوزهای ایمنی موجود و با تأیید صریح ممکن است؛ هیچ مجوزی از این صفحه فعال نمی‌شود.</div>'
    : "";
  return '<section class="hmi-designer-side-panel"><div class="hmi-designer-side-heading"><b>ویژگی‌های جزء</b><small>' +
    escapeHtml(definition?.label || component.type) + '</small></div><div class="hmi-designer-properties">' + fields + warning +
    '<button type="button" class="btn btn-danger btn-sm" data-action="hmi-remove-widget" data-widget-id="' + escapeHtml(component.widget_id) + '">حذف این جزء</button></div></section>';
}

function canvasMarkup() {
  const tags = store.list("tags");
  if (!draft.layout.length) {
    return '<div class="hmi-designer-empty"><span>＋</span><b>صفحه هنوز خالی است</b><small>از کتابخانه یک جزء صنعتی انتخاب کن تا به صفحه اضافه شود.</small></div>';
  }
  return draft.layout.map((component, index) => {
    const selected = component.widget_id === selectedWidgetId;
    const seconds = chartHistorySeconds(component);
    const history = component.type === "chart" ? getHmiChartHistory(component.tag_id, seconds) : [];
    const historyState = component.type === "chart" ? chartHistoryState(component.tag_id, seconds) : null;
    const widget = renderHmiWidget(component, tags, { preview: true, history, historyState });
    return '<div class="hmi-designer-item ' + (selected ? "is-selected" : "") + '" data-action="hmi-select-widget" data-widget-id="' + escapeHtml(component.widget_id) + '">' +
      '<div class="hmi-designer-item-toolbar"><small>' + String(index + 1).toLocaleString("fa-IR") + ' · ' + escapeHtml(component.type) + '</small>' +
      '<span><button type="button" title="انتقال به بالا" data-action="hmi-move-widget" data-widget-id="' + escapeHtml(component.widget_id) + '" data-direction="-1" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
      '<button type="button" title="انتقال به پایین" data-action="hmi-move-widget" data-widget-id="' + escapeHtml(component.widget_id) + '" data-direction="1" ' + (index === draft.layout.length - 1 ? "disabled" : "") + '>↓</button></span></div>' +
      widget + '</div>';
  }).join("");
}

function setJsonStatus(message, tone = "success") {
  const status = document.getElementById("hmi-json-status");
  if (status) {
    status.className = "hmi-json-status hmi-json-status--" + tone;
    status.textContent = message;
  }
}

function syncJsonEditor() {
  const textarea = document.getElementById("hmi-json-source");
  if (textarea && document.activeElement !== textarea) {
    textarea.value = JSON.stringify(draft.layout, null, 2);
  }
  jsonError = "";
  setJsonStatus("JSON معتبر · همگام با طراح", "success");
}

function refreshDesignerPanels() {
  const canvas = document.getElementById("hmi-designer-canvas");
  const properties = document.getElementById("hmi-designer-properties");
  if (canvas) canvas.innerHTML = canvasMarkup();
  if (properties) properties.innerHTML = propertiesMarkup();
  const previewRoot = document.getElementById("hmi-layout-preview-root");
  if (previewRoot) {
    previewRoot.hidden = !layoutPreviewOpen;
    previewRoot.innerHTML = layoutPreviewOpen ? layoutPreviewMarkup() : "";
  }
  syncJsonEditor();
}

function updateLayoutCardContents() {
  const root = document.getElementById("hmi-layout-preview-root");
  const canvas = root?.querySelector("#hmi-layout-preview-canvas");
  if (!root || root.hidden || !canvas || layoutGesture) return;
  const tags = store.list("tags");
  for (const [index, component] of draft.layout.entries()) {
    const card = [...canvas.querySelectorAll("[data-hmi-layout-card]")].find(item => item.dataset.widgetId === component.widget_id);
    if (!card) continue;
    const seconds = chartHistorySeconds(component);
    const history = component.type === "chart" ? getHmiChartHistory(component.tag_id, seconds) : [];
    const historyState = component.type === "chart" ? chartHistoryState(component.tag_id, seconds) : null;
    const content = card.querySelector(".hmi-layout-card-content");
    if (content) content.innerHTML = renderHmiWidget(component, tags, { preview: true, history, historyState });
    card.style.cssText = hmiWidgetGridStyle(component, index);
    card.classList.toggle("is-selected", component.widget_id === selectedWidgetId);
  }
}

export function refreshHmiDesignerLivePreview() {
  if (!document.querySelector(".hmi-designer-page")) return;
  const canvas = document.getElementById("hmi-designer-canvas");
  if (canvas) canvas.innerHTML = canvasMarkup();
  updateLayoutCardContents();
}

function libraryMarkup() {
  const categories = [...new Set(HMI_WIDGET_LIBRARY.map(item => item.category))];
  return '<aside class="hmi-designer-side-panel hmi-library-panel"><div class="hmi-designer-side-heading"><b>کتابخانه اجزا</b><small>' +
    HMI_WIDGET_LIBRARY.length.toLocaleString("fa-IR") + ' جزء آماده</small></div>' +
    categories.map(category => '<section class="hmi-library-category"><h4>' + escapeHtml(category) + '</h4><div class="hmi-library-items">' +
      HMI_WIDGET_LIBRARY.filter(item => item.category === category).map(item =>
        '<button type="button" class="hmi-library-item" data-action="hmi-add-widget" data-widget-type="' + item.type + '" title="' + escapeHtml(item.help) + '">' +
        '<span>' + escapeHtml(item.icon) + '</span><b>' + escapeHtml(item.label) + '</b><small>＋ افزودن</small></button>'
      ).join("") + '</div></section>').join("") + '</aside>';
}

function layoutPropertiesMarkup() {
  const component = selectedWidget();
  if (!component) {
    return '<section class="hmi-layout-properties"><b>چیدمان کارت</b><p>یک کارت را انتخاب کن تا جایگاه و اندازه‌ی آن را تنظیم کنی.</p></section>';
  }
  return '<section class="hmi-layout-properties"><div class="hmi-layout-properties-title"><b>چیدمان کارت</b><small>' +
    escapeHtml(component.label || component.type) + '</small></div><div class="hmi-layout-properties-fields">' +
    '<label class="field"><span>ستون شروع (۱ تا ۱۲)</span><input type="number" min="1" max="12" step="1" data-hmi-layout-prop="grid_col" value="' + component.grid_col + '"></label>' +
    '<label class="field"><span>ردیف شروع</span><input type="number" min="1" max="200" step="1" data-hmi-layout-prop="grid_row" value="' + component.grid_row + '"></label>' +
    '<label class="field"><span>عرض (تعداد ستون)</span><input type="number" min="1" max="12" step="1" data-hmi-layout-prop="grid_w" value="' + component.grid_w + '"></label>' +
    '<label class="field"><span>ارتفاع (تعداد ردیف)</span><input type="number" min="1" max="12" step="1" data-hmi-layout-prop="grid_h" value="' + component.grid_h + '"></label>' +
    '</div><p class="hmi-field-help">برای جابه‌جایی، دستگیره‌ی بالای کارت را بکش. برای تغییر اندازه، گوشه‌ی پایین کارت را بکش. تغییرات در JSON و صفحه‌ی نهایی ذخیره می‌شوند.</p>' +
    '<button type="button" class="btn btn-light btn-sm" data-action="hmi-reset-layout-widget" data-widget-id="' + escapeHtml(component.widget_id) + '">بازنشانی اندازه و جایگاه</button></section>';
}

function layoutPreviewCardMarkup(component, index) {
  const seconds = chartHistorySeconds(component);
  const history = component.type === "chart" ? getHmiChartHistory(component.tag_id, seconds) : [];
  const historyState = component.type === "chart" ? chartHistoryState(component.tag_id, seconds) : null;
  const widget = renderHmiWidget(component, store.list("tags"), { preview: true, history, historyState });
  return '<article class="hmi-layout-card ' + (component.widget_id === selectedWidgetId ? "is-selected" : "") +
    '" data-hmi-layout-card data-action="hmi-select-layout-widget" data-widget-id="' + escapeHtml(component.widget_id) + '" style="' +
    hmiWidgetGridStyle(component, index) + '">' +
    '<header class="hmi-layout-card-toolbar"><button type="button" class="hmi-layout-move" data-hmi-layout-gesture="move" data-widget-id="' +
    escapeHtml(component.widget_id) + '" title="برای جابه‌جایی بکش">↕ جابه‌جایی</button><span>' +
    escapeHtml(component.label || component.type) + '</span></header>' +
    '<div class="hmi-layout-card-content">' + widget + '</div>' +
    '<button type="button" class="hmi-layout-resize" data-hmi-layout-gesture="resize" data-widget-id="' +
    escapeHtml(component.widget_id) + '" title="برای تغییر اندازه بکش" aria-label="تغییر اندازه کارت">◢</button></article>';
}

function layoutPreviewMarkup() {
  const cards = draft.layout.map(layoutPreviewCardMarkup).join("");
  return '<div class="hmi-layout-preview-backdrop" data-action="hmi-close-layout-preview">' +
    '<section class="hmi-layout-preview-window" role="dialog" aria-modal="true" aria-label="پیش‌نمایش و چیدمان صفحه HMI">' +
    '<header class="hmi-layout-preview-header"><div><b>پیش‌نمایش شناور صفحه HMI</b><small>کارت‌ها را جابه‌جا و از گوشه‌ی پایین اندازه‌ی آن‌ها را تغییر بده.</small></div>' +
    '<button type="button" class="btn btn-light btn-sm" data-action="hmi-close-layout-preview">بستن پیش‌نمایش</button></header>' +
    '<div class="hmi-layout-preview-body"><main class="hmi-layout-preview-main"><div class="hmi-layout-stage-scroll">' +
    '<div id="hmi-layout-preview-canvas" class="hmi-layout-preview-canvas">' +
    (cards || '<div class="hmi-layout-preview-empty">ابتدا از کتابخانه، جزءهای موردنیاز را به صفحه اضافه کن.</div>') +
    '</div></div><p class="hmi-layout-preview-hint">این پیش‌نمایش فقط نمایش است؛ فرمانی به PLC ارسال نمی‌کند. تنظیمات جایگاه و اندازه همراه صفحه ذخیره می‌شود.</p></main>' +
    '<aside id="hmi-layout-preview-properties">' + layoutPropertiesMarkup() + '</aside></div></section></div>';
}

function pageSettingsMarkup() {
  const machines = store.list("machines");
  const machineOptions = [{ value: "", label: "— انتخاب ماشین —" }, ...machines.map(machine => ({ value: machine.name, label: machine.name }))];
  return '<section class="hmi-designer-settings"><div class="hmi-designer-settings-title"><b>مشخصات صفحه</b><small>نام، ماشین و وضعیت صفحه HMI</small></div>' +
    '<div class="hmi-designer-settings-grid">' +
    '<label class="field"><span>نام صفحه</span><input name="name" data-hmi-page-field="name" value="' + escapeHtml(draft.name || "") + '" required /></label>' +
    '<label class="field"><span>ماشین</span><select name="machine" data-hmi-page-field="machine" required>' +
    machineOptions.map(option => '<option value="' + escapeHtml(option.value) + '" ' + (String(option.value) === String(draft.machine || "") ? "selected" : "") + '>' + escapeHtml(option.label) + '</option>').join("") +
    '</select></label>' +
    '<label class="field"><span>وضعیت</span><select name="status" data-hmi-page-field="status"><option value="فعال" ' + (draft.status !== "غیرفعال" ? "selected" : "") + '>فعال</option><option value="غیرفعال" ' + (draft.status === "غیرفعال" ? "selected" : "") + '>غیرفعال</option></select></label>' +
    '<label class="field hmi-designer-description"><span>توضیحات</span><input name="description" data-hmi-page-field="description" value="' + escapeHtml(draft.description || "") + '" placeholder="شرح کوتاه صفحه مانیتورینگ" /></label>' +
    '</div>' + (machines.length ? "" : '<p class="hmi-designer-warning">هنوز ماشینی تعریف نشده است. پیش از ذخیره صفحه، یک ماشین در بخش مدیریت ماشین‌ها بساز.</p>') +
    '</section>';
}

export function renderHmiDesigner(pageId = null) {
  if (pageId && !store.list("hmiPages").some(item => item.id === pageId)) {
    return '<div>' +
      '<div class="page-heading"><div><h1>صفحه HMI پیدا نشد</h1><p>شناسه صفحه در Backend موجود نیست یا حذف شده است.</p></div>' +
      '<a class="btn btn-light" href="#/live/hmi-pages">بازگشت به صفحات HMI</a></div>' +
      '</div>';
  }
  initializeDraft(pageId);
  const editing = Boolean(pageId);
  return '<div class="hmi-designer-page">' +
    '<div class="page-heading"><div><h1>' + (editing ? "ویرایش صفحه HMI" : "طراحی صفحه HMI") + '</h1><p>اجزای صنعتی را انتخاب کن، ویژگی‌ها و تگ‌ها را تنظیم کن و JSON را هم‌زمان ببین.</p></div>' +
    '<div class="heading-actions"><a class="btn btn-light" href="#/live/hmi-pages">بازگشت به صفحات HMI</a><button type="button" class="btn btn-light" data-action="hmi-open-layout-preview">پیش‌نمایش شناور و چیدمان کارت‌ها</button><button class="btn btn-primary" type="submit" form="hmi-designer-form">ذخیره صفحه</button></div></div>' +
    '<form id="hmi-designer-form" data-page-id="' + escapeHtml(pageId || "") + '">' +
    pageSettingsMarkup() +
    '<div class="hmi-designer-workspace">' + libraryMarkup() +
    '<section class="hmi-designer-side-panel hmi-canvas-panel"><div class="hmi-designer-side-heading"><b>محیط طراحی</b><small>' +
    draft.layout.length.toLocaleString("fa-IR") + ' جزء · پیش‌نمایش بدون ارسال فرمان</small></div>' +
    '<div id="hmi-designer-canvas" class="hmi-designer-canvas">' + canvasMarkup() + '</div></section>' +
    '<div id="hmi-designer-properties">' + propertiesMarkup() + '</div>' +
    '</div>' +
    '<div id="hmi-layout-preview-root" hidden></div>' +
    '<section class="hmi-json-panel"><div class="hmi-json-heading"><div><b>JSON صفحه</b><small>با تغییر تنظیمات به‌روزرسانی می‌شود؛ JSON معتبر نیز به طراح برمی‌گردد.</small></div>' +
    '<span id="hmi-json-status" class="hmi-json-status hmi-json-status--success">JSON معتبر · همگام با طراح</span></div>' +
    '<textarea id="hmi-json-source" spellcheck="false" aria-label="JSON چیدمان HMI">' + escapeHtml(JSON.stringify(draft.layout, null, 2)) + '</textarea>' +
    '<p class="muted-note">حداکثر ۵۰ جزء در هر صفحه. شناسه‌های تگ باید از بخش مدیریت تگ‌ها انتخاب شوند؛ مقادیر واقعی از Backend خوانده می‌شوند.</p></section>' +
    '</form></div>';
}

function validateDraftLayout() {
  if (!Array.isArray(draft.layout) || draft.layout.length > 50) {
    throw new Error("چیدمان باید آرایه‌ای با حداکثر ۵۰ جزء باشد.");
  }
  const tags = store.list("tags");
  for (const [index, component] of draft.layout.entries()) {
    const number = index + 1;
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      throw new Error("جزء شماره " + number + " معتبر نیست.");
    }
    if (!HMI_WIDGET_LIBRARY.some(item => item.type === component.type)) {
      throw new Error("نوع جزء شماره " + number + " در کتابخانه پشتیبانی نمی‌شود.");
    }
    const bindings = HMI_BINDINGS[component.type] || [];
    for (const binding of bindings) {
      const tagId = component[binding.key];
      if (binding.required && !tagId) {
        throw new Error("برای " + (component.label || ("جزء " + number)) + "، فیلد «" + binding.label + "» را انتخاب کن.");
      }
      if (!tagId) continue;
      const tag = tags.find(item => item.id === tagId);
      if (!tag) throw new Error("تگ انتخاب‌شده برای جزء «" + (component.label || number) + "» پیدا نشد.");
      if (binding.kind === "boolean" && !isBooleanTag(tag)) {
        throw new Error("اتصال «" + binding.label + "» فقط باید از نوع BOOL باشد.");
      }
      if (binding.kind === "numeric" && !isNumericTag(tag)) {
        throw new Error("اتصال «" + binding.label + "» باید عددی باشد.");
      }
      if (component.type === "write" && tag.access !== "read_write") {
        throw new Error("برای جزء کنترل تگ، تگ باید دسترسی read/write داشته باشد.");
      }
    }
    if (["gauge", "needle", "thermometer", "tank"].includes(component.type)) {
      const min = Number(component.min ?? 0);
      const max = Number(component.max ?? 100);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        throw new Error("محدوده حداقل و حداکثر در جزء «" + (component.label || number) + "» معتبر نیست.");
      }
    }
    const geometry = normalizeHmiWidgetGeometry(component, index);
    if (geometry.grid_col + geometry.grid_w - 1 > 12) {
      throw new Error("عرض کارت از محدوده‌ی ۱۲ ستونی صفحه خارج می‌شود.");
    }
    Object.assign(component, geometry);
    if (component.type === "chart" && !HMI_CHART_RANGES.some(range => range.value === chartHistorySeconds(component))) {
      throw new Error("بازه زمانی انتخاب‌شده برای نمودار معتبر نیست.");
    }
  }
}

export async function handleHmiDesignerSubmit(form) {
  if (jsonError) throw new Error("JSON معتبر نیست؛ ابتدا خطای JSON را اصلاح کن.");
  draft.name = String(form.querySelector('[data-hmi-page-field="name"]')?.value || "").trim();
  draft.machine = String(form.querySelector('[data-hmi-page-field="machine"]')?.value || "").trim();
  draft.status = String(form.querySelector('[data-hmi-page-field="status"]')?.value || "فعال");
  draft.description = String(form.querySelector('[data-hmi-page-field="description"]')?.value || "").trim();
  if (!draft.name) throw new Error("نام صفحه الزامی است.");
  if (!draft.machine) throw new Error("یک ماشین برای صفحه انتخاب کن.");
  if (!store.list("machines").some(machine => machine.name === draft.machine)) {
    throw new Error("ماشین انتخاب‌شده در سامانه وجود ندارد.");
  }
  validateDraftLayout();
  const normalizedLayout = clone(draft.layout).map((component, index) => {
    const normalized = {
      ...component,
      ...(component.min !== undefined ? { min: Number(component.min) } : {}),
      ...(component.max !== undefined ? { max: Number(component.max) } : {}),
    };
    if (component.type === "chart") {
      normalized.history_seconds = chartHistorySeconds(component);
      delete normalized.history_hours;
    }
    return normalizeHmiWidgetGeometry(normalized, index);
  });
  const payload = {
    name: draft.name,
    machine: draft.machine,
    description: draft.description,
    status: draft.status,
    layout: normalizedLayout,
  };
  const saved = form.dataset.pageId
    ? await store.update("hmiPages", form.dataset.pageId, payload)
    : await store.add("hmiPages", payload);
  activePageKey = saved.id || activePageKey;
  draft = clone(saved);
  location.hash = "/live/hmi-pages";
  return saved;
}

export function handleHmiDesignerInput(event) {
  const target = event.target;
  if (!target || !target.closest(".hmi-designer-page")) return false;
  if (target.id === "hmi-json-source") {
    try {
      const parsed = JSON.parse(target.value);
      if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("JSON باید آرایه‌ای با حداکثر ۵۰ جزء باشد.");
      draft.layout = parsed.map((item, index) => normalizeHmiWidgetGeometry({
        ...item,
        widget_id: item.widget_id || ("hmi-json-" + index + "-" + String(item.type || "widget")),
      }, index));
      if (!draft.layout.some(item => item.widget_id === selectedWidgetId)) {
        selectedWidgetId = draft.layout[0]?.widget_id || null;
      }
      jsonError = "";
      setJsonStatus("JSON معتبر · پیش‌نمایش به‌روزرسانی شد", "success");
      const canvas = document.getElementById("hmi-designer-canvas");
      const properties = document.getElementById("hmi-designer-properties");
      if (canvas) canvas.innerHTML = canvasMarkup();
      if (properties) properties.innerHTML = propertiesMarkup();
      const previewRoot = document.getElementById("hmi-layout-preview-root");
      if (previewRoot) {
        previewRoot.hidden = !layoutPreviewOpen;
        previewRoot.innerHTML = layoutPreviewOpen ? layoutPreviewMarkup() : "";
      }
    } catch (error) {
      jsonError = error.message || "JSON نامعتبر است.";
      setJsonStatus(jsonError, "error");
    }
    return true;
  }
  const pageField = target.dataset.hmiPageField;
  if (pageField) {
    draft[pageField] = target.value;
    return true;
  }
  const layoutProperty = target.dataset.hmiLayoutProp;
  if (layoutProperty) {
    const component = selectedWidget();
    if (!component || target.value === "") return true;
    const limits = {
      grid_col: [1, 12],
      grid_row: [1, 200],
      grid_w: [1, 12],
      grid_h: [1, 12],
    }[layoutProperty];
    if (!limits) return true;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return true;
    component[layoutProperty] = Math.max(limits[0], Math.min(limits[1], Math.round(value)));
    const index = draft.layout.findIndex(item => item.widget_id === component.widget_id);
    Object.assign(component, normalizeHmiWidgetGeometry(component, index));
    const card = [...document.querySelectorAll("[data-hmi-layout-card]")].find(item => item.dataset.widgetId === component.widget_id);
    if (card) card.style.cssText = hmiWidgetGridStyle(component, index);
    const inputs = document.querySelectorAll("#hmi-layout-preview-properties [data-hmi-layout-prop]");
    for (const input of inputs) input.value = component[input.dataset.hmiLayoutProp];
    syncJsonEditor();
    return true;
  }
  const property = target.dataset.hmiProp;
  if (!property) return true;
  const component = selectedWidget();
  if (!component) return true;
  const numeric = target.type === "number" || ["min", "max", "history_seconds"].includes(property);
  component[property] = numeric ? (target.value === "" ? "" : Number(target.value)) : target.value;
  const canvas = document.getElementById("hmi-designer-canvas");
  if (canvas) canvas.innerHTML = canvasMarkup();
  syncJsonEditor();
  if (component.type === "chart" && layoutPreviewOpen && ["tag_id", "history_seconds", "history_hours"].includes(property)) {
    void loadHmiDesignerChartData();
  }
  return true;
}

export function handleHmiDesignerAction(action, element) {
  if (!element?.closest(".hmi-designer-page")) return false;
  if (action === "hmi-add-widget") {
    if (draft.layout.length >= 50) throw new Error("حداکثر ۵۰ جزء در هر صفحه HMI قابل افزودن است.");
    const component = normalizeHmiWidgetGeometry(createHmiWidget(element.dataset.widgetType), draft.layout.length);
    draft.layout.push(component);
    selectedWidgetId = component.widget_id;
    refreshDesignerPanels();
    return true;
  }
  if (action === "hmi-select-widget") {
    selectedWidgetId = element.dataset.widgetId;
    refreshDesignerPanels();
    return true;
  }
  if (action === "hmi-open-layout-preview") {
    layoutPreviewOpen = true;
    const root = document.getElementById("hmi-layout-preview-root");
    if (root) {
      root.hidden = false;
      root.innerHTML = layoutPreviewMarkup();
    }
    void loadHmiDesignerChartData();
    if (designerChartRefreshTimer) window.clearInterval(designerChartRefreshTimer);
    designerChartRefreshTimer = window.setInterval(() => {
      if (layoutPreviewOpen && store.isConnected()) void loadHmiDesignerChartData();
    }, 5000);
    return true;
  }
  if (action === "hmi-close-layout-preview") {
    if (element.classList.contains("hmi-layout-preview-backdrop") && element.dataset.directBackdropClick !== "true") return true;
    closeHmiDesignerPreview();
    const root = document.getElementById("hmi-layout-preview-root");
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
    }
    return true;
  }
  if (action === "hmi-select-layout-widget") {
    selectedWidgetId = element.dataset.widgetId;
    const props = document.getElementById("hmi-layout-preview-properties");
    if (props) props.innerHTML = layoutPropertiesMarkup();
    for (const card of document.querySelectorAll("[data-hmi-layout-card]")) {
      card.classList.toggle("is-selected", card.dataset.widgetId === selectedWidgetId);
    }
    return true;
  }
  if (action === "hmi-reset-layout-widget") {
    const component = selectedWidget();
    if (component) {
      const index = draft.layout.indexOf(component);
      Object.assign(component, normalizeHmiWidgetGeometry({}, index));
      refreshDesignerPanels();
    }
    return true;
  }
  if (action === "hmi-remove-widget") {
    const id = element.dataset.widgetId;
    draft.layout = draft.layout.filter(item => item.widget_id !== id);
    selectedWidgetId = draft.layout[0]?.widget_id || null;
    refreshDesignerPanels();
    return true;
  }
  if (action === "hmi-move-widget") {
    const id = element.dataset.widgetId;
    const index = draft.layout.findIndex(item => item.widget_id === id);
    const target = index + Number(element.dataset.direction || 0);
    if (index >= 0 && target >= 0 && target < draft.layout.length) {
      const next = [...draft.layout];
      [next[index], next[target]] = [next[target], next[index]];
      draft.layout = next;
      selectedWidgetId = id;
      refreshDesignerPanels();
    }
    return true;
  }
  return false;
}

export function getHmiChartHistory(tagId, seconds = 3600) {
  return chartHistory.get(chartHistoryKey(tagId, seconds)) || [];
}

export function getHmiChartHistoryState(tagId, seconds = 3600) {
  return chartHistoryState(tagId, seconds);
}

async function loadChartDataForComponents(components) {
  const chartComponents = (Array.isArray(components) ? components : [])
    .filter(item => item?.type === "chart" && item.tag_id);
  const keys = [...new Map(chartComponents.map(item => {
    const seconds = chartHistorySeconds(item);
    return [chartHistoryKey(item.tag_id, seconds), { tagId: item.tag_id, seconds }];
  })).values()];
  if (!keys.length) return [];
  for (const item of keys) {
    chartHistoryStatus.set(chartHistoryKey(item.tagId, item.seconds), { status: "loading", message: "" });
  }
  window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  const results = await Promise.all(keys.map(async item => {
    const key = chartHistoryKey(item.tagId, item.seconds);
    try {
      const response = await api.telemetryHistorySeconds(item.tagId, item.seconds);
      const items = Array.isArray(response.items) ? response.items : [];
      chartHistory.set(key, items);
      chartHistoryStatus.set(key, {
        status: items.length ? "ready" : "empty",
        message: "",
        sampleCount: items.length,
        fetchedAt: new Date().toISOString(),
      });
      return { key, items, error: null };
    } catch (error) {
      chartHistory.set(key, []);
      chartHistoryStatus.set(key, {
        status: "error",
        message: error?.message || "خطا در دریافت تاریخچه",
        sampleCount: 0,
        fetchedAt: new Date().toISOString(),
      });
      return { key, items: [], error: error?.message || "خطا در دریافت تاریخچه" };
    }
  }));
  window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  return results;
}

export async function loadHmiPageChartData(pageId) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  if (!page) return [];
  return loadChartDataForComponents(page.layout);
}

export async function loadHmiDesignerChartData() {
  if (!layoutPreviewOpen || !draft || designerChartRefreshInFlight) return [];
  if (!store.isConnected()) {
    for (const component of draft.layout.filter(item => item.type === "chart" && item.tag_id)) {
      chartHistoryStatus.set(chartHistoryKey(component.tag_id, chartHistorySeconds(component)), {
        status: "error",
        message: "اتصال به Backend برقرار نیست.",
      });
    }
    window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
    return [];
  }
  designerChartRefreshInFlight = true;
  try {
    return await loadChartDataForComponents(draft.layout);
  } finally {
    designerChartRefreshInFlight = false;
  }
}

export function closeHmiDesignerPreview() {
  layoutPreviewOpen = false;
  layoutGesture = null;
  if (designerChartRefreshTimer) window.clearInterval(designerChartRefreshTimer);
  designerChartRefreshTimer = null;
}
function updateLayoutCardStyle(component) {
  const index = draft.layout.findIndex(item => item.widget_id === component.widget_id);
  const card = [...document.querySelectorAll("[data-hmi-layout-card]")].find(item => item.dataset.widgetId === component.widget_id);
  if (card) card.style.cssText = hmiWidgetGridStyle(component, index);
}

export function handleHmiDesignerPointerDown(event) {
  const handle = event.target?.closest?.("[data-hmi-layout-gesture]");
  if (!handle || !layoutPreviewOpen) return false;
  const component = draft?.layout?.find(item => item.widget_id === handle.dataset.widgetId);
  const canvas = handle.closest(".hmi-layout-preview-window")?.querySelector("#hmi-layout-preview-canvas");
  if (!component || !canvas) return false;

  selectedWidgetId = component.widget_id;
  const styles = window.getComputedStyle(canvas);
  const gapX = Number.parseFloat(styles.columnGap) || 8;
  const gapY = Number.parseFloat(styles.rowGap) || 8;
  const paddingX = (Number.parseFloat(styles.paddingLeft) || 12) + (Number.parseFloat(styles.paddingRight) || 12);
  const cellWidth = (canvas.clientWidth - paddingX - gapX * 11) / 12;
  const rowHeight = Number.parseFloat(styles.gridAutoRows) || 64;
  layoutGesture = {
    pointerId: event.pointerId,
    mode: handle.dataset.hmiLayoutGesture,
    widgetId: component.widget_id,
    startX: event.clientX,
    startY: event.clientY,
    startCol: component.grid_col,
    startRow: component.grid_row,
    startW: component.grid_w,
    startH: component.grid_h,
    columnStep: cellWidth + gapX,
    rowStep: rowHeight + gapY,
  };
  try { handle.setPointerCapture(event.pointerId); } catch { /* Older browsers may not support pointer capture. */ }
  event.preventDefault();

  const props = document.getElementById("hmi-layout-preview-properties");
  if (props) props.innerHTML = layoutPropertiesMarkup();
  for (const card of document.querySelectorAll("[data-hmi-layout-card]")) {
    card.classList.toggle("is-selected", card.dataset.widgetId === selectedWidgetId);
  }
  return true;
}

export function handleHmiDesignerPointerMove(event) {
  if (!layoutGesture || event.pointerId !== layoutGesture.pointerId) return false;
  const component = draft?.layout?.find(item => item.widget_id === layoutGesture.widgetId);
  if (!component) return false;

  const deltaCol = Math.round((event.clientX - layoutGesture.startX) / layoutGesture.columnStep);
  const deltaRow = Math.round((event.clientY - layoutGesture.startY) / layoutGesture.rowStep);
  if (layoutGesture.mode === "move") {
    component.grid_col = Math.max(1, Math.min(13 - component.grid_w, layoutGesture.startCol + deltaCol));
    component.grid_row = Math.max(1, Math.min(200, layoutGesture.startRow + deltaRow));
  } else if (layoutGesture.mode === "resize") {
    component.grid_w = Math.max(1, Math.min(13 - component.grid_col, layoutGesture.startW + deltaCol));
    component.grid_h = Math.max(1, Math.min(12, layoutGesture.startH + deltaRow));
  }
  updateLayoutCardStyle(component);
  return true;
}

export function handleHmiDesignerPointerUp(event) {
  if (!layoutGesture || (event?.pointerId !== undefined && event.pointerId !== layoutGesture.pointerId)) return false;
  layoutGesture = null;
  const component = selectedWidget();
  const props = document.getElementById("hmi-layout-preview-properties");
  if (props) props.innerHTML = layoutPropertiesMarkup();
  if (component) updateLayoutCardStyle(component);
  syncJsonEditor();
  return true;
}

