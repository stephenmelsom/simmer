import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const authMode = (process.env.AUTH_MODE ?? "oidc") as "oidc" | "disabled";

export const env = {
  port: Number(process.env.PORT ?? 8686),
  baseUrl: (process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 8686}`).replace(/\/$/, ""),
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
  get dbFile() {
    return process.env.DB_FILE ?? path.join(this.dataDir, "simmer.db");
  },
  get configFile() {
    return process.env.CONFIG_FILE ?? path.join(this.dataDir, "simmer.yaml");
  },
  /** Path to the built frontend; empty in dev (Vite serves it). */
  staticDir: process.env.STATIC_DIR ?? "",

  /** "oidc" (default) or "disabled" (local dev — fake session, no Pocket ID). */
  authMode,
  sessionSecret: authMode === "oidc" ? required("SESSION_SECRET") : (process.env.SESSION_SECRET ?? "dev-secret-not-for-production"),
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 7 * 24 * 3600),

  oidc: {
    issuer: authMode === "oidc" ? required("OIDC_ISSUER") : (process.env.OIDC_ISSUER ?? ""),
    clientId: authMode === "oidc" ? required("OIDC_CLIENT_ID") : (process.env.OIDC_CLIENT_ID ?? ""),
    clientSecret: authMode === "oidc" ? required("OIDC_CLIENT_SECRET") : (process.env.OIDC_CLIENT_SECRET ?? ""),
    scopes: process.env.OIDC_SCOPES ?? "openid profile email groups",
  },

  /** Fake identity used when AUTH_MODE=disabled. */
  devUser: {
    name: process.env.DEV_USER ?? "Developer",
    groups: (process.env.DEV_GROUPS ?? "admins,adults").split(",").map((g) => g.trim()).filter(Boolean),
  },

  userAgent: process.env.UPSTREAM_USER_AGENT ?? "Simmer/0.1 (homelab dashboard; +https://github.com/smelsom/simmer)",
};
