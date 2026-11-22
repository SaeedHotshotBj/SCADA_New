import { store } from "../src/services/demo-store.js";
import {
  renderHmiDesigner,
  handleHmiDesignerAction,
  handleHmiDesignerInput,
} from "../src/features/live/hmi-designer.js";
import { bindHmiDesignerGestureEvents } from "../src/features/live/hmi-designer-events.js";

// Use the real HMI designer module and real application stylesheet, but keep
// the browser test independent of authentication and the running API server.
store.replaceCollection("machines", [{ id: "machine-test", name: "Machine Test" }]);
store.replaceCollection("tags", [{
  id: "tag-test",
  name: "Test.Numeric",
  type: "float32",
  access: "read",
  unit: "A",
  value: 12.5,
  quality: "DEMO",
}]);
store.replaceCollection("hmiPages", []);

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

// Add one real library widget and open the same floating preview the operator uses.
document.querySelector('[data-action="hmi-add-widget"][data-widget-type="value"]')?.click();
document.querySelector('[data-action="hmi-open-layout-preview"]')?.click();
window.__hmiBrowserReady = true;
