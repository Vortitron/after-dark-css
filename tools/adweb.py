#!/usr/bin/env python3
"""
adweb.py - export a module's artwork as web assets.

Writes one horizontal sprite strip per animation plus a manifest describing
the frames, so a browser can play the original animation without knowing
anything about After Dark's resource formats.

    python3 tools/adweb.py AD40/AD10th/MARBLES.AD -o all/art/

produces all/art/marbles/8000.png ... and all/art/marbles/index.json:

    {"module": "MARBLES",
     "sequences": {"8000": {"w": 32, "h": 32, "count": 24,
                            "frames": [{"x":0,"y":0,"w":32,"h":32}, ...]}}}

Frames inside one sequence can differ in size (the originals store a tight
bounding box per frame), so every frame gets its own rect and the strip is
laid out on the sequence's maximum height.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adart import sequences, to_rgba


def export(path, outdir, only=None):
    from PIL import Image

    name = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(outdir, name.lower().replace(" ", "-"))
    os.makedirs(dest, exist_ok=True)

    manifest = {"module": name, "sequences": {}}
    for rid, sw, sh, frames, ctab, palette in sequences(path):
        if only and str(rid) not in only:
            continue
        strip_w = sum(f[0] for f in frames)
        strip_h = max(f[1] for f in frames)
        strip = Image.new("RGBA", (strip_w, strip_h), (0, 0, 0, 0))
        rects, x = [], 0
        for w, h, grid in frames:
            strip.paste(Image.frombytes("RGBA", (w, h), to_rgba(grid, w, h, ctab, palette)),
                        (x, 0))
            rects.append({"x": x, "y": 0, "w": w, "h": h})
            x += w
        strip.save(os.path.join(dest, "%s.png" % rid))
        manifest["sequences"][str(rid)] = {
            "w": sw, "h": sh, "count": len(frames), "frames": rects,
        }

    with open(os.path.join(dest, "index.json"), "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    return dest, manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modules", nargs="+")
    ap.add_argument("-o", "--outdir", default="all/art")
    ap.add_argument("--only", help="comma-separated sequence ids to export")
    args = ap.parse_args()

    only = set(args.only.split(",")) if args.only else None
    for path in args.modules:
        dest, manifest = export(path, args.outdir, only)
        print("%-20s %2d sequences -> %s" %
              (manifest["module"], len(manifest["sequences"]), dest))


if __name__ == "__main__":
    main()
