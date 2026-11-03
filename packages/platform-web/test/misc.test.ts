import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduler, createWorker, resolveAssetUrl } from "../src";

describe("resolveAssetUrl", () => {
  it("uses the pinned default base", () => {
    expect(resolveAssetUrl("models/a.glb")).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/place-it@\d+\.\d+\.\d+[^/]*\/assets\/models\/a\.glb$/,
    );
  });
  it("never doubles slashes", () => {
    expect(resolveAssetUrl("/a.glb", "https://x.test/base/")).toBe("https://x.test/base/a.glb");
    expect(resolveAssetUrl("a.glb", "https://x.test/base")).toBe("https://x.test/base/a.glb");
  });
});

describe("createWorker", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = () => {
    const W = vi.fn();
    vi.stubGlobal("Worker", W);
    vi.stubGlobal("document", { baseURI: "https://shop.test/page" });
    vi.stubGlobal("location", { origin: "https://shop.test" });
    return W;
  };

  it("same origin: a module Worker straight from the url", () => {
    const W = stub();
    createWorker("https://shop.test/w.js");
    expect(String(W.mock.calls[0]![0])).toBe("https://shop.test/w.js");
    expect(W.mock.calls[0]![1]).toEqual({ type: "module" });
  });

  it("cross origin: a same-origin blob that imports the script", async () => {
    const W = stub();
    let blob: Blob | undefined;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => ((blob = b), "blob:x") }));
    createWorker("https://cdn.test/w.js");
    expect(W).toHaveBeenCalledWith("blob:x", { type: "module" });
    expect(await blob!.text()).toBe('import "https://cdn.test/w.js";');
  });
});

describe("createScheduler", () => {
  it("delegates to requestAnimationFrame and document.hidden", () => {
    const raf = vi.fn(() => 7), caf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", caf);
    const s = createScheduler();
    expect(s.request(() => {})).toBe(7);
    s.cancel(7);
    expect(caf).toHaveBeenCalledWith(7);
    expect(typeof s.isHidden()).toBe("boolean");
  });
});
