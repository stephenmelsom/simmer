<script lang="ts">
  import { api, degreeUnit, fmtTemp, unitsOf, zulu } from "../lib/api";
  import type { Cached, CivilianWeather, StationReport } from "../lib/types";

  let { settings, homeAirport }: { settings: Record<string, any>; homeAirport: string } = $props();

  // PRD: one selectable conditions source — never both at once.
  let source = $derived<"open-meteo" | "metar">(settings.weather_source === "metar" ? "metar" : "open-meteo");
  let lat = $derived(Number(settings.latitude));
  let lon = $derived(Number(settings.longitude));
  let place = $derived<string>(settings.place ?? "");
  let icao = $derived<string>((settings.airport ?? homeAirport ?? "").toUpperCase());
  let units = $derived(unitsOf(settings));

  let now = $state(new Date());
  let civilian = $state<CivilianWeather | null>(null);
  let aviation = $state<StationReport | null>(null);
  let stale = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const t = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(t);
  });

  async function refresh() {
    try {
      if (source === "open-meteo") {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          error = "Set latitude and longitude in this widget's settings.";
          return;
        }
        const res = await api<Cached<CivilianWeather>>(`/api/widgets/weather?lat=${lat}&lon=${lon}`);
        civilian = res.data;
        stale = res.stale;
      } else {
        const res = await api<Cached<StationReport[]>>(`/api/widgets/metar?ids=${icao}&taf=0`);
        aviation = res.data[0] ?? null;
        stale = res.stale;
      }
      error = null;
    } catch (err) {
      if (!civilian && !aviation) error = (err as Error).message;
      else stale = true;
    }
  }

  $effect(() => {
    refresh();
    const t = setInterval(refresh, 15 * 60_000);
    return () => clearInterval(t);
  });

  const pad = (n: number) => String(n).padStart(2, "0");
  let time = $derived(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  let seconds = $derived(pad(now.getSeconds()));
  let date = $derived(
    now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
  );

  function round(n: number | null): string {
    return n == null ? "—" : String(Math.round(n));
  }

  /** Wind arrives in km/h from Open-Meteo; imperial shows mph. */
  function fmtWind(kmh: number | null): string {
    if (kmh == null) return "—";
    return units === "imperial" ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  }
</script>

<section class="panel">
  <p class="eyebrow">
    CLOCK · {source === "metar" ? icao : place || "LOCAL WX"}
    {#if stale}<span class="stale-flag">STALE</span>{/if}
  </p>

  <div class="face">
    <div class="time data readout">
      <span class="hm phosphor">{time}</span><span class="ss">:{seconds}</span>
    </div>
    <p class="date">{date}</p>

    {#if error}
      <p class="state-msg error">{error}</p>
    {:else if source === "open-meteo" && civilian}
      <div class="wx data">
        <span class="big phosphor">{fmtTemp(civilian.tempC, units)}{degreeUnit(units)}</span>
        <span class="cond">{civilian.condition}</span>
        <span class="minor">
          feels {fmtTemp(civilian.feelsLikeC, units)}° · {round(civilian.humidityPct)}% RH ·
          {fmtWind(civilian.windKmh)} · H {fmtTemp(civilian.todayHighC, units)}° / L {fmtTemp(civilian.todayLowC, units)}°
        </span>
      </div>
    {:else if source === "metar" && aviation}
      <div class="wx data">
        <span class="big phosphor">{fmtTemp(aviation.tempC, units)}{degreeUnit(units)}</span>
        <span class="cond cat-{aviation.category}" style:color="var(--cat)">{aviation.category}</span>
        <span class="minor">
          {aviation.icao} {zulu(aviation.observedAt)} ·
          wind {aviation.wind.speedKt ?? "—"} kt · alt {aviation.altimeterInHg?.toFixed(2) ?? "——"}"
        </span>
      </div>
    {:else}
      <p class="state-msg">Reading conditions…</p>
    {/if}
  </div>
</section>

<style>
  .face {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: auto 0;
  }

  .time {
    display: inline-flex;
    align-items: baseline;
    border-radius: 4px;
    width: fit-content;
  }

  .hm {
    font-size: 44px;
    font-weight: 500;
    line-height: 1.05;
  }

  .ss {
    font-size: 20px;
    color: var(--chart-ink-dim);
  }

  .date {
    margin: 2px 0 10px;
    color: var(--chart-ink-dim);
    font-size: 13px;
  }

  .wx {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .big {
    font-size: 22px;
    font-weight: 500;
  }

  .cond {
    letter-spacing: 0.06em;
  }

  .minor {
    color: var(--chart-ink-dim);
    font-size: 12px;
    width: 100%;
  }
</style>
