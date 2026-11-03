import type * as PlaceIt from "./index";

// Stands in for @place-it/core inside the CDN chunks (vite --mode chunks): they reuse the PlaceItError of the loaded
// place-it.global.js, so their errors stay `instanceof PlaceIt.PlaceItError` and the session keeps their codes.
// The chunks import nothing else from core at runtime; a new import fails the chunk build with a missing-export error.
export const { PlaceItError } = (globalThis as unknown as { PlaceIt: typeof PlaceIt }).PlaceIt;
