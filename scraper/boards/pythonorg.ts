import { htmlToText } from "../extract/description";
import { cleanText } from "../text";
import type { BoardAdapter } from "./board";
import { fetchFeed } from "./rss";

// The Python Software Foundation's job board. Titles read "Role, Company"; the description
// starts with the location as bare text before the first tag ("Remote, Worldwide <p>…").
const FEED = "https://www.python.org/jobs/feed/rss/";

export const pythonorg: BoardAdapter = {
  name: "pythonorg",

  async fetchJobs() {
    return (await fetchFeed(FEED)).flatMap((item) => {
      const split = item.title.lastIndexOf(", ");
      if (!item.link || split < 0) return [];
      const location = cleanText(item.description?.split("<")[0]) || null;
      const title = cleanText(item.title.slice(0, split));
      return [
        {
          externalId: /\/jobs\/(\d+)/.exec(item.link)?.[1] ?? item.link,
          title,
          companyName: cleanText(item.title.slice(split + 2)),
          url: item.link,
          location,
          remote: /\bremote\b/i.test(`${title} ${location ?? ""}`),
          department: null,
          // The feed has no dates.
          postedAt: null,
          description: htmlToText(item.description),
        },
      ];
    });
  },
};
