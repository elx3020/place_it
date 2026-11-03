# Releasing

## One-time setup

- Add the repo secret `NPM_TOKEN` (npm automation token with publish rights). `release.yml` references it as `secrets.NPM_TOKEN`.
- Check that the package name `place-it` is available on npm before the first publish (`npm view place-it`). If it is taken, rename the package and update the CDN URLs below and `DEFAULT_ASSET_BASE` in `packages/platform-web/src/assets.ts`.
- Enable GitHub Pages with source "GitHub Actions" (Settings, Pages).
- The owner must record the test clips listed in `packages/tracking/fixtures/README.md` (stored in Git LFS). Until then the clip tests skip.
- WebKit screenshot baselines are created through CI: run the CI workflow manually (Actions, CI, Run workflow) with `update-screenshots` ticked, download the `render-screenshot-baselines` artifact, and commit it to `packages/render/test/__screenshots__/`.

## Cutting a release

1. Bump versions. The `platform-web` and `place-it` package versions must stay in lockstep: the default asset base is `https://cdn.jsdelivr.net/npm/place-it@<version>/assets/`, and `platform-web` bakes in its own version.
2. Merge to the default branch with `ci-ok` green.
3. Create a GitHub release (tag `v<version>`) and publish it.
4. `release.yml` installs, builds, typechecks, runs Node unit tests, checks sizes, then runs `pnpm -r publish --access public --provenance --no-git-checks`. `pages.yml` deploys the four demos (tracking, render, physics, tryon) to GitHub Pages. Browser test suites run in `ci.yml`, not in the release.

## CDN URL

`https://cdn.jsdelivr.net/npm/place-it@<version>/dist/place-it.global.js`

## Third-party requests and self-hosting

MediaPipe model files default to Google storage URLs (`storage.googleapis.com/mediapipe-models/...`) and the WASM runtime to jsDelivr. These are third-party requests; no video is sent. To self-host, download the `.task` files and the `@mediapipe/tasks-vision` `wasm` folder, serve them from your own origin, and pass the URLs through the tracking config (model and wasm URL options in `packages/tracking/src/mediapipe-tracker.ts`). Likewise the asset base can be pointed at your own copy of the `place-it` `assets/` folder.

## Manual iOS Safari checklist

Run on a real iPhone (Safari, latest iOS) against the deployed demos:

- [ ] Camera permission prompt appears on a user gesture and the stream starts (playsinline, no fullscreen takeover).
- [ ] Denying permission shows the error state, not a blank page.
- [ ] Portrait and landscape rotation: video and overlay stay aligned.
- [ ] Face tracking runs at a usable frame rate; no thermal throttling in 2 minutes.
- [ ] Render demo: objects are placed correctly on ears and neck; no WebGL context loss.
- [ ] Physics demo: worker starts, motion looks stable.
- [ ] Try-on demo loads from the CDN build without console errors.
- [ ] Backgrounding the tab and returning resumes the camera.
