# The web app (Next standalone).   podman build -t ght-web web/
# Runtime env: DATABASE_URL, BETTER_AUTH_*, OPENROUTER_API_KEY, LLM_*, DECISION_*, ENGINE_URL (see .env.example).
# Uploads are written to /app/storage/uploads: mount a volume there.
FROM docker.io/oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM docker.io/library/node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p storage/uploads && chown -R nextjs:nodejs storage
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
