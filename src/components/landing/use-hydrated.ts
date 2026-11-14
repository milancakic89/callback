import { useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

// False in the server's markup and during hydration, true from the first render after it. For a
// component that renders one thing without scripting and another with it (the promo film's native
// controls, then its play button). `useSyncExternalStore` serves the server's value while hydrating, so
// the two renders agree, and then re-renders with the client's; no effect that sets state is needed.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}
