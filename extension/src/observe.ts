// Runs `run` when the page may have changed its job (features/chrome-extension.md). All three sites move
// from one job to another without loading a page (Infostud is a Next.js app, and LinkedIn's search swaps
// the job pane), so the script watches the page: a MutationObserver for what the page draws, and the
// address for what it only navigates. Every cause is coalesced to one run per animation frame, so a page
// that mutates all the time costs a few cheap queries a frame and no more. Returns what stops it.

// The Navigation API reports a move between jobs that changes the address and nothing else on the page.
type NavigationTarget = { addEventListener(type: "navigatesuccess", listener: () => void): void; removeEventListener(type: "navigatesuccess", listener: () => void): void };

export function observePage({
  document: doc,
  view,
  run,
}: {
  document: Document;
  view: Window & typeof globalThis;
  run: () => void;
}): () => void {
  let scheduled = false;
  let stopped = false;

  function schedule(): void {
    if (scheduled || stopped) return;
    scheduled = true;
    view.requestAnimationFrame(() => {
      scheduled = false;
      if (!stopped) run();
    });
  }

  const observer = new view.MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  view.addEventListener("popstate", schedule);
  view.addEventListener("hashchange", schedule);
  const navigation = (view as { navigation?: NavigationTarget }).navigation;
  navigation?.addEventListener("navigatesuccess", schedule);

  schedule();

  return () => {
    stopped = true;
    observer.disconnect();
    view.removeEventListener("popstate", schedule);
    view.removeEventListener("hashchange", schedule);
    navigation?.removeEventListener("navigatesuccess", schedule);
  };
}
