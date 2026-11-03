import type {
  BodyDesc, BodyId, FrameInput, InputSource, PhysicsWorld, RenderObject, RenderPass,
  Renderer, Scheduler, Tracker, TrackerNeed, TrackingFrame,
} from "../interfaces";
import type { Vec3 } from "../config";

export class FakeTracker implements Tracker {
  needs: TrackerNeed[] = [];
  private i = 0;
  constructor(private frames: TrackingFrame[]) {}
  async init(needs: TrackerNeed[]) { this.needs = needs; }
  async track(_frame: FrameInput): Promise<TrackingFrame> {
    const f = this.frames[Math.min(this.i, this.frames.length - 1)]!;
    this.i++;
    return f;
  }
  dispose() {}
}

export class FakeInputSource implements InputSource {
  private i = 0;
  constructor(private frames: FrameInput[] = []) {}
  async start() {}
  stop() {}
  grab(): FrameInput | undefined { return this.frames[Math.min(this.i++, this.frames.length - 1)]; }
}

export class FakeRenderer implements Renderer {
  renders: { input: FrameInput; objects: RenderObject[] }[] = [];
  passes: RenderPass[] = [];
  size = { width: 0, height: 0 };
  async init() {}
  async loadModel(url: string) { return `model:${url}`; }
  render(input: FrameInput, objects: RenderObject[]) { this.renders.push({ input, objects }); }
  addPass(pass: RenderPass) { this.passes.push(pass); }
  resize(width: number, height: number) { this.size = { width, height }; }
  dispose() {}
}

export class FakePhysics implements PhysicsWorld {
  private bodies = new Map<BodyId, Vec3>();
  private next = 0;
  async init() {}
  addBody(desc: BodyDesc): BodyId { const id = this.next++; this.bodies.set(id, [...desc.position]); return id; }
  setKinematicTarget(id: BodyId, position: Vec3) { this.bodies.set(id, [...position]); }
  step(_dtMs: number) {}
  readPositions() { return new Map(this.bodies); }
  dispose() {}
}

/** Manually advanced: tick(now) runs and clears the callbacks pending at call time. */
export class FakeScheduler implements Scheduler {
  hidden = false;
  private pending = new Map<number, (nowMs: number) => void>();
  private next = 1;
  request(cb: (nowMs: number) => void) { const h = this.next++; this.pending.set(h, cb); return h; }
  cancel(handle: number) { this.pending.delete(handle); }
  isHidden() { return this.hidden; }
  tick(nowMs: number) {
    const cbs = [...this.pending.values()];
    this.pending.clear();
    for (const cb of cbs) cb(nowMs);
  }
}
