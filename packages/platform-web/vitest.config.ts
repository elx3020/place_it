import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

export default defineConfig({
  test: { environment: "happy-dom" },
  define: { __VERSION__: JSON.stringify(version) },
});
