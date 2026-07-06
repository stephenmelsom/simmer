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
  c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Simmer — signed out</title>
  <style>
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: #0B0E11; color: #C9D3DA;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .panel {
      background: #151A1F; box-shadow: 0 0 0 1px #242C33; border-radius: 6px;
      padding: 34px 38px; margin: 16px; max-width: 340px; text-align: center;
    }
    .brand {
      font-family: ui-monospace, monospace; font-weight: 600; font-size: 15px;
      letter-spacing: .32em; color: #E8B23A; margin: 0 0 4px;
      text-shadow: 0 0 8px rgba(232,178,58,.32);
    }
    .eyebrow {
      font-size: 10px; letter-spacing: .24em; color: #7D8A94; margin: 0 0 18px;
    }
    p.msg { margin: 0 0 22px; font-size: 14px; }
    a.button {
      display: inline-block; padding: 11px 24px; border-radius: 4px;
      box-shadow: 0 0 0 1px #E8B23A; color: #E8B23A; text-decoration: none;
      font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: .18em;
    }
    a.button:hover, a.button:focus-visible {
      background: rgba(232,178,58,.1); text-shadow: 0 0 8px rgba(232,178,58,.32);
    }
  </style>
</head>
<body>
  <div class="panel">
    <p class="brand">SIMMER</p>
    <p class="eyebrow">SESSION CLOSED</p>
    <p class="msg">You're signed out.</p>
    <a class="button" href="/auth/login">SIGN BACK IN</a>
  </div>
</body>
</html>`),
);
