# Training and evaluation data

Checked 2026-11-03 via web search. Licenses change; re-verify each source before training anything that ships. Rule: shipped weights only from data whose license allows commercial use.

## Plan

1. **Pose (ears, shoulders):** COCO Keypoints. Annotations are CC BY 4.0. Images come from Flickr under mixed licenses, so filter by the per-image `license` field, or get legal review.
2. **Ear landmarks:** AudioEar2D (2,000 images, 55 landmarks, CC BY 4.0). Its images are indexed against FFHQ; check those image terms first.
3. **Synthetic:** render heads with known ear positions using the render package. Owned data, ground truth for free.
4. **Own clips:** consented recordings, labelled with `packages/tracking/fixtures/label-tool.html`.

## Research benchmarks only (not for shipped weights)

- I-BUG In-the-Wild Ears (605 images, 55 landmarks): license not found.
- York 3D Ear Dataset / Ear Model: non-commercial research and education only.
- WFLW, 300W: license not confirmed; treat as research-only.
- FFHQ, CelebA: non-commercial.

## Excluded

- MPII Human Pose: the BSD license covers annotations and code, but commercial use is not allowed (no image copyright).

## Sources

- https://huggingface.co/datasets/HuggingFaceM4/COCO/blob/main/README.md
- https://arxiv.org/pdf/2111.02374v4
- https://arxiv.org/pdf/2311.13397
- https://www-users.york.ac.uk/~np7/research/YEM
- https://mpi-inf.mpg.de/departments/computer-vision-and-machine-learning/software-and-datasets/mpii-human-pose-dataset/download
