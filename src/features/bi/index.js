import {
  button, dataTable, gradientBanner, lineChart, barChart, distributionDonutChart,
  panel, statCard, pill, emptyState
} from "../../shared/ui.js";
import { store } from "../../services/demo-store.js";

function count(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("fa-IR") : "—";
}

export function renderBi() {
  const snapshot = store.snapshot();
  const analytics = snapshot.analytics || {};
  const kpis = analytics.kpis || {};
  const distributions = analytics.distributions || {};
  const runs = store.list("productionRuns");
  const machines = store.list("machines");
  const factory = store.list("factories")[0];
  const daily = analytics.production_by_day || [];
  const runStatus = distributions.run_status || [];
  const qcStatus = distributions.qc_decisions || [];
  const machineRows = machines.map(machine => {
    const machineRuns = runs.filter(run => run.machine === machine.name);
    return {
      name: machine.name,
      code: machine.code || "—",
      run_count: machineRuns.length,
      running: machineRuns.filter(run => run.status === "در حال تولید").length,
      status: machine.status || "تعریف‌شده",
    };
  });
  const auditRows = (analytics.recent_activity || []).map(item => ({
    action: item.action,
    collection: item.collection || "—",
    record_id: item.record_id || "—",
    created_at: item.created_at ? new Date(item.created_at).toLocaleString("fa-IR") : "—",
  }));
  const chartDaily = daily.length > 14
    ? daily.filter((item, index) => index % Math.ceil(daily.length / 14) === 0 || index === daily.length - 1)
    : daily;
  const dailyLabels = chartDaily.map(item => new Date(item.day + "T00:00:00").toLocaleDateString("fa-IR", { month: "numeric", day: "numeric" }));
  const machineLabels = machineRows.map(item => item.name);
  const machineRunCounts = machineRows.map(item => item.run_count);
  const sampleMode = analytics.data_quality === "DEMO" ? "داده نمایشی" : "داده ثبت‌شده";

  return `<div class="bi-page">
    ${gradientBanner(
      "داشبورد مدیریتی هوش تجاری",
      `${factory?.name || "کارخانه انتخاب نشده"} · ${sampleMode} · آخرین دریافت: ${analytics.generated_at ? new Date(analytics.generated_at).toLocaleTimeString("fa-IR") : "—"}`,
      `${button("چیدمان فشرده", "toggle-bi-layout", { variant: "light" })}<a class="btn btn-light" href="#/system/storage">مرکز داده</a>${button("دانلود", "export-csv", { variant: "light", icon: "⇩" })}${button("تمام‌صفحه", "toggle-fullscreen", { variant: "light" })}${button("به‌روزرسانی", "refresh-demo", { variant: "light" })}`,
      "▥"
    )}
    <div class="dashboard-filters">
      <div class="range-pills">${[
        {days:1,label:"۲۴ ساعت"},
        {days:7,label:"۷ روز"},
        {days:30,label:"۳۰ روز"},
        {days:90,label:"۹۰ روز"},
        {days:365,label:"یک سال"}
      ].map(item => `<button data-action="select-bi-range" data-days="${item.days}" class="${analytics.period_days === item.days ? "active" : ""}">${item.label}</button>`).join("")}</div>
      <span class="muted-note">بازه انتخاب‌شده: ${analytics.period_days || 7} روز · گزارش‌های جاری بر اساس داده‌های ثبت‌شده در همین بازه</span>
    </div>

    <div class="stats-grid stats-grid-4">
      ${statCard("سفارش‌های فعال", count(kpis.active_order_count), "سفارش", "blue", "", "از وضعیت سفارش‌های ذخیره‌شده")}
      ${statCard("اجرای در حال تولید", count(kpis.running_count), "اجرا", "green", "", "وضعیت ثبت‌شده در Backend")}
      ${statCard("آلارم فعال", count(kpis.active_alarm_count), "آلارم", "red", "", "بر اساس وضعیت رکورد آلارم")}
      ${statCard("کنترل کیفیت در انتظار", count(kpis.pending_qc_count), "مورد", "orange", "", "رکوردهای بررسی‌نشده")}
    </div>
    <div class="stats-grid stats-grid-4">
      ${statCard("ماشین تعریف‌شده", count(kpis.machine_count), "ماشین", "blue", "", "موجودیت‌های ثبت‌شده")}
      ${statCard("تگ تعریف‌شده", count(kpis.tag_count), "تگ", "purple", "", "موجودیت‌های ثبت‌شده")}
      ${statCard("نمونه تلمتری در بازه", count(kpis.telemetry_samples_period), "نمونه", "green", "", "شامل کیفیت DEMO یا GOOD")}
      ${statCard("بچ در حال توزین", count(kpis.active_batch_count), "بچ", "orange", "", "وضعیت نرم‌افزاری")}
    </div>

    <div class="bi-grid">
      ${panel("وضعیت داده و شاخص‌های قابل محاسبه", `
        <div class="insight insight-info">این داشبورد اعداد را از پایگاه داده می‌خواند و مقدار ساختگی برای شاخص‌های اندازه‌گیری‌نشده نمایش نمی‌دهد.</div>
        <div class="insight insight-warning">OEE، مقدار واقعی تولید، انرژی و ضایعات تا زمان ثبت ورودی‌های معتبر و تعریف فرمول محاسبه، قابل گزارش نیستند.</div>
        <div class="insight insight-info">تعداد اجرای ثبت‌شده در هفت روز اخیر: <b>${count(daily.reduce((sum, item) => sum + Number(item.runs || 0), 0))}</b></div>
        <div class="insight insight-info">آخرین کیفیت تلمتری: <b>${analytics.latest_telemetry?.quality || "هنوز نمونه‌ای ثبت نشده"}</b></div>
      `)}
      ${donutChart("نتایج ثبت‌شده کنترل کیفیت", qcValues.length ? qcValues : [0, 0, 0])}
    </div>

    <div class="two-col-grid">
      ${lineChart(`تعداد اجرای ثبت‌شده در ${analytics.period_days || 7} روز اخیر`, dailyLabels, "#17b98a", chartDaily.map(item => Number(item.runs || 0)))}
      ${barChart("تعداد اجرا بر اساس ماشین", machineLabels.length ? machineLabels : ["بدون ماشین"], machineRunCounts.length ? machineRunCounts : [0])}
    </div>

    <div class="two-col-grid">
      ${panel("وضعیت اجرای تولید", runStatus.length ? dataTable([
        { key: "name", label: "وضعیت" },
        { key: "count", label: "تعداد", render: row => count(row.count) }
      ], runStatus) : emptyState("هنوز اجرای تولیدی ثبت نشده است."))}
      ${panel("نتایج کنترل کیفیت", qcStatus.length ? dataTable([
        { key: "name", label: "تصمیم" },
        { key: "count", label: "تعداد", render: row => count(row.count) }
      ], qcStatus) : emptyState("هنوز تصمیم کنترل کیفیت ثبت نشده است."))}
    </div>

    ${panel("ماشین‌ها و سوابق اجرای ثبت‌شده", machineRows.length ? dataTable([
      { key: "name", label: "ماشین" },
      { key: "code", label: "کد" },
      { key: "run_count", label: "تعداد اجرا", render: row => count(row.run_count) },
      { key: "running", label: "در حال اجرا", render: row => count(row.running) },
      { key: "status", label: "وضعیت" },
    ], machineRows) : emptyState("ماشینی در سامانه ثبت نشده است."))}
    ${panel("آخرین رویدادهای ثبت‌شده", auditRows.length ? dataTable([
      { key: "action", label: "رویداد" },
      { key: "collection", label: "بخش" },
      { key: "record_id", label: "شناسه رکورد" },
      { key: "created_at", label: "زمان" },
    ], auditRows) : emptyState("هنوز رویدادی در سابقه سیستم ثبت نشده است."))}
  </div>`;
}
