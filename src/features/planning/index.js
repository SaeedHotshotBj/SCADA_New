import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, emptyState } from "../../shared/ui.js";

const weekDays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

function machineNames() {
  return store.list("machines").map(machine => machine.name).filter(Boolean);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function boardPage() {
  const orders = store.list("orders");
  const machines = machineNames();
  const scheduled = orders.filter(order => order.machine && order.planned_date);
  const running = orders.filter(order => order.status === "در حال تولید").length;
  const released = orders.filter(order => order.status === "آزادشده").length;
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + 7 * store.weekOffset());
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const header = weekDates.map(date => `<b>${date.toLocaleDateString("fa-IR", { weekday: "short", day: "numeric" })}</b>`).join("");
  const machineRows = machines.map((machine, index) => {
    const cells = weekDates.map(date => {
      const day = dateKey(date);
      const tasks = orders.filter(order => order.machine === machine && order.planned_date === day);
      return `<div class="gantt-cell">${tasks.map(order => `<button class="gantt-task gantt-${index % 4}" data-action="show-record" data-collection="orders" data-id="${order.id}">${order.code}</button>`).join("")}</div>`;
    }).join("");
    return `<div class="gantt-row"><b>${machine}</b>${cells}</div>`;
  }).join("");
  return `<div class="planning-page">${pageHeader("تابلوی برنامه‌ریزی تولید", "نمای سفارش‌های دارای ماشین و تاریخ برنامه‌ریزی ثبت‌شده در پایگاه داده", `${button("سفارش جدید", "new-order", { icon: "+" })}${button("به‌روزرسانی", "refresh-demo", { variant: "light" })}`)}
    <div class="stats-grid stats-grid-4">
      ${statCard("کل سفارش‌ها", orders.length.toLocaleString("fa-IR"), "سفارش", "blue")}
      ${statCard("آزادشده", released.toLocaleString("fa-IR"), "سفارش", "green")}
      ${statCard("در حال تولید", running.toLocaleString("fa-IR"), "سفارش", "orange")}
      ${statCard("دارای تخصیص و تاریخ", scheduled.length.toLocaleString("fa-IR"), "سفارش", "purple")}
    </div>
    <div class="planning-toolbar"><div class="range-pills"><button class="active" data-action="select-range">هفته</button><button data-action="select-range">ماه</button><button data-action="select-range">شیفت</button></div><div class="toolbar"><button class="btn btn-light btn-sm" data-action="move-week" data-delta="-1">‹ هفته قبل</button><button class="btn btn-light btn-sm" data-action="move-week" data-delta="1">هفته بعد ›</button></div></div>
    ${panel("برنامه ماشین‌ها", machines.length ? `<div class="gantt-wrap"><div class="gantt-grid"><div class="gantt-head"><span>ماشین / روز</span>${header}</div>${machineRows}</div></div>` : emptyState("ابتدا در بخش ماشین‌ها، ماشین تعریف کنید."))}
    ${panel("سفارش‌های ثبت‌شده و تخصیص‌یافته", orders.length ? dataTable([
      { key: "code", label: "شماره سفارش" },
      { key: "product", label: "محصول" },
      { key: "machine", label: "ماشین", render: row => row.machine || "بدون تخصیص" },
      { key: "planned_date", label: "تاریخ برنامه", render: row => row.planned_date || "بدون تاریخ" },
      { key: "status", label: "وضعیت", render: row => pill(row.status || "ثبت‌شده", row.status === "در حال تولید" ? "success" : "info") },
    ], orders, { actions: true }) : emptyState("هنوز سفارشی ثبت نشده است."))}
    <p class="muted-note">سفارش فقط زمانی در نمودار زمان‌بندی دیده می‌شود که هم ماشین و هم تاریخ برنامه‌ریزی آن ثبت شده باشد؛ ظرفیت و تداخل تا تعریف مدت عملیات محاسبه نمی‌شود.</p>
  </div>`;
}

function calendarPage() {
  const names = machineNames();
  const calendars = store.list("machineCalendars");
  const calendar = calendars[0] || {
    machine: names[0] || "",
    year: String(new Date().getFullYear()),
    month: "",
    days: [],
  };
  const days = weekDays;
  const dayRows = days.map((day,index) => {
    const saved = calendar.days?.find(item => item.day === day) || {};
    return `<div class="schedule-row"><b>${day}</b>
      <label class="switch"><input type="hidden" name="day_${index}_enabled" value="false"><input type="checkbox" name="day_${index}_enabled" value="true" ${saved.enabled ? "checked" : ""}><span></span></label>
      <input name="day_${index}_start" value="${saved.start || "08:00"}" type="time" required>
      <input name="day_${index}_end" value="${saved.end || "17:00"}" type="time" required>
      <input name="day_${index}_break" value="${saved.break || "01:00"}" type="time" required>
    </div>`;
  }).join("");
  return `<div>${pageHeader("تقویم ماشین‌ها", "تنظیم روزهای کاری، ساعات شیفت و استثناهای تقویم برای هر ماشین", `<button class="btn btn-primary" type="submit" form="machine-calendar-form">ذخیره تقویم</button>`)}
    <form id="machine-calendar-form" data-local-form="machine-calendar" data-id="${calendar.id || ""}">
      <div class="filter-bar">
        <label class="field"><span>ماشین</span><select name="machine" required>${names.map(name => `<option ${name === calendar.machine ? "selected" : ""}>${name}</option>`).join("")}</select></label>
        <label class="field"><span>سال</span><input name="year" value="${calendar.year || ""}" required></label>
        <label class="field"><span>ماه</span><input name="month" value="${calendar.month || ""}" required></label>
      </div>
      ${panel("برنامه هفتگی ماشین", names.length ? `<div class="schedule-table"><div class="schedule-head"><b>روز هفته</b><b>وضعیت کاری</b><b>شروع شیفت</b><b>پایان شیفت</b><b>استراحت</b></div>${dayRows}</div>` : emptyState("ابتدا ماشین تعریف کنید."))}
    </form>
    ${panel("استثناها و تعطیلات", emptyState("تعریف روزهای استثنا و تقویم تعطیلات در نسخه فعلی API موجود نیست."))}
  </div>`;
}

function operatorPage() {
  const orders = store.list("orders");
  const runs = store.list("productionRuns");
  const machines = machineNames();
  const operators = store.list("users").filter(user => ["Operator", "Production Manager", "Organization Admin", "Factory Admin"].includes(user.role));
  return `<div>${pageHeader("ایستگاه اپراتور", "انتخاب سفارش و ماشین و ثبت وضعیت اجرای تولید")}
    <div class="operator-select">
      <label class="field"><span>اپراتور</span><select name="operator_user">${operators.length ? operators.map(user => `<option value="${user.id}">${user.name || user.email}</option>`).join("") : `<option value="">کاربری تعریف نشده است</option>`}</select></label>
      <label class="field"><span>ماشین</span><select name="operator_machine">${machines.map(name => `<option>${name}</option>`).join("")}</select></label>
      <label class="field"><span>شیفت</span><select name="operator_shift"><option>صبح</option><option>عصر</option><option>شب</option></select></label>
    </div>
    <div class="operator-grid">${orders.length ? orders.map(order => {
      const run = runs.find(item => item.order_id === order.id && item.status !== "تکمیل‌شده");
      const running = run?.status === "در حال تولید";
      return `<article class="operator-card" data-run-card data-order-id="${order.id}" data-run-id="${run?.id || ""}" data-machine="${order.machine || ""}">
        <div class="operator-card-head"><span>${pill(run?.status || order.status || "ثبت‌شده", running ? "success" : "info")}</span><small>${order.machine || "ماشین در زمان اجرا انتخاب می‌شود"}</small></div>
        <h3>${order.code}</h3><p>${order.product}</p>
        <div class="operator-metrics"><div><small>مقدار هدف سفارش</small><b>${Number(order.quantity || 0).toLocaleString("fa-IR")} ${order.unit || ""}</b></div><div><small>تولید واقعی</small><b>تا اتصال کنتور ثبت نشده</b></div></div>
        <div class="operator-actions">${running ? `<button class="btn btn-light" data-action="stop-run" data-run-id="${run.id}">توقف وضعیت</button>` : `<button class="btn btn-primary" data-action="start-run" ${run ? `data-run-id="${run.id}"` : ""}>${run ? "شروع مجدد" : "شروع اجرا"}</button>`}<span data-run-status>${run?.status || "آماده شروع"}</span></div>
      </article>`;
    }).join("") : emptyState("سفارشی برای اجرا ثبت نشده است.")}
    </div>
    <p class="muted-note">شروع و توقف، وضعیت نرم‌افزاری اجرای سفارش را ذخیره می‌کند؛ تا زمان اتصال و تأیید آداپتور PLC، فرمان ماشین ارسال نمی‌شود.</p>
  </div>`;
}

function unitsPage() {
  const units = store.list("units");
  return `<div class="collection-page" data-collection-name="units" data-edit-action="new-unit">${pageHeader("واحدهای تولید", "ردیابی قرقره‌ها، بسته‌ها و واحدهای تولیدی نهایی", button("واحد جدید", "new-unit", { icon: "+" }))}
    <div class="filter-bar">${dateFilter()}<label class="field"><span>وضعیت</span><select><option>همه</option><option>باز</option><option>بسته</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("فهرست واحدهای تولید", units.length ? dataTable([
      { key: "code", label: "کد واحد" },
      { key: "quantity", label: "مقدار" },
      { key: "unit", label: "واحد" },
      { key: "status", label: "وضعیت", render: row => pill(row.status, "success") },
      { key: "created_at", label: "زمان ایجاد", render: row => row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—" },
      { key: "label", label: "برچسب", render: row => `<button class="btn btn-light btn-sm" data-action="print-label" data-id="${row.id}">چاپ QR / لیبل</button>` },
    ], units, { actions: true }) : emptyState("هنوز واحد تولیدی ثبت نشده است."))}
  </div>`;
}

function ordersPage() {
  const orders = store.list("orders");
  return `<div class="collection-page" data-collection-name="orders" data-edit-action="new-order">${pageHeader("داشبورد سفارش‌های تولید", "نمای کلی وضعیت سفارش‌ها، مقدار هدف و پیشرفت قابل اندازه‌گیری", button("سفارش جدید", "new-order", { icon: "+" }))}
    <div class="stats-grid stats-grid-4">
      ${statCard("کل سفارش‌ها", orders.length.toLocaleString("fa-IR"), "سفارش", "blue")}
      ${statCard("در حال تولید", orders.filter(x => x.status === "در حال تولید").length.toLocaleString("fa-IR"), "سفارش", "green")}
      ${statCard("آزادشده", orders.filter(x => x.status === "آزادشده").length.toLocaleString("fa-IR"), "سفارش", "orange")}
      ${statCard("تکمیل‌شده", orders.filter(x => x.status === "تکمیل‌شده").length.toLocaleString("fa-IR"), "سفارش", "purple")}
    </div>
    ${panel("فهرست سفارش‌ها", orders.length ? dataTable([
      { key: "code", label: "شماره سفارش" },
      { key: "product", label: "محصول" },
      { key: "quantity", label: "مقدار هدف" },
      { key: "unit", label: "واحد" },
      { key: "machine", label: "ماشین", render: row => row.machine || "بدون تخصیص" },
      { key: "planned_date", label: "تاریخ برنامه", render: row => row.planned_date || "—" },
      { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "در حال تولید" ? "success" : "info") },
      { key: "progress", label: "پیشرفت واقعی", render: () => "تا اتصال کنتور در دسترس نیست" },
      { key: "print", label: "گزارش", render: row => `<button class="btn btn-light btn-sm" data-action="show-record" data-collection="orders" data-id="${row.id}">جزئیات</button>` },
    ], orders, { actions: true }) : emptyState("هنوز سفارشی ثبت نشده است."))}
  </div>`;
}

export function renderPlanning(path) {
  switch (path) {
    case "/planning/calendar": return calendarPage();
    case "/planning/operator": return operatorPage();
    case "/planning/units": return unitsPage();
    case "/planning/orders": return ordersPage();
    default: return boardPage();
  }
}
