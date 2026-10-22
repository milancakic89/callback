import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { pickAts } from "../ats/detect";
import { isSerbianPlace } from "../normalize";
import { absoluteUrl, cleanText, plain, sameSite, shortHash } from "../text";
import type { RawJob } from "../types";
import { looksLikeJobTitle } from "./titles";

// A job-ish path segment followed by the posting's own slug or id.
const JOB_PATH =
  /\/(jobs?|positions?|openings?|vacanc(y|ies)|oglas[ia]?|pozicij[ae]?|careers?|karijer[ae]?|posao|poslovi|job-offers?|opportunit(y|ies)|roles?|konkurs[ia]?)\/[^?#]{3,}/i;
const JOB_QUERY = /[?&](gh_jid|job_?id|jobid|job|position|vacancy|oglas)=/i;
const GENERIC_SEGMENT =
  /^(early-careers?|experienced(-professionals?)?|students?|graduates?|internships?|benefits|culture|life-at.*|our-people|people|teams?|locations?|faq|how-we-hire|hiring-process|process|values|search|all|open-positions|openings|jobs|careers?|apply|login|register|privacy.*|about.*|why-.*|perks|events?|blog|news|stories|story|en|sr|de)$/i;

const LOCATION_LABEL = /^(location|lokacija|grad|city)\s*:\s*/i;
const CITY_COUNTRY = /^[\p{Lu}][\p{L} .'-]{1,30},\s*[\p{Lu}][\p{L} .'-]{1,30}$/u;
const REMOTE_WORD = /\b(remote|hybrid|anywhere|rad od kuce|rad na daljinu)\b/;

// Text of each text node, in document order: keeps "Title" and "Belgrade" apart.
export function textSegments(html: string): string[] {
  const marked = html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "\u0001");
  return cheerio
    .load(marked, null, false)
    .text()
    .split("\u0001")
    .map(cleanText)
    .filter(Boolean);
}

function locationFrom(segments: string[], title: string): string | null {
  const found = segments.filter(
    (segment) =>
      segment !== title &&
      segment.length <= 80 &&
      (LOCATION_LABEL.test(segment) ||
        isSerbianPlace(segment) ||
        REMOTE_WORD.test(plain(segment)) ||
        CITY_COUNTRY.test(segment)),
  );
  const unique = [...new Set(found.map((segment) => segment.replace(LOCATION_LABEL, "")))];
  return unique.length ? unique.slice(0, 3).join(" / ") : null;
}

// Climbs from the link while the surrounding block still looks like one job card.
function cardOf($: cheerio.CheerioAPI, element: AnyNode): AnyNode {
  let card = element;
  for (let depth = 0; depth < 4 && card.parent; depth++) {
    if (cleanText($(card.parent).text()).length > 400) break;
    card = card.parent;
  }
  return card;
}

export function extractDomJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer").remove();
  const page = pageUrl.replace(/\/+$/, "");
  const jobs = new Map<string, RawJob>();

  $("a[href]").each((_, element) => {
    const url = absoluteUrl($(element).attr("href"), pageUrl);
    if (!url) return;
    const key = url.replace(/\/+$/, "");
    if (key === page || jobs.has(key)) return;
    const parsed = new URL(url);
    const isAts = pickAts([url]) !== null;
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!(JOB_PATH.test(parsed.pathname) || JOB_QUERY.test(parsed.search) || isAts)) return;
    if (GENERIC_SEGMENT.test(lastSegment) || (!isAts && !sameSite(url, pageUrl))) return;

    const anchor = $(element);
    const card = cardOf($, element);
    const anchorSegments = textSegments($.html(element));
    const cardSegments = textSegments($.html(card));
    const title =
      [
        cleanText(anchor.find("h1, h2, h3, h4, h5, h6, [class*=title]").first().text()),
        anchorSegments[0],
        cleanText(anchor.text()),
      ].find(looksLikeJobTitle) ??
      [cleanText($(card).find("h2, h3, h4, h5, [class*=title]").first().text()), cardSegments[0]].find(
        looksLikeJobTitle,
      );
    if (!title) return;

    jobs.set(key, {
      externalId: shortHash(key),
      title,
      url,
      location: locationFrom(cardSegments, title),
      countryCode: null,
      remote: null,
      department: null,
      postedAt: null,
      // A card snippet isn't the full posting; the descriptions stage visits the job's own url.
      description: null,
    });
  });
  return [...jobs.values()];
}
