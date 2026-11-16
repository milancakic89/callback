import { execFile, spawnSync } from "node:child_process";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real script against a small local server that stands in for the app. The script talks to
// whatever APP_URL says, so nothing here reaches the real app.
const scriptPath = fileURLToPath(new URL("./expire-interviews.sh", import.meta.url));
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

interface ReceivedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
}

interface ScriptResult {
  status: number;
  stdout: string;
  stderr: string;
}

let server: Server;
let appUrl: string;
let received: ReceivedRequest[];
let answerStatus: number;

beforeEach(async () => {
  received = [];
  answerStatus = 200;
  server = createServer((request, response) => {
    received.push({ method: request.method, url: request.url, headers: request.headers });
    response.statusCode = answerStatus;
    response.setHeader("content-type", "application/json");
    response.end(answerStatus === 200 ? JSON.stringify({ expired: 2 }) : "Not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  appUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

async function stopServer(): Promise<void> {
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(stopServer);

function runScript(environment: Record<string, string>): Promise<ScriptResult> {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [scriptPath],
      // NODE_ENV: Next's types make it a required key of every environment object.
      { env: { NODE_ENV: "test", PATH: process.env.PATH, ...environment } },
      (error, stdout, stderr) => {
        const status = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ status, stdout, stderr });
      },
    );
  });
}

describe("syntax", () => {
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", scriptPath]).status).toBe(0);
  });
});

describe("expire-interviews.sh", () => {
  it("does nothing, and says so, when CRON_SECRET is not set", async () => {
    const { status, stdout } = await runScript({ APP_URL: appUrl });
    expect(status).toBe(0);
    expect(stdout).toContain("CRON_SECRET is not set, nothing to do");
    expect(received).toHaveLength(0);
  });

  it("does nothing when CRON_SECRET is empty", async () => {
    const { status } = await runScript({ APP_URL: appUrl, CRON_SECRET: "" });
    expect(status).toBe(0);
    expect(received).toHaveLength(0);
  });

  it("POSTs to /api/interviews/expire with the secret as a bearer token", async () => {
    const { status, stdout } = await runScript({ APP_URL: appUrl, CRON_SECRET: SECRET });
    expect(status).toBe(0);
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("POST");
    expect(received[0].url).toBe("/api/interviews/expire");
    expect(received[0].headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(stdout).toContain('{"expired":2}');
    expect(stdout).toContain("expire-interviews: done");
  });

  it("does not double the slash when APP_URL ends with one", async () => {
    await runScript({ APP_URL: `${appUrl}/`, CRON_SECRET: SECRET });
    expect(received[0].url).toBe("/api/interviews/expire");
  });

  it("fails, with curl's exit status 22, when the app answers 404 (a wrong secret)", async () => {
    answerStatus = 404;
    const { status, stdout, stderr } = await runScript({ APP_URL: appUrl, CRON_SECRET: SECRET });
    expect(status).toBe(22);
    expect(stderr).toContain("404");
    expect(stdout).not.toContain("expire-interviews: done");
  });

  it("fails when the app answers 500", async () => {
    answerStatus = 500;
    const { status } = await runScript({ APP_URL: appUrl, CRON_SECRET: SECRET });
    expect(status).toBe(22);
  });

  it("fails when the app cannot be reached", async () => {
    await stopServer();
    const { status } = await runScript({ APP_URL: appUrl, CRON_SECRET: SECRET });
    expect(status).not.toBe(0);
  });

  it("never writes the secret to its output, not even when the call fails", async () => {
    answerStatus = 500;
    const { stdout, stderr } = await runScript({ APP_URL: appUrl, CRON_SECRET: SECRET });
    expect(stdout + stderr).not.toContain(SECRET);
  });
});
