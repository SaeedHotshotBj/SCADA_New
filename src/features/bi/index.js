import { button, dataTable, gradientBanner, lineChart, barChart, donutChart, panel, statCard, pill, dateFilter, emptyState } from "../../shared/ui.js";
import { store } from "../../services/demo-store.js";
import { todayFa } from "../../core/format.js";

const numberFa = value => Number(value || 0).toLocaleString("fa-IR", { maximumFractionDigits: 2 });

export function renderBi() {
  const snapshot = store.snapshot();
  const metrics = snapshot.analytics?.metrics || {};
  const production = snapshot.productionAnalytics || {};
  const quality = snapshot.qualityAnalytics?.summary || {};
  const runs = production.items || [];
  const byDay = production.by_day || [];
  const machineTotals = new Map();
  for (const run of runs) {
    const name = run.machine || "نامشخص";
    machineTotals.set(name, (machineTotals.get(name) || 0) + Number(run.quantity_actual || 0));
  }
  const machines = [...machineTotals.entries()].sort((a, b) => b[1] - a[1]);
  const days = byDay.slice(-7);
  const hasProduction = runs.length > 0;
  const hasQuality = Number(quality.total || 0) > 0;
  const mode = snapshot.analytics?.mode || "APPLICATION_DATA";
  const insight = snapshot.analytics?.error || production.error || quality.error;
  const dataNote = mode === "DEMO"
    ? "بخشی از داده‌ها شبیه‌سازی‌شده‌اند؛ آن‌ها را داده عملیاتی PLC در نظر نگیرید."
    : "شاخص‌ها از رکوردهای ذخیره‌شده در Backend محاسبه شده‌اند؛ مقدار خالی به معنی نبود داده ثبت‌شده است.";
  const productionValue = metrics.recorded_production_quantity;
  const acceptance = quality.acceptance_percent;
  return `<div class="bi-page">${gradientBanner("داشبورد مدیریتی هوش تجاری", "شاخص‌های استخراج‌شده از اطلاعات ذخیره‌شده · " + todayFa(), `${button("به‌روزرسانی", "refresh-demo", { variant: "light" })}`, "▥")}
  <div class="dashboard-filters"><div class="range-pills">${["امروز", "۷ روز اخیر", "۳۰ روز اخیر"].map((x, i) => `<button data-action="select-range" class="${i === 1 ? "active" : ""}">${x}</button>`).join("")}</div>${dateFilter()}<span>${pill(mode === "DEMO" ? "داده آزمایشی" : "داده ذخیره‌شده", mode === "DEMO" ? "warning" : "success")}</span></div>
  ${insight ? `<div class="insight insight-warning">${String(insight)}</div>` : ""}
  <div class="insight insight-info">${dataNote}</div>
  <div class="stats-grid stats-grid-4">
    ${statCard("مقدار تولید ثبت‌شده", productionValue == null ? "—" : numberFa(productionValue), "واحد ثبت‌شده", "blue", "", "جمع مقدار ثبت‌شده در اجرای تولید")}
    ${statCard("اجرای تولید", numberFa(metrics.production_run_count), "اجرا", "green", "", numberFa(metrics.running_production_run_count) + " در حال تولید")}
    ${statCard("سفارش‌ها", numberFa(metrics.order_count), "سفارش", "orange", "", numberFa(metrics.running_order_count) + " در حال تولید")}
    ${statCard("آلارم‌های تعریف‌شده", numberFa(metrics.alarm_definition_count), "تعریف", "red", "", "رخداد فعال بدون قاعده آلارم محاسبه نمی‌شود")}
  </div>
  <div class="stats-grid stats-grid-4">
    ${statCard("بازرسی کیفیت", numberFa(quality.total), "رکورد", "blue", "", numberFa(quality.accepted) + " مورد قبول")}
    ${statCard("درصد پذیرش QC", acceptance == null ? "—" : numberFa(acceptance), "%", "green", "", "بر اساس تصمیم‌های ذخیره‌شده")}
    ${statCard("بچ‌ها", numberFa(metrics.batch_count), "بچ", "orange", "", numberFa(metrics.running_batch_count) + " در حال توزین")}
    ${statCard("نمونه‌های Telemetry", numberFa(metrics.telemetry_sample_count), "نمونه", "purple", "", "آخرین نمونه: " + (snapshot.analytics?.last_telemetry_at || "—"))}
  </div>
  <div class="two-col-grid">
    ${panel("وضعیت داده و اتصال", `<div class="storage-list">
      <div><span>کارخانه‌های قابل مشاهده</span><b>${numberFa(metrics.factory_count)}</b></div>
      <div><span>PLC های تعریف‌شده</span><b>${numberFa(metrics.plc_count)}</b></div>
      <div><span>تگ‌های تعریف‌شده</span><b>${numberFa(metrics.tag_count)}</b></div>
      <div><span>Edge ها</span><b>${numberFa(Object.values(metrics.edge_status_counts || {}).reduce((a,b)=>a+b,0))}</b></div>
      <div><span>کیفیت داده</span><b>${mode === "DEMO" ? "DEMO / آزمایشی" : "Application data"}</b></div>
    </div>`)}
    ${donutChart("نتیجه کنترل کیفیت", [Number(quality.accepted || 0), Number(quality.conditional || 0), Number(quality.rejected || 0), Number(quality.pending || 0)])}
  </div>
  <div class="two-col-grid">
    ${lineChart("مقدار تولید روزانه", days.length ? days.map(x => x.date) : ["بدون داده"], "#17b98a", days.length ? days.map(x => Number(x.quantity || 0)) : [0])}
    ${barChart("تولید ثبت‌شده بر اساس ماشین", machines.length ? machines.map(x => x[0]) : ["بدون داده"], machines.length ? machines.map(x => Number(x[1] || 0)) : [0])}
  </div>
  ${panel("کارنامه ماشین‌ها بر اساس اجرای ثبت‌شده", hasProduction ? dataTable([
    { key: "name", label: "ماشین" }, { key: "quantity", label: "مقدار تولید ثبت‌شده" }, { key: "runs", label: "تعداد اجرا" }
  ], machines.map(([name, quantity]) => ({ name, quantity: numberFa(quantity), runs: runs.filter(row => (row.machine || "نامشخص") === name).length }))) : emptyState("هنوز اجرای تولید و مقدار تولیدی در Backend ثبت نشده است."))}
  ${panel("آخرین اجراهای تولید", runs.length ? dataTable([
    { key: "order", label: "سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" },
    { key: "quantity_actual", label: "مقدار تولید" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "—", row.status === "در حال تولید" ? "success" : "muted") }
  ], runs.slice(0, 10)) : emptyState("داده‌ای برای نمایش وجود ندارد."))}
  </div>`;
}
