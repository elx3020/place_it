import { describe, expect, it, vi } from "vitest";
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
  it("constructs a module Worker from the url", () => {
    const W = vi.fn();
    vi.stubGlobal("Worker", W);
    createWorker("https://x.test/w.js");
    expect(W).toHaveBeenCalledWith("https://x.test/w.js", { type: "module" });
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
