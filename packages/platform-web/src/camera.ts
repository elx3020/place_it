import { PlaceItError, type FrameInput, type InputSource } from "@place-it/core";

export interface CameraOptions { facingMode?: "user" | "environment"; mirrored?: boolean }

export class CameraSource implements InputSource {
  readonly video = document.createElement("video");
  readonly mirrored: boolean;
  private readonly facingMode: "user" | "environment";
  private stream?: MediaStream;

  constructor(opts: CameraOptions = {}) {
    this.facingMode = opts.facingMode ?? "user";
    this.mirrored = opts.mirrored ?? this.facingMode === "user";
    // iOS Safari refuses inline autoplay without all three.
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.muted = true;
    this.video.autoplay = true;
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facingMode }, audio: false });
    } catch (e) {
      const denied = (e as { name?: string })?.name === "NotAllowedError";
      throw new PlaceItError(denied ? "camera-denied" : "camera-unavailable", `Camera error: ${(e as Error)?.message ?? e}`);
    }
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
  }

  grab(): FrameInput | undefined {
    return grabVideo(this.video);
  }
}

export function grabVideo(video: HTMLVideoElement): FrameInput | undefined {
  if (video.readyState < 2) return undefined;
  return { handle: video, width: video.videoWidth, height: video.videoHeight, timestampMs: performance.now() };
}
