import { renderLogin } from "../features/auth/login.js";
import { renderSystem } from "../features/system/index.js";
import { renderBi } from "../features/bi/index.js";
import { renderEquipment } from "../features/equipment/index.js";
import { renderLive } from "../features/live/index.js";
import { renderReports } from "../features/reports/index.js";
import { renderWorkflow } from "../features/workflow/index.js";
import { renderPlanning } from "../features/planning/index.js";
import { renderQuality } from "../features/quality/index.js";
import { renderProduction } from "../features/production/index.js";
import { renderBatch } from "../features/batch/index.js";
import { renderShell } from "../layouts/shell.js";

const registry = [
  ["/system/", renderSystem], ["/bi/", renderBi], ["/equipment/", renderEquipment],
  ["/live/", renderLive], ["/reports/", renderReports], ["/workflow/", renderWorkflow],
  ["/planning/", renderPlanning], ["/quality/", renderQuality], ["/production/", renderProduction],
  ["/batch/", renderBatch]
];

export function currentPath() {
  const raw = location.hash.replace(/^#/, "");
  return raw || (sessionStorage.getItem("scada-demo-auth") === "1" ? "/bi/dashboard" : "/login");
}

export function renderRoute(path) {
  if (path === "/login") return renderLogin();
  if (sessionStorage.getItem("scada-demo-auth") !== "1") return renderLogin();
  const entry = registry.find(([prefix]) => path.startsWith(prefix));
  const content = entry ? entry[1](path) : renderBi("/bi/dashboard");
  return renderShell(path, content);
}
