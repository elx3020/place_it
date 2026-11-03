import { PlaceItError, type BodyDesc } from "@place-it/core";

export function assertBodyDesc(d: BodyDesc): void {
  if (!d.position.every(Number.isFinite) || !Number.isFinite(d.radius) || d.radius <= 0)
    throw new PlaceItError("physics-failed", "addBody: position must be finite and radius a positive finite number");
}
