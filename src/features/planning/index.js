import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, emptyState } from "../../shared/ui.js";


function boardPage() {
  const orders = store.list("orders");
  const machineRows = store.list("machines");
  const machineNames = machineRows.length ? machineRows.map(row => row.name) : [];
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 1) % 7));
  const dateKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const days = Array.from({ length: 7 }, (_, index) => { const d = new Date(weekStart); d.setDate(weekStart.getDate()+index); return { date: dateKey(d), label: d.toLocaleDateString("fa-IR", { weekday: "short", day: "numeric" }) }; });
  const scheduled = orders.filter(row => row.machine && row.planned_start && row.planned_end && row.planned_start <= row.planned_end);
  const conflicts = scheduled.reduce((count, row, index) => count + scheduled.slice(index+1).filter(other => other.machine === row.machine && row.planned_start <= other.planned_end && other.planned_start <= row.planned_end).length, 0);
  const scheduledCells = scheduled.reduce((sum, row) => sum + days.filter(day => day.date >= row.planned_start && day.date <= row.planned_end).length, 0);
  const capacity = machineNames.length ? Math.round(scheduledCells * 100 / (machineNames.length * 7)) : 0;
  return `<div class="planning-page" data-collection-name="orders" data-edit-action="new-order">${pageHeader("تابلوی برنامه‌ریزی تولید", "برنامه فقط از سفارش‌هایی نمایش داده می‌شود که ماشین و تاریخ شروع/پایان برنامه‌ریزی برای آن‌ها ثبت شده باشد.", `${button("سفارش جدید", "new-order", { icon: "+" })}${button("به‌روزرسانی", "refresh-demo", { variant: "light" })}`)}
    <div class="stats-grid stats-grid-4">${statCard("کل سفارش‌ها", orders.length, "سفارش", "blue")}${statCard("در حال تولید", orders.filter(x => x.status === "در حال تولید").length, "سفارش", "green")}${statCard("ظرفیت برنامه ثبت‌شده", `${capacity}`, "%", "orange")}${statCard("تداخل بازه‌ها", conflicts, "مورد", conflicts ? "red" : "green")}</div>
    <div class="planning-toolbar"><div class="range-pills"><span class="active">هفته جاری · ${days[0].label} تا ${days[6].label}</span></div><div class="toolbar"><span class="muted-note">بازه نمایش: ${days[0].date} تا ${days[6].date}</span></div></div>
    ${panel("برنامه ماشین‌ها", machineNames.length ? `<div class="gantt-wrap"><div class="gantt-grid"><div class="gantt-head"><span>ماشین / روز</span>${days.map(day => `<b>${day.label}</b>`).join("")}</div>${machineNames.map(machine => `<div class="gantt-row"><b>${machine}</b>${days.map(day => { const matches = scheduled.filter(order => order.machine === machine && order.planned_start <= day.date && order.planned_end >= day.date); return `<div class="gantt-cell">${matches.map(order => `<button class="gantt-task" data-action="edit-record" data-id="${order.id}">${order.code} · ${order.product}</button>`).join("")}</div>`; }).join("")}</div>`).join("")}</div></div>` : emptyState("ابتدا ماشین تعریف کنید تا برنامه‌ریزی قابل نمایش باشد."))}
    ${panel("سفارش‌ها و تخصیص ماشین", orders.length ? dataTable([{ key: "code", label: "شماره سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "planned_start", label: "شروع برنامه" }, { key: "planned_end", label: "پایان برنامه" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "info") }, { key: "progress", label: "پیشرفت ثبت‌شده", render: row => `${Number(row.progress || 0).toLocaleString("fa-IR")}%` }, { key: "edit", label: "ویرایش", render: row => `<button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش سفارش</button>` }], orders) : emptyState("سفارشی ثبت نشده است."))}
    <div class="insight insight-info">سفارش بدون ماشین و بازه برنامه‌ریزی در Gantt نمایش داده نمی‌شود؛ هیچ شیفت یا تداخل فرضی ساخته نشده است.</div>
  </div>`;
}
function calendarPage() {
  const machines = store.list("machines").map(row => row.name).filter(Boolean);
  const calendars = store.list("machineCalendars");
  const current = calendars[0];
  const days = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
  const schedule = days.map((day, index) => current?.days?.find(item => item.day === day) || {
    day, enabled: index < 6, start: "08:00", end: index === 5 ? "13:00" : "17:00",
    break: index === 5 ? "00:30" : "01:00"
  });
  return `<div>${pageHeader("تقویم ماشین‌ها", "ذخیره روزهای کاری و ساعات شیفت برای هر ماشین در پایگاه داده")}
    <form class="panel" data-local-form="machine-calendar">
      <div class="panel-body">
        <div class="filter-bar">
          <label class="field"><span>ماشین</span><select name="machine" required>${machines.map(machine => `<option ${machine === current?.machine ? "selected" : ""}>${machine}</option>`).join("")}</select></label>
          <label class="field"><span>سال</span><input name="year" value="${current?.year || "1405"}" required></label>
          <label class="field"><span>ماه</span><select name="month" required>${["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"].map(month => `<option ${month === (current?.month || "آبان") ? "selected" : ""}>${month}</option>`).join("")}</select></label>
        </div>
        <div class="schedule-table">
          <div class="schedule-head"><b>روز هفته</b><b>وضعیت کاری</b><b>شروع شیفت</b><b>پایان شیفت</b><b>استراحت</b></div>
          ${schedule.map((day,index) => `<div class="schedule-row">
            <b>${day.day}</b>
            <label class="switch"><input type="checkbox" name="day_${index}_enabled" value="true" ${day.enabled ? "checked" : ""}><span></span></label>
            <input name="day_${index}_start" value="${day.start}" type="time" required>
            <input name="day_${index}_end" value="${day.end}" type="time" required>
            <input name="day_${index}_break" value="${day.break}" type="text" required>
          </div>`).join("")}
        </div>
      </div>
      <div class="panel-actions"><button class="btn btn-primary" type="submit">ذخیره تقویم</button></div>
    </form>
    ${panel("تقویم‌های ذخیره‌شده", calendars.length ? dataTable([{ key: "machine", label: "ماشین" }, { key: "year", label: "سال" }, { key: "month", label: "ماه" }, { key: "days", label: "روزهای تعریف‌شده", render: row => (row.days || []).filter(day => day.enabled).length }], calendars) : emptyState("هنوز تقویمی ذخیره نشده است."))}
  </div>`;
}

function operatorPage() {
  const orders = store.list("orders").filter(order => !["تکمیل‌شده", "لغوشده"].includes(order.status));
  const runs = store.list("productionRuns");
  const machines = store.list("machines").map(row => row.name).filter(Boolean);
  const operatorMachines = machines;
  return `<div>${pageHeader("ایستگاه اپراتور", "انتخاب سفارش و ماشین و ثبت اجرای تولید در ایستگاه کاری")}
    <div class="operator-select"><label class="field"><span>اپراتور</span><select><option>اپراتور نمونه</option><option>اپراتور شیفت صبح</option></select></label><label class="field"><span>ماشین</span><select name="operator-machine">${operatorMachines.map(x => `<option>${x}</option>`).join("")}</select></label><label class="field"><span>شیفت</span><select><option>صبح</option><option>عصر</option><option>شب</option></select></label></div>
    <div class="operator-grid">${orders.map((order, i) => `<article class="operator-card" data-run-card data-order-id="${order.id}" data-machine="${order.machine || ""}"><div class="operator-card-head"><span>${pill(order.status, order.status === "در حال تولید" ? "success" : "info")}</span><small>${order.machine || "هنگام شروع انتخاب می‌شود"}</small></div><h3>${order.code}</h3><p>${order.product}</p><div class="operator-progress"><span>پیشرفت سفارش</span><b>${order.progress || 0}٪</b><i><em style="width:${order.progress || 0}%"></em></i></div><div class="operator-metrics"><div><small>مقدار هدف</small><b>${Number(order.quantity).toLocaleString("fa-IR")} ${order.unit}</b></div><div><small>مقدار تولید</small><b>${Number(runs.find(run => run.order_id === order.id && run.status === "در حال تولید")?.quantity_actual || 0).toLocaleString("fa-IR")} ${order.unit}</b></div></div><div class="operator-actions"><button class="btn btn-primary" data-action="start-run" data-order-id="${order.id}">شروع اجرا</button><button class="btn btn-light" data-action="stop-run" data-order-id="${order.id}">توقف</button><span data-run-status>متوقف</span></div></article>`).join("")}</div>
  </div>`;
}

function unitsPage() {
  const units = store.list("units");
  return `<div class="collection-page" data-collection-name="units" data-edit-action="new-unit">${pageHeader("واحدهای تولید", "ردیابی قرقره‌ها، بسته‌ها و واحدهای تولیدی نهایی", button("واحد جدید", "new-unit", { icon: "+" }))}
    <div class="filter-bar">${dateFilter()}<label class="field"><span>وضعیت</span><select><option>همه</option><option>باز</option><option>بسته</option></select></label><button class="btn btn-primary btn-sm" data-action="apply-filter">جستجو</button></div>
    ${panel("فهرست واحدهای تولید", dataTable([{ key: "code", label: "کد واحد" }, { key: "quantity", label: "مقدار" }, { key: "unit", label: "واحد" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "success") }, { key: "created", label: "زمان ایجاد", render: () => "امروز · ۱۰:۳۵" }, { key: "label", label: "برچسب", render: row => `<button class="btn btn-light btn-sm" data-action="print-label" data-id="${row.id}">چاپ QR / لیبل</button>` }], units, { actions: true }))}
  </div>`;
}

function ordersPage() {
  const orders = store.list("orders");
  return `<div class="collection-page" data-collection-name="orders" data-edit-action="new-order">${pageHeader("داشبورد سفارش‌های تولید", "نمای کلی وضعیت سفارش‌ها، مقدار هدف و پیشرفت تولید", button("سفارش جدید", "new-order", { icon: "+" }))}
    <div class="stats-grid stats-grid-4">${statCard("کل سفارش‌ها", orders.length, "سفارش", "blue")}${statCard("در حال تولید", orders.filter(x => x.status === "در حال تولید").length, "سفارش", "green")}${statCard("آزادشده", orders.filter(x => x.status === "آزادشده").length, "سفارش", "orange")}${statCard("تکمیل‌شده", orders.filter(x => x.status === "تکمیل‌شده").length, "سفارش", "purple")}</div>
    ${panel("فهرست سفارش‌ها", dataTable([{ key: "code", label: "شماره سفارش" }, { key: "product", label: "محصول" }, { key: "quantity", label: "مقدار هدف" }, { key: "unit", label: "واحد" }, { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "در حال تولید" ? "success" : "info") }, { key: "progress", label: "پیشرفت", render: row => `<div class="progress-cell"><span>${row.progress || 0}٪</span><i><b style="width:${row.progress || 0}%"></b></i></div>` }, { key: "print", label: "عملیات", render: row => `<button class="btn btn-light btn-sm" data-action="edit-record" data-id="${row.id}">ویرایش جزئیات</button>` }], orders, { actions: true }))}
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
