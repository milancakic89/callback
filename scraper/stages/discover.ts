import { getAdapter } from "../ats/registry";
import { BOARD_NAMES } from "../boards/board";
import { logProgress, type StageOptions } from "../options";
import { forEachLimit } from "../pool";
import { createSaver, readData, writeData } from "../store";
import { createAdminClient, loadEnv } from "../supabase";
import { coreName, describeError, domainLabel, plain } from "../text";
import { companyBoardsFileSchema, type AtsName, type CompanyBoard } from "../types";

// Workable is left out: its Cloudflare rate limit answered a short burst with a ~23-hour ban.
// SmartRecruiters' adapter only reads Serbian postings, so it adds nothing for remote companies.
const DISCOVER_ATS: AtsName[] = ["greenhouse", "lever", "ashby", "recruitee", "breezy"];
const RECHECK_MISSES_AFTER_MS = 60 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

type Seen = { name: string; titles: Set<string>; labels: Set<string> };

function titleKey(title: string): string {
  return plain(title).replace(/[^a-z0-9]+/g, " ").trim();
}

// "Lemon.io" → lemonio, lemon-io, plus "lemon" from a website the posting names.
function slugCandidates(company: Seen): string[] {
  const core = coreName(company.name);
  const slugs = new Set([...company.labels]);
  if (core) {
    slugs.add(core.replace(/ /g, ""));
    slugs.add(core.replace(/ /g, "-"));
  }
  return [...slugs].filter((slug) => /^[a-z0-9][a-z0-9-]{2,}$/.test(slug)).slice(0, 3);
}

function exactName(name: string): string {
  return plain(name).replace(/[^a-z0-9]+/g, "");
}

// "Startale Group", "DeepIntent": unlikely to be another company. "Plume" may well be.
function distinctive(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2 || exactName(name).length >= 6;
}

// A guessed board counts only when it provably belongs to this company: it lists a posting with
// the same title as one this company has on a job board, or the ATS reports exactly this name and
// the name is distinctive. Not coreName(): "Recall Labs" and "Recall" are different companies.
async function findBoard(company: Seen): Promise<Pick<CompanyBoard, "ats" | "slug" | "via"> | null> {
  for (const slug of slugCandidates(company)) {
    for (const ats of DISCOVER_ATS) {
      const adapter = getAdapter(ats);
      const probe = await adapter?.probe?.(slug).catch(() => null);
      if (!adapter || !probe) continue;
      if (probe.name && exactName(probe.name) === exactName(company.name) && distinctive(company.name)) {
        return { ats, slug, via: "name" };
      }
      if (probe.jobCount === 0) continue;
      const jobs = await adapter.fetchJobs(slug).catch(() => []);
      if (jobs.some((job) => company.titles.has(titleKey(job.title)))) return { ats, slug, via: "title" };
    }
  }
  return null;
}

// Companies posting on the job boards, with their titles and any website a posting names
// (We Work Remotely descriptions start with "URL: https://…").
async function boardCompanies(): Promise<Map<string, Seen>> {
  const supabase = createAdminClient(loadEnv());
  const sources = BOARD_NAMES.filter((name) => name !== "companyboards");
  const companies = new Map<string, Seen>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("jobs")
      .select("company_name, title, source, description")
      .eq("active", true)
      .in("source", sources)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<{ company_name: string; title: string; source: string; description: string | null }[]>();
    if (error) throw new Error(`Reading board companies failed: ${error.message}`);
    for (const row of data ?? []) {
      const key = coreName(row.company_name) || plain(row.company_name);
      if (!key) continue;
      const seen = companies.get(key) ?? { name: row.company_name, titles: new Set(), labels: new Set() };
      seen.titles.add(titleKey(row.title));
      const website = row.source === "weworkremotely" ? /\bURL:\s*(https?:\/\/\S+)/.exec(row.description ?? "")?.[1] : null;
      const label = website ? domainLabel(website) : null;
      if (label) seen.labels.add(label);
      companies.set(key, seen);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return companies;
}

// Finds the ATS boards of companies that post remote jobs on the job boards, so `boards` can read
// every job they list (boards/companyboards.ts). Found boards are kept; misses are retried after
// 60 days. Run after `boards`, which supplies the company names. See features/job-boards.md.
export async function runDiscover(options: StageOptions): Promise<void> {
  const companies = await boardCompanies();
  const boards = await readData("company-boards.json", companyBoardsFileSchema, {});
  const filters = options.only.map((value) => value.toLowerCase());
  const pending = [...companies]
    .filter(([key, company]) => {
      if (filters.length) return filters.some((value) => company.name.toLowerCase().includes(value));
      const known = boards[key];
      if (!known || options.force) return true;
      return !known.ats && Date.now() - Date.parse(known.checkedAt) > RECHECK_MISSES_AFTER_MS;
    })
    .slice(0, options.limit ?? undefined);
  console.log(`[discover] ${pending.length} of ${companies.size} board companies to check`);

  const save = createSaver(() => writeData("company-boards.json", boards, companyBoardsFileSchema));
  let done = 0;
  let found = 0;
  await forEachLimit(
    pending,
    options.concurrency,
    async ([key, company]) => {
      let outcome: string;
      try {
        const board = await findBoard(company);
        boards[key] = { name: company.name, ats: null, slug: null, via: null, ...board, checkedAt: new Date().toISOString() };
        if (board) found++;
        outcome = board ? `${board.ats}:${board.slug} (${board.via})` : "no board";
      } catch (error) {
        outcome = `error: ${describeError(error)}`;
      }
      logProgress("discover", ++done, pending.length, company.name, outcome);
      if (done % 50 === 0) await save();
    },
    options.signal,
  );
  await save();
  const total = Object.values(boards).filter((board) => board.ats).length;
  console.log(`[discover] found ${found} new boards; ${total} known in company-boards.json`);
}
