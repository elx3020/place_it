# @place-it/physics

`RapierWorld` (import from `@place-it/physics/rapier`, kept out of the main entry because it pulls the WASM) runs Rapier directly (Node, tests, inside the worker). `WorkerPhysics` is the main-thread `PhysicsWorld` proxy that talks to `dist/worker.js` (self-contained: Rapier and its base64 WASM are bundled, so there is no separate `.wasm` fetch).

```ts
import { WorkerPhysics } from "@place-it/physics";
import workerUrl from "@place-it/physics/worker?url"; // Vite; other bundlers: any URL to dist/worker.js
const physics = new WorkerPhysics({ workerUrl });
await physics.init(); // rejects with PlaceItError "physics-failed" if the worker fails
```

The `place-it` umbrella ships this file as `dist/physics-worker.js` and defaults `workerUrl` to it, next to its bundle (or under its `baseUrl`). The worker is loaded with `{ type: "module" }`.
