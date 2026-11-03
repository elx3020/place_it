import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const face = { detectForVideo: vi.fn(), close: vi.fn() };
  const pose = { detectForVideo: vi.fn(), close: vi.fn() };
  return {
    face,
    pose,
    FaceLandmarker: { createFromOptions: vi.fn() },
    PoseLandmarker: { createFromOptions: vi.fn() },
    FilesetResolver: { forVisionTasks: vi.fn(async (p: string) => ({ wasmLoaderPath: p })) },
  };
});
vi.mock("@mediapipe/tasks-vision", () => m);

import { PlaceItError } from "@place-it/core";
import { MediaPipeTracker } from "../src";

const input = { handle: {}, width: 640, height: 480, timestampMs: 42 };

beforeEach(() => {
  vi.clearAllMocks();
  m.FaceLandmarker.createFromOptions.mockResolvedValue(m.face);
  m.PoseLandmarker.createFromOptions.mockResolvedValue(m.pose);
  m.face.detectForVideo.mockReturnValue({
    faceLandmarks: [[{ x: 0.1, y: 0.2, z: 0.3, visibility: 1 }]],
    facialTransformationMatrixes: [{ data: new Float32Array(16).fill(1) }],
  });
  m.pose.detectForVideo.mockReturnValue({ landmarks: [[{ x: 0.5, y: 0.6, z: 0.7 }]] });
});

describe("MediaPipeTracker", () => {
  it("init(['face']) creates only the face task", async () => {
    await new MediaPipeTracker().init(["face"]);
    expect(m.FaceLandmarker.createFromOptions).toHaveBeenCalledTimes(1);
    expect(m.PoseLandmarker.createFromOptions).not.toHaveBeenCalled();
    expect(m.FaceLandmarker.createFromOptions.mock.calls[0]![1]).toMatchObject({
      runningMode: "VIDEO",
      outputFacialTransformationMatrixes: true,
      numFaces: 4,
    });
  });

  it("init(['face','pose']) creates both, with default and overridden URLs", async () => {
    const t = new MediaPipeTracker({ baseUrl: "https://x.test/wasm", maxFaces: 2, modelUrls: { pose: "p.task" } });
    await t.init(["face", "pose"]);
    expect(m.FilesetResolver.forVisionTasks).toHaveBeenCalledWith("https://x.test/wasm");
    expect(m.FaceLandmarker.createFromOptions.mock.calls[0]![1].numFaces).toBe(2);
    expect(m.PoseLandmarker.createFromOptions.mock.calls[0]![1]).toMatchObject({
      runningMode: "VIDEO",
      numPoses: 2,
      baseOptions: { modelAssetPath: "p.task" },
    });
    expect(m.FaceLandmarker.createFromOptions.mock.calls[0]![1].baseOptions.modelAssetPath).toContain("face_landmarker");
  });

  it("maps results to a TrackingFrame", async () => {
    const t = new MediaPipeTracker();
    await t.init(["face", "pose"]);
    const f = await t.track(input);
    expect(m.face.detectForVideo).toHaveBeenCalledWith(input.handle, 42);
    expect(f.timestampMs).toBe(42);
    expect(f.imageSize).toEqual({ width: 640, height: 480 });
    expect(f.faces).toEqual([[{ x: 0.1, y: 0.2, z: 0.3 }]]);
    expect(f.faceMatrices).toEqual([new Array(16).fill(1)]);
    expect(f.pose).toEqual([{ x: 0.5, y: 0.6, z: 0.7 }]);
  });

  it("leaves pose undefined when not requested or nothing detected", async () => {
    const t = new MediaPipeTracker();
    await t.init(["face"]);
    expect((await t.track(input)).pose).toBeUndefined();
    const p = new MediaPipeTracker();
    await p.init(["pose"]);
    m.pose.detectForVideo.mockReturnValue({ landmarks: [] });
    const f = await p.track(input);
    expect(f.pose).toBeUndefined();
    expect(f.faces).toEqual([]);
  });

  it("track before init rejects with tracker-failed", async () => {
    await expect(new MediaPipeTracker().track(input)).rejects.toMatchObject({ code: "tracker-failed" });
    await expect(new MediaPipeTracker().track(input)).rejects.toBeInstanceOf(PlaceItError);
  });

  it("task creation failure rejects with tracker-failed", async () => {
    m.FaceLandmarker.createFromOptions.mockRejectedValue(new Error("boom"));
    await expect(new MediaPipeTracker().init(["face"])).rejects.toMatchObject({ code: "tracker-failed" });
  });

  it("closes a task created before another failed", async () => {
    m.PoseLandmarker.createFromOptions.mockRejectedValue(new Error("boom"));
    await expect(new MediaPipeTracker().init(["face", "pose"])).rejects.toMatchObject({ code: "tracker-failed" });
    expect(m.face.close).toHaveBeenCalledTimes(1);
  });

  it("dispose closes tasks and is safe twice", async () => {
    const t = new MediaPipeTracker();
    await t.init(["face", "pose"]);
    t.dispose();
    t.dispose();
    expect(m.face.close).toHaveBeenCalledTimes(1);
    expect(m.pose.close).toHaveBeenCalledTimes(1);
    await expect(t.track(input)).rejects.toMatchObject({ code: "tracker-failed" });
  });

  it("dispose() during init closes what init created and leaves the tracker not ready", async () => {
    let release!: () => void;
    m.FaceLandmarker.createFromOptions.mockReturnValue(new Promise((r) => { release = () => r(m.face); }));
    const t = new MediaPipeTracker();
    const p = t.init(["face"]);
    await Promise.resolve(); await Promise.resolve();
    t.dispose();
    release();
    await p;
    expect(m.face.close).toHaveBeenCalled();
    await expect(t.track(input)).rejects.toBeInstanceOf(PlaceItError);
  });
});
