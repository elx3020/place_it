# @place-it/physics

`RapierWorld` runs Rapier directly (Node, tests, inside the worker). `WorkerPhysics` is the main-thread `PhysicsWorld` proxy that talks to `dist/worker.js` (self-contained: Rapier and its base64 WASM are bundled, so there is no separate `.wasm` fetch).

```ts
import { WorkerPhysics } from "@place-it/physics";
const physics = new WorkerPhysics({ workerUrl: new URL("@place-it/physics/worker", import.meta.url).href });
await physics.init(); // rejects with PlaceItError "physics-failed" if the worker fails
```

Umbrella package: copy/serve `@place-it/physics/dist/worker.js` next to the CDN bundle and default `workerUrl` to `resolveAssetUrl("worker.js")` (or a `new URL("./worker.js", import.meta.url)` relative to the built file). Script-tag users pass `workerUrl` explicitly. The worker is loaded with `{ type: "module" }`.
