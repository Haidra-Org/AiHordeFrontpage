# ── Build stage ──────────────────────────────────────────────────
FROM node:24-slim AS build

ARG BUILD_CONFIG=production
ENV NG_CLI_ANALYTICS="false"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration=${BUILD_CONFIG}

# ── Runtime stage ────────────────────────────────────────────────
FROM node:24-slim

ENV NODE_ENV=production
ENV PORT=8006
ENV NG_ALLOWED_HOSTS=localhost,127.0.0.1,::1

WORKDIR /app
COPY --from=build /app/dist/ai-horde-website ./

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8006) + '/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["node", "server/server.mjs"]
