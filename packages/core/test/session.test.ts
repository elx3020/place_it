import { describe, it, expect, vi } from "vitest";
import {
  PlaceItSession, PlaceItError,
} from "../src/index";
import { FakeTracker, FakeInputSource, FakeRenderer, FakePhysics, FakeScheduler } from "../src/testing/fakes";
import type { FrameInput, Landmark, PlacementConfig, TrackingFrame } from "../src/index";

const lm = (x: number, y: number): Landmark => ({ x, y, z: 0 });
const faceLm = () => {
  const a = Array.from({ length: 478 }, () => lm(0.5, 0.5));
  a[234] = lm(0.4, 0.5); a[454] = lm(0.6, 0.5); a[152] = lm(0.5, 0.7);
  return a;
};
const withFace: TrackingFrame = { timestampMs: 0, imageSize: { width: 640, height: 480 }, faces: [faceLm()], faceMatrices: [undefined] };
const noFace: TrackingFrame = { ...withFace, faces: [], faceMatrices: [] };
const input: FrameInput = { handle: null, width: 640, height: 480, timestampMs: 0 };
const cfg: PlacementConfig = { version: 1, target: "ear", anchor: [0, 0, 0], scale: 1, mirror: true };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function setup(frames: TrackingFrame[], withPhysics = false) {
  const tracker = new FakeTracker(frames), inp = new FakeInputSource([input]);
  const renderer = new FakeRenderer(), scheduler = new FakeScheduler();
  const physics = withPhysics ? new FakePhysics() : undefined;
  const s = new PlaceItSession({ input: inp, tracker, renderer, scheduler, physics });
  await s.load("m.glb", cfg);
  const tick = async () => { scheduler.tick(0); await flush(); };
  return { s, tracker, inp, renderer, scheduler, physics, tick };
}

describe("PlaceItSession", () => {
  it("passes tracker needs and renders mirrored ids", async () => {
    const { s, tracker, renderer, tick } = await setup([withFace]);
    expect(tracker.needs).toEqual(["face", "pose"]);
    await s.start(); await tick();
    expect(renderer.renders[0]!.objects.map((o) => [o.id, o.mirrored])).toEqual([["ear-0", false], ["ear-1", true]]);
  });

  it("(a) camera-denied emits error, no track", async () => {
    const { s, tracker, inp } = await setup([withFace]);
    inp.start = async () => { throw new PlaceItError("camera-denied", "no"); };
    const track = vi.spyOn(tracker, "track"); const errs: PlaceItError[] = [];
    s.on("error", (e) => errs.push(e));
    await expect(s.start()).resolves.toBeUndefined();
    expect(errs.map((e) => e.code)).toEqual(["camera-denied"]);
    expect(track).not.toHaveBeenCalled();
  });

  it("wraps non-PlaceItError start failures as camera-unavailable", async () => {
    const { s, inp } = await setup([withFace]);
    inp.start = async () => { throw new Error("boom"); };
    const errs: PlaceItError[] = []; s.on("error", (e) => errs.push(e));
    await s.start();
    expect(errs[0]!.code).toBe("camera-unavailable");
  });

  it("(b) tracking-lost once, tracking-found once", async () => {
    const { s, tick } = await setup([withFace, noFace, noFace, withFace]);
    const ev: string[] = [];
    s.on("tracking-lost", () => ev.push("lost")); s.on("tracking-found", () => ev.push("found"));
    await s.start();
    for (let i = 0; i < 4; i++) await tick();
    expect(ev).toEqual(["lost", "found"]);
  });

  it("(c) renderer never gets NaN", async () => {
    const bad = { ...withFace, faces: [faceLm().map(() => lm(NaN, NaN))] };
    const { s, renderer, tick } = await setup([bad, withFace]);
    await s.start(); await tick(); await tick();
    for (const r of renderer.renders) for (const o of r.objects)
      expect(JSON.stringify(o.pose)).not.toContain("null");
  });

  it("(d) hidden skips track", async () => {
    const { s, tracker, scheduler, tick } = await setup([withFace]);
    const track = vi.spyOn(tracker, "track");
    scheduler.hidden = true;
    await s.start(); await tick();
    expect(track).not.toHaveBeenCalled();
  });

  it("(e) stop disposes everything, cancels, and is idempotent", async () => {
    const { s, inp, tracker, renderer, physics, scheduler, tick } = await setup([withFace], true);
    const spies = [vi.spyOn(inp, "stop"), vi.spyOn(tracker, "dispose"), vi.spyOn(renderer, "dispose"), vi.spyOn(physics!, "dispose")];
    const cancel = vi.spyOn(scheduler, "cancel");
    await s.start();
    s.stop(); s.stop();
    for (const sp of spies) expect(sp).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    await tick();
    expect(renderer.renders).toHaveLength(0);
  });

  it("(f) tracker throw emits tracker-failed and stops loop", async () => {
    const { s, tracker, renderer, tick } = await setup([withFace]);
    tracker.track = async () => { throw new Error("gpu"); };
    const errs: PlaceItError[] = []; s.on("error", (e) => errs.push(e));
    await s.start(); await tick(); await tick();
    expect(errs.map((e) => e.code)).toEqual(["tracker-failed"]);
    expect(renderer.renders).toHaveLength(0);
  });

  it("start twice does not start a second loop", async () => {
    const { s, renderer, tick } = await setup([withFace]);
    await s.start(); await s.start(); await tick();
    expect(renderer.renders).toHaveLength(1);
  });

  it("grab() undefined skips tracking without error", async () => {
    const { s, tracker, inp, renderer, tick } = await setup([withFace]);
    inp.grab = () => undefined;
    const track = vi.spyOn(tracker, "track"); const errs: PlaceItError[] = [];
    s.on("error", (e) => errs.push(e));
    await s.start(); await tick(); await tick();
    expect(track).not.toHaveBeenCalled(); expect(errs).toEqual([]); expect(renderer.renders).toHaveLength(0);
  });

  it("physics: poses go through kinematic bodies", async () => {
    const { s, renderer, physics, tick } = await setup([withFace], true);
    const add = vi.spyOn(physics!, "addBody");
    await s.start(); await tick(); await tick();
    expect(add).toHaveBeenCalledTimes(2);
    expect(renderer.renders[1]!.objects[0]!.pose.visible).toBe(true);
  });
});
