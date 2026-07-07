# Simmer

An aviation/radio homelab dashboard — a pilot's EFB home page for the household.
Custom widgets no existing dashboard has (a METAR board styled as a flight
instrument, live HF propagation), arranged and **gated by Pocket ID group** so
different household groups see different content from one deployment. Replaces
Flame as the daily start page. No search bar, on purpose.

Full product spec: [`specs/prd.md`](specs/prd.md).

## What's in the box

- **METAR/TAF board** (the hero) — flight-category beacon LED + colored edge rule
  (VFR green / MVFR blue / IFR red / LIFR magenta), raw teletype METAR in mono,
  pulled-out wind/vis/ceiling numbers, Zulu-labeled times. Data from the
  Aviation Weather Center API, parsed with `metar-taf-parser`, cached 5 min server-side.
- **Ham radio conditions** — SFI / SN / A / K indices + per-band day/night HF
  propagation from HamQSL, cached 1 h.
- **Service links** — grouped homelab bookmarks with optional health-ping dots.
- **Clock / weather** — local time + one selectable conditions source:
  Open-Meteo (default) *or* home-airport METAR. Never both.
- **Status strip** instead of a search bar: local time · Zulu · home-airport
  flight-category chip · HF summary.
- **Group-gated dashboards** — an ordered `group → dashboard` list in YAML;
  first group the user is in wins, `default_dashboard` catches the rest.
- **Auth** — built-in OIDC (authorization code + PKCE) against Pocket ID;
  signed httpOnly session cookie; sessions in SQLite.
- **Config** — SQLite is the source of truth (mounted volume); YAML
  export/import for backup and git-friendly diffing.

## Architecture

One container, two parts: a **Hono (Node/TypeScript)** backend that owns OIDC,
sessions, and a widget data proxy+cache (the browser never calls upstream APIs;
the server sets a real `User-Agent`, respects rate limits, and serves
stale-on-error), and a **Svelte 5 (Vite)** SPA it serves statically. Widgets are
first-party components wired directly — no plugin framework.

```
server/   Hono backend  — auth, sessions, widget fetchers, YAML round-trip
web/      Svelte SPA    — status strip + four widgets, "Night Cockpit" theme
data/     mounted       — simmer.db (SQLite) + simmer.yaml (editable config)
```

## Development

```sh
npm install
AUTH_MODE=disabled npm run dev     # server :8686 + Vite :5173 (proxies /api,/auth)
```

Open http://localhost:5173. `AUTH_MODE=disabled` fakes a session
(`DEV_USER`/`DEV_GROUPS` env to vary it) so you can develop without Pocket ID.

```sh
npm run check    # typecheck server + svelte-check web
npm run build    # web → web/dist, server → server/dist
```

On first boot the server writes a starter `data/simmer.yaml` and seeds SQLite
from it. Edit the YAML and restart (or POST it to `/api/config/import`) to
change dashboards.

## Deployment

1. **Register the OIDC client** in Pocket ID (Admin → OIDC Clients):
   - Callback URL: `https://themelsoms.com/auth/callback`
   - PKCE: enabled
   - Enable the **groups** scope/claim for the client — group routing depends on it.
2. **Configure**: `cp .env.example .env` and fill in the secrets
   (`openssl rand -base64 48` for `SESSION_SECRET`).
3. **Run**: `mkdir -p data && docker compose up -d --build`. Config and
   sessions live in `./data` and survive container recreation. Create the
   directory yourself first — if Docker auto-creates the bind mount it's owned
   by root, and the container (which runs as uid 1000) can't open its SQLite
   database. If you hit `SQLITE_CANTOPEN`, fix with:
   `docker run --rm --user root -v $PWD/data:/data simmer:latest chown node:node /data`
4. **Caddy** (LAN/Tailscale only, wildcard cert as usual):

   ```caddyfile
   themelsoms.com {
     reverse_proxy simmer-host:8686
   }
   ```

5. Document the service in the homelab Outline wiki (Home Network → service map).

## Configuration (`data/simmer.yaml`)

```yaml
skin: aviation            # aviation | workshop | field | crt
home_airport: KBOI        # status-strip flight-category chip

group_dashboards:         # checked top to bottom; first match wins
  - group: admins
    dashboard: admin
  - group: adults
    dashboard: home
default_dashboard: guest  # anyone in no listed group

dashboards:
  home:
    widgets:
      - widget: metar     # metar | solar | links | clock
        x: 4              # 12-column grid; rows are 88 px
        y: 0
        w: 8
        h: 4
        settings:
          airports: [KBOI, KSEA]
          show_taf: true
          refresh_seconds: 300
```

Widget settings reference:

| Widget | Settings |
|---|---|
| `metar` | `airports: [ICAO…]`, `show_taf`, `refresh_seconds`, `units` |
| `solar` | `refresh_seconds` |
| `links` | `groups: [{name, items: [{name, url, icon, healthcheck}]}]` — `icon` is an emoji or image URL |
| `clock` | `weather_source: open-meteo\|metar`, `latitude`, `longitude`, `place`, `airport`, `units` |

`units` is `imperial` (°F, mph — the default) or `metric` (°C, km/h). It affects
displayed temperatures and wind; aviation numbers stay aviation (knots, SM,
inHg), and the raw METAR string is always the unmodified °C teletype.

**Export / import** (requires membership in the first-listed group, i.e. admins):

```sh
curl -H "Cookie: $SESSION" https://themelsoms.com/api/config/export > simmer.yaml
curl -X POST --data-binary @simmer.yaml -H "Cookie: $SESSION" https://themelsoms.com/api/config/import
```

## API

| Route | Purpose |
|---|---|
| `GET /health` | liveness (unauthenticated) |
| `GET /auth/login` → Pocket ID → `GET /auth/callback` | OIDC flow; `GET /auth/logout` ends the session |
| `GET /api/session` | current user + groups |
| `GET /api/dashboard` | dashboard resolved from the user's groups |
| `GET /api/widgets/metar?ids=KBOI,KSEA&taf=1` | METAR/TAF, parsed + categorized |
| `GET /api/widgets/solar` | HF propagation snapshot |
| `GET /api/widgets/weather?lat=..&lon=..` | Open-Meteo current conditions |
| `GET /api/widgets/links/health?placement=ID` | health dots for one links widget |
| `GET /api/config/export` · `POST /api/config/import` | YAML round-trip (admin) |

Widget responses are wrapped as `{ data, stale, fetchedAt }` — `stale: true`
means the upstream fetch failed and you're seeing the last good value.
