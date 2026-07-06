<script lang="ts">
  import { api } from "../lib/api";
  import type { Cached, SessionInfo, SolarReport, StationReport } from "../lib/types";

  let { session, homeAirport }: { session: SessionInfo; homeAirport: string } = $props();

  let now = $state(new Date());
  let home = $state<StationReport | null>(null);
  let hfSummary = $state<string | null>(null);

  $effect(() => {
    const clock = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(clock);
  });

  async function refreshHome() {
    try {
      const res = await api<Cached<StationReport[]>>(`/api/widgets/metar?ids=${homeAirport}&taf=0`);
      home = res.data[0] ?? null;
    } catch {
      home = null;
    }
  }

  async function refreshHf() {
    try {
      const res = await api<Cached<SolarReport>>("/api/widgets/solar");
      const good = res.data.bands.filter((b) => b.day.toLowerCase() === "good").length;
      const total = res.data.bands.length;
      hfSummary = total ? `HF ${good}/${total} GOOD · K${res.data.kIndex ?? "–"}` : null;
    } catch {
      hfSummary = null;
    }
  }

  $effect(() => {
    refreshHome();
    refreshHf();
    const metarTimer = setInterval(refreshHome, 5 * 60_000);
    const hfTimer = setInterval(refreshHf, 30 * 60_000);
    return () => {
      clearInterval(metarTimer);
      clearInterval(hfTimer);
    };
  });

  const pad = (n: number) => String(n).padStart(2, "0");
  let localTime = $derived(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
  let zuluTime = $derived(`${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}Z`);
</script>

<header class="strip data">
  <span class="brand">SIMMER</span>
  <span class="sep"></span>
  <span class="clock phosphor readout">{localTime}</span>
  <span class="zulu">{zuluTime}</span>
  <span class="sep"></span>
  {#if home}
    <span class="chip cat-{home.category}" title="{home.icao} flight category">
      <span class="led"></span>
      {home.icao} {home.category}
    </span>
  {:else}
    <span class="chip cat-UNKN"><span class="led"></span>{homeAirport} ——</span>
  {/if}
  {#if hfSummary}
    <span class="sep"></span>
    <span class="hf">{hfSummary}</span>
  {/if}
  <span class="spacer"></span>
  <span class="who">{session.name}</span>
  <a class="logout" href="/auth/logout">SIGN OUT</a>
</header>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--panel-raised);
    box-shadow: 0 1px 0 var(--bezel-line);
    font-size: 13px;
    position: sticky;
    top: 0;
    z-index: 10;
    white-space: nowrap;
    overflow-x: auto;
  }

  .brand {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.3em;
    color: var(--phosphor);
    text-shadow: 0 0 8px var(--phosphor-glow);
  }

  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--bezel-line);
  }

  .clock {
    font-size: 15px;
    padding: 0 2px;
  }

  .zulu {
    color: var(--chart-ink-dim);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 3px;
    box-shadow: 0 0 0 1px var(--cat);
    color: var(--cat);
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  .led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cat);
    box-shadow: 0 0 6px var(--cat);
  }

  .hf {
    color: var(--chart-ink-dim);
    letter-spacing: 0.06em;
  }

  .spacer {
    flex: 1;
  }

  .who {
    color: var(--chart-ink-dim);
    font-family: var(--font-body);
  }

  .logout {
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--chart-ink-dim);
  }
  .logout:hover {
    color: var(--phosphor);
    text-decoration: none;
  }
</style>
