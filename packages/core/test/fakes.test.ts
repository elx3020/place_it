import { describe, it, expect } from "vitest";
import { FakeTracker, FakeRenderer, FakeScheduler, FakeInputSource, FakePhysics } from "../src/testing/fakes";
import type { TrackingFrame, RenderObject, FrameInput } from "../src/index";

const frame = (t: number): TrackingFrame => ({ timestampMs: t, imageSize: { width: 1, height: 1 }, faces: [], faceMatrices: [] });
const input: FrameInput = { handle: null, width: 1, height: 1, timestampMs: 0 };

describe("fakes", () => {
  it("FakeTracker replays in order and repeats the last", async () => {
    const t = new FakeTracker([frame(1), frame(2)]);
    await t.init(["face"]);
    expect((await t.track(input)).timestampMs).toBe(1);
    expect((await t.track(input)).timestampMs).toBe(2);
    expect((await t.track(input)).timestampMs).toBe(2);
  });
  it("FakeRenderer records render calls", () => {
    const r = new FakeRenderer();
    const o: RenderObject[] = [{ id: "a", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1, visible: true }, mirrored: false }];
    r.render(input, o);
    expect(r.renders).toEqual([{ input, objects: o }]);
  });
  it("FakeScheduler ticks pending callbacks and supports cancel", () => {
    const s = new FakeScheduler();
    const got: number[] = [];
    s.request((n) => got.push(n));
    const h = s.request((n) => got.push(-n));
    s.cancel(h);
    s.tick(16);
    s.tick(32);
    expect(got).toEqual([16]);
    s.hidden = true;
    expect(s.isHidden()).toBe(true);
  });
  it("FakeInputSource and FakePhysics basics", () => {
    const i = new FakeInputSource([input]);
    expect(i.grab()).toBe(input);
    const p = new FakePhysics();
    const id = p.addBody({ kind: "kinematic", position: [0, 0, 0], radius: 1 });
    p.setKinematicTarget(id, [1, 2, 3]);
    expect(p.readPositions().get(id)).toEqual([1, 2, 3]);
  });
});
