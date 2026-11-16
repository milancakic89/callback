import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The Docker files are configuration, not code, so these tests read them as text and hold the facts
// that must not drift apart: the Playwright image and package-lock.json, the places a secret must never
// reach, and the loopback-only port. The files' behaviour was checked by building and running them
// (features/docker-compose.md).
const repositoryRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

const appDockerfile = readRepositoryFile("Dockerfile");
const schedulerDockerfile = readRepositoryFile("deploy/docker/scheduler.Dockerfile");
const compose = readRepositoryFile("compose.yaml");
const dockerIgnore = readRepositoryFile(".dockerignore");
const workflow = readRepositoryFile(".github/workflows/deploy.yml");
const packageLock = JSON.parse(readRepositoryFile("package-lock.json")) as {
  packages: Record<string, { version?: string }>;
};
const packageJson = JSON.parse(readRepositoryFile("package.json")) as { scripts: Record<string, string> };

// The text of a top-level block of a YAML file: from "  name:" at this indent to the next sibling.
function blockOf(yaml: string, name: string, indent: number): string {
  const lines = yaml.split("\n");
  const prefix = " ".repeat(indent);
  const start = lines.findIndex((line) => line === `${prefix}${name}:`);
  if (start === -1) throw new Error(`no block ${name}`);
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith(prefix) && !line.startsWith(`${prefix} `) && line.trim() !== "" && !line.trim().startsWith("#"),
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("blockOf", () => {
  it("returns a block up to the next one at the same indent", () => {
    const yaml = "jobs:\n  test:\n    a: 1\n  deploy:\n    b: 2\n";
    expect(blockOf(yaml, "test", 2)).toBe("  test:\n    a: 1");
    expect(blockOf(yaml, "deploy", 2)).toBe("  deploy:\n    b: 2\n");
  });
});

describe("Dockerfile (the app)", () => {
  it("has the three stages and starts the standalone server", () => {
    expect(appDockerfile).toMatch(/FROM node:24-bookworm-slim AS deps/);
    expect(appDockerfile).toMatch(/FROM node:24-bookworm-slim AS build/);
    expect(appDockerfile).toMatch(/FROM node:24-bookworm-slim AS runner/);
    expect(appDockerfile).toMatch(/CMD \["node", "server\.js"\]/);
  });

  it("reads .env.local only as a mounted secret, and never copies an env file", () => {
    expect(appDockerfile).toContain("RUN --mount=type=secret,id=env,target=/app/.env.local npm run build");
    const instructions = appDockerfile.split("\n").filter((line) => !line.trim().startsWith("#"));
    for (const line of instructions.filter((instruction) => /^\s*(COPY|ADD)\b/.test(instruction))) {
      expect(line).not.toMatch(/\.env/);
    }
  });

  it("builds with the APP_URL and the deployment id it is given, and has neither in the runner", () => {
    expect(appDockerfile).toMatch(/ARG APP_URL=/);
    expect(appDockerfile).toMatch(/ARG NEXT_DEPLOYMENT_ID=/);
    const runner = appDockerfile.slice(appDockerfile.indexOf("AS runner"));
    expect(runner).not.toContain("APP_URL");
    expect(runner).not.toContain("secret");
  });

  it("runs as a user that is not root, on every interface, with the VPS's heap limit", () => {
    const runner = appDockerfile.slice(appDockerfile.indexOf("AS runner"));
    expect(runner).toContain("USER node");
    expect(runner).toContain("HOSTNAME=0.0.0.0");
    expect(runner).toContain("PORT=3000");
    expect(runner).toContain("NODE_ENV=production");
    expect(runner).toContain("--max-old-space-size=2048");
  });
});

describe("deploy/docker/scheduler.Dockerfile", () => {
  it("uses the Playwright image of the version package-lock.json installs", () => {
    const lockedVersion = packageLock.packages["node_modules/playwright"]?.version;
    expect(lockedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(schedulerDockerfile).toContain(`ARG PLAYWRIGHT_VERSION=${lockedVersion}\n`);
    expect(schedulerDockerfile).toContain("FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble");
  });

  it("pins supercronic by version and by the SHA-256 of both architectures, and checks it", () => {
    expect(schedulerDockerfile).toMatch(/ARG SUPERCRONIC_VERSION=v\d+\.\d+\.\d+/);
    expect(schedulerDockerfile).toMatch(/ARG SUPERCRONIC_SHA256_AMD64=[0-9a-f]{64}\n/);
    expect(schedulerDockerfile).toMatch(/ARG SUPERCRONIC_SHA256_ARM64=[0-9a-f]{64}\n/);
    expect(schedulerDockerfile).toContain("sha256sum -c -");
  });

  it("schedules in Belgrade time, runs as pwuser and starts supercronic on the crontab", () => {
    expect(schedulerDockerfile).toContain("TZ=Europe/Belgrade");
    expect(schedulerDockerfile).toContain("USER pwuser");
    // Through run-scheduler.sh, which hands a stop on to a running refresh (supercronic does not).
    expect(schedulerDockerfile).toContain(
      'CMD ["/app/deploy/docker/run-scheduler.sh", "supercronic", "-no-reap", "/app/deploy/docker/crontab"]',
    );
  });

  it("is run by compose with an init process, which reaps what supercronic is told not to", () => {
    expect(schedulerDockerfile).toContain("-no-reap");
    expect(blockOf(compose, "scheduler", 2)).toContain("init: true");
  });

  it("makes the scripts executable", () => {
    expect(schedulerDockerfile).toContain("chmod +x deploy/docker/*.sh");
  });

  it("copies no env file and not the scraper's data", () => {
    const instructions = schedulerDockerfile.split("\n").filter((line) => !line.trim().startsWith("#"));
    for (const line of instructions.filter((instruction) => /^\s*(COPY|ADD)\b/.test(instruction))) {
      expect(line).not.toMatch(/\.env|scraper\/data/);
    }
  });
});

describe(".dockerignore", () => {
  const patterns = dockerIgnore.split("\n").map((line) => line.trim());

  it("keeps every env file, personal notes and the scraper's state out of the build context", () => {
    for (const pattern of ["**/.env*", "*.local.md", "scraper/data", ".git", "**/node_modules", ".next", ".mcp.json"]) {
      expect(patterns).toContain(pattern);
    }
  });
});

describe("compose.yaml", () => {
  const app = blockOf(compose, "app", 2);
  const scheduler = blockOf(compose, "scheduler", 2);

  it("publishes the app on the loopback address only, on CALLBACK_PORT", () => {
    expect(app).toContain('- "127.0.0.1:${CALLBACK_PORT:-3000}:3000"');
    expect(compose.match(/^\s+ports:/gm)).toHaveLength(1);
  });

  it("publishes nothing from the scheduler", () => {
    expect(scheduler).not.toMatch(/^\s+ports:/m);
  });

  it("gives the app the localhost address after the env file, so it wins over https://callback.rs", () => {
    expect(app.indexOf("env_file: .env.local")).toBeGreaterThan(-1);
    expect(app.indexOf("APP_URL: http://localhost:${CALLBACK_PORT:-3000}", app.indexOf("environment:"))).toBeGreaterThan(
      app.indexOf("env_file: .env.local"),
    );
  });

  it("builds the app with the same address, and the .env.local secret", () => {
    expect(app).toContain("APP_URL: http://localhost:${CALLBACK_PORT:-3000}");
    expect(app).toMatch(/secrets:\n\s+- env/);
    expect(compose).toMatch(/^secrets:\n {2}env:\n {4}file: \.env\.local/m);
  });

  it("sends the scheduler to the app by its service name, in Belgrade time, with the scraper's state mounted", () => {
    expect(scheduler).toContain("APP_URL: http://app:3000");
    expect(scheduler).toContain("TZ: Europe/Belgrade");
    expect(scheduler).toContain("${SCRAPER_DATA_DIR:-./scraper/data}:/app/scraper/data");
  });

  it("starts the scheduler only once the app answers /api/health", () => {
    expect(app).toContain("/api/health");
    expect(scheduler).toMatch(/depends_on:\n\s+app:\n\s+condition: service_healthy/);
  });

  it("restarts both and caps their memory at the VPS's 3 GB", () => {
    for (const service of [app, scheduler]) {
      expect(service).toContain("restart: unless-stopped");
      expect(service).toContain("mem_limit: 3g");
    }
  });
});

describe("package.json compose scripts", () => {
  it("builds with a deployment id from the clock, and has down, logs and the manual refresh", () => {
    expect(packageJson.scripts["compose:up"]).toBe(
      "NEXT_DEPLOYMENT_ID=local-$(date +%Y%m%d%H%M%S) docker compose up -d --build",
    );
    expect(packageJson.scripts["compose:down"]).toBe("docker compose down");
    expect(packageJson.scripts["compose:logs"]).toContain("docker compose logs");
    expect(packageJson.scripts["compose:refresh-jobs"]).toBe(
      "docker compose exec scheduler deploy/docker/refresh-jobs-if-due.sh --force",
    );
  });
});

describe(".github/workflows/deploy.yml", () => {
  const jobs = blockOf(workflow, "jobs", 0);

  it("deploys and syncs the scraper only from main and while DEPLOY_ENABLED is not 'false'", () => {
    const condition = "if: github.ref == 'refs/heads/main' && vars.DEPLOY_ENABLED != 'false'";
    expect(blockOf(jobs, "deploy", 2)).toContain(condition);
    expect(blockOf(jobs, "scraper", 2)).toContain(condition);
  });

  it("tests on every push, with no condition on the test job", () => {
    expect(blockOf(jobs, "test", 2)).not.toMatch(/^\s{4}if:/m);
  });
});
