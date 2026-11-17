import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, lineChart, emptyState } from "../../shared/ui.js";

function runPage() {
  const runs = store.list("productionRuns");
  const machines = store.list("machines");
  const running = runs.filter(run => run.status === "در حال تولید").length;
  const stopped = runs.filter(run => run.status === "متوقف").length;
  const completed = runs.filter(run => run.status === "تکمیل‌شده").length;
  const machineRows = machines.map(machine => {
    const machineRuns = runs.filter(run => run.machine === machine.name);
    const activeRun = machineRuns.find(run => run.status === "در حال تولید");
    const lastRun = machineRuns[0];
    return {
      name: machine.name,
      code: machine.code || "—",
      runs: machineRuns.length,
      status: activeRun ? "در حال تولید" : lastRun?.status || "بدون اجرای ثبت‌شده",
    };
  });
  return `<div class="production-page">${pageHeader("اجرای تولید", "ثبت اجرای سفارش و پیگیری وضعیت نرم‌افزاری عملیات روی ماشین‌ها", button("شروع اجرای جدید", "new-run", { icon: "+" }))}
    <div class="stats-grid stats-grid-4">
      ${statCard("کل اجراهای ثبت‌شده", runs.length.toLocaleString("fa-IR"), "اجرا", "blue")}
      ${statCard("در حال اجرا", running.toLocaleString("fa-IR"), "اجرا", "green")}
      ${statCard("متوقف‌شده", stopped.toLocaleString("fa-IR"), "اجرا", "red")}
      ${statCard("تکمیل‌شده", completed.toLocaleString("fa-IR"), "اجرا", "orange")}
    </div>
    ${panel("وضعیت ماشین‌ها بر اساس اجرای ثبت‌شده", machineRows.length ? dataTable([
      { key: "name", label: "ماشین" },
      { key: "code", label: "کد تجهیز" },
      { key: "runs", label: "تعداد اجرا", render: row => row.runs.toLocaleString("fa-IR") },
      { key: "status", label: "آخرین وضعیت", render: row => pill(row.status, row.status === "در حال تولید" ? "success" : row.status === "متوقف" ? "warning" : "muted") },
    ], machineRows) : emptyState("ماشینی در سامانه ثبت نشده است."))}
    ${panel("تاریخچه اجرای تولید", runs.length ? dataTable([
      { key: "order", label: "سفارش" },
      { key: "product", label: "محصول" },
      { key: "machine", label: "ماشین" },
      { key: "target", label: "هدف ثبت‌شده" },
      { key: "unit", label: "واحد" },
      { key: "started_at", label: "شروع", render: row => row.started_at ? new Date(row.started_at).toLocaleString("fa-IR") : "—" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", row.status === "در حال تولید" ? "success" : row.status === "متوقف" ? "warning" : "muted") },
      { key: "actions", label: "عملیات", render: row => row.status === "در حال تولید" ? `<button class="btn btn-light btn-sm" data-action="stop-run" data-id="${row.id}">توقف وضعیت</button>` : row.status === "تکمیل‌شده" ? "—" : `<button class="btn btn-primary btn-sm" data-action="start-run" data-id="${row.id}">شروع وضعیت</button>` },
    ], runs) : emptyState("هنوز اجرای تولیدی ثبت نشده است. از «شروع اجرای جدید» یک اجرا ثبت کنید."))}
    <p class="muted-note">شروع و توقف در این نسخه وضعیت اجرای نرم‌افزاری را در پایگاه داده تغییر می‌دهد و فرمانی به موتور یا ماشین واقعی ارسال نمی‌کند.</p>
  </div>`;
}

function machinesPage() {
  const rows = store.list("machines");
  return `<div class="machine-directory" data-collection-name="machines" data-edit-action="new-machine">${pageHeader("ماشین‌ها و خطوط تولید", "مدیریت فهرست ماشین‌ها و کدهای تجهیز", button("ماشین جدید", "new-machine", { icon: "+" }))}
    ${rows.length ? rows.map(machine => `<article class="directory-card"><div class="directory-icon">⚙</div><div><h3>${machine.name}</h3><p>کد تجهیز: ${machine.code || "—"}</p></div><div class="directory-meta">${pill("تعریف‌شده", "info")}<small>وضعیت سخت‌افزاری از این رکورد قابل تأیید نیست</small></div><button class="btn btn-light btn-sm" data-action="edit-record" data-id="${machine.id}">ویرایش</button><button class="btn btn-light btn-sm" data-action="delete-record" data-collection="machines" data-id="${machine.id}">حذف</button></article>`).join("") : emptyState("ماشینی ثبت نشده است.")}
  </div>`;
}

function configPage() {
  const products = store.list("products");
  return `<div class="factory-config" data-collection-name="products" data-edit-action="new-product">${pageHeader("پیکربندی کارخانه", "مدیریت محصولات ثبت‌شده و قواعد پایه کارخانه", button("محصول جدید", "new-product", { icon: "+" }))}
    ${tabs(["محصولات و فیلدها", "اپراتورها", "علل توقف", "نوع ورودی", "خطوط توقف", "نوع خروجی قرقره", "شماره‌گذاری اسناد", "قواعد برنامه"])}
    ${panel("محصولات", dataTable([{ key: "code", label: "کد محصول" }, { key: "name", label: "نام محصول" }, { key: "unit", label: "واحد اصلی" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") }], products, { actions: true }))}
    <div class="two-col-grid">${panel("قواعد شماره‌گذاری", `<div class="storage-list"><div><span>شماره سفارش</span><b>PO-{YEAR}-{SEQ:6}</b></div><div><span>قرقره تولید</span><b>RL-{YEAR}-{SEQ:6}</b></div><div><span>شماره قرارداد</span><b>CT-{YEAR}-{SEQ:5}</b></div></div>`)}${panel("قواعد اجرای برنامه", `<div class="rule-list"><p>الزام انتخاب سفارش پیش از شروع تولید</p><p>ثبت کنتور تولید در زمان توقف و شروع مجدد، پس از اتصال منبع داده معتبر</p><p>ثبت علت برای توقف‌های برنامه‌ریزی‌نشده</p></div>`)}</div>
  </div>`;
}

function pricesPage() {
  const rows = store.list("prices");
  return `<div class="price-page" data-collection-name="prices" data-edit-action="new-price">${pageHeader("قیمت‌ها و تعرفه‌ها", "مدیریت قیمت مواد اولیه و تعرفه انرژی", button("ثبت قیمت / تعرفه", "new-price", { icon: "+" }))}
    ${tabs(["مواد اولیه", "قیمت مواد", "تعرفه انرژی"])}
    ${panel("فهرست قیمت‌ها و تعرفه‌های ثبت‌شده", rows.length ? dataTable([{ key: "kind", label: "گروه" }, { key: "code", label: "کد" }, { key: "name", label: "عنوان" }, { key: "price", label: "مبلغ واحد", render: row => Number(row.price || 0).toLocaleString("fa-IR") }, { key: "currency", label: "واحد پول" }, { key: "unit", label: "واحد اندازه‌گیری" }, { key: "valid_from", label: "تاریخ اعتبار" }, { key: "status", label: "وضعیت", render: row => pill(row.status || "فعال", row.status === "غیرفعال" ? "muted" : "success") }], rows, { actions: true }) : emptyState("قیمت یا تعرفه‌ای ثبت نشده است."))}
  </div>`;
}

function productionReportPage() {
  const rows = store.list("productionRuns");
  const machines = store.list("machines");
  const countsByMachine = machines.map(machine => ({
    name: machine.name,
    count: rows.filter(run => run.machine === machine.name).length,
  }));
  const statusCounts = ["در حال تولید", "متوقف", "تکمیل‌شده"].map(status => ({
    status,
    count: rows.filter(run => run.status === status).length,
  }));
  return `<div>${pageHeader("گزارش تولید", "گزارش‌گیری از اجراهای ثبت‌شده بر اساس خط، محصول، سفارش و بازه زمانی", button("خروجی CSV", "export-csv", { variant: "light" }))}
    <div class="report-builder">${dateFilter()}<label class="field"><span>وضعیت</span><select><option>همه وضعیت‌ها</option><option>تکمیل‌شده</option><option>در حال تولید</option><option>متوقف</option></select></label><label class="field"><span>خط تولید</span><select><option>همه خطوط</option>${machines.map(machine => `<option>${machine.name}</option>`).join("")}</select></label><label class="field"><span>گروه‌بندی</span><select><option>روزانه</option><option>سفارش</option><option>محصول</option><option>ماشین</option></select></label><button class="btn btn-primary" data-action="apply-filter">ساخت گزارش</button></div>
    <div class="stats-grid stats-grid-3">
      ${statCard("کل اجراهای ثبت‌شده", rows.length.toLocaleString("fa-IR"), "اجرا", "blue")}
      ${statCard("در حال تولید", statusCounts[0].count.toLocaleString("fa-IR"), "اجرا", "green")}
      ${statCard("ماشین دارای اجرا", countsByMachine.filter(item => item.count > 0).length.toLocaleString("fa-IR"), "ماشین", "orange")}
    </div>
    ${panel("اجرا بر اساس ماشین", countsByMachine.length ? dataTable([
      { key: "name", label: "ماشین" },
      { key: "count", label: "تعداد اجرا", render: row => row.count.toLocaleString("fa-IR") },
    ], countsByMachine) : emptyState("ماشینی ثبت نشده است."))}
    ${panel("جزئیات اجراهای تولید", rows.length ? dataTable([
      { key: "order", label: "سفارش" },
      { key: "product", label: "محصول" },
      { key: "machine", label: "خط" },
      { key: "target", label: "مقدار هدف" },
      { key: "unit", label: "واحد" },
      { key: "status", label: "وضعیت" },
      { key: "started_at", label: "شروع", render: row => row.started_at ? new Date(row.started_at).toLocaleString("fa-IR") : "—" },
    ], rows) : emptyState("برای گزارش تولید هنوز اجرایی ثبت نشده است."))}
    <p class="muted-note">مقدار تولید واقعی و ضایعات تا زمانی که کنتور و تگ‌های مربوط به تولید/ضایعات ثبت و به سفارش تخصیص داده نشوند، گزارش نمی‌شوند.</p>
  </div>`;
}

export function renderProduction(path) {
  switch (path) {
    case "/production/machines": return machinesPage();
    case "/production/config": return configPage();
    case "/production/prices": return pricesPage();
    case "/production/report": return productionReportPage();
    default: return runPage();
  }
}
