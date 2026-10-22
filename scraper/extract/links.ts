import * as cheerio from "cheerio";
import { pickAts } from "../ats/detect";
import { absoluteUrl, cleanText, plain, sameSite } from "../text";

export type Link = { url: string; text: string };
export type ScoredLink = Link & { score: number };

export function extractLinks(html: string, baseUrl: string): Link[] {
  const $ = cheerio.load(html);
  const links: Link[] = [];
  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const url = absoluteUrl(anchor.attr("href"), baseUrl);
    if (!url) return;
    const text = cleanText(anchor.text()) || cleanText(anchor.attr("aria-label") ?? anchor.attr("title"));
    links.push({ url, text: text.slice(0, 160) });
  });
  return links;
}

// Path patterns run on plain(), decoded pathname + search.
const CAREERS_PATH =
  /(career|karijer|(^|[/_.-])(jobs?|openings|vacancies|positions|otvorene-pozicije|posao|poslovi|zaposlenje|join-?us|work-with-us|hiring)([/_.-]|$))/;

const TEXT_RULES: [RegExp, number][] = [
  [/\b(careers?|karijer[aei]?)\b/, 6],
  [/\b(jobs?|open (positions|roles)|openings|vacanc(y|ies)|otvorene pozicije|oglasi za posao|konkursi?)\b/, 5],
  [/\b(join (us|our team|the team)|work with us|we('| a)?re hiring|hiring|pridruzi se|zaposlenje|zaposli se|posao|poslovi)\b/, 4],
];

const PATH_RULES: [RegExp, number][] = [
  [/(career|karijer)/, 5],
  [/(^|[/_.-])(jobs?|openings|vacancies|positions|otvorene-pozicije|posao|poslovi|zaposlenje)([/_.-]|$)/, 4],
  [/(join-?us|work-with-us|hiring|pridruzi)/, 3],
];

const NEGATIVE_RULES: [RegExp, number][] = [
  [/\.(pdf|docx?|jpe?g|png|svg|webp|zip)($|\?)/, -20],
  [/(wp-content|\/blog\/|\/news\/|\/vesti\/|\/tag\/|\/category\/|\/author\/|\/press\/|\/events?\/)/, -6],
  // Banks list "devizni poslovi", "kreditni poslovi"... as products, not jobs.
  [/(devizn|kredit|racun|platn|stednj|stambeni|kartic|lizing|osiguranj)/, -8],
  // Social networks and job boards: other sources, out of scope here.
  [/(linkedin|facebook|instagram|twitter|x\.com|youtube|tiktok|glassdoor|joberty|helloworld\.rs|infostud)/, -20],
];

function pathOf(url: URL): string {
  try {
    return plain(decodeURIComponent(url.pathname + url.search));
  } catch {
    return plain(url.pathname + url.search);
  }
}

export function scoreCareersLink(link: Link, pageUrl: string): number {
  const url = new URL(link.url);
  const text = plain(link.text);
  const path = pathOf(url);
  const full = `${url.hostname}${path}`;
  let score = 0;
  score += TEXT_RULES.find(([re]) => re.test(text))?.[1] ?? 0;
  score += PATH_RULES.find(([re]) => re.test(path))?.[1] ?? 0;
  if (score === 0) return 0;
  if (/^(careers?|jobs|karijer[ae]?|posao)\./.test(url.hostname)) score += 4;
  if (pickAts([link.url])) score += 8;
  else if (!sameSite(link.url, pageUrl) && !/^(careers?|jobs)\./.test(url.hostname)) score -= 3;
  if (text.length > 60) score -= 3;
  for (const [re, points] of NEGATIVE_RULES) if (re.test(full)) score += points;
  return score;
}

function canonical(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

export type CareersPick = { best: ScoredLink | null; candidates: ScoredLink[]; ambiguous: boolean };

const MIN_SCORE = 5;

export function pickCareersLink(html: string, pageUrl: string): CareersPick {
  const byUrl = new Map<string, ScoredLink>();
  for (const link of extractLinks(html, pageUrl)) {
    if (canonical(link.url) === canonical(pageUrl)) continue;
    const score = scoreCareersLink(link, pageUrl);
    if (score <= 0) continue;
    const key = canonical(link.url);
    const previous = byUrl.get(key);
    if (!previous || score > previous.score) byUrl.set(key, { ...link, score });
  }
  const candidates = [...byUrl.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  const [best, second] = candidates;
  if (!best || best.score < MIN_SCORE) return { best: null, candidates, ambiguous: false };
  // Two different pages scoring about the same, neither nested in the other.
  const ambiguous = Boolean(
    second &&
      best.score < 10 &&
      second.score >= best.score - 1 &&
      !canonical(second.url).startsWith(canonical(best.url)) &&
      !canonical(best.url).startsWith(canonical(second.url)),
  );
  return { best, candidates, ambiguous };
}

export function looksLikeCareersUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /^(careers?|jobs|karijer[ae]?)\./.test(parsed.hostname) || CAREERS_PATH.test(pathOf(parsed));
  } catch {
    return false;
  }
}

const OPENINGS_TEXT =
  /\b(open (positions|roles|jobs|vacancies)|current (openings|vacancies|positions|jobs)|job openings|(all|our) (jobs|positions|openings|vacancies|roles)|(see|view|browse|explore|search|find) (all |our |open )?(jobs|openings|positions|roles|opportunities|vacancies)|otvorene pozicije|otvoreni konkursi|svi oglasi|aktuelni oglasi|pogledaj (oglase|pozicije)|trenutno otvorene|we('| a)?re hiring)\b/;

const OPENINGS_PATH =
  /(open-positions|openings|vacancies|all-jobs|job-openings|otvorene-pozicije|oglasi|(^|\/)jobs\/?($|\?))/;
// A link that already filters the list to Serbia: "jobs?location=Serbia&regionCode=RS".
const SERBIA_FILTER = /[?&][^=&]*(country|location|region|lokacija)[^=&]*=(rs|srb|serbia|srbija|belgrade|beograd)\b/i;

// The "See open positions" link on a careers landing page: an ATS link wins.
export function findOpeningsLink(html: string, pageUrl: string): string | null {
  const links = extractLinks(html, pageUrl).filter(
    (link) => canonical(link.url) !== canonical(pageUrl) && new URL(link.url).pathname !== "/",
  );
  const ats = links.find((link) => pickAts([link.url]));
  if (ats) return ats.url;
  const best = links
    .map((link) => {
      const textMatch = OPENINGS_TEXT.test(plain(link.text));
      // Another domain (a parent company's job site) only behind an explicit "open roles" link.
      if (!sameSite(link.url, pageUrl) && !textMatch) return null;
      const score =
        (textMatch ? 5 : 0) +
        (OPENINGS_PATH.test(pathOf(new URL(link.url))) ? 4 : 0) +
        (SERBIA_FILTER.test(link.url) ? 6 : 0);
      return score > 0 ? { url: link.url, score } : null;
    })
    .filter((link) => link !== null)
    .sort((a, b) => b.score - a.score)[0];
  return best?.url ?? null;
}
