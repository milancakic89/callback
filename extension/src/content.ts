import { createButtonController } from "./button";
import { observePage } from "./observe";
import { adapterForHostname } from "./sites";
import { syncPage } from "./sync-page";

// The content script (features/chrome-extension.md): runs on the three job sites only (the manifest's
// `matches`), picks the site's adapter by its host, and keeps an "Add to Callback" button next to the
// job's Apply control. It needs no permission, has no background worker and stores nothing.
const adapter = adapterForHostname(location.hostname);

if (adapter) {
  const controller = createButtonController({ document, origin: __CALLBACK_ORIGIN__ });
  observePage({
    document,
    view: window,
    run: () => syncPage({ adapter, controller, document, url: new URL(location.href) }),
  });
}
