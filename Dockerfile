# syntax=docker/dockerfile:1
# Torvaix Multi-Stage Docker Build
# Stages: deps → builder → runner

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl

# ── Dependencies Stage ──
FROM base AS deps
RUN apk add --no-cache python3 make g++
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

# ── Builder Stage ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runner Stage ──
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 torvaix

# Copy built application
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=torvaix:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=torvaix:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Reinstall production dependencies (for native modules)
RUN npm ci --omit=dev --ignore-scripts

USER torvaix

EXPOSE 3000
EXPOSE 3001

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV AGENT_PORT=3001

# Start both Next.js frontend and Agent server
CMD ["npm", "run", "dev:services"]
