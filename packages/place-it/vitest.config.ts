import { defineConfig } from "vitest/config";

// own config so vitest does not pick up vite.config.ts (the CDN build, which swaps ./load for the URL loader)
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
