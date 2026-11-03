import { ThreeRenderer } from "@place-it/render";
import { createPlaceIt, parseConfig, serializeConfig, type PlaceItSession, type PlacementConfig, type TargetType, type Vec3 } from "place-it";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const preview = $<HTMLCanvasElement>("preview");
const status = $("status");
const error = $("error");

let config: PlacementConfig = { version: 1, target: "ear", anchor: [0, 0, 0], scale: 1, mirror: false };
let modelUrl: string | undefined;
let session: PlaceItSession | undefined;

const showError = (e: unknown) =>
  (error.textContent = `${(e as { code?: string }).code ?? "error"}: ${e instanceof Error ? e.message : String(e)}`);
const showConfig = () => {
  $<HTMLSelectElement>("target").value = config.target;
  $<HTMLInputElement>("mirror").checked = !!config.mirror;
  $("anchor").textContent = config.anchor.map((n) => n.toFixed(3)).join(", ");
};

// Preview: the model alone in front view (+Z toward the viewer), unmirrored, over a plain frame.
const view = new ThreeRenderer({ canvas: preview, mirrored: false });
const frame = Object.assign(document.createElement("canvas"), { width: preview.width, height: preview.height });
const ctx = frame.getContext("2d")!;
ctx.fillStyle = "#333";
ctx.fillRect(0, 0, frame.width, frame.height);
let fit = 1; // canvas heights per model meter
let bounds: Vec3 = [1, 1, 1];
view.addPass({ name: "bounds", apply: (c) => void (bounds = c.objects[0]?.bounds ?? bounds) }); // passes see each object's size
const draw = () =>
  view.render({ handle: frame, width: frame.width, height: frame.height, timestampMs: 0 }, [
    { id: "model", pose: { position: [0.5, 0.5, 0], rotation: [0, 0, 0, 1], scale: fit, visible: true }, mirrored: false },
  ]);
const ready = view.init();

async function useModel(file: File) {
  error.textContent = "";
  if (modelUrl) URL.revokeObjectURL(modelUrl);
  modelUrl = URL.createObjectURL(file);
  await ready;
  await view.loadModel(modelUrl);
  draw(); // measures the bounds
  fit = 0.8 / Math.max(bounds[0], bounds[1]);
  draw();
  status.textContent = `Loaded ${file.name}. Click the preview to set the anchor.`;
}

const file = $<HTMLInputElement>("file");
file.onchange = () => file.files?.[0] && useModel(file.files[0]).catch(showError);
document.ondragover = (e) => e.preventDefault();
document.ondrop = (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0];
  if (f) useModel(f).catch(showError);
};

// Click → model coordinates on the front plane (z = 0): the preview places the model origin at the centre.
preview.onclick = (e) => {
  if (!modelUrl) return;
  const r = preview.getBoundingClientRect();
  const perMeter = fit * preview.height;
  const x = ((e.clientX - r.left) / r.width - 0.5) * preview.width;
  const y = ((e.clientY - r.top) / r.height - 0.5) * preview.height;
  config.anchor = [x / perMeter, -y / perMeter, 0];
  showConfig();
};
$<HTMLSelectElement>("target").onchange = (e) => (config.target = (e.target as HTMLSelectElement).value as TargetType);
$<HTMLInputElement>("mirror").onchange = (e) => (config.mirror = (e.target as HTMLInputElement).checked);

$("export").onclick = () => ($<HTMLTextAreaElement>("json").value = serializeConfig(config));
$("import").onclick = () => {
  try {
    config = parseConfig(JSON.parse($<HTMLTextAreaElement>("json").value));
    error.textContent = "";
    showConfig();
  } catch (e) {
    showError(e);
  }
};

$("tryon").onclick = async () => {
  session?.stop();
  error.textContent = "";
  if (!modelUrl) return showError(new Error("drop or choose a GLB first"));
  const s = (session = createPlaceIt({ canvas: $<HTMLCanvasElement>("view"), target: config.target }));
  let failed = false;
  const fail = (e: unknown) => {
    if (session !== s) return;
    failed = true;
    showError(e);
    status.textContent = "Stopped";
    s.stop();
  };
  s.on("error", fail);
  status.textContent = "Starting camera...";
  await s.start(); // camera first: a permission error shows without waiting for the models
  if (failed) return;
  status.textContent = "Loading models...";
  try {
    await s.load(modelUrl, config);
    if (session === s) status.textContent = "Running";
  } catch (e) {
    fail(e);
  }
};
