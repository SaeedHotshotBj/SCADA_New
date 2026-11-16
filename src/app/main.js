import { currentPath, renderRoute } from "./router.js";
import { handleAction, handleSubmit, showToast } from "./actions.js";
import { bindShellEvents } from "../layouts/shell.js";
import { api } from "../services/api-client.js";
import { store } from "../services/demo-store.js";

const root = document.getElementById("app");
let renderQueued = false;
let liveSocket = null;

function render() {
  root.innerHTML = renderRoute(currentPath());
  bindShellEvents();
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

window.addEventListener("hashchange", () => { render(); syncLiveConnection(); });
window.addEventListener("scada:state-changed", scheduleRender);

document.addEventListener("click", event => {
  const routeLink = event.target.closest("a[href^='#/']");
  if (routeLink) return;
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  if (action === "toggle-password") {
    const input = actionElement.parentElement.querySelector("input");
    if (input) input.type = input.type === "password" ? "text" : "password";
    return;
  }
  if (action === "toggle-sidebar") {
    document.body.classList.toggle("sidebar-collapsed");
    return;
  }
  if (action === "toggle-nav-group") return;
  Promise.resolve(handleAction(action, actionElement)).catch(error => {
    console.error(error);
    showToast(error.message || "عملیات انجام نشد.", "error");
  });
});

document.addEventListener("submit", async event => {
  if (event.target.id === "login-form") {
    event.preventDefault();
    const form = event.target;
    const credentials = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await api.login(credentials);
      await store.loadAfterLogin();
      sessionStorage.setItem("scada-demo-auth", "1");
      location.hash = "/bi/dashboard";
      syncLiveConnection();\n      showToast("ورود به سامانه با موفقیت انجام شد.");
    } catch (error) {
      showToast(error.message || "ورود ناموفق بود.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  try {
    await handleSubmit(event);
  } catch (error) {
    console.error(error);
    showToast(error.message || "ذخیره اطلاعات انجام نشد.", "error");
  }
});

function syncLiveConnection() {
  const path = currentPath();
  const needsLive = path === "/live/data" || path === "/live/trends";
  if (!needsLive) {
    if (liveSocket) { liveSocket.close(); liveSocket = null; }
    return;
  }
  if (!store.isConnected() || liveSocket) return;
  const socketUrl = api.base.replace(/^http/, "ws") + "/api/telemetry/ws/live";
  liveSocket = new WebSocket(socketUrl);
  liveSocket.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (message.type !== "telemetry.snapshot") return;
      const current = store.list("tags");
      const values = new Map(message.items.map(item => [item.tag_id, item.value]));
      const next = current.map(tag => values.has(tag.id) ? { ...tag, value: values.get(tag.id) } : tag);
      store.replaceCollection("tags", next);
    } catch (error) {
      console.error("Invalid telemetry message", error);
    }
  };
  liveSocket.onclose = () => { liveSocket = null; };
  liveSocket.onerror = () => { liveSocket?.close(); };
}

async function initialize() {
  if (sessionStorage.getItem("scada-demo-auth") === "1") {
    try {
      await store.initialize();
    } catch {
      sessionStorage.removeItem("scada-demo-auth");
      try { await api.logout(); } catch { /* The API may be offline. */ }
    }
  }
  render();
}

initialize();
