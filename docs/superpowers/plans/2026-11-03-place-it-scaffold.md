# place_it Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `place_it` monorepo: a shared core plus tracking, rendering, and physics packages, each with a minimal working implementation, tests, a CI job, and a small demo, plus a combined ear/neck try-on demo and a CDN release pipeline.

**Architecture:** `core` defines config, placement math, and the interfaces (InputSource, Tracker, Renderer, RenderPass, PhysicsWorld, Platform) with no browser APIs. `platform-web` holds every browser API behind those interfaces. `tracking`, `render`, and `physics` implement one interface each and never import each other; a `PlaceItSession` in core wires them together. A `place-it` umbrella package builds the single-script-tag bundle.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest (Node unit tests; browser mode with Playwright for browser tests), Vite (demos, IIFE bundle), tsup (package builds), size-limit (bundle budgets), MediaPipe Tasks Vision (`@mediapipe/tasks-vision`, Apache 2.0), Three.js WebGPU renderer (`three/webgpu`, MIT), Rapier (`@dimforge/rapier3d-compat`, Apache 2.0), GitHub Actions. Use the latest stable versions at install time and let the lockfile pin them.

**Spec:** `docs/superpowers/specs/2026-11-03-place-it-widget-design.md`

## Global Constraints

- License MIT; dependencies only MIT, Apache 2.0, or BSD; no copyleft.
- Browsers: Chrome (desktop and Android), Safari including iOS (mandatory), Firefox, Edge.
- All browser APIs live only in `packages/platform-web` (and demo apps); `core`, `tracking` logic, placement, and orchestration run in plain Node tests.
- `tracking`, `render`, `physics` must not import each other; they depend only on `core`.
- Public API contains no MediaPipe, Three.js, or jewelry-specific types or names.
- v1 targets: `ear` and `neck` only. Config has integer `version` (currently `1`), `target`, `anchor`, optional `scale` (default 1) and `mirror`.
- Models are GLB following glTF convention (meters, Y-up, +Z front).
- Tracking, physics engine, and models load lazily; MediaPipe and physics WASM load from a configurable base URL defaulting to a version-pinned jsDelivr path.
- Budgets: core under 150 KB gzipped excluding engine and model assets; CI fails when exceeded. Target 24+ fps on a mid-range phone.
- No video leaves the device.
- CI: type-check, unit tests, build, bundle-size check, area-specific tests. **No lint.**
- CD: publish to npm on release; public CDN (jsDelivr/unpkg) serves it. Global name `PlaceIt`.
- Camera denied or missing emits an error event; no still-photo fallback (image and video-file inputs exist).

## Review Focus

1. Camera permission denied or no camera: `error` event with a typed code, no thrown exception, no camera held open (Task 5, Task 6).
2. Tracking drops out (no face, NaN or missing landmarks, frames arriving late): objects hide or hold last pose, a `tracking-lost` event fires once, no NaN reaches the renderer or physics (Task 4, Task 5).
3. More than one face or hand-like detection in frame: the largest face is tracked, deterministically (Task 4).
4. Malformed or future-version config, or a GLB with zero-size or absurdly scaled geometry: typed validation error or clamped scale, never a crash or an invisible/huge object (Task 2, Task 8).
5. Teardown, tab hidden, canvas resize or phone rotation: `stop()` releases camera, worker, and GPU resources; hidden tab pauses the loop; resize keeps the mirrored image aligned (Task 5, Task 6, Task 8).

---

### Task 1: Workspace scaffold and base CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `.gitattributes` (LFS for `fixtures/**/*.mp4`), `.gitignore`, `LICENSE` (MIT), `README.md`
- Create: `packages/core/{package.json,tsconfig.json,tsup.config.ts,src/index.ts}`, `packages/core/test/smoke.test.ts`
- Create: `.github/workflows/ci.yml`
- Commit: the existing `docs/` folder with this task.

**Interfaces:**
- Produces: root scripts `typecheck`, `test`, `build`, `size` (each runs across workspaces via `pnpm -r`); package scope `@place-it/*`; `core` exports `VERSION: string`.

- [ ] **Step 1: Write failing test** `packages/core/test/smoke.test.ts` asserting `VERSION` is a non-empty string imported from `../src`.
- [ ] **Step 2: Run** `pnpm --filter @place-it/core test`. Expected: FAIL (module missing).
- [ ] **Step 3: Create the workspace files above and `export const VERSION: string` in `packages/core/src/index.ts`.** Strict TypeScript, ES2022, ESM output with `.d.ts`; core `tsconfig` must not include the DOM lib (enforces the no-browser-API rule).
- [ ] **Step 4: Run** `pnpm install && pnpm typecheck && pnpm test && pnpm build`. Expected: all pass.
- [ ] **Step 5: Write `.github/workflows/ci.yml`:** on push and PR; job `core` runs install (cached), typecheck, test, build, size. Checkout with `lfs: true`.
- [ ] **Step 6: Commit** `chore: scaffold pnpm workspace with core package and CI`.

---

### Task 2: Config schema and validation

**Files:**
- Create: `packages/core/src/config.ts`, `packages/core/test/config.test.ts`; export from `index.ts`.

**Interfaces:**
- Produces:
  - `type Vec3 = [number, number, number]`
  - `type TargetType = 'ear' | 'neck'`
  - `interface PlacementConfig { version: 1; target: TargetType; anchor: Vec3; scale?: number; mirror?: boolean }`
  - `class PlaceItError extends Error { code: ErrorCode }` with `type ErrorCode = 'config-invalid' | 'config-version' | 'camera-denied' | 'camera-unavailable' | 'model-invalid' | 'tracker-failed'` (defined in `packages/core/src/errors.ts`)
  - `parseConfig(input: unknown): PlacementConfig` (throws `PlaceItError`), `serializeConfig(c: PlacementConfig): string`

- [ ] **Step 1: Write failing tests:** valid ear config round-trips through `serializeConfig`/`parseConfig` and `scale` defaults to 1 and `mirror` to false for `ear` only; `version: 2` throws code `config-version`; unknown `target` `'wrist'`, non-finite anchor values (`NaN`, `Infinity`), `scale <= 0`, and non-object input each throw `config-invalid`.
- [ ] **Step 2: Run** `pnpm --filter @place-it/core test config`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseConfig`, `serializeConfig`, and `PlaceItError` with hand-written validation (no schema library).
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): placement config schema and validation`.

---

### Task 3: Core interfaces and test doubles

**Files:**
- Create: `packages/core/src/interfaces.ts`, `packages/core/src/testing/fakes.ts` (exported as `@place-it/core/testing`), `packages/core/test/fakes.test.ts`

**Interfaces:**
- Produces (all in `interfaces.ts`; no DOM types):
  - `interface Landmark { x: number; y: number; z: number }` (normalized image coordinates, z relative depth)
  - `interface FrameInput { handle: unknown; width: number; height: number; timestampMs: number }`
  - `interface TrackingFrame { timestampMs: number; imageSize: { width: number; height: number }; faces: Landmark[][]; faceMatrices: (number[] | undefined)[]; pose?: Landmark[] }` (`faceMatrices[i]` is the 4x4 column-major head transform for `faces[i]`)
  - `type TrackerNeed = 'face' | 'pose'`
  - `interface Tracker { init(needs: TrackerNeed[]): Promise<void>; track(frame: FrameInput): Promise<TrackingFrame>; dispose(): void }`
  - `interface InputSource { start(): Promise<void>; stop(): void; grab(): FrameInput | undefined }`
  - `interface Pose { position: Vec3; rotation: [number, number, number, number]; scale: number; visible: boolean }`
  - `interface RenderObject { id: string; pose: Pose; mirrored: boolean }`
  - `interface PassContext { input: FrameInput; rendered: unknown; objects: { id: string; pose: Pose; bounds: Vec3; material: string }[] }`
  - `interface RenderPass { name: string; apply(ctx: PassContext): void }`
  - `interface Renderer { init(): Promise<void>; loadModel(url: string): Promise<string>; render(input: FrameInput, objects: RenderObject[]): void; addPass(pass: RenderPass): void; resize(width: number, height: number): void; dispose(): void }` (`loadModel` returns a model id)
  - `type BodyId = number`; `interface BodyDesc { kind: 'dynamic' | 'kinematic'; position: Vec3; radius: number }`
  - `interface PhysicsWorld { init(): Promise<void>; addBody(desc: BodyDesc): BodyId; setKinematicTarget(id: BodyId, position: Vec3): void; step(dtMs: number): void; readPositions(): Map<BodyId, Vec3>; dispose(): void }`
  - Fakes: `FakeTracker` (constructor takes `TrackingFrame[]`, replays them), `FakeInputSource`, `FakeRenderer` (records `render` calls), `FakePhysics`.

- [ ] **Step 1: Write failing test:** `FakeTracker` replays scripted frames in order and repeats the last; `FakeRenderer` records objects passed to `render`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the interfaces and fakes.**
- [ ] **Step 4: Run tests and `pnpm typecheck`. Expected: PASS.**
- [ ] **Step 5: Commit** `feat(core): area interfaces and test doubles`.

---

### Task 4: Placement math

**Files:**
- Create: `packages/core/src/placement.ts`, `packages/core/test/placement.test.ts`

**Interfaces:**
- Consumes: `PlacementConfig`, `TrackingFrame`, `Pose` (Tasks 2–3).
- Produces: `computePlacements(config: PlacementConfig, frame: TrackingFrame): Pose[]`. Returns one pose for `neck`; for `ear` returns one pose, or two (left, right) when `config.mirror` is true. Poses carry `visible: false` when the needed landmarks are missing or non-finite. Uses real-world scale: face width (landmarks for the left/right cheek extremes, MediaPipe face mesh indices 234 and 454) mapped to an assumed 0.14 m; neck width from pose shoulders (pose indices 11 and 12) mapped to an assumed 0.38 m. Ear position from face mesh ear-side points (234 left, 454 right) combined with pose ears (indices 7, 8) and the head matrix for rotation; neck position from chin (face mesh index 152) and the shoulder midpoint.

- [ ] **Step 1: Write failing tests** with scripted landmarks: (a) ear config, frame with one face → one pose at the expected position, `visible: true`, scale equals `config.scale * faceWidthMeters / modelBaseWidth`; (b) `mirror: true` → two poses, x positions mirrored about the face center; (c) frame with `faces: []` → every pose `visible: false`, no `NaN` in any field; (d) frame with a `NaN` landmark → `visible: false`; (e) two faces of different widths → the pose follows the larger face, deterministic across repeated calls; (f) neck config without `pose` landmarks → `visible: false`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `computePlacements`** with a small registry `const targets: Record<TargetType, TargetPlacer>` so new targets are added by registering a function, not editing a switch.
- [ ] **Step 4: Run tests. Expected: PASS.**
- [ ] **Step 5: Commit** `feat(core): ear and neck placement math`.

---

### Task 5: PlaceItSession orchestrator

**Files:**
- Create: `packages/core/src/session.ts`, `packages/core/test/session.test.ts`

**Interfaces:**
- Consumes: all Task 2–4 types and fakes.
- Produces:
  - `interface SessionOptions { input: InputSource; tracker: Tracker; renderer: Renderer; physics?: PhysicsWorld; scheduler: Scheduler }`
  - `interface Scheduler { request(cb: (nowMs: number) => void): number; cancel(handle: number): void; isHidden(): boolean }` (supplied by platform-web; fake in tests)
  - `class PlaceItSession { constructor(opts: SessionOptions); load(modelUrl: string, config: PlacementConfig): Promise<void>; start(): Promise<void>; stop(): void; on(event: 'error', cb: (e: PlaceItError) => void): void; on(event: 'tracking-lost' | 'tracking-found', cb: () => void): void }`
  - Loop per animation frame: `input.grab()` → `tracker.track()` → `computePlacements()` → (if physics present, feed poses as kinematic targets and read back) → `renderer.render()`. `tracker.init` receives needs derived from the config target (`ear`: face and pose; `neck`: face and pose).

- [ ] **Step 1: Write failing tests** (with fakes): (a) `start()` when `input.start()` rejects with `PlaceItError('camera-denied')` emits `error` with that code, does not throw, and calls no `track`; (b) frames with faces then a frame without → `tracking-lost` fires exactly once, then `tracking-found` once when the face returns; (c) renderer never receives a pose containing `NaN`; (d) `isHidden()` true → loop does not call `track`; (e) `stop()` calls `input.stop`, `tracker.dispose`, `renderer.dispose`, `physics.dispose`, and cancels the scheduler handle; calling `stop()` twice is safe; (f) a thrown tracker error becomes an `error` event with code `tracker-failed` and the loop stops.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `PlaceItSession`.**
- [ ] **Step 4: Run tests. Expected: PASS.**
- [ ] **Step 5: Commit** `feat(core): session orchestrator with lifecycle and events`.

---

### Task 6: platform-web adapters

**Files:**
- Create: `packages/platform-web/{package.json,tsconfig.json,tsup.config.ts}`, `src/camera.ts`, `src/media.ts`, `src/scheduler.ts`, `src/assets.ts`, `src/index.ts`; tests in `test/*.test.ts`.

**Interfaces:**
- Consumes: `InputSource`, `Scheduler`, `PlaceItError` from core.
- Produces:
  - `class CameraSource implements InputSource { constructor(opts?: { facingMode?: 'user' | 'environment'; mirrored?: boolean }); readonly video: HTMLVideoElement }` — requests the stream with `playsInline`, `muted`, and `autoplay` set (iOS Safari requirement); maps `NotAllowedError` to `camera-denied` and `NotFoundError`/`OverconstrainedError` to `camera-unavailable`; `stop()` stops every track.
  - `class ImageSource implements InputSource` (from `HTMLImageElement | ImageBitmap`), `class VideoFileSource implements InputSource` (from a URL).
  - `createScheduler(): Scheduler` (uses `requestAnimationFrame` and `document.hidden`).
  - `resolveAssetUrl(path: string, baseUrl?: string): string` with default base `https://cdn.jsdelivr.net/npm/@place-it/assets@<package version>/` (pin from package version), and `createWorker(url: string): Worker`.

- [ ] **Step 1: Write failing tests** (Vitest with `happy-dom`/stubs for `navigator.mediaDevices`): permission denied → rejects with `PlaceItError` code `camera-denied`; no device → `camera-unavailable`; `stop()` calls `stop` on every track and is idempotent; the video element gets `playsinline`, `muted`, `autoplay`; `resolveAssetUrl` uses the default pinned base unless overridden and never produces a double slash.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the adapters.** `grab()` returns `{ handle: video, width: video.videoWidth, height: video.videoHeight, timestampMs: performance.now() }`, or `undefined` while `readyState < 2`.
- [ ] **Step 4: Run tests. Expected: PASS.**
- [ ] **Step 5: Add a CI job `platform-web`** (typecheck, test, build) to `ci.yml`.
- [ ] **Step 6: Commit** `feat(platform-web): camera, media, scheduler, and asset adapters`.

---

### Task 7: Tracking package, clip tests, and demo

**Files:**
- Create: `packages/tracking/{package.json,tsconfig.json,tsup.config.ts}`, `src/mediapipe-tracker.ts`, `src/index.ts`, `test/mediapipe-tracker.unit.test.ts` (Node, mocked MediaPipe), `test/clips.browser.test.ts` (Vitest browser mode, Chromium), `fixtures/README.md` (required clip list and recording guidelines, LFS), `apps/demo-tracking/{index.html,main.ts,package.json}`

**Interfaces:**
- Consumes: `Tracker`, `TrackerNeed`, `TrackingFrame`, `FrameInput`, `resolveAssetUrl`.
- Produces: `class MediaPipeTracker implements Tracker { constructor(opts?: { baseUrl?: string; maxFaces?: number }) }`. `init(needs)` loads only the requested tasks (`face` → Face Landmarker with facial transformation matrixes enabled; `pose` → Pose Landmarker, lite model) and loads WASM from `resolveAssetUrl`. Calling `track` before `init` rejects with `tracker-failed`.

- [ ] **Step 1: Write failing unit tests** with the MediaPipe module mocked: `init(['face'])` creates only the face task; `init(['face','pose'])` creates both; `track` maps MediaPipe results to `TrackingFrame` (faces, matrices, pose); `track` before `init` rejects; task creation failure rejects with `tracker-failed`; `dispose` closes created tasks.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `MediaPipeTracker`.**
- [ ] **Step 4: Run unit tests. Expected: PASS.**
- [ ] **Step 5: Write the clip test** over fixtures in `packages/tracking/fixtures/` (owner supplies: `face-front.mp4`, `face-turn.mp4`, `neck-shoulders.mp4`, plus `labels.json` with hand-labelled frames). Assertions: face detected in ≥95% of frames of `face-front.mp4`; labelled landmarks within a tolerance stored in `labels.json`; regression snapshot of placement output from `computePlacements`. The test skips with an explicit message when the fixtures folder is empty, so scaffolding can merge before clips exist.
- [ ] **Step 6: Build `apps/demo-tracking`:** webcam via `CameraSource`, draw tracked landmarks on a canvas overlay; one HTML file and one TS file.
- [ ] **Step 7: Add CI job `tracking`** (path filter `packages/tracking/**`, `packages/core/**`): unit tests, Playwright Chromium install, clip tests, build, size.
- [ ] **Step 8: Commit** `feat(tracking): MediaPipe tracker, clip tests, and demo`.

---

### Task 8: Render package, pass layer, and demo

**Files:**
- Create: `packages/render/{package.json,tsconfig.json,tsup.config.ts}`, `src/three-renderer.ts`, `src/occluder.ts`, `src/passes.ts`, `src/index.ts`; `test/passes.test.ts` (Node), `test/render.browser.test.ts` (Playwright Chromium and WebKit, screenshot), `apps/demo-render/{index.html,main.ts,package.json}`

**Interfaces:**
- Consumes: `Renderer`, `RenderPass`, `PassContext`, `RenderObject`, `Pose`, `PlaceItError`.
- Produces: `class ThreeRenderer implements Renderer { constructor(opts: { canvas: HTMLCanvasElement; mirrored?: boolean }) }`. Uses `WebGPURenderer` from `three/webgpu`, which falls back to WebGL 2 where WebGPU is missing. `loadModel` loads a GLB with `GLTFLoader`, normalizes by bounding box: zero-size bounds reject with `model-invalid`; absurd sizes (bounding box diagonal outside 0.001–10 m) are clamped and a warning is emitted. Draws the input frame as a background, a head-proxy occluder (depth-only mesh placed from the face matrix) for ears and neck, and the objects at their poses (mirrored objects flipped on x). `src/passes.ts` exports `PassPipeline` with `add(pass)` and `run(ctx)` that applies passes in insertion order, and an example no-op `IdentityPass`.

- [ ] **Step 1: Write failing tests (Node):** `PassPipeline` runs passes in insertion order and passes each the same `PassContext`; a throwing pass is caught, reported through an `onError` callback, and does not stop later passes.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `PassPipeline`, then `ThreeRenderer`** wired to call `PassPipeline.run` after drawing.
- [ ] **Step 4: Run Node tests. Expected: PASS.**
- [ ] **Step 5: Write the browser test:** load a small checked-in GLB fixture (a simple sphere, `fixtures/sphere.glb`), render at a fixed pose over a fixed still image, and compare a screenshot against a stored baseline (tolerance set in the test); also assert a zero-size GLB fixture (`fixtures/empty.glb`) rejects with `model-invalid`, and that `resize(w, h)` followed by render keeps the object's screen position proportional (assert pixel centroid within tolerance on a portrait and a landscape size).
- [ ] **Step 6: Build `apps/demo-render`:** loads a GLB at a fixed pose over a static image, with a checkbox that toggles an example pass (e.g. a tint) to prove the pass layer works.
- [ ] **Step 7: Add CI job `render`:** unit tests, Playwright with Chromium and WebKit, screenshot comparison, build, size. Upload screenshot diffs as artifacts on failure.
- [ ] **Step 8: Commit** `feat(render): Three.js WebGPU renderer with pass pipeline and demo`.

---

### Task 9: Physics package, worker, and demo

**Files:**
- Create: `packages/physics/{package.json,tsconfig.json,tsup.config.ts}`, `src/rapier-world.ts` (engine, runs anywhere), `src/worker.ts` (worker entry), `src/worker-physics.ts` (main-thread proxy), `src/index.ts`; `test/rapier-world.test.ts` (Node), `test/worker.browser.test.ts` (Chromium and WebKit), `apps/demo-physics/{index.html,main.ts,package.json}`

**Interfaces:**
- Consumes: `PhysicsWorld`, `BodyDesc`, `BodyId`, `Vec3`, `createWorker`, `resolveAssetUrl`.
- Produces: `class RapierWorld implements PhysicsWorld` (runs the engine directly, used inside the worker and in Node tests; fixed timestep 1/60 s with an accumulator, gravity `[0, -9.81, 0]`); `class WorkerPhysics implements PhysicsWorld` (same interface, posts messages to the worker; `readPositions()` returns the latest snapshot received, never blocking). `step(dtMs)` is non-blocking on the worker side.

- [ ] **Step 1: Write failing Node tests for `RapierWorld`:** a dynamic body with no support falls (y decreases after 60 steps); a kinematic body moves to each position given by `setKinematicTarget` after one `step`, and a dynamic body does not move when no force or gravity acts on it (test with gravity zeroed through the constructor option `gravity?: Vec3`); identical inputs run twice produce identical positions (determinism); `NaN` in `setKinematicTarget` is ignored and does not corrupt state; `dispose` is safe to call twice.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `RapierWorld`.** The minimal scene is exactly the Task 9 tests: dynamic and kinematic spheres. Hinges and chains are future work.
- [ ] **Step 4: Run Node tests. Expected: PASS.**
- [ ] **Step 5: Implement `worker.ts` and `WorkerPhysics`; write the browser test:** inside Chromium and WebKit, spawn the worker, add a falling body, step, and assert `readPositions()` eventually shows y lower than the start (poll with a timeout), and `dispose` terminates the worker. Check WASM loads inside a WebKit worker (this is the iOS risk named in the spec).
- [ ] **Step 6: Build `apps/demo-physics`:** a sphere that follows the mouse or touch point through a kinematic body, with a dynamic sphere reacting to gravity, drawn on a 2D canvas (keep it tiny; no Three.js).
- [ ] **Step 7: Add CI job `physics`:** Node tests, Playwright browser tests, build, size.
- [ ] **Step 8: Commit** `feat(physics): Rapier world in a worker with demo`.

---

### Task 10: Umbrella package, CDN bundle, and combined try-on demo

**Files:**
- Create: `packages/place-it/{package.json,tsconfig.json,vite.config.ts}`, `src/index.ts`, `size-limit` config; `apps/demo-tryon/{index.html,main.ts,package.json}`; `test/bundle.test.ts`; Playwright test `apps/demo-tryon/test/tryon.browser.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `place-it` package exporting `createPlaceIt(opts: { canvas: HTMLCanvasElement; baseUrl?: string; target: 'ear' | 'neck' }): PlaceItSession` plus re-exports of `parseConfig`, `serializeConfig`, `PlaceItError`; an IIFE build `dist/place-it.global.js` exposing `window.PlaceIt`. Tracking, renderer, and physics modules are loaded with dynamic `import()` so the entry stays small.

- [ ] **Step 1: Write failing test** `bundle.test.ts`: builds the bundle, evaluates it in a JS sandbox (Node `vm` with a minimal `window`), and asserts `window.PlaceIt.createPlaceIt` is a function and `PlaceIt.parseConfig` rejects `version: 2`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `createPlaceIt`** (composition root: builds `CameraSource`, `MediaPipeTracker`, `ThreeRenderer`, optional `WorkerPhysics`, `createScheduler`, returns `PlaceItSession`) and the Vite IIFE build; set `size-limit` budgets: entry under 150 KB gzipped.
- [ ] **Step 4: Run test and `pnpm size`. Expected: PASS and within budget.**
- [ ] **Step 5: Build `apps/demo-tryon`:** drop a GLB, choose ear or neck, click in a small 3D preview to set the anchor (store as `anchor`), toggle mirror, buttons to export and import the config JSON, and a "Try on" button that starts the session over a live webcam; show `error` events as text.
- [ ] **Step 6: Write the Playwright test:** launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, load the demo, load `sphere.glb`, export config and assert it round-trips through `parseConfig`, then click "Try on" and assert no `error` event within 3 seconds. A second case denies the camera permission and asserts the error text shows `camera-denied`.
- [ ] **Step 7: Commit** `feat: umbrella package, CDN bundle, and try-on demo`.

---

### Task 11: CI path filters and release pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`, `.github/workflows/pages.yml`, `docs/RELEASING.md`

**Interfaces:**
- Consumes: root scripts from Task 1 and the per-area jobs from Tasks 6–10.

- [ ] **Step 1: Restructure `ci.yml`:** a `changes` job using path filters (`dorny/paths-filter` or an equivalent) outputs flags for `core`, `platform-web`, `tracking`, `render`, `physics`, `demo`; area jobs run when their paths or `packages/core/**` change; a final `ci-ok` job aggregates required results (skipped counts as success) so branch protection needs one check.
- [ ] **Step 2: Write `release.yml`:** on GitHub release published: checkout with LFS, install, typecheck, test, build, size, then `pnpm -r publish --access public --provenance` using `NPM_TOKEN`; permissions limited to `contents: read` and `id-token: write`.
- [ ] **Step 3: Write `pages.yml`:** on release, build the four demos into one static folder and deploy to GitHub Pages.
- [ ] **Step 4: Write `docs/RELEASING.md`:** secrets to add (`NPM_TOKEN`), how to cut a release, where the CDN URL appears (`https://cdn.jsdelivr.net/npm/place-it@<version>/dist/place-it.global.js`), and the manual iOS Safari check list.
- [ ] **Step 5: Verify:** open a throwaway PR touching only `packages/physics`; expected: `physics` and `ci-ok` run and `tracking` and `render` are skipped. Run `actionlint` on the workflows (or the closest available workflow validator) with no errors.
- [ ] **Step 6: Commit** `ci: path-filtered CI, npm release, and demo deploy`.

---

## Self-review notes

- Spec coverage: three areas with packages, tests, CI, demos (Tasks 7–9, 11); platform layer (6); interfaces and no-import rule (3, enforced by package dependencies); config contract (2); ear and neck (4); render pass hook (8); physics in worker (9); CDN and npm (10, 11); budgets (1, 10); iOS Safari (6, 8, 9, 11). Deferred per spec: lighting model, hinge and chain physics, custom trackers, other targets.
- Types are consistent across tasks (`TrackingFrame`, `Pose`, `RenderObject`, `PhysicsWorld`, `Scheduler`).
- Owner action needed before Task 7 clip tests can run for real: record clips listed in `packages/tracking/fixtures/README.md`.
