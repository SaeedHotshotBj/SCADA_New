import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, lineChart, statCard, gradientBanner, emptyState, barChart } from "../../shared/ui.js";

function liveDataPage() {
  const rows = store.list("tags");
  const columns = [
    { key: "name", label: "تگ" }, { key: "value", label: "مقدار" },
    { key: "unit", label: "واحد" }, { key: "quality", label: "کیفیت", render: row => pill(row.quality || "UNSAMPLED", row.quality === "GOOD" ? "success" : row.quality === "DEMO" ? "warning" : "muted") },
    { key: "time", label: "زمان", render: row => (row.sampled_at || row.updated_at) ? new Date(row.sampled_at || row.updated_at).toLocaleTimeString("fa-IR") : "—" },
    { key: "write", label: "نوشتن", render: row => row.access === "read_write" ? `<button class="btn btn-light btn-sm" data-action="write-tag" data-id="${row.id}">Write</button>` : "—" }
  ];
  return `<div>${pageHeader("مقادیر زنده تگ", "مقادیر، زمان نمونه و کیفیت از آخرین داده ذخیره‌شده در Backend دریافت می‌شوند.", pill("API · Live", "success"))}${panel("مقادیر لحظه‌ای", dataTable(columns, rows))}</div>`;
}

function hmiPagesPage() {
  const designs = store.list("hmiPages");
  return `<div class="hmi-page-collection" data-collection-name="hmiPages" data-edit-action="new-hmi-page">${pageHeader("صفحات HMI", "مدیریت صفحات عملیاتی و چیدمان‌های HMI", button("صفحه جدید", "new-hmi-page", { icon: "+" }))}
    ${designs.length ? `<div class="hmi-gallery">${designs.map((page, index) => `<article class="hmi-card"><div class="hmi-preview"><div class="preview-top"></div><div class="preview-layout"><div class="preview-gauge"></div><div class="preview-info"></div><div class="preview-chart"></div><div class="preview-tiles"><i></i><i></i><i></i><i></i><i></i></div></div></div><div class="hmi-card-footer"><span><b>${index + 1}.</b> ${page.name}</span><small>${page.machine || "بدون ماشین"} · ${page.components || 0} قطعه · ${page.status || "پیش‌نویس"}</small><div><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${page.id}">ویرایش</button><button class="btn btn-light btn-sm" data-action="delete-record" data-collection="hmiPages" data-id="${page.id}">حذف</button><a class="btn btn-link btn-sm" href="#/live/classic">اجرا ›</a></div></div></article>`).join("")}</div>` : emptyState("هنوز صفحه HMI تعریف نشده است.")}
  </div>`;
}

const machineTabs = ["نمای کلی", "کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "اکسترودر روشن", "قرقره‌پیچ", "انرژی", "آلارم‌ها"];

function classicHmiPage() {
  const tags = store.list("tags");
  const analytics = store.snapshot().analytics || {};
  const kpis = analytics.kpis || {};
  const cards = tags.map(tag => `<article class="machine-card">
    <h3>${tag.name}</h3>
    <small>${tag.plc || "بدون PLC"} · ${tag.address || "بدون آدرس"}</small>
    <div class="motor-status">${tag.type === "bool" ? "B" : "T"}</div>
    <span class="machine-running">${tag.quality === "GOOD" ? "● داده Edge" : tag.quality === "DEMO" ? "● شبیه‌سازی" : "● بدون نمونه جدید"}</span>
    <div class="machine-metrics">
      <label>مقدار<strong>${tag.value ?? "—"} <small>${tag.unit || ""}</small></strong></label>
      <label>کیفیت<strong>${tag.quality || "UNSAMPLED"}</strong></label>
    </div>
    <small>آخرین نمونه: ${tag.sampled_at ? new Date(tag.sampled_at).toLocaleTimeString("fa-IR") : "—"}</small>
  </article>`).join("");
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
          <div><small>نمونه تلمتری ۲۴ ساعت</small><b>${kpis.telemetry_samples_24h ?? "—"}</b></div>
          <div><small>بچ فعال</small><b>${kpis.active_batch_count ?? "—"}</b></div>
          <div><small>ماشین تعریف‌شده</small><b>${kpis.machine_count ?? "—"}</b></div>
        </div></section>
        <section class="dark-display"><span>آلارم‌های فعال</span><b>${alarms.length ? alarms.length.toLocaleString("fa-IR") + " آلارم فعال" : "آلارم فعالی ثبت نشده"}</b></section>
      </div>
    </div>
    <div class="classic-tabs">${machineTabs.map((name, i) => `<button class="${i === 0 ? "active" : ""}" data-action="select-range">${name}</button>`).join("")}</div>
  </div>`;
}

function alarmsPage() {
  const rows = store.list("alarms");
  return `<div data-collection-name="alarms" data-edit-action="new-alarm">${pageHeader("آلارم‌ها", "تعریف، مشاهده و رسیدگی به هشدارهای ماشین‌ها و تگ‌ها", button("آلارم جدید", "new-alarm", { icon: "+" }))}${tabs(["فعال", "تاریخچه", "تعاریف"])}${panel("آلارم‌های فعال", rows.length ? dataTable([{ key: "name", label: "نام" }, { key: "severity", label: "شدت" }, { key: "status", label: "وضعیت" }, { key: "tag", label: "تگ" }, { key: "ack", label: "عملیات", render: row => `<button class="btn btn-light btn-sm" data-action="ack-alarm" data-id="${row.id}">تأیید</button>` }], rows) : emptyState("در حال حاضر آلارم فعالی وجود ندارد."))}</div>`;
}

function trendsPage() {
  const rows = store.list("trends");
  const history = store.list("trendHistory");
  const values = history.map(sample => Number(sample.value)).filter(value => Number.isFinite(value));
  const latest = history[history.length - 1];
  return `<div>${pageHeader("روندها", "نمایش داده‌های تاریخی ثبت‌شده برای تگ‌های انتخاب‌شده", button("روند جدید", "new-trend", { icon: "+" }))}
    <div class="trend-tags">${rows.map((row, i) => `<button class="${i === 0 ? "active" : ""}" data-action="select-range">${row.name}</button>`).join("")}</div>
    <div class="trend-controls"><span>${pill(latest ? `تاریخچه دریافت شد · ${latest.quality || "UNSAMPLED"}` : "در انتظار داده", latest?.quality === "GOOD" ? "success" : latest ? "warning" : "muted")}</span><div class="range-pills">${["۱ ساعت","۶ ساعت","۲۴ ساعت"].map((x,i) => `<button data-action="select-range" class="${i === 2 ? "active" : ""}">${x}</button>`).join("")}</div></div>
    ${history.length ? lineChart("تاریخچه تگ نمونه · ۲۴ ساعت", undefined, "#e7a300", values) : panel("تاریخچه تله‌متری", emptyState("هنوز نمونه‌ای برای این تگ ثبت نشده است. بعد از شروع شبیه‌ساز داده‌ها در این بخش نمایش داده می‌شوند."))}
    ${panel("نمونه‌های اخیر", history.length ? dataTable([{key:"sampled_at",label:"زمان"},{key:"value",label:"مقدار"},{key:"quality",label:"کیفیت",render:row=>pill(row.quality || "DEMO","warning")},{key:"source",label:"منبع"}], history.slice(-50).reverse()) : emptyState("داده‌ای برای نمایش وجود ندارد."))}
    ${panel("مدیریت روندها", dataTable([{ key: "name", label: "نام روند" }, { key: "tags", label: "تگ‌ها" }, { key: "period", label: "بازه" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "success") }], rows, { actions: true }))}
  </div>`;
}

export function renderLive(path) {
  if (path === "/live/data") return liveDataPage();
  if (path === "/live/hmi-pages") return hmiPagesPage();
  if (path === "/live/classic") return classicHmiPage();
  if (path === "/live/alarms") return alarmsPage();
  if (path === "/live/trends") return trendsPage();
  return liveDataPage();
}
