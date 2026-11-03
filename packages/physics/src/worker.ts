/// <reference lib="webworker" />
import { RapierWorld } from "./rapier-world";
import type { FromWorker, ToWorker } from "./protocol";

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
let world: RapierWorld | undefined;
const ids = new Map<number, number>(); // main-thread id -> world id
// messages are handled strictly in order, even while init() is still awaiting the WASM
let queue: Promise<void> = Promise.resolve();

async function handle(m: ToWorker): Promise<void> {
  if (m.t === "init") {
    world = new RapierWorld(m.gravity ? { gravity: m.gravity } : {});
    await world.init();
    return post({ t: "ready" });
  }
  if (!world) return;
  if (m.t === "add") ids.set(m.id, world.addBody(m.desc));
  else if (m.t === "target") {
    const w = ids.get(m.id);
    if (w !== undefined) world.setKinematicTarget(w, m.p);
  } else if (m.t === "step") {
    world.step(m.dtMs);
    const pos = world.readPositions();
    const data = Float64Array.from(
      [...ids].flatMap(([mainId, w]) => {
        const p = pos.get(w);
        return p ? [mainId, ...p] : []; // only bodies that exist, so no slot reads as body 0
      }),
    );
    post({ t: "positions", data }, [data.buffer]);
  } else {
    world.dispose();
    world = undefined;
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  queue = queue.then(() => handle(e.data)).catch((err) => post({ t: "error", message: String(err) }));
};
