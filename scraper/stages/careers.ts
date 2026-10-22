import * as cheerio from "cheerio";
import { pickAts } from "../ats/detect";
import { guessAts } from "../ats/guess";
import { getAdapter } from "../ats/registry";
import { renderPage } from "../browser";
import { looksLikeCareersUrl, pickCareersLink } from "../extract/links";
import { fetchHtml, request, robotsAllowed } from "../http";
import { logProgress, selectCompanies, type StageOptions } from "../options";
import { forEachLimit } from "../pool";
import { createSaver, readData, writeData } from "../store";
import { describeError, plain, sameSite } from "../text";
import { careersFileSchema, companiesFileSchema, type CareersResult, type Company } from "../types";

// Careers pages rarely move; re-check after this long without --force.
const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const COMMON_PATHS = ["/careers", "/career", "/jobs", "/karijera", "/en/careers", "/company/careers"];
const CAREERS_HEADING = /(career|karijer|jobs|posao|poslovi|pozicij|zaposlen|join us|open positions)/;
const NOISE_PATH = /\/(blog|news|vesti|tag|category|author|press|events?)\//;

type Via = NonNullable<CareersResult["via"]>;

function toggleWww(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.startsWith("www.") ? parsed.hostname.slice(4) : `www.${parsed.hostname}`;
  return parsed.href;
}

function result(fields: Partial<CareersResult> & Pick<CareersResult, "status">): CareersResult {
  return {
    careersUrl: null,
    via: null,
    ats: null,
    atsSlug: null,
    confidence: 0,
    candidates: [],
    error: null,
    checkedAt: new Date().toISOString(),
    ...fields,
  };
}

// Careers link from a homepage, plus any ATS the page (or its network requests) points at.
function fromHomepage(html: string, pageUrl: string, extraUrls: string[], via: Via): CareersResult | null {
  const pick = pickCareersLink(html, pageUrl);
  const ats = pickAts([html, ...extraUrls]);
  const adapter = ats ? getAdapter(ats.ats) : null;
  const candidates = pick.candidates.map(({ url, text, score }) => ({ url, text, score }));
  const atsFields = { ats: ats?.ats ?? null, atsSlug: ats?.slug ?? null };
  if (adapter && ats) {
    const careersUrl = pick.best?.url ?? adapter.boardUrl(ats.slug);
    return result({ status: "found", careersUrl, via, ...atsFields, confidence: 0.85, candidates });
  }
  if (!pick.best) return null;
  return result({
    status: pick.ambiguous ? "ambiguous" : "found",
    careersUrl: pick.best.url,
    via,
    ...atsFields,
    confidence: pick.ambiguous ? 0.4 : Math.min(0.9, pick.best.score / 12),
    candidates,
  });
}

async function probePaths(base: string): Promise<string | null> {
  const origin = new URL(base).origin;
  for (const path of COMMON_PATHS) {
    const page = await fetchHtml(`${origin}${path}`);
    // Host unreachable: no point trying the other paths.
    if (page.status === 0 && !page.blocked) return null;
    if (!page.usable || !sameSite(page.url, base) || !looksLikeCareersUrl(page.url)) continue;
    // SPAs answer 200 for any path, so the page itself has to be about careers.
    const $ = cheerio.load(page.html);
    if (CAREERS_HEADING.test(plain(`${$("title").text()} ${$("h1").first().text()}`))) return page.url;
  }
  return null;
}

async function sitemapUrls(url: string, depth: number): Promise<string[]> {
  if (!(await robotsAllowed(url))) return [];
  const res = await request(url, { timeoutMs: 15_000, retries: 0 }).catch(() => null);
  if (!res || res.status >= 400) return [];
  const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  if (!/<sitemapindex/i.test(res.text) || depth === 0) return locs;
  const children = locs.sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a))).slice(0, 3);
  return (await Promise.all(children.map((child) => sitemapUrls(child, depth - 1)))).flat();
}

async function searchSitemap(base: string): Promise<string | null> {
  const urls = await sitemapUrls(`${new URL(base).origin}/sitemap.xml`, 1);
  return (
    urls
      .filter((url) => sameSite(url, base) && looksLikeCareersUrl(url) && !NOISE_PATH.test(url))
      .sort((a, b) => a.length - b.length)[0] ?? null
  );
}

export async function discoverCareers(company: Company, options: StageOptions): Promise<CareersResult> {
  const website = company.website;
  if (!website) return result({ status: "not_found", error: "no website on Joberty" });

  // 1. The website is itself an ATS board or careers page.
  const websiteAts = pickAts([website]);
  if (websiteAts) {
    return result({ status: "found", careersUrl: website, via: "website", ats: websiteAts.ats, atsSlug: websiteAts.slug, confidence: 1 });
  }
  if (looksLikeCareersUrl(website)) {
    return result({ status: "found", careersUrl: website, via: "website", confidence: 0.9 });
  }

  // 2. A public ATS board under the company's name. Final only if it lists relevant jobs;
  //    otherwise it is the fallback when the website leads nowhere better.
  const guess = await guessAts(company);
  const guessed = guess
    ? result({
        status: "found",
        careersUrl: getAdapter(guess.ats)?.boardUrl(guess.slug) ?? null,
        via: "slug_guess",
        ats: guess.ats,
        atsSlug: guess.slug,
        confidence: guess.relevantJobs > 0 ? guess.confidence : guess.confidence / 2,
      })
    : null;
  if (guess && guessed && guess.relevantJobs > 0) return guessed;

  // 3. A careers link on the homepage: static HTML first, then rendered.
  let homepage = await fetchHtml(website);
  if (homepage.status === 0 && !homepage.blocked) {
    // Certificates and DNS often cover only one of example.com / www.example.com.
    const alternate = await fetchHtml(toggleWww(website));
    if (alternate.status !== 0) homepage = alternate;
  }
  // DNS failure, refused connection, timeout: nothing else on this host will answer either.
  // Certificate errors are different: Node lacks intermediate certificates that browsers fetch themselves.
  const tlsError = /CERT|SIGNATURE|SSL|TLS|self.signed/i.test(homepage.error ?? "");
  if (homepage.status === 0 && !homepage.blocked && !tlsError) {
    return guessed ?? result({ status: "not_found", error: `website unreachable: ${homepage.error}` });
  }
  if (homepage.usable) {
    const found = fromHomepage(homepage.html, homepage.url, [homepage.url], "static");
    if (found) return found;
  }
  if (options.browser && !homepage.blocked) {
    const rendered = await renderPage(homepage.status === 0 ? website : homepage.url).catch(() => null);
    if (rendered) {
      const found = fromHomepage(rendered.html, rendered.url, rendered.requests, "browser");
      if (found) return found;
    }
  }

  // 4. Usual paths, then the sitemap.
  const base = homepage.usable ? homepage.url : website;
  const byPath = homepage.blocked ? null : await probePaths(base);
  if (byPath) return result({ status: "found", careersUrl: byPath, via: "path", confidence: 0.6 });
  const bySitemap = homepage.blocked ? null : await searchSitemap(base);
  if (bySitemap) return result({ status: "found", careersUrl: bySitemap, via: "sitemap", confidence: 0.6 });

  return (
    guessed ??
    result({
      status: homepage.blocked ? "error" : "not_found",
      error: homepage.error ?? "no careers link on the homepage, usual paths or sitemap",
    })
  );
}

function summary(found: CareersResult): string {
  const ats = found.ats ? ` [${found.ats}:${found.atsSlug}]` : "";
  return `${found.status}${found.via ? ` via ${found.via}` : ""}${ats} ${found.careersUrl ?? found.error ?? ""}`;
}

export async function runCareers(options: StageOptions): Promise<void> {
  const companies = await readData("companies.json", companiesFileSchema, []);
  if (!companies.length) throw new Error("companies.json is empty; run `npm run scrape -- companies` first");
  const careers = await readData("careers.json", careersFileSchema, {});
  const targets = selectCompanies(companies, options, (company) => {
    const previous = careers[company.jobertyId];
    return Boolean(previous) && Date.now() - Date.parse(previous.checkedAt) < RECHECK_AFTER_MS;
  });
  console.log(`[careers] ${targets.length} companies to check`);

  const save = createSaver(() => writeData("careers.json", careers, careersFileSchema));
  let done = 0;
  await forEachLimit(
    targets,
    options.concurrency,
    async (company) => {
      let found: CareersResult;
      try {
        found = await discoverCareers(company, options);
      } catch (error) {
        found = result({ status: "error", error: describeError(error) });
      }
      careers[company.jobertyId] = found;
      logProgress("careers", ++done, targets.length, company.name, summary(found));
      if (done % 20 === 0) await save();
    },
    options.signal,
  );
  await save();
}
