#!/usr/bin/env python3
"""Export native ARCore capture metadata to a minimal COLMAP text model.

This is for downstream geometry tools that can consume camera intrinsics and
known poses. It writes cameras.txt, images.txt, points3D.txt, and copies images.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def qvec_from_arcore(row: dict) -> tuple[float, float, float, float]:
    pose = row["pose"]
    # ARCore stores x,y,z,w. COLMAP text uses qw,qx,qy,qz.
    return pose["qw"], pose["qx"], pose["qy"], pose["qz"]


def tvec_from_arcore(row: dict) -> tuple[float, float, float]:
    pose = row["pose"]
    return pose["tx"], pose["ty"], pose["tz"]


def normalize_quaternion(q: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    norm = math.sqrt(sum(v * v for v in q)) or 1.0
    return tuple(v / norm for v in q)  # type: ignore[return-value]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("session", help="Capture session directory with frames/ and metadata.jsonl")
    parser.add_argument("out", help="Output COLMAP text directory")
    args = parser.parse_args()

    session = Path(args.session)
    out = Path(args.out)
    images_out = out / "images"
    sparse_out = out / "sparse"
    images_out.mkdir(parents=True, exist_ok=True)
    sparse_out.mkdir(parents=True, exist_ok=True)

    rows = [row for row in load_jsonl(session / "metadata.jsonl") if row.get("intrinsics") and row.get("pose")]
    if not rows:
        raise SystemExit("No rows with native ARCore intrinsics + pose found.")

    first = rows[0]
    intr = first["intrinsics"]
    camera_id = 1
    camera_line = f"{camera_id} PINHOLE {intr['width']} {intr['height']} {intr['fx']} {intr['fy']} {intr['cx']} {intr['cy']}\n"
    (sparse_out / "cameras.txt").write_text(
        "# CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]\n" + camera_line
    )

    image_lines = ["# IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME\n", "# POINTS2D[] as (X, Y, POINT3D_ID)\n"]
    for image_id, row in enumerate(rows, start=1):
        frame_name = row["frameName"]
        src = session / "frames" / frame_name
        if src.exists():
            shutil.copy2(src, images_out / frame_name)
        qw, qx, qy, qz = normalize_quaternion(qvec_from_arcore(row))
        tx, ty, tz = tvec_from_arcore(row)
        image_lines.append(f"{image_id} {qw} {qx} {qy} {qz} {tx} {ty} {tz} {camera_id} {frame_name}\n")
        image_lines.append("\n")

    (sparse_out / "images.txt").write_text("".join(image_lines))
    (sparse_out / "points3D.txt").write_text("# Empty: no triangulated points exported yet.\n")
    print(f"Wrote COLMAP text model to {out}")


if __name__ == "__main__":
    main()
