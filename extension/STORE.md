# Callback for Chrome: Chrome Web Store listing

The text the store asks for, ready to paste (features/chrome-extension.md). Publishing it is the owner's step: a
developer account, the one-time registration fee, and the review are all theirs. Build the file to upload with
`npm run extension:zip`, which writes `extension/callback-extension-<version>.zip` (the manifest at its root, built for
https://callback.rs).

## Name and summary
- **Name:** Callback
- **Summary (up to 132 characters; the manifest's description):** Add the jobs you apply to on LinkedIn, HelloWorld and Infostud to your Callback applications with one click.
- **Category:** Productivity → Workflow & Planning (it tracks the candidate's applications; not Developer Tools, which is for tools aimed at programmers)
- **Language:** English

## Detailed description
Callback keeps every job you apply to in one list, with its status, so nothing goes quiet without you noticing.

Jobs you apply to on callback.rs are tracked for you. This extension covers the rest: the jobs you apply to on LinkedIn, HelloWorld and Infostud.

- Open a job on one of those sites and press **Add to Callback**, which sits next to the site's own Apply button.
- Callback opens in a new tab with the job's title, company and location filled in. Check them, choose the CV you used (or none) and a status, and press Save.
- The job joins your applications list on callback.rs, where you change its status as you hear back and remove it if you like.

Nothing is added until you press Save. The extension needs no account of its own and no extra permission: it only reads the job on the page you are looking at, and only sends it to callback.rs when you click the button.

You need a Callback account (free) to save jobs: callback.rs.

## Single purpose
Add the job shown on a LinkedIn, HelloWorld or Infostud job page to the user's Callback applications list, through a button next to the site's Apply button.

## Why the extension runs on these three sites
The extension's one script runs only on `www.linkedin.com`, `www.helloworld.rs` and `poslovi.infostud.com`, because that is where the jobs it adds are shown. LinkedIn is matched on its whole host, because its pages change without a page load (a member who goes from the feed to Jobs would otherwise get no script until a reload); on a LinkedIn page that isn't a job's the script reads nothing and shows nothing. It reads the job's address, title, company and location from the page, to build the button's link, and it puts the button next to the site's Apply button. It does nothing on any other site. The manifest has no `permissions` and no `host_permissions`: the access is the content script's `matches` and nothing else.

## Permissions justification (the store's form)
| Permission | Answer |
|---|---|
| Host permissions | None requested. |
| `permissions` (tabs, storage, cookies, …) | None requested. |
| Remote code | No. The script is bundled in the package; nothing is fetched or evaluated. |

## Data use (the store's privacy questions)
- **What the extension handles:** the address, title, company and location of the job page the user is on.
- **When it is sent:** only when the user clicks "Add to Callback", as the address of a page on https://callback.rs that opens in a new tab. The extension makes no request of its own, in the background or otherwise, and holds no token or cookie of Callback's.
- **What it stores:** nothing in the browser.
- **Sold or shared with third parties:** no. Not used for advertising, creditworthiness or any purpose other than adding the job to the user's list. Not used to build profiles.
- **Does it collect personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity or website content?** It handles website content only: the job's own details on the page, sent when the user clicks. It collects none of the other categories.
- **Certifications to tick:** the data isn't sold to third parties outside the approved use cases; isn't used or transferred for purposes unrelated to the item's single purpose; isn't used or transferred to determine creditworthiness or for lending.
- **Privacy policy URL:** https://callback.rs/privacy (the part "If you use the Callback browser extension", under "What we collect").

## Screenshots to take (1280x800, or 640x400)
1. A HelloWorld job page with the "Add to Callback" button beside the "Apply" button.
2. The same on an Infostud job page, beside "Konkurišite".
3. A LinkedIn job page (the signed-in two-pane search), with the button beside Apply.
4. The "Add an application" page on callback.rs, filled in (title, company, location, CV, status) with Save.
5. The Applications list on callback.rs with the added job, its status dropdown and its "via LinkedIn".

The store also wants a small promotional tile (440x280). The icon is `extension/icons/icon-128.png`.

## Before the first upload
- `npm run extension:zip`, then upload the file it writes. Its manifest `version` is the store's; raise it (`extension/manifest.json`) for every update.
- The migration `supabase/migrations/20261115120000_external_applications.sql` must be applied to the production database, and the deploy that carries `/applications/new` must be live, before the extension is published: until then its button leads to a page that can't save.
