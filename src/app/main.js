import { currentPath, renderRoute } from "./router.js";
import { handleAction, handleSubmit, showToast } from "./actions.js";
import { bindShellEvents } from "../layouts/shell.js";

const root = document.getElementById("app");
let renderQueued = false;

function render() {
  const path = currentPath();
  root.innerHTML = renderRoute(path);
  bindShellEvents();
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

window.addEventListener("hashchange", render);
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
  handleAction(action, actionElement);
});

document.addEventListener("submit", event => {
  if (handleSubmit(event)) return;
  if (event.target.id === "login-form") {
    event.preventDefault();
    sessionStorage.setItem("scada-demo-auth", "1");
    location.hash = "/bi/dashboard";
    showToast("ورود نمایشی با موفقیت انجام شد.");
  }
});

render();
