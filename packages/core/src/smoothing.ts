import type { Pose } from "./interfaces";

export interface SmoothingOptions {
  /** Cutoff in Hz when still: lower = steadier but laggier. */
  minCutoff?: number;
  /** How fast the cutoff rises with speed: higher = less lag while moving, more jitter. */
  beta?: number;
}

const alpha = (dtS: number, fc: number) => 1 / (1 + 1 / (2 * Math.PI * fc * dtS));

/** One Euro filter (Casiez et al. 2012): heavy smoothing when slow, light when fast. */
class OneEuro {
  private x?: number;
  private dx = 0;
  private t = 0;
  constructor(private minCutoff: number, private beta: number) {}
  filter(v: number, tMs: number): number {
    if (this.x === undefined) { this.x = v; this.t = tMs; return v; }
    const dt = (tMs - this.t) / 1000;
    if (!(dt > 0)) return this.x; // same or backwards timestamp: hold
    this.t = tMs;
    this.dx += alpha(dt, 1) * ((v - this.x) / dt - this.dx);
    this.x += alpha(dt, this.minCutoff + this.beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}

type Channels = { f: OneEuro[]; q: Pose["rotation"] };

/** Smooths position, rotation and scale per pose index; a hidden pose resets its filter so a returning target does not glide in. */
export class PoseSmoother {
  private state: (Channels | undefined)[] = [];
  private minCutoff: number;
  private beta: number;
  // defaults are a first guess for normalised image coordinates at ~30 fps; tune on real footage
  constructor({ minCutoff = 1.9, beta = 5 }: SmoothingOptions = {}) { this.minCutoff = minCutoff; this.beta = beta; }

  smooth(poses: Pose[], tMs: number): Pose[] {
    return poses.map((p, i) => {
      if (!p.visible) { this.state[i] = undefined; return p; }
      const s = (this.state[i] ??= { f: Array.from({ length: 8 }, () => new OneEuro(this.minCutoff, this.beta)), q: p.rotation });
      // q and -q are the same rotation: pick the sign nearest the last output so components do not jump
      const flip = s.q[0] * p.rotation[0] + s.q[1] * p.rotation[1] + s.q[2] * p.rotation[2] + s.q[3] * p.rotation[3] < 0 ? -1 : 1;
      const raw = [...p.position, ...p.rotation.map((c) => c * flip), p.scale];
      const o = raw.map((v, k) => s.f[k]!.filter(v, tMs));
      const n = Math.hypot(o[3]!, o[4]!, o[5]!, o[6]!) || 1;
      const rotation: Pose["rotation"] = [o[3]! / n, o[4]! / n, o[5]! / n, o[6]! / n];
      s.q = rotation;
      return { ...p, position: [o[0]!, o[1]!, o[2]!], rotation, scale: o[7]! };
    });
  }
}
