import type { PlacementConfig } from "./config";
import { PlaceItError } from "./errors";
import type { BodyId, InputSource, PhysicsWorld, Pose, RenderObject, Renderer, Scheduler, Tracker } from "./interfaces";
import { computePlacements } from "./placement";

export interface SessionOptions {
  input: InputSource;
  tracker: Tracker;
  renderer: Renderer;
  physics?: PhysicsWorld;
  scheduler: Scheduler;
}

type Listener = (e: PlaceItError) => void;

export class PlaceItSession {
  private config?: PlacementConfig;
  private listeners = new Map<string, Listener[]>();
  private running = false;
  private stopped = false;
  private handle?: number;
  private bodies: BodyId[] = [];
  private lastMs?: number;
  private wasVisible = false;
  private lost = false;

  constructor(private o: SessionOptions) {}

  async load(modelUrl: string, config: PlacementConfig): Promise<void> {
    this.config = config;
    await this.o.renderer.init();
    await this.o.renderer.loadModel(modelUrl);
    await this.o.physics?.init();
    // both targets use the face mesh plus pose landmarks
    await this.o.tracker.init(["face", "pose"]);
  }

  async start(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.o.input.start();
    } catch (e) {
      if (this.stopped) return;
      this.running = false;
      this.emit("error", e instanceof PlaceItError ? e : new PlaceItError("camera-unavailable", String((e as Error)?.message ?? e)));
      return;
    }
    if (this.stopped) { this.o.input.stop(); return; } // stop() ran before the stream existed
    this.schedule();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.running = false;
    if (this.handle !== undefined) this.o.scheduler.cancel(this.handle);
    this.o.input.stop();
    this.o.tracker.dispose();
    this.o.renderer.dispose();
    this.o.physics?.dispose();
  }

  on(event: "error", cb: (e: PlaceItError) => void): void;
  on(event: "tracking-lost" | "tracking-found", cb: () => void): void;
  on(event: string, cb: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), cb]);
  }

  private emit(event: string, e = undefined as unknown as PlaceItError) {
    for (const cb of this.listeners.get(event) ?? []) cb(e);
  }

  private schedule() {
    this.handle = this.o.scheduler.request((now) => void this.tick(now));
  }

  private async tick(now: number) {
    if (!this.running) return;
    try {
      const frame = this.o.scheduler.isHidden() ? undefined : this.o.input.grab();
      if (frame && this.config) {
        const tracked = await this.o.tracker.track(frame);
        if (!this.running) return;
        const poses = this.applyPhysics(computePlacements(this.config, tracked), now);
        const visible = poses.some((p) => p.visible);
        if (this.wasVisible && !visible) { this.lost = true; this.emit("tracking-lost"); }
        else if (visible && this.lost) { this.lost = false; this.emit("tracking-found"); }
        this.wasVisible = visible;
        const objects: RenderObject[] = poses.map((pose, i) => ({
          id: `${this.config!.target}-${i}`, pose, mirrored: i === 1,
        }));
        this.o.renderer.render(frame, objects);
      }
    } catch (e) {
      if (this.stopped) return;
      this.running = false;
      this.emit("error", e instanceof PlaceItError ? e : new PlaceItError("tracker-failed", String((e as Error)?.message ?? e)));
      return;
    }
    this.schedule();
  }

  private applyPhysics(poses: Pose[], now: number): Pose[] {
    const w = this.o.physics;
    if (!w) return poses;
    poses.forEach((p, i) => {
      this.bodies[i] ??= w.addBody({ kind: "kinematic", position: p.position, radius: 0.02 * p.scale });
      w.setKinematicTarget(this.bodies[i]!, p.position);
    });
    w.step(this.lastMs === undefined ? 0 : now - this.lastMs);
    this.lastMs = now;
    const read = w.readPositions();
    return poses.map((p, i) => ({ ...p, position: read.get(this.bodies[i]!) ?? p.position }));
  }
}
