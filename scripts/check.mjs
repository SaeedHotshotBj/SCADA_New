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
  'class="hmi-designer-canvas"',
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
if (hmiWidgetCount !== 14) {
  throw new Error(`HMI Designer must render 14 library items; got ${hmiWidgetCount}`);
}

console.log("HMI Designer route render passed (14 library widgets, canvas, properties and JSON editor).");

const { HMI_CHART_RANGES, createHmiWidget, renderHmiWidget } = await import("../src/features/live/hmi-widgets.js");
const chart = createHmiWidget("chart");
if (chart.history_seconds !== 3600) {
  throw new Error("New HMI trend charts must default to a one-hour range in seconds.");
}
const requiredRanges = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 21600, 43200, 86400];
for (const seconds of requiredRanges) {
  if (!HMI_CHART_RANGES.some(range => range.value === seconds)) {
    throw new Error(`HMI trend chart is missing the ${seconds}-second range.`);
  }
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

console.log("HMI chart range and needle numeric readout checks passed.");

const {
  normalizeHmiWidgetGeometry,
  hmiWidgetGridStyle,
  applyHmiWidgetGridGesture,
  hmiWidgetGridFromPointer,
  arrangeHmiWidgetsSingleColumn,
  hmiChartRefreshIntervalMs,
} = await import("../src/features/live/hmi-widgets.js");
const positionedCard = normalizeHmiWidgetGeometry({
  type: "chart", grid_col: 7, grid_row: 2, grid_w: 6, grid_h: 4,
}, 0);
const expectedGridStyle = "grid-column:7 / span 6;grid-row:2 / span 4;";
if (hmiWidgetGridStyle(positionedCard) !== expectedGridStyle) {
  throw new Error("HMI card position and size must be converted to the expected 12-column grid placement.");
}
const moveStart = { grid_col: 2, grid_row: 3, grid_w: 4, grid_h: 3 };
const movedCard = applyHmiWidgetGridGesture(moveStart, "move", 2, 1);
if (movedCard.grid_col !== 4 || movedCard.grid_row !== 4) {
  throw new Error("Dragging a HMI card toolbar must change its grid column and row.");
}
const pointerMoveOnce = hmiWidgetGridFromPointer(moveStart, "move", 130, 72, 65, 72);
const pointerMoveAgain = hmiWidgetGridFromPointer(moveStart, "move", 130, 72, 65, 72);
if (pointerMoveOnce.grid_col !== 4 || pointerMoveOnce.grid_row !== 4 ||
    pointerMoveAgain.grid_col !== pointerMoveOnce.grid_col ||
    pointerMoveAgain.grid_row !== pointerMoveOnce.grid_row) {
  throw new Error("HMI pointer drag must calculate from the original card geometry instead of accumulating total pointer deltas.");
}
const pointerResize = hmiWidgetGridFromPointer(moveStart, "resize", 130, 144, 65, 72);
if (pointerResize.grid_w !== 6 || pointerResize.grid_h !== 5) {
  throw new Error("HMI pointer resize must calculate the requested width and height from the drag start geometry.");
}
const resizedCard = applyHmiWidgetGridGesture({
  grid_col: 2, grid_row: 3, grid_w: 4, grid_h: 3,
}, "resize", 2, 2);
if (resizedCard.grid_w !== 6 || resizedCard.grid_h !== 5) {
  throw new Error("Dragging the HMI resize handle must change the numeric grid width and height.");
}
const oneColumnCards = arrangeHmiWidgetsSingleColumn([
  { widget_id: "one", type: "value", grid_col: 4, grid_row: 1, grid_w: 4, grid_h: 4 },
  { widget_id: "two", type: "chart", grid_col: 8, grid_row: 1, grid_w: 4, grid_h: 3 },
  { widget_id: "three", type: "gauge", grid_col: 1, grid_row: 5, grid_w: 4, grid_h: 5 },
]);
if (oneColumnCards.some(card => card.grid_col !== 1 || card.grid_w !== 12)) {
  throw new Error("Single-column HMI layout must make every card span all twelve columns.");
}
if (oneColumnCards.map(card => card.grid_row).join(",") !== "1,5,8") {
  throw new Error("Single-column HMI layout must place cards in consecutive, non-overlapping rows.");
}
if (hmiWidgetGridStyle(oneColumnCards[0]) !== "grid-column:1 / span 12;grid-row:1 / span 4;") {
  throw new Error("Single-column layout must render each card at full row width.");
}
const maxOneColumnCards = arrangeHmiWidgetsSingleColumn(
  Array.from({ length: 50 }, (_, index) => ({ type: "value", grid_h: 12, widget_id: "max-" + index }))
);
if (maxOneColumnCards[maxOneColumnCards.length - 1].grid_row !== 589) {
  throw new Error("Single-column layout must support all 50 cards without row-position collisions.");
}
const edgeResizedCard = applyHmiWidgetGridGesture({
  grid_col: 10, grid_row: 3, grid_w: 3, grid_h: 11,
}, "resize", 5, 5);
if (edgeResizedCard.grid_w !== 3 || edgeResizedCard.grid_h !== 12) {
  throw new Error("HMI card resizing must clamp width to the remaining columns and height to twelve rows.");
}
if (hmiChartRefreshIntervalMs([{ type: "chart", history_seconds: 1 }]) !== 750) {
  throw new Error("A one-second HMI trend must refresh its history more frequently than the one-second display window.");
}
if (hmiChartRefreshIntervalMs([{ type: "chart", history_seconds: 3600 }]) !== 5000) {
  throw new Error("Long HMI trend ranges must retain the slower history refresh cadence.");
}
const defaultSecondCard = normalizeHmiWidgetGeometry({ type: "value" }, 1);
if (defaultSecondCard.grid_col !== 5 || defaultSecondCard.grid_row !== 1 ||
    defaultSecondCard.grid_w !== 4 || defaultSecondCard.grid_h !== 3) {
  throw new Error("HMI cards must receive a predictable default grid position and size.");
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
if (!singleSampleChart.includes("hmi-chart-single-point") || !singleSampleChart.includes("12")) {
  throw new Error("HMI trend must render a visible point when the history contains exactly one sample.");
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
if (!oneSecondEmptyChart.includes("فاصله ذخیره تاریخچه PLC/Edge را روی ۱ ثانیه تنظیم کن")) {
  throw new Error("A one-second empty trend must explain the required PLC/Edge history sampling interval.");
}
const designerSource = await readFile("src/features/live/hmi-designer.js", "utf8");
const mainSource = await readFile("src/app/main.js", "utf8");
if (!mainSource.includes('document.addEventListener("mousedown"') ||
    !mainSource.includes('document.addEventListener("mousemove"') ||
    !mainSource.includes('document.addEventListener("mouseup"')) {
  throw new Error("HMI layout gestures must be wired to document-level mouse down, move and up events.");
}
if (!designerSource.includes('data-hmi-layout-gesture="move"') ||
    !designerSource.includes('class="hmi-layout-resize" data-hmi-layout-gesture="resize"') ||
    designerSource.includes('draggable="true"')) {
  throw new Error("HMI movement and resize handles must use direct mouse gestures, not native HTML drag-and-drop.");
}
if (mainSource.includes('handleHmiDesignerPointerUp') || mainSource.includes('document.addEventListener("dragstart"')) {
  throw new Error("HMI designer must not retain obsolete pointer-up or native drag handlers.");
}
if (designerSource.includes('hmi-layout-preview-backdrop" data-action="hmi-close-layout-preview"')) {
  throw new Error("Clicking or dragging on the HMI preview backdrop must not close the layout editor.");
}
if (!designerSource.includes('data-action="hmi-layout-single-column"')) {
  throw new Error("The floating HMI preview must expose a one-card-per-row layout command.");
}
console.log("HMI floating layout, drag-safe preview, single-column arrangement, numeric card geometry and trend rendering checks passed.");
