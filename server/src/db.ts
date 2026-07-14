import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

export type WidgetType = "metar" | "solar" | "links" | "clock" | "hunting";

export interface Placement {
  id: number;
  dashboard_id: number;
  widget: WidgetType;
  settings: Record<string, unknown>;
  grid_x: number;
  grid_y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  id: number;
  name: string;
}

fs.mkdirSync(path.dirname(env.dbFile), { recursive: true });

export const db = new Database(env.dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboards (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS widget_placements (
    id            INTEGER PRIMARY KEY,
    dashboard_id  INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    widget        TEXT NOT NULL,
    settings_json TEXT NOT NULL DEFAULT '{}',
    grid_x        INTEGER NOT NULL DEFAULT 0,
    grid_y        INTEGER NOT NULL DEFAULT 0,
    w             INTEGER NOT NULL DEFAULT 4,
    h             INTEGER NOT NULL DEFAULT 2
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    sub         TEXT NOT NULL,
    name        TEXT NOT NULL,
    email       TEXT,
    groups_json TEXT NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );
`);

const rowToPlacement = (r: any): Placement => ({
  id: r.id,
  dashboard_id: r.dashboard_id,
  widget: r.widget,
  settings: JSON.parse(r.settings_json),
  grid_x: r.grid_x,
  grid_y: r.grid_y,
  w: r.w,
  h: r.h,
});

export function listDashboards(): Dashboard[] {
  return db.prepare("SELECT id, name FROM dashboards ORDER BY id").all() as Dashboard[];
}

export function getDashboardByName(name: string): Dashboard | undefined {
  return db.prepare("SELECT id, name FROM dashboards WHERE name = ?").get(name) as Dashboard | undefined;
}

export function listPlacements(dashboardId: number): Placement[] {
  const rows = db
    .prepare("SELECT * FROM widget_placements WHERE dashboard_id = ? ORDER BY grid_y, grid_x, id")
    .all(dashboardId);
  return rows.map(rowToPlacement);
}

export function getPlacement(id: number): Placement | undefined {
  const row = db.prepare("SELECT * FROM widget_placements WHERE id = ?").get(id);
  return row ? rowToPlacement(row) : undefined;
}

export function dashboardCount(): number {
  const r = db.prepare("SELECT COUNT(*) AS n FROM dashboards").get() as { n: number };
  return r.n;
}

/** Replace all dashboards + placements atomically (used by YAML import/seed). */
export function replaceAllDashboards(
  dashboards: { name: string; widgets: Omit<Placement, "id" | "dashboard_id">[] }[],
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM widget_placements").run();
    db.prepare("DELETE FROM dashboards").run();
    const insDash = db.prepare("INSERT INTO dashboards (name) VALUES (?)");
    const insWidget = db.prepare(
      `INSERT INTO widget_placements (dashboard_id, widget, settings_json, grid_x, grid_y, w, h)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const d of dashboards) {
      const { lastInsertRowid } = insDash.run(d.name);
      for (const wgt of d.widgets) {
        insWidget.run(lastInsertRowid, wgt.widget, JSON.stringify(wgt.settings ?? {}), wgt.grid_x, wgt.grid_y, wgt.w, wgt.h);
      }
    }
  });
  tx();
}
