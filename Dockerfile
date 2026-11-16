# syntax=docker/dockerfile:1
# The Callback app as a container (compose.yaml; project-overview/deployment.md, "Running locally with
# Docker Compose"): the same standalone build the VPS runs with `node server.js`.
#
# Three stages. `deps` installs from the lockfile, inside Linux, so `sharp` gets its Linux binary.
# `build` runs `next build`. `runner` holds only the standalone server, `public/` and `.next/static`.
#
# `next build` needs the environment (src/lib/env.ts validates it, and the pages that read the public
# job list from Supabase are prerendered), so the build reads `.env.local` as a BuildKit secret mounted
# at /app/.env.local for that one RUN. It is never copied into a layer, and the runner stage has no
# environment: compose passes it at run time (`env_file`).
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# Playwright is the scraper's dev dependency; the app never needs a browser.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The address the site will be served from, e.g. http://localhost:3000. A real environment variable
# wins over `.env.local` in Next, so this beats the https://callback.rs in the secret. The build bakes
# the security headers in from it (src/lib/security-headers.ts): http gets no HSTS and no
# upgrade-insecure-requests.
ARG APP_URL=http://localhost:3000
# One id per build: a browser that still has the previous build open reloads instead of calling Server
# Actions that no longer exist (the same as the release id of the VPS deploy).
ARG NEXT_DEPLOYMENT_ID=local
ENV APP_URL=$APP_URL NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
RUN --mount=type=secret,id=env,target=/app/.env.local npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
# The same limits as deploy/callback.service: V8's heap stops at 2 GB (compose caps the container at 3 GB).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=2048
# The standalone server doesn't copy public/ or .next/static (Next.js docs, `output`). Owned by `node`:
# Next writes its cache under .next at run time.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
