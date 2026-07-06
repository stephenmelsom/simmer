import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { env } from "./env.js";
import { db, dashboardCount, listDashboards, listPlacements, replaceAllDashboards, type WidgetType } from "./db.js";

/**
 * The YAML file is the portable snapshot: group→dashboard mapping + app
 * settings live here (config, not tables), while dashboards/widgets round-trip
 * between here and SQLite. SQLite is the source of truth once seeded.
 */

export interface GroupMapping {
  group: string;
  dashboard: string;
}

export interface AppConfig {
  skin: string;
  home_airport: string;
  group_dashboards: GroupMapping[];
  default_dashboard: string;
}

interface YamlWidget {
  widget: WidgetType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  settings?: Record<string, unknown>;
}

interface YamlShape extends Partial<AppConfig> {
  dashboards?: Record<string, { widgets?: YamlWidget[] }>;
}

const WIDGET_TYPES: WidgetType[] = ["metar", "solar", "links", "clock"];

let appConfig: AppConfig = {
  skin: "aviation",
  home_airport: "KBOI",
  group_dashboards: [],
  default_dashboard: "default",
};

export function getAppConfig(): AppConfig {
  return appConfig;
}

function parseYamlFile(file: string): YamlShape {
  const doc = YAML.parse(fs.readFileSync(file, "utf8"));
  if (!doc || typeof doc !== "object") throw new Error(`${file} is not a YAML mapping`);
  return doc as YamlShape;
}

function applyAppConfig(doc: YamlShape): void {
  appConfig = {
    skin: typeof doc.skin === "string" ? doc.skin : "aviation",
    home_airport: typeof doc.home_airport === "string" ? doc.home_airport.toUpperCase() : "KBOI",
    group_dashboards: Array.isArray(doc.group_dashboards)
      ? doc.group_dashboards
          .filter((m): m is GroupMapping => !!m && typeof m.group === "string" && typeof m.dashboard === "string")
      : [],
    default_dashboard: typeof doc.default_dashboard === "string" ? doc.default_dashboard : "default",
  };
}

function dashboardsFromYaml(doc: YamlShape) {
  const out: { name: string; widgets: { widget: WidgetType; settings: Record<string, unknown>; grid_x: number; grid_y: number; w: number; h: number }[] }[] = [];
  for (const [name, d] of Object.entries(doc.dashboards ?? {})) {
    const widgets = (d?.widgets ?? []).map((wgt) => {
      if (!WIDGET_TYPES.includes(wgt.widget)) throw new Error(`Unknown widget type "${wgt.widget}" in dashboard "${name}"`);
      return {
        widget: wgt.widget,
        settings: wgt.settings ?? {},
        grid_x: wgt.x ?? 0,
        grid_y: wgt.y ?? 0,
        w: wgt.w ?? 4,
        h: wgt.h ?? 2,
      };
    });
    out.push({ name, widgets });
  }
  return out;
}

/** Serialize app config + all dashboards from SQLite into YAML. */
export function exportYaml(): string {
  const dashboards: Record<string, { widgets: YamlWidget[] }> = {};
  for (const d of listDashboards()) {
    dashboards[d.name] = {
      widgets: listPlacements(d.id).map((p) => ({
        widget: p.widget,
        x: p.grid_x,
        y: p.grid_y,
        w: p.w,
        h: p.h,
        settings: p.settings,
      })),
    };
  }
  const doc: YamlShape = {
    skin: appConfig.skin,
    home_airport: appConfig.home_airport,
    group_dashboards: appConfig.group_dashboards,
    default_dashboard: appConfig.default_dashboard,
    dashboards,
  };
  return YAML.stringify(doc, { lineWidth: 120 });
}

/** Import a YAML snapshot: replaces dashboards in SQLite and rewrites the config file. */
export function importYaml(text: string): void {
  const doc = YAML.parse(text) as YamlShape;
  if (!doc || typeof doc !== "object") throw new Error("Import is not a YAML mapping");
  const dashboards = dashboardsFromYaml(doc);
  const names = new Set(dashboards.map((d) => d.name));
  const referenced = [
    ...(Array.isArray(doc.group_dashboards) ? doc.group_dashboards.map((m) => m?.dashboard) : []),
    doc.default_dashboard,
  ].filter((n): n is string => typeof n === "string");
  for (const n of referenced) {
    if (!names.has(n)) throw new Error(`Config references dashboard "${n}" that is not defined under dashboards:`);
  }
  applyAppConfig(doc);
  replaceAllDashboards(dashboards);
  fs.mkdirSync(path.dirname(env.configFile), { recursive: true });
  fs.writeFileSync(env.configFile, exportYaml(), "utf8");
}

const DEFAULT_CONFIG = `# Simmer configuration — https://simmer.themelsoms.com
# Edit this file (or use /api/config/import) and restart to apply.
skin: aviation            # aviation | workshop | field | crt
home_airport: KBOI        # drives the status-strip flight-category chip

# Checked top to bottom; the first group the user is in wins.
group_dashboards:
  - group: admins
    dashboard: admin
  - group: adults
    dashboard: home
  - group: kids
    dashboard: kids
  - group: guests
    dashboard: guest
default_dashboard: guest  # anyone in no listed group

dashboards:
  admin:
    widgets:
      - widget: clock
        x: 0
        y: 0
        w: 4
        h: 2
        settings:
          weather_source: open-meteo   # open-meteo | metar — never both
          latitude: 43.6166
          longitude: -116.2004
          place: Boise
          units: imperial              # imperial (°F) | metric (°C)
      - widget: metar
        x: 4
        y: 0
        w: 8
        h: 5
        settings:
          airports: [KBOI, KSEA, KPDX]
          show_taf: true
          refresh_seconds: 300
          units: imperial              # pulled-out T/DP; the raw METAR stays °C
      - widget: solar
        x: 0
        y: 2
        w: 4
        h: 3
        settings: {}
      - widget: links
        x: 0
        y: 5
        w: 12
        h: 3
        settings:
          groups:
            - name: Infra
              items:
                - name: Outline Wiki
                  url: https://outline.themelsoms.com
                  icon: "📖"
                  healthcheck: true    # health dot: server-side HEAD ping
                - name: Pocket ID
                  url: https://id.themelsoms.com
                  icon: "🔑"
                  healthcheck: true
            - name: Flying
              items:
                - name: SkyVector
                  url: https://skyvector.com
                  icon: "🗺️"
                - name: 1800wxbrief
                  url: https://www.1800wxbrief.com
                  icon: "🌤️"
                - name: FlightAware
                  url: https://flightaware.com
                  icon: "✈️"
            - name: Radio
              items:
                - name: QRZ
                  url: https://www.qrz.com
                  icon: "📻"
                - name: PSK Reporter
                  url: https://pskreporter.info/pskmap.html
                  icon: "📡"
                - name: POTA
                  url: https://pota.app
                  icon: "🏞️"
  home:
    widgets:
      - widget: clock
        x: 0
        y: 0
        w: 4
        h: 2
        settings:
          weather_source: open-meteo
          latitude: 43.6166
          longitude: -116.2004
          place: Boise
      - widget: metar
        x: 4
        y: 0
        w: 8
        h: 4
        settings:
          airports: [KBOI]
          show_taf: true
      - widget: links
        x: 0
        y: 2
        w: 4
        h: 3
        settings:
          groups:
            - name: Media
              items:
                - name: Outline Wiki
                  url: https://outline.themelsoms.com
                  icon: "📖"
  kids:
    widgets:
      - widget: clock
        x: 0
        y: 0
        w: 6
        h: 2
        settings:
          weather_source: open-meteo
          latitude: 43.6166
          longitude: -116.2004
          place: Boise
      - widget: links
        x: 0
        y: 2
        w: 12
        h: 3
        settings:
          groups: []
  guest:
    widgets:
      - widget: clock
        x: 0
        y: 0
        w: 6
        h: 2
        settings:
          weather_source: open-meteo
          latitude: 43.6166
          longitude: -116.2004
          place: Boise
`;

/**
 * Boot-time load: ensure a config file exists (write the default template if
 * not), read app config from it, and seed SQLite from its dashboards when the
 * database is empty. After seeding, SQLite is authoritative for dashboards.
 */
export function loadConfigAtBoot(): void {
  fs.mkdirSync(path.dirname(env.configFile), { recursive: true });
  if (!fs.existsSync(env.configFile)) {
    fs.writeFileSync(env.configFile, DEFAULT_CONFIG, "utf8");
    console.log(`[simmer] wrote default config to ${env.configFile}`);
  }
  const doc = parseYamlFile(env.configFile);
  applyAppConfig(doc);
  if (dashboardCount() === 0) {
    replaceAllDashboards(dashboardsFromYaml(doc));
    console.log(`[simmer] seeded dashboards from ${env.configFile}`);
  }
}
