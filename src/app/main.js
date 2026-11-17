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
      const snapshot = await store.loadAfterLogin();
      sessionStorage.setItem("scada-demo-auth", "1");
      location.hash = "/bi/dashboard";
      syncLiveConnection();
      if (snapshot.user?.must_change_password) {
        await handleAction("change-password", null);
        showToast("برای ادامه، رمز موقت خود را تغییر دهید.", "warning");
      } else {
        showToast("ورود به سامانه با موفقیت انجام شد.");
      }
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
  if (path === "/live/trends" && store.isConnected()) {
    const configuredTrend = store.list("trends").find(item => item.id === store.trendId()) || store.list("trends")[0];
    const configuredNames = String(configuredTrend?.tags || "").split(/[،,]/).map(name => name.trim()).filter(Boolean);
    const sourceTag = store.list("tags").find(tag =>
      configuredNames.includes(tag.name) && tag.access === "read" &&
      ["float32","int16","uint16","int32","uint32"].includes(tag.type)
    );
    if (sourceTag) {
      api.telemetryHistory(sourceTag.id, store.trendHours())
        .then(result => store.replaceCollection("trendHistory", result.items || []))
        .catch(error => console.error("Trend history load failed", error));
    } else {
      store.replaceCollection("trendHistory", []);
    }
  } else if (path !== "/live/trends") {
    store.replaceCollection("trendHistory", []);
  }
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
      const samples = new Map(message.items.map(item => [item.tag_id, item]));
      const next = current.map(tag => {
        const sample = samples.get(tag.id);
        return sample ? {
          ...tag,
          value: sample.value,
          quality: sample.quality,
          source: sample.source,
          sampled_at: sample.sampled_at,
        } : tag;
      });
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
      if (store.currentUser()?.must_change_password) {
        await handleAction("change-password", null);
      }
    } catch {
      sessionStorage.removeItem("scada-demo-auth");
      try { await api.logout(); } catch { /* The API may be offline. */ }
    }
  }
  render();
}

initialize();
