// Writes the render test fixtures: fixtures/sphere.glb, huge.glb (oversized), empty.glb (zero-size bounds), still.png.
// Hand-written GLB and PNG encoders so no extra dependency is needed. Run: pnpm --filter @place-it/render fixtures
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const out = new URL("../fixtures/", import.meta.url);
const pad4 = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);

/** GLB with one mesh: positions (+ normals) and uint16 indices, one PBR material. */
function glb({ positions, normals, indices, color, name }) {
  const pos = Buffer.from(new Float32Array(positions).buffer);
  const nor = Buffer.from(new Float32Array(normals).buffer);
  const idx = pad4(Buffer.from(new Uint16Array(indices).buffer), 0);
  const bin = Buffer.concat([pos, nor, idx]);
  const min = [0, 1, 2].map((a) => Math.min(...positions.filter((_, i) => i % 3 === a)));
  const max = [0, 1, 2].map((a) => Math.max(...positions.filter((_, i) => i % 3 === a)));
  const count = positions.length / 3;
  const json = {
    asset: { version: "2.0", generator: "place_it make-fixtures.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 0.5 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nor.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nor.length, byteLength: indices.length * 2, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
  };
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  const body = Buffer.concat([chunk(jsonChunk, 0x4e4f534a), chunk(bin, 0x004e4942)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** UV sphere centred at the origin. */
function sphere(radius, widthSegs, heightSegs) {
  const positions = [], normals = [], indices = [];
  for (let y = 0; y <= heightSegs; y++) {
    const theta = (y / heightSegs) * Math.PI;
    for (let x = 0; x <= widthSegs; x++) {
      const phi = (x / widthSegs) * 2 * Math.PI;
      const n = [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
      normals.push(...n);
      positions.push(...n.map((v) => v * radius));
    }
  }
  for (let y = 0; y < heightSegs; y++) {
    for (let x = 0; x < widthSegs; x++) {
      const a = y * (widthSegs + 1) + x, b = a + widthSegs + 1;
      if (y !== 0) indices.push(a, b, a + 1);
      if (y !== heightSegs - 1) indices.push(a + 1, b, b + 1);
    }
  }
  return { positions, normals, indices };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** 8-bit RGB PNG from a pixel function. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 5 cm red bead: at Pose.scale 1 it spans 10% of the canvas height (see three-renderer.ts).
writeFileSync(new URL("sphere.glb", out), glb({ ...sphere(0.05, 24, 16), color: [0.9, 0.05, 0.05, 1], name: "red" }));
// 50 m radius ball: bounding-box diagonal 173 m, beyond the 10 m clamp.
writeFileSync(new URL("huge.glb", out), glb({ ...sphere(50, 8, 6), color: [0.9, 0.05, 0.05, 1], name: "huge" }));
// One degenerate triangle at the origin: valid glTF, zero-size bounds.
writeFileSync(new URL("empty.glb", out), glb({ positions: Array(9).fill(0), normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2], color: [1, 1, 1, 1], name: "empty" }));
// 320x240 still with four distinct, non-red quadrants so mirroring is visible and red pixels belong to the model.
const quadrants = [[40, 80, 160], [60, 160, 90], [120, 120, 120], [200, 190, 60]];
writeFileSync(new URL("still.png", out), png(320, 240, (x, y) => quadrants[(y < 120 ? 0 : 2) + (x < 160 ? 0 : 1)]));
console.log("wrote sphere.glb, huge.glb, empty.glb, still.png");
