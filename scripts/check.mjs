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
if (!mainSource.includes('document.addEventListener("pointerdown"') ||
    !mainSource.includes('document.addEventListener("pointermove"') ||
    !mainSource.includes('document.addEventListener("pointerup"') ||
    !mainSource.includes('document.addEventListener("pointercancel"')) {
  throw new Error("HMI gestures must use captured document-level pointer down, move, up and cancel events.");
}
if (!designerSource.includes('data-hmi-layout-card data-hmi-layout-gesture="move"') ||
    !designerSource.includes('class="hmi-layout-resize" data-hmi-layout-gesture="resize"') ||
    designerSource.includes('draggable="true"') ||
    !designerSource.includes('handle.setPointerCapture?.(event.pointerId)')) {
  throw new Error("The full HMI card must be movable, the corner must be resizable, and native drag must be disabled.");
}
if (!mainSource.includes('document.addEventListener("dragstart"') ||
    !mainSource.includes('event.preventDefault()')) {
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
console.log("HMI floating layout, drag-safe preview, single-column arrangement, numeric card geometry and trend rendering checks passed.");
