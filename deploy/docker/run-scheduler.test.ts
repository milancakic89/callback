import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real wrapper with a stand-in for supercronic (one that, like it, waits for its job and never
// passes a signal on) and a stand-in for the refresh script, found by the name the wrapper looks for.
const scriptPath = fileURLToPath(new URL("./run-scheduler.sh", import.meta.url));

// Next's types make NODE_ENV a required key of every environment object.
const scriptEnvironment = { NODE_ENV: "test" as const, PATH: process.env.PATH };

let workDir: string;
let fakeRefreshPath: string;
let fakeSchedulerPath: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "run-scheduler-"));
  mkdirSync(path.join(workDir, "deploy", "docker"), { recursive: true });
  fakeRefreshPath = path.join(workDir, "deploy", "docker", "refresh-jobs-if-due.sh");
  fakeSchedulerPath = path.join(workDir, "fake-scheduler.sh");
  // The "refresh": says it is up, and on SIGTERM takes a moment to "save", then leaves.
  writeFileSync(
    fakeRefreshPath,
    `#!/usr/bin/env bash
trap 'sleep 0.3; echo saved > "${workDir}/refresh-saved"; exit 0' TERM
echo up > "${workDir}/refresh-up"
sleep 30 &
wait
`,
  );
  // The "supercronic": starts the refresh as its job, ignores SIGTERM itself and leaves when the job has.
  writeFileSync(
    fakeSchedulerPath,
    `#!/usr/bin/env bash
trap 'echo got-term > "${workDir}/scheduler-got-term"' TERM
"${fakeRefreshPath}" &
job_pid=$!
wait "$job_pid"
wait "$job_pid"
echo job-done > "${workDir}/scheduler-job-done"
exit 7
`,
  );
  chmodSync(fakeRefreshPath, 0o755);
  chmodSync(fakeSchedulerPath, 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

async function waitForFile(file: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${file} never appeared`);
}

describe("syntax", () => {
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", scriptPath]).status).toBe(0);
  });
});

describe("run-scheduler.sh", () => {
  it("passes on the scheduler's exit status when nothing stops it", async () => {
    const wrapper = spawn("bash", [scriptPath, "bash", "-c", "exit 5"], { env: scriptEnvironment });
    const status = await new Promise<number | null>((resolve) => wrapper.once("exit", (code) => resolve(code)));
    expect(status).toBe(5);
  });

  it("also waits for a refresh started by hand, which is nobody's child but its own", async () => {
    // Like `docker compose exec`: not started by the scheduler, so nothing but the wrapper can wait for it.
    const byHand = spawn(fakeRefreshPath, [], { stdio: "ignore", detached: true });
    byHand.unref();
    await waitForFile(path.join(workDir, "refresh-up"));
    const wrapper = spawn("bash", [scriptPath, "sleep", "30"], {
      env: { ...scriptEnvironment, STOP_JOB_PATTERN: `${workDir}/deploy/docker/refresh-jobs-if-due\\.sh` },
    });
    const exited = new Promise<number | null>((resolve) => wrapper.once("exit", (code) => resolve(code)));
    await new Promise((resolve) => setTimeout(resolve, 200));

    wrapper.kill("SIGTERM");
    await exited;

    // The refresh needs 0.3 s to save after it is told to stop; the wrapper did not leave before that.
    expect(existsSync(path.join(workDir, "refresh-saved"))).toBe(true);
  });

  it("hands SIGTERM to a running refresh, waits for it to save, and then ends", async () => {
    const wrapper = spawn("bash", [scriptPath, fakeSchedulerPath], {
      env: { ...scriptEnvironment, STOP_JOB_PATTERN: `${workDir}/deploy/docker/refresh-jobs-if-due\\.sh` },
    });
    const exited = new Promise<number | null>((resolve) => wrapper.once("exit", (code) => resolve(code)));
    await waitForFile(path.join(workDir, "refresh-up"));

    wrapper.kill("SIGTERM");
    const status = await exited;

    // The refresh was told to stop and finished saving before the wrapper left...
    expect(existsSync(path.join(workDir, "refresh-saved"))).toBe(true);
    // ...the scheduler was told too, and waited for its job...
    expect(existsSync(path.join(workDir, "scheduler-got-term"))).toBe(true);
    expect(existsSync(path.join(workDir, "scheduler-job-done"))).toBe(true);
    // ...and the wrapper's status is the scheduler's own.
    expect(status).toBe(7);
  });
});
