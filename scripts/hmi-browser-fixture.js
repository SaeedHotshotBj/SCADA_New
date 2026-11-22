import { store } from "../src/services/demo-store.js";
import {
  renderHmiDesigner,
  handleHmiDesignerAction,
  handleHmiDesignerInput,
  handleHmiDesignerSubmit,
  refreshHmiDesignerLivePreview,
} from "../src/features/live/hmi-designer.js";
import { bindHmiDesignerGestureEvents } from "../src/features/live/hmi-designer-events.js";

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
  form.querySelector('[data-hmi-page-field="description"]').value = "Theme and trend browser regression";
  store.add = async (collection, payload) => {
    window.__savedHmiPage = { collection, ...payload };
    return { ...payload, id: "saved-hmi-test" };
  };
  return handleHmiDesignerSubmit(form);
};

window.__hmiBrowserReady = true;
