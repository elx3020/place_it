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

  it("(e2) a callback already in flight after stop() does not render", async () => {
    const { s, renderer, scheduler, tick } = await setup([withFace]);
    scheduler.cancel = () => {}; // cancel ineffective: the guard must be in the session
    await s.start(); s.stop(); await tick();
    expect(renderer.renders).toHaveLength(0);
  });

  it("(i) stop() during in-flight track() that rejects: no error, no render", async () => {
    const { s, tracker, renderer, scheduler } = await setup([withFace]);
    let rej!: (e: Error) => void;
    tracker.track = () => new Promise((_, r) => { rej = r; });
    const errs: PlaceItError[] = []; s.on("error", (e) => errs.push(e));
    await s.start(); scheduler.tick(0); await flush();
    s.stop(); rej(new Error("disposed")); await flush();
    expect(errs).toEqual([]); expect(renderer.renders).toHaveLength(0);
  });

  it("(ii) stop() during pending input.start(): stream closed, no loop", async () => {
    const { s, inp, scheduler } = await setup([withFace]);
    let done!: () => void;
    inp.start = () => new Promise<void>((r) => { done = r; });
    const stop = vi.spyOn(inp, "stop"); const req = vi.spyOn(scheduler, "request");
    const p = s.start(); s.stop(); done(); await p;
    expect(stop).toHaveBeenCalledTimes(2); expect(req).not.toHaveBeenCalled();
  });

  it("(iii) input.start() rejecting after stop() emits no error", async () => {
    const { s, inp } = await setup([withFace]);
    let rej!: (e: Error) => void;
    inp.start = () => new Promise<void>((_, r) => { rej = r; });
    const errs: PlaceItError[] = []; s.on("error", (e) => errs.push(e));
    const p = s.start(); s.stop(); rej(new Error("late")); await p;
    expect(errs).toEqual([]);
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

  it("physics: hidden poses get no body (a zero-radius body would fail validation)", async () => {
    const { s, physics, tick } = await setup([noFace, withFace], true);
    const add = vi.spyOn(physics!, "addBody");
    const errs: PlaceItError[] = []; s.on("error", (e) => errs.push(e));
    await s.start(); await tick();
    expect(add).not.toHaveBeenCalled();
    await tick();
    expect(add.mock.calls.map(([d]) => d.radius > 0)).toEqual([true, true]);
    expect(errs).toEqual([]);
  });

  it("start() while load() is pending does not track before the tracker is ready", async () => {
    const tracker = new FakeTracker([withFace]), renderer = new FakeRenderer(), scheduler = new FakeScheduler();
    let ready = false, initDone!: () => void;
    tracker.init = () => new Promise<void>((r) => { initDone = () => { ready = true; r(); }; });
    const track = vi.spyOn(tracker, "track").mockImplementation(async () => {
      if (!ready) throw new Error("track() before init()");
      return withFace;
    });
    const s = new PlaceItSession({ input: new FakeInputSource([input]), tracker, renderer, scheduler });
    const errs: PlaceItError[] = []; s.on("error", (e) => errs.push(e));
    const loading = s.load("m.glb", cfg);
    await s.start(); scheduler.tick(0); await flush();
    expect(track).not.toHaveBeenCalled();
    initDone(); await loading;
    scheduler.tick(1); await flush();
    expect(errs).toEqual([]);
    expect(renderer.renders).toHaveLength(1);
  });

  it("a throwing tracking-lost listener does not stop the loop or raise an error", async () => {
    const { s, renderer, tick } = await setup([withFace, noFace, noFace]);
    const errs: PlaceItError[] = [];
    s.on("error", (e) => errs.push(e));
    s.on("tracking-lost", () => { throw new Error("host bug"); });
    await s.start(); await tick(); await tick(); await tick();
    expect(errs).toEqual([]);
    expect(renderer.renders.length).toBe(3);
  });

  it("reportError emits error; stop() during load leaves the tracker uninitialised", async () => {
    const { s } = await setup([withFace]);
    const errs: PlaceItError[] = [];
    s.on("error", (e) => errs.push(e));
    s.reportError(new PlaceItError("physics-failed", "x"));
    expect(errs.map((e) => e.code)).toEqual(["physics-failed"]);
    const t = new FakeTracker([withFace]);
    const s2 = new PlaceItSession({ input: new FakeInputSource([input]), tracker: t, renderer: new FakeRenderer(), scheduler: new FakeScheduler() });
    const p = s2.load("m.glb", cfg);
    s2.stop();
    await p;
    expect(t.needs).toEqual([]);
  });

  it("passes the config anchor to every rendered object", async () => {
    const tracker = new FakeTracker([withFace]), renderer = new FakeRenderer(), scheduler = new FakeScheduler();
    const s = new PlaceItSession({ input: new FakeInputSource([input]), tracker, renderer, scheduler });
    await s.load("m.glb", { ...cfg, anchor: [0, 0.01, 0] });
    await s.start(); scheduler.tick(0); await flush();
    expect(renderer.renders[0]!.objects.map((o) => o.anchor)).toEqual([[0, 0.01, 0], [0, 0.01, 0]]);
  });
});
