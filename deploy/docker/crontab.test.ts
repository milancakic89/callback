import { accessSync, constants, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dockerDirectory = fileURLToPath(new URL(".", import.meta.url));
const crontab = readFileSync(path.join(dockerDirectory, "crontab"), "utf8");
// The scheduler image has the repository's deploy/docker at /app/deploy/docker.
const IMAGE_ROOT = "/app/";
const repositoryRoot = path.resolve(dockerDirectory, "../..");

interface CronEntry {
  schedule: string;
  command: string;
}

function parseEntries(text: string): CronEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const fields = line.split(/\s+/);
      return { schedule: fields.slice(0, 5).join(" "), command: fields.slice(5).join(" ") };
    });
}

const entries = parseEntries(crontab);

describe("parseEntries", () => {
  it("skips comments and blank lines, and splits the five schedule fields from the command", () => {
    expect(parseEntries("# a comment\n\n*/15 * * * * /app/a.sh --flag\n  7 * * * *   /app/b.sh  \n")).toEqual([
      { schedule: "*/15 * * * *", command: "/app/a.sh --flag" },
      { schedule: "7 * * * *", command: "/app/b.sh" },
    ]);
  });
});

describe("deploy/docker/crontab", () => {
  it("has the interview expiry and the job refresh, and nothing else", () => {
    expect(entries.map((entry) => entry.command)).toEqual([
      "/app/deploy/docker/expire-interviews.sh",
      "/app/deploy/docker/refresh-jobs-if-due.sh",
    ]);
  });

  it("expires the invitations every 15 minutes, like callback-interviews.timer", () => {
    expect(entries[0].schedule).toBe("*/15 * * * *");
  });

  it("asks whether the refresh is due once an hour, at :07, never on its own at a fixed day or hour", () => {
    expect(entries[1].schedule).toBe("7 * * * *");
  });

  it("has a valid five-field schedule on every line", () => {
    for (const entry of entries) {
      const fields = entry.schedule.split(" ");
      expect(fields).toHaveLength(5);
      expect(fields[0]).toMatch(/^(\*|\*\/\d+|\d+)$/);
    }
  });

  it("runs scripts that exist in the repository and can be executed", () => {
    for (const entry of entries) {
      expect(entry.command.startsWith(IMAGE_ROOT)).toBe(true);
      const script = path.join(repositoryRoot, entry.command.slice(IMAGE_ROOT.length));
      expect(() => accessSync(script, constants.X_OK)).not.toThrow();
    }
  });
});
