# place_it

General-purpose library that places 3D objects (GLB) on tracked targets from webcam, video or image input. First use case: ear (earrings) and neck (necklaces) try-on for ecommerce. MIT licensed; dependencies must be permissive (MIT/Apache/BSD), never copyleft. Design: `docs/superpowers/specs/2026-11-03-place-it-widget-design.md`.

## Commands (pnpm 12 workspace, run from the root)

- `pnpm install --frozen-lockfile`
- `pnpm build` must run **before** `pnpm typecheck` (packages resolve each other's `dist`).
- `pnpm test` runs Node unit tests; `pnpm --filter <pkg> test:browser` runs Vitest browser tests (Playwright, needs network + Chromium).
- `pnpm size` (size-limit per package), `pnpm check:ci` (validates workflows and path filters).
- No lint, by decision.

## Architecture

| Package | Role |
| --- | --- |
| `packages/core` | Interfaces (InputSource, Tracker, Renderer, RenderPass, PhysicsWorld, Scheduler), config schema, placement math, `PlaceItSession`. **No DOM lib, no browser APIs.** Test doubles in `@place-it/core/testing`. |
| `packages/platform-web` | Every browser API (camera, image/video sources, scheduler, asset URLs, workers). |
| `packages/tracking` | `MediaPipeTracker` behind the `Tracker` interface. |
| `packages/render` | Three.js `WebGPURenderer` (WebGL 2 fallback), `PassPipeline` for future lighting passes. |
| `packages/physics` | Rapier in a Web Worker. `WorkerPhysics` on the main entry; `RapierWorld` only via `/rapier`; worker via `/worker` (lazy, large). |
| `packages/place-it` | Umbrella `createPlaceIt(...)` and the IIFE CDN bundle `PlaceIt` (lazy chunks). |
| `apps/demo-*` | One small demo per area plus the combined try-on demo. |

## Rules

- Tracking, render and physics **never import each other**; they talk through core interfaces. Area packages may depend on `core` and `platform-web` only.
- No browser APIs in `core`. iOS Safari is mandatory, so keep WebKit working.
- Placement: `Pose.position` is normalized image coordinates; `Pose.scale` is a ratio (apparent width / reference width: 0.14 m face, 0.38 m shoulders), not meters.
- Config is JSON `{version: 1, target: 'ear'|'neck', anchor, scale?, mirror?}`; `anchor` is a point in model space (meters) that is placed on the tracked landmark.
- Models: glTF conventions (meters, Y-up, +Z front).
- Video never leaves the device. Default MediaPipe model URLs are Google storage (no video sent); assets default to jsDelivr `place-it@<version>/assets/`.
- TypeScript is pinned to ^6 (tsup's dts build needs the compiler API missing in TS 7).
- Keep the main bundle small; heavy things (Rapier WASM, models) load lazily. Size budgets live in each package's `size-limit`.

## Tests

- Unit tests use the fakes in `core/testing`; no real browser needed.
- Tracking clip test: `packages/tracking/test/clips.browser.test.ts` reads `packages/tracking/fixtures/` (Git LFS). Clip format and `labels.json` are described in `fixtures/README.md`; the test skips until clips and labels exist.
- Render screenshot baselines: generate WebKit ones via the CI `update-screenshots` dispatch.

## CI/CD

`.github/workflows/ci.yml` is path-filtered per area (`.github/path-filters.yml`); `release.yml` publishes to npm; `pages.yml` deploys demos. See `docs/RELEASING.md`. Npm name `place-it` must be verified before the first publish.

## Open caveats

WebGPU path and WebKit never ran locally; the anchor offset, the cross-origin worker shim and the multi-person pose pick have unit tests only (no browser run); deferred review minors are in `.superpowers/sdd/2026-11-03-place-it-scaffold/progress.md` (git-ignored).
