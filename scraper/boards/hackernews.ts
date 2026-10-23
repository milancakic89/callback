import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter, BoardJob } from "./board";

// The monthly "Ask HN: Who is hiring?" thread, through the HN Algolia API. Each top-level comment
// is one company; by convention its first line reads "Company | Role | Location | REMOTE | …".
const SEARCH = "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10";

const searchSchema = z.object({ hits: z.array(z.object({ objectID: z.string(), title: z.string() })) });
const threadSchema = z.object({
  children: z.array(
    z.object({ id: z.number(), text: z.string().nullish(), created_at: z.string().nullish() }),
  ),
});

const ROLE = /\b(engineer|developer|programmer|designer|scientist|researcher|manager|lead|architect|analyst|devops|sre|swe|founding|intern|head of|director|specialist|consultant|administrator|recruiter|writer|marketer|sales|support|product|qa|tester|cto|vp)\b/i;
const PLACE = /\b(remote|onsite|on-site|hybrid|in-office|anywhere|worldwide|global|europe|emea|cet|utc|gmt|timezone|time zone|[A-Z][a-z]+,\s*[A-Z]{2}\b|usa?|uk|canada|germany|london|new york|san francisco|nyc|sf|berlin|amsterdam|paris|toronto)\b/i;

const EMPLOYMENT = /^(full[- ]?time|part[- ]?time|contract(or)?|freelance|intern(ship)?|permanent|ft|pt)\b/i;

// "Snout https://snout.com/" → "Snout"; "Mainmatter (https://mainmatter.com)" and
// "Thunder Compute (YC S24)" → the name alone.
function companyOf(part: string): string {
  return cleanText(part.replace(/\([^)]*\)/g, "").replace(/https?:\/\/\S+/g, "").replace(/[\s(,:;-]+$/, ""));
}

function parse(firstLine: string): { company: string; title: string; location: string | null; remote: boolean } | null {
  // Pipes by convention; some use em dashes or " - " instead.
  let parts = firstLine.split("|").map(cleanText).filter(Boolean);
  if (parts.length < 2) parts = firstLine.split(/\s+[—–-]\s+/).map(cleanText).filter(Boolean);
  if (parts.length < 2) return null;
  const company = companyOf(parts[0]);
  // "PrairieLearn (Remote US)": a location in the company part's parentheses counts too.
  const companyNote = /\(([^)]*)\)/.exec(parts[0])?.[1] ?? "";
  const rest = parts.slice(1);
  const places = [...(PLACE.test(companyNote) ? [companyNote] : []), ...rest.filter((part) => PLACE.test(part) && !ROLE.test(part))];
  // Not a URL, an employment type or a salary ("Full-time", "$170k–230k").
  const plausible = (part: string) =>
    !/^https?:|^www\./i.test(part) && !EMPLOYMENT.test(part) && !/[$€£]\s?\d|\d+k\b/i.test(part) && !PLACE.test(part);
  const title = rest.find((part) => ROLE.test(part) && plausible(part)) ?? rest.find(plausible) ?? "Open roles";
  const remote = places.some((place) => /remote|anywhere|worldwide/i.test(place)) && !places.every((p) => /onsite|on-site|in-office/i.test(p));
  if (!company || company.length > 60) return null;
  return { company, title: title.slice(0, 200), location: places.length ? places.join(" / ") : null, remote };
}

export const hackernews: BoardAdapter = {
  name: "hackernews",

  async fetchJobs() {
    const search = await getJson(SEARCH, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
    expectOk(search.status, "hackernews search");
    const story = searchSchema.parse(search.data).hits.find((hit) => /who is hiring/i.test(hit.title));
    if (!story) throw new Error("hackernews: no recent 'Who is hiring' thread");
    const thread = await getJson(`https://hn.algolia.com/api/v1/items/${story.objectID}`, {
      intervalMs: SITE_INTERVAL_MS,
      retries: 2,
      timeoutMs: 60_000,
    });
    expectOk(thread.status, "hackernews thread");

    const jobs: BoardJob[] = [];
    for (const comment of threadSchema.parse(thread.data).children) {
      if (!comment.text) continue;
      const firstLine = htmlToText(comment.text.split(/<p>/i)[0]) ?? "";
      const posting = parse(firstLine);
      // Only remote postings: an on-site one names a city we'd have to be in.
      if (!posting?.remote) continue;
      jobs.push({
        externalId: String(comment.id),
        title: posting.title,
        companyName: posting.company,
        url: `https://news.ycombinator.com/item?id=${comment.id}`,
        location: posting.location,
        remote: true,
        department: null,
        postedAt: comment.created_at ?? null,
        description: htmlToText(comment.text),
      });
    }
    return jobs;
  },
};
