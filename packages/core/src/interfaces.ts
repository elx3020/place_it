import type { Vec3 } from "./config";

export interface Landmark { x: number; y: number; z: number }
export interface FrameInput { handle: unknown; width: number; height: number; timestampMs: number }
export interface TrackingFrame {
  timestampMs: number;
  imageSize: { width: number; height: number };
  faces: Landmark[][];
  /** faceMatrices[i] is the 4x4 column-major head transform for faces[i]. */
  faceMatrices: (number[] | undefined)[];
  /** Landmarks of the first detected body; same as poses[0]. */
  pose?: Landmark[];
  /** Every detected body, so placement can pick the one that belongs to the chosen face. */
  poses?: Landmark[][];
}
export type TrackerNeed = "face" | "pose";
export interface Tracker {
  init(needs: TrackerNeed[]): Promise<void>;
  track(frame: FrameInput): Promise<TrackingFrame>;
  dispose(): void;
}
export interface InputSource {
  start(): Promise<void>;
  stop(): void;
  grab(): FrameInput | undefined;
}
export interface Pose { position: Vec3; rotation: [number, number, number, number]; scale: number; visible: boolean }
export interface RenderObject {
  id: string;
  pose: Pose;
  mirrored: boolean;
  /** Point in model space (meters) that sits on the tracked landmark; default is the model origin. */
  anchor?: Vec3;
}
export interface PassContext {
  input: FrameInput;
  rendered: unknown;
  objects: { id: string; pose: Pose; bounds: Vec3; material: string }[];
}
export interface RenderPass { name: string; apply(ctx: PassContext): void }
export interface Renderer {
  init(): Promise<void>;
  /** Returns a model id. */
  loadModel(url: string): Promise<string>;
  render(input: FrameInput, objects: RenderObject[]): void;
  addPass(pass: RenderPass): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
export type BodyId = number;
export interface BodyDesc { kind: "dynamic" | "kinematic"; position: Vec3; radius: number }
export interface PhysicsWorld {
  init(): Promise<void>;
  addBody(desc: BodyDesc): BodyId;
  setKinematicTarget(id: BodyId, position: Vec3): void;
  step(dtMs: number): void;
  readPositions(): Map<BodyId, Vec3>;
  dispose(): void;
}
export interface Scheduler {
  request(cb: (nowMs: number) => void): number;
  cancel(handle: number): void;
  isHidden(): boolean;
}
