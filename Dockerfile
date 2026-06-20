# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/agent/package.json ./packages/agent/
COPY packages/events/package.json ./packages/events/
COPY packages/graph/package.json ./packages/graph/
COPY packages/intelligence/package.json ./packages/intelligence/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/memory/package.json ./packages/memory/
COPY packages/providers/package.json ./packages/providers/
COPY packages/router/package.json ./packages/router/
COPY packages/types/package.json ./packages/types/
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
EXPOSE 3001
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Note: In production we rely on the concurrently script to run Next.js and the Agent server.
# Ensure that torvaix OS can be booted properly inside this container without Qdrant (which remains external).
CMD ["npm", "run", "dev"]
