# @place-it/render

Three.js renderer behind the core `Renderer` interface. Root rules in `../../CLAUDE.md` apply.

## Layout

- `src/three-renderer.ts`: `ThreeRenderer` (`WebGPURenderer`, WebGL 2 fallback), `MODEL_DIAGONAL_RANGE_M` model-size guard.
- `src/passes.ts`: `PassPipeline`, `IdentityPass`; the extension point for future lighting passes.
- `src/occluder.ts`: occlusion geometry.
- `fixtures/*.glb`, `still.png`: test models/images; regenerate with `pnpm --filter @place-it/render fixtures`.
- `test/__screenshots__/`: browser screenshot baselines.

## Rules

- Must not import `tracking` or `physics`; depends on `core` and `three` (pinned 0.187.0, keep `@types/three` in lockstep).
- Models follow glTF conventions: meters, Y-up, +Z front. Reject or flag models outside the size range instead of silently rescaling.
- Keep WebKit working. The WebGPU path and WebKit have never run locally.
- Budget: 10 KB gzip for this package; `three` itself is budgeted in `place-it`'s lazy `render.js` chunk.

## Tests

- `pnpm --filter @place-it/render test` for Node unit tests (`passes.test.ts`).
- `test:browser` runs Playwright screenshot tests. Generate WebKit baselines through the CI `update-screenshots` dispatch, not locally.
