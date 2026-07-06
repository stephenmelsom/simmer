# ---- Build stage: compile the SPA and the server ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY server/ server/
COPY web/ web/
RUN npm run build --workspace=web && npm run build --workspace=server

# Reinstall production-only deps for the server (drops vite/svelte/tsc from the image).
RUN npm ci --omit=dev --workspace=server && mkdir -p server/node_modules

# ---- Runtime stage: one small container ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8686 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/web/dist ./web

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8686

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8686)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
