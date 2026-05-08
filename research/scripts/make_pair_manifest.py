#!/usr/bin/env python3
"""Create an image-pair manifest between two capture sessions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def frames(session: Path) -> list[Path]:
    return sorted((session / "frames").glob("*.jpg"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("session_a")
    parser.add_argument("session_b")
    parser.add_argument("out")
    parser.add_argument("--stride", type=int, default=1)
    parser.add_argument("--max-pairs", type=int, default=200)
    args = parser.parse_args()

    a = frames(Path(args.session_a))[:: max(1, args.stride)]
    b = frames(Path(args.session_b))[:: max(1, args.stride)]
    pairs = []

    for image_a in a:
      for image_b in b:
        pairs.append({
            "image_a": str(image_a),
            "image_b": str(image_b),
            "session_a": str(Path(args.session_a)),
            "session_b": str(Path(args.session_b)),
        })
        if len(pairs) >= args.max_pairs:
            break
      if len(pairs) >= args.max_pairs:
        break

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"pairs": pairs}, indent=2))
    print(f"Wrote {len(pairs)} pairs to {out}")


if __name__ == "__main__":
    main()
