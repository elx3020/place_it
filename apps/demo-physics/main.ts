import { WorkerPhysics } from "@place-it/physics";
import workerUrl from "@place-it/physics/worker?url";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const status = document.getElementById("status")!;
const ctx = canvas.getContext("2d")!;
const SCALE = 100; // px per metre; world origin at canvas bottom-centre
const toPx = (x: number, y: number): [number, number] => [canvas.width / 2 + x * SCALE, canvas.height - y * SCALE];

const physics = new WorkerPhysics({ workerUrl });
try {
  await physics.init();
} catch (e) {
  status.textContent = `Physics failed: ${(e as Error).message}`;
  throw e;
}
status.textContent = "Move the mouse or touch: the kinematic sphere pushes the falling one.";

const R = 0.4;
const pointer = physics.addBody({ kind: "kinematic", position: [0, 1, 0], radius: R });
const ball = physics.addBody({ kind: "dynamic", position: [0, 4, 0], radius: 0.3 });
const circle = (id: number, r: number, color: string) => {
  const p = physics.readPositions().get(id)!;
  const [px, py] = toPx(p[0], p[1]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, r * SCALE, 0, Math.PI * 2);
  ctx.fill();
};

canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * canvas.width;
  const y = ((e.clientY - r.top) / r.height) * canvas.height;
  physics.setKinematicTarget(pointer, [(x - canvas.width / 2) / SCALE, (canvas.height - y) / SCALE, 0]);
});

let last = performance.now();
const frame = (now: number) => {
  physics.step(now - last);
  last = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  circle(pointer, R, "#4af");
  circle(ball, 0.3, "#fa4");
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
