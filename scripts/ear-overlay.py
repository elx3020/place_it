"""Draw ear-labels.json points over their images for a quick visual check.

usage: python3 scripts/ear-overlay.py <ear-labels.json> <images_dir> <out_dir>
Images are looked up as <images_dir>/<clip>/<timeMs>.jpg (or .png). Colour: green visible, yellow occluded, red absent.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

COLOURS = {2: "lime", 1: "yellow", 0: "red"}
labels_path, images, out = map(Path, sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
data = json.loads(labels_path.read_text())
assert data["version"] == 1, "unknown ear-labels version"
for clip, entry in data["clips"].items():
    for frame in entry["frames"]:
        stem = images / clip / str(frame["timeMs"])
        src = next((p for p in (stem.with_suffix(".jpg"), stem.with_suffix(".png")) if p.exists()), None)
        if src is None:
            print("missing image for", clip, frame["timeMs"]); continue
        im = Image.open(src).convert("RGB")
        d = ImageDraw.Draw(im)
        for side, pts in frame["ears"].items():
            for i, p in pts.items():
                x, y = p["x"] * im.width, p["y"] * im.height
                d.ellipse((x - 3, y - 3, x + 3, y + 3), outline=COLOURS[p["v"]], width=2)
                d.text((x + 5, y - 5), f"{side[0]}{i}", fill=COLOURS[p["v"]])
        dst = out / f"{clip}-{frame['timeMs']}.png"
        im.save(dst)
        print("wrote", dst)
