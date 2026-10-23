import { htmlToText } from "../extract/description";
import { cleanText, shortHash } from "../text";
import type { BoardAdapter, BoardJob } from "./board";
import { fetchFeed, rssDate } from "./rss";

// A WordPress job board: 20 postings per feed page, newest first.
const FEED = "https://jobspresso.co/feed/?post_type=job_listing";
const MAX_PAGES = 5;

export const jobspresso: BoardAdapter = {
  name: "jobspresso",

  async fetchJobs() {
    const jobs = new Map<string, BoardJob>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      let items;
      try {
        items = await fetchFeed(page === 1 ? FEED : `${FEED}&paged=${page}`);
      } catch (error) {
        // WordPress answers 404 past the last page.
        if (page > 1 && /HTTP 404/.test(String(error))) break;
        throw error;
      }
      for (const item of items) {
        if (!item.link) continue;
        // "Tailscale ⚲ Canada"
        const [company, location] = (item.get("dc:creator") ?? "").split("⚲").map((part) => cleanText(part));
        if (!company) continue;
        jobs.set(item.link, {
          externalId: shortHash(item.guid ?? item.link),
          title: item.title,
          companyName: company,
          url: item.link,
          location: location || null,
          remote: true,
          department: null,
          postedAt: rssDate(item.pubDate),
          description: htmlToText(item.get("content:encoded") ?? item.description),
        });
      }
      if (!items.length) break;
    }
    return [...jobs.values()];
  },
};
