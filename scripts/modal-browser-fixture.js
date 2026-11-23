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
await window.__openTestModal("new-user");
window.__modalBrowserReady = true;
