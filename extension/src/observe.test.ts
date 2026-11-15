// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observePage } from "./observe";

// A frame is the next animation frame; the tests move it by hand.
function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

let stop: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = "<main id='root'></main>";
});

afterEach(() => {
  stop?.();
  stop = null;
});

describe("observePage", () => {
  it("looks at the page once when it starts", async () => {
    const run = vi.fn();
    stop = observePage({ document, view: window, run });

    expect(run).not.toHaveBeenCalled();
    await nextFrame();
    expect(run).toHaveBeenCalledOnce();
  });

  it("looks again when the page draws something", async () => {
    const run = vi.fn();
    stop = observePage({ document, view: window, run });
    await nextFrame();
    run.mockClear();

    document.getElementById("root")?.append(document.createElement("p"));
    await nextFrame();
    await nextFrame();

    expect(run).toHaveBeenCalledOnce();
  });

  it("looks again when text changes in place", async () => {
    document.getElementById("root")!.textContent = "before";
    const run = vi.fn();
    stop = observePage({ document, view: window, run });
    await nextFrame();
    run.mockClear();

    document.getElementById("root")!.firstChild!.textContent = "after";
    await nextFrame();
    await nextFrame();

    expect(run).toHaveBeenCalledOnce();
  });

  it("coalesces a burst of changes into one look a frame", async () => {
    const run = vi.fn();
    stop = observePage({ document, view: window, run });
    await nextFrame();
    run.mockClear();

    const root = document.getElementById("root")!;
    for (let index = 0; index < 50; index += 1) root.append(document.createElement("span"));
    await nextFrame();
    await nextFrame();

    expect(run).toHaveBeenCalledOnce();
  });

  it("looks again when the address moves without the page drawing anything", async () => {
    const run = vi.fn();
    stop = observePage({ document, view: window, run });
    await nextFrame();
    run.mockClear();

    window.dispatchEvent(new Event("popstate"));
    await nextFrame();
    expect(run).toHaveBeenCalledOnce();

    run.mockClear();
    window.dispatchEvent(new Event("hashchange"));
    await nextFrame();
    expect(run).toHaveBeenCalledOnce();
  });

  it("listens to the Navigation API where the browser has one", async () => {
    const listeners = new Set<() => void>();
    const navigation = {
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    const view = Object.assign(Object.create(window), { navigation }) as typeof window;
    const run = vi.fn();
    stop = observePage({ document, view, run });
    await nextFrame();
    run.mockClear();

    expect(listeners.size).toBe(1);
    [...listeners][0]();
    await nextFrame();
    expect(run).toHaveBeenCalledOnce();

    stop();
    stop = null;
    expect(listeners.size).toBe(0);
  });

  it("stops looking once stopped, even for a look already waiting", async () => {
    const run = vi.fn();
    stop = observePage({ document, view: window, run });
    stop();
    stop = null;

    document.getElementById("root")?.append(document.createElement("p"));
    window.dispatchEvent(new Event("popstate"));
    await nextFrame();
    await nextFrame();

    expect(run).not.toHaveBeenCalled();
  });
});
