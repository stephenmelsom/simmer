<script lang="ts">
  import { api } from "./lib/api";
  import type { ResolvedDashboard, SessionInfo } from "./lib/types";
  import StatusStrip from "./components/StatusStrip.svelte";
  import MetarBoard from "./widgets/MetarBoard.svelte";
  import HamConditions from "./widgets/HamConditions.svelte";
  import ServiceLinks from "./widgets/ServiceLinks.svelte";
  import ClockWeather from "./widgets/ClockWeather.svelte";
  import Hunting from "./widgets/Hunting.svelte";

  let session = $state<SessionInfo | null>(null);
  let dashboard = $state<ResolvedDashboard | null>(null);
  let loadError = $state<string | null>(null);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sweeping = $state(!reducedMotion);

  async function load() {
    try {
      const [s, d] = await Promise.all([
        api<SessionInfo>("/api/session"),
        api<ResolvedDashboard>("/api/dashboard"),
      ]);
      session = s;
      dashboard = d;
      document.documentElement.dataset.skin = d.skin;
    } catch (err) {
      loadError = (err as Error).message;
    }
  }
  load();
</script>

{#if sweeping}
  <div class="power-sweep" onanimationend={() => (sweeping = false)}></div>
{/if}

{#if loadError}
  <main class="boot">
    <p class="eyebrow">SIMMER</p>
    <p class="state-msg error">Couldn't reach the panel — {loadError}. Reload to try again.</p>
  </main>
{:else if !dashboard || !session}
  <main class="boot">
    <p class="eyebrow phosphor">SIMMER · INITIALIZING</p>
  </main>
{:else}
  <StatusStrip {session} homeAirport={dashboard.homeAirport} />
  <main class="grid" data-dashboard={dashboard.name}>
    {#each dashboard.widgets as placement (placement.id)}
      <div
        class="cell"
        style:--gx={placement.grid_x + 1}
        style:--gy={placement.grid_y + 1}
        style:--gw={placement.w}
        style:--gh={placement.h}
      >
        {#if placement.widget === "metar"}
          <MetarBoard settings={placement.settings} />
        {:else if placement.widget === "solar"}
          <HamConditions settings={placement.settings} />
        {:else if placement.widget === "links"}
          <ServiceLinks settings={placement.settings} placementId={placement.id} />
        {:else if placement.widget === "clock"}
          <ClockWeather settings={placement.settings} homeAirport={dashboard.homeAirport} />
        {:else if placement.widget === "hunting"}
          <Hunting settings={placement.settings} />
        {/if}
      </div>
    {/each}
    {#if dashboard.widgets.length === 0}
      <section class="panel empty">
        <p class="eyebrow">DASHBOARD · {dashboard.name.toUpperCase()}</p>
        <p class="state-msg">
          This panel is dark — add a widget to get started. Edit the config
          (simmer.yaml) or import one at <span class="data">/api/config/import</span>.
        </p>
      </section>
    {/if}
  </main>
{/if}

<style>
  .boot {
    min-height: 80vh;
    display: grid;
    place-items: center;
    text-align: center;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-auto-rows: 88px;
    gap: 10px;
    padding: 14px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .cell {
    grid-column: var(--gx) / span var(--gw);
    grid-row: var(--gy) / span var(--gh);
    display: flex;
    min-width: 0;
  }

  .cell > :global(.panel) {
    flex: 1;
  }

  .empty {
    grid-column: 1 / -1;
  }

  /* Responsive: below tablet width the panel stacks; placement order wins. */
  @media (max-width: 840px) {
    .grid {
      grid-template-columns: 1fr;
      grid-auto-rows: auto;
    }
    .cell {
      grid-column: auto;
      grid-row: auto;
      min-height: calc(var(--gh) * 72px);
    }
  }
</style>
