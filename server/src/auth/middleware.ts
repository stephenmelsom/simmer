import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { env } from "../env.js";
import { getSession, sessionCookie, unsign, type SessionUser } from "./session.js";

export type AuthEnv = {
  Variables: {
    user: SessionUser;
  };
};

const DEV_SESSION: SessionUser = {
  id: "dev",
  sub: "dev",
  name: env.devUser.name,
  email: null,
  groups: env.devUser.groups,
};

export function currentUser(cookieValue: string | undefined): SessionUser | null {
  if (env.authMode === "disabled") return DEV_SESSION;
  const id = unsign(cookieValue);
  if (!id) return null;
  return getSession(id);
}

/**
 * Everything except /auth/*, /health and hashed static assets requires a valid
 * session. API calls get a 401 (the SPA redirects itself); page loads redirect
 * straight to Pocket ID login.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const user = currentUser(getCookie(c, sessionCookie.name));
  if (user) {
    c.set("user", user);
    return next();
  }
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  return c.redirect("/auth/login");
});
