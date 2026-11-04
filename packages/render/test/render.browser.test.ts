import { PlaceItError, type FrameInput, type PassContext, type Pose, type RenderObject } from "@place-it/core";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import emptyUrl from "../fixtures/empty.glb?url";
import hugeUrl from "../fixtures/huge.glb?url";
import sphereUrl from "../fixtures/sphere.glb?url";
import stillUrl from "../fixtures/still.png";
import { ThreeRenderer } from "../src";

const pose = (x: number, y: number, more: Partial<Pose> = {}): Pose =>
  ({ position: [x, y, 0], rotation: [0, 0, 0, 1], scale: 1.5, visible: true, ...more });
const bead = (p: Pose): RenderObject[] => [{ id: "ear-0", pose: p, mirrored: false }];

let renderers: ThreeRenderer[] = [];
afterEach(() => {
  for (const r of renderers) { r.dispose(); r.dispose(); } // dispose is idempotent
  renderers = [];
  document.body.replaceChildren();
});

async function setup(width = 320, height = 240, mirrored?: boolean, onWarning?: (m: string) => void) {
  const img = new Image();
  img.src = stillUrl;
  await img.decode();
  const input: FrameInput = { handle: img, width: img.naturalWidth, height: img.naturalHeight, timestampMs: 0 };
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.style.display = "block";
  document.body.append(canvas);
  const r = new ThreeRenderer({ canvas, mirrored, onWarning });
  renderers.push(r);
  await r.init();
  console.info(`render backend: ${r.backend}`);
  // Captures the frame from inside a pass, which also checks that passes run after drawing and get the canvas.
  const shot: { pixels?: ImageData; objects?: PassContext["objects"] } = {};
  r.addPass({
    name: "capture",
    apply: ({ rendered, objects }) => {
      shot.objects = objects;
      const c = rendered as HTMLCanvasElement;
      const ctx = Object.assign(document.createElement("canvas"), { width: c.width, height: c.height }).getContext("2d")!;
      ctx.drawImage(c, 0, 0);
      shot.pixels = ctx.getImageData(0, 0, c.width, c.height);
    },
  });
  return { r, canvas, input, shot };
}

/** Count and normalized centroid of the red bead's pixels (the still image has no red). */
function red(img: ImageData) {
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, g, b] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
    if (r > 40 && r > 2 * g && r > 2 * b) { n++; sx += (i / 4) % img.width; sy += Math.floor(i / 4 / img.width); }
  }
  return { n, x: (sx / n + 0.5) / img.width, y: (sy / n + 0.5) / img.height };
}

/** Asserts the RGB at (x, y) is within 3 of `rgb` (sRGB round trips may be off by one). */
function expectPixel(img: ImageData, x: number, y: number, rgb: number[]) {
  const got = [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
  expect(Math.max(...got.map((v, i) => Math.abs(v - rgb[i]!))), `pixel ${x},${y} = ${got}`).toBeLessThanOrEqual(3);
}

describe("ThreeRenderer", () => {
  it("draws the model at a fixed pose over a still image, mirrored, matching the baseline", async () => {
    const { r, canvas, input, shot } = await setup();
    await r.loadModel(sphereUrl);
    r.render(input, bead(pose(0.3, 0.4)));
    const c = red(shot.pixels!);
    expect(c.n).toBeGreaterThan(100);
    // mirrored selfie view: x flips for the frame and the object alike
    expect(c.x).toBeCloseTo(0.7, 1);
    expect(c.y).toBeCloseTo(0.4, 1);
    expectPixel(shot.pixels!, 5, 5, [60, 160, 90]); // the image's top-right (green) quadrant is now top-left
    // Screenshot a 2D copy of the captured pixels: WebKit shows the presented WebGL canvas blank in element screenshots.
    const copy = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height });
    copy.style.display = "block";
    copy.getContext("2d")!.putImageData(shot.pixels!, 0, 0);
    document.body.append(copy);
    await expect.element(page.elementLocator(copy)).toMatchScreenshot("sphere-over-still", {
      comparatorName: "pixelmatch",
      comparatorOptions: { allowedMismatchedPixelRatio: 0.02 },
    });
  });

  it("draws a <video> frame (a plain texture over a video element would be 0x0 and black)", async () => {
    const { r, shot } = await setup();
    const src = Object.assign(document.createElement("canvas"), { width: 64, height: 48 });
    const g = src.getContext("2d")!;
    g.fillStyle = "rgb(40,80,160)";
    g.fillRect(0, 0, 64, 48);
    const video = Object.assign(document.createElement("video"), { srcObject: src.captureStream(30), muted: true });
    await video.play();
    while (video.readyState < 2) await new Promise((res) => setTimeout(res, 20));
    r.render({ handle: video, width: 64, height: 48, timestampMs: 0 }, []);
    expectPixel(shot.pixels!, 160, 120, [40, 80, 160]);
  });

  it("keeps the image orientation when not mirrored", async () => {
    const { r, input, shot } = await setup(320, 240, false);
    await r.loadModel(sphereUrl);
    r.render(input, bead(pose(0.3, 0.4)));
    expect(red(shot.pixels!).x).toBeCloseTo(0.3, 1);
    expectPixel(shot.pixels!, 5, 5, [40, 80, 160]);
  });

  it("rejects a zero-size model with model-invalid", async () => {
    const { r } = await setup();
    const err = await r.loadModel(emptyUrl).catch((e) => e);
    expect(err).toBeInstanceOf(PlaceItError);
    expect(err.code).toBe("model-invalid");
  });

  it("scales an absurdly large model down to the 10 m limit and warns", async () => {
    const warnings: string[] = [];
    const { r, input, shot } = await setup(320, 240, true, (m) => warnings.push(m));
    await r.loadModel(hugeUrl);
    r.render(input, bead(pose(0.5, 0.5)));
    expect(warnings).toHaveLength(1);
    expect(Math.hypot(...shot.objects![0]!.bounds)).toBeCloseTo(10, 3);
  });

  for (const [label, w, h] of [["portrait", 180, 320], ["landscape", 320, 180]] as const) {
    it(`keeps the object at the same normalized position after resize (${label})`, async () => {
      const { r, input, shot } = await setup();
      await r.loadModel(sphereUrl);
      r.render(input, bead(pose(0.3, 0.4)));
      const before = red(shot.pixels!);
      r.resize(w, h);
      r.render(input, bead(pose(0.3, 0.4)));
      const after = red(shot.pixels!);
      expect([shot.pixels!.width, shot.pixels!.height]).toEqual([w, h]);
      expect(Math.abs(after.x - before.x)).toBeLessThan(0.02);
      expect(Math.abs(after.y - before.y)).toBeLessThan(0.02);
      expect(Math.abs(after.x - 0.7)).toBeLessThan(0.02);
      expect(Math.abs(after.y - 0.4)).toBeLessThan(0.02);
    });
  }

  it("hides invisible poses and objects behind the head occluder", async () => {
    const { r, input, shot } = await setup();
    await r.loadModel(sphereUrl);
    r.render(input, bead(pose(0.5, 0.5, { visible: false })));
    expect(red(shot.pixels!).n).toBe(0);
    r.setOccluder(pose(0.5, 0.5, { position: [0.5, 0.5, -0.2] })); // head in front of the bead
    r.render(input, bead(pose(0.5, 0.5)));
    expect(red(shot.pixels!).n).toBe(0);
    expectPixel(shot.pixels!, 150, 110, [60, 160, 90]); // occluder draws no colour: frame shows through
    r.setOccluder(undefined);
    r.render(input, bead(pose(0.5, 0.5)));
    expect(red(shot.pixels!).n).toBeGreaterThan(100);
  });
});
