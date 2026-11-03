import type { FrameInput, Landmark, PlacementConfig, Pose, RenderObject, TrackingFrame } from "@place-it/core";
import { FakeScheduler } from "@place-it/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
import { createPlaceIt, PlaceItSession } from "../src/index";

// Shared with the hoisted module mocks below: what got built, and the order of calls on the renderer.
const h = vi.hoisted(() => ({
  log: [] as string[],
  frames: [] as unknown[],
  made: {} as Record<"renderer" | "tracker" | "physics", { opts: Record<string, unknown>; disposed?: boolean; inits?: number } | undefined>,
  input: { handle: null, width: 640, height: 480, timestampMs: 0 },
  scheduler: undefined as unknown as FakeScheduler,
}));

vi.mock("@place-it/platform-web", async (orig) => ({
  ...(await orig<object>()),
  CameraSource: class { mirrored = true; async start() {} stop() {} grab() { return h.input; } },
  createScheduler: () => h.scheduler,
}));
vi.mock("@place-it/render", async () => {
  const { FakeRenderer } = await import("@place-it/core/testing");
  class ThreeRenderer extends FakeRenderer {
    disposed = false;
    inits = 0;
    constructor(public opts: Record<string, unknown>) { super(); h.made.renderer = this; }
    override async init() { this.inits++; }
    setOccluder(p?: Pose) { h.log.push(p ? `occluder ${p.position.map((n) => n.toFixed(2))} ${p.scale.toFixed(3)}` : "occluder none"); }
    override resize(w: number, ht: number) { h.log.push(`resize ${w}x${ht}`); }
    override render(i: FrameInput, o: RenderObject[]) { super.render(i, o); h.log.push("render"); }
    override dispose() { this.disposed = true; }
  }
  return { ThreeRenderer };
});
vi.mock("@place-it/tracking", async () => {
  const { FakeTracker } = await import("@place-it/core/testing");
  class MediaPipeTracker extends FakeTracker {
    constructor(public opts: Record<string, unknown>) { super(h.frames as TrackingFrame[]); h.made.tracker = this; }
  }
  return { MediaPipeTracker };
});
vi.mock("@place-it/physics", async () => {
  const { FakePhysics } = await import("@place-it/core/testing");
  class WorkerPhysics extends FakePhysics {
    constructor(public opts: Record<string, unknown>) { super(); h.made.physics = this; }
  }
  return { WorkerPhysics };
});

const lm = (x: number, y: number, z = 0): Landmark => ({ x, y, z });
const face = () => {
  const a = Array.from({ length: 478 }, () => lm(0.5, 0.5));
  a[234] = lm(0.4, 0.5, 0.02);
  a[454] = lm(0.6, 0.5, 0.04);
  return a;
};
const withFace: TrackingFrame = { timestampMs: 0, imageSize: { width: 640, height: 480 }, faces: [face()], faceMatrices: [undefined] };
const noFace: TrackingFrame = { ...withFace, faces: [], faceMatrices: [] };
const cfg: PlacementConfig = { version: 1, target: "ear", anchor: [0, 0, 0], scale: 1 };
const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  h.log = [];
  h.frames = [withFace];
  h.made = { renderer: undefined, tracker: undefined, physics: undefined };
  h.scheduler = new FakeScheduler();
});

it("builds no engine object until load(); renderer mirrors with the camera; physics is off by default", async () => {
  const s = createPlaceIt({ canvas, target: "ear" });
  expect(s).toBeInstanceOf(PlaceItSession);
  expect(h.made.renderer ?? h.made.tracker).toBeUndefined();
  await s.load("m.glb", cfg);
  expect(h.made.renderer!.opts).toEqual({ canvas, mirrored: true });
  expect(h.made.tracker!.opts).toEqual({ baseUrl: undefined });
  expect(h.made.physics).toBeUndefined();
});

it("each tracked frame sizes the view to the frame and places the head occluder before rendering", async () => {
  h.frames = [withFace, noFace];
  const s = createPlaceIt({ canvas, target: "ear" });
  await s.load("m.glb", cfg);
  await s.start();
  h.scheduler.tick(0); await flush();
  h.scheduler.tick(1); await flush();
  // head centre = midpoint of the two ear points; scale = face width (0.2 * 640/480) / 0.14 m
  expect(h.log).toEqual(["resize 640x480", "occluder 0.50,0.50,0.03 1.905", "render", "resize 640x480", "occluder none", "render"]);
});

it("physics: true builds WorkerPhysics; the worker URL is workerUrl, else under baseUrl, else next to the bundle", async () => {
  const urls: unknown[] = [];
  for (const o of [{}, { baseUrl: "https://shop.test/assets/" }, { baseUrl: "https://shop.test/assets", workerUrl: "https://w.test/w.js" }]) {
    await createPlaceIt({ canvas, target: "ear", physics: true, ...o }).load("m.glb", cfg);
    urls.push(h.made.physics!.opts.workerUrl);
  }
  expect(urls[0]).toMatch(/^file:.*\/physics-worker\.js$/);
  expect(urls.slice(1)).toEqual(["https://shop.test/assets/physics-worker.js", "https://w.test/w.js"]);
  expect(h.made.tracker!.opts).toEqual({ baseUrl: "https://shop.test/assets" });
});

it("load() rejects a config for the other target with config-invalid", async () => {
  const s = createPlaceIt({ canvas, target: "neck" });
  await expect(s.load("m.glb", cfg)).rejects.toMatchObject({ code: "config-invalid" });
  expect(h.made.renderer).toBeUndefined();
});

it("stop() while an engine module is loading disposes it on arrival and never inits it", async () => {
  const s = createPlaceIt({ canvas, target: "ear" });
  const loading = s.load("m.glb", cfg);
  s.stop();
  await expect(loading).resolves.toBeUndefined(); // stopped: load ends quietly
  expect(h.made.renderer).toMatchObject({ disposed: true, inits: 0 });
});
