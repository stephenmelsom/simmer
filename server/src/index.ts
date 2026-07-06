import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { loadConfigAtBoot } from "./configYaml.js";
import { buildApp } from "./app.js";

loadConfigAtBoot();

const app = buildApp();

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[simmer] listening on :${info.port} (auth: ${env.authMode}, base: ${env.baseUrl})`);
  if (env.authMode === "disabled") {
    console.log(`[simmer] AUTH DISABLED — dev session "${env.devUser.name}" groups=[${env.devUser.groups.join(", ")}]`);
  }
});
