# @place-it/platform-web

The only package that touches browser APIs. Root rules in `../../CLAUDE.md` apply.

## Layout

- `src/camera.ts`: `CameraSource` (getUserMedia).
- `src/media.ts`: `ImageSource`, `VideoFileSource`.
- `src/scheduler.ts`: `createScheduler` (frame loop).
- `src/assets.ts`: `resolveAssetUrl`, `createWorker`, `scriptBase`, `DEFAULT_ASSET_BASE` (jsDelivr `place-it@<version>/assets/`). The cross-origin worker shim lives here.
- `src/env.d.ts`: build-time globals.

## Rules

- Implements `core` interfaces; depends only on `@place-it/core`.
- Other area packages import from here instead of calling browser APIs directly.
- iOS Safari is mandatory: avoid APIs WebKit lacks, and keep camera/video handling WebKit-safe.
- Video never leaves the device; nothing here may upload frames.
- Budget: 10 KB gzip.

## Tests

- `test/*.test.ts` run in Node with `happy-dom`. The cross-origin worker shim has unit tests only, never a real browser run.
- `pnpm --filter @place-it/platform-web test`
