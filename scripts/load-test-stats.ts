// The arithmetic of scripts/load-test.ts, apart from the requests, so it can be tested.

// The value `fraction` of the way up a list sorted from smallest to largest (0.5 is the median).
// 0 for an empty list.
export function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * fraction))];
}

// The address a virtual visitor sends as X-Forwarded-For, which is what the app's per-IP limit
// (300 a minute, src/lib/rate-limit.ts) counts by: each visitor gets its own, and a new one every 250
// requests, so no address stays under the limit's notice for long. `runSalt` keeps two runs from
// sharing addresses (the limit survives between them for a minute).
export function visitorAddress(runSalt: number, visitorIndex: number, requestIndex: number): string {
  const thirdOctet = Math.floor(requestIndex / 250) % 250;
  return `${runSalt}.${visitorIndex % 250}.${thirdOctet}.${(visitorIndex >> 8) + 1}`;
}

// One reading of the server process: what `ps -o %cpu=,rss=` prints for it, e.g. " 87.3 1403920".
// RSS is in kilobytes. Null for anything else (the process is gone, or ps said something unexpected).
export function parseServerSample(psOutput: string): { cpuPercent: number; rssKilobytes: number } | null {
  const [cpuText, rssText] = psOutput.trim().split(/\s+/);
  const cpuPercent = Number(cpuText);
  const rssKilobytes = Number(rssText);
  if (!cpuText || !rssText || !Number.isFinite(cpuPercent) || !Number.isFinite(rssKilobytes)) return null;
  return { cpuPercent, rssKilobytes };
}

export type LoadTestInput = {
  url: string;
  concurrency: number;
  acceptEncoding: string;
  latenciesMs: number[];
  elapsedSeconds: number;
  totalBytes: number;
  statusCounts: ReadonlyMap<number, number>;
  failures: number;
  serverSamples: { cpuPercent: number; rssKilobytes: number }[];
};

export type LoadTestResult = {
  url: string;
  concurrency: number;
  acceptEncoding: string;
  requests: number;
  requestsPerSecond: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  megabytesPerSecond: number;
  averageKilobytes: number;
  statuses: string;
  failures: number;
  // Only when the run was told which process is the server.
  server: { averageCpuPercent: number; maxCpuPercent: number; maxMemoryMegabytes: number } | null;
};

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export function summarize(input: LoadTestInput): LoadTestResult {
  const latencies = [...input.latenciesMs].sort((left, right) => left - right);
  const requests = latencies.length;
  const samples = input.serverSamples;
  return {
    url: input.url,
    concurrency: input.concurrency,
    acceptEncoding: input.acceptEncoding || "(none)",
    requests,
    requestsPerSecond: round(requests / input.elapsedSeconds),
    p50Ms: Math.round(percentile(latencies, 0.5)),
    p95Ms: Math.round(percentile(latencies, 0.95)),
    p99Ms: Math.round(percentile(latencies, 0.99)),
    megabytesPerSecond: round(input.totalBytes / input.elapsedSeconds / 1e6),
    averageKilobytes: Math.round(input.totalBytes / Math.max(1, requests) / 1000),
    statuses: [...input.statusCounts].map(([status, count]) => `${status}:${count}`).join(" "),
    failures: input.failures,
    server:
      samples.length === 0
        ? null
        : {
            averageCpuPercent: Math.round(samples.reduce((sum, sample) => sum + sample.cpuPercent, 0) / samples.length),
            maxCpuPercent: Math.round(Math.max(...samples.map((sample) => sample.cpuPercent))),
            maxMemoryMegabytes: Math.round(Math.max(...samples.map((sample) => sample.rssKilobytes)) / 1024),
          },
  };
}
