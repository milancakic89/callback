import { z } from "zod";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { isSerbianPlace } from "../normalize";
import { cleanText } from "../text";
import type { RawJob } from "../types";
import { expectOk, type AtsAdapter } from "./adapter";

// From a job's own url: "https://{tenant}.{wdN}.myworkdayjobs.com/{site}/job/...".
const JOB_URL = /^https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/([a-z0-9_-]+)(\/job\/.*)$/i;

const jobDetailSchema = z.object({
  jobPostingInfo: z.object({ jobDescription: z.string().nullish() }).nullish(),
});

const PAGE_SIZE = 20;
const MAX_PAGES = 25;

const listSchema = z.object({
  total: z.number().nullish(),
  jobPostings: z
    .array(
      z.object({
        title: z.string(),
        externalPath: z.string().nullish(),
        locationsText: z.string().nullish(),
        bulletFields: z.array(z.string()).nullish(),
      }),
    )
    .nullish(),
  facets: z.unknown(),
});

type Board = { tenant: string; site: string; host: string };
type FacetValue = { param: string; id: string; descriptor: string };

// slug is "tenant|wdN|site", e.g. "zuehlke|wd3|zuhlke-careers".
function parseSlug(slug: string): Board {
  const [tenant, wd, site] = slug.split("|");
  if (!tenant || !wd || !site) throw new Error(`workday: bad slug "${slug}"`);
  return { tenant, site, host: `https://${tenant}.${wd}.myworkdayjobs.com` };
}

async function search(board: Board, body: Record<string, unknown>) {
  const res = await getJson(`${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`, {
    method: "POST",
    json: body,
  });
  expectOk(res.status, `workday ${board.tenant}/${board.site}`);
  return listSchema.parse(res.data);
}

// Facets nest: { facetParameter, values: [{ descriptor, id } | { facetParameter, values }] }.
function collectFacetValues(node: unknown, param: string | null, out: FacetValue[]): FacetValue[] {
  if (Array.isArray(node)) {
    for (const child of node) collectFacetValues(child, param, out);
  } else if (node && typeof node === "object") {
    const facet = node as Record<string, unknown>;
    const ownParam = typeof facet.facetParameter === "string" ? facet.facetParameter : param;
    if (Array.isArray(facet.values)) {
      collectFacetValues(facet.values, ownParam, out);
    } else if (ownParam && typeof facet.id === "string" && typeof facet.descriptor === "string") {
      out.push({ param: ownParam, id: facet.id, descriptor: facet.descriptor });
    }
  }
  return out;
}

export const workday: AtsAdapter = {
  name: "workday",
  boardUrl: (slug) => {
    const board = parseSlug(slug);
    return `${board.host}/${board.site}`;
  },

  // Filters by the board's own Serbia/Belgrade facet instead of clicking its location dropdown.
  async fetchJobs(slug) {
    const board = parseSlug(slug);
    const first = await search(board, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" });
    const values = collectFacetValues(first.facets, null, []);
    const serbian = values.filter((value) => isSerbianPlace(value.descriptor));

    let appliedFacets: Record<string, string[]> = {};
    let searchText = "";
    if (serbian.length) {
      const param = serbian.find((v) => /country/i.test(v.param))?.param ?? serbian[0].param;
      appliedFacets = { [param]: serbian.filter((v) => v.param === param).map((v) => v.id) };
    } else if (values.some((value) => /locat|country|city|region/i.test(value.param))) {
      return [];
    } else {
      searchText = "Serbia";
    }

    const jobs: RawJob[] = [];
    let total = Infinity;
    for (let page = 0; page < MAX_PAGES && page * PAGE_SIZE < total; page++) {
      const result = await search(board, {
        appliedFacets,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        searchText,
      });
      // Later pages may report total 0, so keep the first one.
      if (page === 0) total = result.total ?? 0;
      const postings = result.jobPostings ?? [];
      for (const posting of postings) {
        jobs.push({
          externalId: posting.bulletFields?.[0] ?? posting.externalPath ?? cleanText(posting.title),
          title: cleanText(posting.title),
          url: posting.externalPath ? `${board.host}/${board.site}${posting.externalPath}` : null,
          location: posting.locationsText ?? null,
          countryCode: serbian.length ? "rs" : null,
          remote: null,
          department: null,
          postedAt: null,
          description: null,
        });
      }
      if (!postings.length) break;
    }
    return jobs;
  },

  async fetchDescription(job) {
    const match = job.url ? JOB_URL.exec(job.url) : null;
    if (!match) return null;
    const [, tenant, wd, site, externalPath] = match;
    const res = await getJson(
      `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${externalPath}`,
    );
    if (res.status !== 200) return null;
    const detail = jobDetailSchema.safeParse(res.data);
    return detail.success ? htmlToText(detail.data.jobPostingInfo?.jobDescription) : null;
  },
};
