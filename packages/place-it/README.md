# place-it

Umbrella package: `createPlaceIt` wires the selfie camera, MediaPipe tracking, the Three.js renderer and optional worker physics into a `PlaceItSession`. It also re-exports `parseConfig`, `serializeConfig`, `PlaceItError` and `PlaceItSession`.

```ts
import { createPlaceIt, parseConfig } from "place-it";

const session = createPlaceIt({ canvas, target: "ear" });
session.on("error", (e) => console.warn(e.code)); // camera-denied, camera-unavailable, tracker-failed, ...
await session.start(); // camera first; may run while load() is pending, nothing is drawn until it finishes
await session.load("earring.glb", parseConfig(await (await fetch("earring.json")).json()));
```

`createPlaceIt` returns at once. The tracker, renderer and physics code (three, MediaPipe, the physics proxy) is fetched by dynamic `import()` inside `session.load()`. `load()` rejects with `config-invalid` when the config's target differs from the session's `target`. The canvas is resized to the camera frame; size it with CSS (for example `width: 100%`).

Options: `canvas`, `target` (`"ear"` or `"neck"`), `physics` (default `false`), `baseUrl` (self-hosting: a directory holding the MediaPipe WASM files and `physics-worker.js`), `workerUrl` (the physics worker, overrides `baseUrl`).

## Script tag (CDN)

```html
<script src="https://cdn.jsdelivr.net/npm/place-it@0.0.0/dist/place-it.global.js"></script>
<script>
  const session = PlaceIt.createPlaceIt({ canvas: document.querySelector("canvas"), target: "neck" });
</script>
```

An IIFE build cannot be code-split, so the CDN files are:

| File | What | Loaded |
|---|---|---|
| `place-it.global.js` | classic script defining `window.PlaceIt` (core, camera, session) | by your `<script>` tag |
| `render.js`, `tracking.js`, `physics.js` (+ a tiny shared chunk) | ES modules with three, MediaPipe, the physics proxy | by `import()` in `load()` |
| `physics-worker.js` | Rapier with its WASM, run as a module worker | when `physics: true` |

The engine files are resolved relative to the URL of `place-it.global.js` (read from `document.currentScript` while it first runs), so keep them together and load the bundle with a plain, full-path `<script src>`: not as `type="module"`, not concatenated into another file, and not through a CDN short URL without `/dist/place-it.global.js` (the files would resolve against the wrong directory). The engine modules take `PlaceItError` from `window.PlaceIt`, so their errors are `instanceof PlaceIt.PlaceItError`.

MediaPipe WASM and models load from their default CDNs (jsDelivr and Google storage) unless `baseUrl` points elsewhere. No video leaves the device.

## npm

`dist/index.js` keeps its dependencies external and uses plain `import("@place-it/render")` etc., so your bundler splits them into lazy chunks. The physics worker is referenced as `new URL("./physics-worker.js", import.meta.url)`, which Vite emits as an asset (the try-on demo build does this).
