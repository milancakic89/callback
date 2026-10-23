import { htmlToText } from "../extract/description";
import { cleanText, shortHash } from "../text";
import type { BoardAdapter, BoardJob } from "./board";
import { fetchFeed, rssDate } from "./rss";

// Each feed holds only the newest postings, so the main feed plus every category together
// reach further back than any one of them.
const FEEDS = [
  "remote-jobs",
  "categories/remote-full-stack-programming-jobs",
  "categories/remote-back-end-programming-jobs",
  "categories/remote-front-end-programming-jobs",
  "categories/remote-programming-jobs",
  "categories/remote-devops-sysadmin-jobs",
  "categories/remote-design-jobs",
  "categories/remote-product-jobs",
  "categories/remote-management-and-finance-jobs",
  "categories/remote-customer-support-jobs",
  "categories/remote-sales-and-marketing-jobs",
  "categories/all-other-remote-jobs",
];

export const weworkremotely: BoardAdapter = {
  name: "weworkremotely",

  async fetchJobs() {
    const jobs = new Map<string, BoardJob>();
    for (const feed of FEEDS) {
      for (const item of await fetchFeed(`https://weworkremotely.com/${feed}.rss`)) {
        if (!item.link) continue;
        // "Committee for Children: Senior Product Manager"
        const split = item.title.indexOf(": ");
        if (split < 0) continue;
        // "Anywhere in the World", "USA Only", "Europe Only"; the country tag is often just HQ.
        const region = item.get("region");
        const country = item.get("country")?.replace(/^\p{Regional_Indicator}{2}\s*/u, "") ?? null;
        jobs.set(item.link, {
          externalId: /\/remote-jobs\/([^/?#]+)/.exec(item.link)?.[1] ?? shortHash(item.link),
          title: cleanText(item.title.slice(split + 2)),
          companyName: cleanText(item.title.slice(0, split)),
          url: item.link,
          location: region ?? country,
          remote: true,
          department: item.get("category"),
          postedAt: rssDate(item.pubDate),
          description: htmlToText(item.description),
        });
      }
    }
    return [...jobs.values()];
  },
};
