import type { FrameInput, InputSource } from "@place-it/core";
import { grabVideo } from "./camera";

export class ImageSource implements InputSource {
  constructor(private readonly image: HTMLImageElement | ImageBitmap) {}
  async start(): Promise<void> {
    if ("decode" in this.image) await this.image.decode();
  }
  stop(): void {}
  grab(): FrameInput | undefined {
    const i = this.image;
    const [width, height] = "naturalWidth" in i ? [i.naturalWidth, i.naturalHeight] : [i.width, i.height];
    return width ? { handle: i, width, height, timestampMs: performance.now() } : undefined;
  }
}

export class VideoFileSource implements InputSource {
  readonly video = document.createElement("video");
  constructor(private readonly url: string) {
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.muted = true;
    this.video.loop = true;
    this.video.crossOrigin = "anonymous";
  }
  async start(): Promise<void> {
    this.video.src = this.url;
    await this.video.play();
  }
  stop(): void {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }
  grab(): FrameInput | undefined {
    return grabVideo(this.video);
  }
}
