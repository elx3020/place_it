# @place-it/core

Contracts and pure logic shared by every other package. Root rules in `../../CLAUDE.md` apply.

## Layout

- `src/interfaces.ts`: InputSource, Tracker, Renderer, RenderPass, PhysicsWorld, Scheduler.
- `src/config.ts`: JSON config schema (`parseConfig` / `serializeConfig`, `version: 1`).
- `src/placement.ts`: placement math (anchor, `Pose.position` normalized, `Pose.scale` as a ratio).
- `src/session.ts`: `PlaceItSession`, which wires the interfaces together.
- `src/errors.ts`: `PlaceItError` and its error codes.
- `src/testing/fakes.ts`: test doubles, exported as `@place-it/core/testing`.

## Rules

- **No DOM lib, no browser APIs, no runtime dependencies.** If something needs `window`, `Worker`, `fetch`, etc., it belongs in `platform-web`.
- Changing an interface affects every area package; update the fakes and their tests in the same change.
- Everything public goes through `src/index.ts`. The fakes stay out of the main entry so they don't count toward the size budget (150 KB gzip).

## Commands

- `pnpm --filter @place-it/core test` (Node only), `build`, `typecheck`, `size`.
