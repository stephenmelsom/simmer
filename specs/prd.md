# PRD — Simmer: An Aviation/Radio Homelab Dashboard, Gated by Pocket ID Group

## Context

**The thesis (why this exists):** Simmer renders **custom aviation and amateur-radio
widgets that no existing dashboard has** — a METAR board styled as a flight instrument,
live HF-propagation conditions — and **arranges and gates them by Pocket ID group**, so
different household groups see different content from one deployment. That combination is
the reason to build. Everything else (the theme, the auth) is a *consequence* of it.

I run a homelab (documented in a self-hosted Outline wiki, fronted by a wildcard-cert
Caddy reverse proxy, reachable on LAN/Tailscale) and currently use
[**Flame**](https://github.com/pawelmalak/flame) as my start page.

**Why not just fork an existing dashboard?** It was considered and rejected. A theme is
just CSS, and Pocket ID auth can be bolted onto *any* app via forward-auth at Caddy — so
"nicer theme" and "OIDC" are **not** build justifications on their own. What forks and
forward-auth can't give me is the thing that actually matters: **rendering widgets that
don't exist anywhere yet** (the instrument-styled METAR board, the propagation panel).
Once I'm hosting my own widgets, doing the group-based content routing inside that same app
is a small marginal cost. That is the honest driver; the theme and auth ride along.

Simmer is therefore:
- Built around **first-party aviation/radio widgets** (not a generic launcher, not a plugin host).
- **Gated and arranged by Pocket ID group** — group membership decides which dashboard renders.
- **Authenticated** with my existing **Pocket ID** passkey identity provider.
- **Themed**, led by **aviation** (I'm a pilot), because the widgets deserve a real visual identity.
- **No search bar** (explicitly unwanted).

### Decisions locked
| Question | Decision |
|---|---|
| Stack & deploy | **Self-hosted Docker container, TypeScript/Node backend + web UI** |
| Auth | **Built-in OIDC client** against Pocket ID (app owns login/session) |
| MVP widgets | **All four**: Service links, METAR/TAF board, Clock/date/weather, Ham radio conditions |
| Theme | **Aviation-forward** (instrument-panel aesthetic), with swappable accent skins for the other interests |
| Config store | **SQLite** for sessions + widget instances, with **YAML export/import** for portability |
| Frontend | **Svelte / SvelteKit** |
| Local weather | **Either-or, selectable**: Open-Meteo (default) *or* home-airport METAR — never both at once |
| Widgets | **First-party components, no plugin framework** — write each widget directly; extract shared structure only if repetition appears |
| Layouts | **Group-based**: ordered `group → dashboard` list in YAML, **first match wins**, `default` at the bottom |

---

## Goals

1. Ship a **METAR board styled as a flight instrument** — the hero widget and the whole
   reason to build. It must be spiked first (see Roadmap).
2. Render **different dashboard content per Pocket ID group** from a single deployment.
3. Ship four useful widgets day one: METAR/TAF board, Ham conditions, Service links,
   Clock/weather.
4. Single sign-on via Pocket ID — no anonymous access, no separate password.
5. A distinctive aviation-forward visual identity that doesn't read as a templated dashboard.
6. Self-hostable as one Docker container that slots behind the existing Caddy proxy —
   replacing Flame as the daily start page.

## Non-Goals (v1)

- **No search bar** (explicitly unwanted).
- No **per-user** personalization or collaboration — dashboards vary by **group**, not by
  individual. Two users in the same group see the same dashboard. (Per-user layouts remain
  a possible later revisit.)
- No public internet exposure — LAN/Tailscale only, consistent with the rest of the homelab.
- **No plugin/extension framework.** Widgets are first-party Svelte components wired
  directly — no manifest system, provider registry, or generic dispatcher. There is no
  third party; the only widget author is me. Extract shared structure *only* once real
  repetition appears, not up front.
- No mobile-native app (responsive web is enough).

---

## Architecture Overview

**One Docker container**, two logical parts:

- **Backend** — Node + TypeScript (Fastify or Hono recommended for a small, fast HTTP
  server). Responsibilities:
  - OIDC login/callback/session handling against Pocket ID.
  - **Widget data proxy + cache**: the browser never calls aviation/ham APIs directly.
    The backend fetches upstream, caches with per-source TTLs, sets a proper
    `User-Agent`, and enforces rate limits. This keeps API keys server-side, respects
    upstream rate limits (e.g. Aviation Weather's 100 req/min), and dodges CORS.
  - Serves the config (dashboard layout + widget settings) and the static frontend.
- **Frontend** — a small **Svelte / SvelteKit** SPA (smallest bundle, least boilerplate,
  clean CSS-custom-property story for the theme tokens). Renders the grid of widgets, each
  widget a self-contained component that pulls from a backend endpoint.

**Config/data store** — **SQLite** on a mounted volume holds sessions + widget instance
config, so airport lists, service links, and layout are editable in-UI (add/edit/reorder).
A **YAML export/import** provides portability, backup, and git-friendly diffing. SQLite is
the source of truth; YAML is a round-trippable snapshot.

**Deployment** — `docker run` / compose, published behind Caddy at e.g.
`https://simmer.themelsoms.com`. HTTPS is mandatory anyway because Pocket ID / WebAuthn
requires a secure context. Documented in the homelab Outline wiki as a new service.

### Widgets (no framework — just components)

Each widget is a **first-party Svelte component + a matching backend fetch function**,
wired directly. There is deliberately **no** manifest, provider registry, or generic
dispatcher — that machinery buys nothing when there is exactly one widget author and four
widgets. Concretely:

- **Backend**: one small route/function per data-backed widget (e.g. `getMetar(icaos)`,
  `getSolar()`, `getWeather(source, loc)`) that fetches upstream, caches with a per-source
  TTL, and sets a proper `User-Agent`. Add widget #5 by copying #4's fetcher and editing it.
- **Frontend**: one Svelte component per widget, owning its own loading / error / stale
  states. Add widget #5 by copying #4's component.
- If real repetition ever appears across widgets, extract a shared helper *then* — not now.

A **dashboard** = a named, ordered list of widget placements (which widgets, in what grid
positions), mapped to a Pocket ID group (see *Dashboards & Groups*). Drag-and-drop editing
is a later nicety; v1 ships config-defined layouts.

---

## Authentication — Pocket ID (built-in OIDC)

- App registers as an **OIDC client** in Pocket ID (Admin → OIDC Clients): name,
  launch URL, callback URL (`https://simmer.../auth/callback`), **PKCE enabled**.
- Backend uses a standard OIDC library (Node **`openid-client`**) for the
  authorization-code + PKCE flow. On callback, establish a signed httpOnly session cookie.
- All routes except `/auth/*` and static assets require a valid session; unauthenticated
  requests redirect to Pocket ID login.
- **Group membership** drives which dashboard a user sees. Pocket ID can return a
  **`groups`** claim in the ID token / userinfo; the app reads it at login and stores the
  user's groups on the session. (Requires the `groups` scope/claim to be enabled for this
  client in Pocket ID.) See *Dashboards & Groups* below.
- Config to supply via env/secrets: `OIDC_ISSUER` (Pocket ID URL), `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET`, `SESSION_SECRET`, `BASE_URL`.
- Reference: [Pocket ID](https://github.com/pocket-id/pocket-id) — passkey-first,
  standard OIDC, already integrated with 80+ self-hosted apps.

---

## Dashboards & Groups

A **dashboard** is a named layout (an ordered set of widget placements). Which one a user
sees is resolved from their Pocket ID **groups** via a simple **ordered list — no priority
integers, no admin UI**. The expected groups are hierarchical: **admins ▸ adults ▸ kids ▸
guests**. Because a user is often in several at once (an admin is also an adult), an ordered
list where **the order *is* the priority** resolves multi-membership naturally.

The mapping lives in the YAML config:

```yaml
# checked top to bottom; first group the user is in wins
group_dashboards:
  - group: admins    # highest — admins who are also adults still land here
    dashboard: admin
  - group: adults
    dashboard: home
  - group: kids
    dashboard: kids
  - group: guests
    dashboard: guest
default_dashboard: guest   # anyone in no listed group
```

**Resolution (at request time):**
1. Read the session's `groups`.
2. Walk `group_dashboards` top to bottom; serve the first dashboard whose group the user is in.
3. If none match, serve `default_dashboard`.

**Data model** (SQLite): `dashboards(id, name)` → `widget_placements(id, dashboard_id,
widget, settings_json, grid_x, grid_y, w, h)`. The `group → dashboard` mapping is config,
not a table. YAML export/import round-trips dashboards and the mapping.

No admin management surface in v1 — four groups defined once in YAML is enough. Add a
management screen only if a fifth group ever appears (it may never).

---

## MVP Widgets

### 1. Service Links / Bookmarks (the Flame replacement core)
- Grouped links to homelab services (e.g. "Media", "Infra", "Wiki") with icons.
- Optional **health ping** per link (backend does a HEAD/GET, shows up/down dot). This
  is the one genuinely-better-than-Flame touch worth including.
- Settings: groups → items `{ name, url, icon, healthcheck? }`.

### 2. METAR/TAF Board *(hero widget — the reason to build; spike first)*
- Latest **METAR + TAF** for a configured list of airports (ICAO codes).
- **Data source**: Aviation Weather Center REST API — no auth, public, rate-limited to
  100 req/min (backend sets a custom `User-Agent` and caches ~5 min):
  - METAR: `https://aviationweather.gov/api/data/metar?ids=KXXX&format=json`
  - TAF:  `https://aviationweather.gov/api/data/taf?ids=KXXX&format=json`
  - Docs: https://aviationweather.gov/data/api/
- **Lead with the instrument, not prose.** The card's value is the **flight-category
  treatment** (beacon LED + colored edge rule: VFR green / MVFR blue / IFR red / LIFR
  magenta, from ceiling + visibility) + the **raw METAR string** + a few **pulled-out
  numbers** (wind, ceiling, visibility) in mono. A pilot reads the raw string natively, so
  a full plain-English sentence is *not* a headline feature — at most a small secondary
  line, and explicitly out of scope to make bulletproof.
- **Parsing**: use the maintained **`metar-taf-parser`** npm library (handles METAR *and*
  TAF change-groups, typed output). Do **not** hand-roll a parser to "save money" — renting
  is the cheap path; hand-rolling is only justified as a deliberate exercise.
- Settings: airport list, units, refresh interval.

### 3. Clock / Date / Local Weather
- Local time + date, glanceable. Small header-style card.
- Current conditions from **one selectable source — never both at once** (avoids two
  weather readouts contradicting each other on the same screen):
  - **Open-Meteo** (default) — free, no API key, civilian weather (temp, "feels like",
    humidity, wind, conditions, short forecast). Coordinates or place name in settings.
    Endpoint: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=..`
    · Docs: https://open-meteo.com/en/docs
  - **Home-airport METAR** (alternate) — reuses the METAR fetch; aviation units, Zulu.
  - Backend proxies + caches (~15 min TTL). A `source` setting picks one.
- This is independent of the dedicated METAR/TAF *board* widget (which always shows METAR).
  The either-or rule is only about the **conditions readout** never rendering two
  disagreeing numbers.

### 4. Ham Radio Conditions
- HF propagation snapshot: **Solar Flux Index (SFI), Sunspot Number (SN), A/K index**,
  and **per-band day/night conditions**.
- **Data source**: [HamQSL solar XML feed](https://www.hamqsl.com/solar.html)
  (`https://www.hamqsl.com/solarxml.php`), updated ~every 3 hours; backend parses XML →
  JSON, caches ~1–3 h.
- Stretch: POTA/SOTA activation spots (`api.pota.app`) — deferred to a later widget.

---

## Theme & Visual Identity

**Design thesis**: Simmer is a pilot's personal EFB (electronic flight bag) home page.
Every screen should read like a **glass-cockpit MFD** — dense, calm, glanceable, with the
single job of surfacing flight category, propagation, and service status in one look. The
design is grounded in the actual cockpit vernacular (ICAO codes, Zulu time, teletype
METAR, flight-category cartography, phosphor avionics glow), not generic "dashboard."

This deliberately avoids the templated dark-UI look. The accent system is **functional,
not decorative**: the palette's colors carry FAA-standard meaning, so color is data.

### Color — "Night Cockpit"
Named tokens (implement as CSS custom properties; skins remap only the accent + texture):
| Token | Hex | Role |
|---|---|---|
| `--panel-black` | `#0B0E11` | Instrument bezel base (near-black, faint blue-green cast — not pure black) |
| `--panel-raised` | `#151A1F` | Raised card / MFD tile surface |
| `--bezel-line` | `#242C33` | Hairline panel seams between widgets |
| `--chart-ink` | `#C9D3DA` | Body text (cool sectional-chart ink) |
| `--phosphor` | `#E8B23A` | Amber data glow — headings, ICAO codes, live readouts (the one bold accent) |
| **Flight-category set** (functional, FAA-standard) | | |
| `--vfr` | `#17B978` | VFR — green |
| `--mvfr` | `#2E7DD1` | MVFR — blue |
| `--ifr` | `#E23D4B` | IFR — red |
| `--lifr` | `#C043C1` | LIFR — magenta |

### Type
- **Display / labels / ICAO codes**: **Chakra Petch** — a squared-off technical face with
  a genuine HUD/avionics character, used with restraint for headings, eyebrows, and codes.
  (Deliberately *not* a cream-serif; on-subject rather than default.)
- **Body**: **IBM Plex Sans** (or Inter) — clean humanist sans for prose and settings.
- **Data**: **IBM Plex Mono** with a **slashed zero** — for METAR/TAF strings and solar
  indices. METAR is literally teletype; tabular mono is the honest rendering, and the
  slashed zero disambiguates `0`/`O` in station IDs.
- Clear type scale with intentional weights; data uses tabular figures so numbers don't jitter on refresh.

### Layout & signature elements
- **Anti-search-bar header = an avionics status strip.** A thin top bar (like an MFD data
  band) replaces Flame's search: **local time · Zulu (UTC) time · home-airport flight
  category chip · HF band summary**. This is the characteristic opening moment and the
  explicit answer to "no search bar."
- **The METAR card is an instrument** (the signature): a flight-category **beacon LED** in
  the card corner (reads as an airport rotating beacon) plus a **colored edge rule** in the
  category color; the raw METAR in mono; times in **Zulu**. The category color is the
  card's whole personality, so the dashboard's color state *is* the weather at a glance.
- **Panel-seam grid**: widgets sit in a grid divided by `--bezel-line` hairlines like
  instrument-panel seams — zero heavy borders, structure carried by light and rule.
- **Texture, sparingly**: a faint sectional-chart contour line in the page background and a
  subtle phosphor scanline *only* on live data readouts. Nowhere else.

### Motion (restrained)
- One **power-on sweep** on first load (avionics boot), then still. Card hover = a subtle
  backlit-button lift. `prefers-reduced-motion` disables both. No ambient animation
  elsewhere — motion that doesn't serve the instrument metaphor reads as AI-generated.

### Skins (swappable accents — one system, palette swap)
Aviation is the base. Other-interest skins remap **only** `--phosphor` + background texture,
never the layout or the flight-category set:
- **Workshop** — warm amber on walnut, blueprint contour texture (woodworking).
- **Field** — olive/earth accent on a topographic contour (hunting/outdoors + radio fieldwork).
- **CRT** — green phosphor on black, faint scanline (amateur radio / retro avionics).

### UX writing
Interface voice, active, specific — never system jargon. A stale/failed widget states what
happened and what to do ("No METAR for KXXX in 20 min — check the station or your network"),
in the app's voice, not an apology. An empty dashboard invites the first action ("Add a
widget to get started"). Actions keep one name through a flow (the "Add airport" button
produces an "Airport added" confirmation). Times that matter to flying are labeled **Z**.

Design work is first-class: derive every color/type decision from the tokens above rather
than reaching for defaults, so Simmer can't be mistaken for a stock dashboard.

---

## Non-Functional Requirements

- Single container, small image, fast cold start.
- Config on a mounted volume; survives container recreation.
- Graceful widget degradation: an upstream API being down shows a stale/error state on
  that card only, never breaks the dashboard.
- Respect upstream rate limits via server-side caching; never fan out per-browser.
- HTTPS-only (required by Pocket ID/WebAuthn); runs behind Caddy.

---

## Roadmap

Ordered so the **novel, risky, whole-point feature is de-risked first** — before any auth
plumbing or theme polish. If the hero widget isn't satisfying to build and use, better to
find out in week one.

- **M0 — Skeleton**: Docker container, Node backend serving a static frontend, health route.
- **M1 — METAR-instrument spike** *(the point of the project)*: the METAR/TAF board with
  **real Aviation Weather data**, flight-category instrument styling, and `metar-taf-parser`.
  Prove the hero experience end to end before building anything around it.
- **M2 — Remaining widgets**: Ham conditions, Service links (with health pings),
  Clock/weather (selectable source). Four direct components + fetchers — no framework.
- **M3 — Auth**: Pocket ID OIDC login + sessions; **read the `groups` claim**; everything gated.
- **M4 — Group → dashboard routing**: ordered `group → dashboard` YAML mapping, first match
  wins, `default` fallback.
- **M5 — Theme polish**: aviation-forward skin + swappable accent palettes.
- **M6 — Editing UX** *(optional / v1.1)*: add/remove/reorder widgets in-UI (drag-and-drop).

---

## Verification (how we'll know it's done)

- **Auth**: hitting `simmer.themelsoms.com` while logged out redirects to Pocket ID; a
  passkey login lands on the dashboard; clearing the session re-gates all routes.
- **Group routing**: a user in `adults` sees the home dashboard; a user in both `admins`
  and `adults` sees the **admin** dashboard (first match in the ordered list wins); a user
  in no listed group sees `default_dashboard`. Verify the `groups` claim is actually present
  on the session (Pocket ID client scope configured), and that changing a user's groups
  changes their dashboard on next login.
- **METAR/TAF**: configured airports show current METAR + TAF matching
  aviationweather.gov; flight-category colors are correct against known conditions;
  killing network shows a stale/error state on just that card. Verify the backend sends a
  custom `User-Agent` and caches (no more than ~1 upstream call per airport per TTL).
- **Ham widget**: SFI/SN/K-index and band conditions match hamqsl.com at the same time.
- **Service links**: links open correctly; health dots reflect a service being stopped.
- **Clock/weather**: switching the `source` setting flips the readout between Open-Meteo and
  home-airport METAR; only one is ever shown.
- **Deploy**: container comes up via compose behind Caddy, config persists across a
  container recreate, and the service is documented in the homelab Outline wiki.

---

## Sources
- [Aviation Weather Data API](https://aviationweather.gov/data/api/)
- [HamQSL HF Propagation / Solar-Terrestrial Data](https://www.hamqsl.com/solar.html)
- [Open-Meteo Weather API](https://open-meteo.com/en/docs)
- [Pocket ID (GitHub)](https://github.com/pocket-id/pocket-id)
