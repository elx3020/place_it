# Ear crop model: labeling plan (step 1)

Status: proposal, nothing built. Context: research on 2026-11-04 concluded that an ear-crop model with per-landmark visibility fits earlobe placement and occlusion better than a depth network. Data sources and licenses: `docs/training-data.md`.

## Goal of this step

Get ~150-300 labeled frames of our own footage, in a format that trains a small model and also scores the current MediaPipe-based placement, so we can tell whether the approach is worth the runtime work.

## Scope decision: no pixel mask in v1

Per-landmark visibility already drives the two product behaviours (hide or fade the earring; fall back when the lobe is covered). Hand-painting hair/ear masks costs minutes per frame; clicking 8 points costs seconds. The mask head can be added later, trained on a public hair/face parsing set or on masks produced by a model from our labels. Not needed to answer "does it work".

## Landmarks (per ear, 8 points)

| id | name | where |
| --- | --- | --- |
| 0 | helix_top | highest point of the outer rim |
| 1 | helix_back | rearmost point of the rim |
| 2 | lobe_bottom | lowest point of the lobe |
| 3 | lobe_pierce | where an earring hangs: lobe centre, ~4 mm above the bottom edge |
| 4 | lobe_front | where the lobe meets the cheek/jaw |
| 5 | tragus | the flap in front of the ear canal |
| 6 | antitragus | bump opposite the tragus, above the lobe |
| 7 | helix_root | where the top rim joins the head |

`lobe_pierce` is the target we care about; the rest give the model shape context and scale. Each ear gets its own set, side = subject's left/right (not image side).

## Visibility per point (COCO convention)

- `2` visible
- `1` occluded: the position is estimated from the ear's shape (hair, hand, hat, mask strap, the head itself on the far side)
- `0` not present / cannot guess (e.g. far ear fully hidden when the head is turned 70 degrees)

Occluded points get a best-guess position so the model learns shape, and the visibility value tells the runtime not to trust it.

## File: `ear-labels.json` (separate from `labels.json`)

```json
{
  "version": 1,
  "clips": {
    "turn-hair-down.mp4": {
      "frames": [
        {
          "timeMs": 3200,
          "ears": {
            "left":  { "0": { "x": 0.61, "y": 0.34, "v": 2 }, "3": { "x": 0.62, "y": 0.47, "v": 1 } },
            "right": { "0": { "x": 0.28, "y": 0.35, "v": 2 } }
          },
          "tags": ["hair-down", "yaw-40"]
        }
      ]
    }
  }
}
```

- Coordinates: normalised 0-1 of the raw frame, origin top-left, unmirrored (same as `labels.json`). Labels stay in full-frame space; the training script cuts the ear crop itself from MediaPipe face landmarks, so crop rules can change without relabeling.
- A missing point means "not labelled"; `v: 0` means "labelled as absent". An ear with no entry is skipped for that frame.
- `tags` are free text used to balance and slice results (hair state, yaw bin, glasses, hand).

## Tooling

Extend `packages/tracking/fixtures/label-tool.html` (single file, no server), not a new tool:

1. Add the 8 ear landmarks per side to the landmark picker.
2. Visibility on number keys 0/1/2; Shift-click is not needed.
3. Auto-advance to the next landmark after each click; arrow keys step frames.
4. Optional tag box applied to the current frame.
5. Export writes `ear-labels.json`; import resumes an earlier session.

## Footage to record (consent required, per `fixtures/README.md`)

- 3 or more people, varied hair length and ear size, at least one with ears normally covered.
- Per person: hair down, hair tucked behind ears, one clip with glasses, one with a hand passing near the ear.
- Slow yaw sweep ±70 degrees and a pitch sweep (looking down about 30 degrees), since those are the cases that failed in the tracking demo.
- Landscape and portrait, per the existing guidelines.

## Frame sampling

Pick frames by pose bin rather than uniformly: yaw (-70..70 in 20-degree bins) × pitch (down/level/up) × hair (down/tucked), roughly 5 frames per bin. A small script can pick candidate timestamps from the MediaPipe face matrices in the clip.

## Effort estimate

300 frames × 2 ears × 8 points is about 4,800 clicks (a few hours). Start with 150 frames and one person to check the tool and the label definitions before the full run.

## Automation (decided 2026-11-04: 8 points, Colab notebook for training)

Hand labeling shrinks to correcting a model's guesses. Three sources, in order of build:

1. **Synthetic from Blender** (ground truth for free). Render heads with varied ears, skin, hair (down, tucked, partly over the ear), hats, hands, glasses, lighting and camera yaw/pitch. The 8 landmarks are vertex ids on the ear mesh, projected by the camera. Visibility comes from a ray test: a point is `2` if a ray from the camera reaches it, `1` if something else is hit first within ~1 cm, `0` if it faces away. Output goes straight to `ear-labels.json` plus the images. Risk: domain gap to real webcams, so it only pretrains.
2. **Public data** (AudioEar2D, CC BY 4.0, 55 points; keep the 8 matching ours). Check image terms first (`docs/training-data.md`).
3. **Self-training loop on our real clips.** Train on 1+2, run on real frames, keep high-confidence predictions as pseudo-labels, and queue only the low-confidence or disagreeing frames for hand correction in the label tool. Then retrain.

Not planned: asking a vision LLM to place the points. Its pointing is not precise to a few pixels, so it would produce labels needing as much correction as clicking from scratch.

## Hardware

RTX 5080 (16 GB) is more than enough: a model this small trains in minutes to an hour, and Blender Cycles will render thousands of frames overnight. It needs a recent PyTorch build with CUDA 12.8 or later (Blackwell); older builds fail to run on it. Deliverable is a Colab notebook (data download, train, export ONNX, evaluate against the real-clip labels) so it also runs on the 5080 PC through a local Jupyter.

## Open questions

1. Heads for Blender: MPFB/MakeHuman base meshes (outputs are said to be CC0, to verify) or your own models?
2. Which hair setups can you build in Blender (particle or geometry-node hair)? Hair over the ear is the main case to cover.
