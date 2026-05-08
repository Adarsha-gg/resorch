import os
import sys
import argparse
import json
import torch
from pathlib import Path
import numpy as np
from PIL import Image

# Add MASt3R and DUSt3R to path
SCRIPTS_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPTS_DIR.parent.parent
MAST3R_PATH = REPO_ROOT / "research" / "models" / "mast3r"
sys.path.append(str(MAST3R_PATH))
sys.path.append(str(MAST3R_PATH / "dust3r"))

# Fix for DUSt3R imports
import mast3r.utils.path_to_dust3r

from mast3r.model import AsymmetricMASt3R
from mast3r.fast_nn import extract_correspondences_nonsym
from dust3r.image_pairs import load_images

def run_mast3r_on_manifest(manifest_path: Path, output_path: Path):
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    
    print(f"Using device: {device}")
    
    with open(manifest_path, "r") as f:
        data = json.load(f)
    
    pairs = data["pairs"]
    print(f"Processing {len(pairs)} pairs")
    
    print("Loading MASt3R model...")
    # This will download weights if not present
    model = AsymmetricMASt3R.from_pretrained("naver/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric").to(device)
    model.eval()
    
    output_path.mkdir(parents=True, exist_ok=True)
    results = []
    
    for i, pair in enumerate(pairs):
        img_a_path = REPO_ROOT / pair["image_a"]
        img_b_path = REPO_ROOT / pair["image_b"]
        
        if not img_a_path.exists() or not img_b_path.exists():
            print(f"Skipping missing pair: {img_a_path.name} or {img_b_path.name}")
            continue

        print(f"[{i+1}/{len(pairs)}] Matching {img_a_path.name} vs {img_b_path.name}")
        
        # Load images
        imgs = load_images([str(img_a_path), str(img_b_path)], size=512)
        
        # Inference
        with torch.no_grad():
            # AsymmetricMASt3R forward takes view1, view2 as dicts
            view1 = imgs[0]
            view2 = imgs[1]
            # Move to device
            view1 = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in view1.items()}
            view2 = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in view2.items()}
            
            res1, res2 = model(view1, view2)
            
        # Extract correspondences
        # extract_correspondences_nonsym(A, B, confA, confB, subsample=8, device=None, ptmap_key='pred_desc', pixel_tol=0)
        corres = extract_correspondences_nonsym(res1['desc'].squeeze(0), res2['desc'].squeeze(0), 
                                               res1['conf'].squeeze(0), res2['conf'].squeeze(0), 
                                               subsample=8, device=device)
        
        xy1, xy2, conf = corres
        num_matches = len(xy1)
        mean_conf = conf.mean().item() if num_matches > 0 else 0
        
        print(f"  Found {num_matches} matches (mean conf: {mean_conf:.3f})")
        
        results.append({
            "image_a": pair["image_a"],
            "image_b": pair["image_b"],
            "num_matches": num_matches,
            "mean_confidence": mean_conf
        })
        
        # Save results incrementally
        with open(output_path / "matching_results.json", "w") as f:
            json.dump(results, f, indent=2)

    print(f"Done. Summary saved to {output_path / 'matching_results.json'}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run MASt3R matching on a pairs manifest.")
    parser.add_argument("manifest", help="Path to the pairs manifest JSON")
    args = parser.parse_args()
    
    manifest = Path(args.manifest)
    if not manifest.exists():
        print(f"Error: Manifest {manifest} does not exist.")
        sys.exit(1)
        
    out = REPO_ROOT / "output" / "experiments" / "mast3r" / manifest.stem
    run_mast3r_on_manifest(manifest, out)
