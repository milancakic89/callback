import { htmlToText } from "../extract/description";
import { cleanText, shortHash } from "../text";
import type { BoardAdapter, BoardName } from "./board";
import { fetchFeed, locationFromText, rssDate } from "./rss";

// RSS feeds whose titles read "Role at Company" and whose only location is a sentence in the
// description ("100% remote with no geographical restrictions", "Location: Remote (US-based)").
function atCompanyFeed(name: BoardName, url: string): BoardAdapter {
  return {
    name,
    async fetchJobs() {
      return (await fetchFeed(url)).flatMap((item) => {
        const split = item.title.lastIndexOf(" at ");
        if (!item.link || split < 0) return [];
        const description = htmlToText(item.description);
        return [
          {
            externalId: shortHash(item.guid ?? item.link),
            title: cleanText(item.title.slice(0, split)),
            companyName: cleanText(item.title.slice(split + 4)),
            url: item.link,
            location: locationFromText(description),
            remote: true,
            department: null,
            postedAt: rssDate(item.pubDate),
            description,
          },
        ];
      });
    },
  };
}

export const remotefirstjobs = atCompanyFeed("remotefirstjobs", "https://remotefirstjobs.com/rss/jobs.rss");
export const cryptocurrencyjobs = atCompanyFeed("cryptocurrencyjobs", "https://cryptocurrencyjobs.co/index.xml");
export const nodesk = atCompanyFeed("nodesk", "https://nodesk.co/remote-jobs/index.xml");
