import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real script in a temporary data directory. It never runs the scraper: every run is given a
// harmless REFRESH_COMMAND, and a test that forgot one would get `true`, not `npm run jobs:refresh`.
// The lock needs flock(1), and a run needs GNU timeout(1). Linux has both (the scheduler container, GitHub's
// runner); macOS has neither. There the decision tests get a stand-in flock that always gets the lock, and
// the tests that need the real lock or a real run are skipped.
const scriptPath = fileURLToPath(new URL("./refresh-jobs-if-due.sh", import.meta.url));
const hasFlock = spawnSync("flock", ["--version"]).status === 0;
const hasTimeout = spawnSync("timeout", ["--version"]).status === 0;
const canRun = hasFlock && hasTimeout;
const TODAY = "2026-11-16";
const YESTERDAY = "2026-11-15";

interface ScriptResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface RunOptions {
  args?: string[];
  today?: string;
  hour?: string;
  command?: string;
  timeoutSeconds?: string;
}

let dataDir: string;
let standInDirectory: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "refresh-jobs-"));
  standInDirectory = path.join(dataDir, "bin");
  if (!hasFlock) {
    mkdirSync(standInDirectory);
    writeFileSync(path.join(standInDirectory, "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function scriptEnvironment(options: RunOptions): NodeJS.ProcessEnv {
  return {
    // Next's types make NODE_ENV a required key of every environment object.
    NODE_ENV: "test",
    PATH: hasFlock ? process.env.PATH : `${standInDirectory}:${process.env.PATH}`,
    HOME: process.env.HOME,
    REFRESH_DATA_DIR: dataDir,
    REFRESH_TODAY: options.today ?? TODAY,
    REFRESH_HOUR: options.hour ?? "09",
    REFRESH_COMMAND: options.command ?? "true",
    ...(options.timeoutSeconds ? { REFRESH_TIMEOUT: options.timeoutSeconds } : {}),
  };
}

function runScript(options: RunOptions = {}): Promise<ScriptResult> {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [scriptPath, ...(options.args ?? [])],
      { env: scriptEnvironment(options) },
      (error, stdout, stderr) => {
        const status = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ status, stdout, stderr });
      },
    );
  });
}

function writeState(options: { jobsJson?: boolean; lastRefresh?: string } = {}): void {
  if (options.jobsJson ?? true) writeFileSync(path.join(dataDir, "jobs.json"), "[]");
  if (options.lastRefresh) writeFileSync(path.join(dataDir, ".last-refresh"), `${options.lastRefresh}\n`);
}

function lastRefresh(): string | null {
  const stateFile = path.join(dataDir, ".last-refresh");
  return existsSync(stateFile) ? readFileSync(stateFile, "utf8").trim() : null;
}

// A command that leaves a file behind, to tell whether a run happened at all.
function markerCommand(): { command: string; ran: () => boolean } {
  const marker = path.join(dataDir, "ran.marker");
  return { command: `echo ran > '${marker}'`, ran: () => existsSync(marker) };
}

// Holds the lock the way a running refresh does, until the returned function is called.
async function holdLock(): Promise<() => void> {
  // `exec sleep`: the lock is held by whoever has the file open, so a child left behind would keep it.
  const holder = spawn("bash", [
    "-c",
    `exec 9>'${path.join(dataDir, ".refresh.lock")}'; flock -n 9 && echo locked && exec sleep 60`,
  ]);
  await new Promise<void>((resolve, reject) => {
    holder.stdout.once("data", () => resolve());
    holder.once("error", reject);
    holder.once("exit", () => reject(new Error("the lock holder exited before it held the lock")));
  });
  return () => holder.kill("SIGKILL");
}

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

describe("refresh-jobs-if-due.sh --dry-run: the decision", () => {
  it("skips when there is no jobs.json, and says why", async () => {
    writeState({ jobsJson: false });
    const { status, stdout } = await runScript({ args: ["--dry-run"] });
    expect(status).toBe(0);
    expect(stdout).toContain("skip: no jobs.json");
    expect(stdout).toContain("deployment.md");
  });

  it("skips before 05:00 Belgrade time", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { status, stdout } = await runScript({ args: ["--dry-run"], hour: "04" });
    expect(status).toBe(0);
    expect(stdout).toContain("skip: it is 04:xx in Europe/Belgrade, before 05:00");
  });

  it("would run at 05:xx when nothing has run today", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { status, stdout } = await runScript({ args: ["--dry-run"], hour: "05" });
    expect(status).toBe(0);
    expect(stdout).toContain("dry-run: would run: true");
    expect(stdout).toContain(`today ${TODAY}`);
  });

  it("would run late in the day, the catch-up after a Mac that slept through 05:07", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { stdout } = await runScript({ args: ["--dry-run"], hour: "16" });
    expect(stdout).toContain("dry-run: would run");
  });

  it("would run when there is no .last-refresh at all", async () => {
    writeState();
    const { stdout } = await runScript({ args: ["--dry-run"], hour: "07" });
    expect(stdout).toContain("dry-run: would run");
  });

  it("skips when it has already run today", async () => {
    writeState({ lastRefresh: TODAY });
    const { status, stdout } = await runScript({ args: ["--dry-run"], hour: "09" });
    expect(status).toBe(0);
    expect(stdout).toContain(`skip: already ran today (${TODAY})`);
  });

  it("reads 08 and 09 as hours, not as bad octal numbers", async () => {
    writeState({ lastRefresh: YESTERDAY });
    for (const hour of ["08", "09"]) {
      const { status, stdout } = await runScript({ args: ["--dry-run"], hour });
      expect(status).toBe(0);
      expect(stdout).toContain("dry-run: would run");
    }
  });

  it("runs nothing and writes nothing", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { command, ran } = markerCommand();
    await runScript({ args: ["--dry-run"], hour: "09", command });
    expect(ran()).toBe(false);
    expect(lastRefresh()).toBe(YESTERDAY);
  });

  it("with --force ignores the hour and the date", async () => {
    writeState({ lastRefresh: TODAY });
    const { stdout } = await runScript({ args: ["--dry-run", "--force"], hour: "03" });
    expect(stdout).toContain("dry-run: would run");
    expect(stdout).toContain("force true");
  });

  it("with --force still needs jobs.json", async () => {
    writeState({ jobsJson: false });
    const { stdout } = await runScript({ args: ["--dry-run", "--force"] });
    expect(stdout).toContain("skip: no jobs.json");
  });

  it("refuses an option it does not know, and a date or hour that is not one", async () => {
    writeState();
    expect((await runScript({ args: ["--dry-runn"] })).status).toBe(2);
    expect((await runScript({ today: "16.11.2026" })).status).toBe(2);
    expect((await runScript({ hour: "noon" })).status).toBe(2);
  });

  it("takes the date and the hour from the clock in the zone it is given", async () => {
    writeState();
    const timeZone = "Pacific/Kiritimati";
    const expectedToday = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    const result = await new Promise<ScriptResult>((resolve) => {
      execFile(
        "bash",
        [scriptPath, "--dry-run", "--force"],
        { env: { ...scriptEnvironment({}), REFRESH_TODAY: "", REFRESH_HOUR: "", REFRESH_TIME_ZONE: timeZone } },
        (error, stdout, stderr) => resolve({ status: error ? 1 : 0, stdout, stderr }),
      );
    });
    expect(result.stdout).toContain(`today ${expectedToday}`);
  });
});

describe.skipIf(!hasFlock)("refresh-jobs-if-due.sh and its lock", () => {
  it("skips, with --dry-run and without, while another run holds the lock", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { command, ran } = markerCommand();
    const release = await holdLock();
    try {
      const dryRun = await runScript({ args: ["--dry-run"], command });
      expect(dryRun.status).toBe(0);
      expect(dryRun.stdout).toContain("skip: another run holds the lock");
      const realRun = await runScript({ command });
      expect(realRun.status).toBe(0);
      expect(realRun.stdout).toContain("skip: another run holds the lock");
      expect(ran()).toBe(false);
      expect(lastRefresh()).toBe(YESTERDAY);
    } finally {
      release();
    }
  });

  it("--force does not break the lock", async () => {
    writeState({ lastRefresh: TODAY });
    const { command, ran } = markerCommand();
    const release = await holdLock();
    try {
      const { stdout } = await runScript({ args: ["--force"], command });
      expect(stdout).toContain("skip: another run holds the lock");
      expect(ran()).toBe(false);
    } finally {
      release();
    }
  });

  it("is free again once the other run has gone", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const release = await holdLock();
    release();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { stdout } = await runScript({ args: ["--dry-run"] });
    expect(stdout).toContain("dry-run: would run");
  });
});

describe.skipIf(!canRun)("refresh-jobs-if-due.sh running the refresh", () => {
  it("runs the command, records today and logs the start, the end and the exit code", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { command, ran } = markerCommand();
    const { status, stdout } = await runScript({ command });
    expect(status).toBe(0);
    expect(ran()).toBe(true);
    expect(lastRefresh()).toBe(TODAY);
    expect(stdout).toContain("refresh-jobs: start:");
    expect(stdout).toContain("refresh-jobs: end: exit code 0");
  });

  it("records today and exits with the command's code when it fails, so the log shows the failure", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { status, stdout } = await runScript({ command: "echo one step failed; exit 3" });
    expect(status).toBe(3);
    expect(lastRefresh()).toBe(TODAY);
    expect(stdout).toContain("one step failed");
    expect(stdout).toContain("end: exit code 3");
  });

  it("does not run twice on one day", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { command, ran } = markerCommand();
    await runScript({ command });
    rmSync(path.join(dataDir, "ran.marker"));
    const second = await runScript({ command });
    expect(second.stdout).toContain(`skip: already ran today (${TODAY})`);
    expect(ran()).toBe(false);
  });

  it("runs again the next day", async () => {
    writeState({ lastRefresh: YESTERDAY });
    await runScript();
    const { command, ran } = markerCommand();
    await runScript({ command, today: "2026-11-17" });
    expect(ran()).toBe(true);
    expect(lastRefresh()).toBe("2026-11-17");
  });

  it("with --force runs now even though it ran today, and records the date", async () => {
    writeState({ lastRefresh: TODAY });
    const { command, ran } = markerCommand();
    const { status } = await runScript({ args: ["--force"], command, hour: "02" });
    expect(status).toBe(0);
    expect(ran()).toBe(true);
    expect(lastRefresh()).toBe(TODAY);
  });

  it("never runs without jobs.json, and records nothing", async () => {
    writeState({ jobsJson: false });
    const { command, ran } = markerCommand();
    await runScript({ args: ["--force"], command });
    expect(ran()).toBe(false);
    expect(lastRefresh()).toBeNull();
  });

  it("stops a run that takes too long, and records the day", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const { status, stdout } = await runScript({ command: "sleep 30", timeoutSeconds: "1" });
    expect(status).toBe(124);
    expect(lastRefresh()).toBe(TODAY);
    expect(stdout).toContain("end: exit code 124");
  });

  it("hands a SIGTERM (docker stop) on to the run, which then gets to save, and does not record the day", async () => {
    writeState({ lastRefresh: YESTERDAY });
    const started = path.join(dataDir, "started.marker");
    const finished = path.join(dataDir, "finished.marker");
    const command = `trap "echo saved > '${finished}'; exit 0" TERM; echo up > '${started}'; sleep 30 & wait`;
    const script = spawn("bash", [scriptPath], { env: scriptEnvironment({ command }) });
    let output = "";
    script.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const exited = new Promise<number | null>((resolve) => script.once("exit", (code) => resolve(code)));
    await waitForFile(started);
    script.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(existsSync(finished)).toBe(true);
    // Stopped, not finished: the next check, after the restart, goes on with the rest.
    expect(lastRefresh()).toBe(YESTERDAY);
    expect(output).toContain("stopped before it finished");
  });
});
