FROM node:20-alpine AS base

# Install dependencies for sharp, bcrypt, and PDF rendering
RUN apk add --no-cache libc6-compat python3 make g++ poppler-utils \
    fontconfig ttf-freefont \
    && fc-cache -f

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma needs these at runtime for migrate deploy
COPY --from=deps /app/node_modules ./node_modules

# Data directories
RUN mkdir -p /app/data/originals /app/data/archive /app/data/thumbnails /app/data/consume
RUN chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
