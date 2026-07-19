ARG target=api

# ─── API Build Stage ────────────────────────────────────────
FROM node:20-alpine AS api-build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/test-runner/package.json ./packages/test-runner/
COPY packages/web/package.json ./packages/web/
COPY packages/cli/package.json ./packages/cli/
RUN npm ci --workspace=@fusionpulse/api

COPY packages/api/ ./packages/api/
RUN npm run build --workspace=@fusionpulse/api

# ─── API Image ──────────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/packages/api/dist ./dist
COPY --from=api-build /app/packages/api/package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]

# ─── Test Runner Image ──────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.52.0-alpine AS test-runner
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/test-runner/package.json ./packages/test-runner/
RUN npm ci --workspace=@fusionpulse/test-runner
COPY packages/test-runner/ ./packages/test-runner/
RUN npm run build --workspace=@fusionpulse/test-runner
CMD ["node", "dist/worker.js"]

# ─── Final stage (alias for the chosen target) ─────────────
FROM ${target}
