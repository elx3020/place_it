import { describe, expect, it } from "vitest";
import { RapierWorld } from "../src/rapier-world";

const DT = 1000 / 60;
const make = async (gravity?: [number, number, number]) => {
  const w = new RapierWorld(gravity ? { gravity } : {});
  await w.init();
  return w;
};

describe("RapierWorld", () => {
  it("dynamic body falls under default gravity", async () => {
    const w = await make();
    const id = w.addBody({ kind: "dynamic", position: [0, 5, 0], radius: 0.1 });
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(w.readPositions().get(id)![1]).toBeLessThan(5 - 1);
    w.dispose();
  });

  it("kinematic body reaches each target after one step", async () => {
    const w = await make();
    const id = w.addBody({ kind: "kinematic", position: [0, 0, 0], radius: 0.1 });
    for (const t of [[1, 2, 3], [-1, 0.5, 2], [0, 0, 0]] as [number, number, number][]) {
      w.setKinematicTarget(id, t);
      w.step(DT);
      const p = w.readPositions().get(id)!;
      t.forEach((v, i) => expect(p[i]).toBeCloseTo(v, 5));
    }
    w.dispose();
  });

  it("dynamic body does not move with gravity zeroed", async () => {
    const w = await make([0, 0, 0]);
    const id = w.addBody({ kind: "dynamic", position: [1, 2, 3], radius: 0.1 });
    for (let i = 0; i < 30; i++) w.step(DT);
    expect(w.readPositions().get(id)).toEqual([1, 2, 3]);
    w.dispose();
  });

  it("is deterministic", async () => {
    const run = async () => {
      const w = await make();
      w.addBody({ kind: "dynamic", position: [0, 5, 0], radius: 0.1 });
      const k = w.addBody({ kind: "kinematic", position: [0, 0, 0], radius: 0.5 });
      for (let i = 0; i < 120; i++) {
        w.setKinematicTarget(k, [Math.sin(i / 10), 0, 0]);
        w.step(DT);
      }
      const r = [...w.readPositions()];
      w.dispose();
      return r;
    };
    expect(await run()).toEqual(await run());
  });

  it("ignores non-finite targets and dt", async () => {
    const w = await make();
    const id = w.addBody({ kind: "kinematic", position: [1, 1, 1], radius: 0.1 });
    w.setKinematicTarget(id, [NaN, 0, 0]);
    w.setKinematicTarget(id, [0, Infinity, 0]);
    w.step(NaN);
    w.step(DT);
    expect(w.readPositions().get(id)).toEqual([1, 1, 1]);
    w.dispose();
  });

  it("dispose is idempotent", async () => {
    const w = await make();
    w.dispose();
    expect(() => w.dispose()).not.toThrow();
  });
});

describe("input validation", () => {
  it("addBody rejects non-finite or non-positive input with physics-failed", async () => {
    const w = await make();
    for (const d of [
      { position: [NaN, 0, 0], radius: 1 },
      { position: [0, Infinity, 0], radius: 1 },
      { position: [0, 0, 0], radius: NaN },
      { position: [0, 0, 0], radius: 0 },
      { position: [0, 0, 0], radius: -1 },
    ] as const)
      expect(() => w.addBody({ kind: "dynamic", position: [...d.position], radius: d.radius })).toThrowError(
        expect.objectContaining({ code: "physics-failed" }),
      );
    w.dispose();
  });

  it("non-finite gravity components fall back to the default", async () => {
    const w = await make([NaN, 0, 0]);
    const id = w.addBody({ kind: "dynamic", position: [0, 5, 0], radius: 0.1 });
    for (let i = 0; i < 30; i++) w.step(DT);
    const p = w.readPositions().get(id)!;
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p[1]).toBeLessThan(5);
    w.dispose();
  });
});
