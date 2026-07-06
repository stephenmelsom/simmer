import crypto from "node:crypto";
import { db } from "../db.js";
import { env } from "../env.js";

export interface SessionUser {
  id: string;
  sub: string;
  name: string;
  email: string | null;
  groups: string[];
}

const COOKIE_NAME = "simmer_session";

function hmac(value: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

/** Signed value for short-lived cookies (OIDC state) and the session cookie. */
export function sign(value: string): string {
  return `${value}.${hmac(value)}`;
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot < 1) return null;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = hmac(value);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export function createSession(user: { sub: string; name: string; email: string | null; groups: string[] }): string {
  const id = crypto.randomBytes(32).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO sessions (id, sub, name, email, groups_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, user.sub, user.name, user.email, JSON.stringify(user.groups), now, now + env.sessionTtlSeconds);
  // Opportunistic cleanup of expired sessions.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  return id;
}

export function getSession(id: string): SessionUser | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?").get(id, Math.floor(Date.now() / 1000)) as
    | any
    | undefined;
  if (!row) return null;
  return { id: row.id, sub: row.sub, name: row.name, email: row.email, groups: JSON.parse(row.groups_json) };
}

export function destroySession(id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export const sessionCookie = {
  name: COOKIE_NAME,
  /** Serialize the Set-Cookie value for a session id (signed). */
  set(id: string): string {
    const secure = env.baseUrl.startsWith("https://") ? "; Secure" : "";
    return `${COOKIE_NAME}=${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${env.sessionTtlSeconds}${secure}`;
  },
  clear(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  },
};
