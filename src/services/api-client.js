const host = location.hostname || "127.0.0.1";
export const API_BASE = window.SCADA_API_BASE || `${location.protocol}//${host}:8000`;

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
    body: options.body === undefined || options.body instanceof FormData
      ? options.body
      : JSON.stringify(options.body),
  });
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message = typeof payload === "object" && payload
      ? (payload.detail || payload.message || `HTTP ${response.status}`)
      : (payload || `HTTP ${response.status}`);
    throw new Error(String(message));
  }
  return payload;
}

export const api = {
  base: API_BASE,
  request,
  get: path => request(path),
  post: (path, body = {}) => request(path, { method: "POST", body }),
  patch: (path, body = {}) => request(path, { method: "PATCH", body }),
  delete: path => request(path, { method: "DELETE" }),
  login: credentials => request("/api/auth/login", { method: "POST", body: credentials }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  changePassword: body => request("/api/auth/change-password", { method: "POST", body }),
  me: () => request("/api/auth/me"),
  bootstrap: () => request("/api/bootstrap"),
  analyticsSummary: (days = 7) => request(`/api/analytics/summary?days=${encodeURIComponent(days)}`),
  analyticsStorage: () => request("/api/analytics/storage"),
  auditHistory: (limit = 100) => request(`/api/analytics/audit?limit=${encodeURIComponent(limit)}`),
  list: collection => request(`/api/resources/${encodeURIComponent(collection)}`),
  create: (collection, body) => request(`/api/resources/${encodeURIComponent(collection)}`, { method: "POST", body }),
  update: (collection, id, body) => request(`/api/resources/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  remove: (collection, id) => request(`/api/resources/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  startRun: id => request(`/api/operations/production-runs/${encodeURIComponent(id)}/start`, { method: "POST", body: {} }),
  stopRun: id => request(`/api/operations/production-runs/${encodeURIComponent(id)}/stop`, { method: "POST", body: {} }),
  completeRun: id => request(`/api/operations/production-runs/${encodeURIComponent(id)}/complete`, { method: "POST", body: {} }),
  recordProductionQuantity: (id, body) => request(`/api/operations/production-runs/${encodeURIComponent(id)}/quantity`, { method: "POST", body }),
  productionRunEvents: id => request(`/api/operations/production-runs/${encodeURIComponent(id)}/events`),
  startBatch: id => request(`/api/operations/batches/${encodeURIComponent(id)}/start`, { method: "POST", body: {} }),
  stopBatch: id => request(`/api/operations/batches/${encodeURIComponent(id)}/stop`, { method: "POST", body: {} }),
  completeBatch: id => request(`/api/operations/batches/${encodeURIComponent(id)}/complete`, { method: "POST", body: {} }),
  recordBatchWeighments: (id, body) => request(`/api/operations/batches/${encodeURIComponent(id)}/weighments`, { method: "POST", body }),
  listBatchWeighments: id => request(`/api/operations/batches/${encodeURIComponent(id)}/weighments`),
  cancelBatch: id => request(`/api/operations/batches/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }),
  approveTask: id => request(`/api/operations/workflow-tasks/${encodeURIComponent(id)}/approve`, { method: "POST", body: {} }),
  decideQc: (id, decision, note = "") => request(`/api/operations/qc/${encodeURIComponent(id)}/decision`, { method: "POST", body: { decision, note } }),
  recordQcMeasurement: (id, body) => request(`/api/operations/qc/${encodeURIComponent(id)}/measurements`, { method: "POST", body }),
  runReport: (id, parameters = {}) => request(`/api/operations/reports/${encodeURIComponent(id)}/run`, { method: "POST", body: { parameters } }),
  writeTag: (id, value) => request(`/api/telemetry/tags/${encodeURIComponent(id)}/write`, { method: "POST", body: { value } }),
  testPLC: id => request(`/api/plc/${encodeURIComponent(id)}/test`, { method: "POST", body: {} }),
  pollPLC: id => request(`/api/plc/${encodeURIComponent(id)}/poll`, { method: "POST", body: {} }),
  plcStatus: id => request(`/api/plc/${encodeURIComponent(id)}/status`),
  writePLC: (id, value, confirmation, reason = "manual-engineering-write") => request(`/api/plc/tags/${encodeURIComponent(id)}/write`, { method: "POST", body: { value, confirmation, reason } }),
  registerEdge: body => request("/api/edge/register", { method: "POST", body }),
  listEdges: () => request("/api/edge"),
  telemetryLatest: () => request("/api/telemetry/latest"),
  telemetryHistory: (tagId, hours = 24) => request(`/api/telemetry/history?tag_id=${encodeURIComponent(tagId)}&hours=${encodeURIComponent(hours)}`),
  telemetryHistorySeconds: (tagId, seconds, limit = 100000) => request(`/api/telemetry/history?tag_id=${encodeURIComponent(tagId)}&seconds=${encodeURIComponent(seconds)}&limit=${encodeURIComponent(limit)}`),
  ingestEdgeTelemetry: (token, samples) => request("/api/telemetry/edge/ingest", {
    method: "POST", headers: { "X-Edge-Token": token }, body: { samples },
  }),
  uploadHmiMedia: file => {
    const body = new FormData();
    body.append("file", file);
    return request("/api/hmi/media", { method: "POST", body });
  },
};
