import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "./env.js";
import { requireAuth, type AuthEnv } from "./auth/middleware.js";
import { authRoutes } from "./routes/auth.js";
import { apiRoutes } from "./routes/api.js";

export function buildApp(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  app.get("/health", (c) => c.json({ ok: true, service: "simmer" }));
  app.route("/auth", authRoutes);

  // Everything below is session-gated (PRD: no anonymous access).
  app.use("*", requireAuth);
  app.route("/api", apiRoutes);

  if (env.staticDir) {
    const root = path.relative(process.cwd(), env.staticDir) || ".";
    app.use("*", serveStatic({ root }));
    // SPA fallback — client handles anything that isn't a real file.
    const indexHtml = fs.readFileSync(path.join(env.staticDir, "index.html"), "utf8");
    app.get("*", (c) => c.html(indexHtml));
  }

  return app;
}
