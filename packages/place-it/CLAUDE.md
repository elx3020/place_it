# place-it

The published umbrella package: `createPlaceIt(...)` plus the IIFE CDN bundle (global `PlaceIt`). Root rules in `../../CLAUDE.md` apply.

## Layout

- `src/create.ts`: `createPlaceIt` and `PlaceItOptions`; builds a `PlaceItSession` from the area packages.
- `src/index.ts`: public API (re-exports `parseConfig`, `serializeConfig`, `PlaceItError`, `PlaceItSession` and types from core).
- `src/load.ts`: npm build, plain dynamic `import()` of render/tracking/physics so consumers' bundlers split lazy chunks.
- `src/load.cdn.ts`: CDN build swaps `load.ts` for this (see `vite.config.ts`).
- `src/global-core.ts`: the CDN entry's eager core.

## Rules

- This is the only package allowed to depend on all area packages (it wires them together). Never make render, tracking or physics import each other here either.
- Keep the entry small: render, tracking, physics and the physics worker must stay lazy chunks. Each chunk has its own `size-limit` entry in `package.json`; `pnpm size` fails on regression.
- Build is `tsup && vite build && vite build --mode chunks`; it needs the other packages built first.
- npm name `place-it` must be verified before the first publish. Releases: `../../docs/RELEASING.md`.

## Tests

- `pnpm --filter place-it test` (Node, uses core fakes): `create.test.ts`, `rotation.test.ts`, `bundle.test.ts` (checks built output, so run `build` first).
