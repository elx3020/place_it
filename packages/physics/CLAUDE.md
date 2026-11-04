# @place-it/physics

Rapier physics in a Web Worker behind the core `PhysicsWorld` interface. Root rules in `../../CLAUDE.md` apply.

## Entry points (keep them separate)

| Export | File | Notes |
| --- | --- | --- |
| `.` | `src/index.ts` | `WorkerPhysics` only (main-thread proxy). 5 KB gzip budget. Must not pull in Rapier. |
| `./rapier` | `src/rapier-entry.ts` | `RapierWorld`, the in-thread implementation. |
| `./worker` | `src/worker.ts` | Worker bundle with Rapier WASM. Lazy, large (2 MB gzip budget). |

## Layout

- `src/protocol.ts`: `ToWorker` / `FromWorker` message types shared by both sides.
- `src/validate.ts`: `assertBodyDesc`; validate every message from untrusted input at the boundary.
- `src/rapier-world.ts`: `RapierWorld`; `src/worker-physics.ts`: `WorkerPhysics`.

## Rules

- Depends on `core`, `platform-web` (`createWorker`), and `@dimforge/rapier3d-compat` (pinned 0.21.0). Must not import `tracking` or `render`.
- Errors surface as `PlaceItError` (`physics-failed`), via `onError`/`lastError`, not thrown across the worker boundary.
- Changing the protocol means updating both `worker.ts` and `worker-physics.ts`.
- The cross-origin worker shim has unit tests only.

## Tests

- `pnpm --filter @place-it/physics test` (Node); `test:browser` runs `worker.browser.test.ts` in Chromium.
