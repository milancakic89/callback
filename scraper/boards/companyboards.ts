import { joinLocations } from "../ats/adapter";
import { getAdapter } from "../ats/registry";
import { mentionsRemote } from "../normalize";
import { forEachLimit } from "../pool";
import { readData } from "../store";
import { describeError } from "../text";
import { companyBoardsFileSchema } from "../types";
import type { BoardAdapter, BoardJob } from "./board";

const CONCURRENCY = 8;

// Every job on the ATS boards `discover` found for companies seen on the job boards
// (company-boards.json). Each list is complete, so a job gone from it is closed; a board that
// can't be read keeps its rows as they were (failedPrefixes).
export const companyboards: BoardAdapter = {
  name: "companyboards",

  async fetchJobs() {
    const boards = Object.values(await readData("company-boards.json", companyBoardsFileSchema, {})).filter(
      (board) => board.ats && board.slug,
    );
    const jobs: BoardJob[] = [];
    const failedPrefixes: string[] = [];
    await forEachLimit(boards, CONCURRENCY, async (board) => {
      const adapter = getAdapter(board.ats!);
      const prefix = `${board.ats}:${board.slug}:`;
      if (!adapter) {
        failedPrefixes.push(prefix);
        return;
      }
      try {
        for (const job of await adapter.fetchJobs(board.slug!)) {
          const location = joinLocations([job.location, job.countryCode === "rs" ? "Serbia" : null]);
          jobs.push({
            externalId: `${prefix}${job.externalId}`,
            title: job.title,
            companyName: board.name,
            url: job.url,
            location,
            remote: job.remote ?? mentionsRemote(`${location ?? ""} ${job.title}`),
            department: job.department,
            postedAt: job.postedAt,
            description: job.description,
          });
        }
      } catch (error) {
        console.log(`[boards companyboards] ${prefix} failed: ${describeError(error)}`);
        failedPrefixes.push(prefix);
      }
    });
    // Mostly failing is a network problem, not closed jobs.
    if (boards.length && failedPrefixes.length > boards.length / 2) {
      throw new Error(`${failedPrefixes.length} of ${boards.length} company boards failed`);
    }
    return { jobs, failedPrefixes };
  },
};
