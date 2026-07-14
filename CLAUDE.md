# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Simmer is an aviation/radio homelab dashboard: a Hono/TypeScript backend + Svelte 5 SPA, shipped as one container, gated by Pocket ID (OIDC) group. Different household groups see different dashboards from a single deployment. The product spec is [`specs/prd.md`](specs/prd.md) and the README is the user-facing reference; this file covers what's non-obvious from reading a single file.

## Commands

Run from the repo root (npm workspaces: `server`, `web`).

```sh
npm install
AUTH_MODE=disabled npm run dev   # server :8686 + Vite :5173 (proxies /api,/auth,/health → :8686)
npm run check                    # tsc --noEmit on server + svelte-check on web — run before committing
npm run build                    # web → web/dist, server → server/dist
```

- Develop against **http://localhost:5173** (Vite), not :8686 — the SPA is served by Vite in dev and proxies API/auth calls to the backend.
- `AUTH_MODE=disabled` fakes a session so you don't need Pocket ID. Vary the fake identity with `DEV_USER` and `DEV_GROUPS` (comma-separated) to test group-gated dashboard resolution and admin gating.
- There is **no test suite and no linter** — `npm run check` (typecheck) is the only automated gate.
- To run a single workspace's script: `npm run <script> --workspace=server` (or `web`).

## Architecture

One container, two parts. The backend owns all upstream network access; the browser only ever talks to our own `/api`.

- **`server/`** — Hono (Node/ESM). Note ESM import paths use `.js` extensions even for `.ts` source files (TypeScript `NodeNext`). Entry `index.ts` calls `loadConfigAtBoot()` then `buildApp()`.
- **`web/`** — Svelte 5 SPA (uses runes: `$state`, etc.). `App.svelte` fetches `/api/session` + `/api/dashboard`, then renders widget placements onto a 12-column CSS grid (`--gx/--gy/--gw/--gh`, 88px rows).

### Request pipeline (`server/src/app.ts`)
`/health` (open) → `/auth/*` (open) → `requireAuth` middleware gates **everything else** → `/api/*` routes → static file serving + SPA fallback (`serveStatic` + index.html for any non-file path). Order matters: auth is applied with `app.use("*", requireAuth)` before the API and static routes, so both are session-gated.

### Auth & sessions
- **Two auth modes** selected by `AUTH_MODE` (`env.ts`): `oidc` (default, requires `SESSION_SECRET` + `OIDC_*` or the process throws at boot) and `disabled` (dev, injects a fake `DEV_SESSION`).
- OIDC flow (`auth/oidc.ts` + `routes/auth.ts`): authorization-code + PKCE against Pocket ID via `openid-client`. Groups come from the ID token `groups` claim, falling back to the userinfo endpoint (Pocket ID only exposes groups there when the scope is enabled) — **group routing depends on the groups claim being present**.
- Sessions live in SQLite (`sessions` table), keyed by a random id carried in an HMAC-**signed** httpOnly cookie (`auth/session.ts`). `sign`/`unsign` use `SESSION_SECRET`; `unsign` is timing-safe.
- Gotcha worth preserving: the short-lived OIDC transaction cookie and callback URL. The txn payload (PKCE verifier + state) is **base64url-encoded** before signing because raw JSON quotes/commas make browsers silently drop the cookie. And the callback URL is rebuilt on `env.baseUrl` (`routes/auth.ts`) because behind Caddy the request arrives over plain HTTP but the registered redirect URI is the public HTTPS one.

### Config: SQLite is source of truth, YAML is the portable snapshot (`configYaml.ts`)
- App-level settings (`skin`, `home_airport`, `group_dashboards`, `default_dashboard`) live **only in YAML** and load into an in-memory `appConfig` at boot. Dashboards + widget placements **round-trip** between YAML and the `dashboards`/`widget_placements` SQLite tables.
- Boot: if no config file exists, write the `DEFAULT_CONFIG` template; always read app config from it; seed SQLite from its dashboards **only when the DB is empty**. After seeding, SQLite is authoritative for dashboards.
- Import (`POST /api/config/import`) replaces all dashboards atomically (`replaceAllDashboards`, a single transaction) and rewrites the YAML file from the DB. It validates that every dashboard referenced by `group_dashboards`/`default_dashboard` is actually defined.
- Changing dashboards means editing `data/simmer.yaml` + restart, **or** POSTing to the import endpoint.

### Dashboard resolution & admin (`dashboards.ts`)
- `resolveDashboard`: walk `group_dashboards` top-to-bottom, first group the user is in wins; else `default_dashboard`.
- `isAdmin`: the **first-listed** group in `group_dashboards` is the admin group (config export/import is restricted to it). Edge case: an empty mapping means there's no admin concept yet, so any authenticated user may manage config.

### Widgets (`server/src/widgets/`, `web/src/widgets/`)
Widgets are first-party — no plugin framework. Each server widget is a fetcher wrapped in `cached()` (`cache.ts`): a TTL cache with **stale-on-error** (serves the last good value flagged `stale: true` when the upstream refresh fails) and in-flight de-duplication (concurrent requests for a key share one fetch). All upstream calls go through `upstream()`, which sets the Simmer `User-Agent` and a hard timeout. Widget responses are wrapped `{ data, stale, fetchedAt }`.

Four widget types (the `WidgetType` union in `db.ts` and `WIDGET_TYPES` in `configYaml.ts` must stay in sync): `metar`, `solar` (HamQSL HF propagation), `links` (bookmarks + optional server-side health-ping), `clock` (Open-Meteo *or* home-airport METAR — never both). Adding a widget type touches: the union in `db.ts`, `WIDGET_TYPES`, a fetcher + API route, and the `{#if}` dispatch in `App.svelte`.

Aviation numbers stay aviation (knots, SM, inHg) regardless of the `units` setting; `units` (imperial default / metric) only affects displayed temp/wind, and the raw METAR string is always the unmodified °C teletype. METAR parsing uses `metar-taf-parser` (don't hand-roll); flight category is derived from ceiling + visibility in `metar.ts:flightCategory`.

## Deployment notes

Single container (`Dockerfile`, `docker-compose.yml`), runs as uid `node`, serves the built SPA from `STATIC_DIR=/app/web`, data in the `/data` volume (`simmer.db` + `simmer.yaml`). **Create `./data` yourself before first `docker compose up`** — a Docker-auto-created bind mount is root-owned and the non-root container can't open SQLite (`SQLITE_CANTOPEN`). Fronted by Caddy on the LAN/Tailscale (not public). See the README for the Pocket ID client registration steps (callback `https://themelsoms.com/auth/callback`, PKCE + groups scope) and the `SQLITE_CANTOPEN` fix.
