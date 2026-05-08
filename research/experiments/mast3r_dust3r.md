# MASt3R / DUSt3R Experiment

Goal: estimate cross-session relative geometry from image pairs or short image sets.

## Model Details

MASt3R (Matching And Stereo 3D Reconstruction) from NAVER LABS Europe.
Successor to DUSt3R. Unifies dense matching and 3D reconstruction.

## Setup

1. The repository has been cloned to `research/models/mast3r`.
2. Submodules (DUSt3R, CroCo) have been initialized.
3. The python environment `research/vggt_venv` includes all necessary dependencies.
   - Run `bash research/scripts/setup_vggt.sh` to ensure it's ready.

## Pair Manifest

Generate candidate pairs:

```bash
python3 research/scripts/make_pair_manifest.py \
  output/research-captures/session_a \
  output/research-captures/session_b \
  output/experiments/pairs/session_a_session_b.json \
  --stride 2 \
  --max-pairs 50
```

## MASt3R Test

Run dense matching on the manifest:

```bash
python3 research/scripts/run_mast3r_on_pairs.py output/experiments/pairs/session_a_session_b.json
```

## Success Criteria

- Top image pairs have dense correspondences on real surfaces (>500 matches).
- Cross-session matches survive viewpoint change.
- RANSAC can estimate a stable relative pose from multiple frame pairs.
- Failure cases are explainable: blank walls, motion blur, reflective surfaces, too little overlap.
