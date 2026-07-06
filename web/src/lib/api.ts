/** Fetch a session-gated API endpoint; a 401 sends the browser to login. */
export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (res.status === 401) {
    window.location.href = "/auth/login";
    throw new Error("Redirecting to sign-in");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** "3 min ago" style age for observation timestamps. */
export function ageOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} h ${mins % 60} min ago`;
}

export type Units = "imperial" | "metric";

/** Widget `units` setting; imperial (°F) unless explicitly metric. */
export function unitsOf(settings: Record<string, any>): Units {
  return settings.units === "metric" ? "metric" : "imperial";
}

export function fmtTemp(celsius: number | null | undefined, units: Units): string {
  if (celsius == null) return "—";
  return units === "imperial" ? `${Math.round(celsius * 1.8 + 32)}` : `${Math.round(celsius)}`;
}

export const degreeUnit = (units: Units) => (units === "imperial" ? "°F" : "°C");

/** HHMM"Z" for a timestamp — times that matter to flying are labeled Z. */
export function zulu(iso: string | null | undefined): string {
  if (!iso) return "——Z";
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
}
