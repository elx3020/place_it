import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { beforeAll, expect, it } from "vitest";

let code = "";

beforeAll(async () => {
  const out = await build({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "warn", build: { write: false } });
  const files = [out].flat().flatMap((o) => ("output" in o ? o.output : []));
  code = (files.find((f) => f.fileName === "place-it.global.js") as { code: string }).code;
}, 60_000);

it("defines window.PlaceIt in a plain script sandbox", () => {
  const window: Record<string, unknown> = {};
  window.window = window;
  runInNewContext(code, window);
  const PlaceIt = window.PlaceIt as typeof import("../src/index");
  expect(typeof PlaceIt.createPlaceIt).toBe("function");
  let error: unknown;
  try {
    PlaceIt.parseConfig({ version: 2, target: "ear", anchor: [0, 0, 0] });
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(PlaceIt.PlaceItError);
  expect((error as { code: string }).code).toBe("config-version");
});

it("keeps three, MediaPipe and Rapier out of the entry and loads them as sibling files", () => {
  // library markers (the internal class name MediaPipeTracker is only read off the lazily imported module)
  expect(code).not.toMatch(/three[./]|WebGPURenderer|GLTFLoader|@mediapipe|tasks-vision|FaceLandmarker|rapier/i);
  for (const file of ["render.js", "tracking.js", "physics.js", "physics-worker.js"]) expect(code).toContain(file);
});
