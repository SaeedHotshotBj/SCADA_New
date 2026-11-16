export const faNumber = value => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);
export const nowTime = () => new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const todayFa = () => new Intl.DateTimeFormat("fa-IR", { dateStyle: "short" }).format(new Date());
export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export const uid = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const cls = (...names) => names.filter(Boolean).join(" ");
