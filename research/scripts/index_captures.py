#!/usr/bin/env python3
"""Index browser/native capture folders and report whether they are usable."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def summarize_session(session_dir: Path) -> dict:
    frames_dir = session_dir / "frames"
    frames = sorted(frames_dir.glob("*.jpg"))
    metadata = load_jsonl(session_dir / "metadata.jsonl")
    has_pose = 0
    has_intrinsics = 0
    has_projection = 0
    has_depth = 0
    sources: dict[str, int] = {}

    for row in metadata:
        tracking = row.get("tracking") or {}
        if row.get("pose") or tracking.get("worldFromCamera"):
            has_pose += 1
        if row.get("intrinsics"):
            has_intrinsics += 1
        if row.get("projection") or tracking.get("projectionMatrix"):
            has_projection += 1
        if tracking.get("hasDepth"):
            has_depth += 1
        source = row.get("source") or "unknown"
        sources[source] = sources.get(source, 0) + 1

    return {
        "session": session_dir.name,
        "path": str(session_dir),
        "frames": len(frames),
        "metadata_rows": len(metadata),
        "pose_rows": has_pose,
        "intrinsics_rows": has_intrinsics,
        "projection_rows": has_projection,
        "depth_rows": has_depth,
        "sources": sources,
        "usable_for_vggt": len(frames) >= 2,
        "usable_for_metric_arcore": len(frames) >= 2 and has_pose >= 2 and has_intrinsics >= 2,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("roots", nargs="*", default=["output/research-captures", "output/native-captures"])
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    sessions = []
    for root in args.roots:
        root_path = Path(root)
        if not root_path.exists():
            continue
        for metadata in root_path.rglob("metadata.jsonl"):
            sessions.append(summarize_session(metadata.parent))

    sessions.sort(key=lambda row: row["path"])
    if args.json:
        print(json.dumps(sessions, indent=2))
        return

    if not sessions:
        print("No capture sessions found.")
        return

    for row in sessions:
        print(f"{row['session']}")
        print(f"  path: {row['path']}")
        print(f"  frames: {row['frames']} metadata: {row['metadata_rows']}")
        print(f"  pose/projection/intrinsics/depth: {row['pose_rows']}/{row['projection_rows']}/{row['intrinsics_rows']}/{row['depth_rows']}")
        print(f"  sources: {row['sources']}")
        print(f"  VGGT: {'yes' if row['usable_for_vggt'] else 'no'} | metric ARCore: {'yes' if row['usable_for_metric_arcore'] else 'no'}")


if __name__ == "__main__":
    main()
