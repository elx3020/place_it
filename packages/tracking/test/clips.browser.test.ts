import { computePlacements } from "@place-it/core";
import { describe, expect, it } from "vitest";
import { MediaPipeTracker } from "../src";

type Pt = { x: number; y: number };
interface Labels {
  tolerance: number;
  clips: Record<string, { frames: { timeMs: number; face?: Record<string, Pt>; pose?: Record<string, Pt> }[] }>;
}

const clips = import.meta.glob("../fixtures/*.mp4", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const labelFiles = import.meta.glob("../fixtures/labels.json", { import: "default", eager: true }) as Record<string, Labels>;
const labels = Object.values(labelFiles)[0];
const byName = Object.fromEntries(Object.entries(clips).map(([p, url]) => [p.split("/").pop()!, url]));

const STEP_MS = 100;

async function run(url: string, needs: ("face" | "pose")[]) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await new Promise((r, j) => ((video.onloadeddata = r), (video.onerror = () => j(new Error(`cannot load ${url}`)))));
  const tracker = new MediaPipeTracker();
  await tracker.init(needs);
  const frames = [];
  try {
    for (let t = 0; t < video.duration * 1000; t += STEP_MS) {
      video.currentTime = t / 1000;
      await new Promise((r) => (video.onseeked = r));
      frames.push({ timeMs: t, frame: await tracker.track({ handle: video, width: video.videoWidth, height: video.videoHeight, timestampMs: t }) });
    }
  } finally {
    tracker.dispose();
  }
  return frames;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

if (Object.keys(byName).length === 0) {
  describe.skip("tracking clips (SKIPPED: no .mp4 clips in packages/tracking/fixtures/, see fixtures/README.md)", () => {
    it("needs clips", () => {});
  });
} else {
  describe("tracking clips", () => {
    for (const [name, url] of Object.entries(byName)) {
      it(`${name}: detection, labels, placement snapshot`, { timeout: 120_000 }, async () => {
        const needs = name.startsWith("neck") ? (["face", "pose"] as const) : (["face"] as const);
        const frames = await run(url, [...needs]);
        if (name.startsWith("face-front")) {
          const rate = frames.filter((f) => f.frame.faces.length > 0).length / frames.length;
          expect(rate).toBeGreaterThanOrEqual(0.95);
        }
        for (const l of labels?.clips[name]?.frames ?? []) {
          const f = frames.reduce((a, b) => (Math.abs(b.timeMs - l.timeMs) < Math.abs(a.timeMs - l.timeMs) ? b : a)).frame;
          const aspect = f.imageSize.width / f.imageSize.height;
          const check = (got: Pt | undefined, want: Pt) => {
            expect(got).toBeDefined();
            expect(Math.hypot((got!.x - want.x) * aspect, got!.y - want.y)).toBeLessThanOrEqual(labels!.tolerance);
          };
          for (const [i, p] of Object.entries(l.face ?? {})) check(f.faces[0]?.[Number(i)], p);
          for (const [i, p] of Object.entries(l.pose ?? {})) check(f.pose?.[Number(i)], p);
        }
        const placements = frames.map(({ frame }) =>
          [
            ...computePlacements({ version: 1, target: "ear", anchor: [0, 0, 0] }, frame),
            ...computePlacements({ version: 1, target: "neck", anchor: [0, 0, 0] }, frame),
          ].map((p) => ({ v: p.visible, p: p.position.map(round), s: round(p.scale) })),
        );
        expect(placements).toMatchSnapshot();
      });
    }
  });
}
