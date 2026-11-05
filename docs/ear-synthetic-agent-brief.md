# Brief for the Blender agent (give this to the agent that has the Blender MCP)

Read `docs/ear-synthetic-data.md` (the spec) and `docs/ear-model-labeling.md` (landmarks, visibility, file format) first. Blender 5.2.x LTS; check API names against the installed version instead of assuming older ones.

## Deliverables, in order. Stop after each and show the result.

1. **`landmarks.json`**: for the MPFB base mesh, the vertex ids of the 8 landmarks per ear (names and meanings in `ear-model-labeling.md`). The human marks them on the first head; you record the ids and verify on two other generated identities that they land on the same anatomical spots (render a close-up with the points drawn).
2. **Hair node groups** (geometry nodes), exposed inputs: length, volume, parting side, `cover` (0 tucked behind the ear, 1 covers the lobe), strand thickness, colour. Evaluated geometry must be raycastable. Show 6 variants rendered from the front and at 60 degrees yaw. The human judges realism against the reference photos.
3. **`generate.py`**, run as `blender -b scene.blend -P generate.py -- --seed N --count M --out DIR`:
   - random MPFB identity, skin material, hair variant, optional occluders (hand, hat, glasses, headphones, mask strap), HDRI + background, 1 to 3 lights;
   - camera: yaw ±80, pitch -40..+30, roll ±15, horizontal FOV 60-80 degrees, webcam-like framing;
   - writes `DIR/images/<seed>/<index>.jpg` (post-processed to look like a webcam: noise, blur, JPEG) and a depth pass;
   - writes `DIR/ear-labels.json` in the format of `ear-labels.json` in `ear-model-labeling.md`, with tags derived from the parameters (hair cover, yaw bin, occluders).
   - Visibility rule: ~16 rays from the camera into a ~3 mm disc around each landmark; arrive-first fraction >= 0.7 is `2`, < 0.3 is `1`, surface facing away is `0`; cross-check against the depth pass and report disagreements.
   - Same seed and count must reproduce identical output.
4. **20-frame check**: run with `--count 20`, then `python3 scripts/ear-overlay.py DIR/ear-labels.json DIR/images DIR/overlay` and show the overlays. Do not scale up until the human approves.

## Rules

- Everything the script needs is in the repo or the `.blend`; no network at render time.
- Only CC0 or self-made assets; record each asset's source and license in `assets.md`.
- Keep parameters (ranges, thresholds) in one config block at the top of `generate.py`.
- If something in the spec turns out wrong or impossible, say so and propose a change; do not silently work around it.
