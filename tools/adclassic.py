#!/usr/bin/env python3
"""
adclassic.py - export artwork from the After Dark 3.x modules.

The 4.0 and 10th-anniversary modules keep their animation in the RLE container
that adart.py decodes.  The older 3.x ones don't: they store plain Windows DIBs
in resource type 0x7005, and a directory in resource type 15 that gives each one
a name:

    \x12\x00\x05\xf0\x01\x80 DIB\0 MARBLES\0     -> type 0x7005, id 1, "MARBLES"
    \x12\x00\x05\xf0\x02\x80 DIB\0 MMARBLE\0     -> type 0x7005, id 2, "MMARBLE"
    \x0b\x00\x05\xf0\x64\x00 DIB\0\0             -> type 0x7005, id 100, unnamed

Each entry is <u16 length><u16 type><u16 id><u16 flags> then two NUL-terminated
strings, the class and the name.  Names beginning with M are the 1-bit AND masks
for the image of the same name: MMARBLE masks MARBLES.  Everything else is
keyed off palette index 0, which the modules paint as transparent.

Usage:
    python3 tools/adclassic.py AD40/CLASSIC/MARBLES2.AD -o all/art/marbles2
    python3 tools/adclassic.py 'AD40/CLASSIC/*.AD' --list
"""

import argparse
import glob
import io
import json
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name

DIB_TYPE = "TYPE_28677"      # 0x7005
DIR_TYPE = "TYPE_15"
TEXT_TYPE = "TYPE_2000"
SETTING_TYPE = "TYPE_1000"


def read_directory(buf):
    """Resource type 15: {id: name} for everything the module declares."""
    names, p = {}, 0
    while p + 6 <= len(buf):
        length, rtype, rid = struct.unpack_from("<HHH", buf, p)
        if length < 6 or p + length > len(buf):
            break
        cls, _, rest = buf[p + 6:p + length].partition(b"\0")
        name = rest.split(b"\0")[0]
        if cls == b"DIB" and name:
            names[rid & 0x7FFF] = name.decode("cp1252")
        p += length
    return names


def strings(buf):
    """Readable runs out of a text resource, which is padded with junk."""
    return [s for s in re.split(rb"\0+", buf) if len(s) > 3 and
            all(32 <= c < 127 or c in (10, 13) for c in s)]


def load_dibs(path):
    kind, res = extract(path)
    names = {}
    for r in res:
        if type_name(r.type) == DIR_TYPE:
            names.update(read_directory(r.data))
    dibs = []
    for r in res:
        if type_name(r.type) == DIB_TYPE and r.data[:2] == b"BM":
            rid = r.id if isinstance(r.id, int) else 0
            dibs.append((rid, names.get(rid, str(rid)), r.data))
    return kind, names, dibs, res


def to_rgba(data, mask=None):
    """Palette index 0 is transparent unless a 1-bit AND mask says otherwise."""
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("P")
    out = im.convert("RGB").convert("RGBA")
    if mask is None:
        alpha = bytes(0 if v == 0 else 255 for v in im.getdata())
    else:
        mim = Image.open(io.BytesIO(mask)).convert("P")
        mw, mh = mim.size
        mpx = list(mim.getdata())
        # One cell of mask tiles across the strip; index 0 shows the background.
        alpha = bytes(0 if mpx[(y % mh) * mw + (x % mw)] == 0 else 255
                      for y in range(im.height) for x in range(im.width))
    out.putalpha(Image.frombytes("L", im.size, alpha))
    return out


def pair_masks(dibs):
    """MMARBLE is the mask for MARBLES. Returns {name: mask bytes} and the masks."""
    by_name = {n.upper(): d for _, n, d in dibs}
    masks, used = {}, set()
    for upper, data in by_name.items():
        if not upper.startswith("M") or len(upper) < 2:
            continue
        stem = upper[1:]
        for other in by_name:
            if other != upper and other.startswith(stem):
                masks[other] = data
                used.add(upper)
    return masks, used


def export(path, outdir):
    kind, names, dibs, res = load_dibs(path)
    if not dibs:
        return None
    os.makedirs(outdir, exist_ok=True)

    masks, mask_names = pair_masks(dibs)
    index = {"module": os.path.splitext(os.path.basename(path))[0],
             "format": "dib", "bitmaps": {}}

    for rid, name, data in dibs:
        upper = name.upper()
        if upper in mask_names:
            continue                                  # this one is a mask
        im = to_rgba(data, masks.get(upper))
        key = name.lower()
        im.save(os.path.join(outdir, "%s.png" % key))
        index["bitmaps"][key] = {"w": im.width, "h": im.height,
                                 "id": rid, "file": "%s.png" % key}

    text = []
    for r in res:
        if type_name(r.type) in (TEXT_TYPE,):
            text += [s.decode("cp1252") for s in strings(r.data)]
    if text:
        index["text"] = text[:4]

    with open(os.path.join(outdir, "index.json"), "w") as fh:
        json.dump(index, fh, indent=1)
    return index


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("modules", nargs="+")
    ap.add_argument("-o", "--out")
    ap.add_argument("--list", action="store_true",
                    help="report what each module holds instead of exporting")
    args = ap.parse_args()

    paths = []
    for m in args.modules:
        paths += sorted(glob.glob(m)) or [m]

    for p in paths:
        try:
            kind, names, dibs, res = load_dibs(p)
        except Exception as exc:                       # noqa: BLE001
            print("%-18s error: %s" % (os.path.basename(p), exc))
            continue
        if args.list:
            if dibs:
                from PIL import Image
                shape = " ".join(
                    "%s(%dx%d)" % (n, *Image.open(io.BytesIO(d)).size)
                    for _, n, d in dibs[:8])
                print("%-18s %2d DIB  %s%s" % (os.path.basename(p), len(dibs),
                                               shape, " ..." if len(dibs) > 8 else ""))
            continue
        out = args.out or os.path.join("all", "art",
                                       os.path.splitext(os.path.basename(p))[0].lower())
        index = export(p, out)
        print("%-18s -> %s (%d bitmaps)" %
              (os.path.basename(p), out, len(index["bitmaps"]) if index else 0))


if __name__ == "__main__":
    main()
