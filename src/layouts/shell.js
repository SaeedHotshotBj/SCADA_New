import { navigation, routeTitles, findGroup } from "../core/navigation.js";
import { store } from "../services/demo-store.js";
import { escapeHtml } from "../core/format.js";

function renderSidebar(path) {
  const activeGroup = findGroup(path);
  return `<aside class="sidebar">
    <div class="sidebar-head"><div class="brand-symbol">S</div><div class="brand-copy"><b>SCADIRAN</b><small>INDUSTRIAL SCADA / HMI</small></div><button class="sidebar-toggle" data-action="toggle-sidebar" aria-label="جمع کردن منو">‹</button></div>
    <div class="sidebar-scroll">
      ${navigation.map(group => `<section class="nav-group ${activeGroup === group.id ? "expanded" : ""}">
        <button class="nav-group-title" data-action="toggle-nav-group" data-group="${group.id}"><span class="nav-symbol">${group.icon}</span><span>${group.label}</span><span class="chevron">⌄</span></button>
        <div class="nav-items" ${activeGroup === group.id ? "" : "hidden"}>${group.children.map(([route, label, icon]) => `<a href="#${route}" class="nav-link ${path === route ? "active" : ""}"><span>${icon}</span>${label}</a>`).join("")}</div>
      </section>`).join("")}
    </div>
    <div class="sidebar-foot"><span class="online-dot"></span> نسخه نمایشی محلی <small>v0.1.0</small></div>
  </aside>`;
}

export function renderShell(path, content) {
  const title = routeTitles[path] ?? "داشبورد";
  const user = store.currentUser() || {};
  const name = escapeHtml(user.name || "کاربر سامانه");
  const role = escapeHtml(user.role || "بدون نقش");
  const avatar = escapeHtml((user.name || "SC").trim().slice(0, 2).toUpperCase());
  return `<div class="app-shell">${renderSidebar(path)}<div class="workspace">
    <header class="topbar"><div class="topbar-user"><span class="user-avatar">${avatar}</span><span>${name}</span><span class="topbar-divider"></span><span class="user-role">${role}</span><button class="btn btn-light btn-sm" data-action="change-password">تغییر رمز</button><button class="btn btn-light btn-sm" data-action="logout">خروج</button></div><div class="topbar-brand"><span class="topbar-section">SCADA / HMI</span><span class="topbar-logo">SCADIRAN</span></div></header>
    <div class="mobile-title"><button class="btn btn-light btn-sm" data-action="toggle-sidebar">☰</button><span>${title}</span></div>
    <main class="page-content">${content}</main>
    <footer class="app-footer"><span>SCADIRAN · SCADA / HMI</span><span>محیط نمایشی — بدون ارتباط با تجهیزات واقعی</span></footer>
  </div></div>`;
}

export function bindShellEvents() {
  document.querySelectorAll('[data-action="toggle-nav-group"]').forEach(button => button.addEventListener("click", () => {
    const group = button.closest(".nav-group");
    group?.classList.toggle("expanded");
    const items = group?.querySelector(".nav-items");
    if (items) items.hidden = !items.hidden;
    if (items?.hidden) group?.classList.remove("expanded");
    else group?.classList.add("expanded");
  }));
}
