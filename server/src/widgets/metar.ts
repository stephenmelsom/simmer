import { parseMetar, AltimeterUnit, CloudQuantity, DistanceUnit } from "metar-taf-parser";
import { cached, upstream, type Cached } from "../cache.js";

/**
 * The library doesn't export its interfaces, and ReturnType picks the dated
 * overload — strip `issued` to get the plain IMetar shape back.
 */
type ParsedMetar = Omit<ReturnType<typeof parseMetar>, "issued">;

const AWC = "https://aviationweather.gov/api/data";
const METAR_TTL = 5 * 60 * 1000; // PRD: cache ~5 min, respect the 100 req/min limit
const ICAO_RE = /^[A-Z0-9]{4}$/;

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKN";

export interface StationReport {
  icao: string;
  name: string | null;
  raw: string;
  observedAt: string | null;
  category: FlightCategory;
  wind: { direction: number | "VRB" | null; speedKt: number | null; gustKt: number | null };
  visibilitySm: number | null;
  /** Lowest broken/overcast/VV layer in feet AGL; null = unlimited/none reported. */
  ceilingFt: number | null;
  clouds: { cover: string; baseFt: number | null }[];
  tempC: number | null;
  dewpointC: number | null;
  altimeterInHg: number | null;
  taf: string | null;
}

export function validIcaos(ids: string): string[] {
  const list = [...new Set(ids.toUpperCase().split(",").map((s) => s.trim()).filter(Boolean))];
  const bad = list.filter((i) => !ICAO_RE.test(i));
  if (bad.length) throw new Error(`Invalid ICAO code(s): ${bad.join(", ")}`);
  if (list.length === 0) throw new Error("No airports requested");
  if (list.length > 20) throw new Error("Too many airports (max 20)");
  return list;
}

interface AwcMetar {
  icaoId: string;
  rawOb: string;
  name?: string;
  obsTime?: number; // epoch seconds
}

interface AwcTaf {
  icaoId: string;
  rawTAF: string;
}

/** Ceiling = lowest BKN/OVC layer or vertical visibility, in feet. */
function ceilingOf(parsed: ParsedMetar): number | null {
  const layers = (parsed.clouds ?? [])
    .filter((c) => c.quantity === CloudQuantity.BKN || c.quantity === CloudQuantity.OVC)
    .map((c) => c.height)
    .filter((h): h is number => typeof h === "number");
  if (typeof parsed.verticalVisibility === "number") layers.push(parsed.verticalVisibility);
  return layers.length ? Math.min(...layers) : null;
}

function visibilitySmOf(parsed: ParsedMetar): number | null {
  const v = parsed.visibility;
  if (!v || typeof v.value !== "number") return null;
  return v.unit === DistanceUnit.StatuteMiles ? v.value : v.value / 1609.344; // metres → statute miles
}

/** FAA flight category from ceiling + visibility. */
export function flightCategory(ceilingFt: number | null, visibilitySm: number | null): FlightCategory {
  if (ceilingFt === null && visibilitySm === null) return "UNKN";
  const ceil = ceilingFt ?? Infinity;
  const vis = visibilitySm ?? Infinity;
  if (ceil < 500 || vis < 1) return "LIFR";
  if (ceil < 1000 || vis < 3) return "IFR";
  if (ceil <= 3000 || vis <= 5) return "MVFR";
  return "VFR";
}

function toReport(awc: AwcMetar, taf: string | null): StationReport {
  // AWC's JSON is the transport; the maintained parser is the source of parsed
  // fields (PRD: use metar-taf-parser, don't hand-roll).
  const parsed: ParsedMetar = parseMetar(awc.rawOb);
  const ceilingFt = ceilingOf(parsed);
  const visibilitySm = visibilitySmOf(parsed);
  const altimeterInHg =
    parsed.altimeter?.unit === AltimeterUnit.InHg
      ? parsed.altimeter.value
      : parsed.altimeter?.value != null
        ? Number((parsed.altimeter.value * 0.02953).toFixed(2)) // hPa → inHg
        : null;
  return {
    icao: awc.icaoId,
    name: awc.name ?? null,
    raw: awc.rawOb,
    observedAt: awc.obsTime ? new Date(awc.obsTime * 1000).toISOString() : null,
    category: flightCategory(ceilingFt, visibilitySm),
    wind: {
      direction: parsed.wind?.degrees ?? (parsed.wind?.direction === "VRB" ? "VRB" : null),
      speedKt: parsed.wind?.speed ?? null,
      gustKt: parsed.wind?.gust ?? null,
    },
    visibilitySm: visibilitySm != null ? Number(visibilitySm.toFixed(2)) : null,
    ceilingFt,
    clouds: (parsed.clouds ?? []).map((c) => ({ cover: c.quantity ?? "?", baseFt: c.height ?? null })),
    tempC: parsed.temperature ?? null,
    dewpointC: parsed.dewPoint ?? null,
    altimeterInHg,
    taf,
  };
}

export async function getMetars(icaos: string[], includeTaf: boolean): Promise<Cached<StationReport[]>> {
  const key = `metar:${icaos.join(",")}:${includeTaf}`;
  return cached(key, METAR_TTL, async () => {
    const ids = icaos.join(",");
    const metarReq = upstream(`${AWC}/metar?ids=${ids}&format=json`);
    const tafReq = includeTaf ? upstream(`${AWC}/taf?ids=${ids}&format=json`) : null;

    const metars = (await (await metarReq).json()) as AwcMetar[];
    let tafs = new Map<string, string>();
    if (tafReq) {
      try {
        const list = (await (await tafReq).json()) as AwcTaf[];
        tafs = new Map(list.map((t) => [t.icaoId, t.rawTAF]));
      } catch {
        // TAF being down must not sink the METAR board.
      }
    }

    // Keep the most recent ob per station, in requested order.
    const byStation = new Map<string, AwcMetar>();
    for (const m of metars) {
      const prev = byStation.get(m.icaoId);
      if (!prev || (m.obsTime ?? 0) > (prev.obsTime ?? 0)) byStation.set(m.icaoId, m);
    }
    const reports: StationReport[] = [];
    for (const icao of icaos) {
      const m = byStation.get(icao);
      if (m) reports.push(toReport(m, tafs.get(icao) ?? null));
      else
        reports.push({
          icao,
          name: null,
          raw: "",
          observedAt: null,
          category: "UNKN",
          wind: { direction: null, speedKt: null, gustKt: null },
          visibilitySm: null,
          ceilingFt: null,
          clouds: [],
          tempC: null,
          dewpointC: null,
          altimeterInHg: null,
          taf: tafs.get(icao) ?? null,
        });
    }
    return reports;
  });
}
