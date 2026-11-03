import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { PlaceItError, type FrameInput, type Landmark, type Tracker, type TrackerNeed, type TrackingFrame } from "@place-it/core";

// Keep in step with the @mediapipe/tasks-vision version in package.json.
const MP_VERSION = "1.2.0";
export const DEFAULT_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
export const DEFAULT_MODEL_URLS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

export interface MediaPipeTrackerOptions {
  /** Directory holding the MediaPipe WASM files. */
  baseUrl?: string;
  maxFaces?: number;
  modelUrls?: Partial<typeof DEFAULT_MODEL_URLS>;
}

const xyz = ({ x, y, z }: Landmark): Landmark => ({ x, y, z });
const fail = (msg: string, e?: unknown) =>
  new PlaceItError("tracker-failed", e instanceof Error ? `${msg}: ${e.message}` : msg);

export class MediaPipeTracker implements Tracker {
  private face?: FaceLandmarker;
  private pose?: PoseLandmarker;
  private ready = false;

  constructor(private readonly opts: MediaPipeTrackerOptions = {}) {}

  async init(needs: TrackerNeed[]): Promise<void> {
    this.dispose();
    const models = { ...DEFAULT_MODEL_URLS, ...this.opts.modelUrls };
    try {
      const wasm = await FilesetResolver.forVisionTasks(this.opts.baseUrl ?? DEFAULT_WASM_URL);
      if (needs.includes("face"))
        this.face = await FaceLandmarker.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: models.face },
          runningMode: "VIDEO",
          numFaces: this.opts.maxFaces ?? 4,
          outputFacialTransformationMatrixes: true,
        });
      if (needs.includes("pose"))
        this.pose = await PoseLandmarker.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: models.pose },
          runningMode: "VIDEO",
          numPoses: 1,
        });
    } catch (e) {
      this.dispose();
      throw fail("MediaPipe initialisation failed", e);
    }
    this.ready = true;
  }

  async track(input: FrameInput): Promise<TrackingFrame> {
    if (!this.ready) throw fail("track() called before init()");
    const image = input.handle as HTMLVideoElement;
    try {
      const f = this.face?.detectForVideo(image, input.timestampMs);
      const p = this.pose?.detectForVideo(image, input.timestampMs);
      const pose = p?.landmarks[0];
      return {
        timestampMs: input.timestampMs,
        imageSize: { width: input.width, height: input.height },
        faces: (f?.faceLandmarks ?? []).map((l) => l.map(xyz)),
        faceMatrices: (f?.facialTransformationMatrixes ?? []).map((m) => (m ? Array.from(m.data) : undefined)),
        ...(pose && { pose: pose.map(xyz) }),
      };
    } catch (e) {
      throw fail("MediaPipe detection failed", e);
    }
  }

  dispose(): void {
    this.ready = false;
    this.face?.close();
    this.pose?.close();
    this.face = this.pose = undefined;
  }
}
