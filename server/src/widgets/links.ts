import { cached, type Cached } from "../cache.js";
import { env } from "../env.js";
import { getPlacement } from "../db.js";

const HEALTH_TTL = 60 * 1000;

export interface LinkHealth {
  url: string;
  up: boolean;
  status: number | null;
  ms: number | null;
}

interface LinkItem {
  name?: string;
  url?: string;
  healthcheck?: boolean;
}

/**
 * Health-pings the links configured on one placement. URLs come from the
 * stored widget settings — never from the request — so this can't be used to
 * probe arbitrary hosts.
 */
export async function getLinkHealth(placementId: number): Promise<Cached<LinkHealth[]>> {
  const placement = getPlacement(placementId);
  if (!placement || placement.widget !== "links") throw new Error("Unknown links placement");
  const groups = (placement.settings.groups ?? []) as { items?: LinkItem[] }[];
  const targets = groups
    .flatMap((g) => g.items ?? [])
    .filter((i) => i.healthcheck && typeof i.url === "string")
    .map((i) => i.url as string);

  return cached(`links:${placementId}`, HEALTH_TTL, async () => {
    return Promise.all(
      targets.map(async (url): Promise<LinkHealth> => {
        const started = Date.now();
        try {
          let res = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": env.userAgent },
            signal: AbortSignal.timeout(5000),
            redirect: "follow",
          });
          // Some services reject HEAD; retry once with GET before calling it down.
          if (res.status === 405 || res.status === 501) {
            res = await fetch(url, {
              method: "GET",
              headers: { "User-Agent": env.userAgent },
              signal: AbortSignal.timeout(5000),
              redirect: "follow",
            });
          }
          return { url, up: res.status < 500, status: res.status, ms: Date.now() - started };
        } catch {
          return { url, up: false, status: null, ms: null };
        }
      }),
    );
  });
}
