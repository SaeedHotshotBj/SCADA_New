import { api } from "../../services/api-client.js";
import { store } from "../../services/demo-store.js";
import { escapeHtml } from "../../core/format.js";
import { HMI_BINDINGS, HMI_WIDGET_LIBRARY, createHmiWidget, isBooleanTag, isNumericTag, renderHmiWidget } from "./hmi-widgets.js";

let activePageKey = null;
let draft = null;
let selectedWidgetId = null;
let jsonError = "";
const chartHistory = new Map();

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
  draft.layout = draft.layout.map((item, index) => ({
    ...item,
    widget_id: item.widget_id || ("hmi-existing-" + index + "-" + String(item.type || "widget")),
  }));
  selectedWidgetId = draft.layout[0]?.widget_id || null;
  jsonError = "";
}

function selectedWidget() {
  return draft?.layout?.find(item => item.widget_id === selectedWidgetId) || null;
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
    fields += selectMarkup("بازه تاریخچه", "history_hours", [
      { value: 1, label: "۱ ساعت" },
      { value: 6, label: "۶ ساعت" },
      { value: 24, label: "۲۴ ساعت" },
    ], component.history_hours || 1);
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
    const history = component.type === "chart" ? getHmiChartHistory(component.tag_id, component.history_hours) : [];
    const widget = renderHmiWidget(component, tags, { preview: true, history });
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
  syncJsonEditor();
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
  initializeDraft(pageId);
  const editing = Boolean(pageId);
  return '<div class="hmi-designer-page">' +
    '<div class="page-heading"><div><h1>' + (editing ? "ویرایش صفحه HMI" : "طراحی صفحه HMI") + '</h1><p>اجزای صنعتی را انتخاب کن، ویژگی‌ها و تگ‌ها را تنظیم کن و JSON را هم‌زمان ببین.</p></div>' +
    '<div class="heading-actions"><a class="btn btn-light" href="#/live/hmi-pages">بازگشت به صفحات HMI</a><button class="btn btn-primary" type="submit" form="hmi-designer-form">ذخیره صفحه</button></div></div>' +
    '<form id="hmi-designer-form" data-page-id="' + escapeHtml(pageId || "") + '">' +
    pageSettingsMarkup() +
    '<div class="hmi-designer-workspace">' + libraryMarkup() +
    '<section class="hmi-designer-side-panel hmi-canvas-panel"><div class="hmi-designer-side-heading"><b>محیط طراحی</b><small>' +
    draft.layout.length.toLocaleString("fa-IR") + ' جزء · پیش‌نمایش بدون ارسال فرمان</small></div>' +
    '<div id="hmi-designer-canvas" class="hmi-designer-canvas">' + canvasMarkup() + '</div></section>' +
    '<div id="hmi-designer-properties">' + propertiesMarkup() + '</div>' +
    '</div>' +
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
    if (component.type === "chart" && ![1, 6, 24].includes(Number(component.history_hours || 1))) {
      throw new Error("بازه تاریخچه نمودار باید ۱، ۶ یا ۲۴ ساعت باشد.");
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
  const normalizedLayout = clone(draft.layout).map(component => ({
    ...component,
    ...(component.min !== undefined ? { min: Number(component.min) } : {}),
    ...(component.max !== undefined ? { max: Number(component.max) } : {}),
    ...(component.history_hours !== undefined ? { history_hours: Number(component.history_hours) } : {}),
  }));
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
      draft.layout = parsed.map((item, index) => ({
        ...item,
        widget_id: item.widget_id || ("hmi-json-" + index + "-" + String(item.type || "widget")),
      }));
      if (!draft.layout.some(item => item.widget_id === selectedWidgetId)) {
        selectedWidgetId = draft.layout[0]?.widget_id || null;
      }
      jsonError = "";
      setJsonStatus("JSON معتبر · پیش‌نمایش به‌روزرسانی شد", "success");
      const canvas = document.getElementById("hmi-designer-canvas");
      const properties = document.getElementById("hmi-designer-properties");
      if (canvas) canvas.innerHTML = canvasMarkup();
      if (properties) properties.innerHTML = propertiesMarkup();
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
  const property = target.dataset.hmiProp;
  if (!property) return true;
  const component = selectedWidget();
  if (!component) return true;
  const numeric = target.type === "number" || ["min", "max", "history_hours"].includes(property);
  component[property] = numeric ? (target.value === "" ? "" : Number(target.value)) : target.value;
  const canvas = document.getElementById("hmi-designer-canvas");
  if (canvas) canvas.innerHTML = canvasMarkup();
  syncJsonEditor();
  return true;
}

export function handleHmiDesignerAction(action, element) {
  if (!element?.closest(".hmi-designer-page")) return false;
  if (action === "hmi-add-widget") {
    if (draft.layout.length >= 50) throw new Error("حداکثر ۵۰ جزء در هر صفحه HMI قابل افزودن است.");
    const component = createHmiWidget(element.dataset.widgetType);
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

export function getHmiChartHistory(tagId, hours = 1) {
  return chartHistory.get(String(tagId) + ":" + String(hours)) || [];
}

export async function loadHmiPageChartData(pageId) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  if (!page) return [];
  const chartComponents = (Array.isArray(page.layout) ? page.layout : []).filter(item => item.type === "chart" && item.tag_id);
  const keys = [...new Map(chartComponents.map(item => [
    String(item.tag_id) + ":" + String(item.history_hours || 1),
    { tagId: item.tag_id, hours: Number(item.history_hours || 1) },
  ])).values()];
  const results = await Promise.all(keys.map(async item => {
    try {
      const response = await api.telemetryHistory(item.tagId, item.hours);
      return [String(item.tagId) + ":" + String(item.hours), response.items || []];
    } catch {
      return [String(item.tagId) + ":" + String(item.hours), []];
    }
  }));
  for (const [key, items] of results) chartHistory.set(key, items);
  window.dispatchEvent(new CustomEvent("scada:hmi-chart-updated"));
  return results;
}
