import { computePlacements, type Landmark, type TrackingFrame } from "@place-it/core";
import { Group, Object3D, Vector3 } from "three";
import { expect, it } from "vitest";

// Carried check from the render task: does Pose.rotation turn the object the same way as the head on screen, mirrored or not?
// MediaPipe's face matrix maps the canonical face (+Z out of the nose) into camera space: x image-right, y up, z toward the camera.
// A head turned so the nose points image-right is a rotation about +Y; its column-major matrix is below.
const yaw = 0.5;
const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
const matrix = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -40, 1];

const lm = (x: number, y: number): Landmark => ({ x, y, z: 0 });
const face = Array.from({ length: 478 }, () => lm(0.5, 0.5));
face[234] = lm(0.4, 0.5);
face[454] = lm(0.6, 0.5);
face[1] = lm(0.56, 0.5); // nose tip, shifted image-right by the turn
const frame: TrackingFrame = { timestampMs: 0, imageSize: { width: 640, height: 480 }, faces: [face], faceMatrices: [matrix] };
const [pose] = computePlacements({ version: 1, target: "ear", anchor: [0, 0, 0] }, frame);

/** Same scene graph as ThreeRenderer: image space in a `world` group flipped on x for the selfie view. */
function onScreen(mirrored: boolean) {
  const W = 640;
  const world = new Group();
  world.scale.x = mirrored ? -1 : 1;
  world.position.x = mirrored ? W : 0;
  const obj = new Object3D();
  obj.quaternion.set(...pose!.rotation);
  const nose = new Object3D();
  nose.position.x = face[1]!.x * W;
  const centre = new Object3D();
  centre.position.x = 0.5 * W;
  world.add(obj, nose, centre);
  world.updateMatrixWorld();
  return {
    front: new Vector3(0, 0, 1).transformDirection(obj.matrixWorld).x,
    nose: nose.getWorldPosition(new Vector3()).x - centre.getWorldPosition(new Vector3()).x,
  };
}

it("rotation reads the face matrix: the model's front (+Z) turns toward the nose", () => {
  expect(pose!.visible).toBe(true);
  const front = new Vector3(0, 0, 1).applyQuaternion(new Object3D().quaternion.set(...pose!.rotation));
  expect(front.toArray().map((n) => +n.toFixed(6))).toEqual([+s.toFixed(6), 0, +c.toFixed(6)]);
});

it.each([false, true])("on screen (mirrored %s) the object turns the same way as the head image", (mirrored) => {
  const { front, nose } = onScreen(mirrored);
  expect(Math.sign(front)).toBe(Math.sign(nose));
  expect(Math.sign(front)).toBe(mirrored ? -1 : 1);
});
