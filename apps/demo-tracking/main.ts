import { CameraSource } from "@place-it/platform-web";
import { MediaPipeTracker } from "@place-it/tracking";
import { PoseSmoother, computePlacements, type PlacementConfig } from "@place-it/core";

const status = document.getElementById("status")!;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const cam = new CameraSource();
const tracker = new MediaPipeTracker();
const config: PlacementConfig = { version: 1, target: "ear", anchor: [0, 0, 0], mirror: true };
const smoother = new PoseSmoother();
// exposed so a browser test can measure jitter: normalised [x, y] per ear, raw and smoothed
(window as unknown as { __lobes?: unknown }).__lobes = undefined;

async function main() {
  await cam.start();
  document.getElementById("stage")!.prepend(cam.video);
  await tracker.init(["face", "pose"]);
  status.textContent = "Tracking";
  const loop = async () => {
    const input = cam.grab();
    if (input) {
      const f = await tracker.track(input);
      canvas.width = input.width;
      canvas.height = input.height;
      ctx.fillStyle = "#4f8";
      for (const face of f.faces) for (const p of face) ctx.fillRect(p.x * canvas.width - 1, p.y * canvas.height - 1, 2, 2);
      ctx.fillStyle = "#f84";
      for (const p of f.pose ?? []) ctx.fillRect(p.x * canvas.width - 3, p.y * canvas.height - 3, 6, 6);
      // earlobe marks: red = raw placement, cyan = smoothed
      const raw = computePlacements(config, f);
      const smooth = smoother.smooth(raw, input.timestampMs);
      const mark = (poses: typeof raw, color: string, size: number) => {
        ctx.fillStyle = color;
        for (const p of poses) if (p.visible) ctx.fillRect(p.position[0] * canvas.width - size / 2, p.position[1] * canvas.height - size / 2, size, size);
      };
      mark(raw, "#f22", 10);
      mark(smooth, "#0ef", 6);
      const xy = (poses: typeof raw) => poses.map((p) => (p.visible ? [p.position[0], p.position[1]] : null));
      (window as unknown as { __lobes?: unknown }).__lobes = { raw: xy(raw), smooth: xy(smooth), m: f.faceMatrices[0], l234: f.faces[0]?.[234], l454: f.faces[0]?.[454], l10: f.faces[0]?.[10], l152: f.faces[0]?.[152] };
    }
    requestAnimationFrame(loop);
  };
  loop();
}

main().catch((e) => (status.textContent = `Error: ${e instanceof Error ? e.message : e}`));
