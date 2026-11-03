import { PlaceItError } from "./errors";

export type Vec3 = [number, number, number];
export type TargetType = "ear" | "neck";
export interface PlacementConfig {
  version: 1;
  target: TargetType;
  anchor: Vec3;
  scale?: number;
  mirror?: boolean;
}

const bad = (m: string) => new PlaceItError("config-invalid", m);

export function parseConfig(input: unknown): PlacementConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw bad("config must be an object");
  const o = input as Record<string, unknown>;
  if (typeof o.version === "number" && Number.isInteger(o.version) && o.version !== 1) {
    throw new PlaceItError("config-version", `unsupported config version ${o.version}`);
  }
  if (o.version !== 1) throw bad("version must be 1");
  if (o.target !== "ear" && o.target !== "neck") throw bad("target must be 'ear' or 'neck'");
  const a = o.anchor;
  if (!Array.isArray(a) || a.length !== 3 || !a.every((n) => typeof n === "number" && Number.isFinite(n))) {
    throw bad("anchor must be three finite numbers");
  }
  const scale = o.scale ?? 1;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) throw bad("scale must be a positive finite number");
  if (o.mirror !== undefined && typeof o.mirror !== "boolean") throw bad("mirror must be a boolean");
  const c: PlacementConfig = { version: 1, target: o.target, anchor: [a[0], a[1], a[2]], scale };
  if (o.mirror !== undefined) c.mirror = o.mirror;
  else if (o.target === "ear") c.mirror = false;
  return c;
}

export const serializeConfig = (c: PlacementConfig): string => JSON.stringify(c);
