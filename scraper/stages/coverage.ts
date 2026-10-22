import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, readData } from "../store";
import { careersFileSchema, companiesFileSchema, jobsFileSchema, scrapesFileSchema } from "../types";

// Optional, offline: a plain-text pass/fail line per company whose careers page was found, e.g.
// "CAKE.com Serbia - uspeo (5)" / "Adobe - nisam uspeo (nema poslova na stranici)". Reads only
// what's already in scraper/data/ — no network — so it's cheap to regenerate after any `jobs` or
// `finalize` run to see exactly which companies still produce zero jobs, and roughly why.
export async function runCoverage(): Promise<void> {
  const companies = await readData("companies.json", companiesFileSchema, []);
  const careers = await readData("careers.json", careersFileSchema, {});
  const scrapes = await readData("jobs-raw.json", scrapesFileSchema, {});
  const jobs = await readData("jobs.json", jobsFileSchema, []);

  const activeCountByCompany = new Map<number, number>();
  for (const job of jobs) {
    if (!job.active) continue;
    activeCountByCompany.set(job.companyJobertyId, (activeCountByCompany.get(job.companyJobertyId) ?? 0) + 1);
  }

  // Same universe the `jobs` stage itself scrapes — companies with no careers page at all are a
  // different problem (Stage 2), out of scope for this pass/fail list.
  const attempted = companies.filter((company) => {
    const status = careers[company.jobertyId]?.status;
    return status === "found" || status === "ambiguous";
  });

  const succeeded: { name: string; n: number }[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const company of attempted) {
    const n = activeCountByCompany.get(company.jobertyId) ?? 0;
    if (n > 0) {
      succeeded.push({ name: company.name, n });
      continue;
    }
    const scrape = scrapes[company.jobertyId];
    let reason = "nema poslova na stranici";
    if (scrape?.status === "error") reason = `greška: ${scrape.error}`;
    else if (scrape?.jobs.length) reason = "svi pronađeni poslovi su van Srbije / ne ispunjavaju uslove";
    failed.push({ name: company.name, reason });
  }

  succeeded.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  failed.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    `Izveštaj pokrivenosti — ${new Date().toISOString()}`,
    `Pokušano (nađena stranica sa poslovima): ${attempted.length}`,
    `Uspeo (bar 1 aktivan posao): ${succeeded.length}`,
    `Nisam uspeo (0 aktivnih poslova): ${failed.length}`,
    "",
    `=== NISAM USPEO (${failed.length}) ===`,
    ...failed.map((f) => `${f.name} - nisam uspeo (${f.reason})`),
    "",
    `=== USPEO (${succeeded.length}) ===`,
    ...succeeded.map((s) => `${s.name} - uspeo (${s.n})`),
  ];

  const file = path.join(DATA_DIR, "coverage-report.txt");
  await writeFile(file, `${lines.join("\n")}\n`);
  console.log(`[coverage] ${succeeded.length} succeeded, ${failed.length} failed → ${file}`);
}
