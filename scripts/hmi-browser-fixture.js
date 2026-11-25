import { store } from "../src/services/demo-store.js";
import {
  renderHmiDesigner,
  handleHmiDesignerAction,
  handleHmiDesignerInput,
  handleHmiDesignerSubmit,
  refreshHmiDesignerLivePreview,
  recordHmiDesignerLiveChartData,
  handleHmiDesignerMediaUpload,
  closeHmiDesignerPreview,
} from "../src/features/live/hmi-designer.js";
import { bindHmiDesignerGestureEvents } from "../src/features/live/hmi-designer-events.js";
import { renderLive, refreshHmiRuntimeLiveValues } from "../src/features/live/index.js";
import { renderHmiWidget } from "../src/features/live/hmi-widgets.js";

// Use the real HMI designer module and real application stylesheet. Only the
// authenticated history endpoint and the final resource save are isolated.
store.replaceCollection("machines", [{ id: "machine-test", name: "Machine Test" }]);
store.replaceCollection("tags", [{
  id: "tag-test",
  name: "Test.Numeric",
  type: "float32",
  access: "read",
  unit: "A",
  value: 12.5,
  quality: "DEMO",
  sampled_at: new Date().toISOString(),
}]);
store.replaceCollection("hmiPages", []);
store.isConnected = () => true;

// Render every HMI widget type through the production renderer for resize-fit regression tests.

const fitTags = [
  ...store.list("tags"),
  {
    id: "tag-run", name: "Test.Run", type: "bool", access: "read_write",
    value: true, quality: "GOOD", sampled_at: new Date().toISOString(),
  },
];
window.__hmiFitWidgetTypes = [
  "value", "status", "indicator", "gauge", "needle", "thermometer",
  "chart", "motor", "pump", "fan", "conveyor", "tank", "valve", "write", "media",
];
window.__renderHmiFitWidget = type => {
  const components = {
    value: { type, label: "Value", tag_id: "tag-test" },
    status: { type, label: "Status", tag_id: "tag-run" },
    indicator: { type, label: "Indicator", tag_id: "tag-run" },
    gauge: { type, label: "Gauge", tag_id: "tag-test", min: 0, max: 100 },
    needle: { type, label: "Needle", tag_id: "tag-test", min: 0, max: 100 },
    thermometer: { type, label: "Thermometer", tag_id: "tag-test", min: 0, max: 100 },
    chart: { type, label: "Trend", tag_id: "tag-test", history_seconds: 60, chart_kind: "line" },
    motor: { type, label: "Motor", run_tag_id: "tag-run" },
    pump: { type, label: "Pump", run_tag_id: "tag-run" },
    fan: { type, label: "Fan", run_tag_id: "tag-run" },
    conveyor: { type, label: "Conveyor", run_tag_id: "tag-run" },
    tank: { type, label: "Tank", level_tag_id: "tag-test", min: 0, max: 100 },
    valve: { type, label: "Valve", open_tag_id: "tag-run" },
    write: { type, label: "Write", tag_id: "tag-run" },
    media: { type, label: "Media", media_id: "c".repeat(32), media_type: "image", media_fit: "contain" },
  };
  const history = type === "chart" ? [
    { value: 11, sampled_at: new Date(Date.now() - 2000).toISOString() },
    { value: 28, sampled_at: new Date(Date.now() - 1000).toISOString() },
    { value: 19, sampled_at: new Date().toISOString() },
  ] : [];
  return renderHmiWidget(components[type], fitTags, {
    history,
    historyState: { status: "ready", sampleCount: history.length },
    mediaBase: "http://127.0.0.1:8000",
    active: true,
  });
};


document.getElementById("app").innerHTML = renderHmiDesigner();

window.__hmiBrowserEvents = [];
function record(type, event, handled) {
  window.__hmiBrowserEvents.push({
    type,
    handled: Boolean(handled),
    target: event?.target?.className?.baseVal || event?.target?.className || event?.target?.tagName || "",
    x: event?.clientX ?? null,
    y: event?.clientY ?? null,
  });
}

document.addEventListener("click", event => {
  const actionElement = event.target?.closest?.("[data-action]");
  if (!actionElement) return;
  const handled = handleHmiDesignerAction(actionElement.dataset.action, actionElement);
  record("click:" + actionElement.dataset.action, event, handled);
});

for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel", "mousedown", "mousemove", "mouseup"]) {
  document.addEventListener(eventName, event => record(eventName, event), true);
}
bindHmiDesignerGestureEvents(document);

document.addEventListener("input", handleHmiDesignerInput);
document.addEventListener("change", event => {
  if (event.target.matches(".hmi-designer-page [data-hmi-media-input]")) {
    window.__mediaUpload = handleHmiDesignerMediaUpload(event.target);
    return;
  }
  if (event.target.matches(".hmi-designer-page select")) handleHmiDesignerInput(event);
});
window.addEventListener("scada:hmi-chart-updated", refreshHmiDesignerLivePreview);

function chooseWidgetTag() {
  const tagSelect = document.querySelector('#hmi-designer-properties [data-hmi-prop="tag_id"]');
  if (!tagSelect) throw new Error("The widget tag selector was not rendered.");
  tagSelect.value = "tag-test";
  tagSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

// Add a value widget for move/resize coverage and a chart widget for the
// history-loading/rendering test. Both use the same selected numeric tag.
document.querySelector('[data-action="hmi-add-widget"][data-widget-type="value"]')?.click();
chooseWidgetTag();
document.querySelector('[data-action="hmi-add-widget"][data-widget-type="chart"]')?.click();
chooseWidgetTag();

document.querySelector('[data-action="hmi-add-widget"][data-widget-type="chart"]')?.click();
chooseWidgetTag();
const liveRange = document.querySelector('#hmi-designer-properties [data-hmi-prop="history_seconds"]');
if (!liveRange) throw new Error("The one-second chart range selector was not rendered.");
liveRange.value = "1";
liveRange.dispatchEvent(new Event("change", { bubbles: true }));

document.querySelector('[data-action="hmi-add-widget"][data-widget-type="media"]')?.click();
window.__feedHmiLive = sample => recordHmiDesignerLiveChartData([sample]);

const pageTheme = document.querySelector('[data-hmi-page-field="theme"]');
pageTheme.value = "dark";
pageTheme.dispatchEvent(new Event("change", { bubbles: true }));

document.querySelector('[data-action="hmi-open-layout-preview"]')?.click();
window.__hmiChartLoad = import("../src/features/live/hmi-designer.js")
  .then(module => module.loadHmiDesignerChartData());

window.__saveHmiDraft = async () => {
  const form = document.getElementById("hmi-designer-form");
  form.querySelector('[data-hmi-page-field="name"]').value = "Browser test HMI";
  form.querySelector('[data-hmi-page-field="machine"]').value = "Machine Test";
  form.querySelector('[data-hmi-page-field="status"]').value = "فعال";
  form.querySelector('[data-hmi-page-field="description"]').value = "Live trend, theme and imported media browser regression";
  store.add = async (collection, payload) => {
    window.__savedHmiPage = { collection, ...payload };
    return { ...payload, id: "saved-hmi-test" };
  };
  const saved = await handleHmiDesignerSubmit(form);
  const runtimePage = { id: saved.id, ...window.__savedHmiPage };
  store.replaceCollection("hmiPages", [runtimePage]);
  closeHmiDesignerPreview();
  document.getElementById("app").innerHTML = renderLive("/live/hmi-designer/" + runtimePage.id);
  window.__hmiEditCardLayout = [...document.querySelectorAll("#hmi-designer-canvas .hmi-designer-item")].map(card => ({
    widgetId: card.dataset.widgetId,
    left: Number.parseFloat(card.style.left),
    top: Number.parseFloat(card.style.top),
    width: Number.parseFloat(card.style.width),
    height: Number.parseFloat(card.style.height),
  }));
  window.__renderHmiEditForMediaUpload = () => {
    document.getElementById("app").innerHTML = renderLive("/live/hmi-designer/" + runtimePage.id);
    const mediaCard = [...document.querySelectorAll("#hmi-designer-canvas .hmi-designer-item")]
      .find(card => card.querySelector(".hmi-widget--media"));
    if (!mediaCard) throw new Error("Saved media card is missing from the regular HMI edit screen.");
    mediaCard.click();
    const input = document.querySelector("#hmi-designer-properties [data-hmi-media-input]");
    const widgetVisuals = [...document.querySelectorAll("#hmi-designer-canvas .hmi-designer-item")].map(card => {
      const widget = card.querySelector(".hmi-designer-item-content > .hmi-widget");
      const style = getComputedStyle(widget);
      const rect = widget.getBoundingClientRect();
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        fontFamily: style.fontFamily,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        headerDisplay: getComputedStyle(widget.querySelector(".hmi-widget-header")).display,
        bodyPadding: getComputedStyle(widget.querySelector(".hmi-widget-body")).padding,
      };
    });
    return {
      visible: Boolean(input && input.getClientRects().length),
      widgetId: mediaCard.dataset.widgetId,
      widgetVisuals,
    };
  };
  window.__returnToHmiRuntime = () => {
    document.getElementById("app").innerHTML = renderLive("/live/hmi/" + runtimePage.id);
  };
  document.getElementById("app").innerHTML = renderLive("/live/hmi/" + runtimePage.id);
  window.__refreshRuntimeLiveValues = () => {
    const previousWidget = document.querySelector(".hmi-runtime-grid .hmi-widget--media");
    const previousMedia = previousWidget?.querySelector(".hmi-media-element");
    const nextTags = store.list("tags").map(tag => ({
      ...tag, value: Number(tag.value) + 1,
      sampled_at: new Date().toISOString(),
    }));
    store.replaceCollection("tags", nextTags);
    const refreshed = refreshHmiRuntimeLiveValues(runtimePage.id);
    return {
      refreshed,
      mediaWidgetPreserved: previousWidget === document.querySelector(".hmi-runtime-grid .hmi-widget--media"),
      mediaElementPreserved: previousMedia === document.querySelector(".hmi-runtime-grid .hmi-media-element"),
    };
  };
  return saved;
};

window.__hmiBrowserReady = true;
