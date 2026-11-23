import { store } from "../src/services/demo-store.js";

// Run the real application entry point and its real delegated click handler,
// with deterministic in-memory resources and no backend/PLC connection.
sessionStorage.setItem("scada-demo-auth", "1");
location.hash = "#/equipment/tags";

store.replaceCollection("plcs", [{
  id: "plc-modal-test",
  name: "PLC آزمایشی پنجره",
  protocol: "simulator",
  address: "127.0.0.1:1502",
  unit: "1",
}]);
store.replaceCollection("tags", [{
  id: "tag-modal-test",
  name: "TEST.ADDRESS",
  plc: "plc-modal-test",
  type: "uint16",
  address: "40001",
  access: "read",
  unit: "rpm",
}]);

// Keep startup deterministic. The application still renders the real route,
// opens the real edit dialog, and processes clicks through src/app/main.js.
store.initialize = async () => true;
store.isConnected = () => false;
store.currentUser = () => ({ name: "Browser Regression", role: "Engineer" });

await import("../src/app/main.js");
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.__modalBrowserReady = Boolean(
  document.querySelector('#app [data-collection-name="tags"] [data-action="edit-record"]')
);
if (!window.__modalBrowserReady) {
  window.__modalBrowserError = "The real equipment/tags page did not render.";
}
