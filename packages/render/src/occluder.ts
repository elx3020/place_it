import { Mesh, MeshBasicMaterial, SphereGeometry } from "three/webgpu";

/** Head-proxy half-extents in meters (ear to ear, chin to crown, nose to back), roughly an adult head. */
export const HEAD_RADII_M = [0.075, 0.11, 0.095] as const;

/** Depth-only ellipsoid: writes depth but no colour, so object parts behind the head are hidden while the camera image shows through. */
export function createOccluder(): Mesh {
  const mesh = new Mesh(new SphereGeometry(1, 32, 16).scale(...HEAD_RADII_M), new MeshBasicMaterial({ colorWrite: false }));
  mesh.renderOrder = -1; // after the background, before the objects
  mesh.visible = false;
  return mesh;
}
