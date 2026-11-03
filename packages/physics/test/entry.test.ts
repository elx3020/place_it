import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { WorkerPhysics } from "../src/worker-physics";

it("main entry output has no import of rapier (guards tree-shaking claim)", () => {
  const js = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
  expect(js).not.toMatch(/rapier3d-compat/);
});

it("WorkerPhysics.addBody validates on the main thread", () => {
  const p = new WorkerPhysics({ workerUrl: "x" });
  expect(() => p.addBody({ kind: "dynamic", position: [NaN, 0, 0], radius: 1 })).toThrowError(
    expect.objectContaining({ code: "physics-failed" }),
  );
  expect(() => p.addBody({ kind: "dynamic", position: [0, 0, 0], radius: 0 })).toThrowError(
    expect.objectContaining({ code: "physics-failed" }),
  );
});
