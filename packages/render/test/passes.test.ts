import type { PassContext, RenderPass } from "@place-it/core";
import { describe, expect, it, vi } from "vitest";
import { IdentityPass, PassPipeline } from "../src/passes";

const ctx: PassContext = {
  input: { handle: null, width: 4, height: 3, timestampMs: 0 },
  rendered: null,
  objects: [{ id: "ear-0", pose: { position: [0.5, 0.5, 0], rotation: [0, 0, 0, 1], scale: 1, visible: true }, bounds: [0.1, 0.1, 0.1], material: "gold" }],
};

describe("PassPipeline", () => {
  it("runs passes in insertion order and passes each the same PassContext", () => {
    const seen: [string, PassContext][] = [];
    const pass = (name: string): RenderPass => ({ name, apply: (c) => void seen.push([name, c]) });
    const pipeline = new PassPipeline();
    pipeline.add(pass("a"));
    pipeline.add(pass("b"));
    pipeline.add(pass("c"));
    pipeline.run(ctx);
    expect(seen.map(([n]) => n)).toEqual(["a", "b", "c"]);
    for (const [, c] of seen) expect(c).toBe(ctx);
  });

  it("catches a throwing pass, reports it through onError, and still runs later passes", () => {
    const onError = vi.fn();
    const later = vi.fn();
    const boom = new Error("boom");
    const bad: RenderPass = { name: "bad", apply: () => { throw boom; } };
    const pipeline = new PassPipeline(onError);
    pipeline.add(bad);
    pipeline.add({ name: "later", apply: later });
    expect(() => pipeline.run(ctx)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(boom, bad);
    expect(later).toHaveBeenCalledWith(ctx);
  });

  it("IdentityPass leaves the context unchanged", () => {
    const before = structuredClone(ctx);
    new IdentityPass().apply(ctx);
    expect(ctx).toEqual(before);
  });
});
