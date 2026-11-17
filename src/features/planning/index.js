import { store } from "../../services/demo-store.js";
import { button, dataTable, pageHeader, panel, pill, tabs, statCard, dateFilter, emptyState } from "../../shared/ui.js";

const machines = ["کشش مفتول راد", "مولتی‌وایر", "بانچر", "اکسترودر عایق", "کابل‌کشی", "قرقره‌پیچ"];

function boardPage() {
  const orders = store.list("orders");
  return `<div class="planning-page">${pageHeader("تابلوی برنامه‌ریزی تولید", "نمای کلی سفارش‌های برنامه‌ریزی‌شده و تخصیص ظرفیت ماشین‌ها", `${button("سفارش جدید", "new-order", { icon: "+" })}${button("امروز", "refresh-demo", { variant: "light" })}`)}
    <div class="stats-grid stats-grid-4">${statCard("سفارش‌های برنامه‌ریزی‌شده", orders.length, "سفارش", "blue")}${statCard("در حال تولید", orders.filter(x => x.status === "در حال تولید").length, "سفارش", "green")}${statCard("ظرفیت برنامه", "۷۸", "%", "orange")}${statCard("تداخل برنامه", "۱", "مورد", "red")}</div>
    <div class="planning-toolbar"><div class="range-pills"><button class="active" data-action="select-range">هفته</button><button data-action="select-range">ماه</button><button data-action="select-range">شیفت</button></div><div class="toolbar">${button("‹ هفته قبل", "open-modal-info", { variant: "light", small: true })}${button("هفته بعد ›", "open-modal-info", { variant: "light", small: true })}</div></div>
    ${panel("برنامه ماشین‌ها", `<div class="gantt-wrap"><div class="gantt-grid"><div class="gantt-head"><span>ماشین / روز</span>${["شنبه ۱۶", "یکشنبه ۱۷", "دوشنبه ۱۸", "سه‌شنبه ۱۹", "چهارشنبه ۲۰", "پنجشنبه ۲۱", "جمعه ۲۲"].map(day => `<b>${day}</b>`).join("")}</div>${machines.map((machine, i) => `<div class="gantt-row"><b>${machine}</b>${Array.from({ length: 7 }, (_, d) => { const active = (i + d) % 4 !== 0; return `<div class="gantt-cell">${active && d < 5 ? `<button class="gantt-task gantt-${(i + d) % 4}" data-action="open-modal-info">${["PO-012 · کابل NYY", "PO-011 · سیم افشان", "تعمیر و نگهداری", "PO-010 · سیم ۱×۱۰"][(i + d) % 4]}</button>` : ""}</div>`; }).join("")}</div>`).join("")}</div></div>`)}
    ${panel("سفارش‌های تخصیص‌یافته", dataTable([{ key: "code", label: "شماره سفارش" }, { key: "product", label: "محصول" }, { key: "machine", label: "ماشین" }, { key: "status", label: "وضعیت", render: row => pill(row.status, "info") }, { key: "progress", label: "پیشرفت", render: row => `<div class="progress-cell"><span>${row.progress || 0}٪</span><i><b style="width:${row.progress || 0}%"></b></i></div>` }], orders.map((row, i) => ({ ...row, machine: machines[i % machines.length] }))))}
  </div>`;
}

function calendarPage() {
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
  const availableMachines = store.list("machines").map(row => row.name).filter(Boolean);
  const operatorMachines = availableMachines.length ? availableMachines : machines;
  return `<div>${pageHeader("ایستگاه اپراتور", "انتخاب سفارش و ماشین و ثبت اجرای تولید در ایستگاه کاری")}
    <div class="operator-select"><label class="field"><span>اپراتور</span><select><option>اپراتور نمونه</option><option>اپراتور شیفت صبح</option></select></label><label class="field"><span>ماشین</span><select name="operator-machine">${operatorMachines.map(x => `<option>${x}</option>`).join("")}</select></label><label class="field"><span>شیفت</span><select><option>صبح</option><option>عصر</option><option>شب</option></select></label></div>
    <div class="operator-grid">${orders.map((order, i) => `<article class="operator-card" data-run-card data-order-id="${order.id}" data-machine="${order.machine || "هنگام شروع انتخاب می‌شود"}"><div class="operator-card-head"><span>${pill(order.status, order.status === "در حال تولید" ? "success" : "info")}</span><small>${order.machine || "هنگام شروع انتخاب می‌شود"}</small></div><h3>${order.code}</h3><p>${order.product}</p><div class="operator-progress"><span>پیشرفت سفارش</span><b>${order.progress || 0}٪</b><i><em style="width:${order.progress || 0}%"></em></i></div><div class="operator-metrics"><div><small>مقدار هدف</small><b>${Number(order.quantity).toLocaleString("fa-IR")} ${order.unit}</b></div><div><small>مقدار تولید</small><b>${Math.round(Number(order.quantity) * (order.progress || 0) / 100).toLocaleString("fa-IR")} ${order.unit}</b></div></div><div class="operator-actions"><button class="btn btn-primary" data-action="start-run" data-order-id="${order.id}">شروع اجرا</button><button class="btn btn-light" data-action="stop-run" data-order-id="${order.id}">توقف</button><span data-run-status>متوقف</span></div></article>`).join("")}</div>
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
    ${panel("فهرست سفارش‌ها", dataTable([{ key: "code", label: "شماره سفارش" }, { key: "product", label: "محصول" }, { key: "quantity", label: "مقدار هدف" }, { key: "unit", label: "واحد" }, { key: "status", label: "وضعیت", render: row => pill(row.status, row.status === "در حال تولید" ? "success" : "info") }, { key: "progress", label: "پیشرفت", render: row => `<div class="progress-cell"><span>${row.progress || 0}٪</span><i><b style="width:${row.progress || 0}%"></b></i></div>` }, { key: "print", label: "گزارش", render: () => `<button class="btn btn-light btn-sm" data-action="open-modal-info">جزئیات</button>` }], orders, { actions: true }))}
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
