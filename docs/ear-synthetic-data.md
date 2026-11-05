# Synthetic ear data from Blender (spec, proposal)

Status: not built. Part of `docs/ear-model-labeling.md` (8 landmarks per ear, visibility 0/1/2, output `ear-labels.json`).

## Principle: the agent builds the generator once; a script renders the data

Use an agent with a Blender MCP server for the interactive, judgment-heavy work: creating the hair geometry-node groups, checking they look plausible, fixing problems. Do not put the agent in the loop of thousands of renders (slow, costly, not reproducible). The agent's output is a seeded Python script run headless, e.g. `blender -b scene.blend -P generate.py -- --seed 7 --count 500`. Same seed, same dataset.

## Pipeline

1. **Identities (MPFB).** Randomise macro sliders (age, gender, weight, height, ethnicity-related skin and face shapes) and the ear modifiers MPFB exposes; random skin material (tone, roughness, subsurface). Target 100+ identities.
2. **Landmarks.** MPFB base meshes share one topology, so the 8 landmark vertex ids per ear are marked once and stay valid for every identity. Check this holds after the modifiers and any proxy/helper changes (to verify on the first import).
3. **Hair (geometry nodes).** A small set of node groups with parameters: length, volume, parting side, how far hair falls over the ear (0 = tucked, 1 = covers the lobe), strand thickness, colour. Hair must be evaluated geometry so the occlusion test sees it. The agent builds and previews these; you judge realism.
4. **Occluders.** Hand near the ear, hat, glasses, headphones, mask straps, scarf. Randomly on or off.
5. **Scene.** Random HDRI and background, 1 to 3 lights, webcam-like focal length (60 to 80 degrees horizontal FOV), head yaw ±80, pitch -40 to +30, roll ±15, distance and framing like a webcam.
6. **Render.** Eevee for speed, Cycles if hair looks wrong. Save RGB plus a depth pass. Post-process to look like a webcam: noise, blur, JPEG/H.264 compression, white balance shift, low resolution.
7. **Labels.** Project each landmark with the camera matrix. Visibility: cast ~16 rays from the camera to points spread in a ~3 mm disc around the landmark. Fraction of rays that arrive first: 0.7 or more gives `v=2`, below 0.3 gives `v=1` (blocked by hair, hand, head), and a point whose surface normal faces away from the camera gives `v=0`. Cross-check against the depth pass. Thin strands are partial occluders, hence the fraction. Thresholds are my first guess, to tune by eye on real frames.
8. **Output.** Images plus `ear-labels.json` in the format already defined, with tags (`hair-covers`, `yaw-40`, ...) taken from the scene parameters.

## Known risks

- **Domain gap.** Synthetic skin and hair look different from real webcams. Expect to pretrain on this, then fine-tune on real frames. Whether the gap is acceptable is an experiment, not an assumption.
- **MediaPipe on synthetic faces.** Runtime crops come from MediaPipe face landmarks, which may fail on rendered faces. For training, derive the crop from the known mesh points that correspond to 234/454, and add random crop shift and scale so the model tolerates real MediaPipe noise.
- **Hair realism.** Hair over the ear is the case we most want and the one synthetic data does worst. This is why the self-training loop on real clips stays in the plan.
- **Licensing.** MPFB output is believed to be CC0 and assets (HDRIs, hats, hands) must be CC0 or ours; verify each before shipping weights.

## Gate before bulk rendering

1. Render 20 frames; overlay the labels and check them by eye (placement and visibility).
2. Render 2,000 frames; train a tiny model; measure error on the real labeled frames (150 from `ear-labels.json`).
3. Only if step 2 is promising, scale to 10,000+ frames.

## What I need to build it

- Blender version and where the MCP server runs (the RTX 5080 PC is the natural place).
- A first MPFB head imported, so the vertex ids can be marked.
- Your call on the hair look targets (3 or 4 reference photos is enough).
