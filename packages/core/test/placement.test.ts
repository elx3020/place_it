import { describe, it, expect } from "vitest";
import {
  computePlacements, REFERENCE_FACE_WIDTH_M, REFERENCE_SHOULDER_WIDTH_M, NECK_CHIN_TO_SHOULDER, EAR_POSE_WEIGHT,
} from "../src/index";
import type { Landmark, PlacementConfig, Pose, TrackingFrame } from "../src/index";

const lm = (x: number, y: number, z = 0): Landmark => ({ x, y, z });
const points = (n: number, over: Record<number, Landmark>) => {
  const a = Array.from({ length: n }, () => lm(0.5, 0.5));
  for (const [k, v] of Object.entries(over)) a[Number(k)] = v;
  return a;
};
const face = (over: Record<number, Landmark>) => points(478, over);
const body = (over: Record<number, Landmark>) => points(33, over);
const frame = (faces: Landmark[][], extra: Partial<TrackingFrame> = {}): TrackingFrame => ({
  timestampMs: 0, imageSize: { width: 640, height: 480 }, faces, faceMatrices: faces.map(() => undefined), ...extra,
});
const ear = (mirror = false): PlacementConfig => ({ version: 1, target: "ear", anchor: [0, 0, 0], scale: 2, mirror });
const neck: PlacementConfig = { version: 1, target: "neck", anchor: [0, 0, 0], scale: 2 };
const HIDDEN: Pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 0, visible: false };
const aspect = 640 / 480;

describe("placement", () => {
  it("(a) ear: one pose at landmark 234, scale = config.scale * faceWidth / 0.14, rotation from head matrix", () => {
    const f = face({ 234: lm(0.4, 0.5, 0.01), 454: lm(0.55, 0.53, 0.02) });
    const [p, ...rest] = computePlacements(ear(), frame([f]));
    expect(rest).toEqual([]);
    expect(p!.visible).toBe(true);
    expect(p!.position).toEqual([0.4, 0.5, 0.01]);
    expect(p!.rotation).toEqual([0, 0, 0, 1]);
    expect(p!.scale).toBeCloseTo((2 * Math.hypot(0.15 * aspect, 0.03)) / REFERENCE_FACE_WIDTH_M, 10);

    // 90 degrees about Z, column-major, with uniform scale 3 and a translation.
    const m = [0, 3, 0, 0, -3, 0, 0, 0, 0, 0, 3, 0, 5, 6, 7, 1];
    const [q] = computePlacements(ear(), frame([f], { faceMatrices: [m] }));
    const h = Math.SQRT1_2;
    q!.rotation.forEach((v, i) => expect(v).toBeCloseTo([0, 0, h, h][i]!, 10));
  });

  it("(a) ear: pose ear (8) refines x,y; z stays face-mesh depth", () => {
    const f = face({ 234: lm(0.4, 0.5, 0.01), 454: lm(0.6, 0.5) });
    const [p] = computePlacements(ear(), frame([f], { pose: body({ 8: lm(0.3, 0.6, -0.5) }) }));
    const w = EAR_POSE_WEIGHT;
    expect(p!.position[0]).toBeCloseTo(0.4 + (0.3 - 0.4) * w, 10);
    expect(p!.position[1]).toBeCloseTo(0.5 + (0.6 - 0.5) * w, 10);
    expect(p!.position[2]).toBe(0.01);
  });

  it("(b) mirror: two poses (234 then 454) mirrored about the face center", () => {
    const f = face({ 234: lm(0.4, 0.5), 454: lm(0.6, 0.5) });
    for (const pose of [undefined, body({ 8: lm(0.35, 0.5), 7: lm(0.65, 0.5) })]) {
      const ps = computePlacements(ear(true), frame([f], pose ? { pose } : {}));
      expect(ps).toHaveLength(2);
      const [l, r] = ps as [Pose, Pose];
      expect(l.visible && r.visible).toBe(true);
      expect(l.position[0]).toBeLessThan(0.5);
      expect((l.position[0] + r.position[0]) / 2).toBeCloseTo(0.5, 10);
      expect(l.position[1]).toBe(r.position[1]);
      expect(l.scale).toBe(r.scale);
    }
  });

  it("(c) no faces: every pose hidden, all-zero, no NaN", () => {
    expect(computePlacements(ear(true), frame([]))).toEqual([HIDDEN, HIDDEN]);
    expect(computePlacements(ear(), frame([]))).toEqual([HIDDEN]);
    expect(computePlacements(neck, frame([], { pose: body({}) }))).toEqual([HIDDEN]);
  });

  it("(d) any NaN in a used value hides the pose", () => {
    const ok = { 234: lm(0.4, 0.5), 454: lm(0.6, 0.5) };
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const bad: TrackingFrame[] = [
      frame([face({ ...ok, 234: lm(NaN, 0.5) })]),
      frame([face({ ...ok, 454: lm(0.6, NaN) })]),
      frame([face({ ...ok, 234: lm(0.4, 0.5, NaN) })]),
      frame([face(ok)], { pose: body({ 8: lm(NaN, 0.5) }) }),
      frame([face(ok)], { faceMatrices: [m.map((v, i) => (i === 5 ? NaN : v))] }),
    ];
    for (const fr of bad) expect(computePlacements(ear(), fr)).toEqual([HIDDEN]);
    expect(computePlacements(ear(), frame([face(ok)], { faceMatrices: [m] }))[0]!.visible).toBe(true);
    expect(computePlacements(neck, frame([face({ ...ok, 152: lm(NaN, 0.7) })], { pose: body({}) }))).toEqual([HIDDEN]);
  });

  it("(e) multiple faces: follows the widest, ties go to the lowest index, deterministic", () => {
    const narrow = face({ 234: lm(0.45, 0.5), 454: lm(0.55, 0.5) });
    const wide = face({ 234: lm(0.2, 0.5), 454: lm(0.6, 0.5) });
    // Binary-exact offsets so the two widths really tie.
    const tieA = face({ 234: lm(0.375, 0.5), 454: lm(0.5, 0.5) });
    const tieB = face({ 234: lm(0.625, 0.5), 454: lm(0.75, 0.5) });
    for (let i = 0; i < 3; i++) {
      expect(computePlacements(ear(), frame([narrow, wide]))[0]!.position[0]).toBe(0.2);
      expect(computePlacements(ear(), frame([wide, narrow]))[0]!.position[0]).toBe(0.2);
      expect(computePlacements(ear(), frame([tieA, tieB]))[0]!.position[0]).toBe(0.375);
      expect(computePlacements(ear(), frame([tieB, tieA]))[0]!.position[0]).toBe(0.625);
    }
  });

  it("(f) neck: hidden without pose landmarks; otherwise 40% from chin to shoulder midpoint", () => {
    const f = face({ 234: lm(0.4, 0.4), 454: lm(0.6, 0.4), 152: lm(0.5, 0.5, 0.03) });
    expect(computePlacements(neck, frame([f]))).toEqual([HIDDEN]);
    expect(computePlacements(neck, frame([f], { pose: [] }))).toEqual([HIDDEN]);

    const pose = body({ 11: lm(0.7, 0.8), 12: lm(0.3, 0.9) });
    const [p, ...rest] = computePlacements({ ...neck, mirror: true }, frame([f], { pose }));
    expect(rest).toEqual([]);
    expect(NECK_CHIN_TO_SHOULDER).toBe(0.4);
    expect(p!.visible).toBe(true);
    expect(p!.position[0]).toBeCloseTo(0.5, 10);
    expect(p!.position[1]).toBeCloseTo(0.5 + (0.85 - 0.5) * 0.4, 10);
    expect(p!.position[2]).toBe(0.03);
    expect(p!.scale).toBeCloseTo((2 * Math.hypot(0.4 * aspect, 0.1)) / REFERENCE_SHOULDER_WIDTH_M, 10);
  });

  it("degenerate input (zero-width face, zero-size image) hides instead of producing NaN or scale 0", () => {
    const flat = face({ 234: lm(0.5, 0.5), 454: lm(0.5, 0.5) });
    expect(computePlacements(ear(true), frame([flat]))).toEqual([HIDDEN, HIDDEN]);
    const ok = face({ 234: lm(0.4, 0.5), 454: lm(0.6, 0.5) });
    expect(computePlacements(ear(), frame([ok], { imageSize: { width: 0, height: 0 } }))).toEqual([HIDDEN]);
    const degenerateMatrix = new Array<number>(16).fill(0);
    expect(computePlacements(ear(), frame([ok], { faceMatrices: [degenerateMatrix] }))).toEqual([HIDDEN]);
  });
});
