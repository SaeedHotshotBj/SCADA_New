import { api } from "./api-client.js";

import { uid } from "../core/format.js";

const STORAGE_KEY = "scada-new-demo-state-v1";

const seed = {
  users: [
    { id: "u1", email: "admin@demo-cable.local", name: "Super Admin", role: "Organization Admin", status: "فعال", access: "همه منوها" },
    { id: "u2", email: "engineer@scada.local", name: "مهندس نمونه", role: "Engineer", status: "فعال", access: "همه منوها" },
    { id: "u3", email: "operator@scada.local", name: "اپراتور نمونه", role: "Operator", status: "فعال", access: "نمایش زنده" },
    { id: "u4", email: "planner@demo.local", name: "planner b208", role: "Production Planner", status: "فعال", access: "برنامه‌ریزی" },
    { id: "u5", email: "qc@demo.local", name: "qc1 b208", role: "Quality Control", status: "فعال", access: "کنترل کیفیت" }
  ],
  factories: [
    { id: "f1", name: "کارخانه کابل - دمو", code: "DEMO-CABLE", status: "فعال", edge: "EDGE-LOCAL-001", plcs: 1 },
    { id: "f2", name: "تست ارسال به PLC", code: "PLC-TEST", status: "فعال", edge: "EDGE-LOCAL-001", plcs: 1 },
    { id: "f3", name: "کارخانه نمونه", code: "FACTORY-03", status: "غیرفعال", edge: "—", plcs: 0 }
  ],
  plcs: [
    { id: "p1", name: "PLC شبیه‌ساز کارخانه کابل", protocol: "simulator", address: "127.0.0.1:1502", unit: "60", poll: "500 ms", active: "بله", status: "CONNECTED" }
  ],
  tags: [
    { id: "t1", name: "BN.Cmd.Start", plc: "PLC شبیه‌ساز کارخانه کابل", type: "bool", address: "00014", access: "read_write", unit: "", value: "false" },
    { id: "t2", name: "BN.Cmd.Stop", plc: "PLC شبیه‌ساز کارخانه کابل", type: "bool", address: "00015", access: "read_write", unit: "", value: "false" },
    { id: "t3", name: "BN.Current", plc: "PLC شبیه‌ساز کارخانه کابل", type: "float32", address: "40045", access: "read", unit: "A", value: "180.3366" },
    { id: "t4", name: "BN.Enable", plc: "PLC شبیه‌ساز کارخانه کابل", type: "bool", address: "00013", access: "read_write", unit: "", value: "true" },
    { id: "t5", name: "BN.Energy", plc: "PLC شبیه‌ساز کارخانه کابل", type: "float32", address: "40043", access: "read", unit: "kWh", value: "21879.416" },
    { id: "t6", name: "BN.Speed", plc: "PLC شبیه‌ساز کارخانه کابل", type: "float32", address: "40035", access: "read", unit: "m/min", value: "119.2585" },
    { id: "t7", name: "BN.SpeedSet", plc: "PLC شبیه‌ساز کارخانه کابل", type: "float32", address: "40037", access: "read_write", unit: "m/min", value: "120" },
    { id: "t8", name: "BN.Tension", plc: "PLC شبیه‌ساز کارخانه کابل", type: "float32", address: "40049", access: "read", unit: "N", value: "125.4806" }
  ],
  alarms: [],
  trends: [
    { id: "tr1", name: "سرعت ماشین‌های خط", tags: "BN.Speed, CP.Speed, IX.Speed", period: "۵ دقیقه", status: "فعال" },
    { id: "tr2", name: "دمای زون‌های اکسترودر", tags: "IX.Z1, IX.Z2, IX.Z3, IX.Z4", period: "۱ دقیقه", status: "فعال" },
    { id: "tr3", name: "قطر خارجی و فشار مذاب", tags: "IX.OD, IX.Melt", period: "۵ دقیقه", status: "فعال" }
  ],
  reports: [
    { id: "rp1", name: "پایش دمای اکسترودرها (ساعتی)", type: "ساعتی", tags: 10, status: "فعال" },
    { id: "rp2", name: "سرعت و توان ماشین‌ها (ساعتی)", type: "ساعتی", tags: 7, status: "فعال" },
    { id: "rp3", name: "گزارش روزانه انرژی و تأسیسات", type: "روزانه", tags: 4, status: "فعال" }
  ],
  processes: [
    { id: "pr1", name: "ثبت قرقره تکمیل‌شده", code: "REEL_COMPLETED", status: "فعال", fields: 5 },
    { id: "pr2", name: "کنترل کیفیت اکستروژن", code: "EXTRUSION_QC", status: "فعال", fields: 6 }
  ],
  templates: [
    { id: "wf1", name: "تأیید نهایی و بستن سفارش", steps: ["تأیید مدیر تولید", "تأیید کنترل کیفیت"], status: "پیش‌فرض" },
    { id: "wf2", name: "تأیید و آزادسازی سفارش تولید", steps: ["برنامه‌ریزی تولید", "بررسی کنترل کیفیت", "تخصیص ماشین و اپراتور"], status: "پیش‌فرض" }
  ],
  orders: [
    { id: "o1", code: "PO-1405-000012", product: "کابل قدرت NYY 4×16mm²", quantity: "1000000", unit: "m", status: "در حال تولید", progress: 46 },
    { id: "o2", code: "PO-1405-000011", product: "سیم افشان H07V-K 4mm²", quantity: "1000000", unit: "m", status: "آزادشده", progress: 0 },
    { id: "o3", code: "PO-1405-000010", product: "سیم 1×10 افشان", quantity: "1000000", unit: "m", status: "آزادشده", progress: 0 },
    { id: "o4", code: "PO-1405-000009", product: "سیم 1×10 افشان", quantity: "1000000", unit: "m", status: "آزادشده", progress: 0 }
  ],
  units: [
    { id: "un1", code: "RL-1405-000013", quantity: "72.0000", unit: "m", status: "بسته" },
    { id: "un2", code: "RL-1405-000012", quantity: "500.0000", unit: "m", status: "بسته" },
    { id: "un3", code: "RL-1405-000011", quantity: "500.0000", unit: "m", status: "بسته" },
    { id: "un4", code: "RL-1405-000010", quantity: "500.0000", unit: "m", status: "بسته" }
  ],
  qc: [
    { id: "qc1", code: "QC-CB-001148", product: "سیم 1×10 افشان", machine: "اکسترودر عایق", decision: "قبول", status: "بررسی‌شده" }
  ],
  batches: [],
  batchWeighments: [],
  productionRuns: []
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

let state = clone(seed);
let serverConnected = false;
let currentUser = null;
let selectedWeekOffset = 0;
let selectedTrendId = null;
let selectedTrendHours = 24;
let selectedAnalyticsDays = 7;

function emit() {
  window.dispatchEvent(new CustomEvent("scada:state-changed"));
}

async function hydrate() {
  const [snapshot, analytics, storage, audit, telemetry] = await Promise.all([
    api.bootstrap(),
    api.analyticsSummary(selectedAnalyticsDays),
    api.analyticsStorage(),
    api.auditHistory(50),
    api.telemetryLatest(),
  ]);
  const telemetryByTag = new Map((telemetry.items || []).map(item => [item.tag_id, item]));
  const tags = (snapshot.data.tags || []).map(tag => {
    const sample = telemetryByTag.get(tag.id);
    return sample ? {
      ...tag,
      value: sample.value,
      quality: sample.quality,
      source: sample.source,
      sampled_at: sample.sampled_at,
    } : { ...tag, quality: "UNSAMPLED", source: "seed" };
  });
  state = {
    ...clone(seed),
    ...snapshot.data,
    tags,
    analytics,
    storage,
    audit,
    telemetryLatest: telemetry,
  };
  currentUser = snapshot.user;
  serverConnected = true;
  emit();
  return { ...snapshot, analytics, storage, audit, telemetry };
}

export const store = {
  snapshot: () => state,
  currentUser: () => currentUser,
  isConnected: () => serverConnected,
  weekOffset: () => selectedWeekOffset,
  setWeekOffset: value => {
    selectedWeekOffset = Number.isFinite(Number(value)) ? Number(value) : 0;
    emit();
  },
  analyticsDays: () => selectedAnalyticsDays,
  setAnalyticsDays: async value => {
    const days = Number(value);
    if (![1, 7, 30, 90, 365].includes(days)) throw new Error("بازه داشبورد معتبر نیست.");
    const analytics = await api.analyticsSummary(days);
    selectedAnalyticsDays = days;
    state.analytics = analytics;
    emit();
  },
  trendId: () => selectedTrendId,
  setTrendId: value => {
    selectedTrendId = value || null;
  },
  trendHours: () => selectedTrendHours,
  setTrendHours: value => {
    const hours = Number(value);
    if ([1, 6, 24].includes(hours)) selectedTrendHours = hours;
  },
  initialize: async () => {
    try {
      await api.me();
      await hydrate();
      return true;
    } catch (error) {
      serverConnected = false;
      currentUser = null;
      throw error;
    }
  },
  loadAfterLogin: hydrate,
  refresh: hydrate,
  async loadBatchWeighments(batchId) {
    if (!serverConnected || !batchId) {
      state.batchWeighments = [];
      emit();
      return [];
    }
    const result = await api.listBatchWeighments(batchId);
    state.batchWeighments = Array.isArray(result.items) ? result.items : [];
    emit();
    return [...state.batchWeighments];
  },
  list: name => Array.isArray(state[name]) ? [...state[name]] : [],
  async add(name, record) {
    if (!serverConnected) throw new Error("اتصال به Backend برقرار نیست؛ ابتدا سرور را اجرا کنید.");
    const saved = await api.create(name, record);
    if (!Array.isArray(state[name])) state[name] = [];
    state[name].unshift(saved);
    emit();
    return saved;
  },
  async update(name, id, changes) {
    if (!serverConnected) throw new Error("اتصال به Backend برقرار نیست؛ ابتدا سرور را اجرا کنید.");
    const saved = await api.update(name, id, changes);
    if (!Array.isArray(state[name])) state[name] = [];
    const index = state[name].findIndex(row => row.id === id);
    if (index >= 0) state[name][index] = saved;
    else state[name].unshift(saved);
    emit();
    return saved;
  },
  async remove(name, id) {
    if (!serverConnected) throw new Error("اتصال به Backend برقرار نیست؛ ابتدا سرور را اجرا کنید.");
    await api.remove(name, id);
    state[name] = (state[name] || []).filter(row => row.id !== id);
    emit();
    return true;
  },
  reset() {
    throw new Error("بازنشانی داده‌های سرور از این صفحه مجاز نیست.");
  },
  clearSession() {
    serverConnected = false;
    currentUser = null;
    state = clone(seed);
    emit();
  },
  replaceCollection(name, rows) {
    state[name] = Array.isArray(rows) ? rows : [];
    emit();
  },
};
