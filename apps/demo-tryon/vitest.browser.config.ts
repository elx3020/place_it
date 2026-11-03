import { defineConfig } from "vitest/config";

// Runs in Node and drives Playwright itself (camera flags, a denied permission, a fake origin), so not Vitest browser mode.
export default defineConfig({ test: { include: ["test/**/*.browser.test.ts"], testTimeout: 90_000, hookTimeout: 120_000 } });
