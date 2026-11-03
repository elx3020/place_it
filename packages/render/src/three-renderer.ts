import { PlaceItError, type FrameInput, type Pose, type RenderObject, type RenderPass, type Renderer, type Vec3 } from "@place-it/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  Box3, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, MeshBasicMaterial, type Object3D,
  OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, Texture, Vector3, WebGPURenderer,
} from "three/webgpu";
import { createOccluder } from "./occluder";
import { PassPipeline } from "./passes";

/** Models whose bounding-box diagonal (meters) falls outside this range are scaled into it, with a warning. */
export const MODEL_DIAGONAL_RANGE_M = [0.001, 10] as const;
const DEPTH = 1e5; // orthographic depth range in pixels, far beyond any object

export interface ThreeRendererOptions {
  canvas: HTMLCanvasElement;
  /** Selfie view: the frame and the objects are drawn flipped horizontally. Default true. */
  mirrored?: boolean;
  onWarning?: (message: string) => void;
  /** A render pass threw; it is skipped for that frame and later passes still run. Default: console.error. */
  onError?: (error: unknown, pass: RenderPass) => void;
}

interface Model { root: Object3D; bounds: Vec3; material: string }

/**
 * Draws the input frame as a background and each object at its pose, then runs the passes.
 *
 * Coordinates: Pose.position x,y are normalized image coordinates (origin top-left) and map to the same
 * fraction of the canvas; z is MediaPipe-style relative depth in image-width units (smaller = nearer).
 * Size: one model meter spans `pose.scale × canvas height` pixels. Pose.scale is the tracked face (or shoulder)
 * width in image-height units over its real width in meters (core's REFERENCE_FACE_WIDTH_M /
 * REFERENCE_SHOULDER_WIDTH_M), so at scale 1 a 0.14 m model is exactly as wide as the face.
 * The frame is stretched to the canvas: give the canvas the frame's aspect ratio.
 * Passes receive `rendered` = the output HTMLCanvasElement; read it synchronously inside `apply` (e.g. drawImage).
 */
export class ThreeRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly mirrored: boolean;
  private readonly onWarning?: (message: string) => void;
  private readonly renderer: WebGPURenderer;
  private readonly passes: PassPipeline;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, -1, -DEPTH, DEPTH);
  /** Image space in pixels with y negated; flipped on x for the selfie view so frame, objects, and occluder stay aligned. */
  private readonly world = new Group();
  private readonly frame = new Texture();
  private readonly background: Mesh;
  private readonly occluder = createOccluder();
  private occluderPose?: Pose;
  private readonly models = new Map<string, Model>();
  private lastModel?: Model;
  private readonly instances = new Map<string, { group: Group; model: Model }>();
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(opts: ThreeRendererOptions) {
    this.canvas = opts.canvas;
    this.mirrored = opts.mirrored ?? true;
    this.onWarning = opts.onWarning;
    this.passes = new PassPipeline(opts.onError);
    this.renderer = new WebGPURenderer({ canvas: opts.canvas, antialias: true });
    this.frame.flipY = false; // ImageBitmap ignores flipY on WebGL, so flip with UVs instead
    this.frame.colorSpace = SRGBColorSpace;
    const plane = new PlaneGeometry(1, 1).translate(0.5, -0.5, 0);
    const uv = plane.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.background = new Mesh(plane, new MeshBasicMaterial({ map: this.frame, depthTest: false, depthWrite: false, side: DoubleSide }));
    this.background.renderOrder = -2;
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(1, 1, 2);
    this.scene.add(new HemisphereLight(0xffffff, 0x404040, 1.5), sun, this.world);
    this.world.add(this.background, this.occluder);
    this.resize(opts.canvas.width || 1, opts.canvas.height || 1);
  }

  /** Which backend is drawing: WebGPU, or the WebGL 2 fallback. Valid after init(). */
  get backend(): "webgpu" | "webgl2" {
    return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl2";
  }

  async init(): Promise<void> {
    await this.renderer.init();
  }

  async loadModel(url: string): Promise<string> {
    let root: Object3D;
    try {
      root = (await new GLTFLoader().loadAsync(url)).scene;
    } catch (e) {
      throw new PlaceItError("model-invalid", `cannot load model ${url}: ${(e as Error)?.message ?? e}`);
    }
    const size = new Box3().setFromObject(root).getSize(new Vector3());
    const diagonal = size.length();
    if (!(diagonal > 0) || !Number.isFinite(diagonal)) {
      disposeTree(root);
      throw new PlaceItError("model-invalid", `model ${url} has zero-size or non-finite bounds`);
    }
    const [min, max] = MODEL_DIAGONAL_RANGE_M;
    const clamped = Math.min(max, Math.max(min, diagonal));
    if (clamped !== diagonal) {
      root.scale.multiplyScalar(clamped / diagonal);
      size.multiplyScalar(clamped / diagonal);
      this.onWarning?.(`model ${url} is ${diagonal} m across (bounding-box diagonal); scaled to ${clamped} m`);
    }
    let material = "";
    root.traverse((o) => {
      if (!material && (o as Mesh).isMesh) material = [(o as Mesh).material].flat()[0]?.name ?? "";
    });
    const id = `model-${this.models.size}`;
    this.lastModel = { root, bounds: size.toArray(), material };
    this.models.set(id, this.lastModel);
    return id;
  }

  /** Objects use the model whose id equals their id, else the most recently loaded model. */
  render(input: FrameInput, objects: RenderObject[]): void {
    if (this.disposed) return;
    this.setFrame(input.handle as TexImageSource);
    for (const { group } of this.instances.values()) group.visible = false;
    const ctxObjects = objects.map((o) => {
      const model = this.models.get(o.id) ?? this.lastModel;
      if (model) this.place(this.instance(o.id, model), o.pose, o.mirrored);
      return { id: o.id, pose: o.pose, bounds: model?.bounds ?? ([0, 0, 0] as Vec3), material: model?.material ?? "" };
    });
    this.place(this.occluder, this.occluderPose);
    this.renderer.render(this.scene, this.camera);
    this.passes.run({ input, rendered: this.canvas, objects: ctxObjects });
  }

  /** Head proxy for occlusion: pose of the head centre (same conventions as objects); undefined hides it. */
  setOccluder(pose: Pose | undefined): void {
    this.occluderPose = pose;
  }

  addPass(pass: RenderPass): void {
    this.passes.add(pass);
  }

  /** Canvas size in device pixels; objects keep their normalized positions. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
    this.background.scale.set(width, height, 1);
    this.world.scale.x = this.mirrored ? -1 : 1;
    this.world.position.x = this.mirrored ? width : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of this.models.values()) disposeTree(m.root);
    disposeTree(this.scene);
    this.renderer.dispose();
  }

  private setFrame(handle: TexImageSource): void {
    if (this.frame.image !== handle) {
      this.frame.dispose(); // drop the old GPU texture: the new source may have another size
      this.frame.image = handle;
      this.frame.needsUpdate = true;
    } else if (handle instanceof HTMLVideoElement) {
      this.frame.needsUpdate = true;
    }
  }

  private instance(id: string, model: Model): Group {
    let inst = this.instances.get(id);
    if (inst?.model !== model) {
      inst?.group.removeFromParent();
      inst = { group: new Group().add(model.root.clone()), model };
      this.instances.set(id, inst);
      this.world.add(inst.group);
    }
    return inst.group;
  }

  private place(obj: Object3D, pose: Pose | undefined, mirrored = false): void {
    obj.visible = pose?.visible ?? false;
    if (!pose?.visible) return;
    const [x, y, z] = pose.position;
    const px = pose.scale * this.height;
    obj.position.set(x * this.width, -y * this.height, -z * this.width);
    obj.quaternion.set(...pose.rotation);
    obj.scale.set(mirrored ? -px : px, px, px);
  }
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    mesh.geometry?.dispose();
    for (const m of [mesh.material ?? []].flat()) {
      for (const v of Object.values(m)) if (v instanceof Texture) v.dispose();
      m.dispose();
    }
  });
}
