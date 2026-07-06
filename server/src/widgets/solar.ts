import { XMLParser } from "fast-xml-parser";
import { cached, upstream, type Cached } from "../cache.js";

const HAMQSL_URL = "https://www.hamqsl.com/solarxml.php";
const SOLAR_TTL = 60 * 60 * 1000; // feed updates ~every 3 h; PRD: cache 1–3 h

export interface BandCondition {
  band: string; // e.g. "20m-17m"
  day: string; // Good | Fair | Poor
  night: string;
}

export interface SolarReport {
  solarFlux: number | null;
  sunspots: number | null;
  aIndex: number | null;
  kIndex: number | null;
  xray: string | null;
  signalNoise: string | null;
  geomagField: string | null;
  updated: string | null;
  bands: BandCondition[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : typeof v === "number" ? String(v) : null;
}

export async function getSolar(): Promise<Cached<SolarReport>> {
  return cached("solar", SOLAR_TTL, async () => {
    const xml = await (await upstream(HAMQSL_URL)).text();
    const doc = parser.parse(xml);
    const d = doc?.solar?.solardata;
    if (!d) throw new Error("Unexpected HamQSL XML shape");

    const rawBands = d.calculatedconditions?.band;
    const bandList: any[] = Array.isArray(rawBands) ? rawBands : rawBands ? [rawBands] : [];
    // The feed lists each band twice (time="day" / time="night"); merge them.
    const merged = new Map<string, BandCondition>();
    for (const b of bandList) {
      const name = b["@_name"];
      if (!name) continue;
      const entry = merged.get(name) ?? { band: name, day: "N/A", night: "N/A" };
      const value = str(b["#text"] ?? b) ?? "N/A";
      if (b["@_time"] === "day") entry.day = value;
      else if (b["@_time"] === "night") entry.night = value;
      merged.set(name, entry);
    }

    return {
      solarFlux: num(d.solarflux),
      sunspots: num(d.sunspots),
      aIndex: num(d.aindex),
      kIndex: num(d.kindex),
      xray: str(d.xray),
      signalNoise: str(d.signalnoise),
      geomagField: str(d.geomagfield),
      updated: str(d.updated),
      bands: [...merged.values()],
    };
  });
}
