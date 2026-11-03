import { expect, test, vi } from "vitest";
import { WorkerPhysics } from "../src/worker-physics";

const workerUrl = new URL("../src/worker.ts", import.meta.url).href;

test("worker runs Rapier (WASM) and reports a falling body; dispose terminates", async () => {
  const p = new WorkerPhysics({ workerUrl });
  await p.init();
  const id = p.addBody({ kind: "dynamic", position: [0, 5, 0], radius: 0.1 });
  expect(id).toBe(0);
  expect(p.readPositions().get(id)![1]).toBe(5);
  await vi.waitFor(
    () => {
      p.step(1000 / 60);
      expect(p.readPositions().get(id)![1]).toBeLessThan(5);
    },
    { timeout: 10_000, interval: 20 },
  );
  p.dispose();
  p.dispose();
  const frozen = p.readPositions().get(id)![1];
  p.step(1000);
  await new Promise((r) => setTimeout(r, 100));
  expect(p.readPositions().get(id)![1]).toBe(frozen);
});

test("a bad worker url rejects init with physics-failed", async () => {
  const p = new WorkerPhysics({ workerUrl: new URL("./does-not-exist.js", import.meta.url).href });
  await expect(p.init()).rejects.toMatchObject({ code: "physics-failed" });
  p.dispose();
});

test("round trip: kinematic target and dynamic fall with two bodies", async () => {
  const p = new WorkerPhysics({ workerUrl });
  await p.init();
  const k = p.addBody({ kind: "kinematic", position: [0, 0, 0], radius: 0.1 });
  const d = p.addBody({ kind: "dynamic", position: [3, 5, 0], radius: 0.1 });
  expect(d).not.toBe(k);
  p.setKinematicTarget(k, [1, 2, 3]);
  await vi.waitFor(
    () => {
      p.step(1000 / 60);
      const pos = p.readPositions();
      expect(pos.get(k)).toEqual([1, 2, 3]);
      expect(pos.get(d)![1]).toBeLessThan(5);
      expect(pos.get(d)![0]).toBeCloseTo(3, 5);
    },
    { timeout: 10_000, interval: 20 },
  );
  p.dispose();
});

test("runtime worker errors surface through onError and lastError", async () => {
  const errs: unknown[] = [];
  const p = new WorkerPhysics({ workerUrl, onError: (e) => errs.push(e) });
  await p.init();
  // bypass main-thread validation so the worker's engine rejects the body
  (p as unknown as { send(m: unknown): void }).send({ t: "add", id: 5, desc: { kind: "dynamic", position: [NaN, 0, 0], radius: 1 } });
  await vi.waitFor(() => expect(p.lastError?.code).toBe("physics-failed"), { timeout: 5000 });
  expect(errs).toHaveLength(1);
  p.dispose();
});
