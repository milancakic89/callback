import * as cheerio from "cheerio";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { request, SITE_INTERVAL_MS } from "../http";
import { cleanText } from "../text";

export type FeedItem = {
  title: string;
  link: string | null;
  guid: string | null;
  pubDate: string | null;
  // HTML, as the feed carries it (CDATA or entity-escaped).
  description: string | null;
  // Any other tag of the item, as text: "region", "dc:creator".
  get(tag: string): string | null;
};

// RSS 2.0 items. Throws on HTTP errors, so a broken feed counts as a failed board.
export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await request(url, {
    headers: { accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8" },
    intervalMs: SITE_INTERVAL_MS,
    retries: 2,
  });
  expectOk(res.status, url);
  const $ = cheerio.load(res.text, { xml: true });
  return $("item")
    .toArray()
    .map((element) => {
      const item = $(element);
      // Text tags can still hold HTML or entities XML doesn't know ("&nbsp;", "<br>", a
      // double-escaped "&amp;amp;"), so decode them once more.
      const get = (tag: string) => {
        const raw = item.children(tag.replace(":", "\\:")).first().text();
        return raw.trim() ? cleanText(htmlToText(raw) ?? raw) || null : null;
      };
      return {
        title: get("title") ?? "",
        link: get("link"),
        guid: get("guid"),
        pubDate: get("pubDate"),
        description: item.children("description").first().text() || null,
        get,
      };
    });
}

// "Thu, 23 Oct 2026 12:00:00 +0000" → ISO; null when it doesn't parse.
export function rssDate(value: string | null): string | null {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// Where a free-text posting says candidates may live, for feeds with no location field.
// Phrases only, no guessing: null when the text names nothing, and placeBoardJob then drops it
// rather than treating silence as worldwide.
export function locationFromText(text: string | null): string | null {
  if (!text) return null;
  const plainText = text.replace(/\s+/g, " ");
  if (/no geographical restrictions|(?:from )?anywhere in the world|work (?:remotely )?from anywhere|\bremote,? (?:worldwide|global)\b/i.test(plainText)) {
    return "Worldwide";
  }
  // "remotely anywhere in Canada", "remote opportunity for those based in the UK"
  const anywhere = /\bremote(?:ly)? (?:anywhere )?(?:in|within|from) (?:the )?([A-Z][\w ,.&-]{1,60}?)(?:[.;)]| or on-site| and |$)/.exec(plainText);
  if (anywhere) return anywhere[1].trim();
  const based = /\bbased in (?:the )?([A-Z][\w ,.&-]{1,40}?)(?:[.;)]| or |$)/.exec(plainText);
  if (based) return based[1].trim();
  // "Location: Remote (U.S.-based)": the rest of the line, dots included.
  const labelled = /\bLocation:\s*([^\n]{2,80})/i.exec(text);
  return labelled ? cleanText(labelled[1]).replace(/\.$/, "") : null;
}
