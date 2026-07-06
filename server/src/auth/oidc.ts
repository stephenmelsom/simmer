import * as oidc from "openid-client";
import { env } from "../env.js";

let configPromise: Promise<oidc.Configuration> | null = null;

/** Discover the Pocket ID issuer lazily and cache the client configuration. */
export function oidcConfig(): Promise<oidc.Configuration> {
  if (!configPromise) {
    configPromise = oidc
      .discovery(new URL(env.oidc.issuer), env.oidc.clientId, env.oidc.clientSecret)
      .catch((err) => {
        configPromise = null; // allow retry on next request
        throw err;
      });
  }
  return configPromise;
}

export interface LoginStart {
  url: string;
  codeVerifier: string;
  state: string;
}

export async function startLogin(): Promise<LoginStart> {
  const config = await oidcConfig();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${env.baseUrl}/auth/callback`,
    scope: env.oidc.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return { url: url.href, codeVerifier, state };
}

export interface OidcIdentity {
  sub: string;
  name: string;
  email: string | null;
  groups: string[];
}

function groupsFrom(claims: Record<string, unknown> | undefined): string[] | null {
  const g = claims?.groups;
  if (Array.isArray(g)) return g.map(String);
  return null;
}

export async function completeLogin(currentUrl: string, codeVerifier: string, state: string): Promise<OidcIdentity> {
  const config = await oidcConfig();
  const tokens = await oidc.authorizationCodeGrant(config, new URL(currentUrl), {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error("ID token missing sub claim");

  let groups = groupsFrom(claims as Record<string, unknown>);
  let name = (claims.name as string) || (claims.preferred_username as string) || "";
  let email = (claims.email as string) || null;

  // Pocket ID exposes groups on userinfo when the scope is enabled; fall back
  // there if the ID token didn't carry the claim.
  if (groups === null || !name) {
    try {
      const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
      groups = groups ?? groupsFrom(info as Record<string, unknown>) ?? [];
      name = name || (info.name as string) || (info.preferred_username as string) || claims.sub;
      email = email || (info.email as string) || null;
    } catch {
      groups = groups ?? [];
    }
  }
  return { sub: claims.sub, name: name || claims.sub, email, groups: groups ?? [] };
}
