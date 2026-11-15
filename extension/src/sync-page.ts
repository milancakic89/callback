import type { ButtonController } from "./button";
import type { SiteAdapter } from "./sites/types";

// One look at the page: the job it is about, if it is a job's page and the site has shown it, and the
// button put in agreement with it. The three things it needs are passed in, so the content script wires
// the real page and a test wires a fixture.
export function syncPage({
  adapter,
  controller,
  document: doc,
  url,
}: {
  adapter: SiteAdapter;
  controller: ButtonController;
  document: Document;
  url: URL;
}): void {
  if (!adapter.isJobPage(url)) {
    controller.sync(null, null);
    return;
  }
  const job = adapter.readJob(doc, url);
  controller.sync(job, job ? adapter.findApplyControl(doc) : null);
}
