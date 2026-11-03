import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceItError } from "@place-it/core";
import { CameraSource } from "../src/camera";

function stubMedia(impl: () => Promise<unknown>) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn(impl) }, configurable: true });
}
const domErr = (name: string) => Object.assign(new Error(name), { name });

afterEach(() => vi.restoreAllMocks());

describe("CameraSource", () => {
  it("maps NotAllowedError to camera-denied", async () => {
    stubMedia(() => Promise.reject(domErr("NotAllowedError")));
    await expect(new CameraSource().start()).rejects.toMatchObject({ code: "camera-denied" });
    await expect(new CameraSource().start()).rejects.toBeInstanceOf(PlaceItError);
  });

  it.each(["NotFoundError", "OverconstrainedError", "Weird"])("maps %s to camera-unavailable", async (n) => {
    stubMedia(() => Promise.reject(domErr(n)));
    await expect(new CameraSource().start()).rejects.toMatchObject({ code: "camera-unavailable" });
  });

  it("sets iOS-required attributes, stops all tracks once, grabs only when ready", async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stubMedia(() => Promise.resolve({ getTracks: () => tracks }));
    const setSrc = vi.spyOn(HTMLMediaElement.prototype, "srcObject", "set").mockImplementation(() => {});
    const cam = new CameraSource();
    vi.spyOn(cam.video, "play").mockResolvedValue();
    await cam.start();
    expect(cam.video.hasAttribute("playsinline")).toBe(true);
    expect(cam.video.muted).toBe(true);
    expect(cam.video.autoplay).toBe(true);
    expect(cam.grab()).toBeUndefined();
    Object.defineProperty(cam.video, "readyState", { value: 4 });
    Object.defineProperty(cam.video, "videoWidth", { value: 640 });
    Object.defineProperty(cam.video, "videoHeight", { value: 480 });
    expect(cam.grab()).toMatchObject({ handle: cam.video, width: 640, height: 480 });
    cam.stop();
    cam.stop();
    tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1));
  });
});
