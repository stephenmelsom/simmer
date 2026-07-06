import { cached, upstream, type Cached } from "../cache.js";

const WEATHER_TTL = 15 * 60 * 1000; // PRD: ~15 min

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

/** WMO weather codes → short readable condition. */
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Thunderstorm, hail",
};

export async function getOpenMeteo(lat: number, lon: number): Promise<Cached<CivilianWeather>> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Invalid latitude");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Invalid longitude");
  const key = `weather:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return cached(key, WEATHER_TTL, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day` +
      `&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
    const body = (await (await upstream(url)).json()) as any;
    const cur = body?.current;
    if (!cur) throw new Error("Unexpected Open-Meteo response shape");
    return {
      tempC: cur.temperature_2m ?? null,
      feelsLikeC: cur.apparent_temperature ?? null,
      humidityPct: cur.relative_humidity_2m ?? null,
      windKmh: cur.wind_speed_10m ?? null,
      windDirection: cur.wind_direction_10m ?? null,
      condition: WMO[cur.weather_code as number] ?? "—",
      isDay: cur.is_day === 1,
      todayHighC: body?.daily?.temperature_2m_max?.[0] ?? null,
      todayLowC: body?.daily?.temperature_2m_min?.[0] ?? null,
    };
  });
}
