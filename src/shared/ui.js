import { escapeHtml, faNumber, todayFa } from "../core/format.js";

export function pill(label, tone = "success") {
  return `<span class="pill pill-${tone}">${escapeHtml(label)}</span>`;
}

export function button(label, action, options = {}) {
  const { variant = "primary", icon = "", attrs = "", small = false } = options;
  return `<button class="btn btn-${variant}${small ? " btn-sm" : ""}" data-action="${escapeHtml(action)}" ${attrs}>${icon ? `<span class="btn-icon">${icon}</span>` : ""}${escapeHtml(label)}</button>`;
}

export function pageHeader(title, description = "", action = "") {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>${action ? `<div class="heading-actions">${action}</div>` : ""}</div>`;
}

export function gradientBanner(title, subtitle = "", actions = "", icon = "▥") {
  return `<section class="gradient-banner"><div class="banner-icon">${icon}</div><div class="banner-copy"><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div><div class="banner-actions">${actions}</div></section>`;
}

export function panel(title, content, subtitle = "", action = "") {
  return `<section class="panel"><div class="panel-heading"><div><h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>${action ? `<div>${action}</div>` : ""}</div><div class="panel-body">${content}</div></section>`;
}

export function statCard(label, value, unit = "", tone = "blue", delta = "", detail = "", sparklineValues = null) {
  let sparkline = "";
  if (Array.isArray(sparklineValues) && sparklineValues.length > 1 && sparklineValues.every(value => Number.isFinite(Number(value)))) {
    const numbers = sparklineValues.map(Number);
    const min = Math.min(...numbers);
    const range = Math.max(...numbers) - min || 1;
    const points = numbers.map((number, index) => `${index * 210 / (numbers.length - 1)},${30 - ((number - min) / range) * 24}`).join(" ");
    sparkline = `<svg class="sparkline" viewBox="0 0 210 34" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" /></svg>`;
  }
  return `<article class="stat-card tone-${tone}"><div class="stat-top"><span>${escapeHtml(label)}</span><span class="stat-mark">${tone === "red" ? "◷" : tone === "green" ? "◉" : tone === "orange" ? "♧" : "▥"}</span></div><div class="stat-value">${escapeHtml(value)} <small>${escapeHtml(unit)}</small></div><div class="stat-bottom">${delta ? `<span class="delta">${escapeHtml(delta)}</span>` : ""}<span>${escapeHtml(detail)}</span></div>${sparkline}</article>`;
}

export function dataTable(columns, rows, options = {}) {
  const { empty = "داده‌ای برای نمایش وجود ندارد.", actions = false, compact = false } = options;
  const head = columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join("");
  const body = rows.length ? rows.map(row => `<tr>${columns.map(col => {
    const value = typeof col.render === "function" ? col.render(row) : escapeHtml(row[col.key] ?? "—");
    return `<td>${value}</td>`;
  }).join("")}${actions ? `<td class="row-actions"><button class="icon-btn" title="ویرایش" data-action="edit-record" data-id="${escapeHtml(row.id)}">✎</button><button class="icon-btn danger" title="حذف" data-action="delete-record" data-id="${escapeHtml(row.id)}">⌫</button></td>` : ""}</tr>`).join("") : `<tr><td colspan="${columns.length + (actions ? 1 : 0)}" class="empty-cell">${escapeHtml(empty)}</td></tr>`;
  return `<div class="table-wrap${compact ? " table-compact" : ""}"><table><thead><tr>${head}${actions ? "<th>عملیات</th>" : ""}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function tabs(items, active = 0) {
  return `<div class="tabs" role="tablist">${items.map((item, index) => `<button class="tab ${index === active ? "active" : ""}" data-action="select-tab" data-tab="${index}" role="tab">${escapeHtml(item)}</button>`).join("")}</div>`;
}

export function filterBar(content, action = "apply-filter") {
  return `<div class="filter-bar">${content}<button class="btn btn-primary btn-sm" data-action="${action}">اعمال فیلتر</button></div>`;
}

export function selectField(label, options, value = "") {
  return `<label class="field"><span>${escapeHtml(label)}</span><select>${options.map(option => `<option ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}

export function inputField(label, placeholder = "", value = "", type = "text") {
  return `<label class="field"><span>${escapeHtml(label)}</span><input type="${type}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" /></label>`;
}

export function lineChart(title, labels = ["۰۸:۰۰", "۰۹:۰۰", "۱۰:۰۰", "۱۱:۰۰", "۱۲:۰۰", "۱۳:۰۰", "۱۴:۰۰"], color = "#1598c7", values = [18, 24, 21, 39, 31, 46, 42]) {
  const width = 740, height = 190, left = 36, top = 16, usableW = width - left - 12, usableH = height - top - 32;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const coords = values.map((v, i) => `${left + (usableW * i) / Math.max(1, values.length - 1)},${top + usableH - ((v - min) / range) * usableH}`).join(" ");
  const area = `${left},${height - 18} ${coords} ${left + usableW},${height - 18}`;
  const ticks = labels.map((label, i) => `<text x="${left + (usableW * i) / Math.max(1, labels.length - 1)}" y="${height - 3}" text-anchor="middle">${escapeHtml(label)}</text>`).join("");
  const grids = [0, 1, 2, 3].map(i => `<line x1="${left}" x2="${width - 12}" y1="${top + (usableH * i) / 3}" y2="${top + (usableH * i) / 3}" />`).join("");
  return `<section class="panel chart-panel"><div class="panel-heading"><h3>${escapeHtml(title)}</h3><span class="chart-legend"><i style="background:${color}"></i>${escapeHtml(title)}</span></div><div class="panel-body"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><g class="chart-grid">${grids}</g><polygon points="${area}" fill="${color}" opacity=".10"></polygon><polyline points="${coords}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline><g class="chart-labels">${ticks}</g></svg></div></section>`;
}

export function barChart(title, labels = ["خط ۱", "خط ۲", "خط ۳", "خط ۴", "خط ۵"], values = [70, 88, 62, 94, 79]) {
  const bars = values.map((value, i) => {
    const x = 58 + i * 126;
    return `<rect x="${x}" y="${165 - value * 1.2}" width="54" height="${value * 1.2}" rx="5" fill="${["#2c8bdc", "#12b98d", "#20a9b7", "#8058db", "#eea63b"][i % 5]}"/><text x="${x + 27}" y="182" text-anchor="middle">${escapeHtml(labels[i])}</text>`;
  }).join("");
  return `<section class="panel chart-panel"><div class="panel-heading"><h3>${escapeHtml(title)}</h3></div><div class="panel-body"><svg class="chart-svg" viewBox="0 0 740 195"><g class="chart-grid"><line x1="24" x2="720" y1="165" y2="165"/><line x1="24" x2="720" y1="105" y2="105"/><line x1="24" x2="720" y1="45" y2="45"/></g>${bars}</svg></div></section>`;
}

export function donutChart(title, values = [52, 27, 14, 7]) {
  const colors = ["#16b98c", "#2c8bdc", "#efaa3d", "#8058db"];
  let offset = 0;
  const circles = values.map((value, i) => {
    const dash = `${value} ${100 - value}`;
    const item = `<circle cx="65" cy="65" r="48" fill="none" stroke="${colors[i]}" stroke-width="15" pathLength="100" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 65 65)"/>`;
    offset += value;
    return item;
  }).join("");
  return `<section class="panel donut-panel"><div class="panel-heading"><h3>${escapeHtml(title)}</h3></div><div class="panel-body donut-content"><svg viewBox="0 0 130 130">${circles}<text x="65" y="70" text-anchor="middle" class="donut-center">${faNumber(values[0])}٪</text></svg><div class="donut-legend">${["عملکرد", "دسترسی‌پذیری", "کیفیت", "توقف"].map((label, i) => `<div><i style="background:${colors[i]}"></i>${label}<b>${faNumber(values[i])}٪</b></div>`).join("")}</div></div></section>`;
}

export function distributionDonutChart(title, items = []) {
  const colors = ["#16b98c", "#2c8bdc", "#efaa3d", "#8058db", "#de5b6d", "#18a4b6"];
  const valid = items.map(item => ({
    name: String(item.name ?? "نامشخص"),
    count: Math.max(0, Number(item.count) || 0),
  })).filter(item => item.count > 0);
  const total = valid.reduce((sum, item) => sum + item.count, 0);
  if (!total) {
    return `<section class="panel donut-panel"><div class="panel-heading"><h3>${escapeHtml(title)}</h3></div><div class="panel-body">${emptyState("برای این نمودار هنوز داده‌ای ثبت نشده است.")}</div></section>`;
  }
  let offset = 0;
  const circles = valid.map((item, index) => {
    const percent = item.count * 100 / total;
    const circle = `<circle cx="65" cy="65" r="48" fill="none" stroke="${colors[index % colors.length]}" stroke-width="15" pathLength="100" stroke-dasharray="${percent} ${100 - percent}" stroke-dashoffset="${-offset}" transform="rotate(-90 65 65)"/>`;
    offset += percent;
    return circle;
  }).join("");
  const legend = valid.map((item, index) => {
    const percent = item.count * 100 / total;
    return `<div><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(item.name)}<b>${faNumber(item.count)} · ${faNumber(percent.toFixed(1))}٪</b></div>`;
  }).join("");
  return `<section class="panel donut-panel"><div class="panel-heading"><h3>${escapeHtml(title)}</h3></div><div class="panel-body donut-content"><svg viewBox="0 0 130 130">${circles}<text x="65" y="70" text-anchor="middle" class="donut-center">${faNumber(total)}</text></svg><div class="donut-legend">${legend}</div></div></section>`;
}

export function emptyState(message = "داده‌ای برای نمایش وجود ندارد.") {
  return `<div class="empty-state"><span>▧</span><p>${escapeHtml(message)}</p></div>`;
}

export function dateFilter() {
  return `<div class="date-filter"><label>از تاریخ<input type="text" value="${todayFa()}" /></label><label>تا تاریخ<input type="text" value="${todayFa()}" /></label><select><option>۳۰ روز اخیر</option><option>۷ روز اخیر</option><option>ماه جاری</option><option>سال جاری</option></select></div>`;
}

export function actionToolbar(actions = []) {
  return `<div class="toolbar">${actions.join("")}</div>`;
}
