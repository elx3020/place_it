import { describe, it, expect } from "vitest";
import { PoseSmoother } from "../src/smoothing";
import type { Pose } from "../src/index";

const pose = (x: number, visible = true): Pose => ({ position: [x, 0.5, 0], rotation: [0, 0, 0, 1], scale: 1, visible });
const jitter = (n: number) => Array.from({ length: n }, (_, i) => 0.5 + (i % 2 ? 0.004 : -0.004));
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe("PoseSmoother", () => {
  it("cuts jitter on a still target", () => {
    const s = new PoseSmoother();
    const out = jitter(60).map((x, i) => s.smooth([pose(x)], i * 33)[0]!.position[0]);
    expect(spread(out.slice(30))).toBeLessThan(0.008 / 3);
  });

  it("follows a fast move without long lag", () => {
    const s = new PoseSmoother();
    for (let i = 0; i < 10; i++) s.smooth([pose(0.2)], i * 33);
    let x = 0;
    for (let i = 10; i < 25; i++) x = s.smooth([pose(0.8)], i * 33)[0]!.position[0];
    expect(x).toBeGreaterThan(0.75);
  });

  it("starts fresh after the target was hidden", () => {
    const s = new PoseSmoother();
    s.smooth([pose(0.2)], 0);
    s.smooth([pose(0, false)], 33);
    expect(s.smooth([pose(0.9)], 66)[0]!.position[0]).toBe(0.9);
  });
});
