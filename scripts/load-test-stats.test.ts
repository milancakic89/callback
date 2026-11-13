import { describe, expect, it } from "vitest";
import { parseServerSample, percentile, summarize, visitorAddress } from "./load-test-stats";

describe("percentile", () => {
  it("picks the value that far up a sorted list", () => {
    const latencies = Array.from({ length: 100 }, (_, index) => index + 1);

    expect(percentile(latencies, 0.5)).toBe(51);
    expect(percentile(latencies, 0.95)).toBe(96);
    expect(percentile(latencies, 0.99)).toBe(100);
  });

  it("never reads past the end, and is 0 for an empty list", () => {
    expect(percentile([7], 0.99)).toBe(7);
    expect(percentile([1, 2, 3], 1)).toBe(3);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("visitorAddress", () => {
  it("gives each visitor an address of its own, which changes every 250 requests", () => {
    expect(visitorAddress(120, 0, 0)).toBe("120.0.0.1");
    expect(visitorAddress(120, 3, 0)).toBe("120.3.0.1");
    expect(visitorAddress(120, 3, 249)).toBe("120.3.0.1");
    expect(visitorAddress(120, 3, 250)).toBe("120.3.1.1");
  });

  it("carries visitors past 250 into the last octet, so none shares an address", () => {
    expect(visitorAddress(120, 250, 0)).toBe("120.0.0.1");
    expect(visitorAddress(120, 256, 0)).toBe("120.6.0.2");
  });
});

describe("parseServerSample", () => {
  it("reads what ps prints for the server's CPU and memory", () => {
    expect(parseServerSample(" 87.3 1403920\n")).toEqual({ cpuPercent: 87.3, rssKilobytes: 1403920 });
  });

  it("is null when the process is gone or ps says something else", () => {
    expect(parseServerSample("")).toBeNull();
    expect(parseServerSample("12.0")).toBeNull();
    expect(parseServerSample("abc def")).toBeNull();
  });
});

describe("summarize", () => {
  const input = {
    url: "http://127.0.0.1:3100/jobs",
    concurrency: 50,
    acceptEncoding: "gzip",
    latenciesMs: [30, 10, 20, 40],
    elapsedSeconds: 2,
    totalBytes: 8_000_000,
    statusCounts: new Map([[200, 3], [500, 1]]),
    failures: 0,
    serverSamples: [],
  };

  it("works out the rate, the percentiles and the transfer from the raw numbers", () => {
    expect(summarize(input)).toMatchObject({
      requests: 4,
      requestsPerSecond: 2,
      p50Ms: 30,
      p95Ms: 40,
      megabytesPerSecond: 4,
      averageKilobytes: 2000,
      statuses: "200:3 500:1",
      failures: 0,
      server: null,
    });
  });

  it("adds the server's CPU and memory when it was sampled", () => {
    const result = summarize({
      ...input,
      serverSamples: [
        { cpuPercent: 50, rssKilobytes: 512 * 1024 },
        { cpuPercent: 100, rssKilobytes: 1024 * 1024 },
      ],
    });

    expect(result.server).toEqual({ averageCpuPercent: 75, maxCpuPercent: 100, maxMemoryMegabytes: 1024 });
  });

  it("says (none) when no encoding was asked for", () => {
    expect(summarize({ ...input, acceptEncoding: "" }).acceptEncoding).toBe("(none)");
  });

  it("doesn't divide by zero when nothing was answered", () => {
    expect(summarize({ ...input, latenciesMs: [], totalBytes: 0 })).toMatchObject({
      requests: 0,
      requestsPerSecond: 0,
      p50Ms: 0,
      averageKilobytes: 0,
    });
  });
});
