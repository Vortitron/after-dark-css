#!/usr/bin/env python3
"""
adart.py - decode After Dark sprite artwork.

Every module in the library, 16-bit and 32-bit alike, stores its animation in
the same big-endian container that Berkeley Systems brought over from the Mac:

    RLID header                       32 bytes, +12 = offset of first chunk
      CSTM x nframes                  one RLE-compressed frame each
      CTAB                            233 x 4-byte colour index remap
      IHDR x nframes                  12-byte payload, (height << 16) | width

and a sibling resource (RDAT / TYPE_8001 / TYPE_32517) holds the sequence
header, whose little-endian words at 40..48 are width, height, ?, ncolors,
nframes.

The RLE itself is a byte stream where the LOW nibble picks an operation and
the HIGH nibble is usually its operand. This is a transcription of the 8-bit
blitter's jump table in ADXPL510.DLL (CODE:0x431014):

    0  end of row
    1  skip N transparent pixels          N = hi, or next byte when hi == 0
    2  run of <next byte> pixels          colour = map[hi]
    3  1 pixel                            colour = map[hi]
    4  2 pixels                           colour = map[hi]
    5  3 pixels                           colour = map[hi]
    6  run of N pixels                    N = hi or next byte; colour = map[next byte]
    7  hi == 0: N = next byte pixels, packed two 4-bit indices per byte
    8  N pixels alternating map[hi nibble] / map[lo nibble] of one byte
    9  N pixels alternating map[byte1] / map[byte2]
    10-15  no-op; the byte is skipped (this is how trailing padding is ignored)

Usage:
    python3 tools/adart.py AD40/AD10th/MARBLES.AD -o sprites/
    python3 tools/adart.py AD40/AD10th/*.AD --check
"""

import argparse
import glob
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name

TRANSPARENT = -1

# (artwork resource type, matching sequence-header type)
ART_PAIRS = (
    ("TYPE_8000", "TYPE_8001"),     # 32-bit PE modules
    ("RLEP", "RDAT"),               # 16-bit NE modules, named resources
    ("TYPE_32518", "TYPE_32517"),   # 16-bit NE modules, numbered resources
    ("TYPE_32515", "TYPE_32513"),
)


def read_chunks(buf):
    """Split an RLID container. Chunk length at +12 spans the 16-byte header."""
    if buf[:4] != b"RLID" or len(buf) < 32:
        return None
    out, p = [], struct.unpack_from(">I", buf, 12)[0]
    while p + 16 <= len(buf):
        tag = buf[p:p + 4]
        if not tag.isalpha():
            break
        length = struct.unpack_from(">I", buf, p + 12)[0]
        if length < 16:
            break
        out.append((tag, buf[p + 16:p + length]))
        p += length
    return out


def decode_frame(src, width, height):
    """Run the opcode stream. Returns a height x width grid of colour indices."""
    rows = [[TRANSPARENT] * width for _ in range(height)]
    i, y = 0, 0
    row = rows[0] if height else []
    x = 0
    n = len(src)

    def put(idx, count):
        nonlocal x
        for _ in range(count):
            if 0 <= x < width:
                row[x] = idx
            x += 1

    while i < n and y < height:
        b = src[i]; i += 1
        op, hi = b & 0x0F, b >> 4

        if op == 0:                                   # end of row
            y += 1
            if y >= height:
                break
            row, x = rows[y], 0
        elif op == 1:                                 # transparent skip
            if hi == 0:
                if i >= n: break
                hi = src[i]; i += 1
            x += hi
        elif op == 2:                                 # run, length in stream
            if i >= n: break
            put(hi, src[i]); i += 1
        elif op in (3, 4, 5):                         # 1, 2 or 3 pixels
            put(hi, op - 2)
        elif op == 6:                                 # run of one colour
            if i >= n: break
            colour = src[i]; i += 1                   # colour byte comes first
            if hi == 0:
                if i >= n: break
                hi = src[i]; i += 1
            put(colour, hi)
        elif op == 7:
            if hi == 0:                               # literals packed 2 per byte
                if i >= n: break
                count = src[i]; i += 1
                while count >= 2 and i < n:
                    pair = src[i]; i += 1
                    put(pair >> 4, 1)
                    put(pair & 0x0F, 1)
                    count -= 2
                if count == 1 and i < n:
                    put(src[i] >> 4, 1); i += 1       # odd pixel uses the high nibble
            elif hi == 1:                             # run of raw 8-bit indices
                if i >= n: break
                count = src[i]; i += 1
                for _ in range(count):
                    if i >= n: break
                    put(src[i], 1); i += 1
            # hi >= 2 carries no operand
        elif op == 8:                                 # alternating nibble pair
            if hi == 0:
                if i >= n: break
                hi = src[i]; i += 1
            if i >= n: break
            pair = src[i]; i += 1
            a, b2 = pair >> 4, pair & 0x0F
            for k in range(hi):
                put(a if k % 2 == 0 else b2, 1)
        elif op == 9:                                 # alternating byte pair
            if hi == 0:
                if i >= n: break
                hi = src[i]; i += 1
            if i + 1 >= n: break
            a, b2 = src[i], src[i + 1]; i += 2
            for k in range(hi):
                put(a if k % 2 == 0 else b2, 1)
        # ops 10-15: the byte is simply skipped

    return rows


def read_ctab(chunks):
    """CTAB holds one record per colour the sequence uses: a system-palette
    index followed by the literal R, G, B it wants."""
    for tag, payload in chunks:
        if tag == b"CTAB":
            return [tuple(payload[o + 1:o + 4]) for o in range(0, len(payload) - 3, 4)]
    return None


def read_palette(resources):
    """PAL resources are Windows LOGPALETTEs: version, count, then RGBA quads."""
    for r in resources:
        if type_name(r.type) == "PAL" and len(r.data) >= 8:
            count = struct.unpack_from("<H", r.data, 2)[0]
            if 4 + count * 4 > len(r.data):
                continue
            return [tuple(r.data[4 + i * 4:4 + i * 4 + 3]) for i in range(count)]
    return None


def sequences(path):
    """Yield (resource_id, width, height, [frame grids], ctab) per animation."""
    fmt, resources = extract(path)
    by = {}
    for r in resources:
        by.setdefault(type_name(r.type), {})[r.id] = r.data
    palette = read_palette(resources)

    for art_t, hdr_t in ART_PAIRS:
        for rid, data in sorted(by.get(art_t, {}).items(), key=lambda kv: str(kv[0])):
            chunks = read_chunks(data)
            if not chunks:
                continue
            hdr = by.get(hdr_t, {}).get(rid)
            sw = sh = 0
            if hdr and len(hdr) >= 50:
                sw, sh = struct.unpack_from("<2H", hdr, 40)
            dims = [struct.unpack_from(">I", p, 8)[0]
                    for t, p in chunks if t == b"IHDR" and len(p) >= 12]
            dims = [(v & 0xFFFF, v >> 16) for v in dims]
            cstm = [p for t, p in chunks if t == b"CSTM"]

            frames = []
            for i, payload in enumerate(cstm):
                w, h = dims[i] if i < len(dims) else (sw, sh)
                if not w or not h:
                    continue
                frames.append((w, h, decode_frame(payload, w, h)))
            if frames:
                yield rid, sw, sh, frames, read_ctab(chunks), palette


def to_rgba(grid, w, h, ctab, palette):
    """Colour indices -> RGBA bytes, via the sequence's CTAB and the module PAL."""
    out = bytearray(w * h * 4)
    for y in range(h):
        row = grid[y]
        for x in range(w):
            idx = row[x]
            if idx == TRANSPARENT:
                continue
            if ctab and idx < len(ctab):
                rgb = ctab[idx]
            elif palette and idx < len(palette):
                rgb = palette[idx]
            else:
                rgb = (idx, idx, idx)
            o = (y * w + x) * 4
            out[o:o + 4] = bytes((rgb[0], rgb[1], rgb[2], 255))
    return bytes(out)


def save_sheet(path, rid, frames, ctab, palette, outdir):
    from PIL import Image
    cols = min(len(frames), 8)
    rows = (len(frames) + cols - 1) // cols
    cw = max(f[0] for f in frames)
    ch = max(f[1] for f in frames)
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, (w, h, grid) in enumerate(frames):
        im = Image.frombytes("RGBA", (w, h), to_rgba(grid, w, h, ctab, palette))
        sheet.paste(im, ((i % cols) * cw, (i // cols) * ch))
    name = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(outdir, name)
    os.makedirs(dest, exist_ok=True)
    out = os.path.join(dest, "%s.png" % rid)
    sheet.save(out)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modules", nargs="+")
    ap.add_argument("-o", "--outdir", default="sprites")
    ap.add_argument("--check", action="store_true",
                    help="decode everything and report coverage, write nothing")
    args = ap.parse_args()

    paths = []
    for pattern in args.modules:
        paths += sorted(glob.glob(pattern)) or [pattern]

    total = clean = 0
    for path in paths:
        try:
            seqs = list(sequences(path))
        except Exception as e:
            print("%-22s !! %s" % (os.path.basename(path), e))
            continue
        if not seqs:
            continue
        nfr = sum(len(s[3]) for s in seqs)
        filled = 0
        for rid, sw, sh, frames, ctab, palette in seqs:
            for w, h, grid in frames:
                total += 1
                if any(px != TRANSPARENT for row in grid for px in row):
                    filled += 1
                    clean += 1
            if not args.check:
                save_sheet(path, rid, frames, ctab, palette, args.outdir)
        print("%-22s %3d sequences %5d frames  %5d non-empty" %
              (os.path.basename(path), len(seqs), nfr, filled))

    print("\n%d frames, %d with pixels (%.1f%%)" %
          (total, clean, 100.0 * clean / total if total else 0))


if __name__ == "__main__":
    main()
