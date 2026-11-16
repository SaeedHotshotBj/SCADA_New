# SCADA_New

A modular, RTL Persian SCADA / HMI front-end reconstruction based on the supplied screen recording.

> **Important:** this is a front-end demonstration. It does not connect to a real PLC, Edge agent, MQTT broker, historian, production database, or industrial equipment. Values and actions are illustrative and stored locally in the browser only.

## Run locally

The project has no external runtime dependencies. Serve the folder with any static HTTP server; for example:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173` in a browser.

Use the demonstration login shown on the login screen. It only sets a local session flag and does not authenticate against a server.

## Architecture

The code is split into presentation, application, feature, service, and core layers:

```text
src/
  app/                 Route resolution, application bootstrap, delegated actions
  core/                Route metadata and shared formatting utilities
  features/            Screen modules grouped by business capability
    auth/
    batch/
    bi/
    equipment/
    live/
    planning/
    production/
    quality/
    reports/
    system/
    workflow/
  layouts/             Shared application frame and navigation
  services/            Browser-local demonstration data store
  shared/              Reusable UI primitives (tables, cards, panels, charts)
styles/                Responsive RTL theme and component styles
scripts/               Local project checks
```

## Included areas

- System administration: factories, users, Edge overview/registration, data center
- BI dashboard and KPI/production visualizations
- Equipment: PLCs and tag registry
- Live data, HMI page gallery, classic HMI overview, alarms, trends
- Reports and process records
- Workflow inbox and workflow templates
- Production planning board, machine calendar, operator station, production units, order dashboard
- Quality dashboard, pending inspections, inspection history, control plan
- Production execution, machine directory, factory configuration, prices/tariffs, production report
- Batch weighing, batch configuration, batch report, nominal-versus-actual comparison

## Validation

Run:

```bash
npm run check
```

This checks syntax for all JavaScript modules. It does not certify control-system behavior or a production deployment.
