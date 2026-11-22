import { currentPath, renderRoute } from "./router.js";
import { handleAction, handleSubmit, showToast } from "./actions.js";
import { bindShellEvents } from "../layouts/shell.js";
import { api } from "../services/api-client.js";
import { store } from "../services/demo-store.js";
import {
  handleHmiDesignerInput,
  loadHmiPageChartData,
  loadHmiDesignerChartData,
  refreshHmiDesignerLivePreview,
  handleHmiDesignerPointerDown,
  handleHmiDesignerPointerMove,
  handleHmiDesignerPointerUp,
  closeHmiDesignerPreview,
  getHmiDesignerChartRefreshIntervalMs,
  getHmiPageChartRefreshIntervalMs,
} from "../features/live/hmi-designer.js";

const root = document.getElementById("app");
let renderQueued = false;
let liveSocket = null;
let loadedHmiChartPageId = null;
let hmiChartRefreshTimer = null;
let hmiChartRefreshTimerInterval = null;
let hmiChartRefreshInFlight = false;
let loadedHmiDesignerChartPath = null;
let hmiDesignerChartRefreshTimer = null;
let hmiDesignerChartRefreshTimerInterval = null;
let hmiDesignerChartRefreshInFlight = false;

function render() {
  const path = currentPath();
  try {
    root.innerHTML = renderRoute(path);
    bindShellEvents();
  } catch (error) {
    console.error("SCADA page render failed:", path, error);
    root.innerHTML = "";
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.style.cssText = "margin:24px;padding:20px;border:1px solid #d65a62;border-radius:10px;background:#fff";
    const title = document.createElement("h2");
    title.textContent = "خطا در نمایش این صفحه";
    const message = document.createElement("p");
    message.textContent = error?.message || String(error);
    const hint = document.createElement("p");
    hint.textContent = "جزئیات فنی خطا در Console مرورگر ثبت شده است. به صفحه قبل برگردید و متن خطا را برای پشتیبانی ارسال کنید.";
    const back = document.createElement("a");
    back.href = "#/live/hmi-pages";
    back.className = "btn btn-light";
    back.textContent = "بازگشت به صفحات HMI";
    panel.append(title, message, hint, back);
    root.append(panel);
  }
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (currentPath().startsWith("/live/hmi-designer/")) {
      refreshHmiDesignerLivePreview();
      return;
    }
    render();
  });
}

window.addEventListener("hashchange", () => { render(); syncLiveConnection(); });
window.addEventListener("scada:state-changed", scheduleRender);
window.addEventListener("scada:hmi-chart-updated", scheduleRender);
window.addEventListener("scada:hmi-chart-config-changed", syncLiveConnection);
window.addEventListener("blur", () => handleHmiDesignerPointerUp({}));

document.addEventListener("click", event => {
  const routeLink = event.target.closest("a[href^='#/']");
  if (routeLink) {
    const targetHash = routeLink.getAttribute("href");
    if (targetHash && targetHash.startsWith("#/")) {
      event.preventDefault();
      if (location.hash === targetHash) {
        // Clicking the current route must still re-render it (notably HMI Designer).
        render();
        syncLiveConnection();
      } else {
        location.hash = targetHash;
      }
    }
    return;
  }
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  if (actionElement.classList.contains("hmi-layout-preview-backdrop") && event.target !== actionElement) return;
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

document.addEventListener("pointerdown", event => {
  handleHmiDesignerPointerDown(event);
});
document.addEventListener("pointermove", event => {
  handleHmiDesignerPointerMove(event);
});
document.addEventListener("pointerup", event => {
  handleHmiDesignerPointerUp(event);
});
document.addEventListener("pointercancel", event => {
  handleHmiDesignerPointerUp(event);
});

document.addEventListener("input", event => {
  try {
    handleHmiDesignerInput(event);
  } catch (error) {
    console.error("HMI designer input failed", error);
    showToast(error.message || "به‌روزرسانی طراح HMI ناموفق بود.", "error");
  }
});

document.addEventListener("change", event => {
  if (event.target.matches(".hmi-designer-page select")) {
    try { handleHmiDesignerInput(event); }
    catch (error) { showToast(error.message || "به‌روزرسانی ویژگی HMI ناموفق بود.", "error"); }
  }
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
  const isHmiDesignerPath = path.startsWith("/live/hmi-designer/");
  if (!isHmiDesignerPath) closeHmiDesignerPreview();
  if (isHmiDesignerPath && store.isConnected()) {
    if (loadedHmiDesignerChartPath !== path) {
      loadedHmiDesignerChartPath = path;
      window.requestAnimationFrame(() => {
        if (currentPath() !== path || !store.isConnected() || hmiDesignerChartRefreshInFlight) return;
        hmiDesignerChartRefreshInFlight = true;
        loadHmiDesignerChartData()
          .catch(error => console.error("HMI designer chart history load failed", error))
          .finally(() => { hmiDesignerChartRefreshInFlight = false; });
      });
    }
    const designerRefreshInterval = getHmiDesignerChartRefreshIntervalMs();
    if (!hmiDesignerChartRefreshTimer || hmiDesignerChartRefreshTimerInterval !== designerRefreshInterval) {
      if (hmiDesignerChartRefreshTimer) window.clearInterval(hmiDesignerChartRefreshTimer);
      hmiDesignerChartRefreshTimer = window.setInterval(() => {
        if (!currentPath().startsWith("/live/hmi-designer/") ||
            !store.isConnected() || hmiDesignerChartRefreshInFlight) return;
        hmiDesignerChartRefreshInFlight = true;
        loadHmiDesignerChartData()
          .catch(error => console.error("HMI designer chart history refresh failed", error))
          .finally(() => { hmiDesignerChartRefreshInFlight = false; });
      }, designerRefreshInterval);
      hmiDesignerChartRefreshTimerInterval = designerRefreshInterval;
    }
  } else {
    loadedHmiDesignerChartPath = null;
    if (hmiDesignerChartRefreshTimer) window.clearInterval(hmiDesignerChartRefreshTimer);
    hmiDesignerChartRefreshTimer = null;
    hmiDesignerChartRefreshTimerInterval = null;
    hmiDesignerChartRefreshInFlight = false;
  }
  const hmiRuntimeMatch = path.match(/^\/live\/hmi\/([^/]+)$/);
  if (hmiRuntimeMatch && store.isConnected()) {
    if (loadedHmiChartPageId !== hmiRuntimeMatch[1]) {
      loadedHmiChartPageId = hmiRuntimeMatch[1];
      loadHmiPageChartData(loadedHmiChartPageId).catch(error => console.error("HMI chart history load failed", error));
    }
    const runtimeRefreshInterval = getHmiPageChartRefreshIntervalMs(hmiRuntimeMatch[1]);
    if (!hmiChartRefreshTimer || hmiChartRefreshTimerInterval !== runtimeRefreshInterval) {
      if (hmiChartRefreshTimer) window.clearInterval(hmiChartRefreshTimer);
      hmiChartRefreshTimer = window.setInterval(() => {
        const currentMatch = currentPath().match(/^\/live\/hmi\/([^/]+)$/);
        if (!currentMatch || !store.isConnected() || hmiChartRefreshInFlight) return;
        hmiChartRefreshInFlight = true;
        loadHmiPageChartData(currentMatch[1])
          .catch(error => console.error("HMI chart history refresh failed", error))
          .finally(() => { hmiChartRefreshInFlight = false; });
      }, runtimeRefreshInterval);
      hmiChartRefreshTimerInterval = runtimeRefreshInterval;
    }
  } else {
    loadedHmiChartPageId = null;
    if (hmiChartRefreshTimer) window.clearInterval(hmiChartRefreshTimer);
    hmiChartRefreshTimer = null;
    hmiChartRefreshTimerInterval = null;
    hmiChartRefreshInFlight = false;
  }
  const needsLive = ["/live/data", "/live/trends", "/live/alarms", "/live/classic", "/batch/run", "/batch/compare"].includes(path)
    || path.startsWith("/live/hmi/")
    || path.startsWith("/live/hmi-designer/");
  if ((path === "/batch/run" || path === "/batch/compare") && store.isConnected()) {
    const selectedBatch = store.list("batches")[0];
    store.loadBatchWeighments(selectedBatch?.id || null)
      .catch(error => console.error("Batch weighment history load failed", error));
  }
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
      if (Array.isArray(message.plcs)) store.replaceCollection("plcs", message.plcs);
      if (Array.isArray(message.alarms)) store.replaceCollection("alarms", message.alarms);
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
  syncLiveConnection();
  render();
  // Rendering initializes the HMI draft; recompute the chart timer with its actual layout.
  syncLiveConnection();
}

initialize();
