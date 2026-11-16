# syntax=docker/dockerfile:1
# The scheduler container (compose.yaml; project-overview/deployment.md, "Running locally with Docker
# Compose"): supercronic runs deploy/docker/crontab, which closes the unanswered interview invitations
# every 15 minutes and runs the scraper (`npm run jobs:refresh`) once a day. It replaces the VPS's
# callback-interviews.timer and callback-scraper.timer.
#
# The base is Playwright's own image: Chromium and the system libraries it needs, for the exact
# Playwright version of package-lock.json (a test holds the two together). Built from the repository
# root: `docker build -f deploy/docker/scheduler.Dockerfile .`
ARG PLAYWRIGHT_VERSION=1.64.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# supercronic, pinned by version and by the SHA-256 of each architecture's binary (arm64 on an Apple
# Silicon Mac, amd64 on most servers). The checksums are those of the release's own download, which
# GitHub also lists as the asset's digest and the release notes as SHA-1.
ARG TARGETARCH
ARG SUPERCRONIC_VERSION=v0.2.51
ARG SUPERCRONIC_SHA256_AMD64=cc232108374e8e2b537045f2d5eaa1229f619db314c3ba6a14d38b35dc0aa123
ARG SUPERCRONIC_SHA256_ARM64=4ae22576a78223d8ccdf5f3b3660a5cbb5288416bf0ca96afc4a36d195932b94
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) expected_sha256="$SUPERCRONIC_SHA256_AMD64" ;; \
      arm64) expected_sha256="$SUPERCRONIC_SHA256_ARM64" ;; \
      *) echo "no supercronic checksum for $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}"; \
    echo "${expected_sha256}  /usr/local/bin/supercronic" | sha256sum -c -; \
    chmod +x /usr/local/bin/supercronic

WORKDIR /app
# Belgrade time, like the VPS's timer: supercronic schedules in it, and the refresh script reads "today"
# and the hour in it. The browsers are in the image already (/ms-playwright).
ENV TZ=Europe/Belgrade \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1

# The scraper's packages (tsx, playwright, cheerio, zod, supabase-js) are dev dependencies of the
# whole project, so this is the whole project's `npm ci`, as deploy/update-scraper.sh does on the VPS.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# The scraper imports nothing from src/. Its state, scraper/data, is not here: compose mounts it.
COPY tsconfig.json ./
COPY scraper ./scraper
COPY deploy/docker ./deploy/docker
RUN chmod +x deploy/docker/*.sh \
 && mkdir -p scraper/data \
 && chown -R pwuser:pwuser scraper/data

# Not root: the scraper opens other people's websites in Chromium. `pwuser` is Playwright's own user.
USER pwuser
# -no-reap: compose runs this with `init: true`, so Docker's own init (PID 1) reaps the leftovers of Chromium.
CMD ["/app/deploy/docker/run-scheduler.sh", "supercronic", "-no-reap", "/app/deploy/docker/crontab"]
