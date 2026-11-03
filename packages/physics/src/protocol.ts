import type { BodyDesc, Vec3 } from "@place-it/core";

export type ToWorker =
  | { t: "init"; gravity?: Vec3 }
  | { t: "add"; id: number; desc: BodyDesc }
  | { t: "target"; id: number; p: Vec3 }
  | { t: "step"; dtMs: number }
  | { t: "dispose" };

export type FromWorker =
  | { t: "ready" }
  | { t: "error"; message: string }
  /** flat [id, x, y, z, ...] */
  | { t: "positions"; data: Float64Array };
