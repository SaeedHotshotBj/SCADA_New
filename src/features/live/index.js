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
  return `<div>${pageHeader("مقادیر زنده تگ", "آخرین مقدار، کیفیت و منبع از Backend؛ DEMO از داده دریافتی Edge جداست.", pill(store.isConnected() ? "Backend متصل" : "Backend قطع", store.isConnected() ? "success" : "danger"))}${panel("مقادیر لحظه‌ای", rows.length ? dataTable(columns, rows) : emptyState("تگی ثبت نشده است."))}</div>`;
}

function hmiPagesPage() {
  const designs = store.list("hmiPages");
  return `<div data-collection-name="hmiPages" data-edit-action="new-hmi-page">${pageHeader("صفحات HMI", "صفحات عملیاتی ذخیره‌شده در پایگاه داده", button("صفحه جدید", "new-hmi-page", { icon: "+" }))}<div class="hmi-gallery">${designs.map((page, index) => { const name = page.name; return `<article class="hmi-card"><div class="hmi-preview"><div class="preview-top"></div><div class="preview-layout"><div class="preview-gauge"></div><div class="preview-info"></div><div class="preview-chart"></div><div class="preview-tiles"><i></i><i></i><i></i><i></i><i></i></div></div></div><div class="hmi-card-footer"><span><b>${index + 1}.</b> ${name}</span><small>${page.machine || "ماشین نامشخص"} · ${page.components || 0} قطعه</small><div><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${page.id}">ویرایش</button><a class="btn btn-link btn-sm" href="#/live/classic">اجرا ›</a></div></div></article>`; }).join("")}</div></div>`;
}

const machineTabs = ["نمای کلی", "کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "اکسترودر روشن", "قرقره‌پیچ", "انرژی", "آلارم‌ها"];

function classicHmiPage() {
  const machines = store.list("machines");
  const tags = store.list("tags");
  const alarms = store.list("alarmEvents").filter(event => event.state === "ACTIVE");
  const units = store.list("units");
  const valueFor = (machine, suffixes) => {
    const code = String(machine.code || "").split("-")[0];
    const prefix = machine.tag_prefix || (code === "BUN" ? "BN" : code);
    const tag = tags.find(item => suffixes.some(suffix => item.name === `${prefix}.${suffix}` || item.name.endsWith(`.${suffix}`) && item.machine === machine.id));
    return tag ? { value: tag.value, unit: tag.unit || "", quality: tag.last_quality || "DEMO", name: tag.name } : null;
  };
  const display = item => item && item.value !== null && item.value !== undefined ? `${Number(item.value).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ${item.unit}` : "—";
  const powerTags = tags.filter(tag => /power/i.test(tag.name || "") && typeof tag.value === "number");
  const energyTags = tags.filter(tag => (tag.unit === "kWh" || tag.unit === "MWh") && typeof tag.value === "number");
  const totalPower = powerTags.length ? powerTags.reduce((sum, tag) => sum + tag.value, 0) : null;
  const totalEnergy = energyTags.length ? energyTags.reduce((sum, tag) => sum + tag.value, 0) : null;
  const machineCards = machines.map(machine => {
    const speed = valueFor(machine, ["Speed"]);
    const current = valueFor(machine, ["Current"]);
    const tension = valueFor(machine, ["Tension"]);
    const energy = valueFor(machine, ["Energy"]);
    const hasTelemetry = [speed, current, tension, energy].some(Boolean);
    const run = store.list("productionRuns").find(item => item.machine === machine.name && item.status === "در حال تولید");
    return `<article class="machine-card"><h3>${machine.name}</h3><small>${machine.code || "—"}</small><div class="motor-status">M</div><span class="machine-running">${run ? "● اجرای تولید فعال" : "وضعیت سخت‌افزار نامشخص"}</span><div class="machine-metrics"><label>سرعت<strong>${display(speed)}</strong></label><label>جریان<strong>${display(current)}</strong></label><label>کشش<strong>${display(tension)}</strong></label><label>انرژی<strong>${display(energy)}</strong></label></div><small>${hasTelemetry ? "کیفیت داده: " + [speed,current,tension,energy].filter(Boolean).map(item => item.quality).join(" / ") : "برای این ماشین تگ و نمونه ثبت نشده است."}</small><a class="btn btn-light btn-sm" href="#/live/data">مشاهده تگ‌ها ›</a></article>`;
  }).join("");
  const alarmText = alarms.length ? `${alarms.length.toLocaleString("fa-IR")} رخداد فعال` : "رخداد فعال ثبت نشده است";
  return `<div class="classic-page"><div class="classic-toolbar"><span>${pill(tags.some(tag => tag.last_quality === "GOOD") ? "داده GOOD از Edge" : "داده DEMO / بدون سخت‌افزار", tags.some(tag => tag.last_quality === "GOOD") ? "success" : "warning")} <small>${new Date().toLocaleString("fa-IR")}</small></span><div>${button("به‌روزرسانی", "refresh-demo", { variant: "light", small: true })}<button class="btn btn-light btn-sm" data-action="toggle-hmi-fullscreen">بزرگ‌نمایی</button></div></div><div class="classic-board"><header><h1>سامانه پایش و مدیریت تولید</h1><p>وضعیت از داده‌های ذخیره‌شده و Telemetry دریافتی؛ حالت DEMO از سخت‌افزار واقعی تفکیک شده است.</p></header><div class="machine-cards">${machineCards || emptyState("ماشینی برای نمایش تعریف نشده است.")}</div><div class="process-strip"><span>منبع داده</span><div></div><span>${tags.length.toLocaleString("fa-IR")} تگ تعریف‌شده</span></div><div class="classic-bottom-grid"><section class="panel"><h3>مقادیر کلی ثبت‌شده</h3><div class="classic-kpis"><div><small>توان کل دارای تگ</small><b>${totalPower == null ? "—" : totalPower.toLocaleString("fa-IR") + " kW"}</b></div><div><small>انرژی دارای تگ</small><b>${totalEnergy == null ? "—" : totalEnergy.toLocaleString("fa-IR") + " kWh"}</b></div><div><small>قرقره‌های بسته‌شده در داده برنامه</small><b>${units.filter(unit => unit.status === "بسته").length.toLocaleString("fa-IR")}</b></div><div><small>تگ‌های دارای نمونه</small><b>${tags.filter(tag => tag.value !== null && tag.value !== undefined).length.toLocaleString("fa-IR")}</b></div></div></section><section class="dark-display"><span>آلارم‌های فعال</span><b>${alarmText}</b></section></div></div></div>`;
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
