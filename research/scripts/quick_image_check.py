#!/usr/bin/env python3
"""Detect black/blank captures quickly without heavy dependencies."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path


def jpeg_payload_size(path: Path) -> int:
    return path.stat().st_size


def mean_pgm_brightness(path: Path) -> float | None:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "thumb.pgm"
        result = subprocess.run(
            ["sips", "-s", "format", "pgm", "-z", "32", "32", str(path), "--out", str(out)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode != 0 or not out.exists():
            return None

        data = out.read_bytes()
        lines = data.splitlines()
        if not lines or lines[0] != b"P5":
            return None

        payload_start = 0
        header_items = 0
        for idx, line in enumerate(lines):
            if line.startswith(b"#"):
                continue
            header_items += len(line.split())
            if header_items >= 4:
                payload_start = sum(len(item) + 1 for item in lines[: idx + 1])
                break

        payload = data[payload_start:]
        return sum(payload) / max(1, len(payload))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("session")
    parser.add_argument("--min-bytes", type=int, default=15_000)
    parser.add_argument("--min-brightness", type=float, default=8.0)
    args = parser.parse_args()

    frames = sorted((Path(args.session) / "frames").glob("*.jpg"))
    if not frames:
        raise SystemExit("No jpg frames found.")

    small = []
    for frame in frames:
        size = jpeg_payload_size(frame)
        brightness = mean_pgm_brightness(frame)
        verdict = "ok"
        if size < args.min_bytes or (brightness is not None and brightness < args.min_brightness):
            verdict = "suspicious"
        brightness_label = "n/a" if brightness is None else f"{brightness:.1f}"
        print(f"{frame.name}: {size} bytes mean={brightness_label} {verdict}")
        if verdict == "suspicious":
            small.append(frame.name)

    if small:
        raise SystemExit(f"Suspicious small/blank frames: {', '.join(small)}")


if __name__ == "__main__":
    main()
