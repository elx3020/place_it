import type { Pose, RenderPass } from "@place-it/core";
import { ImageSource } from "@place-it/platform-web";
import { ThreeRenderer } from "@place-it/render";
import sphereUrl from "../../packages/render/fixtures/sphere.glb?url";
import stillUrl from "../../packages/render/fixtures/still.png";

const view = document.getElementById("view") as HTMLCanvasElement;
const tinted = document.getElementById("tinted") as HTMLCanvasElement;
const toggle = document.getElementById("tint") as HTMLInputElement;
const status = document.getElementById("status")!;

/** Example pass: reads the rendered frame and shows a warm-tinted copy on a canvas stacked above it. */
const tint: RenderPass = {
  name: "tint",
  apply({ rendered }) {
    tinted.hidden = !toggle.checked;
    if (!toggle.checked) return;
    const src = rendered as HTMLCanvasElement;
    Object.assign(tinted, { width: src.width, height: src.height });
    const ctx = tinted.getContext("2d")!;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#ffb070";
    ctx.fillRect(0, 0, src.width, src.height);
    ctx.globalCompositeOperation = "source-over";
  },
};

async function main() {
  const img = new Image();
  img.src = stillUrl;
  const source = new ImageSource(img);
  await source.start();
  Object.assign(view, { width: img.naturalWidth, height: img.naturalHeight });
  const renderer = new ThreeRenderer({ canvas: view, onWarning: (m) => console.warn(m) });
  await renderer.init();
  await renderer.loadModel(new URLSearchParams(location.search).get("model") ?? sphereUrl);
  renderer.addPass(tint);
  const pose: Pose = { position: [0.3, 0.4, 0], rotation: [0, 0, 0, 1], scale: 1.5, visible: true };
  const draw = () => renderer.render(source.grab()!, [{ id: "demo", pose, mirrored: false }]);
  toggle.onchange = draw;
  draw();
  status.textContent = `Backend: ${renderer.backend}. Add ?model=<url> to load another GLB.`;
}

main().catch((e) => (status.textContent = `Error: ${e instanceof Error ? e.message : e}`));
