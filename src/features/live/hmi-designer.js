import { api } from "../../services/api-client.js";
import { store } from "../../services/demo-store.js";
import { escapeHtml } from "../../core/format.js";
import { HMI_BINDINGS, HMI_CHART_RANGES, HMI_WIDGET_LIBRARY, HMI_THEME_OPTIONS, HMI_COMPONENT_THEME_OPTIONS, HMI_LAYOUT_CANVAS_WIDTH, arrangeHmiWidgetsSingleColumn, createHmiWidget, hmiChartRefreshIntervalMs, hmiWidgetFreeformFromPointer, hmiWidgetFreeformStyle, hmiWidgetCanvasHeight, normalizeHmiWidgetFreeformGeometry, normalizeHmiPageTheme, normalizeHmiWidgetTheme, hmiChartLiveIntervalMs, appendHmiLiveChartSamples, getHmiLiveChartSamples, isBooleanTag, isNumericTag, renderHmiWidget } from "./hmi-widgets.js";

let activePageKey = null;
let draft = null;
let selectedWidgetId = null;
let jsonError = "";
let layoutPreviewOpen = false;
let layoutGesture = null;
const chartHistory = new Map();
const chartHistoryRequests = new Map();
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
    theme: "light",
    layout: [],
  };
  draft.theme = normalizeHmiPageTheme(draft.theme);
  if (!Array.isArray(draft.layout)) draft.layout = [];
  draft.layout = draft.layout.map((item, index) => normalizeHmiWidgetFreeformGeometry({
    ...item,
    theme: normalizeHmiWidgetTheme(item.theme),
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

function mediaPropertiesMarkup(component) {
  const widgetId = escapeHtml(component.widget_id || "");
  const accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm";
  const fileName = component.media_name
    ? '<small class="hmi-media-current-file">فایل فعلی: ' + escapeHtml(component.media_name) + '</small>'
    : '<small class="hmi-media-current-file">هنوز فایلی وارد نشده است.</small>';
  const checkbox = (key, label, fallback) =>
    '<label class="hmi-media-toggle"><input type="checkbox" data-hmi-prop="' + key + '" ' +
    (component[key] === undefined ? (fallback ? "checked" : "") : (component[key] ? "checked" : "")) +
    '><span>' + label + '</span></label>';
  return '<div class="hmi-media-properties">' +
    '<input type="file" data-hmi-media-input data-widget-id="' + widgetId + '" accept="' + accept + '" hidden>' +
    '<button type="button" class="btn btn-light btn-sm" data-action="hmi-media-choose" data-widget-id="' + widgetId + '">انتخاب / جایگزینی فایل رسانه</button>' +
    fileName +
    selectMarkup("نحوه قرارگیری فایل", "media_fit", [
      { value: "contain", label: "نمایش کامل (بدون برش)" },
      { value: "cover", label: "پرکردن کادر (با برش)" },
      { value: "fill", label: "کشیدن تا اندازه کادر" },
    ], component.media_fit || "contain") +
    checkbox("media_autoplay", "پخش خودکار ویدئو", false) +
    checkbox("media_loop", "تکرار ویدئو", true) +
    checkbox("media_muted", "بی‌صدا بودن ویدئو", true) +
    checkbox("media_controls", "نمایش کنترل‌های ویدئو", true) +
    '<small class="hmi-field-help">فرمت‌های تصویر: PNG/JPEG/GIF/WebP/SVG · ویدئو: MP4/WebM · حداکثر حجم هر فایل: ۶۴ مگابایت. GIF و WebP متحرک نیز قابل نمایش هستند.</small>' +
    '</div>';
}

function propertiesMarkup() {
  const component = selectedWidget();
  if (!component) {
    return '<section class="hmi-designer-side-panel"><div class="hmi-designer-side-heading"><b>ویژگی‌های جزء</b></div><div class="hmi-designer-empty">برای تنظیم ویژگی‌ها، یکی از اجزای محیط طراحی را انتخاب کن.</div></section>';
  }
  const definition = HMI_WIDGET_LIBRARY.find(item => item.type === component.type);
  const bindings = HMI_BINDINGS[component.type] || [];
  let fields = fieldMarkup("عنوان نمایشی", "label", component.label || "");
  fields += selectMarkup("پوسته این باکس", "theme", HMI_COMPONENT_THEME_OPTIONS, normalizeHmiWidgetTheme(component.theme));
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
    fields += '<small class="hmi-field-help">حالت ۱ ثانیه، تاریخچه را مکرراً درخواست نمی‌کند؛ نمودار از WebSocket داده زنده می‌گیرد و ۶۰ ثانیه اخیر را پیوسته نمایش می‌دهد. برای نمونه جدید در هر ثانیه، Poll خود PLC را روی ۱ s یا ارسال Edge را روی ۱ ثانیه تنظیم کن.</small>';
  }
  if (component.type === "media") fields += mediaPropertiesMarkup(component);
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
    const widget = renderHmiWidget(component, tags, { preview: true, history, historyState, mediaBase: api.base });
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
    if (content) content.innerHTML = renderHmiWidget(component, tags, { preview: true, history, historyState, mediaBase: api.base });
    card.style.cssText = hmiWidgetFreeformStyle(component, index);
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
  return '<section class="hmi-layout-properties"><div class="hmi-layout-properties-title"><b>چیدمان آزاد کارت</b><small>' +
    escapeHtml(component.label || component.type) + '</small></div>' +
    selectMarkup("پوسته این باکس", "theme", HMI_COMPONENT_THEME_OPTIONS, normalizeHmiWidgetTheme(component.theme)) +
    (component.type === "media" ? mediaPropertiesMarkup(component) : "") +
    '<div class="hmi-layout-properties-group-title">موقعیت آزاد روی بوم (پیکسل)</div><div class="hmi-layout-properties-fields">' +
    '<label class="field"><span>موقعیت افقی X</span><input type="number" inputmode="numeric" min="0" max="1200" step="1" aria-label="موقعیت افقی کارت" data-hmi-layout-prop="x" value="' + component.x + '"></label>' +
    '<label class="field"><span>موقعیت عمودی Y</span><input type="number" inputmode="numeric" min="0" max="100000" step="1" aria-label="موقعیت عمودی کارت" data-hmi-layout-prop="y" value="' + component.y + '"></label>' +
    '</div><div class="hmi-layout-properties-group-title">اندازه آزاد کارت (پیکسل)</div><div class="hmi-layout-properties-fields">' +
    '<label class="field"><span>عرض کارت</span><input type="number" inputmode="numeric" min="120" max="1200" step="1" aria-label="عرض کارت بر حسب پیکسل" data-hmi-layout-prop="width" value="' + component.width + '"></label>' +
    '<label class="field"><span>ارتفاع کارت</span><input type="number" inputmode="numeric" min="80" max="4000" step="1" aria-label="ارتفاع کارت بر حسب پیکسل" data-hmi-layout-prop="height" value="' + component.height + '"></label>' +
    '</div><p class="hmi-field-help">کارت‌ها روی بوم آزاد ۱۲۰۰ پیکسلی قرار می‌گیرند و می‌توانند روی هم قرار بگیرند. برای حرکت، هر قسمت کارت را بکش؛ برای تغییر اندازه، گوشه پایین کارت را بکش. مختصات و اندازه بدون گردشدن به خانه‌های شبکه ذخیره می‌شوند.</p>' +
    '<button type="button" class="btn btn-light btn-sm" data-action="hmi-reset-layout-widget" data-widget-id="' + escapeHtml(component.widget_id) + '">بازنشانی اندازه و جایگاه</button></section>';
}

function layoutPreviewCardMarkup(component, index) {
  const seconds = chartHistorySeconds(component);
  const history = component.type === "chart" ? getHmiChartHistory(component.tag_id, seconds) : [];
  const historyState = component.type === "chart" ? chartHistoryState(component.tag_id, seconds) : null;
  const widget = renderHmiWidget(component, store.list("tags"), { preview: true, history, historyState, mediaBase: api.base });
  return '<article class="hmi-layout-card ' + (component.widget_id === selectedWidgetId ? "is-selected" : "") +
    '" data-hmi-layout-card data-hmi-layout-gesture="move" data-action="hmi-select-layout-widget" data-widget-id="' + escapeHtml(component.widget_id) + '" style="' +
    hmiWidgetFreeformStyle(component, index) + '">' +
    '<header class="hmi-layout-card-toolbar" data-hmi-layout-gesture="move" title="برای جابه‌جایی، هر قسمت کارت را بکش"><span class="hmi-layout-move">↕ حرکت آزاد</span><span>' +
    escapeHtml(component.label || component.type) + '</span></header>' +
    '<div class="hmi-layout-card-content">' + widget + '</div>' +
    '<button type="button" class="hmi-layout-resize" data-hmi-layout-gesture="resize" data-widget-id="' +
    escapeHtml(component.widget_id) + '" title="برای تغییر اندازه، گوشه را بکش" aria-label="تغییر اندازه کارت">◢</button></article>';
}

function layoutPreviewMarkup() {
  const cards = draft.layout.map(layoutPreviewCardMarkup).join("");
  return '<div class="hmi-layout-preview-backdrop">' +
    '<section class="hmi-layout-preview-window" role="dialog" aria-modal="true" aria-label="پیش‌نمایش و چیدمان صفحه HMI">' +
    '<header class="hmi-layout-preview-header"><div><b>پیش‌نمایش شناور صفحه HMI</b><small>برای جابه‌جایی نوار بالای کارت را بکش؛ برای تنظیم اندازه از گوشه پایین یا اعداد پنل استفاده کن.</small></div>' +
    '<div class="hmi-layout-preview-header-actions"><button type="button" class="btn btn-primary btn-sm" data-action="hmi-layout-single-column">یک کارت در هر ردیف</button>' +
    '<button type="button" class="btn btn-light btn-sm" data-action="hmi-close-layout-preview">بستن پیش‌نمایش</button></div></header>' +
    '<div class="hmi-layout-preview-body"><main class="hmi-layout-preview-main"><div class="hmi-layout-stage-scroll">' +
    '<div id="hmi-layout-preview-canvas" class="hmi-layout-preview-canvas" data-hmi-page-theme="' + normalizeHmiPageTheme(draft.theme) + '" style="width:' + HMI_LAYOUT_CANVAS_WIDTH + 'px;height:' + hmiWidgetCanvasHeight(draft.layout) + 'px">' +
    (cards || '<div class="hmi-layout-preview-empty">ابتدا از کتابخانه، جزءهای موردنیاز را به صفحه اضافه کن.</div>') +
    '</div></div><p class="hmi-layout-preview-hint">بوم آزاد ۱۲۰۰ پیکسلی؛ کارت‌ها را بدون محدودیت شبکه جابه‌جا و بزرگ یا کوچک کن. این پیش‌نمایش هیچ فرمانی به PLC ارسال نمی‌کند.</p></main>' +
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
    '<label class="field"><span>پوسته صفحه HMI</span><select name="theme" data-hmi-page-field="theme">' +
    HMI_THEME_OPTIONS.map(option => '<option value="' + option.value + '" ' + (option.value === normalizeHmiPageTheme(draft.theme) ? "selected" : "") + '>' + escapeHtml(option.label) + '</option>').join("") +
    '</select></label>' +
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
    '<div id="hmi-designer-canvas" class="hmi-designer-canvas" data-hmi-page-theme="' + normalizeHmiPageTheme(draft.theme) + '">' + canvasMarkup() + '</div></section>' +
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
    Object.assign(component, normalizeHmiWidgetFreeformGeometry(component, index));
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
  draft.theme = normalizeHmiPageTheme(form.querySelector('[data-hmi-page-field="theme"]')?.value || draft.theme);
  if (!draft.name) throw new Error("نام صفحه الزامی است.");
  if (!draft.machine) throw new Error("یک ماشین برای صفحه انتخاب کن.");
  if (!store.list("machines").some(machine => machine.name === draft.machine)) {
    throw new Error("ماشین انتخاب‌شده در سامانه وجود ندارد.");
  }
  validateDraftLayout();
  const normalizedLayout = clone(draft.layout).map((component, index) => {
    const normalized = normalizeHmiWidgetFreeformGeometry({
      ...component,
      theme: normalizeHmiWidgetTheme(component.theme),
      ...(component.min !== undefined ? { min: Number(component.min) } : {}),
      ...(component.max !== undefined ? { max: Number(component.max) } : {}),
    }, index);
    delete normalized.grid_col;
    delete normalized.grid_row;
    delete normalized.grid_w;
    delete normalized.grid_h;
    if (component.type === "chart") {
      normalized.history_seconds = chartHistorySeconds(component);
      delete normalized.history_hours;
    }
    return normalized;
  });
  const payload = {
    name: draft.name,
    machine: draft.machine,
    description: draft.description,
    status: draft.status,
    theme: normalizeHmiPageTheme(draft.theme),
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
      draft.layout = parsed.map((item, index) => normalizeHmiWidgetFreeformGeometry({
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
      window.dispatchEvent(new CustomEvent("scada:hmi-chart-config-changed"));
      if (store.isConnected() && draft.layout.some(item => item.type === "chart" && item.tag_id)) {
        void loadHmiDesignerChartData();
      }
    } catch (error) {
      jsonError = error.message || "JSON نامعتبر است.";
      setJsonStatus(jsonError, "error");
    }
    return true;
  }
  const pageField = target.dataset.hmiPageField;
  if (pageField) {
    draft[pageField] = pageField === "theme" ? normalizeHmiPageTheme(target.value) : target.value;
    if (pageField === "theme") {
      const theme = normalizeHmiPageTheme(draft.theme);
      document.querySelectorAll("[data-hmi-page-theme]").forEach(node => node.setAttribute("data-hmi-page-theme", theme));
    }
    return true;
  }
  const layoutProperty = target.dataset.hmiLayoutProp;
  if (layoutProperty) {
    const component = selectedWidget();
    if (!component || target.value === "") return true;
    const limits = {
      x: [0, HMI_LAYOUT_CANVAS_WIDTH],
      y: [0, 100000],
      width: [120, HMI_LAYOUT_CANVAS_WIDTH],
      height: [80, 4000],
    }[layoutProperty];
    if (!limits) return true;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return true;
    component[layoutProperty] = Math.max(limits[0], Math.min(limits[1], Math.round(value)));
    const index = draft.layout.findIndex(item => item.widget_id === component.widget_id);
    Object.assign(component, normalizeHmiWidgetFreeformGeometry(component, index));
    const card = [...document.querySelectorAll("[data-hmi-layout-card]")].find(item => item.dataset.widgetId === component.widget_id);
    if (card) card.style.cssText = hmiWidgetFreeformStyle(component, index);
    const canvas = document.getElementById("hmi-layout-preview-canvas");
    if (canvas) canvas.style.height = hmiWidgetCanvasHeight(draft.layout) + "px";
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
  component[property] = target.type === "checkbox"
    ? target.checked
    : numeric ? (target.value === "" ? "" : Number(target.value)) : target.value;
  const canvas = document.getElementById("hmi-designer-canvas");
  if (canvas) canvas.innerHTML = canvasMarkup();
  updateLayoutCardContents();
  syncJsonEditor();
  if (component.type === "chart" && ["tag_id", "history_seconds", "history_hours"].includes(property)) {
    void loadHmiDesignerChartData();
    window.dispatchEvent(new CustomEvent("scada:hmi-chart-config-changed"));
  }
  return true;
}

export function handleHmiDesignerAction(action, element) {
  if (!element?.closest(".hmi-designer-page")) return false;
  if (action === "hmi-add-widget") {
    if (draft.layout.length >= 50) throw new Error("حداکثر ۵۰ جزء در هر صفحه HMI قابل افزودن است.");
    const component = normalizeHmiWidgetFreeformGeometry(createHmiWidget(element.dataset.widgetType), draft.layout.length);
    draft.layout.push(component);
    selectedWidgetId = component.widget_id;
    refreshDesignerPanels();
    return true;
  }
  if (action === "hmi-media-choose") {
    const component = draft.layout.find(item => item.widget_id === element.dataset.widgetId) || selectedWidget();
    if (!component || component.type !== "media") return true;
    selectedWidgetId = component.widget_id;
    const panel = element.closest(".hmi-designer-properties, .hmi-layout-properties");
    panel?.querySelector("[data-hmi-media-input]")?.click();
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
    return true;
  }
  if (action === "hmi-close-layout-preview") {
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
  if (action === "hmi-layout-single-column") {
    draft.layout = arrangeHmiWidgetsSingleColumn(draft.layout);
    selectedWidgetId = selectedWidgetId && draft.layout.some(item => item.widget_id === selectedWidgetId)
      ? selectedWidgetId
      : (draft.layout[0]?.widget_id || null);
    refreshDesignerPanels();
    return true;
  }
  if (action === "hmi-reset-layout-widget") {
    const component = selectedWidget();
    if (component) {
      const index = draft.layout.indexOf(component);
      Object.assign(component, normalizeHmiWidgetFreeformGeometry({}, index));
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
  if (Number(seconds) === 1) return getHmiLiveChartSamples(tagId);
  return chartHistory.get(chartHistoryKey(tagId, seconds)) || [];
}

export function getHmiChartHistoryState(tagId, seconds = 3600) {
  if (Number(seconds) === 1) return { status: "live", sampleCount: getHmiLiveChartSamples(tagId).length };
  return chartHistoryState(tagId, seconds);
}

async function loadChartDataForComponents(components) {
  const allCharts = (Array.isArray(components) ? components : [])
    .filter(item => item?.type === "chart" && item.tag_id);
  for (const component of allCharts.filter(item => chartHistorySeconds(item) === 1)) {
    chartHistoryStatus.set(chartHistoryKey(component.tag_id, 1), { status: "live", message: "" });
  }
  const chartComponents = allCharts.filter(item => chartHistorySeconds(item) !== 1);
  const keys = [...new Map(chartComponents.map(item => {
    const seconds = chartHistorySeconds(item);
    return [chartHistoryKey(item.tag_id, seconds), { tagId: item.tag_id, seconds }];
  })).values()];
  if (!keys.length) {
    window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
    return [];
  }

  const jobs = keys.map(item => {
    const key = chartHistoryKey(item.tagId, item.seconds);
    const pending = chartHistoryRequests.get(key);
    if (pending) return pending;

    chartHistoryStatus.set(key, { status: "loading", message: "" });
    const request = api.telemetryHistorySeconds(item.tagId, item.seconds)
      .then(response => {
        const sourceItems = Array.isArray(response?.items) ? response.items : [];
        const items = sourceItems
          .filter(sample => sample?.value !== null && sample?.value !== undefined && sample?.value !== "" &&
            Number.isFinite(Number(sample.value)))
          .map(sample => ({ ...sample, value: Number(sample.value) }));
        if (items.every(sample => sample.sampled_at && Number.isFinite(Date.parse(sample.sampled_at)))) {
          items.sort((a, b) => Date.parse(a.sampled_at) - Date.parse(b.sampled_at));
        }
        chartHistory.set(key, items);
        chartHistoryStatus.set(key, {
          status: items.length ? "ready" : "empty",
          message: "",
          sampleCount: items.length,
          fetchedAt: new Date().toISOString(),
        });
        return { key, items, error: null };
      })
      .catch(error => {
        const message = error?.message || "خطا در دریافت تاریخچه";
        chartHistory.set(key, []);
        chartHistoryStatus.set(key, {
          status: "error",
          message,
          sampleCount: 0,
          fetchedAt: new Date().toISOString(),
        });
        return { key, items: [], error: message };
      });
    chartHistoryRequests.set(key, request);
    void request.finally(() => {
      if (chartHistoryRequests.get(key) === request) chartHistoryRequests.delete(key);
    });
    return request;
  });

  window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  const results = await Promise.all(jobs);
  window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  return results;
}

export async function loadHmiPageChartData(pageId) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  if (!page) return [];
  return loadChartDataForComponents(page.layout);
}

export async function loadHmiDesignerChartData() {
  if (!draft) return [];
  if (!store.isConnected()) {
    for (const component of draft.layout.filter(item => item.type === "chart" && item.tag_id && chartHistorySeconds(item) !== 1)) {
      chartHistoryStatus.set(chartHistoryKey(component.tag_id, chartHistorySeconds(component)), {
        status: "error",
        message: "اتصال به Backend برقرار نیست.",
      });
    }
    window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
    return [];
  }
  // Per tag/range requests are deduplicated by loadChartDataForComponents.
  // This lets a newly selected chart tag load even when another chart is refreshing.
  return loadChartDataForComponents(draft.layout);
}

export function closeHmiDesignerPreview() {
  layoutPreviewOpen = false;
  layoutGesture = null;
  document.documentElement?.classList.remove("hmi-layout-dragging");
}

export function getHmiDesignerChartRefreshIntervalMs() {
  return hmiChartRefreshIntervalMs(draft?.layout || []);
}

export function getHmiPageChartRefreshIntervalMs(pageId) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  return hmiChartRefreshIntervalMs(page?.layout || []);
}

export function getHmiDesignerLiveRefreshIntervalMs() {
  return hmiChartLiveIntervalMs(draft?.layout || []);
}

export function getHmiPageLiveRefreshIntervalMs(pageId) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  return hmiChartLiveIntervalMs(page?.layout || []);
}

export function recordHmiDesignerLiveChartData(tags) {
  if (!draft) return false;
  const changed = appendHmiLiveChartSamples(draft.layout, tags);
  if (changed) window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  return changed;
}

export function recordHmiPageLiveChartData(pageId, tags) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  if (!page) return false;
  const changed = appendHmiLiveChartSamples(page.layout, tags);
  if (changed) window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  return changed;
}

function updateLayoutCardStyle(component) {
  const index = draft.layout.findIndex(item => item.widget_id === component.widget_id);
  const card = [...document.querySelectorAll("[data-hmi-layout-card]")].find(item => item.dataset.widgetId === component.widget_id);
  if (card) card.style.cssText = hmiWidgetFreeformStyle(component, index);
  const canvas = document.getElementById("hmi-layout-preview-canvas");
  if (canvas) canvas.style.height = hmiWidgetCanvasHeight(draft.layout) + "px";
}

function beginHmiLayoutGesture(handle, event) {
  if (!handle || !layoutPreviewOpen) return false;
  const component = draft?.layout?.find(item => item.widget_id === handle.dataset.widgetId);
  const canvas = handle.closest(".hmi-layout-preview-window")?.querySelector("#hmi-layout-preview-canvas");
  if (!component || !canvas) return false;

  selectedWidgetId = component.widget_id;
  layoutGesture = {
    mode: handle.dataset.hmiLayoutGesture === "resize" ? "resize" : "move",
    widgetId: component.widget_id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startGeometry: {
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
    },
  };
  if (Number.isFinite(event.pointerId)) {
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {
      // Document-level pointer and mouse listeners remain as a fallback.
    }
  }
  document.documentElement?.classList.add("hmi-layout-dragging");

  const props = document.getElementById("hmi-layout-preview-properties");
  if (props) props.innerHTML = layoutPropertiesMarkup();
  for (const card of document.querySelectorAll("[data-hmi-layout-card]")) {
    card.classList.toggle("is-selected", card.dataset.widgetId === selectedWidgetId);
  }
  return true;
}

function updateHmiLayoutGesture(event) {
  if (!layoutGesture) return false;
  const component = draft?.layout?.find(item => item.widget_id === layoutGesture.widgetId);
  if (!component) return false;

  const baseline = { ...component, ...layoutGesture.startGeometry };
  Object.assign(component, hmiWidgetFreeformFromPointer(
    baseline,
    layoutGesture.mode,
    event.clientX - layoutGesture.startX,
    event.clientY - layoutGesture.startY,
  ));
  updateLayoutCardStyle(component);
  return true;
}

function finishHmiLayoutGesture() {
  if (!layoutGesture) return false;
  layoutGesture = null;
  document.documentElement?.classList.remove("hmi-layout-dragging");
  const component = selectedWidget();
  const props = document.getElementById("hmi-layout-preview-properties");
  if (props) props.innerHTML = layoutPropertiesMarkup();
  if (component) updateLayoutCardStyle(component);
  syncJsonEditor();
  return true;
}

export function handleHmiDesignerPointerDown(event) {
  if (event?.button !== 0 || event?.isPrimary === false) return false;
  const resizeHandle = event.target?.closest?.('.hmi-layout-resize[data-hmi-layout-gesture="resize"]');
  const card = event.target?.closest?.("[data-hmi-layout-card]");
  const handle = resizeHandle || card;
  if (!handle || !beginHmiLayoutGesture(handle, event)) return false;
  // Do not cancel pointerdown: doing so can suppress the browser's compatibility
  // mouse events, which are retained below as a fallback for desktop browsers.
  return true;
}

export function handleHmiDesignerPointerMove(event) {
  if (!layoutGesture || (layoutGesture.pointerId !== undefined && event.pointerId !== layoutGesture.pointerId)) return false;
  return updateHmiLayoutGesture(event);
}

export function handleHmiDesignerPointerUp(event) {
  if (!layoutGesture) return false;
  if (event?.pointerId !== undefined && layoutGesture.pointerId !== undefined && event.pointerId !== layoutGesture.pointerId) return false;
  return finishHmiLayoutGesture();
}

export function handleHmiDesignerMouseDown(event) {
  // Pointer-capable browsers send pointerdown before mousedown. Do not restart
  // an already active pointer gesture; use mousedown only when pointerdown failed.
  if (layoutGesture) return false;
  return handleHmiDesignerPointerDown(event);
}

export function handleHmiDesignerMouseMove(event) {
  if (!layoutGesture) return false;
  // Mouse events do not carry pointerId, so deliberately bypass pointer filtering.
  return updateHmiLayoutGesture(event);
}

export function handleHmiDesignerMouseUp() {
  return finishHmiLayoutGesture();
}

export async function handleHmiDesignerMediaUpload(input) {
  const file = input?.files?.[0];
  if (!file) return null;
  const component = draft?.layout?.find(item => item.widget_id === input.dataset.widgetId) || selectedWidget();
  if (!component || component.type !== "media") throw new Error("ابتدا جزء رسانه را انتخاب کن.");
  const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "video/mp4", "video/webm"]);
  if (!allowed.has(file.type)) throw new Error("فرمت فایل پشتیبانی نمی‌شود؛ PNG/JPEG/GIF/WebP/SVG یا MP4/WebM انتخاب کن.");
  if (file.size <= 0 || file.size > 64 * 1024 * 1024) throw new Error("حجم فایل باید بیشتر از صفر و حداکثر ۶۴ مگابایت باشد.");
  const button = input.closest(".hmi-media-properties")?.querySelector('[data-action="hmi-media-choose"]');
  if (button) button.disabled = true;
  try {
    const saved = await api.uploadHmiMedia(file);
    component.media_id = saved.id;
    component.media_type = saved.media_type;
    component.media_name = saved.filename || file.name;
    component.media_content_type = saved.content_type || file.type;
    component.media_fit ||= "contain";
    component.media_loop ??= true;
    component.media_muted ??= true;
    component.media_controls ??= true;
    component.media_autoplay ??= false;
    refreshDesignerPanels();
    syncJsonEditor();
    window.dispatchEvent(new CustomEvent("scada:hmi-media-updated"));
    return saved;
  } finally {
    input.value = "";
    if (button) button.disabled = false;
  }
}
