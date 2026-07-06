import { Hono } from "hono";
import type { AuthEnv } from "../auth/middleware.js";
import { resolveDashboard, isAdmin } from "../dashboards.js";
import { exportYaml, importYaml, getAppConfig } from "../configYaml.js";
import { getMetars, validIcaos } from "../widgets/metar.js";
import { getSolar } from "../widgets/solar.js";
import { getOpenMeteo } from "../widgets/weather.js";
import { getLinkHealth } from "../widgets/links.js";

export const apiRoutes = new Hono<AuthEnv>();

apiRoutes.get("/session", (c) => {
  const user = c.get("user");
  return c.json({
    name: user.name,
    email: user.email,
    groups: user.groups,
    admin: isAdmin(user.groups),
  });
});

apiRoutes.get("/dashboard", (c) => {
  const user = c.get("user");
  return c.json(resolveDashboard(user.groups));
});

// ---- Widget data (proxied + cached; the browser never talks upstream) ----

apiRoutes.get("/widgets/metar", async (c) => {
  const ids = c.req.query("ids") ?? getAppConfig().home_airport;
  const taf = c.req.query("taf") !== "0";
  try {
    const result = await getMetars(validIcaos(ids), taf);
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, upstreamStatus(err));
  }
});

apiRoutes.get("/widgets/solar", async (c) => {
  try {
    return c.json(await getSolar());
  } catch (err) {
    return c.json({ error: (err as Error).message }, upstreamStatus(err));
  }
});

apiRoutes.get("/widgets/weather", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lon = Number(c.req.query("lon"));
  try {
    return c.json(await getOpenMeteo(lat, lon));
  } catch (err) {
    return c.json({ error: (err as Error).message }, upstreamStatus(err));
  }
});

apiRoutes.get("/widgets/links/health", async (c) => {
  const placement = Number(c.req.query("placement"));
  if (!Number.isInteger(placement)) return c.json({ error: "placement query param required" }, 400);
  try {
    return c.json(await getLinkHealth(placement));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// ---- YAML config round-trip ----

apiRoutes.get("/config/export", (c) => {
  if (!isAdmin(c.get("user").groups)) return c.json({ error: "admin group required" }, 403);
  c.header("Content-Type", "application/yaml; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="simmer.yaml"');
  return c.body(exportYaml());
});

apiRoutes.post("/config/import", async (c) => {
  if (!isAdmin(c.get("user").groups)) return c.json({ error: "admin group required" }, 403);
  const text = await c.req.text();
  try {
    importYaml(text);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

function upstreamStatus(err: unknown): 400 | 502 {
  const msg = (err as Error).message ?? "";
  return msg.startsWith("Invalid") || msg.startsWith("No airports") || msg.startsWith("Too many") ? 400 : 502;
}
