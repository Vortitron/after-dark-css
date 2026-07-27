#!/usr/bin/env python3
"""
adextract.py - pull the resources out of After Dark .AD screensaver modules.

.AD modules are ordinary Windows DLLs: the AD 3.x ones are 16-bit NE, the
AD 4.0 / 10th-anniversary ones are 32-bit PE. Either way the artwork,
palettes and sounds live in the resource table. This walks both formats,
dumps every resource, and converts the bitmaps to PNG.

    python3 tools/adextract.py AD40/AD10th/MARBLES.AD -o extracted/
    python3 tools/adextract.py AD40/AD10th/*.AD --list
"""

import argparse
import io
import os
import struct
import sys

# Standard Windows resource types.
RT = {
    1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG",
    6: "STRING", 7: "FONTDIR", 8: "FONT", 9: "ACCELERATOR",
    10: "RCDATA", 11: "MESSAGETABLE", 12: "GROUP_CURSOR",
    14: "GROUP_ICON", 16: "VERSION", 17: "DLGINCLUDE",
    19: "PLUGPLAY", 20: "VXD", 21: "ANICURSOR", 22: "ANIICON",
    23: "HTML", 24: "MANIFEST",
}


def type_name(tid):
    if isinstance(tid, str):
        return tid
    return RT.get(tid, "TYPE_%d" % tid)


class Resource:
    def __init__(self, rtype, rid, data, lang=0):
        self.type = rtype
        self.id = rid
        self.data = data
        self.lang = lang

    @property
    def label(self):
        return "%s/%s" % (type_name(self.type), self.id)


# ---------------------------------------------------------------- NE (16-bit)

def read_ne(buf, ne_off):
    (align_shift,) = struct.unpack_from("<H", buf, ne_off + 0x32)
    (rsrc_rel,) = struct.unpack_from("<H", buf, ne_off + 0x24)
    (resident_rel,) = struct.unpack_from("<H", buf, ne_off + 0x26)
    if rsrc_rel == 0 or rsrc_rel == resident_rel:
        return []
    tab = ne_off + rsrc_rel
    shift = struct.unpack_from("<H", buf, tab)[0]
    if shift != align_shift:
        shift = align_shift

    def rsrc_string(rel):
        """Names are length-prefixed strings at an offset from the table start."""
        p = tab + rel
        n = buf[p]
        return buf[p + 1:p + 1 + n].decode("cp1252", "replace")

    out = []
    p = tab + 2
    while True:
        (tid,) = struct.unpack_from("<H", buf, p)
        if tid == 0:
            break
        (count,) = struct.unpack_from("<H", buf, p + 2)
        rtype = (tid & 0x7FFF) if (tid & 0x8000) else rsrc_string(tid)
        p += 8
        for _ in range(count):
            off, length, flags, rid = struct.unpack_from("<HHHH", buf, p)
            name = (rid & 0x7FFF) if (rid & 0x8000) else rsrc_string(rid)
            start = off << shift
            out.append(Resource(rtype, name, buf[start:start + (length << shift)]))
            p += 12
    return out


# ---------------------------------------------------------------- PE (32-bit)

def read_pe(buf, pe_off):
    (n_sections,) = struct.unpack_from("<H", buf, pe_off + 6)
    (opt_size,) = struct.unpack_from("<H", buf, pe_off + 20)
    opt = pe_off + 24
    (magic,) = struct.unpack_from("<H", buf, opt)
    dd = opt + (112 if magic == 0x20B else 96)
    rsrc_rva, rsrc_size = struct.unpack_from("<II", buf, dd + 2 * 8)
    if not rsrc_rva:
        return []

    sections = []
    sp = opt + opt_size
    for i in range(n_sections):
        s = sp + i * 40
        vsize, vaddr, rawsize, rawptr = struct.unpack_from("<IIII", buf, s + 8)
        sections.append((vaddr, max(vsize, rawsize), rawptr))

    def rva_to_off(rva):
        for vaddr, size, rawptr in sections:
            if vaddr <= rva < vaddr + size:
                return rawptr + (rva - vaddr)
        return None

    base = rva_to_off(rsrc_rva)
    if base is None:
        return []

    def read_name(off):
        (n,) = struct.unpack_from("<H", buf, base + off)
        return buf[base + off + 2:base + off + 2 + n * 2].decode("utf-16-le", "replace")

    out = []

    def walk(off, depth, rtype=None, rid=None):
        n_named, n_id = struct.unpack_from("<HH", buf, base + off + 12)
        ep = base + off + 16
        for i in range(n_named + n_id):
            name_val, data_off = struct.unpack_from("<II", buf, ep + i * 8)
            key = read_name(name_val & 0x7FFFFFFF) if (name_val & 0x80000000) else name_val
            if data_off & 0x80000000:
                child = data_off & 0x7FFFFFFF
                if depth == 0:
                    walk(child, 1, key, None)
                elif depth == 1:
                    walk(child, 2, rtype, key)
                else:
                    walk(child, 3, rtype, rid)
            else:
                d = base + data_off
                drva, dsize = struct.unpack_from("<II", buf, d)
                doff = rva_to_off(drva)
                if doff is None:
                    continue
                lang = key if depth == 2 else 0
                out.append(Resource(rtype, rid, buf[doff:doff + dsize], lang))

    walk(0, 0)
    return out


def extract(path):
    with open(path, "rb") as f:
        buf = f.read()
    if buf[:2] != b"MZ":
        raise ValueError("not an MZ executable")
    (lfanew,) = struct.unpack_from("<I", buf, 0x3C)
    sig = buf[lfanew:lfanew + 2]
    if sig == b"PE":
        return "PE32", read_pe(buf, lfanew)
    if sig == b"NE":
        return "NE16", read_ne(buf, lfanew)
    raise ValueError("unknown header %r" % sig)


# ---------------------------------------------------------------- conversion

def dib_to_bmp(data):
    """Resource bitmaps are raw DIBs; add the file header a .bmp needs."""
    if len(data) < 4:
        return None
    (hdr_size,) = struct.unpack_from("<I", data, 0)
    if hdr_size == 12:                                    # BITMAPCOREHEADER
        bpp = struct.unpack_from("<H", data, 10)[0]
        n_colors = (1 << bpp) if bpp <= 8 else 0
        pal = n_colors * 3
    elif hdr_size in (40, 52, 56, 108, 124):              # BITMAPINFOHEADER+
        bpp, compression = struct.unpack_from("<HI", data, 14)
        used = struct.unpack_from("<I", data, 32)[0]
        n_colors = used or ((1 << bpp) if bpp <= 8 else 0)
        pal = n_colors * 4
        if compression == 3:                              # BI_BITFIELDS masks
            pal += 12
    else:
        return None
    offset = 14 + hdr_size + pal
    return b"BM" + struct.pack("<IHHI", 14 + len(data), 0, 0, offset) + data


def save_resource(res, outdir, png=True):
    from PIL import Image

    tdir = os.path.join(outdir, type_name(res.type))
    os.makedirs(tdir, exist_ok=True)
    stem = str(res.id)

    if type_name(res.type) == "BITMAP":
        bmp = dib_to_bmp(res.data)
        if bmp and png:
            try:
                im = Image.open(io.BytesIO(bmp))
                im.load()
                out = os.path.join(tdir, stem + ".png")
                im.save(out)
                return out, im.size, im.mode
            except Exception as e:
                pass
        if bmp:
            out = os.path.join(tdir, stem + ".bmp")
            with open(out, "wb") as f:
                f.write(bmp)
            return out, None, None

    ext = {"WAVE": ".wav", "RCDATA": ".bin", "MIDI": ".mid"}.get(type_name(res.type), ".bin")
    out = os.path.join(tdir, stem + ext)
    with open(out, "wb") as f:
        f.write(res.data)
    return out, None, None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modules", nargs="+")
    ap.add_argument("-o", "--outdir", default="extracted")
    ap.add_argument("--list", action="store_true", help="show contents, write nothing")
    args = ap.parse_args()

    for path in args.modules:
        try:
            fmt, resources = extract(path)
        except Exception as e:
            print("%-22s !! %s" % (os.path.basename(path), e))
            continue

        name = os.path.splitext(os.path.basename(path))[0]
        counts = {}
        for r in resources:
            counts[type_name(r.type)] = counts.get(type_name(r.type), 0) + 1
        summary = ", ".join("%s x%d" % kv for kv in sorted(counts.items()))
        print("%-18s %s  %3d resources  %s" % (name, fmt, len(resources), summary))

        if args.list:
            for r in resources:
                print("     %-14s %-24s %8d bytes" % (type_name(r.type), r.id, len(r.data)))
            continue

        dest = os.path.join(args.outdir, name)
        for r in resources:
            try:
                save_resource(r, dest)
            except Exception as e:
                print("     ! %s: %s" % (r.label, e))


if __name__ == "__main__":
    main()
