#!/usr/bin/env python3
"""
adclassic.py - export artwork from the After Dark 3.x modules.

The 4.0 and 10th-anniversary modules keep their animation in the RLE container
that adart.py decodes.  The older 3.x ones don't: they store plain Windows DIBs.
Which resource type they file them under varies - MARBLES2 uses the numbered
0x7005, FLOCKS and CONFETTI a type literally named DIB, REBOUND splits its balls
across MICT/QICT/SICT - so this sniffs for the BM signature instead of trusting
the type.

Where a module ships a type 15 directory it also names them:

    \x12\x00\x05\xf0\x01\x80 DIB\0 MARBLES\0     -> type 0x7005, id 1, "MARBLES"
    \x12\x00\x05\xf0\x02\x80 DIB\0 MMARBLE\0     -> type 0x7005, id 2, "MMARBLE"
    \x0b\x00\x05\xf0\x64\x00 DIB\0\0             -> type 0x7005, id 100, unnamed

Each entry is <u16 length><u16 type><u16 id> then two NUL-terminated strings,
the class and the name.  Names beginning with M are the 1-bit AND masks for the
image of the same name: MMARBLE masks MARBLES.  Everything else gets its
transparency from whichever palette index runs round the edge of the bitmap,
which is index 0 in some modules and index 15 in others.

Usage:
    python3 tools/adclassic.py AD40/CLASSIC/MARBLES2.AD -o all/art/marbles2
    python3 tools/adclassic.py 'AD40/CLASSIC/*.AD' --list
"""

import argparse
import collections
import glob
import io
import json
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name

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
        if name:
            names[rid & 0x7FFF] = name.decode("cp1252")
        p += length
    return names


def strings(buf):
    """Readable runs out of a text resource, which is padded with junk."""
    return [s for s in re.split(rb"\0+", buf) if len(s) > 3 and
            all(32 <= c < 127 or c in (10, 13) for c in s)]


def load_dibs(path):
    """Every resource holding a DIB, whatever type it was filed under.

    The type is not consistent across the library: MARBLES2 uses the numbered
    0x7005, FLOCKS and CONFETTI use a type literally named DIB, REBOUND splits
    its balls across MICT/QICT/SICT by size. Sniffing the BM signature catches
    all of them. Where a module ships a type 15 directory it also names them.
    """
    kind, res = extract(path)
    names = {}
    for r in res:
        if type_name(r.type) == DIR_TYPE:
            names.update(read_directory(r.data))

    holders = {type_name(r.type) for r in res if r.data[:2] == b"BM"}
    dibs = []
    for r in res:
        if r.data[:2] != b"BM":
            continue
        rid = r.id if isinstance(r.id, int) else 0
        label = names.get(rid) or (str(r.id) if len(holders) == 1
                                   else "%s-%s" % (type_name(r.type).lower(), r.id))
        dibs.append((rid, label, r.data))
    return kind, names, dibs, res


def border_index(im):
    """Whichever palette index runs round the outside is the background.

    It is not the same one everywhere: Marbles paints its pins on index 0,
    Flocks paints its birds on index 15. Reading it off the edge gets both,
    and any sprite that genuinely fills its own bitmap edge to edge is one
    we would not want to punch holes in anyway.
    """
    w, h = im.size
    px = list(im.getdata())
    edge = collections.Counter()
    for x in range(w):
        edge[px[x]] += 1
        edge[px[(h - 1) * w + x]] += 1
    for y in range(h):
        edge[px[y * w]] += 1
        edge[px[y * w + w - 1]] += 1
    index, count = edge.most_common(1)[0]
    return index if count > (w + h) else None


def to_rgba(data, mask=None):
    """Knock out the background index, unless a 1-bit AND mask says otherwise."""
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("P")
    out = im.convert("RGB").convert("RGBA")
    if mask is None:
        bg = border_index(im)
        alpha = bytes(0 if v == bg else 255 for v in im.getdata())
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


def parse_ids(spec):
    """"900,1000-1118" -> a test for which resource ids to keep."""
    wanted = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            lo, hi = part.split("-", 1)
            wanted.append((int(lo), int(hi)))
        elif part:
            wanted.append((int(part), int(part)))
    return lambda rid: any(lo <= rid <= hi for lo, hi in wanted)


def export(path, outdir, keep=None):
    kind, names, dibs, res = load_dibs(path)
    if keep:
        dibs = [d for d in dibs if keep(d[0])]
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
    ap.add_argument("--ids",
                    help="only export these resource ids, e.g. 900,1000-1118")
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
        index = export(p, out, parse_ids(args.ids) if args.ids else None)
        print("%-18s -> %s (%d bitmaps)" %
              (os.path.basename(p), out, len(index["bitmaps"]) if index else 0))


if __name__ == "__main__":
    main()
