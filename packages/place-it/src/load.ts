// npm build: plain dynamic imports, which the consumer's bundler splits into lazy chunks.
// The CDN build swaps this file for load.cdn.ts (see vite.config.ts).
export const load = {
  render: () => import("@place-it/render"),
  tracking: () => import("@place-it/tracking"),
  physics: () => import("@place-it/physics"),
};

/** The physics worker ships next to this file in dist/. */
export const workerUrl = (): string => new URL("./physics-worker.js", import.meta.url).href;
