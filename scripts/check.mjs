import { readdir } from "node:fs/promises";
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
const requiredRanges = [5, 10, 30, 60, 300, 600, 900, 1800, 3600, 21600, 43200, 86400];
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
