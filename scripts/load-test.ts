import { execFile } from "node:child_process";
import http from "node:http";
import { parseArgs, promisify } from "node:util";
import { parseServerSample, summarize, visitorAddress } from "./load-test-stats";

// A small HTTP load test, with no dependencies: `npm run load:test -- <url> [options]`
// (features/performance.md). Virtual visitors send one request after another for the given time,
// each with an X-Forwarded-For of its own, so the app's per-IP limit (300 a minute) counts them as
// different people. Bodies are read and thrown away; only their size is counted. It prints the
// requests a second, the 50th/95th/99th percentile of the answer times, the megabytes a second, and,
// when given the server's process id, its CPU and memory.
//
//   npm run load:test -- http://127.0.0.1:3100/jobs --concurrency 50 --seconds 15 --accept-encoding gzip --server-pid 4242
//
// Aim it at a local production build only (README: `npm run build`, then `node server.js` in
// .next/standalone), and never at a route that writes to the database. Without Caddy in front the
// server sends no compression (`compress: false`), so `--accept-encoding` changes nothing there.

const runCommand = promisify(execFile);

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    concurrency: { type: "string", short: "c", default: "10" },
    seconds: { type: "string", short: "s", default: "15" },
    "accept-encoding": { type: "string", short: "e", default: "" },
    "server-pid": { type: "string", short: "p" },
  },
});

const [targetUrl] = positionals;
if (!targetUrl) {
  console.error("Usage: npm run load:test -- <url> [--concurrency 10] [--seconds 15] [--accept-encoding gzip] [--server-pid <pid>]");
  process.exit(1);
}

type Measurements = {
  latenciesMs: number[];
  statusCounts: Map<number, number>;
  totalBytes: number;
  failures: number;
};

// One request on the shared connection pool, resolved when the body has been read (or has failed).
function requestOnce(
  target: URL,
  agent: http.Agent,
  headers: Record<string, string>,
  measurements: Measurements,
): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const request = http.request(
      { host: target.hostname, port: target.port, path: target.pathname + target.search, agent, headers },
      (response) => {
        response.on("data", (chunk: Buffer) => {
          measurements.totalBytes += chunk.length;
        });
        response.on("end", () => {
          measurements.latenciesMs.push(performance.now() - startedAt);
          const status = response.statusCode ?? 0;
          measurements.statusCounts.set(status, (measurements.statusCounts.get(status) ?? 0) + 1);
          resolve();
        });
      },
    );
    request.on("error", () => {
      measurements.failures += 1;
      resolve();
    });
    request.end();
  });
}

async function virtualVisitor(
  visitorIndex: number,
  deadline: number,
  target: URL,
  agent: http.Agent,
  runSalt: number,
  acceptEncoding: string,
  measurements: Measurements,
): Promise<void> {
  for (let requestIndex = 0; Date.now() < deadline; requestIndex += 1) {
    const headers: Record<string, string> = { "x-forwarded-for": visitorAddress(runSalt, visitorIndex, requestIndex) };
    if (acceptEncoding) headers["accept-encoding"] = acceptEncoding;
    await requestOnce(target, agent, headers, measurements);
  }
}

// ps prints the process's CPU (a share of one core, so 400 is four busy cores) and resident memory.
async function sampleServer(serverPid: string): Promise<{ cpuPercent: number; rssKilobytes: number } | null> {
  try {
    const { stdout } = await runCommand("ps", ["-o", "%cpu=,rss=", "-p", serverPid]);
    return parseServerSample(stdout);
  } catch {
    return null;
  }
}

async function main(url: string): Promise<void> {
  const target = new URL(url);
  const concurrency = Number(options.concurrency);
  const durationMs = Number(options.seconds) * 1000;
  const acceptEncoding = options["accept-encoding"] ?? "";
  const serverPid = options["server-pid"];
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const measurements: Measurements = { latenciesMs: [], statusCounts: new Map(), totalBytes: 0, failures: 0 };
  const serverSamples: { cpuPercent: number; rssKilobytes: number }[] = [];
  const runSalt = 11 + Math.floor(Math.random() * 200);

  const startedAt = Date.now();
  const deadline = startedAt + durationMs;
  const sampler = serverPid
    ? setInterval(async () => {
        const sample = await sampleServer(serverPid);
        if (sample) serverSamples.push(sample);
      }, 500)
    : null;

  await Promise.all(
    Array.from({ length: concurrency }, (_, visitorIndex) =>
      virtualVisitor(visitorIndex, deadline, target, agent, runSalt, acceptEncoding, measurements),
    ),
  );
  if (sampler) clearInterval(sampler);
  agent.destroy();

  const result = summarize({
    url: target.pathname + target.search,
    concurrency,
    acceptEncoding,
    ...measurements,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
    serverSamples,
  });
  console.log(JSON.stringify(result));
  if (result.server) {
    const { averageCpuPercent, maxCpuPercent, maxMemoryMegabytes } = result.server;
    console.log(`server: avg cpu ${averageCpuPercent}%, max cpu ${maxCpuPercent}%, max memory ${maxMemoryMegabytes} MB`);
  }
}

main(targetUrl).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
