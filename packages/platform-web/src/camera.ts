import { PlaceItError, type FrameInput, type InputSource } from "@place-it/core";

export interface CameraOptions { facingMode?: "user" | "environment"; mirrored?: boolean }

export class CameraSource implements InputSource {
  readonly video = document.createElement("video");
  readonly mirrored: boolean;
  private readonly facingMode: "user" | "environment";
  private stream?: MediaStream;
  private gen = 0;

  constructor(opts: CameraOptions = {}) {
    this.facingMode = opts.facingMode ?? "user";
    this.mirrored = opts.mirrored ?? this.facingMode === "user";
    // iOS Safari refuses inline autoplay without all three.
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.muted = true;
    this.video.autoplay = true;
  }

  /** If stop() runs while getUserMedia is pending, the late stream is released and start() resolves without attaching it. */
  async start(): Promise<void> {
    const gen = ++this.gen;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facingMode }, audio: false });
    } catch (e) {
      throw toError(e);
    }
    if (gen !== this.gen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    try {
      this.video.srcObject = stream;
      await this.video.play();
    } catch (e) {
      if (gen === this.gen) this.stop();
      else stream.getTracks().forEach((t) => t.stop());
      throw toError(e);
    }
  }

  stop(): void {
    this.gen++;
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

function toError(e: unknown): PlaceItError {
  const denied = (e as { name?: string })?.name === "NotAllowedError";
  return new PlaceItError(denied ? "camera-denied" : "camera-unavailable", `Camera error: ${(e as Error)?.message ?? e}`);
}
