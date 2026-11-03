import { defineConfig } from "tsup";

// npm build: dependencies stay external, so bundlers split the dynamic imports of render/tracking/physics into lazy chunks
export default defineConfig({ entry: { index: "src/index.ts" }, format: ["esm"], dts: true, clean: true, target: "es2022" });
