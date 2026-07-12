FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY packages/api/package.json ./packages/api/
COPY packages/test-runner/package.json ./packages/test-runner/
COPY packages/web/package.json ./packages/web/
COPY packages/cli/package.json ./packages/cli/
RUN npm ci --workspace=@fusionpulse/api --workspace=@fusionpulse/test-runner

# Build API
COPY packages/api/ ./packages/api/
RUN cd packages/api && npm run build

# Build test runner
COPY packages/test-runner/ ./packages/test-runner/
RUN cd packages/test-runner && npm run build

# ─── API Image ──────────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/api/dist ./dist
COPY --from=base /app/packages/api/package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]

# ─── Test Runner Image ──────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.52.0-alpine AS test-runner
WORKDIR /app
RUN apk add --no-cache nodejs npm
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/test-runner/dist ./dist
CMD ["node", "dist/worker.js"]
