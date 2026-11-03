import { scriptBase } from "@place-it/platform-web";

// CDN build (aliased over ./load): the engine files sit next to place-it.global.js, so they resolve against the script's URL.
const near = (file: string) => new URL(file, scriptBase).href;
const from = <T>(file: string) => (): Promise<T> => import(/* @vite-ignore */ near(file));

export const load = {
  render: from<typeof import("@place-it/render")>("render.js"),
  tracking: from<typeof import("@place-it/tracking")>("tracking.js"),
  physics: from<typeof import("@place-it/physics")>("physics.js"),
};

export const workerUrl = (): string => near("physics-worker.js");
