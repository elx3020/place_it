import RAPIER from "@dimforge/rapier3d-compat";
import type { BodyDesc, BodyId, PhysicsWorld, Vec3 } from "@place-it/core";

const STEP = 1 / 60;
const MAX_DT_MS = 100;
const finite = (v: Vec3): boolean => v.every(Number.isFinite);

export class RapierWorld implements PhysicsWorld {
  private world?: RAPIER.World;
  private bodies = new Map<BodyId, RAPIER.RigidBody>();
  private next = 0;
  private acc = 0;
  private readonly gravity: Vec3;

  constructor(opts: { gravity?: Vec3 } = {}) {
    this.gravity = opts.gravity ?? [0, -9.81, 0];
  }

  async init(): Promise<void> {
    await RAPIER.init(); // -compat: WASM is embedded, but must be instantiated first
    const [x, y, z] = this.gravity;
    this.world = new RAPIER.World({ x, y, z });
    this.world.timestep = STEP;
  }

  addBody(desc: BodyDesc): BodyId {
    const w = this.world;
    if (!w) throw new Error("RapierWorld: call init() first");
    const [x, y, z] = desc.position;
    const bd = desc.kind === "dynamic" ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.kinematicPositionBased();
    const body = w.createRigidBody(bd.setTranslation(x, y, z));
    w.createCollider(RAPIER.ColliderDesc.ball(desc.radius), body);
    const id = this.next++;
    this.bodies.set(id, body);
    return id;
  }

  setKinematicTarget(id: BodyId, p: Vec3): void {
    const body = this.bodies.get(id);
    if (!body || !finite(p) || !body.isKinematic()) return;
    body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
  }

  step(dtMs: number): void {
    if (!this.world || !Number.isFinite(dtMs) || dtMs <= 0) return;
    this.acc += Math.min(dtMs, MAX_DT_MS) / 1000;
    while (this.acc >= STEP - 1e-9) {
      this.world.step();
      this.acc -= STEP;
    }
    if (this.acc < 0) this.acc = 0;
  }

  readPositions(): Map<BodyId, Vec3> {
    const out = new Map<BodyId, Vec3>();
    for (const [id, b] of this.bodies) {
      const t = b.translation();
      out.set(id, [t.x, t.y, t.z]);
    }
    return out;
  }

  dispose(): void {
    this.world?.free();
    this.world = undefined;
    this.bodies.clear();
  }
}
