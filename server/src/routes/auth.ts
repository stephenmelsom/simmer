import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { env } from "../env.js";
import { completeLogin, startLogin } from "../auth/oidc.js";
import { createSession, destroySession, sessionCookie, sign, unsign } from "../auth/session.js";

const OIDC_TXN_COOKIE = "simmer_oidc_txn";

export const authRoutes = new Hono();

authRoutes.get("/login", async (c) => {
  if (env.authMode === "disabled") return c.redirect("/");
  const { url, codeVerifier, state } = await startLogin();
  // base64url the JSON: raw quotes/commas are illegal in cookie values and
  // browsers silently drop the cookie, killing the flow at the callback.
  const txn = sign(Buffer.from(JSON.stringify({ v: codeVerifier, s: state })).toString("base64url"));
  const secure = env.baseUrl.startsWith("https://") ? "; Secure" : "";
  c.header(
    "Set-Cookie",
    `${OIDC_TXN_COOKIE}=${txn}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
  );
  return c.redirect(url);
});

authRoutes.get("/callback", async (c) => {
  if (env.authMode === "disabled") return c.redirect("/");
  const raw = unsign(getCookie(c, OIDC_TXN_COOKIE));
  if (!raw) return c.text("Login session expired — start again at /auth/login", 400);
  let txn: { v: string; s: string };
  try {
    txn = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return c.text("Malformed login transaction — start again at /auth/login", 400);
  }

  // Rebuild the callback URL on our canonical base (behind Caddy the request
  // arrives over plain HTTP; the registered redirect URI is the public one).
  const here = new URL(c.req.url);
  const callbackUrl = `${env.baseUrl}/auth/callback${here.search}`;

  try {
    const identity = await completeLogin(callbackUrl, txn.v, txn.s);
    const sessionId = createSession(identity);
    c.header("Set-Cookie", `${OIDC_TXN_COOKIE}=; Path=/auth; HttpOnly; Max-Age=0`, { append: true });
    c.header("Set-Cookie", sessionCookie.set(sessionId), { append: true });
    return c.redirect("/");
  } catch (err) {
    console.error("[simmer] OIDC callback failed:", err);
    return c.text("Sign-in failed — check the server log, then start again at /auth/login", 502);
  }
});

authRoutes.get("/logout", (c) => {
  const id = unsign(getCookie(c, sessionCookie.name));
  if (id) destroySession(id);
  c.header("Set-Cookie", sessionCookie.clear());
  return c.redirect(env.authMode === "disabled" ? "/" : "/auth/logged-out");
});

authRoutes.get("/logged-out", (c) =>
  c.html(
    `<!doctype html><meta charset="utf-8"><title>Simmer — signed out</title>
     <body style="background:#0B0E11;color:#C9D3DA;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
     <div style="text-align:center"><p style="letter-spacing:.2em;color:#E8B23A">SIMMER</p>
     <p>Signed out.</p><p><a href="/auth/login" style="color:#E8B23A">Sign in again</a></p></div>`,
  ),
);
