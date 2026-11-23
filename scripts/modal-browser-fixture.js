import { handleAction } from "../src/app/actions.js";
import { resolveActionElementFromClick } from "../src/app/action-events.js";

document.addEventListener("click", event => {
  const actionElement = resolveActionElementFromClick(event.target);
  if (!actionElement) return;
  Promise.resolve(handleAction(actionElement.dataset.action, actionElement)).catch(error => {
    window.__modalBrowserError = error?.stack || error?.message || String(error);
  });
});

window.__openTestModal = action => handleAction(action || "new-user", null);

// Add a realistic action-marked wrapper around a field. A click on that field
// must not inherit the wrapper's close action.
window.__wrapModalFieldWithAction = name => {
  const field = [...document.querySelectorAll("#modal-root [name]")].find(node => node.name === name);
  if (!field || field.dataset.actionWrapperTest === "1") return false;
  const wrapper = document.createElement("div");
  wrapper.dataset.action = "close-modal";
  field.dataset.actionWrapperTest = "1";
  field.parentNode.insertBefore(wrapper, field);
  wrapper.append(field);
  return true;
};

await window.__openTestModal("new-user");
window.__modalBrowserReady = true;
