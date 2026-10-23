import { parseArgs } from "node:util";
import { closeBrowser } from "./browser";
import type { StageOptions } from "./options";
import { revalidateJobs } from "./revalidate";
import { runBoards } from "./stages/boards";
import { runCareers } from "./stages/careers";
import { runCompanies } from "./stages/companies";
import { runCoverage } from "./stages/coverage";
import { runDescriptions } from "./stages/descriptions";
import { runDiscover } from "./stages/discover";
import { runFinalize } from "./stages/finalize";
import { runJobs } from "./stages/jobs";
import { runPublish } from "./stages/publish";

const USAGE = `Usage: npm run scrape -- <command> [options]

Commands (output goes to scraper/data/):
  companies     Joberty companies with an office in Serbia → companies.json, joberty-jobs.json
  careers       find each company's careers page or ATS     → careers.json
  jobs          collect positions, then finalize            → jobs-raw.json, jobs.json, report.json, needs-review.json
  descriptions  backfill the full text for jobs missing one → updates jobs.json in place
  finalize      rebuild jobs.json, report.json and needs-review.json from what's already scraped
  coverage      offline pass/fail list, one line per company → coverage-report.txt
  publish       upsert jobs.json into the Supabase "jobs" table (needs SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local)
  boards        remote jobs open to Serbia from Himalayas, Jobicy, RemoteOK, Remotive and Arbeitnow,
                straight into the "jobs" table; run after publish   → boards-report.json
  discover      find the ATS boards (Greenhouse, Lever, Ashby…) of companies on the job boards, for
                "boards" to read; --company/--limit/--force apply   → company-boards.json
  revalidate    make the dashboard drop its cached job list now (publish and boards already do this;
                needs APP_URL and REVALIDATE_SECRET in .env.local, and the app running)
  all         companies, careers, jobs (not descriptions — see below)
  refresh       everything, for cron (npm run jobs:refresh): all, descriptions, publish, discover, boards.
                A failing step is logged and the rest still run; exits 1 if any failed

Most jobs already get a description for free while "jobs" runs (it's in the same API
response). "descriptions" is a separate, optional pass for the rest: one extra request per
job, so it's worth running occasionally rather than every time.

Options:
  --company <text>   only companies whose Joberty slug (or, for "descriptions", company
                      name) contains this; repeatable; always re-runs them
  --limit <n>        process at most n companies (or jobs, for "descriptions")
  --force            re-run companies/jobs that already have a recent result
  --no-browser       skip Playwright fallbacks (faster, lower coverage)
  --concurrency <n>  companies in parallel (default 10)`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      company: { type: "string", multiple: true },
      limit: { type: "string" },
      force: { type: "boolean", default: false },
      "no-browser": { type: "boolean", default: false },
      concurrency: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const [command] = positionals;

  const controller = new AbortController();
  let firstInterruptAt = 0;
  const stop = (signal: NodeJS.Signals) => {
    if (!firstInterruptAt) {
      firstInterruptAt = Date.now();
      console.log(`\n${signal}: stopping after the companies in progress… (Ctrl+C again to quit now)`);
      controller.abort();
    } else if (Date.now() - firstInterruptAt > 1000) {
      process.exit(130);
    }
    // Within a second it's the same keypress, relayed again by npm.
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const options: StageOptions = {
    only: values.company ?? [],
    limit: values.limit ? Number(values.limit) : null,
    force: values.force,
    browser: !values["no-browser"],
    concurrency: values.concurrency ? Number(values.concurrency) : 10,
    signal: controller.signal,
  };

  switch (command) {
    case "companies":
      await runCompanies();
      break;
    case "careers":
      await runCareers(options);
      break;
    case "jobs":
      await runJobs(options);
      break;
    case "descriptions":
      await runDescriptions(options);
      break;
    case "finalize":
      await runFinalize();
      break;
    case "coverage":
      await runCoverage();
      break;
    case "publish":
      await runPublish();
      break;
    case "boards":
      await runBoards(controller.signal);
      break;
    case "revalidate":
      await revalidateJobs();
      break;
    case "discover":
      await runDiscover(options);
      break;
    case "all":
      await runCompanies();
      if (!controller.signal.aborted) await runCareers(options);
      if (!controller.signal.aborted) await runJobs(options);
      break;
    case "refresh": {
      // Each step can run on the previous step's files, so one failure (Joberty down, a Supabase
      // outage) doesn't stop the rest — the job boards in particular don't depend on the scraper.
      const steps: [string, () => Promise<void>][] = [
        ["companies", runCompanies],
        ["careers", () => runCareers(options)],
        ["jobs", () => runJobs(options)],
        ["descriptions", () => runDescriptions(options)],
        ["publish", runPublish],
        // Reads company names from the boards' last run; new boards it finds are read right after.
        ["discover", () => runDiscover(options)],
        ["boards", () => runBoards(controller.signal)],
      ];
      const failed: string[] = [];
      for (const [name, run] of steps) {
        if (controller.signal.aborted) break;
        console.log(`[refresh] ${name}…`);
        try {
          await run();
        } catch (error) {
          console.error(`[refresh] ${name} failed:`, error);
          failed.push(name);
        }
      }
      if (failed.length) {
        console.error(`[refresh] done with failures: ${failed.join(", ")}`);
        process.exitCode = 1;
      } else if (!controller.signal.aborted) {
        console.log("[refresh] done");
      }
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = values.help ? 0 : 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
