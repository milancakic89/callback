import { EXTERNAL_SOURCE_LABELS, EXTERNAL_SOURCES } from "@/lib/external-jobs/sources";

// What the Callback browser extension reads and sends (features/chrome-extension.md, features/legal-pages.md),
// as the part of "What we collect" that a candidate who installs it reads. Each statement is one the
// extension makes true: it has no permission, no background worker and no storage, its one script runs on
// the three sites' pages, and its button is a plain link (extension/manifest.json, extension/src/button.ts).
const SITES = EXTERNAL_SOURCES.map((source) => EXTERNAL_SOURCE_LABELS[source]);

export function ExtensionData() {
  return (
    <>
      <p>
        <strong>If you use the Callback browser extension</strong>
      </p>
      <ul>
        <li>
          On a job&rsquo;s page on {SITES[0]}, {SITES[1]} or {SITES[2]}, the extension reads the job&rsquo;s address, title,
          company and location from the page you have open. It reads nothing else, and nothing on any other site.
        </li>
        <li>
          It sends that only when you click <strong>Add to Callback</strong>: the button is a link, and the details travel
          in the address of a page on Callback that opens in a new tab. It sends nothing in the background, and the site you
          are on isn&rsquo;t told.
        </li>
        <li>
          Opening that page saves nothing. The job is added to your applications only when you press Save, after you have
          checked it. You can remove a job you added this way from your list at any time, which deletes it.
        </li>
        <li>
          The extension asks the browser for no permission beyond running on those pages. It stores nothing in your
          browser, sets no cookies, has no tracking and sends nothing to anyone else.
        </li>
      </ul>
    </>
  );
}
