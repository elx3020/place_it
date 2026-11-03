import { PlaceItError, type BodyDesc, type BodyId, type PhysicsWorld, type Vec3 } from "@place-it/core";
import { createWorker } from "@place-it/platform-web";
import { assertBodyDesc } from "./validate";
import type { FromWorker, ToWorker } from "./protocol";

export interface WorkerPhysicsOptions {
  /** URL of the built `worker.js` (see README). */
  workerUrl: string;
  gravity?: Vec3;
  /** Called for worker errors after init has settled (and for load errors). */
  onError?: (e: PlaceItError) => void;
}

export class WorkerPhysics implements PhysicsWorld {
  private worker?: Worker;
  private nextId = 0;
  private latest = new Map<BodyId, Vec3>();
  private fail?: (e: PlaceItError) => void;
  private _lastError?: PlaceItError;

  get lastError(): PlaceItError | undefined {
    return this._lastError;
  }

  constructor(private o: WorkerPhysicsOptions) {}

  init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.worker) return reject(new PlaceItError("physics-failed", "WorkerPhysics already initialised"));
      let w: Worker;
      try {
        w = this.worker = createWorker(this.o.workerUrl);
      } catch (e) {
        return reject(new PlaceItError("physics-failed", `cannot start physics worker: ${(e as Error)?.message ?? e}`));
      }
      this.fail = reject;
      const err = (msg: string) => {
        const e = new PlaceItError("physics-failed", msg);
        this._lastError = e;
        reject(e); // no-op once init has settled
        this.o.onError?.(e);
      };
      w.onerror = (e) => err(e.message || "physics worker failed to load");
      w.onmessageerror = () => err("physics worker message could not be deserialised");
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.t === "ready") resolve();
        else if (m.t === "error") err(m.message);
        else {
          const next = new Map<BodyId, Vec3>();
          for (let i = 0; i + 3 < m.data.length; i += 4) next.set(m.data[i]!, [m.data[i + 1]!, m.data[i + 2]!, m.data[i + 3]!]);
          this.latest = next;
        }
      };
      this.send({ t: "init", gravity: this.o.gravity });
    });
  }

  addBody(desc: BodyDesc): BodyId {
    assertBodyDesc(desc);
    const id = this.nextId++;
    this.send({ t: "add", id, desc });
    this.latest.set(id, [...desc.position]);
    return id;
  }

  setKinematicTarget(id: BodyId, p: Vec3): void {
    if (p.every(Number.isFinite)) this.send({ t: "target", id, p });
  }

  step(dtMs: number): void {
    if (Number.isFinite(dtMs)) this.send({ t: "step", dtMs });
  }

  readPositions(): Map<BodyId, Vec3> {
    return this.latest;
  }

  dispose(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = undefined;
    this.fail?.(new PlaceItError("physics-failed", "disposed")); // no-op if init already settled
  }

  private send(m: ToWorker): void {
    this.worker?.postMessage(m);
  }
}
