<script lang="ts">
  import { ageOf, degreeUnit, fmtTemp, zulu, type Units } from "../lib/api";
  import type { StationReport } from "../lib/types";

  let { report, showTaf, units }: { report: StationReport; showTaf: boolean; units: Units } = $props();

  let tafOpen = $state(false);

  let wind = $derived.by(() => {
    const w = report.wind;
    if (w.speedKt == null) return "———";
    if (w.speedKt === 0) return "CALM";
    const dir = w.direction === "VRB" ? "VRB" : w.direction != null ? String(w.direction).padStart(3, "0") : "———";
    return `${dir}° ${w.speedKt}${w.gustKt ? `G${w.gustKt}` : ""}KT`;
  });

  let visibility = $derived(
    report.visibilitySm == null
      ? "———"
      : `${report.visibilitySm >= 10 ? "10+" : trimNum(report.visibilitySm)} SM`,
  );

  let ceiling = $derived(report.ceilingFt == null ? "UNL" : `${report.ceilingFt.toLocaleString()} FT`);

  function trimNum(n: number): string {
    return String(Math.round(n * 100) / 100);
  }
</script>

<!-- The card IS the instrument: beacon LED + category edge rule carry the state. -->
<article class="card cat-{report.category}">
  <span class="edge"></span>
  <header>
    <span class="icao phosphor">{report.icao}</span>
    <span class="cat data" style:color="var(--cat)">{report.category}</span>
    <span class="led" title="{report.category} — airport beacon"></span>
  </header>

  {#if report.raw}
    <div class="numbers data">
      <div><span class="lbl">WIND</span>{wind}</div>
      <div><span class="lbl">VIS</span>{visibility}</div>
      <div><span class="lbl">CEIL</span>{ceiling}</div>
      {#if report.tempC != null}
        <div><span class="lbl">T/DP</span>{fmtTemp(report.tempC, units)}°/{fmtTemp(report.dewpointC, units)}{degreeUnit(units)}</div>
      {/if}
      {#if report.altimeterInHg != null}
        <div><span class="lbl">ALT</span>{report.altimeterInHg.toFixed(2)}"</div>
      {/if}
    </div>

    <p class="raw data readout">{report.raw}</p>

    <footer class="data">
      <span>{zulu(report.observedAt)} · {ageOf(report.observedAt)}</span>
      {#if showTaf && report.taf}
        <button class="taf-toggle" onclick={() => (tafOpen = !tafOpen)}>
          TAF {tafOpen ? "▴" : "▾"}
        </button>
      {/if}
    </footer>
    {#if tafOpen && report.taf}
      <p class="raw taf data">{report.taf}</p>
    {/if}
  {:else}
    <p class="state-msg">No METAR for {report.icao} in the last hour — check the station ID.</p>
  {/if}
</article>

<style>
  .card {
    position: relative;
    background: var(--panel-black);
    box-shadow: 0 0 0 1px var(--bezel-line);
    border-radius: 5px;
    padding: 12px 14px 10px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  /* Colored edge rule — the category color is the card's personality. */
  .edge {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 5px 0 0 5px;
    background: var(--cat);
    box-shadow: 0 0 10px color-mix(in srgb, var(--cat) 55%, transparent);
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .icao {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.12em;
  }

  .cat {
    font-size: 13px;
    letter-spacing: 0.14em;
  }

  /* Beacon LED, top corner — reads as the airport rotating beacon. */
  .led {
    margin-left: auto;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat);
    box-shadow:
      0 0 8px var(--cat),
      0 0 2px 1px color-mix(in srgb, var(--cat) 60%, transparent);
    align-self: center;
  }

  .numbers {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: 13px;
  }

  .lbl {
    color: var(--chart-ink-dim);
    font-size: 10px;
    letter-spacing: 0.14em;
    margin-right: 6px;
  }

  .raw {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--chart-ink);
    word-break: break-word;
    background: color-mix(in srgb, var(--panel-raised) 60%, transparent);
    padding: 6px 8px;
    border-radius: 3px;
  }

  .taf {
    color: var(--chart-ink-dim);
    white-space: pre-line;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--chart-ink-dim);
    margin-top: auto; /* pin to the card bottom when the row is stretched */
  }

  .taf-toggle {
    background: none;
    border: none;
    color: var(--phosphor);
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.18em;
    cursor: pointer;
    padding: 2px 4px;
  }
</style>
