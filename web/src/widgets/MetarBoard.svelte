<script lang="ts">
  import { api, unitsOf } from "../lib/api";
  import type { Cached, StationReport } from "../lib/types";
  import MetarCard from "./MetarCard.svelte";

  let { settings }: { settings: Record<string, any> } = $props();

  let airports = $derived<string[]>(Array.isArray(settings.airports) ? settings.airports : []);
  let showTaf = $derived(settings.show_taf !== false);
  let refreshMs = $derived(Math.max(60, Number(settings.refresh_seconds) || 300) * 1000);
  let units = $derived(unitsOf(settings));

  let reports = $state<StationReport[] | null>(null);
  let stale = $state(false);
  let error = $state<string | null>(null);
  let fetchedAt = $state<number | null>(null);

  async function refresh() {
    if (!airports.length) return;
    try {
      const res = await api<Cached<StationReport[]>>(
        `/api/widgets/metar?ids=${airports.join(",")}&taf=${showTaf ? 1 : 0}`,
      );
      reports = res.data;
      stale = res.stale;
      fetchedAt = res.fetchedAt;
      error = null;
    } catch (err) {
      // Keep showing the last good board; only surface the error when empty.
      if (!reports) error = (err as Error).message;
      else stale = true;
    }
  }

  $effect(() => {
    refresh();
    const t = setInterval(refresh, refreshMs);
    return () => clearInterval(t);
  });
</script>

<section class="panel">
  <p class="eyebrow">
    METAR / TAF
    {#if stale}<span class="stale-flag">STALE — showing last received</span>{/if}
  </p>

  {#if !airports.length}
    <p class="state-msg">No airports configured — add ICAO codes to this widget's settings.</p>
  {:else if error}
    <p class="state-msg error">
      No METAR for {airports.join(", ")} — check the station IDs or your network, then wait for the next sweep.
    </p>
  {:else if !reports}
    <p class="state-msg">Tuning {airports.join(", ")}…</p>
  {:else}
    <div class="board">
      {#each reports as report (report.icao)}
        <MetarCard {report} {showTaf} {units} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    /* Fill the panel: rows stretch to share leftover height, but never
       squish below content (falls back to scrolling when overfull). */
    flex: 1;
    grid-auto-rows: minmax(min-content, 1fr);
    gap: 10px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
</style>
