import os
import sys
import argparse
import json
import torch
import torch.nn.functional as F
from pathlib import Path
import numpy as np
from PIL import Image

# Add VGGT to path
# Assuming the script is in research/scripts/ and vggt is in research/models/vggt/
SCRIPTS_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPTS_DIR.parent.parent
VGGT_PATH = REPO_ROOT / "research" / "models" / "vggt"
sys.path.append(str(VGGT_PATH))

from vggt.models.vggt import VGGT
from vggt.utils.load_fn import load_and_preprocess_images_square
from vggt.utils.pose_enc import pose_encoding_to_extri_intri

def run_vggt_on_session(session_path: Path, output_path: Path):
    # Detect device
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    
    print(f"Using device: {device}")
    
    # Initialize the model
    print("Loading VGGT-1B model...")
    model = VGGT.from_pretrained("facebook/VGGT-1B").to(device)
    model.eval()
    
    # Load images
    frames_dir = session_path / "frames"
    image_paths = sorted(list(frames_dir.glob("*.jpg")))
    if not image_paths:
        print(f"No frames found in {frames_dir}")
        return
        
    print(f"Found {len(image_paths)} frames. Preprocessing...")
    images = load_and_preprocess_images_square([str(p) for p in image_paths]).to(device)
    
    print("Running inference...")
    with torch.no_grad():
        # Predict attributes
        # VGGT expects [B, N, 3, H, W] where N is number of frames
        input_images = images[None] 
        
        aggregated_tokens_list, ps_idx = model.aggregator(input_images)
        pose_enc = model.camera_head(aggregated_tokens_list)[-1]
        
        # Extrinsic and intrinsic matrices
        # pose_encoding_to_extri_intri(pose_enc, img_size)
        extrinsic, intrinsic = pose_encoding_to_extri_intri(pose_enc, input_images.shape[-2:])
        
        # Predict Depth Maps
        depth_map, depth_conf = model.depth_head(aggregated_tokens_list, input_images, ps_idx)

    # Save results
    output_path.mkdir(parents=True, exist_ok=True)
    
    # extrinsic: [1, N, 4, 4]
    # intrinsic: [1, N, 3, 3]
    # depth_map: [1, N, H, W]
    
    ext_np = extrinsic.squeeze(0).cpu().numpy()
    int_np = intrinsic.squeeze(0).cpu().numpy()
    depth_np = depth_map.squeeze(0).cpu().numpy()
    conf_np = depth_conf.squeeze(0).cpu().numpy()
    
    np.save(output_path / "extrinsics.npy", ext_np)
    np.save(output_path / "intrinsics.npy", int_np)
    np.save(output_path / "depth_maps.npy", depth_np)
    np.save(output_path / "depth_conf.npy", conf_np)
    
    # Save camera poses in a more readable format (JSON)
    poses = []
    for i, frame_path in enumerate(image_paths):
        poses.append({
            "frame": frame_path.name,
            "extrinsic": ext_np[i].tolist(),
            "intrinsic": int_np[i].tolist()
        })
    
    with open(output_path / "poses.json", "w") as f:
        json.dump(poses, f, indent=2)
    
    print(f"Successfully processed {len(image_paths)} frames.")
    print(f"Results saved to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run VGGT on a capture session.")
    parser.add_argument("session", help="Path to the session directory (containing frames/)")
    parser.add_argument("--output", help="Optional output path")
    args = parser.parse_args()
    
    session = Path(args.session)
    if not session.exists():
        print(f"Error: Session path {session} does not exist.")
        sys.exit(1)
        
    if args.output:
        out = Path(args.output)
    else:
        out = REPO_ROOT / "output" / "experiments" / "vggt" / session.name
        
    run_vggt_on_session(session, out)
