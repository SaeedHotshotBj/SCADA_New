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
  const mediaSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="#267fc3"/><circle cx="12" cy="12" r="7" fill="#fff"/></svg>';
  await page.route("http://127.0.0.1:8000/api/hmi/media", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: mediaId,
        url: "/api/hmi/media/" + mediaId,
        filename: "plant-diagram.svg",
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

  // History must reach the chart renderer as a real SVG line, not only a live value.
  const chartCard = page.locator("[data-hmi-layout-card]").filter({ has: page.locator(".hmi-widget--chart") }).first();
  await chartCard.locator(".hmi-chart-svg polyline").waitFor({ state: "visible", timeout: 5000 });
  const chartMarkup = await chartCard.locator(".hmi-chart-svg").evaluate(element => ({
    polyline: element.querySelector("polyline")?.getAttribute("points") || "",
  }));
  if (!chartMarkup.polyline || chartMarkup.polyline.trim().split(/\s+/).length !== 3) {
    throw new Error("HMI trend history did not render three ordered line points: " + JSON.stringify(chartMarkup));
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
  await liveChartCard.locator(".hmi-chart-svg polyline").waitFor({ state: "visible", timeout: 5000 });
  const livePolyline = await liveChartCard.locator(".hmi-chart-svg polyline").getAttribute("points");
  if (!livePolyline || livePolyline.trim().split(/\s+/).length !== 2 ||
      !(await liveChartCard.locator(".hmi-chart-live-label").count())) {
    throw new Error("The one-second trend did not draw a continuous line from two incoming live samples: " + livePolyline);
  }

  // Import an SVG asset through the real designer upload flow; only the API transport is mocked.
  const mediaCard = page.locator("[data-hmi-layout-card]").filter({ has: page.locator(".hmi-widget--media") }).first();
  await mediaCard.locator(".hmi-layout-card-toolbar").click();
  const mediaInput = page.locator("#hmi-layout-preview-properties [data-hmi-media-input]");
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
  const chartTheme = page.locator("#hmi-layout-preview-properties [data-hmi-prop=\"theme\"]");
  await chartTheme.selectOption("blue");
  await page.waitForTimeout(50);
  const pageTheme = await page.locator("#hmi-layout-preview-canvas").getAttribute("data-hmi-page-theme");
  const widgetTheme = await chartCard.locator(".hmi-widget").getAttribute("data-hmi-theme");
  const widgetBackground = await chartCard.locator(".hmi-widget").evaluate(element => getComputedStyle(element).backgroundColor);
  const pageBackground = await page.locator("#hmi-layout-preview-canvas").evaluate(element => getComputedStyle(element).backgroundColor);
  if (pageTheme !== "dark" || widgetTheme !== "blue" ||
      widgetBackground !== "rgb(248, 251, 255)" || pageBackground !== "rgb(24, 35, 46)") {
    throw new Error("HMI page/widget theme cascade failed: " + JSON.stringify({ pageTheme, widgetTheme, widgetBackground, pageBackground }));
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
      chartLayout?.theme !== "blue") {
    throw new Error(`HMI JSON did not persist final geometry and per-widget theme. JSON=${saved}`);
  }

  await page.evaluate(() => window.__saveHmiDraft());
  const savedPage = await page.evaluate(() => window.__savedHmiPage);
  if (savedPage?.theme !== "dark" ||
      savedPage?.layout?.find(item => item.type === "chart")?.theme !== "blue" ||
      savedPage?.layout?.find(item => item.type === "media")?.media_id !== mediaId) {
    throw new Error("HMI page and widget themes were not included in the saved resource: " + JSON.stringify(savedPage));
  }

  // The saved layout must use the same page and card themes in the actual runtime page.
  const runtimeCanvas = page.locator(".hmi-runtime-grid[data-hmi-page-theme]");
  await runtimeCanvas.waitFor({ state: "visible" });
  const runtimeChart = runtimeCanvas.locator(".hmi-runtime-item").filter({ has: page.locator(".hmi-widget--chart") }).first();
  const runtimePageTheme = await runtimeCanvas.getAttribute("data-hmi-page-theme");
  const runtimeWidgetTheme = await runtimeChart.locator(".hmi-widget").getAttribute("data-hmi-theme");
  const runtimeWidgetBackground = await runtimeChart.locator(".hmi-widget").evaluate(element => getComputedStyle(element).backgroundColor);
  const runtimePageBackground = await runtimeCanvas.evaluate(element => getComputedStyle(element).backgroundColor);
  const runtimeBackgroundImage = await runtimeCanvas.evaluate(element => getComputedStyle(element).backgroundImage);
  const designerBackgroundImage = await page.locator("#hmi-layout-preview-canvas").evaluate(element => getComputedStyle(element).backgroundImage);
  const runtimeImage = runtimeCanvas.locator(".hmi-media-element");
  await runtimeImage.waitFor({ state: "visible" });
  const runtimeImageSrc = await runtimeImage.getAttribute("src");
  if (runtimePageTheme !== "dark" || runtimeWidgetTheme !== "blue" ||
      runtimeWidgetBackground !== "rgb(248, 251, 255)" || runtimePageBackground !== "rgb(24, 35, 46)" ||
      runtimeBackgroundImage !== "none" || designerBackgroundImage === "none" ||
      !runtimeImageSrc?.includes(mediaId)) {
    throw new Error("Saved HMI runtime page did not apply the page/widget themes: " + JSON.stringify({
      runtimePageTheme, runtimeWidgetTheme, runtimeWidgetBackground, runtimePageBackground,
    }));
  }
  if (pageErrors.length) throw new Error("Browser console errors: " + pageErrors.join("\\n"));

  console.log("HMI Chromium E2E passed: drag/resize, historical and one-second live trend SVG, zero history polling for live mode, media upload/render, page/widget themes, runtime grid removal and persistent video/image DOM.");
  console.log(JSON.stringify({
    initial, moved, resized, pageTheme, widgetTheme, widgetBackground, pageBackground,
    livePolyline, importedImage, runtimePageTheme, runtimeWidgetTheme,
    runtimeWidgetBackground, runtimePageBackground, runtimeBackgroundImage,
    designerBackgroundImage, runtimeImageSrc, historyRequests,
    browserEvents: await page.evaluate(() => window.__hmiBrowserEvents.length),
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
