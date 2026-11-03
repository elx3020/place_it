import type { PlacementConfig, TargetType, Vec3 } from "./config";
import type { Landmark, Pose, TrackingFrame } from "./interfaces";

/** Real-world widths the measured face / shoulder widths are taken to represent at `scale: 1`. */
export const REFERENCE_FACE_WIDTH_M = 0.14;
export const REFERENCE_SHOULDER_WIDTH_M = 0.38;
/** Neck anchor: this fraction of the way from the chin to the shoulder midpoint. */
export const NECK_CHIN_TO_SHOULDER = 0.4;
/** How far the face-mesh ear point is pulled toward the pose ear landmark, when pose is tracked. */
export const EAR_POSE_WEIGHT = 0.5;

// Face mesh: 234 / 454 = face edge at the ears (image-left / image-right on an unmirrored frame), 152 = chin.
// Pose: 7 / 8 = the subject's left / right ear, 11 / 12 = left / right shoulder. 234 is the subject's right side, so it pairs with 8.
const FACE_A = 234, FACE_B = 454, CHIN = 152, POSE_EAR_L = 7, POSE_EAR_R = 8, SHOULDER_L = 11, SHOULDER_R = 12;

type TargetPlacer = (config: PlacementConfig, frame: TrackingFrame) => Pose[];
type Quat = Pose["rotation"];

const hidden = (): Pose => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 0, visible: false });

/** Hides the pose unless every value is finite and the scale is positive. */
function place(position: Vec3, rotation: Quat, scale: number): Pose {
  const ok = scale > 0 && [...position, ...rotation, scale].every(Number.isFinite);
  return ok ? { position, rotation, scale, visible: true } : hidden();
}

/** Distance in image-height units: x is stretched by the aspect ratio so it matches y. */
function width({ imageSize }: TrackingFrame, a?: Landmark, b?: Landmark): number {
  if (!a || !b) return NaN;
  return Math.hypot((a.x - b.x) * (imageSize.width / imageSize.height), a.y - b.y);
}

/** Moves x,y from `a` toward `b`; z stays `a`'s face-mesh depth because pose z uses a hip-origin frame. */
const toward = (a: Landmark | undefined, b: Landmark | undefined, t: number): Vec3 =>
  a && b ? [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z] : [NaN, NaN, NaN];

/** Index of the widest valid face; ties keep the lowest index; -1 when none. */
function largestFace(frame: TrackingFrame): number {
  let best = -1, bestW = -Infinity;
  frame.faces.forEach((f, i) => {
    const w = width(frame, f[FACE_A], f[FACE_B]);
    if (w > bestW) { best = i; bestW = w; }
  });
  return best;
}

/** The body belonging to `face`: the pose whose nose (pose 0) is nearest the face's nose tip (mesh 1); the first pose when that can't be measured. */
function poseFor(frame: TrackingFrame, face: Landmark[] | undefined): Landmark[] | undefined {
  const all = frame.poses ?? (frame.pose ? [frame.pose] : []);
  let best = all[0], bestD = Infinity;
  for (const p of all) {
    const d = width(frame, p[0], face?.[1]);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** Rotation of a 4x4 column-major transform as [x, y, z, w]; columns are normalised to drop any scale. */
function headRotation(m: number[] | undefined): Quat {
  if (!m) return [0, 0, 0, 1];
  const col = (c: number): Vec3 => {
    const v: Vec3 = [m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!];
    const n = Math.hypot(...v);
    return [v[0] / n, v[1] / n, v[2] / n];
  };
  const [[m00, m10, m20], [m01, m11, m21], [m02, m12, m22]] = [col(0), col(1), col(2)];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 2 * Math.sqrt(tr + 1);
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
}

const ear: TargetPlacer = ({ mirror, scale = 1 }, frame) => {
  const i = largestFace(frame);
  const face = frame.faces[i];
  const body = poseFor(frame, face);
  const s = (scale * width(frame, face?.[FACE_A], face?.[FACE_B])) / REFERENCE_FACE_WIDTH_M;
  const sides: [number, number][] = mirror ? [[FACE_A, POSE_EAR_R], [FACE_B, POSE_EAR_L]] : [[FACE_A, POSE_EAR_R]];
  return sides.map(([f, p]) => {
    const point = face?.[f];
    return place(toward(point, body?.[p] ?? point, EAR_POSE_WEIGHT), headRotation(frame.faceMatrices[i]), s);
  });
};

const neck: TargetPlacer = ({ scale = 1 }, frame) => {
  const i = largestFace(frame);
  const body = poseFor(frame, frame.faces[i]);
  const l = body?.[SHOULDER_L], r = body?.[SHOULDER_R];
  const mid = l && r ? { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2, z: 0 } : undefined;
  const s = (scale * width(frame, l, r)) / REFERENCE_SHOULDER_WIDTH_M;
  return [place(toward(frame.faces[i]?.[CHIN], mid, NECK_CHIN_TO_SHOULDER), headRotation(frame.faceMatrices[i]), s)];
};

const targets: Record<TargetType, TargetPlacer> = { ear, neck };

/** Poses for the config's target: `neck` gives one; `ear` gives one (landmark 234), or two (234, 454) when mirrored. */
export const computePlacements = (config: PlacementConfig, frame: TrackingFrame): Pose[] =>
  targets[config.target](config, frame);
