import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.HMI_TEST_PORT || 4179);
const baseUrl = `http://127.0.0.1:${port}`;
const artifacts = "artifacts/hmi-browser";
mkdirSync(artifacts, { recursive: true });

const server = spawn(process.env.PYTHON || "python3", [
  "-m", "http.server", String(port), "--bind", "127.0.0.1",
], { stdio: "ignore" });

let browser;
let page;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the static server to bind. */ }
    await delay(250);
  }
  if (!ready) throw new Error("The local static fixture server did not start.");

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.stack || error.message));
  page.on("console", message => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  const historyRequests = [];
  const mediaId = "c".repeat(32);
  let mediaUploadCount = 0;
  const mediaSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="#267fc3"/><circle cx="12" cy="12" r="7" fill="#fff"/></svg>';
  await page.route("http://127.0.0.1:8000/api/hmi/media", async route => {
    if (route.request().method() !== "POST") return route.continue();
    mediaUploadCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: mediaId,
        url: "/api/hmi/media/" + mediaId,
        filename: mediaUploadCount === 1 ? "plant-diagram.svg" : "plant-diagram-edit.svg",
        content_type: "image/svg+xml",
        media_type: "image",
        size_bytes: Buffer.byteLength(mediaSvg),
      }),
    });
  });
  await page.route("http://127.0.0.1:8000/api/hmi/media/*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "X-Content-Type-Options": "nosniff" },
      body: mediaSvg,
    });
  });
  await page.route(/\/api\/telemetry\/history\?/, async route => {
    const url = new URL(route.request().url());
    historyRequests.push({
      tagId: url.searchParams.get("tag_id"),
      seconds: url.searchParams.get("seconds"),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          { tag_id: "tag-test", value: 11.5, quality: "DEMO", source: "browser-fixture", sampled_at: new Date(Date.now() - 30000).toISOString() },
          { tag_id: "tag-test", value: 22.5, quality: "DEMO", source: "browser-fixture", sampled_at: new Date(Date.now() - 20000).toISOString() },
          { tag_id: "tag-test", value: 18.25, quality: "DEMO", source: "browser-fixture", sampled_at: new Date(Date.now() - 10000).toISOString() },
        ],
      }),
    });
  });

  await page.goto(`${baseUrl}/scripts/hmi-browser-fixture.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__hmiBrowserReady === true);
  await page.locator(".hmi-layout-preview-backdrop").waitFor({ state: "visible" });

  // History must reach the chart renderer as a timestamped smooth SVG curve.
  const chartCard = page.locator("[data-hmi-layout-card]").filter({ has: page.locator(".hmi-widget--chart") }).first();
  const historyLine = chartCard.locator(".hmi-chart-svg .hmi-chart-line");
  await historyLine.waitFor({ state: "visible", timeout: 5000 });
  const chartMarkup = await historyLine.evaluate(element => ({
    pointCount: Number(element.getAttribute("data-point-count") || 0),
    path: element.getAttribute("d") || "",
  }));
  if (chartMarkup.pointCount !== 3 || !chartMarkup.path.includes(" C")) {
    throw new Error("HMI trend history did not render three ordered points as a smooth curve: " + JSON.stringify(chartMarkup));
  }
  if (!historyRequests.some(item => item.tagId === "tag-test" && item.seconds === "3600") ||
      historyRequests.some(item => item.seconds === "1")) {
    throw new Error("The historical chart must load its 3600-second history while the one-second chart must not poll the history API: " + JSON.stringify(historyRequests));
  }

  // Feed two distinct real-time snapshots through the same function used by the WebSocket listener.
  const liveChartCard = page.locator("[data-hmi-layout-card]").filter({ has: page.locator(".hmi-widget--chart-live") }).first();
  await page.evaluate(() => window.__feedHmiLive({
    id: "tag-test", value: 31.25, quality: "GOOD",
    sampled_at: new Date(Date.now() - 1000).toISOString(),
  }));
  await page.evaluate(() => window.__feedHmiLive({
    id: "tag-test", value: 38.5, quality: "GOOD",
    sampled_at: new Date().toISOString(),
  }));
  const liveLine = liveChartCard.locator(".hmi-chart-svg .hmi-chart-line");
  await liveLine.waitFor({ state: "visible", timeout: 5000 });
  const livePointCount = await liveLine.getAttribute("data-point-count");
  if (livePointCount !== "2" || !(await liveChartCard.locator(".hmi-chart-live-label").count())) {
    throw new Error("The one-second trend did not draw a continuous SVG curve from two incoming live samples: " + livePointCount);
  }

  
  // Default appearance follows the reference: dark surface, subtle grid and a smooth filled curve.
  const renderedChart = await chartCard.locator(".hmi-chart-svg").evaluate(svg => ({
    line: svg.querySelector(".hmi-chart-line")?.getAttribute("d") || "",
    pointCount: Number(svg.querySelector(".hmi-chart-line")?.getAttribute("data-point-count") || 0),
    gridLines: svg.querySelectorAll(".hmi-chart-grid-line").length,
    xTicks: svg.querySelectorAll(".hmi-chart-x-tick").length,
    yTicks: svg.querySelectorAll(".hmi-chart-y-tick").length,
    area: Boolean(svg.querySelector(".hmi-chart-area")),
    preserveAspectRatio: svg.getAttribute("preserveAspectRatio"),
    matrix: (() => { const matrix = svg.getScreenCTM(); return matrix ? [matrix.a, matrix.d] : null; })(),
  }));
  const endpointLabel = chartCard.locator(".hmi-chart-svg .hmi-chart-endpoint-label");
  await endpointLabel.waitFor({ state: "visible" });
  const endpointGeometry = await endpointLabel.evaluate(element => ({
    value: element.getAttribute("data-value"),
    x: Number(element.getAttribute("x")),
    y: Number(element.getAttribute("y")),
    pointX: Number(element.getAttribute("data-point-x")),
    pointY: Number(element.getAttribute("data-point-y")),
    text: element.textContent,
  }));
  const valueBoxes = await chartCard.locator(".hmi-chart-value-box").count();
  const chartSurface = await chartCard.locator(".hmi-widget").getAttribute("data-hmi-chart-surface");
  const chartBackgroundImage = await chartCard.locator(".hmi-widget").evaluate(element => getComputedStyle(element).backgroundImage);
  const chartBackgroundColor = await chartCard.locator(".hmi-widget").evaluate(element => getComputedStyle(element).backgroundColor);
  if (!renderedChart.line.includes(" C") || renderedChart.pointCount < 2 ||
      renderedChart.gridLines !== 4 || renderedChart.xTicks !== 0 || renderedChart.yTicks !== 0 ||
      !renderedChart.area || renderedChart.preserveAspectRatio !== "xMidYMid meet" ||
      !renderedChart.matrix || Math.abs(Math.abs(renderedChart.matrix[0]) - Math.abs(renderedChart.matrix[1])) > 0.001 ||
      chartSurface !== "midnight" ||
      !chartBackgroundImage.includes("radial-gradient") || chartBackgroundColor === "rgb(0, 0, 0)" ||
      valueBoxes !== 0 || !endpointGeometry.value ||
      Math.abs(endpointGeometry.x - endpointGeometry.pointX) > 16 ||
      Math.abs(endpointGeometry.y - endpointGeometry.pointY) > 30) {
    throw new Error("HMI trend must show a colored surface and latest value next to the curve endpoint: " +
      JSON.stringify({ renderedChart, endpointGeometry, chartSurface, chartBackgroundImage, chartBackgroundColor, valueBoxes }));
  }

  
  const mediaCard = page.locator("[data-hmi-layout-card]").filter({ has: page.locator(".hmi-widget--media") }).first();
  await mediaCard.locator(".hmi-layout-card-toolbar").click();
  const mediaInput = page.locator("#hmi-layout-preview-properties [data-hmi-media-input]");
  if (await page.locator('#hmi-layout-preview-properties [data-hmi-prop="show_title"]').count() !== 1 ||
      await page.locator('#hmi-layout-preview-properties [data-hmi-prop="show_border"]').count() !== 1) {
    throw new Error("All HMI widget types must expose independent title and border visibility options.");
  }
  await mediaInput.setInputFiles({
    name: "plant-diagram.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(mediaSvg),
  });
  await page.evaluate(async () => { await window.__mediaUpload; });
  await mediaCard.locator(".hmi-media-element").waitFor({ state: "visible", timeout: 5000 });
  const importedImage = await mediaCard.locator(".hmi-media-element").evaluate(image => ({
    src: image.getAttribute("src"),
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  if (!importedImage.src?.includes(mediaId) || importedImage.width !== 24 || importedImage.height !== 24) {
    throw new Error("The uploaded SVG was not persisted and rendered in the HMI card: " + JSON.stringify(importedImage));
  }

  // Select the history chart itself before changing its theme.
  await chartCard.locator(".hmi-layout-card-toolbar").click();

  // Apply a per-widget theme and verify it overrides the selected page theme.
  const chartTheme = page.locator('#hmi-layout-preview-properties [data-hmi-prop="theme"]');
  await chartTheme.selectOption("blue");
  const fontFamily = page.locator('#hmi-layout-preview-properties [data-hmi-prop="font_family"]');
  await fontFamily.selectOption("Verdana");
  const numberFontSize = page.locator('#hmi-layout-preview-properties [data-hmi-prop="number_font_size"]');
  await numberFontSize.fill("32");
  const textFontSize = page.locator('#hmi-layout-preview-properties [data-hmi-prop="text_font_size"]');
  await textFontSize.fill("14");
  const lineWidthInput = page.locator('#hmi-layout-preview-properties [data-hmi-prop="line_width"]');
  await lineWidthInput.fill("4");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_color"]').evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, "#ff4c29");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_background_color"]').evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, "#174ea6");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="show_title"]').uncheck();
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="show_border"]').uncheck();
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_smoothing"]').fill("72");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_fill_opacity"]').fill("35");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_surface_intensity"]').fill("88");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_line_glow"]').fill("12");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_grid_opacity"]').fill("30");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_grid_lines"]').fill("5");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_value_color"]').selectOption("white");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_value_font_size"]').fill("24");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_value_decimals"]').fill("2");
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_show_value"]').check();
  await page.locator('#hmi-layout-preview-properties [data-hmi-prop="chart_show_axes"]').check();
  await page.waitForTimeout(50);
  const configuredStrokeWidth = await chartCard.locator(".hmi-chart-svg .hmi-chart-line").getAttribute("stroke-width");
  const chartTypographyStyle = await chartCard.locator(".hmi-widget").getAttribute("style");
  const chartSurfaceSetting = await chartCard.locator(".hmi-widget").getAttribute("data-hmi-chart-surface");
  const frameClasses = await chartCard.locator(".hmi-widget").getAttribute("class");
  const chartTitleDisplay = await chartCard.locator(".hmi-chart-title").evaluate(element => getComputedStyle(element).display);
  const hiddenOuterBorder = await chartCard.evaluate(element => element.classList.contains("hmi-layout-card--border-hidden"));
  const endpoint = chartCard.locator(".hmi-chart-svg .hmi-chart-endpoint-label");
  const endpointFontSize = await endpoint.evaluate(element => getComputedStyle(element).fontSize);
  const endpointColor = await endpoint.evaluate(element => getComputedStyle(element).fill);
  const enabledAxisTicks = await chartCard.locator(".hmi-chart-svg .hmi-chart-y-tick").count();
  const gridLineCount = await chartCard.locator(".hmi-chart-svg .hmi-chart-grid-line").count();
  if (configuredStrokeWidth !== "4" ||
      !chartTypographyStyle?.includes('--hmi-font-family:Verdana, sans-serif') ||
      !chartTypographyStyle.includes("--hmi-number-scale:1.333") ||
      !chartTypographyStyle.includes("--hmi-text-scale:1.167") ||
      !chartTypographyStyle.includes("--hmi-chart-fill-opacity:0.35") ||
      !chartTypographyStyle.includes("--hmi-chart-line:#ff4c29") ||
      !chartTypographyStyle.includes("--hmi-chart-background-color:#174ea6") ||
      !chartTypographyStyle.includes("--hmi-chart-background-rgb:23, 78, 166") ||
      !chartTypographyStyle.includes("--hmi-chart-value-color:#f5fbff") ||
      !chartTypographyStyle.includes("--hmi-chart-value-size:24px") ||
      !chartTypographyStyle.includes("--hmi-chart-grid-opacity:0.30") ||
      !chartTypographyStyle.includes("--hmi-chart-surface-opacity:0.95") ||
      !chartTypographyStyle.includes("--hmi-chart-line-glow:12px") ||
      chartSurfaceSetting !== "midnight" || enabledAxisTicks < 3 ||
      gridLineCount < 3 || endpointFontSize !== "24px" || endpointColor !== "rgb(245, 251, 255)" ||
      !frameClasses.includes("hmi-widget--title-hidden") ||
      !frameClasses.includes("hmi-widget--border-hidden") ||
      chartTitleDisplay !== "none" || !hiddenOuterBorder) {
    throw new Error("Chart appearance and endpoint value controls were not applied live: " +
      JSON.stringify({ configuredStrokeWidth, chartTypographyStyle, chartSurfaceSetting, enabledAxisTicks, gridLineCount, endpointFontSize, endpointColor }));
  }
  
  const pageTheme = await page.locator("#hmi-layout-preview-canvas").getAttribute("data-hmi-page-theme");
  const widgetTheme = await chartCard.locator(".hmi-widget").getAttribute("data-hmi-theme");
  const widgetBackground = await chartCard.locator(".hmi-widget").evaluate(element => getComputedStyle(element).backgroundImage);
  const pageBackground = await page.locator("#hmi-layout-preview-canvas").evaluate(element => getComputedStyle(element).backgroundColor);
  if (pageTheme !== "dark" || widgetTheme !== "blue" ||
      !widgetBackground.includes("linear-gradient") || pageBackground !== "rgb(24, 35, 46)") {
    throw new Error("HMI chart surface/page theme cascade failed: " + JSON.stringify({ pageTheme, widgetTheme, widgetBackground, pageBackground }));
  }
  const designerBackgroundImage = await page.locator("#hmi-layout-preview-canvas").evaluate(element => getComputedStyle(element).backgroundImage);
  if (designerBackgroundImage === "none") {
    throw new Error("The HMI design grid must remain visible while the runtime grid is removed.");
  }

  const card = page.locator("[data-hmi-layout-card]").first();
  const toolbar = card.locator(".hmi-layout-card-toolbar");
  const initial = await card.evaluate(element => ({
    left: Number.parseFloat(element.style.left),
    top: Number.parseFloat(element.style.top),
    width: Number.parseFloat(element.style.width),
    height: Number.parseFloat(element.style.height),
  }));
  const toolbarBox = await toolbar.boundingBox();
  if (!toolbarBox) throw new Error("The HMI card toolbar is not visible.");

  // Exercise native Chromium mouse input: press, move through intermediate
  // coordinates, and release. Assert both actual DOM geometry and JSON state.
  await page.mouse.move(toolbarBox.x + 80, toolbarBox.y + 14);
  await page.mouse.down();
  await page.mouse.move(toolbarBox.x + 170, toolbarBox.y + 79, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  const movedFromToolbar = await card.evaluate(element => ({
    left: Number.parseFloat(element.style.left),
    top: Number.parseFloat(element.style.top),
  }));
  if (movedFromToolbar.left < initial.left + 70 || movedFromToolbar.top < initial.top + 45) {
    throw new Error(`HMI toolbar drag did not move the card enough. Before=${JSON.stringify(initial)} After=${JSON.stringify(movedFromToolbar)} Events=${JSON.stringify(await page.evaluate(() => window.__hmiBrowserEvents))}`);
  }

  // The user must also be able to start a move from the widget body, not only
  // the toolbar. The body uses pointer-events:none in the preview CSS, so this
  // specifically verifies that hit testing reaches the containing card.
  const contentBox = await card.locator(".hmi-layout-card-content").boundingBox();
  if (!contentBox) throw new Error("The HMI card body is not visible.");
  await page.mouse.move(contentBox.x + contentBox.width / 2, contentBox.y + contentBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(contentBox.x + contentBox.width / 2 + 40, contentBox.y + contentBox.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  const moved = await card.evaluate(element => ({
    left: Number.parseFloat(element.style.left),
    top: Number.parseFloat(element.style.top),
  }));
  if (moved.left < movedFromToolbar.left + 30 || moved.top < movedFromToolbar.top + 20) {
    throw new Error(`HMI card-body drag did not move the card. After toolbar=${JSON.stringify(movedFromToolbar)} After body=${JSON.stringify(moved)} Events=${JSON.stringify(await page.evaluate(() => window.__hmiBrowserEvents))}`);
  }

  // Resize from the actual lower-right grip using the same real browser input.
  const grip = card.locator(".hmi-layout-resize");
  const gripBox = await grip.boundingBox();
  if (!gripBox) throw new Error("The HMI resize grip is not visible.");
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2 + 110, gripBox.y + gripBox.height / 2 + 75, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  const resized = await card.evaluate(element => ({
    width: Number.parseFloat(element.style.width),
    height: Number.parseFloat(element.style.height),
  }));
  if (resized.width < initial.width + 85 || resized.height < initial.height + 55) {
    throw new Error(`HMI resize did not change the card dimensions. Before=${JSON.stringify(initial)} After=${JSON.stringify(resized)} Events=${JSON.stringify(await page.evaluate(() => window.__hmiBrowserEvents))}`);
  }

  const saved = await page.locator("#hmi-json-source").inputValue();
  const layout = JSON.parse(saved);
  const valueLayout = layout.find(item => item.type === "value");
  const chartLayout = layout.find(item => item.type === "chart");
  const liveLayout = layout.filter(item => item.type === "chart")[1];
  const mediaLayout = layout.find(item => item.type === "media");
  if (layout.length !== 4 ||
      liveLayout?.history_seconds !== 1 ||
      mediaLayout?.media_id !== mediaId ||
      valueLayout?.x !== moved.left ||
      valueLayout?.y !== moved.top ||
      valueLayout?.width !== resized.width ||
      valueLayout?.height !== resized.height ||
      chartLayout?.theme !== "blue" ||
      chartLayout?.line_width !== 4 ||
      chartLayout?.font_family !== "Verdana" ||
      chartLayout?.number_font_size !== 32 ||
      chartLayout?.text_font_size !== 14 ||
       chartLayout?.chart_color !== "#ff4c29" ||
       chartLayout?.chart_background_color !== "#174ea6" ||
       chartLayout?.show_title !== false ||
       chartLayout?.show_border !== false ||
       chartLayout?.chart_surface !== "midnight" ||
       chartLayout?.chart_smoothing !== 72 ||
       chartLayout?.chart_fill_opacity !== 35 ||
       chartLayout?.chart_show_axes !== true ||
       chartLayout?.chart_show_value !== true ||
       chartLayout?.chart_value_color !== "white" ||
       chartLayout?.chart_value_font_size !== 24 ||
       chartLayout?.chart_value_decimals !== 2 ||
       chartLayout?.chart_surface_intensity !== 88 ||
       chartLayout?.chart_line_glow !== 12 ||
       chartLayout?.chart_grid_opacity !== 30 ||
       chartLayout?.chart_grid_lines !== 5) {
    throw new Error(`HMI JSON did not persist final geometry and per-widget theme. JSON=${saved}`);
  }

  await page.evaluate(() => window.__saveHmiDraft());
  const savedPage = await page.evaluate(() => window.__savedHmiPage);
  if (savedPage?.theme !== "dark" ||
      savedPage?.layout?.find(item => item.type === "chart")?.theme !== "blue" ||
      savedPage?.layout?.find(item => item.type === "chart")?.font_family !== "Verdana" ||
      savedPage?.layout?.find(item => item.type === "chart")?.number_font_size !== 32 ||
      savedPage?.layout?.find(item => item.type === "chart")?.text_font_size !== 14 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_color !== "#ff4c29" ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_background_color !== "#174ea6" ||
      savedPage?.layout?.find(item => item.type === "chart")?.show_title !== false ||
      savedPage?.layout?.find(item => item.type === "chart")?.show_border !== false ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_surface !== "midnight" ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_smoothing !== 72 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_fill_opacity !== 35 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_show_axes !== true ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_show_value !== true ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_value_color !== "white" ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_value_font_size !== 24 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_value_decimals !== 2 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_surface_intensity !== 88 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_line_glow !== 12 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_grid_opacity !== 30 ||
      savedPage?.layout?.find(item => item.type === "chart")?.chart_grid_lines !== 5 ||
      savedPage?.layout?.find(item => item.type === "media")?.media_id !== mediaId) {
    throw new Error("HMI page and widget themes were not included in the saved resource: " + JSON.stringify(savedPage));
  }

  // The saved layout must use the same page and card themes in the actual runtime page.
  const runtimeCanvas = page.locator(".hmi-runtime-grid[data-hmi-page-theme]");
  await runtimeCanvas.waitFor({ state: "visible" });
  const runtimeChart = runtimeCanvas.locator(".hmi-runtime-item").filter({ has: page.locator(".hmi-widget--chart") }).first();
  const runtimePageTheme = await runtimeCanvas.getAttribute("data-hmi-page-theme");
  const runtimeWidgetTheme = await runtimeChart.locator(".hmi-widget").getAttribute("data-hmi-theme");
  const runtimeWidgetBackground = await runtimeChart.locator(".hmi-widget").evaluate(element => getComputedStyle(element).backgroundImage);
  const runtimePageBackground = await runtimeCanvas.evaluate(element => getComputedStyle(element).backgroundColor);
  const runtimeBackgroundImage = await runtimeCanvas.evaluate(element => getComputedStyle(element).backgroundImage);
  const runtimeImage = runtimeCanvas.locator(".hmi-media-element");
  await runtimeImage.waitFor({ state: "visible" });
  const runtimeImageSrc = await runtimeImage.getAttribute("src");
  const runtimeRefresh = await page.evaluate(() => window.__refreshRuntimeLiveValues());
  if (!runtimeRefresh.refreshed || !runtimeRefresh.mediaWidgetPreserved || !runtimeRefresh.mediaElementPreserved) {
    throw new Error("Live runtime telemetry refresh must update data widgets without replacing the imported media element: " + JSON.stringify(runtimeRefresh));
  }
  const runtimeStrokeWidth = await runtimeChart.locator(".hmi-chart-svg .hmi-chart-line").getAttribute("stroke-width");
  const runtimeTypography = await runtimeChart.locator(".hmi-widget").getAttribute("style");
  const runtimeChartSurface = await runtimeChart.locator(".hmi-widget").getAttribute("data-hmi-chart-surface");
  const runtimeChartArea = await runtimeChart.locator(".hmi-chart-svg .hmi-chart-area").count();
  const runtimeFrameClasses = await runtimeChart.locator(".hmi-widget").getAttribute("class");
  const runtimeTitleDisplay = await runtimeChart.locator(".hmi-chart-title").evaluate(element => getComputedStyle(element).display);
  const runtimeChartInlineStyle = await runtimeChart.locator(".hmi-widget").getAttribute("style");
  const runtimeEndpoint = runtimeChart.locator(".hmi-chart-svg .hmi-chart-endpoint-label");
  const runtimeEndpointFontSize = await runtimeEndpoint.evaluate(element => getComputedStyle(element).fontSize);
  const runtimeEndpointColor = await runtimeEndpoint.evaluate(element => getComputedStyle(element).fill);
  if (runtimeStrokeWidth !== "4" ||
      !runtimeTypography?.includes('--hmi-font-family:Verdana, sans-serif') ||
      !runtimeTypography.includes("--hmi-number-scale:1.333") ||
      !runtimeTypography.includes("--hmi-chart-value-size:24px") ||
      runtimeChartSurface !== "midnight" || runtimeChartArea !== 1 ||
      !runtimeFrameClasses.includes("hmi-widget--title-hidden") ||
      !runtimeFrameClasses.includes("hmi-widget--border-hidden") ||
      runtimeTitleDisplay !== "none" ||
      !runtimeChartInlineStyle.includes("--hmi-chart-line:#ff4c29") ||
      !runtimeChartInlineStyle.includes("--hmi-chart-background-color:#174ea6") ||
      runtimeEndpointFontSize !== "24px" || runtimeEndpointColor !== "rgb(245, 251, 255)" ||
      await runtimeChart.locator(".hmi-chart-svg .hmi-chart-y-tick").count() < 3) {
    throw new Error("The saved chart line thickness was not applied in HMI runtime: " + runtimeStrokeWidth);
  }
  if (runtimePageTheme !== "dark" || runtimeWidgetTheme !== "blue" ||
      !runtimeWidgetBackground.includes("linear-gradient") || runtimePageBackground !== "rgb(24, 35, 46)" ||
      runtimeBackgroundImage !== "none" || designerBackgroundImage === "none" ||
      !runtimeImageSrc?.includes(mediaId)) {
    throw new Error("Saved HMI runtime page did not apply the page/widget themes: " + JSON.stringify({
      runtimePageTheme, runtimeWidgetTheme, runtimeWidgetBackground, runtimePageBackground,
    }));
  }

  const editCardLayout = await page.evaluate(() => window.__hmiEditCardLayout);
  const expectedEditLayout = layout.map(item => ({
    widgetId: item.widget_id, left: item.x, top: item.y, width: item.width, height: item.height,
  }));
  if (!editCardLayout || editCardLayout.length !== expectedEditLayout.length ||
      expectedEditLayout.some(expected => {
        const actual = editCardLayout.find(item => item.widgetId === expected.widgetId);
        return !actual || actual.left !== expected.left || actual.top !== expected.top ||
          actual.width !== expected.width || actual.height !== expected.height;
      })) {
    throw new Error("HMI edit screen must preserve saved freeform geometry: " +
      JSON.stringify({ expectedEditLayout, editCardLayout }));
  }
  const regularEdit = await page.evaluate(() => window.__renderHmiEditForMediaUpload());
  const regularMediaInput = page.locator("#hmi-designer-properties [data-hmi-media-input]");
  if (!regularEdit.visible || !(await regularMediaInput.isVisible())) {
    throw new Error("Normal HMI edit properties must expose a visible media file field.");
  }
  await regularMediaInput.setInputFiles({
    name: "plant-diagram-edit.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(mediaSvg),
  });
  await page.evaluate(async () => { await window.__mediaUpload; });
  const uploadedEditName = await page.locator("#hmi-designer-properties .hmi-media-current-file").textContent();
  if (!uploadedEditName?.includes("plant-diagram-edit.svg") || mediaUploadCount !== 2) {
    throw new Error("Media upload from normal HMI edit properties failed or the second upload request was not sent: " +
      JSON.stringify({ uploadedEditName, mediaUploadCount }));
  }
  await page.evaluate(() => window.__returnToHmiRuntime());

  // Regression: every chart, indicator and machine schematic must fit inside
  // the exact card size selected by the operator, in both narrow and short cards.
  const fitReport = await page.evaluate(() => {
    const types = window.__hmiFitWidgetTypes || [];
    const sizes = [
      { width: 200, height: 130 },
      { width: 260, height: 160 },
      { width: 480, height: 150 },
      { width: 180, height: 260 },
    ];
    const stage = document.createElement("div");
    stage.id = "hmi-fit-regression-stage";
    stage.style.cssText = "position:fixed;left:0;top:0;z-index:-1;opacity:0.01;pointer-events:none;display:flex;flex-wrap:wrap;align-items:flex-start;gap:4px;";
    document.body.appendChild(stage);
    const cases = [];
    for (const size of sizes) {
      for (const type of types) {
        const wrapper = document.createElement("div");
        wrapper.className = "hmi-runtime-item hmi-fit-regression-item";
        wrapper.dataset.widgetType = type;
        wrapper.dataset.testWidth = String(size.width);
        wrapper.dataset.testHeight = String(size.height);
        wrapper.style.cssText = "position:relative;display:block;flex:none;width:" + size.width +
          "px;height:" + size.height + "px;overflow:hidden;";
        wrapper.innerHTML = window.__renderHmiFitWidget(type);
        stage.appendChild(wrapper);
        cases.push({ type, width: size.width, height: size.height, wrapper });
      }
    }
    const issues = [];
    for (const item of cases) {
      const root = item.wrapper.querySelector(".hmi-widget");
      const header = root && root.querySelector(".hmi-widget-header");
      const body = root && root.querySelector(".hmi-widget-body");
      if (!root || !header || !body) {
        issues.push({ type: item.type, size: item.width + "x" + item.height, reason: "missing widget/header/body" });
        continue;
      }
      const bounds = element => {
        const r = element.getBoundingClientRect();
        return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
      };
      const wrapperRect = bounds(item.wrapper);
      const rootRect = bounds(root);
      const bodyRect = bounds(body);
      if (item.type === "chart") {
        const svg = root.querySelector(".hmi-chart-svg");
        const title = root.querySelector(".hmi-chart-title");
        const matrix = svg?.getScreenCTM();
        const titleFontSize = title ? getComputedStyle(title).fontSize : "";
        if (svg?.getAttribute("preserveAspectRatio") !== "xMidYMid meet" ||
            !matrix || Math.abs(Math.abs(matrix.a) - Math.abs(matrix.d)) > .001 ||
            titleFontSize !== "13px") {
          issues.push({
            type:item.type, size:item.width + "x" + item.height,
            reason:"trend geometry and title typography must not stretch with card aspect ratio",
            preserveAspectRatio:svg?.getAttribute("preserveAspectRatio"),
            matrix:matrix ? [matrix.a,matrix.d] : null, titleFontSize,
          });
        }
      }
      const tolerance = 1.5;
      if (rootRect.width > wrapperRect.width + tolerance || rootRect.height > wrapperRect.height + tolerance ||
          rootRect.left < wrapperRect.left - tolerance || rootRect.top < wrapperRect.top - tolerance) {
        issues.push({ type:item.type, size:item.width + "x" + item.height, reason:"widget root exceeds its assigned card", wrapper:wrapperRect, root:rootRect });
      }
      if (bodyRect.bottom > rootRect.bottom + tolerance || bodyRect.right > rootRect.right + tolerance ||
          bodyRect.top < rootRect.top - tolerance || bodyRect.left < rootRect.left - tolerance) {
        issues.push({ type:item.type, size:item.width + "x" + item.height, reason:"widget body exceeds widget bounds", root:rootRect, body:bodyRect });
      }
      const visibleParts = body.querySelectorAll(
        ".hmi-chart-svg,.hmi-chart-empty,.hmi-gauge-svg,.hmi-dial-svg,.hmi-thermometer-layout," +
        ".hmi-machine-svg,.hmi-tank-svg,.hmi-valve-graphic svg,.hmi-media-frame,.hmi-value-number," +
        ".hmi-value-meta,.hmi-chart-live-label,.hmi-machine-footer,.hmi-status-display,.hmi-indicator-light," +
        ".hmi-media-empty,button"
      );
      for (const part of visibleParts) {
        const r = bounds(part);
        if (!r.width || !r.height) continue;
        if (r.left < bodyRect.left - tolerance || r.top < bodyRect.top - tolerance ||
            r.right > bodyRect.right + tolerance || r.bottom > bodyRect.bottom + tolerance) {
          issues.push({ type:item.type, size:item.width + "x" + item.height, reason:"visual part is clipped by widget body", part:part.className?.baseVal || part.className || part.tagName, body:bodyRect, partBounds:r });
          break;
        }
      }
      if (body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1) {
        issues.push({ type:item.type, size:item.width + "x" + item.height, reason:"widget body has overflowing content", scroll:[body.scrollWidth,body.scrollHeight], client:[body.clientWidth,body.clientHeight] });
      }
    }
    stage.remove();
    return { total: cases.length, issues };
  });
  if (fitReport.issues.length) {
    throw new Error("HMI responsive-fit regression failed: " + JSON.stringify(fitReport.issues.slice(0, 20)));
  }

  if (pageErrors.length) throw new Error("Browser console errors: " + pageErrors.join("\\n"));

  console.log("HMI Chromium E2E passed: unrestricted hex chart colors, no-stretch SVG, fixed typography, per-card title/border visibility, live/history, media upload, drag/resize and responsive fit.");
  console.log(JSON.stringify({
    initial, moved, resized, pageTheme, widgetTheme, widgetBackground, pageBackground,
    livePointCount, importedImage, runtimePageTheme, runtimeWidgetTheme,
    runtimeWidgetBackground, runtimePageBackground, runtimeBackgroundImage,
    designerBackgroundImage, runtimeImageSrc, runtimeRefresh, historyRequests,
    browserEvents: await page.evaluate(() => window.__hmiBrowserEvents.length), fitReport,
  }));
} catch (error) {
  if (page) {
    try { await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }); } catch { /* Keep the original failure. */ }
    try {
      const diagnostics = await page.evaluate(() => ({
        events: window.__hmiBrowserEvents || [],
        card: document.querySelector("[data-hmi-layout-card]")?.getAttribute("style") || null,
        json: document.getElementById("hmi-json-source")?.value || null,
      }));
      console.error("HMI browser diagnostics:", JSON.stringify(diagnostics));
    } catch { /* The page may have failed before the fixture loaded. */ }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
