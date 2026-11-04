# @place-it/tracking

`MediaPipeTracker`, the `Tracker` implementation. Root rules in `../../CLAUDE.md` apply.

## Layout

- `src/mediapipe-tracker.ts`: the whole implementation (`@mediapipe/tasks-vision`, pinned 1.2.0).
- `test/mediapipe-tracker.unit.test.ts`: Node unit tests.
- `test/clips.browser.test.ts`: accuracy test over `fixtures/` clips (Git LFS). Skips until clips and `labels.json` exist; format in `fixtures/README.md`, labeling UI in `fixtures/label-tool.html`.

## Rules

- Must not import `render` or `physics`; talk only through `core` interfaces. May depend on `core` (and `platform-web` for dev/tests only).
- Output follows the placement conventions: `Pose.position` normalized image coords, `Pose.scale` a ratio (0.14 m face / 0.38 m shoulders reference widths).
- Default MediaPipe model URLs are Google storage and WASM comes from a CDN; no video is sent. Don't bundle models or WASM here.
- Budget: 10 KB gzip for this package. `place-it` lazy-loads it and budgets the MediaPipe JS separately.
- Accuracy work is parked: see `../../docs/parked-tracking-accuracy.md`. The multi-person pose pick has unit tests only.

## Commands

- `pnpm --filter @place-it/tracking test`; `test:browser` needs network + Chromium.
