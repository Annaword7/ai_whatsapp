# --- Build stage ---
FROM node:20-slim AS build
WORKDIR /app

# OpenSSL is required by Prisma engines on slim images.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies for a lean runtime image.
RUN npm prune --omit=dev

# --- Runtime stage ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Default session dir (override with WA_SESSION_PATH + a mounted volume on Railway).
RUN mkdir -p /app/.sessions
ENV WA_SESSION_PATH=/app/.sessions

EXPOSE 8080

# Run pending migrations, then boot the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
