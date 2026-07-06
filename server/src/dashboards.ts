import { getDashboardByName, listPlacements, type Placement } from "./db.js";
import { getAppConfig } from "./configYaml.js";

export interface ResolvedDashboard {
  name: string;
  matchedGroup: string | null;
  skin: string;
  homeAirport: string;
  widgets: Placement[];
}

/**
 * PRD resolution: walk group_dashboards top to bottom, serve the first
 * dashboard whose group the user is in; otherwise default_dashboard.
 */
export function resolveDashboard(userGroups: string[]): ResolvedDashboard {
  const cfg = getAppConfig();
  const groups = new Set(userGroups);

  let name = cfg.default_dashboard;
  let matchedGroup: string | null = null;
  for (const mapping of cfg.group_dashboards) {
    if (groups.has(mapping.group)) {
      name = mapping.dashboard;
      matchedGroup = mapping.group;
      break;
    }
  }

  const dash = getDashboardByName(name);
  return {
    name,
    matchedGroup,
    skin: cfg.skin,
    homeAirport: cfg.home_airport,
    widgets: dash ? listPlacements(dash.id) : [],
  };
}

/**
 * Config import/export is restricted to the highest-priority group in the
 * mapping (admins in the expected setup). With an empty mapping there is no
 * admin concept yet, so any authenticated user may manage config.
 */
export function isAdmin(userGroups: string[]): boolean {
  const cfg = getAppConfig();
  const top = cfg.group_dashboards[0]?.group;
  return top ? userGroups.includes(top) : true;
}
