import type { BoardLocation } from "../normalize";

// In dedupe priority order: when two boards list the same job, the earlier one keeps it.
export const BOARD_NAMES = ["himalayas", "jobicy", "remoteok", "remotive", "arbeitnow"] as const;
export type BoardName = (typeof BOARD_NAMES)[number];

export type BoardJobStatus = "active" | "closed" | "unknown";

// A posting as a job board returns it, before location filtering.
export type BoardJob = Omit<BoardLocation, "title"> & {
  externalId: string;
  title: string;
  companyName: string;
  // The board's own page for the posting: every board's terms require linking there.
  url: string | null;
  department: string | null;
  postedAt: string | null;
  // Plain text, HTML stripped.
  description: string | null;
};

export type BoardAdapter = {
  name: BoardName;
  // The whole feed, every page. Throws when any page can't be read, so a partial feed never
  // looks like closed jobs.
  fetchJobs(): Promise<BoardJob[]>;
  // Only for boards whose feed is a short window (Jobicy: 7 days), to tell a job that aged out of
  // the feed from one that closed.
  checkStatus?(externalIds: string[]): Promise<Map<string, BoardJobStatus>>;
};
