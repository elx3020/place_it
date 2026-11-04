# Parked: tracking accuracy and training data

Paused on 2026-11-04 to get the try-on demo working with MediaPipe first. Pick up here later.

- Test clips (`face-front.mp4`, `face-turn.mp4`, `neck-shoulders.mp4`, plus `-portrait` variants) were removed from the tree. Re-add them under `packages/tracking/fixtures/` (needs `git lfs` installed; `.gitattributes` already routes `**/fixtures/**/*.mp4` to LFS).
- Label them with `packages/tracking/fixtures/label-tool.html` and save the export as `fixtures/labels.json`. Until it exists `clips.browser.test.ts` skips.
- Training/eval data plan and license notes: `docs/training-data.md`.
- Still unverified: WebGPU backend, real iOS Safari, accuracy on real footage, published CDN URLs (404 until a release).
