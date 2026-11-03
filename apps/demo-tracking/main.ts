import { CameraSource } from "@place-it/platform-web";
import { MediaPipeTracker } from "@place-it/tracking";

const status = document.getElementById("status")!;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const cam = new CameraSource();
const tracker = new MediaPipeTracker();

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
    }
    requestAnimationFrame(loop);
  };
  loop();
}

main().catch((e) => (status.textContent = `Error: ${e instanceof Error ? e.message : e}`));
