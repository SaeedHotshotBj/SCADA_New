import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, lineChart, statCard, gradientBanner, emptyState, barChart } from "../../shared/ui.js";

function liveDataPage() {
  const rows = store.list("tags");
  const columns = [
    { key: "name", label: "تگ" }, { key: "value", label: "مقدار" },
    { key: "unit", label: "واحد" }, { key: "quality", label: "کیفیت", render: row => pill(row.last_quality || "DEMO", row.last_quality === "BAD" ? "danger" : row.last_quality === "GOOD" ? "success" : "warning") },
    { key: "time", label: "زمان", render: row => row.updated_at ? new Date(row.updated_at).toLocaleTimeString("fa-IR") : "—" },
    { key: "write", label: "نوشتن", render: row => row.access === "read_write" ? `<button class="btn btn-light btn-sm" data-action="write-tag" data-id="${row.id}">Write</button>` : "—" }
  ];
  return `<div>${pageHeader("مقادیر زنده تگ", "داده‌های زنده از PLC از طریق WebSocket؛ مقادیر این صفحه نمونه هستند.", pill("متصل · WEBSOCKET", "success"))}${panel("مقادیر لحظه‌ای", dataTable(columns, rows))}</div>`;
}

function hmiPagesPage() {
  const designs = store.list("hmiPages");
  return `<div data-collection-name="hmiPages" data-edit-action="new-hmi-page">${pageHeader("صفحات HMI", "صفحات عملیاتی ذخیره‌شده در پایگاه داده", button("صفحه جدید", "new-hmi-page", { icon: "+" }))}<div class="hmi-gallery">${designs.map((page, index) => { const name = page.name; return `<article class="hmi-card"><div class="hmi-preview"><div class="preview-top"></div><div class="preview-layout"><div class="preview-gauge"></div><div class="preview-info"></div><div class="preview-chart"></div><div class="preview-tiles"><i></i><i></i><i></i><i></i><i></i></div></div></div><div class="hmi-card-footer"><span><b>${index + 1}.</b> ${name}</span><small>${page.machine || "ماشین نامشخص"} · ${page.components || 0} قطعه</small><div><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${page.id}">ویرایش</button><a class="btn btn-link btn-sm" href="#/live/classic">اجرا ›</a></div></div></article>`; }).join("")}</div></div>`;
}

const machineTabs = ["نمای کلی", "کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "اکسترودر روشن", "قرقره‌پیچ", "انرژی", "آلارم‌ها"];

function classicHmiPage() {
  return `<div class="classic-page"><div class="classic-toolbar"><span>${pill("ارتباط زنده نمایشی", "success")} <small>۱۱:۱۰:۰۱ · ${new Date().toLocaleDateString("fa-IR")}</small></span><div>${button("بازنشانی نما", "refresh-demo", { variant: "light", small: true })}${button("بزرگ‌نمایی", "open-modal-info", { variant: "light", small: true })}</div></div><div class="classic-board"><header><h1>کابل‌سازی نمونه — سامانه‌ی پایش و کنترل تولید</h1><b class="digital-clock">11:10:01</b><p>نمای کلی خط تولید — کارخانه نمونه</p></header><div class="machine-cards">${["کشش درشت", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "اکسترودر روشن", "قرقره‌پیچ"].map((name, index) => `<article class="machine-card"><h3>${name}</h3><small>${["RBD-01", "MWD-01", "BUN-01", "EXI-01", "LAY-01", "EXO-01", "CPK-01"][index]}</small><div class="motor-status">M</div><span class="machine-running">● در کار</span><div class="machine-metrics"><label>سرعت<strong>${[31.7, 599.7, 120.1, 300, 60.2, 0, 120][index]} <small>m/min</small></strong></label><label>توان<strong>${[67.8, 220.4, 115.4, 191.2, 89.9, 30.9, 63][index]} <small>kW</small></strong></label></div><button class="btn btn-light btn-sm" data-action="open-modal-info">جزئیات ›</button></article>`).join("")}</div><div class="process-strip"><span>جریان مواد</span><div></div><span>خط تولید نمونه</span></div><div class="classic-bottom-grid"><section class="panel"><h3>مقادیر کلی خط</h3><div class="classic-kpis">${["توان کل|809 kW", "انرژی مصرفی|178098 kWh", "فشار هوای فشرده|7.28 bar", "دمای آب چیلر|13.4 °C", "قرقره‌های تکمیل‌شده|802 عدد", "وزن قرقره جاری|630.4 kg"].map(item => { const [k, v] = item.split("|"); return `<div><small>${k}</small><b>${v}</b></div>`; }).join("")}</div></section><section class="dark-display"><span>آلارم‌های فعال</span><b>آلارم فعالی وجود ندارد</b></section></div></div><div class="classic-tabs">${machineTabs.map((name, i) => `<button class="${i === 0 ? "active" : ""}" data-action="select-range">${name}</button>`).join("")}</div></div>`;
}

function alarmsPage() {
  const rules = store.list("alarms");
  const events = store.list("alarmEvents");
  const active = events.filter(row => row.state === "ACTIVE");
  return `<div data-collection-name="alarms" data-edit-action="new-alarm">
    ${pageHeader("آلارم‌ها", "قواعد آستانه در Backend ارزیابی می‌شوند؛ رخداد فقط پس از دریافت نمونه معتبر GOOD از Edge ایجاد می‌شود.", `${button("قانون جدید", "new-alarm", { icon: "+" })}${button("به‌روزرسانی رخدادها", "refresh-demo", { variant: "light" })}`)}
    <div class="stats-grid stats-grid-3">${statCard("قواعد ثبت‌شده", rules.length, "قانون", "blue")}${statCard("رخداد فعال", active.length, "رخداد", "red")}${statCard("تاریخچه رخداد", events.length, "رخداد", "orange")}</div>
    ${panel("رخدادهای آلارم", events.length ? dataTable([
      { key: "alarm_name", label: "قانون" }, { key: "tag_name", label: "تگ" },
      { key: "value", label: "مقدار هنگام رخداد" }, { key: "severity", label: "شدت", render: row => pill(row.severity, "warning") },
      { key: "state", label: "وضعیت", render: row => pill(row.state, row.state === "ACTIVE" ? "danger" : row.state === "ACKNOWLEDGED" ? "warning" : "success") },
      { key: "triggered_at", label: "زمان ایجاد" },
      { key: "action", label: "اقدام", render: row => row.state === "ACTIVE" ? `<button class="btn btn-primary btn-sm" data-action="ack-alarm" data-id="${row.id}">تأیید رخداد</button>` : (row.acknowledged_by || "—") }
    ], events) : emptyState("رخدادی ثبت نشده است. با رسیدن داده معتبر از Edge، قواعد فعال ارزیابی می‌شوند."))}
    ${panel("قواعد آستانه", rules.length ? dataTable([
      { key: "name", label: "نام قانون" }, { key: "tag", label: "شناسه تگ" },
      { key: "operator", label: "شرط" }, { key: "threshold", label: "آستانه" },
      { key: "deadband", label: "هیسترزیس" }, { key: "severity", label: "شدت" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") },
      { key: "operation", label: "عملیات", render: row => `<button class="btn btn-light btn-sm" data-action="toggle-status" data-collection="alarms" data-id="${row.id}">${row.status === "غیرفعال" ? "فعال‌سازی" : "غیرفعال‌سازی"}</button>` }
    ], rules) : emptyState("هنوز قانون آستانه‌ای تعریف نشده است."))}
  </div>`;
}
function trendsPage() {
  const rows = store.list("trends");
  const history = store.list("trendHistory");
  const historyValues = history.map(item => Number(item.value)).filter(Number.isFinite);
  const trendVisual = historyValues.length
    ? lineChart("تاریخچه تگ انتخاب‌شده از دیتابیس", undefined, "#1699c8", historyValues.slice(-60))
    : emptyState("برای تگ انتخاب‌شده هنوز تاریخچه‌ای در دیتابیس ثبت نشده است.");
  return `<div data-collection-name="trends" data-edit-action="new-trend">${pageHeader("روندها", "نمایش زنده و تاریخی تگ‌های انتخاب‌شده", button("روند جدید", "new-trend", { icon: "+" }))}<div class="trend-tags">${rows.map((row, i) => `<button class="${i === 0 ? "active" : ""}" data-action="select-range">${row.name}</button>`).join("")}</div><div class="trend-controls"><span>${pill("زنده · به‌روزرسانی هر ۵ ثانیه", "success")}</span><div class="range-pills">${["۱ دقیقه", "۵ دقیقه", "۱۵ دقیقه", "۱ ساعت", "۶ ساعت", "بازه دلخواه"].map((x, i) => `<button data-action="select-range" class="${i === 1 ? "active" : ""}">${x}</button>`).join("")}</div></div><div class="two-col-grid">${trendVisual}</div>${panel("مدیریت روندها", dataTable([{ key: "name", label: "نام روند" }, { key: "tags", label: "تگ‌ها" }, { key: "period", label: "بازه" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "success") }], rows, { actions: true }))}</div>`;
}

export function renderLive(path) {
  if (path === "/live/data") return liveDataPage();
  if (path === "/live/hmi-pages") return hmiPagesPage();
  if (path === "/live/classic") return classicHmiPage();
  if (path === "/live/alarms") return alarmsPage();
  if (path === "/live/trends") return trendsPage();
  return liveDataPage();
}
