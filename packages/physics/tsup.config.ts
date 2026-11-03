import { defineConfig } from "tsup";

export default defineConfig([
  // main-thread entry: Rapier stays external (only the worker and Node users need it)
  { entry: { index: "src/index.ts", rapier: "src/rapier-entry.ts" }, format: ["esm"], dts: true, clean: true, target: "es2022", external: ["@dimforge/rapier3d-compat"] },
  // worker entry: self-contained file (Rapier + embedded WASM) that CDN/script-tag consumers load by URL
  { entry: { worker: "src/worker.ts" }, format: ["esm"], target: "es2022", minify: true, noExternal: ["@dimforge/rapier3d-compat", "@place-it/core"] },
]);
