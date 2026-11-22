import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && path.endsWith(".js")) files.push(path);
  }
  return files;
}

const files = await walk("src");
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Syntax check failed: ${file}\n`);
    process.exit(result.status || 1);
  }
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);


// Render-level smoke test for the Industrial HMI Designer route.
// This executes the actual router and page renderer with a minimal browser environment.
globalThis.window = { SCADA_API_BASE: "http://127.0.0.1:8000" };
globalThis.location = { hostname: "127.0.0.1", protocol: "http:", hash: "#/live/hmi-designer/new" };
globalThis.sessionStorage = {
  getItem: key => key === "scada-demo-auth" ? "1" : null,
};

const { renderRoute } = await import("../src/app/router.js");
const hmiHtml = renderRoute("/live/hmi-designer/new");
const requiredHmiMarkers = [
  'class="hmi-designer-page"',
  "hmi-library-panel",
  'class="hmi-designer-canvas hmi-designer-canvas-stage"',
  'id="hmi-designer-properties"',
  'id="hmi-json-source"',
  'id="hmi-layout-preview-root"',
  'data-action="hmi-open-layout-preview"',
  "طراحی صفحه HMI",
  "کتابخانه اجزا",
  "ویژگی‌های جزء",
];
for (const marker of requiredHmiMarkers) {
  if (!hmiHtml.includes(marker)) {
    throw new Error(`HMI Designer render smoke test failed: missing ${marker}`);
  }
}
const hmiWidgetCount = (hmiHtml.match(/class="hmi-library-item"/g) || []).length;
if (hmiWidgetCount !== 15) {
  throw new Error(`HMI Designer must render 15 library items; got ${hmiWidgetCount}`);
}

console.log("HMI Designer route render passed (15 library widgets, canvas, properties and JSON editor).");

const {
  HMI_CHART_RANGES, HMI_THEME_OPTIONS, HMI_COMPONENT_THEME_OPTIONS, HMI_WIDGET_LIBRARY,
  createHmiWidget, renderHmiWidget, normalizeHmiPageTheme, normalizeHmiWidgetTheme,
  HMI_CHART_LINE_WIDTH_MIN, HMI_CHART_LINE_WIDTH_MAX, HMI_CHART_LINE_WIDTH_DEFAULT, normalizeHmiChartLineWidth,
  HMI_FONT_OPTIONS, normalizeHmiWidgetTypography,
  HMI_CHART_COLOR_OPTIONS, HMI_CHART_SURFACE_OPTIONS, normalizeHmiChartAppearance,
  appendHmiLiveChartSamples, getHmiLiveChartSamples, hmiChartLiveIntervalMs,
} = await import("../src/features/live/hmi-widgets.js");
const chart = createHmiWidget("chart");
if (chart.history_seconds !== 3600 || chart.line_width !== 2.5 ||
    chart.chart_color !== "blue" || chart.chart_surface !== "midnight" ||
    chart.chart_smoothing !== 58 || chart.chart_fill_opacity !== 24 ||
    chart.chart_show_axes !== false) {
  throw new Error("New HMI trend charts must default to the modern dark smooth-area presentation.");
}
const normalizedChartAppearance = normalizeHmiChartAppearance({
  chart_color: "purple", chart_surface: "navy", chart_smoothing: 120,
  chart_fill_opacity: -5, chart_show_axes: true,
});
const unsafeChartAppearance = normalizeHmiChartAppearance({
  chart_color: "url(javascript:alert(1))", chart_surface: "unsafe",
  chart_smoothing: "bad", chart_fill_opacity: 999, chart_show_axes: "true",
});
if (HMI_CHART_COLOR_OPTIONS.length !== 5 || HMI_CHART_SURFACE_OPTIONS.length !== 3 ||
    normalizedChartAppearance.chart_color !== "purple" ||
    normalizedChartAppearance.chart_surface !== "navy" ||
    normalizedChartAppearance.chart_smoothing !== 100 ||
    normalizedChartAppearance.chart_fill_opacity !== 0 ||
    normalizedChartAppearance.chart_show_axes !== true ||
    unsafeChartAppearance.chart_color !== "blue" ||
    unsafeChartAppearance.chart_surface !== "midnight" ||
    unsafeChartAppearance.chart_smoothing !== 58 ||
    unsafeChartAppearance.chart_fill_opacity !== 60 ||
    unsafeChartAppearance.chart_show_axes !== false) {
  throw new Error("HMI chart appearance settings must be allow-listed and bounded.");
}
const requiredRanges = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 21600, 43200, 86400];
for (const seconds of requiredRanges) {
  if (!HMI_CHART_RANGES.some(range => range.value === seconds)) {
    throw new Error(`HMI trend chart is missing the ${seconds}-second range.`);
  }
}
if (HMI_CHART_LINE_WIDTH_MIN !== 0.5 || HMI_CHART_LINE_WIDTH_MAX !== 10 ||
    HMI_CHART_LINE_WIDTH_DEFAULT !== 2.5 ||
    normalizeHmiChartLineWidth(4) !== 4 ||
    normalizeHmiChartLineWidth(0) !== 0.5 ||
    normalizeHmiChartLineWidth(14) !== 10) {
  throw new Error("HMI chart line thickness must be normalized to the supported 0.5–10px range.");
}
const normalizedTypography = normalizeHmiWidgetTypography({font_family:"Verdana",number_font_size:32,text_font_size:14});
const unsafeTypography = normalizeHmiWidgetTypography({font_family:"expression(alert(1))",number_font_size:999,text_font_size:1});
const typographyWidget = renderHmiWidget({
  type: "value", tag_id: "test-pressure", font_family: "Verdana", number_font_size: 32, text_font_size: 14,
}, [{
  id: "test-pressure", name: "Pressure", value: 42.5, type: "float32", unit: "bar", quality: "GOOD",
}]);
if (HMI_FONT_OPTIONS.length !== 5 ||
    normalizedTypography.font_family !== "Verdana" || normalizedTypography.number_font_size !== 32 ||
    normalizedTypography.text_font_size !== 14 || unsafeTypography.font_family !== "Tahoma" ||
    unsafeTypography.number_font_size !== 48 || unsafeTypography.text_font_size !== 8 ||
    !typographyWidget.includes("--hmi-font-family:Verdana, sans-serif") ||
    !typographyWidget.includes("--hmi-number-scale:1.333") ||
    !typographyWidget.includes("--hmi-text-scale:1.167")) {
  throw new Error("All HMI cards must support safe font families and bounded number/text sizes.");
}

const needleHtml = renderHmiWidget({
  type: "needle", label: "فشار", tag_id: "test-pressure", min: 0, max: 100,
}, [{
  id: "test-pressure", name: "Pressure", value: 42.5, type: "float32", unit: "bar", quality: "GOOD",
}]);
const expectedNeedleValue = (42.5).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
if (!needleHtml.includes('class="hmi-dial-reading"') || !needleHtml.includes(expectedNeedleValue) || !needleHtml.includes("bar")) {
  throw new Error("Needle widget must render a numeric value and its unit.");
}

if (HMI_WIDGET_LIBRARY.length !== 15 || !HMI_WIDGET_LIBRARY.some(item => item.type === "media") ||
    normalizeHmiPageTheme("dark") !== "dark" ||
    normalizeHmiPageTheme("unsafe") !== "light" ||
    normalizeHmiWidgetTheme("inherit") !== "inherit" ||
    normalizeHmiWidgetTheme("unsafe") !== "inherit" ||
    HMI_THEME_OPTIONS.length !== 4 ||
    HMI_COMPONENT_THEME_OPTIONS.length !== 5 ||
    !hmiHtml.includes('data-hmi-page-field="theme"')) {
  throw new Error("HMI page and widget theme options must be allow-listed and exposed by the designer.");
}
const themedWidget = renderHmiWidget({
  type: "value", tag_id: "test-pressure", theme: "blue",
}, [{
  id: "test-pressure", name: "Pressure", value: 42.5, type: "float32", unit: "bar", quality: "GOOD",
}]);
if (!themedWidget.includes('data-hmi-theme="blue"')) {
  throw new Error("Per-widget HMI themes must be present on the rendered widget root.");
}
const orderedTrend = renderHmiWidget({
  type: "chart", tag_id: "test-trend", history_seconds: 60, line_width: 4,
  chart_color: "purple", chart_surface: "navy", chart_smoothing: 72,
  chart_fill_opacity: 35, chart_show_axes: true,
}, [{
  id: "test-trend", name: "Test trend", value: 12.5,
  type: "float32", unit: "bar", quality: "GOOD",
}], {
  history: [
    { value: 15, sampled_at: "2026-11-22T08:00:30+00:00" },
    { value: null, sampled_at: "2026-11-22T08:00:20+00:00" },
    { value: 10, sampled_at: "2026-11-22T08:00:10+00:00" },
    { value: 20, sampled_at: "2026-11-22T08:00:20+00:00" },
  ],
  historyState: { status: "ready", sampleCount: 3 },
});
const trendLine = orderedTrend.match(/<path class="hmi-chart-line"[^>]*d="([^"]+)"/)?.[1] || "";
const trendPoints = orderedTrend.match(/data-points="([^"]+)"/)?.[1] || "";
if (trendPoints !== "48.00,140.00|198.00,12.00|348.00,76.00" ||
    !trendLine.includes(" C") || !trendLine.includes("348.00 76.00")) {
  throw new Error("HMI trend must use chronological points and a smooth curve: " + JSON.stringify({ trendPoints, trendLine }));
}
if (!orderedTrend.includes('viewBox="0 0 360 180"') ||
    !orderedTrend.includes('preserveAspectRatio="none"') ||
    !orderedTrend.includes('data-hmi-chart-surface="navy"') ||
    !orderedTrend.includes('class="hmi-chart-area"') ||
    !orderedTrend.includes('class="hmi-chart-topbar"') ||
    !orderedTrend.includes('class="hmi-chart-reading"') ||
    !orderedTrend.includes('stroke-width="4"') ||
    !orderedTrend.includes('stop-opacity="0.35"') ||
    !orderedTrend.includes('class="hmi-chart-axis-title hmi-chart-axis-title--y"') ||
    !orderedTrend.includes('class="hmi-chart-axis-title hmi-chart-axis-title--x"') ||
    (orderedTrend.match(/class="hmi-chart-y-tick"/g) || []).length < 3 ||
    (orderedTrend.match(/class="hmi-chart-x-tick"/g) || []).length !== 3) {
  throw new Error("HMI chart must render the dark area style, line, heading, palette, fill and optional axes.");
}
const cleanDefaultChart = renderHmiWidget({
  type: "chart", tag_id: "test-trend", history_seconds: 60,
}, [{
  id: "test-trend", name: "Test trend", value: 12.5,
  type: "float32", unit: "bar", quality: "GOOD",
}], {
  history: [
    { value: 10, sampled_at: "2026-11-22T08:00:10+00:00" },
    { value: 15, sampled_at: "2026-11-22T08:00:20+00:00" },
  ],
  historyState: { status: "ready", sampleCount: 2 },
});
if (!cleanDefaultChart.includes('data-hmi-chart-surface="midnight"') ||
    !cleanDefaultChart.includes('class="hmi-chart-area"') ||
    cleanDefaultChart.includes('class="hmi-chart-y-tick"') ||
    cleanDefaultChart.includes('class="hmi-chart-x-tick"')) {
  throw new Error("Default HMI chart must use the dark smooth area style and hide axis labels.");
}
console.log("HMI chart range and needle numeric readout checks passed.");

const {
  normalizeHmiWidgetFreeformGeometry,
  hmiWidgetFreeformStyle,
  applyHmiWidgetFreeformGesture,
  hmiWidgetFreeformFromPointer,
  hmiWidgetCanvasHeight,
  arrangeHmiWidgetsSingleColumn,
  HMI_LAYOUT_CANVAS_WIDTH,
  hmiChartRefreshIntervalMs,
} = await import("../src/features/live/hmi-widgets.js");
if (HMI_LAYOUT_CANVAS_WIDTH !== 1200) {
  throw new Error("HMI freeform canvas must retain its 1200px logical design width.");
}
const positionedCard = normalizeHmiWidgetFreeformGeometry({
  type: "chart", x: 875, y: 210, width: 300, height: 260,
}, 0);
const expectedFreeformStyle = "position:absolute;left:875px;top:210px;width:300px;height:260px;";
if (hmiWidgetFreeformStyle(positionedCard) !== expectedFreeformStyle) {
  throw new Error("HMI card position and dimensions must be rendered as exact freeform pixel values.");
}
const moveStart = { x: 120, y: 140, width: 360, height: 220 };
const movedCard = applyHmiWidgetFreeformGesture(moveStart, "move", 37, 21);
if (movedCard.x !== 157 || movedCard.y !== 161) {
  throw new Error("HMI freeform movement must preserve exact pixel deltas without grid snapping.");
}
const pointerMoveOnce = hmiWidgetFreeformFromPointer(moveStart, "move", 137, 72);
const pointerMoveAgain = hmiWidgetFreeformFromPointer(moveStart, "move", 137, 72);
if (pointerMoveOnce.x !== 257 || pointerMoveOnce.y !== 212 ||
    pointerMoveAgain.x !== pointerMoveOnce.x || pointerMoveAgain.y !== pointerMoveOnce.y) {
  throw new Error("HMI pointer movement must use immutable starting geometry and remain non-cumulative.");
}
const pointerResize = hmiWidgetFreeformFromPointer(moveStart, "resize", 125, 75);
if (pointerResize.width !== 485 || pointerResize.height !== 295) {
  throw new Error("HMI pointer resize must follow the exact horizontal and vertical pointer movement.");
}
const edgeCard = { x: 1000, y: 20, width: 200, height: 160 };
const edgeMove = applyHmiWidgetFreeformGesture(edgeCard, "move", 90, 10);
const edgeResize = applyHmiWidgetFreeformGesture(edgeCard, "resize", 100, 100);
if (edgeMove.x !== 1000 || edgeResize.width !== 200 || edgeResize.height !== 260) {
  throw new Error("HMI freeform gestures must clamp horizontal bounds but allow independent vertical growth.");
}
const legacyCard = normalizeHmiWidgetFreeformGeometry({
  type: "gauge", grid_col: 7, grid_row: 2, grid_w: 6, grid_h: 4,
}, 0);
if (legacyCard.x !== 600 || legacyCard.y !== 84 || legacyCard.width !== 580 || legacyCard.height !== 280) {
  throw new Error("Existing twelve-column HMI layouts must migrate to equivalent freeform pixel geometry.");
}
const oneColumnCards = arrangeHmiWidgetsSingleColumn([
  { widget_id: "one", type: "value", x: 40, y: 20, width: 300, height: 200 },
  { widget_id: "two", type: "chart", x: 600, y: 10, width: 240, height: 180 },
  { widget_id: "three", type: "gauge", x: 200, y: 300, width: 360, height: 240 },
]);
if (oneColumnCards.some(card => card.x !== 24 || card.width !== 1152)) {
  throw new Error("Single-column HMI arrangement must use the full width of the freeform canvas.");
}
if (oneColumnCards.map(card => card.y).join(",") !== "24,248,452") {
  throw new Error("Single-column freeform arrangement must stack components without overlap.");
}
const maxOneColumnCards = arrangeHmiWidgetsSingleColumn(
  Array.from({ length: 50 }, (_, index) => ({ type: "value", widget_id: "max-" + index }))
);
if (maxOneColumnCards[maxOneColumnCards.length - 1].y !== 24 + 49 * 244 ||
    hmiWidgetCanvasHeight(maxOneColumnCards) <= maxOneColumnCards[maxOneColumnCards.length - 1].y) {
  throw new Error("Single-column HMI layout must extend the freeform canvas for all 50 cards.");
}
const secondCard = normalizeHmiWidgetFreeformGeometry({ type: "value" }, 1);
if (secondCard.x !== 414 || secondCard.y !== 24 || secondCard.width !== 360 || secondCard.height !== 220) {
  throw new Error("New HMI cards must receive predictable freeform pixel positions and dimensions.");
}
if (hmiChartRefreshIntervalMs([{ type: "chart", history_seconds: 1 }]) !== 5000 ||
    hmiChartLiveIntervalMs([{ type: "chart", history_seconds: 1 }]) !== 1000 ||
    hmiChartLiveIntervalMs([{ type: "chart", history_seconds: 3600 }]) !== 5000) {
  throw new Error("One-second HMI charts must use the one-second live stream, not repeated history requests.");
}
if (hmiChartRefreshIntervalMs([{ type: "chart", history_seconds: 3600 }]) !== 5000) {
  throw new Error("Long HMI trend ranges must retain the slower history refresh cadence.");
}
const chartTag = {
  id: "test-trend", name: "Test trend", value: 12.5,
  type: "float32", unit: "bar", quality: "GOOD",
};
const singleSampleChart = renderHmiWidget({
  type: "chart", tag_id: "test-trend", history_seconds: 60,
}, [chartTag], {
  history: [{ value: 12.5, sampled_at: "2026-11-22T08:00:00+00:00" }],
  historyState: { status: "ready", sampleCount: 1 },
});
if (!singleSampleChart.includes("hmi-chart-single-point") ||
    !singleSampleChart.includes("hmi-chart-value-box") ||
    !singleSampleChart.includes("۱۲")) {
  throw new Error("HMI trend must render its single sample and numeric value tile when history contains one sample.");
}
const emptyHistoryChart = renderHmiWidget({
  type: "chart", tag_id: "test-trend", history_seconds: 60,
}, [chartTag], {
  history: [],
  historyState: { status: "empty", sampleCount: 0 },
});
if (!emptyHistoryChart.includes("hmi-chart-latest") ||
    !emptyHistoryChart.includes("آخرین مقدار زنده") ||
    !emptyHistoryChart.includes("bar")) {
  throw new Error("HMI trend with no stored samples must show a separate latest live value and unit.");
}
const failedHistoryChart = renderHmiWidget({
  type: "chart", tag_id: "test-trend", history_seconds: 60,
}, [chartTag], {
  history: [],
  historyState: { status: "error", message: "Backend unavailable" },
});
if (!failedHistoryChart.includes("Backend unavailable")) {
  throw new Error("HMI trend must distinguish history fetch failures from an empty time window.");
}
const oneSecondEmptyChart = renderHmiWidget({
  type: "chart", tag_id: "test-trend", history_seconds: 1,
}, [chartTag], {
  history: [],
  historyState: { status: "empty", sampleCount: 0 },
});
if (!oneSecondEmptyChart.includes("در انتظار اولین نمونه زنده") ||
    !oneSecondEmptyChart.includes("hmi-widget--chart-live")) {
  throw new Error("A one-second chart must clearly show that it is waiting for a real live sample.");
}
const liveComponent = { type: "chart", tag_id: "test-live-buffer", history_seconds: 1 };
const liveTime1 = new Date(Date.now() - 1000).toISOString();
const liveTime2 = new Date(Date.now()).toISOString();
if (!appendHmiLiveChartSamples([liveComponent], [{
  id: "test-live-buffer", value: 10, quality: "GOOD", sampled_at: liveTime1,
}])) throw new Error("The first live WebSocket sample was not added to the HMI chart buffer.");
if (appendHmiLiveChartSamples([liveComponent], [{
  id: "test-live-buffer", value: 10, quality: "GOOD", sampled_at: liveTime1,
}])) throw new Error("Duplicate WebSocket snapshots must not create duplicate chart points.");
if (!appendHmiLiveChartSamples([liveComponent], [{
  id: "test-live-buffer", value: 20, quality: "GOOD", sampled_at: liveTime2,
}])) throw new Error("A new live WebSocket sample was not appended.");
const liveSamples = getHmiLiveChartSamples("test-live-buffer");
const liveTrend = renderHmiWidget(liveComponent, [{
  id: "test-live-buffer", name: "Live tag", value: 20, type: "float32", quality: "GOOD",
}], { history: liveSamples, historyState: { status: "live" } });
if (liveSamples.length !== 2 || !liveTrend.includes("hmi-chart-live-label") ||
    (liveTrend.match(/<path class="hmi-chart-line"/g) || []).length !== 1 ||
    !liveTrend.includes('data-point-count="2"')) {
  throw new Error("One-second HMI trends must render a continuous line from distinct live samples.");
}
const imageMedia = renderHmiWidget({
  type: "media", media_id: "a".repeat(32), media_type: "image", media_fit: "contain", label: "panel",
}, [], { mediaBase: "http://127.0.0.1:8000" });
const videoMedia = renderHmiWidget({
  type: "media", media_id: "b".repeat(32), media_type: "video",
  media_autoplay: true, media_loop: true, media_muted: true, media_controls: true,
}, [], { mediaBase: "http://127.0.0.1:8000" });
if (!imageMedia.includes('<img class="hmi-media-element') ||
    !imageMedia.includes("http://127.0.0.1:8000/api/hmi/media/") ||
    !videoMedia.includes("<video") || !videoMedia.includes(" autoplay") ||
    !videoMedia.includes(" muted") || !videoMedia.includes(" controls")) {
  throw new Error("HMI media widgets must render authenticated image and video elements with safe media IDs.");
}
const designerSource = await readFile("src/features/live/hmi-designer.js", "utf8");
const mainSource = await readFile("src/app/main.js", "utf8");
const gestureSource = await readFile("src/features/live/hmi-designer-events.js", "utf8");
if (!mainSource.includes("bindHmiDesignerGestureEvents(document)") ||
    !gestureSource.includes('target.addEventListener("pointerdown"') ||
    !gestureSource.includes('target.addEventListener("pointermove"') ||
    !gestureSource.includes('target.addEventListener("pointerup"') ||
    !gestureSource.includes('target.addEventListener("pointercancel"') ||
    !gestureSource.includes('target.addEventListener("mousedown"') ||
    !gestureSource.includes('target.addEventListener("mousemove"') ||
    !gestureSource.includes('target.addEventListener("mouseup"')) {
  throw new Error("The application and browser test must share captured pointer and desktop mouse gesture bindings.");
}
if (!designerSource.includes("export function handleHmiDesignerMouseDown") ||
    !designerSource.includes("export function handleHmiDesignerMouseMove") ||
    !designerSource.includes("export function handleHmiDesignerMouseUp")) {
  throw new Error("HMI layout gestures must expose mouse down, move and up handlers.");
}
if (!designerSource.includes('data-hmi-layout-card data-hmi-layout-gesture="move"') ||
    !designerSource.includes('data-hmi-layout-gesture="move" title="برای جابه‌جایی، هر قسمت کارت را بکش"') ||
    !designerSource.includes('class="hmi-layout-resize" data-hmi-layout-gesture="resize"') ||
    designerSource.includes('draggable="true"') ||
    !designerSource.includes('handle.setPointerCapture?.(event.pointerId)')) {
  throw new Error("The full HMI card and toolbar must be movable, the corner resizable and native drag disabled.");
}
const cssSource = await readFile("styles/app.css", "utf8");
if (!cssSource.includes(".hmi-layout-card {") ||
    !cssSource.includes("pointer-events: auto !important;") ||
    !cssSource.includes(".hmi-layout-card .hmi-layout-resize")) {
  throw new Error("HMI card surfaces and resize grips must remain explicit pointer hit targets.");
}
if (!cssSource.includes('[data-hmi-page-theme="dark"]') ||
    !cssSource.includes('[data-hmi-theme="blue"]') ||
    !cssSource.includes("--hmi-chart-line: #60c5e8") ||
    !designerSource.includes('data-hmi-page-theme="\' + normalizeHmiPageTheme(draft.theme)')) {
  throw new Error("HMI page and widget theme presets must be applied to the preview and visual tokens.");
}
if (!gestureSource.includes('target.addEventListener("dragstart"') ||
    !gestureSource.includes('event.preventDefault()')) {
  throw new Error("Native browser drag must be blocked inside the HMI preview to prevent the not-allowed cursor.");
}
if (!designerSource.includes('data-hmi-layout-prop="x"') ||
    !designerSource.includes('data-hmi-layout-prop="y"') ||
    !designerSource.includes('data-hmi-layout-prop="width"') ||
    !designerSource.includes('data-hmi-layout-prop="height"')) {
  throw new Error("HMI layout properties must expose unrestricted pixel positions and dimensions.");
}
if (designerSource.includes('hmi-layout-preview-backdrop" data-action="hmi-close-layout-preview"')) {
  throw new Error("Clicking or dragging on the HMI preview backdrop must not close the layout editor.");
}
if (!designerSource.includes('data-action="hmi-layout-single-column"')) {
  throw new Error("The floating HMI preview must expose a one-card-per-row layout command.");
}
if (!cssSource.includes(".hmi-chart-value-box {") ||
    !cssSource.includes(".hmi-chart-axis-title") ||
    !cssSource.includes(".hmi-chart-x-tick") ||
    !cssSource.includes(".hmi-chart-y-tick") ||
    !cssSource.includes(".hmi-chart-plot {") ||
    !cssSource.includes(".hmi-chart-topbar") ||
    !cssSource.includes(".hmi-chart-area") ||
    !cssSource.includes(".hmi-chart-line") ||
    !cssSource.includes(".hmi-chart-axes-toggle") ||
    !cssSource.includes(".hmi-designer-canvas-scroll") ||
    !cssSource.includes(".hmi-media-file-input") ||
    !cssSource.includes("--hmi-number-scale") ||
    !designerSource.includes("typographyPropertiesMarkup(component)") ||
    !designerSource.includes('class="hmi-designer-item-content"')) {
  throw new Error("HMI chart styling must keep its value tile and both time/value axes responsive inside the card.");
}
if (!cssSource.includes(".hmi-layout-card-content {") ||
    !cssSource.includes("container-type: size;") ||
    !cssSource.includes(".hmi-runtime-item {") ||
    !cssSource.includes("flex: 1 1 0;") ||
    !cssSource.includes(".hmi-machine-svg {") ||
    !cssSource.includes(".hmi-chart-svg {")) {
  throw new Error("All HMI widget types must use responsive, size-constrained fitting inside their assigned cards.");
}
if (!cssSource.includes(".hmi-runtime-grid[data-hmi-page-theme] {\n  background-image: none !important;") ||
    !cssSource.includes(".hmi-designer-canvas[data-hmi-page-theme]")) {
  throw new Error("HMI runtime must remove the design grid while retaining the designer grid.");
}
if (!mainSource.includes("/api/telemetry/ws/live?interval_ms=") ||
    !designerSource.includes("recordHmiPageLiveChartData") ||
    !designerSource.includes("handleHmiDesignerMediaUpload")) {
  throw new Error("HMI live WebSocket and media upload paths must be connected to the application.");
}
console.log("HMI floating layout, drag-safe preview, single-column arrangement, numeric card geometry, live trend, media and runtime grid checks passed.");
