import {
  PlaceItError, PlaceItSession, computePlacements,
  type PhysicsWorld, type PlacementConfig, type Pose, type Renderer, type TargetType, type Tracker, type TrackingFrame, type Vec3,
} from "@place-it/core";
import { CameraSource, createScheduler, resolveAssetUrl } from "@place-it/platform-web";
import type { ThreeRenderer } from "@place-it/render";
import { load, workerUrl } from "./load";

export interface PlaceItOptions {
  canvas: HTMLCanvasElement;
  target: TargetType;
  /** Self-hosting: directory holding the MediaPipe WASM files and `physics-worker.js`. Default: MediaPipe from jsDelivr, the worker next to this bundle. */
  baseUrl?: string;
  /** Run the physics engine (in a worker). Default false. */
  physics?: boolean;
  /** URL of `physics-worker.js`; takes precedence over `baseUrl`. */
  workerUrl?: string;
}

/**
 * Wires the selfie camera, MediaPipe tracker, Three.js renderer and optional worker physics into a session.
 * Returns at once: the tracker, renderer and physics code is fetched inside `session.load()`.
 * `start()` may run before `load()` finishes (camera first, models in parallel); nothing is drawn until both are done.
 */
export function createPlaceIt(o: PlaceItOptions): PlaceItSession {
  const camera = new CameraSource();
  let view: ThreeRenderer | undefined;
  const renderer = lazy<Renderer>(async () => (view = new (await load.render()).ThreeRenderer({ canvas: o.canvas, mirrored: camera.mirrored })));
  const tracker = lazy<Tracker>(async () => {
    const t = new (await load.tracking()).MediaPipeTracker({ baseUrl: o.baseUrl });
    return {
      init: (needs) => t.init(needs),
      dispose: () => t.dispose(),
      async track(input) {
        const frame = await t.track(input);
        // The session has no resize or occluder step, so the view is synced here, between tracking and rendering:
        // the renderer stretches the frame over the canvas, so the canvas takes the frame's size.
        if (view) {
          if (o.canvas.width !== input.width || o.canvas.height !== input.height) view.resize(input.width, input.height);
          view.setOccluder(headPose(frame));
        }
        return frame;
      },
    };
  });
  const physics = o.physics
    ? lazy<PhysicsWorld>(async () => new (await load.physics()).WorkerPhysics({
        workerUrl: o.workerUrl ?? (o.baseUrl ? resolveAssetUrl("physics-worker.js", o.baseUrl) : workerUrl()),
      }))
    : undefined;
  const session = new PlaceItSession({ input: camera, tracker, renderer, physics, scheduler: createScheduler() });
  const loadSession = session.load.bind(session);
  session.load = (url, config) =>
    config.target === o.target
      ? loadSession(url, config)
      : Promise.reject(new PlaceItError("config-invalid", `config target "${config.target}" does not match the session target "${o.target}"`));
  return session;
}

const HEAD: PlacementConfig = { version: 1, target: "ear", anchor: [0, 0, 0], mirror: true };

/** Head centre for the occluder: midway between the two ear points, with their rotation and scale; undefined when either is hidden. */
function headPose(frame: TrackingFrame): Pose | undefined {
  const [a, b] = computePlacements(HEAD, frame);
  if (!a?.visible || !b?.visible) return undefined;
  return { ...a, position: a.position.map((v, i) => (v + b.position[i]!) / 2) as Vec3 };
}

type Part = { init(...args: never[]): Promise<void>; dispose(): void };

/** Stand-in that builds the real part (fetching its module) inside init(); every other call is forwarded once it exists. */
function lazy<T extends Part>(make: () => Promise<T>): T {
  let real: T | undefined;
  let disposed = false;
  const own: Part = {
    async init(...args) {
      const r = real ?? (await make());
      if (disposed) return r.dispose(); // stop() ran while the module was loading
      real = r;
      await Reflect.apply(r.init, r, args);
    },
    dispose() {
      disposed = true;
      real?.dispose();
    },
  };
  return new Proxy(own, {
    get: (target, key) =>
      key in target
        ? target[key as keyof Part]
        : (...args: unknown[]) => {
            if (!real) throw new Error(`${String(key)}() called before init()`);
            return Reflect.apply(real[key as keyof T] as (...a: unknown[]) => unknown, real, args);
          },
  }) as T;
}
