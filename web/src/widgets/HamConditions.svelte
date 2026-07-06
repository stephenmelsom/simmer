<script lang="ts">
  import { api } from "../lib/api";
  import type { Cached, SolarReport } from "../lib/types";

  let { settings = {} }: { settings?: Record<string, any> } = $props();
  let refreshMs = $derived(Math.max(600, Number(settings.refresh_seconds) || 3600) * 1000);

  let report = $state<SolarReport | null>(null);
  let stale = $state(false);
  let error = $state<string | null>(null);

  async function refresh() {
    try {
      const res = await api<Cached<SolarReport>>("/api/widgets/solar");
      report = res.data;
      stale = res.stale;
      error = null;
    } catch (err) {
      if (!report) error = (err as Error).message;
      else stale = true;
    }
  }

  $effect(() => {
    refresh();
    const t = setInterval(refresh, refreshMs);
    return () => clearInterval(t);
  });

  function tone(cond: string): string {
    const c = cond.toLowerCase();
    if (c === "good") return "var(--vfr)";
    if (c === "fair") return "var(--phosphor)";
    if (c === "poor") return "var(--ifr)";
    return "var(--chart-ink-dim)";
  }
</script>

<section class="panel">
  <p class="eyebrow">
    HF PROPAGATION
    {#if stale}<span class="stale-flag">STALE</span>{/if}
    {#if report?.updated}<span class="age">{report.updated}</span>{/if}
  </p>

  {#if error}
    <p class="state-msg error">No solar data in the last hour — hamqsl.com may be down; the panel retries on its own.</p>
  {:else if !report}
    <p class="state-msg">Reading the solar feed…</p>
  {:else}
    <div class="indices data readout">
      <div class="idx"><span class="val phosphor">{report.solarFlux ?? "—"}</span><span class="lbl">SFI</span></div>
      <div class="idx"><span class="val phosphor">{report.sunspots ?? "—"}</span><span class="lbl">SN</span></div>
      <div class="idx"><span class="val phosphor">{report.aIndex ?? "—"}</span><span class="lbl">A</span></div>
      <div class="idx"><span class="val phosphor">{report.kIndex ?? "—"}</span><span class="lbl">K</span></div>
    </div>

    <table class="bands data">
      <thead>
        <tr><th>BAND</th><th>DAY</th><th>NIGHT</th></tr>
      </thead>
      <tbody>
        {#each report.bands as band (band.band)}
          <tr>
            <td class="band">{band.band}</td>
            <td style:color={tone(band.day)}>{band.day}</td>
            <td style:color={tone(band.night)}>{band.night}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .indices {
    display: flex;
    justify-content: space-around;
    gap: 8px;
    padding: 8px 4px 12px;
    border-radius: 4px;
  }

  .idx {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .val {
    font-size: 26px;
    font-weight: 500;
  }

  .lbl {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--chart-ink-dim);
  }

  .bands {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .bands th {
    text-align: left;
    font-weight: 400;
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--chart-ink-dim);
    padding: 4px 6px;
    border-bottom: 1px solid var(--bezel-line);
  }

  .bands td {
    padding: 4px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--bezel-line) 50%, transparent);
  }

  .band {
    color: var(--chart-ink);
  }
</style>
