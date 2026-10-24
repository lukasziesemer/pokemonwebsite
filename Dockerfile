# ================================
# Stage 1: Dependencies
# ================================
FROM node:24-slim AS deps

# Install dependencies for Prisma and Sharp
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# ================================
# Stage 2: Builder
# ================================
FROM node:24-slim AS builder

# Prisma generates its native client in this stage and therefore needs the
# same OpenSSL runtime that is present in the dependency and runner stages.
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy secrets for build time only (not used in production image)
ENV SESSION_SECRET="build-time-dummy-secret-min-32-characters"
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN npm run build

# ================================
# Stage 3: Runner (Production)
# ================================
FROM node:24-slim AS runner

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
# UID/GID 10001: liegt außerhalb der Host-Benutzer (1000+), damit der Container-User
# auf dem Host keinem echten Benutzer entspricht
RUN groupadd --system --gid 10001 nodejs
RUN useradd --system --uid 10001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Set correct permissions for prerender cache
RUN mkdir -p .next
RUN chown -R nextjs:nodejs .next

# Create uploads directory with correct permissions
RUN mkdir -p ./public/uploads/avatars
RUN chown -R nextjs:nodejs ./public/uploads

# Prisma 7: Der Client wird nach ./generated erzeugt und von Next.js mitgebaut.
# Die Laufzeit (@prisma/client, Driver Adapter) kommt aus node_modules/@prisma.
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Der Container startet direkt als nextjs, ohne root-Entrypoint. Die Upload- und
# Cache-Volumes gehören nextjs (neue Volumes übernehmen die Rechte aus dem Image).
USER nextjs
CMD ["node", "server.js"]
