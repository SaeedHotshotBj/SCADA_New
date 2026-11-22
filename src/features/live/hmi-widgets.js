import { escapeHtml } from "../../core/format.js";

let widgetSequence = 0;
let tankRenderSequence = 0;
const liveChartSamples = new Map();
const LIVE_CHART_WINDOW_MS = 60000;
const LIVE_CHART_MAX_SAMPLES = 90;

export const HMI_WIDGET_LIBRARY = [
  { type: "value", label: "باکس عددی", category: "نمایش مقادیر", icon: "123", help: "نمایش مقدار جاری همراه واحد و کیفیت" },
  { type: "indicator", label: "چراغ وضعیت", category: "نمایش مقادیر", icon: "●", help: "چراغ روشن/خاموش بر اساس تگ" },
  { type: "status", label: "وضعیت متنی", category: "نمایش مقادیر", icon: "RUN", help: "نمایش وضعیت یا مقدار بولی" },
  { type: "gauge", label: "گیج نیم‌دایره", category: "ابزار اندازه‌گیری", icon: "◔", help: "نمایش مقدار روی مقیاس حداقل و حداکثر" },
  { type: "needle", label: "عقربه‌ای", category: "ابزار اندازه‌گیری", icon: "◴", help: "ابزار عقربه‌ای با محدوده قابل تنظیم" },
  { type: "thermometer", label: "دماسنج", category: "ابزار اندازه‌گیری", icon: "♨", help: "نمایش ستونی مقدار دما یا متغیر عددی" },
  { type: "chart", label: "نمودار روند", category: "نمودارها", icon: "▥", help: "نمایش تاریخچه ثبت‌شده یک تگ" },
  { type: "motor", label: "موتور", category: "تجهیزات صنعتی", icon: "⚙", help: "نمایش RUN/STOP/FAULT و سرعت اختیاری" },
  { type: "pump", label: "پمپ", category: "تجهیزات صنعتی", icon: "◉", help: "نمایش وضعیت کارکرد پمپ" },
  { type: "fan", label: "فن", category: "تجهیزات صنعتی", icon: "✥", help: "نمایش چرخش فن و سرعت اختیاری" },
  { type: "conveyor", label: "نوار نقاله", category: "تجهیزات صنعتی", icon: "⇢", help: "نمایش حرکت نوار و وضعیت خطا" },
  { type: "tank", label: "مخزن", category: "تجهیزات فرآیندی", icon: "▤", help: "نمایش سطح مخزن بر اساس تگ عددی" },
  { type: "valve", label: "شیر", category: "تجهیزات فرآیندی", icon: "◇", help: "نمایش وضعیت باز/بسته و خطا" },
  { type: "write", label: "کنترل تگ", category: "کنترل", icon: "↕", help: "کنترل تعاملی؛ نوشتن واقعی تابع تمام قفل‌های ایمنی است" },
  { type: "media", label: "رسانه و تصویر", category: "رسانه", icon: "▧", help: "واردکردن تصویر، SVG، انیمیشن GIF/WebP یا ویدئوی MP4/WebM" },
];

export const HMI_THEME_OPTIONS = [
  { value: "light", label: "روشن" },
  { value: "dark", label: "تیره" },
  { value: "blue", label: "آبی صنعتی" },
  { value: "industrial", label: "صنعتی تیره" },
];

export const HMI_COMPONENT_THEME_OPTIONS = [
  { value: "inherit", label: "پیروی از تم صفحه" },
  ...HMI_THEME_OPTIONS,
];

const HMI_PAGE_THEME_VALUES = new Set(HMI_THEME_OPTIONS.map(item => item.value));
const HMI_COMPONENT_THEME_VALUES = new Set(HMI_COMPONENT_THEME_OPTIONS.map(item => item.value));

export function normalizeHmiPageTheme(theme) {
  return HMI_PAGE_THEME_VALUES.has(theme) ? theme : "light";
}

export function normalizeHmiWidgetTheme(theme) {
  return HMI_COMPONENT_THEME_VALUES.has(theme) ? theme : "inherit";
}

export const HMI_CHART_LINE_WIDTH_MIN = 0.5;
export const HMI_CHART_LINE_WIDTH_MAX = 10;
export const HMI_CHART_LINE_WIDTH_DEFAULT = 2.5;

export function normalizeHmiChartLineWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return HMI_CHART_LINE_WIDTH_DEFAULT;
  return Math.round(Math.max(HMI_CHART_LINE_WIDTH_MIN,
    Math.min(HMI_CHART_LINE_WIDTH_MAX, number)) * 2) / 2;
}

export const HMI_CHART_RANGES = [
  { value: 1, label: "لایو · هر ۱ ثانیه (۶۰ ثانیه اخیر)" },
  { value: 5, label: "۵ ثانیه" },
  { value: 10, label: "۱۰ ثانیه" },
  { value: 30, label: "۳۰ ثانیه" },
  { value: 60, label: "۱ دقیقه" },
  { value: 300, label: "۵ دقیقه" },
  { value: 600, label: "۱۰ دقیقه" },
  { value: 900, label: "۱۵ دقیقه" },
  { value: 1800, label: "۳۰ دقیقه" },
  { value: 3600, label: "۱ ساعت" },
  { value: 21600, label: "۶ ساعت" },
  { value: 43200, label: "۱۲ ساعت" },
  { value: 86400, label: "۲۴ ساعت" },
];

export const HMI_BINDINGS = {
  value: [{ key: "tag_id", label: "تگ مقدار", required: true, kind: "any" }],
  status: [{ key: "tag_id", label: "تگ وضعیت", required: true, kind: "any" }],
  indicator: [{ key: "tag_id", label: "تگ وضعیت", required: true, kind: "boolean" }],
  gauge: [{ key: "tag_id", label: "تگ مقدار", required: true, kind: "numeric" }],
  needle: [{ key: "tag_id", label: "تگ مقدار", required: true, kind: "numeric" }],
  thermometer: [{ key: "tag_id", label: "تگ مقدار", required: true, kind: "numeric" }],
  chart: [{ key: "tag_id", label: "تگ روند", required: true, kind: "numeric" }],
  media: [],
  write: [{ key: "tag_id", label: "تگ قابل کنترل", required: true, kind: "any" }],
  motor: [
    { key: "run_tag_id", label: "تگ RUN", required: true, kind: "boolean" },
    { key: "fault_tag_id", label: "تگ خطا (اختیاری)", required: false, kind: "boolean" },
    { key: "speed_tag_id", label: "تگ سرعت (اختیاری)", required: false, kind: "numeric" },
  ],
  pump: [
    { key: "run_tag_id", label: "تگ RUN", required: true, kind: "boolean" },
    { key: "fault_tag_id", label: "تگ خطا (اختیاری)", required: false, kind: "boolean" },
    { key: "speed_tag_id", label: "تگ سرعت (اختیاری)", required: false, kind: "numeric" },
  ],
  fan: [
    { key: "run_tag_id", label: "تگ RUN", required: true, kind: "boolean" },
    { key: "fault_tag_id", label: "تگ خطا (اختیاری)", required: false, kind: "boolean" },
    { key: "speed_tag_id", label: "تگ سرعت (اختیاری)", required: false, kind: "numeric" },
  ],
  conveyor: [
    { key: "run_tag_id", label: "تگ حرکت", required: true, kind: "boolean" },
    { key: "fault_tag_id", label: "تگ خطا (اختیاری)", required: false, kind: "boolean" },
  ],
  tank: [{ key: "level_tag_id", label: "تگ سطح", required: true, kind: "numeric" }],
  valve: [
    { key: "open_tag_id", label: "تگ باز بودن شیر", required: true, kind: "boolean" },
    { key: "fault_tag_id", label: "تگ خطا (اختیاری)", required: false, kind: "boolean" },
  ],
};

const BOOLEAN_TYPES = new Set(["bool"]);
const NUMERIC_TYPES = new Set(["int16", "uint16", "int32", "uint32", "float32"]);
const DEFAULT_LABELS = {
  value: "مقدار",
  status: "وضعیت",
  indicator: "چراغ وضعیت",
  gauge: "گیج",
  needle: "ابزار عقربه‌ای",
  thermometer: "دماسنج",
  chart: "روند",
  motor: "موتور",
  pump: "پمپ",
  fan: "فن",
  conveyor: "نوار نقاله",
  tank: "مخزن",
  valve: "شیر",
  write: "کنترل تگ",
  media: "رسانه",
};

export function createHmiWidget(type) {
  const definition = HMI_WIDGET_LIBRARY.find(item => item.type === type);
  if (!definition) throw new Error("نوع جزء انتخاب‌شده در کتابخانه وجود ندارد.");
  widgetSequence += 1;
  const widget = {
    widget_id: "hmi-widget-" + Date.now().toString(36) + "-" + widgetSequence,
    type,
    label: DEFAULT_LABELS[type] || definition.label,
    theme: "inherit",
  };
  if (["gauge", "needle", "thermometer", "tank"].includes(type)) {
    widget.min = 0;
    widget.max = 100;
  }
  if (type === "chart") {
    widget.chart_kind = "line";
    widget.history_seconds = 3600;
    widget.line_width = HMI_CHART_LINE_WIDTH_DEFAULT;
  }
  if (type === "media") {
    widget.media_fit = "contain";
    widget.media_loop = true;
    widget.media_muted = true;
    widget.media_controls = true;
    widget.media_autoplay = false;
  }
  return widget;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normalizeHmiWidgetGeometry(component, index = 0) {
  const grid_w = boundedInteger(component?.grid_w, 4, 1, 12);
  const grid_h = boundedInteger(component?.grid_h, 3, 1, 12);
  const defaultColumn = (index % 3) * 4 + 1;
  const defaultRow = Math.floor(index / 3) * 3 + 1;
  const grid_col = boundedInteger(component?.grid_col, defaultColumn, 1, 13 - grid_w);
  const grid_row = boundedInteger(component?.grid_row, defaultRow, 1, 1000);
  return { ...component, grid_col, grid_row, grid_w, grid_h };
}

export const HMI_LAYOUT_CANVAS_WIDTH = 1200;
export const HMI_LAYOUT_MIN_CANVAS_HEIGHT = 800;
export const HMI_LAYOUT_MIN_CARD_WIDTH = 120;
export const HMI_LAYOUT_MIN_CARD_HEIGHT = 80;

function boundedPixel(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

// Freeform layout uses a fixed logical design surface. Old grid layouts are
// migrated once to pixel coordinates so existing HMI pages remain visible.
export function normalizeHmiWidgetFreeformGeometry(component, index = 0) {
  const source = component && typeof component === "object" ? component : {};
  const hasFreeform = ["x", "y", "width", "height"].every(key =>
    source[key] !== undefined && source[key] !== null && source[key] !== "" && Number.isFinite(Number(source[key]))
  );
  let width;
  let height;
  let x;
  let y;
  if (hasFreeform) {
    width = boundedPixel(source.width, 360, HMI_LAYOUT_MIN_CARD_WIDTH, HMI_LAYOUT_CANVAS_WIDTH);
    height = boundedPixel(source.height, 220, HMI_LAYOUT_MIN_CARD_HEIGHT, 4000);
    x = boundedPixel(source.x, 0, 0, HMI_LAYOUT_CANVAS_WIDTH - width);
    y = boundedPixel(source.y, 0, 0, 100000);
  } else if (source.grid_col !== undefined || source.grid_row !== undefined ||
             source.grid_w !== undefined || source.grid_h !== undefined) {
    const gridCol = boundedInteger(source.grid_col, 1, 1, 12);
    const gridRow = boundedInteger(source.grid_row, 1, 1, 1000);
    const gridWidth = boundedInteger(source.grid_w, 4, 1, 12);
    const gridHeight = boundedInteger(source.grid_h, 3, 1, 12);
    width = boundedPixel(gridWidth * 98 - 8, 360, HMI_LAYOUT_MIN_CARD_WIDTH, HMI_LAYOUT_CANVAS_WIDTH);
    height = boundedPixel(gridHeight * 72 - 8, 220, HMI_LAYOUT_MIN_CARD_HEIGHT, 4000);
    x = boundedPixel(12 + (gridCol - 1) * 98, 24, 0, HMI_LAYOUT_CANVAS_WIDTH - width);
    y = boundedPixel(12 + (gridRow - 1) * 72, 24, 0, 100000);
  } else {
    const column = index % 3;
    const row = Math.floor(index / 3);
    width = 360;
    height = 220;
    x = 24 + column * 390;
    y = 24 + row * 250;
  }
  x = boundedPixel(x, 0, 0, HMI_LAYOUT_CANVAS_WIDTH - width);
  y = boundedPixel(y, 0, 0, 100000);
  return { ...source, x, y, width, height };
}

export function hmiWidgetFreeformStyle(component, index = 0) {
  const geometry = normalizeHmiWidgetFreeformGeometry(component, index);
  return "position:absolute;left:" + geometry.x + "px;top:" + geometry.y +
    "px;width:" + geometry.width + "px;height:" + geometry.height + "px;";
}

export function hmiWidgetCanvasHeight(components) {
  const bottom = (Array.isArray(components) ? components : []).reduce((max, item, index) => {
    const geometry = normalizeHmiWidgetFreeformGeometry(item, index);
    return Math.max(max, geometry.y + geometry.height + 24);
  }, HMI_LAYOUT_MIN_CANVAS_HEIGHT);
  return Math.min(100000, Math.max(HMI_LAYOUT_MIN_CANVAS_HEIGHT, bottom));
}

export function applyHmiWidgetFreeformGesture(component, mode, deltaX = 0, deltaY = 0) {
  const next = normalizeHmiWidgetFreeformGeometry(component);
  const dx = Number.isFinite(Number(deltaX)) ? Math.round(Number(deltaX)) : 0;
  const dy = Number.isFinite(Number(deltaY)) ? Math.round(Number(deltaY)) : 0;
  if (mode === "move") {
    next.x = Math.max(0, Math.min(HMI_LAYOUT_CANVAS_WIDTH - next.width, next.x + dx));
    next.y = Math.max(0, Math.min(100000, next.y + dy));
  } else if (mode === "resize") {
    next.width = Math.max(HMI_LAYOUT_MIN_CARD_WIDTH, Math.min(HMI_LAYOUT_CANVAS_WIDTH - next.x, next.width + dx));
    next.height = Math.max(HMI_LAYOUT_MIN_CARD_HEIGHT, Math.min(4000, next.height + dy));
  }
  return normalizeHmiWidgetFreeformGeometry(next);
}

export function hmiWidgetFreeformFromPointer(component, mode, deltaX, deltaY) {
  return applyHmiWidgetFreeformGesture(component, mode, deltaX, deltaY);
}

export function hmiWidgetGridStyle(component, index = 0) {
  const geometry = normalizeHmiWidgetGeometry(component, index);
  return "grid-column:" + geometry.grid_col + " / span " + geometry.grid_w +
    ";grid-row:" + geometry.grid_row + " / span " + geometry.grid_h + ";";
}

export function applyHmiWidgetGridGesture(component, mode, deltaColumn = 0, deltaRow = 0) {
  const next = normalizeHmiWidgetGeometry(component);
  const columns = Number.isFinite(Number(deltaColumn)) ? Math.trunc(Number(deltaColumn)) : 0;
  const rows = Number.isFinite(Number(deltaRow)) ? Math.trunc(Number(deltaRow)) : 0;
  if (mode === "move") {
    next.grid_col = Math.max(1, Math.min(13 - next.grid_w, next.grid_col + columns));
    next.grid_row = Math.max(1, Math.min(1000, next.grid_row + rows));
  } else if (mode === "resize") {
    next.grid_w = Math.max(1, Math.min(13 - next.grid_col, next.grid_w + columns));
    next.grid_h = Math.max(1, Math.min(12, next.grid_h + rows));
  }
  return normalizeHmiWidgetGeometry(next);
}

export function arrangeHmiWidgetsSingleColumn(components) {
  let nextY = 24;
  return (Array.isArray(components) ? components : []).map((component, index) => {
    const normalized = normalizeHmiWidgetFreeformGeometry(component, index);
    const placed = normalizeHmiWidgetFreeformGeometry({
      ...normalized,
      x: 24,
      y: nextY,
      width: HMI_LAYOUT_CANVAS_WIDTH - 48,
    }, index);
    nextY += placed.height + 24;
    return placed;
  });
}

export function hmiWidgetGridFromPointer(component, mode, deltaX, deltaY, columnStep, rowStep) {
  const safeColumnStep = Number(columnStep);
  const safeRowStep = Number(rowStep);
  if (!(safeColumnStep > 0) || !(safeRowStep > 0)) return normalizeHmiWidgetGeometry(component);
  const deltaColumn = Math.round(Number(deltaX || 0) / safeColumnStep);
  const deltaRow = Math.round(Number(deltaY || 0) / safeRowStep);
  return applyHmiWidgetGridGesture(component, mode, deltaColumn, deltaRow);
}

export function hmiChartRefreshIntervalMs(components) {
  // Persisted history refreshes slowly; one-second charts use WebSocket data.
  const hasHistoryCharts = (Array.isArray(components) ? components : [])
    .some(item => item?.type === "chart" &&
      Number(item.history_seconds ?? Number(item.history_hours || 1) * 3600) > 1);
  return hasHistoryCharts ? 5000 : 5000;
}

export function hmiChartLiveIntervalMs(components) {
  return (Array.isArray(components) ? components : []).some(item =>
    item?.type === "chart" &&
    Number(item.history_seconds ?? Number(item.history_hours || 1) * 3600) === 1
  ) ? 1000 : 5000;
}

export function appendHmiLiveChartSamples(components, tags) {
  const tagMap = new Map((Array.isArray(tags) ? tags : []).map(tag => [tag.id || tag.tag_id, tag]));
  let changed = false;
  for (const component of Array.isArray(components) ? components : []) {
    if (component?.type !== "chart" ||
        Number(component.history_seconds ?? Number(component.history_hours || 1) * 3600) !== 1 ||
        !component.tag_id) continue;
    const tag = tagMap.get(component.tag_id);
    if (!tag || !["GOOD", "DEMO"].includes(tag.quality)) continue;
    const value = Number(tag.value);
    const sampledAt = tag.sampled_at || tag.updated_at;
    const time = sampledAt ? Date.parse(sampledAt) : NaN;
    if (!Number.isFinite(value) || !Number.isFinite(time)) continue;
    const samples = liveChartSamples.get(component.tag_id) || [];
    const last = samples[samples.length - 1];
    if (last && last.sampled_at === sampledAt) {
      if (last.value !== value) {
        samples[samples.length - 1] = { value, sampled_at: sampledAt, quality: tag.quality };
        liveChartSamples.set(component.tag_id, samples);
        changed = true;
      }
      continue;
    }
    if (last && time < Date.parse(last.sampled_at)) continue;
    samples.push({ value, sampled_at: sampledAt, quality: tag.quality });
    const cutoff = time - LIVE_CHART_WINDOW_MS;
    liveChartSamples.set(component.tag_id,
      samples.filter(sample => Date.parse(sample.sampled_at) >= cutoff).slice(-LIVE_CHART_MAX_SAMPLES));
    changed = true;
  }
  return changed;
}

export function getHmiLiveChartSamples(tagId) {
  return [...(liveChartSamples.get(tagId) || [])];
}

export function isBooleanTag(tag) {
  return Boolean(tag && BOOLEAN_TYPES.has(tag.type));
}

export function isNumericTag(tag) {
  return Boolean(tag && NUMERIC_TYPES.has(tag.type));
}

export function isTagValueOn(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "on", "run", "running", "active", "بله", "روشن", "فعال"].includes(normalized);
}

function isTagValueOff(value) {
  if (value === false || value === 0) return true;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["0", "false", "off", "stop", "stopped", "inactive", "خیر", "خاموش", "متوقف"].includes(normalized);
}

function numberOf(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function tagFor(tags, id) {
  return (tags || []).find(tag => tag.id === id) || null;
}

function qualityOf(tag) {
  if (!tag || tag.quality === "UNSAMPLED" || tag.value === undefined || tag.value === null) return "UNSAMPLED";
  return tag.quality || "UNSAMPLED";
}

function qualityTone(quality) {
  if (quality === "GOOD") return "good";
  if (quality === "DEMO") return "demo";
  if (quality === "BAD") return "bad";
  return "unknown";
}

function valueText(tag, preview) {
  if (!tag) return preview ? "انتخاب تگ" : "—";
  if (qualityOf(tag) === "UNSAMPLED") return "—";
  if (typeof tag.value === "number") return tag.value.toLocaleString("fa-IR", { maximumFractionDigits: 3 });
  return String(tag.value);
}

function componentFrame(component, body, quality, preview, extraClass = "") {
  const label = escapeHtml(component.label || DEFAULT_LABELS[component.type] || component.type);
  const tone = qualityTone(quality);
  const selectedClass = extraClass ? " " + extraClass : "";
  const theme = normalizeHmiWidgetTheme(component.theme);
  return '<article class="hmi-widget hmi-widget--' + escapeHtml(component.type) + (preview ? " is-preview" : "") + selectedClass + '" data-hmi-theme="' + theme + '">' +
    '<header class="hmi-widget-header"><b>' + label + '</b><span class="hmi-quality hmi-quality--' + tone + '">' + escapeHtml(quality) + '</span></header>' +
    '<div class="hmi-widget-body">' + body + '</div></article>';
}

function renderValue(component, tag, preview) {
  const quality = qualityOf(tag);
  const value = valueText(tag, preview);
  const body = '<div class="hmi-value-number">' + escapeHtml(value) + '</div>' +
    '<div class="hmi-value-meta"><span>' + escapeHtml(tag?.unit || "") + '</span><small>' + escapeHtml(tag?.name || "تگی انتخاب نشده") + '</small></div>';
  return componentFrame(component, body, quality, preview);
}

function renderStatus(component, tag, preview) {
  const quality = qualityOf(tag);
  const on = tag ? isTagValueOn(tag.value) : false;
  const off = tag ? isTagValueOff(tag.value) : false;
  const state = quality === "UNSAMPLED" ? "بدون نمونه" : on ? "RUN / ON" : off ? "STOP / OFF" : String(tag.value);
  const tone = quality === "BAD" ? "fault" : on ? "running" : off ? "stopped" : "unknown";
  const body = '<div class="hmi-status-display hmi-status-display--' + tone + '"><i></i><strong>' + escapeHtml(state) + '</strong></div>' +
    '<small class="hmi-widget-subtitle">' + escapeHtml(tag?.name || "تگ وضعیت انتخاب نشده") + '</small>';
  return componentFrame(component, body, quality, preview);
}

function renderIndicator(component, tag, preview) {
  const quality = qualityOf(tag);
  const on = tag ? isTagValueOn(tag.value) : false;
  const tone = quality === "BAD" ? "fault" : on ? "running" : "stopped";
  const text = quality === "UNSAMPLED" ? "بدون نمونه" : on ? "روشن" : "خاموش";
  const body = '<div class="hmi-indicator-light hmi-indicator-light--' + tone + '"><i></i><b>' + escapeHtml(text) + '</b></div>' +
    '<small class="hmi-widget-subtitle">' + escapeHtml(tag?.name || "تگ انتخاب نشده") + '</small>';
  return componentFrame(component, body, quality, preview);
}

function rangePercent(value, min, max) {
  const low = numberOf(min, 0);
  const high = numberOf(max, 100);
  if (high <= low) return 0;
  return Math.max(0, Math.min(100, (numberOf(value, low) - low) * 100 / (high - low)));
}

function renderGauge(component, tag, preview, needleMode) {
  const quality = qualityOf(tag);
  const min = numberOf(component.min, 0);
  const max = numberOf(component.max, 100);
  const value = numberOf(tag?.value, min);
  const percent = rangePercent(value, min, max);
  const angle = -90 + percent * 1.8;
  const display = tag && quality !== "UNSAMPLED" ? value.toLocaleString("fa-IR", { maximumFractionDigits: 2 }) : preview ? "—" : "—";
  let visual;
  if (needleMode) {
    visual = '<svg class="hmi-dial-svg" viewBox="0 0 180 112" role="img" aria-label="ابزار عقربه‌ای">' +
      '<path d="M 18 88 A 72 72 0 0 1 162 88" fill="none" stroke="#dce6ed" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M 18 88 A 72 72 0 0 1 162 88" fill="none" stroke="#1fae8b" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="' + percent + ' 100"/>' +
      '<g transform="rotate(' + angle + ' 90 88)"><line x1="90" y1="88" x2="90" y2="28" stroke="#244f70" stroke-width="3.5" stroke-linecap="round"/><circle cx="90" cy="88" r="6" fill="#244f70"/></g>' +
      '<text x="18" y="107">' + escapeHtml(String(min)) + '</text><text x="162" y="107" text-anchor="end">' + escapeHtml(String(max)) + '</text></svg>';
  } else {
    visual = '<svg class="hmi-gauge-svg" viewBox="0 0 180 112" role="img" aria-label="گیج">' +
      '<path d="M 18 88 A 72 72 0 0 1 162 88" fill="none" stroke="#e6edf2" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="M 18 88 A 72 72 0 0 1 162 88" fill="none" stroke="#18a981" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="' + percent + ' 100"/>' +
      '<text x="90" y="73" text-anchor="middle" class="hmi-gauge-number">' + escapeHtml(display) + '</text>' +
      '<text x="18" y="107">' + escapeHtml(String(min)) + '</text><text x="162" y="107" text-anchor="end">' + escapeHtml(String(max)) + '</text></svg>';
  }
  const numericReading = needleMode
    ? '<div class="hmi-dial-reading"><strong>' + escapeHtml(display) + '</strong></div>'
    : "";
  const body = '<div class="hmi-gauge-visual">' + visual + '</div>' + numericReading +
    '<div class="hmi-value-meta"><span>' + escapeHtml(tag?.unit || "") + '</span><small>' + escapeHtml(tag?.name || "تگ انتخاب نشده") + '</small></div>';
  return componentFrame(component, body, quality, preview);
}

function renderThermometer(component, tag, preview) {
  const quality = qualityOf(tag);
  const min = numberOf(component.min, 0);
  const max = numberOf(component.max, 100);
  const value = numberOf(tag?.value, min);
  const percent = rangePercent(value, min, max);
  const body = '<div class="hmi-thermometer-layout"><div class="hmi-thermometer"><i style="height:' + percent + '%"></i></div>' +
    '<div class="hmi-thermometer-reading"><strong>' + escapeHtml(valueText(tag, preview)) + '</strong><span>' + escapeHtml(tag?.unit || "") + '</span>' +
    '<small>' + escapeHtml(String(min)) + ' تا ' + escapeHtml(String(max)) + '</small></div></div>';
  return componentFrame(component, body, quality, preview);
}

function renderChart(component, tag, preview, history, historyState) {
  const quality = qualityOf(tag);
  const sampleItems = (Array.isArray(history) ? history : [])
    .map(item => typeof item === "number" ? { value: item } : item)
    .filter(item => item?.value !== null && item?.value !== undefined && item?.value !== "" &&
      Number.isFinite(Number(item.value)))
    .map(item => ({
      ...item,
      value: Number(item.value),
      time: item?.sampled_at ? Date.parse(item.sampled_at) : NaN,
    }));
  const hasTimeAxis = sampleItems.length > 0 &&
    sampleItems.every(item => Number.isFinite(item.time));
  if (hasTimeAxis) sampleItems.sort((a, b) => a.time - b.time);

  const samples = sampleItems.map(item => item.value);
  const rangeSeconds = Number(component.history_seconds ?? Number(component.history_hours || 1) * 3600);
  const isLive = rangeSeconds === 1;
  const displayWindowSeconds = isLive ? 60 : Math.max(1, rangeSeconds);
  const rangeLabel = HMI_CHART_RANGES.find(item => item.value === rangeSeconds)?.label || "بازه انتخاب‌شده";
  const lineWidth = normalizeHmiChartLineWidth(component.line_width);
  const latestSample = sampleItems.length ? sampleItems[sampleItems.length - 1].value : null;
  const latestTagValue = tag && quality !== "UNSAMPLED" && Number.isFinite(Number(tag.value))
    ? Number(tag.value) : null;
  const displayedValue = latestSample !== null ? latestSample : latestTagValue;
  const displayValue = displayedValue === null
    ? "—"
    : displayedValue.toLocaleString("fa-IR", { maximumFractionDigits: 3 });
  const valueLabel = latestSample !== null ? "آخرین مقدار نمودار" : latestTagValue !== null ? "آخرین مقدار زنده" : "مقدار";
  const valueBox = '<div class="hmi-chart-value-box hmi-chart-latest">' +
    '<span>' + valueLabel + '</span><strong>' + escapeHtml(displayValue) + '</strong>' +
    '<small>' + escapeHtml(tag?.unit || "") + '</small></div>';

  let visual = "";
  if (samples.length) {
    const rawMin = Math.min(...samples);
    const rawMax = Math.max(...samples);
    const rawSpan = rawMax - rawMin;
    const safeSpan = rawSpan || Math.max(Math.abs(rawMax) * 0.1, 1);
    const roughStep = safeSpan / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalizedStep = roughStep / magnitude;
    const stepFactor = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
    const step = stepFactor * magnitude;
    let axisMin = Math.floor(rawMin / step) * step;
    let axisMax = Math.ceil(rawMax / step) * step;
    if (axisMax <= axisMin) {
      axisMin -= step;
      axisMax += step;
    }
    const yTicks = [];
    for (let value = axisMin; value <= axisMax + step * 0.000001 && yTicks.length < 7; value += step) {
      yTicks.push(Number(value.toPrecision(12)));
    }

    const left = 54;
    const right = 350;
    const top = 14;
    const bottom = 152;
    const plotWidth = right - left;
    const plotHeight = bottom - top;
    let timeStart = hasTimeAxis ? sampleItems[0].time : NaN;
    let timeEnd = hasTimeAxis ? sampleItems[sampleItems.length - 1].time : NaN;
    if (hasTimeAxis && timeEnd === timeStart) {
      const halfWindow = displayWindowSeconds * 500;
      timeStart -= halfWindow;
      timeEnd += halfWindow;
    }
    const xFor = (item, index) => {
      if (hasTimeAxis && timeEnd > timeStart) {
        return left + ((item.time - timeStart) / (timeEnd - timeStart)) * plotWidth;
      }
      return samples.length > 1
        ? left + (index / (samples.length - 1)) * plotWidth
        : left + plotWidth / 2;
    };
    const yFor = value => bottom - ((value - axisMin) / (axisMax - axisMin)) * plotHeight;
    const formatAxisValue = value => Number(value.toFixed(6)).toLocaleString("fa-IR", {
      maximumFractionDigits: 4,
    });
    const formatAxisTime = time => {
      if (!Number.isFinite(time)) return "—";
      const date = new Date(time);
      const options = displayWindowSeconds >= 86400
        ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
        : {
            hour: "2-digit",
            minute: "2-digit",
            ...(displayWindowSeconds <= 60 ? { second: "2-digit" } : {}),
          };
      return date.toLocaleString("fa-IR", options);
    };

    const yAxisMarkup = yTicks.map(value => {
      const y = yFor(value);
      return '<path d="M' + left + ' ' + y.toFixed(2) + ' H' + right +
        '" class="hmi-chart-grid-line"/><text class="hmi-chart-y-tick" x="' + (left - 7) +
        '" y="' + (y + 3).toFixed(2) + '" text-anchor="end">' + escapeHtml(formatAxisValue(value)) + '</text>';
    }).join("");

    const xTickRatios = [0, 0.5, 1];
    const xAxisMarkup = xTickRatios.map((ratio, index) => {
      const x = left + ratio * plotWidth;
      const time = hasTimeAxis ? timeStart + ratio * (timeEnd - timeStart) : NaN;
      const sampleIndex = Math.round(ratio * (sampleItems.length - 1));
      const fallbackTime = !hasTimeAxis && Number.isFinite(sampleItems[sampleIndex]?.time)
        ? sampleItems[sampleIndex].time : NaN;
      const label = formatAxisTime(hasTimeAxis ? time : fallbackTime);
      const anchor = index === 0 ? "start" : index === 2 ? "end" : "middle";
      return '<path d="M' + x.toFixed(2) + ' ' + bottom + ' v4" class="hmi-chart-axis-tick"/>' +
        '<text class="hmi-chart-x-tick" x="' + x.toFixed(2) + '" y="170" text-anchor="' + anchor +
        '">' + escapeHtml(label) + '</text>';
    }).join("");

    let dataMarkup = "";
    if (component.chart_kind === "bar") {
      const barWidth = Math.max(2, Math.min(24, plotWidth / Math.max(samples.length, 1) * 0.58));
      dataMarkup = sampleItems.map((item, index) => {
        const x = xFor(item, index);
        const y = yFor(item.value);
        const height = Math.max(1, bottom - y);
        return '<rect class="hmi-chart-bar" x="' + (x - barWidth / 2).toFixed(2) +
          '" y="' + y.toFixed(2) + '" width="' + barWidth.toFixed(2) +
          '" height="' + height.toFixed(2) + '" rx="2" fill="var(--hmi-chart-bar, #2b9dba)"/>';
      }).join("");
    } else if (sampleItems.length === 1) {
      dataMarkup = '<circle class="hmi-chart-single-point" cx="' + xFor(sampleItems[0], 0).toFixed(2) +
        '" cy="' + yFor(sampleItems[0].value).toFixed(2) + '" r="4.5"/>';
    } else {
      const points = sampleItems.map((item, index) =>
        xFor(item, index).toFixed(2) + "," + yFor(item.value).toFixed(2)
      );
      dataMarkup = '<polyline class="hmi-chart-line" points="' + points.join(" ") +
        '" fill="none" stroke="var(--hmi-chart-line, #218fbd)" stroke-width="' + lineWidth +
        '" stroke-linecap="round" stroke-linejoin="round"/>';
    }

    visual = '<svg class="hmi-chart-svg" viewBox="0 0 360 212" preserveAspectRatio="none" role="img" aria-label="نمودار مقدار برحسب زمان">' +
      '<g class="hmi-chart-grid">' + yAxisMarkup + '</g>' +
      '<path d="M' + left + ' ' + top + ' V' + bottom + ' H' + right +
      '" class="hmi-chart-axis-line"/>' + xAxisMarkup + dataMarkup +
      '<text class="hmi-chart-axis-title hmi-chart-axis-title--y" x="12" y="83" text-anchor="middle" transform="rotate(-90 12 83)">مقدار</text>' +
      '<text class="hmi-chart-axis-title hmi-chart-axis-title--x" x="' + ((left + right) / 2) +
      '" y="205" text-anchor="middle">زمان</text></svg>';
  } else {
    let message = "برای دریافت تاریخچه، پیش‌نمایش شناور را باز کن.";
    if (historyState?.status === "loading") message = "در حال دریافت تاریخچه از Backend…";
    else if (historyState?.status === "error") message = "دریافت تاریخچه ناموفق بود: " + (historyState.message || "خطای نامشخص");
    else if (historyState?.status === "empty") {
      message = isLive
        ? "در انتظار اولین نمونه زنده از PLC یا Edge…"
        : "در " + rangeLabel + " اخیر نمونه‌ی ذخیره‌شده‌ای وجود ندارد.";
    } else if (isLive) {
      message = "در انتظار اولین نمونه زنده از PLC یا Edge…";
    } else if (!tag) {
      message = "ابتدا تگ عددی نمودار را در ویژگی‌های جزء انتخاب کن.";
    }
    visual = '<div class="hmi-chart-empty hmi-chart-empty--detail"><span>' +
      escapeHtml(message) + '</span></div>';
  }

  const liveLabel = isLive
    ? '<div class="hmi-chart-live-label"><span>● LIVE</span><small>پنجره‌ی لغزان ۶۰ ثانیه‌ای · دریافت از جریان زنده</small></div>'
    : "";
  const meta = '<div class="hmi-value-meta hmi-chart-meta"><span>' + escapeHtml(tag?.unit || "") +
    '</span><small>' + escapeHtml(tag?.name || "تگ انتخاب نشده") + " · " +
    String(samples.length).toLocaleString("fa-IR") + " نمونه</small></div>";
  const body = '<div class="hmi-chart-layout">' + valueBox +
    '<div class="hmi-chart-plot">' + visual + '</div>' + liveLabel + meta + '</div>';
  return componentFrame(component, body, quality, preview, isLive ? "hmi-widget--chart-live" : "");
}

function renderMachine(component, tags, preview, type) {
  const runTag = tagFor(tags, component.run_tag_id);
  const faultTag = tagFor(tags, component.fault_tag_id);
  const speedTag = tagFor(tags, component.speed_tag_id);
  const quality = qualityOf(runTag);
  const fault = faultTag && isTagValueOn(faultTag.value);
  const running = runTag && isTagValueOn(runTag.value);
  const state = quality === "UNSAMPLED" ? "بدون نمونه" : quality === "BAD" || fault ? "FAULT" : running ? "RUN" : "STOP";
  const stateClass = state === "FAULT" ? "fault" : state === "RUN" ? "running" : state === "STOP" ? "stopped" : "unknown";
  let graphic = "";
  if (type === "motor") {
    graphic = '<svg viewBox="0 0 150 86" class="hmi-machine-svg" role="img" aria-label="موتور"><rect x="19" y="23" width="88" height="45" rx="8" fill="#e9f0f4" stroke="#6e899c" stroke-width="3"/><circle cx="63" cy="45" r="17" fill="#d3e2e9" stroke="#3e718e" stroke-width="3"/><g class="hmi-machine-rotor"><path d="M63 31 V59 M49 45 H77" stroke="#236e91" stroke-width="5" stroke-linecap="round"/></g><path d="M107 34 H125 V57 H107 M31 68 V76 M93 68 V76" fill="none" stroke="#6e899c" stroke-width="4" stroke-linecap="round"/></svg>';
  } else if (type === "pump") {
    graphic = '<svg viewBox="0 0 150 86" class="hmi-machine-svg" role="img" aria-label="پمپ"><path d="M15 52 H42 M108 52 H135" stroke="#6e899c" stroke-width="8" stroke-linecap="round"/><circle cx="75" cy="48" r="31" fill="#e7f0f4" stroke="#527d95" stroke-width="4"/><g class="hmi-machine-rotor"><circle cx="75" cy="48" r="7" fill="#236e91"/><path d="M75 19 Q89 31 75 41 Q61 31 75 19 M104 48 Q91 62 82 48 Q91 34 104 48 M75 77 Q61 65 75 55 Q89 65 75 77 M46 48 Q59 34 68 48 Q59 62 46 48" fill="#7cb5c7" stroke="#236e91" stroke-width="2"/></g></svg>';
  } else if (type === "fan") {
    graphic = '<svg viewBox="0 0 150 86" class="hmi-machine-svg" role="img" aria-label="فن"><circle cx="75" cy="43" r="34" fill="#edf3f6" stroke="#67869b" stroke-width="3"/><g class="hmi-machine-rotor"><path d="M75 43 Q68 16 82 12 Q97 22 75 43 M75 43 Q102 33 109 47 Q104 64 75 43 M75 43 Q82 70 68 74 Q53 64 75 43 M75 43 Q48 53 41 39 Q46 22 75 43" fill="#5fa4b8" stroke="#2d7895" stroke-width="2"/></g><circle cx="75" cy="43" r="6" fill="#244f70"/></svg>';
  } else {
    graphic = '<svg viewBox="0 0 150 86" class="hmi-machine-svg" role="img" aria-label="نوار نقاله"><path d="M23 29 L127 29 L114 62 L36 62 Z" fill="#e7eef3" stroke="#67869b" stroke-width="3"/><path d="M33 38 H117" stroke="#4b9caa" stroke-width="5" stroke-dasharray="8 5" class="hmi-conveyor-belt"/><circle cx="36" cy="62" r="8" fill="#d9e5eb" stroke="#67869b" stroke-width="3"/><circle cx="114" cy="62" r="8" fill="#d9e5eb" stroke="#67869b" stroke-width="3"/></svg>';
  }
  const speed = speedTag ? valueText(speedTag, preview) + " " + (speedTag.unit || "") : "";
  const body = '<div class="hmi-machine-graphic hmi-machine-graphic--' + type + ' hmi-machine-graphic--' + stateClass + '">' + graphic + '</div>' +
    '<div class="hmi-machine-footer"><span class="hmi-machine-state hmi-machine-state--' + stateClass + '">' + escapeHtml(state) + '</span>' +
    '<b>' + escapeHtml(speed || (type === "motor" ? "Motor" : type === "pump" ? "Pump" : type === "fan" ? "Fan" : "Conveyor")) + '</b></div>';
  return componentFrame(component, body, quality, preview);
}

function renderTank(component, tag, preview) {
  const quality = qualityOf(tag);
  const min = numberOf(component.min, 0);
  const max = numberOf(component.max, 100);
  const value = numberOf(tag?.value, min);
  const percent = rangePercent(value, min, max);
  const height = percent.toFixed(1);
  const tankClipId = "hmi-tank-clip-" + (++tankRenderSequence);
  const body = '<div class="hmi-tank-layout"><svg class="hmi-tank-svg" viewBox="0 0 116 126" role="img" aria-label="مخزن"><defs><clipPath id="' + tankClipId + '"><path d="M28 12 Q58 1 88 12 V104 Q58 121 28 104 Z"/></clipPath></defs><path d="M28 12 Q58 1 88 12 V104 Q58 121 28 104 Z" fill="#f5f8fa" stroke="#67869b" stroke-width="3"/><rect x="28" y="' + (104 - 92 * percent / 100).toFixed(1) + '" width="60" height="' + (92 * percent / 100).toFixed(1) + '" fill="#48b5ca" clip-path="url(#' + tankClipId + ')"/><path d="M20 19 H96 M20 100 H96" stroke="#67869b" stroke-width="2" fill="none"/></svg>' +
    '<div><strong>' + escapeHtml(valueText(tag, preview)) + '</strong><span>' + escapeHtml(tag?.unit || "%") + '</span><small>' + escapeHtml(height) + '%</small></div></div>';
  return componentFrame(component, body, quality, preview);
}

function renderValve(component, tags, preview) {
  const openTag = tagFor(tags, component.open_tag_id);
  const faultTag = tagFor(tags, component.fault_tag_id);
  const quality = qualityOf(openTag);
  const fault = faultTag && isTagValueOn(faultTag.value);
  const opened = openTag && isTagValueOn(openTag.value);
  const state = quality === "UNSAMPLED" ? "بدون نمونه" : quality === "BAD" || fault ? "FAULT" : opened ? "OPEN" : "CLOSED";
  const stateClass = state === "FAULT" ? "fault" : state === "OPEN" ? "running" : state === "CLOSED" ? "stopped" : "unknown";
  const body = '<div class="hmi-valve-graphic hmi-valve-graphic--' + stateClass + '"><svg viewBox="0 0 150 86" role="img" aria-label="شیر"><path d="M12 43 H138" stroke="#7b94a6" stroke-width="8" stroke-linecap="round"/><path d="M42 22 L75 43 L42 64 Z M108 22 L75 43 L108 64 Z" fill="#e4eef3" stroke="#477890" stroke-width="3"/><path d="M75 21 V10 M60 10 H90" stroke="#477890" stroke-width="4" stroke-linecap="round"/></svg></div>' +
    '<div class="hmi-machine-footer"><span class="hmi-machine-state hmi-machine-state--' + stateClass + '">' + escapeHtml(state) + '</span><b>' + escapeHtml(openTag?.name || "تگ شیر") + '</b></div>';
  return componentFrame(component, body, quality, preview);
}

function renderMedia(component, options = {}) {
  const mediaId = String(component.media_id || "").toLowerCase();
  const mediaType = component.media_type === "video" ? "video" : "image";
  const fit = ["contain", "cover", "fill"].includes(component.media_fit) ? component.media_fit : "contain";
  if (!/^[a-f0-9]{32}$/.test(mediaId)) {
    return componentFrame(component,
      '<div class="hmi-media-empty">برای نمایش، از ویژگی‌های جزء یک فایل تصویر، انیمیشن یا ویدئو وارد کن.</div>',
      "MEDIA", options.preview === true, "hmi-widget--media");
  }
  const base = String(options.mediaBase || "").replace(/\/$/, "");
  const src = escapeHtml(base + "/api/hmi/media/" + mediaId);
  const fitClass = "hmi-media-fit-" + fit;
  let element = "";
  if (mediaType === "video") {
    const autoplay = component.media_autoplay === true && component.media_muted !== false ? " autoplay" : "";
    const loop = component.media_loop === false ? "" : " loop";
    const muted = component.media_muted === false ? "" : " muted";
    const controls = component.media_controls === false ? "" : " controls";
    element = '<video class="hmi-media-element ' + fitClass + '" src="' + src + '" preload="metadata" playsinline' + autoplay + loop + muted + controls + '></video>';
  } else {
    element = '<img class="hmi-media-element ' + fitClass + '" src="' + src + '" alt="' +
      escapeHtml(component.label || "رسانه HMI") + '" draggable="false" />';
  }
  return componentFrame(component, '<div class="hmi-media-frame">' + element + '</div>',
    "MEDIA", options.preview === true, "hmi-widget--media");
}

export function renderHmiWidget(component, tags, options = {}) {
  const preview = options.preview === true;
  const history = options.history || [];
  const historyState = options.historyState || null;
  const type = component?.type || "value";
  if (type === "media") return renderMedia(component, options);
  if (["value", "status", "indicator", "gauge", "needle", "thermometer", "chart", "write"].includes(type)) {
    const tag = tagFor(tags, component.tag_id);
    if (type === "value") return renderValue(component, tag, preview);
    if (type === "status") return renderStatus(component, tag, preview);
    if (type === "indicator") return renderIndicator(component, tag, preview);
    if (type === "gauge") return renderGauge(component, tag, preview, false);
    if (type === "needle") return renderGauge(component, tag, preview, true);
    if (type === "thermometer") return renderThermometer(component, tag, preview);
    if (type === "chart") return renderChart(component, tag, preview, history, historyState);
    const quality = qualityOf(tag);
    const active = options.active !== false;
    const body = '<div class="hmi-value-number">' + escapeHtml(valueText(tag, preview)) + '</div><div class="hmi-value-meta"><span>' + escapeHtml(tag?.unit || "") + '</span><small>' + escapeHtml(tag?.name || "تگ انتخاب نشده") + '</small></div>' +
      (preview ? '<small class="hmi-widget-subtitle">کنترل با قفل‌های ایمنی موجود</small>' : '<button class="btn btn-light btn-sm" data-action="hmi-write-tag" data-id="' + escapeHtml(tag?.id || "") + '" ' + (!active || !tag || tag.access !== "read_write" ? "disabled" : "") + '>نوشتن مقدار</button>');
    return componentFrame(component, body, quality, preview);
  }
  if (["motor", "pump", "fan", "conveyor"].includes(type)) return renderMachine(component, tags, preview, type);
  if (type === "tank") return renderTank(component, tagFor(tags, component.level_tag_id), preview);
  if (type === "valve") return renderValve(component, tags, preview);
  return componentFrame(component, '<div class="hmi-chart-empty">نوع جزء پشتیبانی نمی‌شود.</div>', "UNSUPPORTED", preview);
}
