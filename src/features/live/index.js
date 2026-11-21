import { store } from "../../services/demo-store.js";
import { escapeHtml } from "../../core/format.js";
import { button, dataTable, pageHeader, panel, pill, tabs, lineChart, statCard, gradientBanner, emptyState, barChart } from "../../shared/ui.js";
import { renderHmiDesigner, getHmiChartHistory } from "./hmi-designer.js";
import { renderHmiWidget } from "./hmi-widgets.js";

function liveDataPage() {
  const rows = store.list("tags");
  const columns = [
    { key: "name", label: "تگ" }, { key: "value", label: "مقدار", render: row => row.quality === "UNSAMPLED" ? "—" : row.value ?? "—" },
    { key: "unit", label: "واحد" }, { key: "quality", label: "کیفیت", render: row => pill(row.quality || "UNSAMPLED", row.quality === "GOOD" ? "success" : row.quality === "DEMO" ? "warning" : row.quality === "BAD" ? "danger" : "muted") },
    { key: "source", label: "منبع", render: row => escapeHtml(row.source || "—") },
    { key: "time", label: "زمان", render: row => (row.sampled_at || row.updated_at) ? new Date(row.sampled_at || row.updated_at).toLocaleTimeString("fa-IR") : "—" },
    { key: "write", label: "نوشتن", render: row => row.access === "read_write" ? `<button class="btn btn-light btn-sm" data-action="write-tag" data-id="${row.id}">Write</button>` : "—" }
  ];
  return `<div>${pageHeader("مقادیر زنده تگ", "مقدار، منبع، زمان و کیفیت داده از PLC یا Edge متصل نمایش داده می‌شود؛ DEMO مقدار واقعی سخت‌افزار نیست.", pill("API · Live", "success"))}${panel("مقادیر لحظه‌ای", dataTable(columns, rows))}</div>`;
}

function hmiPagesPage() {
  const designs = store.list("hmiPages");
  return `<div class="hmi-page-collection" data-collection-name="hmiPages" data-edit-action="new-hmi-page">${pageHeader("صفحات HMI", "طراحی گرافیکی شماتیک صنعتی، اتصال تگ‌ها و اجرای مستقل هر صفحه", '<a class="btn btn-primary" href="#/live/hmi-designer/new">＋ صفحه جدید</a>')}
    ${designs.length ? `<div class="hmi-gallery">${designs.map(page => {
      const layout = Array.isArray(page.layout) ? page.layout : [];
      const componentNames = layout.map(item => item.label || item.type).slice(0, 4);
      return `<article class="hmi-card">
        <div class="hmi-preview"><div class="preview-top"></div><div class="preview-layout">
          <div class="preview-info"><b>${escapeHtml(page.name)}</b><small>${layout.length.toLocaleString("fa-IR")} جزء متصل به تگ</small></div>
          <div class="preview-tiles">${componentNames.map(name => `<i title="${escapeHtml(name)}"></i>`).join("")}</div>
        </div></div>
        <div class="hmi-card-footer"><span><b>${escapeHtml(page.name)}</b></span><small>${escapeHtml(page.machine || "بدون ماشین")} · ${layout.length.toLocaleString("fa-IR")} جزء · ${escapeHtml(page.status || "پیش‌نویس")}</small>
          <div><a class="btn btn-light btn-sm" href="#/live/hmi-designer/${page.id}">ویرایش</a><button class="btn btn-light btn-sm" data-action="delete-record" data-collection="hmiPages" data-id="${page.id}">حذف</button><a class="btn btn-link btn-sm" href="#/live/hmi/${page.id}">اجرای صفحه ›</a></div>
        </div>
      </article>`;
    }).join("")}</div>` : emptyState("هنوز صفحه HMI تعریف نشده است. با تعریف layout به شکل JSON می‌توانید تگ‌ها را به اجزای صفحه متصل کنید.")}
  </div>`;
}

function hmiRuntimePage(pageId) {
  const page = store.list("hmiPages").find(item => item.id === pageId);
  if (!page) return `<div>${pageHeader("صفحه HMI پیدا نشد", "شناسه صفحه در Backend وجود ندارد.")}${emptyState("صفحه حذف شده یا شناسه آن معتبر نیست.")}</div>`;
  const tags = store.list("tags");
  const layout = Array.isArray(page.layout) ? page.layout : [];
  const active = page.status !== "غیرفعال";
  const components = layout.map(component => renderHmiWidget(component, tags, {
    active,
    history: component.type === "chart" ? getHmiChartHistory(component.tag_id, component.history_hours) : [],
  })).join("");
  return `<div class="hmi-runtime">
    ${pageHeader(page.name, `${page.description || ""} · ${page.machine || "بدون ماشین"}`, `${button("به‌روزرسانی نمودارها", "hmi-refresh-charts", { variant: "light", attrs: "data-page-id=\"" + pageId + "\"" })}<a class="btn btn-light" href="#/live/hmi-pages">بازگشت به صفحات HMI</a>`)}
    <div class="hmi-runtime-toolbar">${pill(active ? "صفحه فعال" : "صفحه غیرفعال", active ? "success" : "muted")}<span>نمایش از Backend · مقادیر UNSAMPLED به‌عنوان مقدار زنده نمایش داده نمی‌شوند.</span></div>
    ${layout.length ? `<div class="hmi-runtime-grid">${components}</div>` : emptyState("برای این صفحه هنوز جزء صنعتی تعریف نشده است. صفحه را در طراح HMI ویرایش کنید و اجزا را به تگ‌ها متصل کنید.")}
    <p class="muted-note">کیفیت GOOD از Edge احراز‌شده می‌آید؛ DEMO از شبیه‌ساز داخلی است. برای فرمان فیزیکی، درایور و نقشه آدرس PLC هنوز تأیید و راه‌اندازی نشده است.</p>
  </div>`;
}

function classicHmiPage() {
  const tags = store.list("tags");
  const plcs = store.list("plcs");
  const analytics = store.snapshot().analytics || {};
  const kpis = analytics.kpis || {};
  const cards = tags.map(tag => {
    const plc = plcs.find(item => item.id === tag.plc);
    return `<article class="machine-card" data-plc-id="${escapeHtml(tag.plc || "")}">
    <h3>${tag.name}</h3>
    <small>${escapeHtml(plc?.name || "بدون PLC")} · ${escapeHtml(tag.address || "بدون آدرس")}</small>
    <div class="motor-status">${tag.type === "bool" ? "B" : "T"}</div>
    <span class="machine-running">${tag.quality === "GOOD" ? "● داده Edge" : tag.quality === "DEMO" ? "● شبیه‌سازی" : "● بدون نمونه جدید"}</span>
    <div class="machine-metrics">
      <label>مقدار<strong>${tag.quality === "UNSAMPLED" ? "—" : tag.value ?? "—"} <small>${tag.unit || ""}</small></strong></label>
      <label>کیفیت<strong>${tag.quality || "UNSAMPLED"}</strong></label>
    </div>
    <small>آخرین نمونه: ${tag.sampled_at ? new Date(tag.sampled_at).toLocaleTimeString("fa-IR") : "—"}</small>
  </article>`;
  }).join("");
  const alarms = store.list("alarms").filter(item => !["تأییدشده","غیرفعال","رفع‌شده"].includes(item.status));
  return `<div class="classic-page">
    <div class="classic-toolbar"><span>${pill("دریافت از API", "success")} <small>${new Date().toLocaleString("fa-IR")}</small></span>
      <div>${button("به‌روزرسانی", "refresh-demo", { variant: "light", small: true })}${button("بزرگ‌نمایی", "toggle-fullscreen", { variant: "light", small: true })}</div>
    </div>
    <div class="classic-board"><header><h1>نمای عملیاتی تگ‌ها — وضعیت داده دریافتی</h1><b class="digital-clock">${new Date().toLocaleTimeString("en-GB")}</b><p>مقادیر از آخرین نمونه ذخیره‌شده در Backend خوانده می‌شوند؛ داده بدون نمونه با UNSAMPLED مشخص است.</p></header>
      <div class="machine-cards">${cards || emptyState("تگی برای نمایش ثبت نشده است.")}</div>
      <div class="process-strip"><span>منبع داده</span><div></div><span>Backend / Edge / DEMO</span></div>
      <div class="classic-bottom-grid">
        <section class="panel"><h3>آمار ثبت‌شده سامانه</h3><div class="classic-kpis">
          <div><small>سفارش فعال</small><b>${kpis.active_order_count ?? "—"}</b></div>
          <div><small>اجرای در حال تولید</small><b>${kpis.running_count ?? "—"}</b></div>
          <div><small>تگ تعریف‌شده</small><b>${kpis.tag_count ?? "—"}</b></div>
          <div><small>نمونه تلمتری در بازه</small><b>${kpis.telemetry_samples_period ?? "—"}</b></div>
          <div><small>بچ فعال</small><b>${kpis.active_batch_count ?? "—"}</b></div>
          <div><small>ماشین تعریف‌شده</small><b>${kpis.machine_count ?? "—"}</b></div>
        </div></section>
        <section class="dark-display"><span>آلارم‌های فعال</span><b>${alarms.length ? alarms.length.toLocaleString("fa-IR") + " آلارم فعال" : "آلارم فعالی ثبت نشده"}</b></section>
      </div>
    </div>
    <div class="classic-tabs"><button class="active" data-action="filter-tag-plc" data-plc="all">همه تگ‌ها</button>${plcs.map(plc => `<button data-action="filter-tag-plc" data-plc="${escapeHtml(plc.id)}">${escapeHtml(plc.name)}</button>`).join("")}</div>
  </div>`;
}

function alarmsPage() {
  const rows = store.list("alarms");
  const active = rows.filter(row => row.condition_active && !["رفع‌شده", "غیرفعال"].includes(row.status));
  const history = rows.filter(row => ["رفع‌شده", "تأییدشده"].includes(row.status) && !row.condition_active);
  const definitions = rows.filter(row => row.operator !== undefined && row.threshold !== undefined);
  const columns = [
    { key: "name", label: "نام آلارم" },
    { key: "severity", label: "شدت" },
    { key: "tag", label: "شناسه تگ" },
    { key: "operator", label: "شرط" },
    { key: "threshold", label: "آستانه" },
    { key: "last_value", label: "آخرین مقدار" },
    { key: "status", label: "وضعیت", render: row => pill(row.status || "تعریف‌شده", row.status === "فعال" ? "danger" : row.status === "تأییدشده" ? "warning" : row.status === "رفع‌شده" ? "success" : "muted") },
    { key: "triggered_at", label: "زمان فعال‌شدن", render: row => row.triggered_at ? new Date(row.triggered_at).toLocaleString("fa-IR") : "—" },
    { key: "ack", label: "عملیات", render: row => row.condition_active && row.status !== "تأییدشده"
      ? `<button class="btn btn-light btn-sm" data-action="ack-alarm" data-id="${row.id}">تأیید</button>`
      : row.condition_active ? "تأییدشده" : "—" },
  ];
  return `<div data-collection-name="alarms" data-edit-action="new-alarm">
    ${pageHeader("آلارم‌ها", "قوانین آلارم بر اساس شرط تگ ارزیابی می‌شوند؛ فعال‌شدن و رفع‌شدن با دریافت نمونه ثبت می‌شود.", button("قانون آلارم جدید", "new-alarm", { icon: "+" }))}
    <div class="stats-grid stats-grid-3">
      ${statCard("آلارم فعال", active.length.toLocaleString("fa-IR"), "مورد", "red")}
      ${statCard("آلارم تأییدشده ولی هنوز فعال", active.filter(row => row.status === "تأییدشده").length.toLocaleString("fa-IR"), "مورد", "orange")}
      ${statCard("قانون تعریف‌شده", definitions.length.toLocaleString("fa-IR"), "قانون", "blue")}
    </div>
    ${panel("آلارم‌های فعال", active.length ? dataTable(columns, active) : emptyState("در حال حاضر هیچ شرط آلارم فعالی برقرار نیست."))}
    ${panel("تاریخچه آلارم‌های رفع‌شده", history.length ? dataTable(columns, history) : emptyState("هنوز آلارمی رفع‌شده ثبت نشده است."))}
    ${panel("قوانین تعریف‌شده", rows.length ? dataTable([
      { key: "name", label: "قانون" },
      { key: "tag", label: "شناسه تگ" },
      { key: "operator", label: "شرط" },
      { key: "threshold", label: "آستانه" },
      { key: "severity", label: "شدت" },
      { key: "status", label: "وضعیت قانون" },
      { key: "trigger_count", label: "دفعات فعال‌شدن", render: row => Number(row.trigger_count || 0).toLocaleString("fa-IR") },
    ], rows, { actions: true }) : emptyState("هنوز قانون آلارمی تعریف نشده است."))}
    <p class="muted-note">قانون‌ها فقط برای تگ عددی قابل ارزیابی هستند. پس از تأیید اپراتور، آلارم تا رفع شرط فعال باقی می‌ماند؛ با برگشت مقدار به محدوده، رویداد رفع‌شدن ثبت می‌شود.</p>
  </div>`;
}

function trendsPage() {
  const rows = store.list("trends");
  const selected = rows.find(row => row.id === store.trendId()) || rows[0] || null;
  const history = store.list("trendHistory");
  const chartRows = history.slice(-12);
  const values = chartRows.map(sample => Number(sample.value)).filter(value => Number.isFinite(value));
  const labels = chartRows.map(sample => sample.sampled_at
    ? new Date(sample.sampled_at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
    : "—");
  const latest = history[history.length - 1];
  const hours = store.trendHours();
  const rangeLabels = { 1: "۱ ساعت", 6: "۶ ساعت", 24: "۲۴ ساعت" };
  return `<div>${pageHeader("روندها", "انتخاب روند و بازه زمانی، تاریخچه را از API و پایگاه داده دریافت می‌کند.", button("به‌روزرسانی", "refresh-demo", { variant: "light" }))}
    <div class="trend-tags">${rows.map(row => `<button class="${selected?.id === row.id ? "active" : ""}" data-action="select-trend" data-id="${row.id}">${row.name}</button>`).join("")}</div>
    <div class="trend-controls">
      <span>${pill(latest ? `آخرین نمونه · ${latest.quality || "UNSAMPLED"}` : "نمونه‌ای در این بازه نیست", latest?.quality === "GOOD" ? "success" : latest?.quality === "DEMO" ? "warning" : "muted")}</span>
      <div class="range-pills">${[1,6,24].map(value => `<button data-action="select-trend-range" data-hours="${value}" class="${hours === value ? "active" : ""}">${rangeLabels[value]}</button>`).join("")}</div>
    </div>
    ${selected ? panel("روند انتخاب‌شده", `<div class="storage-list"><div><span>نام روند</span><b>${selected.name}</b></div><div><span>تگ‌های تعریف‌شده</span><b>${selected.tags || "—"}</b></div><div><span>بازه نمونه‌برداری تعریف‌شده</span><b>${selected.period || "—"}</b></div></div>`) : emptyState("ابتدا یک روند تعریف کنید.")}
    ${history.length && values.length ? lineChart(`تاریخچه ${selected?.name || "تگ"} · ${rangeLabels[hours]}`, labels, "#e7a300", values) : panel("تاریخچه تله‌متری", emptyState("در این بازه نمونه‌ای برای تگ انتخاب‌شده ثبت نشده است."))}
    ${panel("نمونه‌های دریافت‌شده", history.length ? dataTable([
      {key:"sampled_at",label:"زمان",render:row=>row.sampled_at ? new Date(row.sampled_at).toLocaleString("fa-IR") : "—"},
      {key:"value",label:"مقدار"},
      {key:"quality",label:"کیفیت",render:row=>pill(row.quality || "UNSAMPLED",row.quality === "GOOD" ? "success" : row.quality === "DEMO" ? "warning" : "muted")},
      {key:"source",label:"منبع"}
    ], history.slice(-50).reverse()) : emptyState("برای این تگ در بازه انتخاب‌شده داده‌ای وجود ندارد."))}
    ${panel("مدیریت روندها", rows.length ? dataTable([
      { key: "name", label: "نام روند" },
      { key: "tags", label: "تگ‌ها" },
      { key: "period", label: "بازه تعریف‌شده" },
      { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "فعال" ? "success" : "muted") },
    ], rows, { actions: true }) : emptyState("هنوز روندی ثبت نشده است."))}
  </div>`;
}

export function renderLive(path) {
  if (path === "/live/hmi-designer/new") return renderHmiDesigner();
  if (path.startsWith("/live/hmi-designer/")) return renderHmiDesigner(path.slice("/live/hmi-designer/".length));
  if (path.startsWith("/live/hmi/")) return hmiRuntimePage(path.slice("/live/hmi/".length));
  if (path === "/live/data") return liveDataPage();
  if (path === "/live/hmi-pages") return hmiPagesPage();
  if (path === "/live/classic") return classicHmiPage();
  if (path === "/live/alarms") return alarmsPage();
  if (path === "/live/trends") return trendsPage();
  return liveDataPage();
}
