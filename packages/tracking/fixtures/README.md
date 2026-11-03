# Tracking fixtures

Clips live here (stored in Git LFS, see `.gitattributes`). Until they exist, `test/clips.browser.test.ts` skips with a message.

## Required files

| File | Content |
| --- | --- |
| `face-front.mp4` | One person facing the camera, still, then small head movements |
| `face-turn.mp4` | One person turning the head slowly left, then right (about 60 degrees each way) |
| `neck-shoulders.mp4` | One person, head and both shoulders visible, upper body still or swaying slightly |
| `labels.json` | Hand-labelled frames (format below) |

## Recording guidelines

- Only people who consented to their footage being stored in this repo.
- 5-10 s per clip, 720p, H.264 MP4, no audio needed.
- Good, even lighting; plain background; no heavy glasses glare.
- Record each clip in landscape (1280x720). Also record portrait (720x1280) variants as `<name>-portrait.mp4`; they are tested too when present.

## labels.json

Create it with `label-tool.html` in this folder: open the file in a browser (no server needed), load the clips, click landmarks on chosen frames, then Export and save the result here as `labels.json`.

```json
{
  "tolerance": 0.03,
  "clips": {
    "face-front.mp4": {
      "frames": [
        { "timeMs": 1000, "face": { "152": { "x": 0.5, "y": 0.8 }, "234": { "x": 0.3, "y": 0.5 } } }
      ]
    },
    "neck-shoulders.mp4": {
      "frames": [
        { "timeMs": 2000, "pose": { "11": { "x": 0.6, "y": 0.9 }, "12": { "x": 0.4, "y": 0.9 } } }
      ]
    }
  }
}
```

- `timeMs`: position in the clip. `face` keys are face-mesh landmark indices, `pose` keys are pose landmark indices.
- `x`, `y`: normalised (0-1) image coordinates of the hand-labelled point.
- `tolerance`: maximum allowed distance (normalised, in image-height units) between tracked and labelled point.
- Clips without an entry in `labels.json` only get the detection-rate and placement-snapshot checks.
