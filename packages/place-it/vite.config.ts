import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const dep = (p: string) => here(`node_modules/@place-it/${p}`);

// CDN files, built after tsup (which cleans dist and writes the npm entry). IIFE output cannot code-split, so:
// - default mode: place-it.global.js, a classic script defining window.PlaceIt; it import()s the files below by URL.
// - --mode chunks: render.js, tracking.js, physics.js (ES modules holding three, MediaPipe, the physics proxy) and physics-worker.js.
export default defineConfig(({ mode }) =>
  mode === "chunks"
    ? {
        // chunks reuse the loaded global's PlaceItError, so their errors stay `instanceof PlaceIt.PlaceItError`
        resolve: { alias: [{ find: /^@place-it\/core$/, replacement: here("src/global-core.ts") }] },
        plugins: [
          {
            name: "physics-worker",
            generateBundle() {
              this.emitFile({ type: "asset", fileName: "physics-worker.js", source: readFileSync(dep("physics/dist/worker.js")) });
            },
          },
        ],
        build: {
          emptyOutDir: false,
          lib: {
            entry: { render: dep("render/dist/index.js"), tracking: dep("tracking/dist/index.js"), physics: dep("physics/dist/index.js") },
            formats: ["es"],
            fileName: (_format, name) => `${name}.js`,
          },
        },
      }
    : {
        resolve: { alias: [{ find: /^\.\/load$/, replacement: here("src/load.cdn.ts") }] },
        build: {
          emptyOutDir: false,
          lib: { entry: here("src/index.ts"), name: "PlaceIt", formats: ["iife"], fileName: () => "place-it.global.js" },
        },
      },
);
