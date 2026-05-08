# VGGT Experiment

Goal: verify whether captured image sequences contain recoverable camera geometry.

## Model Details

VGGT (Visual Geometry Grounded Transformer) from Meta AI (CVPR 2025).
A feed-forward model that estimates:
- 9D Camera Poses & Intrinsics
- Dense Depth Maps
- 3D Point Maps
- Dense Point Tracks

## Setup

1. The repository has been cloned to `research/models/vggt`.
2. Run the setup script:
   ```bash
   bash research/scripts/setup_vggt.sh
   ```
3. Activate the environment:
   ```bash
   source research/vggt_venv/bin/activate
   ```

## Run Shape

1. Point VGGT at a session's `frames/` folder.
2. Use `demo_colmap.py` or a custom script to export poses.
3. Compare against ARCore metadata.

Example for a research session:

```bash
python3 research/scripts/run_vggt_on_session.py output/research-captures/2026-05-08T07-28-12-047Z-leyst3
```

## Success Criteria

- Predicted poses are coherent over one sequence.
- Relative motion direction matches ARCore pose direction.
- Two sessions from the same target area produce overlapping geometry.
- Solved session transform is stable under frame subsampling.
