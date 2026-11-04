import type { PlacementConfig } from "./config";
import { PlaceItError } from "./errors";
import type { BodyId, InputSource, PhysicsWorld, Pose, RenderObject, Renderer, Scheduler, Tracker } from "./interfaces";
import { computePlacements } from "./placement";
import { PoseSmoother, type SmoothingOptions } from "./smoothing";

export interface SessionOptions {
  input: InputSource;
  tracker: Tracker;
  renderer: Renderer;
  physics?: PhysicsWorld;
  scheduler: Scheduler;
  /** One Euro smoothing of poses; on by default, `false` turns it off. */
  smoothing?: SmoothingOptions | false;
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
  private smoother?: PoseSmoother;

  constructor(private o: SessionOptions) {
    if (o.smoothing !== false) this.smoother = new PoseSmoother(o.smoothing);
  }

  /** start() may run before this resolves: the loop draws nothing until every part is ready. */
  async load(modelUrl: string, config: PlacementConfig): Promise<void> {
    await this.o.renderer.init();
    if (this.stopped) return;
    await this.o.renderer.loadModel(modelUrl);
    if (this.stopped) return;
    await this.o.physics?.init();
    if (this.stopped) return;
    // both targets use the face mesh plus pose landmarks
    await this.o.tracker.init(["face", "pose"]);
    if (this.stopped) return;
    this.config = config;
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

  /** For parts that fail on their own thread, such as physics: reports through the `error` event. */
  reportError(e: PlaceItError): void {
    if (!this.stopped) this.emit("error", e);
  }

  private emit(event: string, e = undefined as unknown as PlaceItError) {
    for (const cb of this.listeners.get(event) ?? []) {
      try { cb(e); } catch { /* shortcut: a throwing listener is dropped so it cannot stop tracking; surface it if hosts ask */ }
    }
  }

  private schedule() {
    this.handle = this.o.scheduler.request((now) => void this.tick(now));
  }

  private async tick(now: number) {
    if (!this.running) return;
    const events: ("tracking-lost" | "tracking-found")[] = [];
    try {
      const frame = this.o.scheduler.isHidden() ? undefined : this.o.input.grab();
      if (frame && this.config) {
        const tracked = await this.o.tracker.track(frame);
        if (!this.running) return;
        const placed = computePlacements(this.config, tracked);
        const poses = this.applyPhysics(this.smoother ? this.smoother.smooth(placed, now) : placed, now);
        const visible = poses.some((p) => p.visible);
        if (this.wasVisible && !visible) { this.lost = true; events.push("tracking-lost"); }
        else if (visible && this.lost) { this.lost = false; events.push("tracking-found"); }
        this.wasVisible = visible;
        const objects: RenderObject[] = poses.map((pose, i) => ({
          id: `${this.config!.target}-${i}`, pose, mirrored: i === 1, anchor: this.config!.anchor,
        }));
        this.o.renderer.render(frame, objects);
      }
    } catch (e) {
      if (this.stopped) return;
      this.running = false;
      this.emit("error", e instanceof PlaceItError ? e : new PlaceItError("tracker-failed", String((e as Error)?.message ?? e)));
      return;
    }
    for (const ev of events) this.emit(ev);
    this.schedule();
  }

  private applyPhysics(poses: Pose[], now: number): Pose[] {
    const w = this.o.physics;
    if (!w) return poses;
    poses.forEach((p, i) => {
      if (!p.visible) return; // hidden poses have scale 0, so no valid radius; the body stays where it was
      this.bodies[i] ??= w.addBody({ kind: "kinematic", position: p.position, radius: 0.02 * p.scale });
      w.setKinematicTarget(this.bodies[i]!, p.position);
    });
    w.step(this.lastMs === undefined ? 0 : now - this.lastMs);
    this.lastMs = now;
    const read = w.readPositions();
    return poses.map((p, i) => ({ ...p, position: read.get(this.bodies[i]!) ?? p.position }));
  }
}
