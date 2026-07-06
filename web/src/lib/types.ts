export interface SessionInfo {
  name: string;
  email: string | null;
  groups: string[];
  admin: boolean;
}

export interface Placement {
  id: number;
  widget: "metar" | "solar" | "links" | "clock";
  settings: Record<string, any>;
  grid_x: number;
  grid_y: number;
  w: number;
  h: number;
}

export interface ResolvedDashboard {
  name: string;
  matchedGroup: string | null;
  skin: string;
  homeAirport: string;
  widgets: Placement[];
}

/** Server cache envelope: data + staleness flag. */
export interface Cached<T> {
  data: T;
  stale: boolean;
  fetchedAt: number;
}

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKN";

export interface StationReport {
  icao: string;
  name: string | null;
  raw: string;
  observedAt: string | null;
  category: FlightCategory;
  wind: { direction: number | "VRB" | null; speedKt: number | null; gustKt: number | null };
  visibilitySm: number | null;
  ceilingFt: number | null;
  clouds: { cover: string; baseFt: number | null }[];
  tempC: number | null;
  dewpointC: number | null;
  altimeterInHg: number | null;
  taf: string | null;
}

export interface BandCondition {
  band: string;
  day: string;
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

export interface CivilianWeather {
  tempC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  windDirection: number | null;
  condition: string;
  isDay: boolean;
  todayHighC: number | null;
  todayLowC: number | null;
}

export interface LinkHealth {
  url: string;
  up: boolean;
  status: number | null;
  ms: number | null;
}
