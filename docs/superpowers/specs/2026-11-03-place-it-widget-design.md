# place_it: General 3D Placement Library — Design

Date: 2026-11-03 (revised: three-area scaffold)

## Intent and why

`place_it` places 3D objects onto tracked real-world targets in a media input (live webcam, video file, or still image) and makes them look and behave as if they were really there. It is meant to be a general-purpose toolkit in the spirit of MediaPipe Tasks Vision: a clean, task-oriented, well-documented API others can build on, not a single-purpose plugin.

The first product on top of it is virtual try-on for an accessories ecommerce site: a shopper sees earrings or a necklace on their own ears or neck through their webcam. A store owner supplies a 3D model; the library tracks, renders, and animates it. It is delivered via a public CDN so a store adds it with a script tag.

This design covers **only the library repo** (`place_it`). A hosted dashboard and backend for owners are separate later projects; this repo defines the config format they will use.

## What this project delivers now: a scaffold with three areas

The goal of this phase is a **repo structure in which three areas each have their own package, tests, CI job, and demo**, so each can be developed and verified independently:

1. **Tracking** — turns media input into landmarks/target poses.
2. **Rendering** — draws 3D objects over the input, with a hook for custom render passes.
3. **Physics** — makes objects react physically to tracking input.

Each area gets a working minimal implementation, enough that its CI and demo are real, not empty. Depth beyond that is future work.

| Area | Delivered now | Future (structure must allow it, not built now) |
|------|---------------|-----------------------------------------------|
| Tracking | MediaPipe-backed tracker for **ears and neck**, behind a tracker interface | Custom-trained models; wrist, face, fingers, non-body targets |
| Rendering | Three.js renderer using **WebGPU**, drawing a GLB at a tracked pose, with a pluggable post-processing / extra-pass layer | Lighting estimation: a model that reads light from the camera image, then, knowing the object's position, shape, and material, a pass adjusts rendered pixels for lifelike lighting |
| Physics | Physics package running the engine in a **worker**, with a minimal scene (a body following a tracked point) | Hinge helper for earrings, chain/necklace behavior, colliders built from tracker data (head, neck, shoulders) so objects hang correctly and react to the person moving |

## Shopper experience (target for the try-on use case)

1. Shopper clicks "Try on", grants camera permission (note: video stays on-device).
2. Mirrored live feed appears; product appears on ears or neck and follows movement. Earrings hide behind the head when it turns.
3. Shopper can snapshot and switch products without leaving the view.

Everything runs in the browser; no video is uploaded. Must work on phones.

## Goals

- **General placement API** built around: *input source* (camera, video, image), *tracker*, *placement* (landmarks + per-object config to a 3D transform), *renderer*, *physics*. Nothing in the public API is jewelry-specific.
- **Strict package boundaries:** areas communicate through small interfaces defined in a shared core package; tracking, rendering, and physics do not import each other.
- **Platform abstraction:** all browser APIs (getUserMedia, video/canvas, WebGL/WebGPU context, fetch, workers, WASM loading) sit behind adapter interfaces in a platform layer. Core logic (placement math, config, orchestration) uses no browser APIs and is testable in plain Node. This is a deliberate owner decision: no mixing browser APIs into the codebase.
- **Browsers:** Chrome (desktop and Android), Safari including iOS (mandatory), Firefox, Edge. Rendering uses Three.js's WebGPU renderer, which falls back to WebGL 2 where WebGPU is unavailable; the render package must keep that fallback working, with browser differences contained in the platform layer.
- **Tracker abstraction:** frame in, landmarks out, so the owner's own models can replace MediaPipe Tasks Vision (Apache 2.0). Load only the tasks a target needs.
- **Config format** per object: target type, anchor point, optional scale and mirror flag, integer `version`; JSON beside the GLB. A contract with the future backend, designed deliberately and leaving room for physics data (hinge definitions) and render hints later.
- **Demos:** one concise demo per area, plus a combined try-on demo. Tracking demo: webcam shows landmarks. Rendering demo: a GLB with a render pass toggle. Physics demo: an object reacting to a moving point. Combined demo: drop a GLB, choose ear or neck, set the anchor, try it on live; export/import config JSON. Keep all as small as possible.
- **CI** per area, on every push/PR: type-check, unit tests, build, bundle-size check, plus area-specific checks (tracking: video-clip tests; rendering: Chromium and WebKit smoke tests plus screenshot comparison; physics: deterministic simulation tests). No lint, by decision. Path filters so a change to one area runs mostly that area's jobs.
- **CD** on release: publish to npm; a public CDN (jsDelivr/unpkg) serves it from npm. Optionally deploy demos to GitHub Pages.
- **License:** MIT. All dependencies permissive (MIT, Apache 2.0, BSD); no copyleft.

## Non-goals (this phase)

- Lighting estimation model, actual hinge/necklace physics, and custom tracking models (only places for them).
- Wrist, face, fingers/rings, non-body targets.
- Backend, accounts, dashboard, store-platform plugins.
- Photorealism beyond what a basic renderer gives.

## Anti-goals

- Heavy download or slow start on mid-range phones; the physics engine and each model load lazily.
- Public API tied to MediaPipe, Three.js, or jewelry-specific terms.
- Browser APIs used outside the platform layer.
- Areas importing each other, instead of going through core interfaces.
- Any video leaving the device.
- Any copyleft dependency.

## Testing

- **Unit tests** run in Node using a fake tracker, fake platform layer, and fake physics/render backends.
- **Tracking clip tests:** real MediaPipe over short clips supplied by the owner (self-recorded, consenting people), asserting output within tolerance. Also the benchmark for future custom models. Large files via Git LFS.
- **Rendering:** Playwright smoke tests on Chromium and WebKit (WebKit stands in for iOS Safari but is not identical; occasional manual iPhone checks expected).
- **Physics:** deterministic simulation tests (same input, same result).

## Known risks

- Ears are the least precise target in off-the-shelf trackers; likely first target for custom models. Neck is estimated from chin and shoulder points.
- iOS Safari support for camera, WebGPU/WebGL, WASM, and workers is the biggest portability risk.
- Physics driven by noisy tracking can jitter; landmark smoothing and a stable interface between tracker and physics matter.
- Performance on mid-range phones with tracking, rendering, and physics all running.

## Calls made by the designer (not yet confirmed by the owner)

- **Physics engine:** my recommendation is **Rapier** (Apache 2.0, Rust compiled to WASM, optimized, supports joints including revolute hinges and rope-like chains, runs in a worker). **Jolt Physics** (MIT, also WASM) is the alternative. The builder should verify current package status and iOS Safari worker/WASM behavior before committing. The physics package hides the engine behind an interface so it can be swapped.
- **Package layout (names provisional):** `packages/core` (types, config, placement math, interfaces), `packages/platform-web` (browser adapters), `packages/tracking`, `packages/render`, `packages/physics`, `packages/place-it` (umbrella CDN bundle), `apps/demo-*`.
- **Render extension point:** a "pass" interface that receives the rendered frame, input frame, and object metadata (position, shape, material) and returns modified pixels, so the future lighting pass fits without changes to the renderer.
- **Model convention:** GLB per glTF spec (meters, Y-up, +Z front); scale derived from real-world measurements from the tracker; optional `scale` multiplier in config.
- **Earrings:** one anchor plus a `mirror` flag for the second ear.
- **Tracker tasks:** ears use Face Landmarker plus Pose Landmarker ear points; neck uses Face plus Pose.
- **Occlusion:** simple head-proxy occluder for ears and neck.
- **Budgets (starting numbers, tune with measurements):** core under 150 KB gzipped excluding engine/model assets; 24+ fps on a mid-range phone; CI fails if the bundle budget is exceeded.
- **Camera failure:** error event only; image and video-file inputs exist, so hosts can offer fallbacks.
- **Asset loading:** MediaPipe and physics WASM load from a configurable base URL, defaulting to a version-pinned jsDelivr path; owners can self-host.
- **Packaging:** global name `PlaceIt` for the script-tag build.
- **Scope reading:** I read "scaffold" as scaffold plus a minimal working implementation per area, so each area's CI and demo are real. If you meant empty stubs only, say so.

## Left to the builder

Tooling (package manager, workspace and build tools), exact API names, config schema details, landmark smoothing, clip logistics, exact bundle numbers, demo UI framework (keep minimal), CI path-filter details.
