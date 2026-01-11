FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies based on the preferred package manager
COPY web-service/package.json web-service/pnpm-lock.yaml* web-service/.npmrc* ./
RUN pnpm install --frozen-lockfile

# Rebuild better-sqlite3 for the current architecture
RUN pnpm rebuild better-sqlite3

FROM base AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY web-service/ .

# Rebuild better-sqlite3 for the builder stage architecture
RUN pnpm rebuild better-sqlite3

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Environment variables needed at build time for Next.js
# These are passed as build args and set as env vars
ARG AKAHU_APP_TOKEN
ARG AKAHU_API_KEY
ARG AKAHU_ACCOUNT_ID
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG AUTH_SECRET
ARG ADMIN_USER
ARG TIMEZONE=Pacific/Auckland
ARG CRON_SECRET

ENV AKAHU_APP_TOKEN=$AKAHU_APP_TOKEN
ENV AKAHU_API_KEY=$AKAHU_API_KEY
ENV AKAHU_ACCOUNT_ID=$AKAHU_ACCOUNT_ID
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
ENV AUTH_SECRET=$AUTH_SECRET
ENV ADMIN_USER=$ADMIN_USER
ENV TIMEZONE=$TIMEZONE
ENV CRON_SECRET=$CRON_SECRET

RUN pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set up .next directory with proper permissions
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database migrations
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./

# Copy migration script and node_modules needed for migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Make startup script executable
RUN chmod +x ./scripts/start.sh

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["./scripts/start.sh"]
