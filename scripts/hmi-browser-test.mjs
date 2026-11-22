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

  await page.goto(`${baseUrl}/scripts/hmi-browser-fixture.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__hmiBrowserReady === true);
  await page.locator(".hmi-layout-preview-backdrop").waitFor({ state: "visible" });

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

  const moved = await card.evaluate(element => ({
    left: Number.parseFloat(element.style.left),
    top: Number.parseFloat(element.style.top),
  }));
  if (moved.left < initial.left + 70 || moved.top < initial.top + 45) {
    throw new Error(`HMI drag did not move the card enough. Before=${JSON.stringify(initial)} After=${JSON.stringify(moved)} Events=${JSON.stringify(await page.evaluate(() => window.__hmiBrowserEvents))}`);
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
  if (layout.length !== 1 ||
      layout[0].x !== moved.left ||
      layout[0].y !== moved.top ||
      layout[0].width !== resized.width ||
      layout[0].height !== resized.height) {
    throw new Error(`HMI JSON did not persist the final drag/resize geometry. JSON=${saved}`);
  }
  if (pageErrors.length) throw new Error("Browser console errors: " + pageErrors.join("\n"));

  console.log("HMI Chromium E2E passed: mouse drag moved the card, lower-right resize changed width/height, and JSON matched the resulting geometry.");
  console.log(JSON.stringify({ initial, moved, resized, browserEvents: await page.evaluate(() => window.__hmiBrowserEvents.length) }));
} catch (error) {
  if (page) {
    try { await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }); } catch { /* Keep the original failure. */ }
    try {
      const diagnostics = await page.evaluate(() => ({
        events: window.__hmiBrowserEvents || [],
        card: document.querySelector("[data-hmi-layout-card")?.getAttribute("style") || null,
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
