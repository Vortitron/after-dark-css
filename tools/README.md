# After Dark pipeline

Five tools that turn the original screensaver modules in `../AD40/` into
something a browser can use. They only need Python 3 + Pillow, except
`adrun.sh`, which needs a 32-bit Wine.

```
AD40/**/*.AD  ──adextract.py──▶  raw resources
              ──adart.py─────▶  decoded sprite sheets (PNG)
              ──adweb.py─────▶  all/art/<module>/  (strips + index.json)
              ──adclassic.py─▶  all/art/<module>/  (the 3.x modules, see below)
              ──adrun.sh─────▶  the real thing running under Wine (reference)
```

There are two artwork formats, and which one a module uses does not follow from
whether it is 16-bit or 32-bit. Run both tools and see which bites.

## adextract.py — resources

`.AD` modules are ordinary Windows DLLs: AD 3.x and the Twisted set are 16-bit
NE, AD 4.0 and the 10th-anniversary set are 32-bit PE. This walks both resource
tables.

```sh
python3 tools/adextract.py AD40/AD10th/MARBLES.AD --list
python3 tools/adextract.py 'AD40/AD10th/*.AD' -o extracted/
```

`TYPE_1000` resources hold each module's original control-panel strings, which
is where the option names ("A Few / A Pouch Full / A Jar Full / A Box Full")
come from.

## adart.py — animated artwork

Most modules store animation in a big-endian container Berkeley Systems carried
over from the Mac, compressed with an RLE whose opcode table is transcribed in
the file's docstring — it was read out of `ADXPL510.DLL`'s jump table at
`CODE:0x431014` rather than guessed.

```sh
python3 tools/adart.py 'AD40/AD10th/*.AD' --check      # coverage report
python3 tools/adart.py AD40/AD10th/BUNGEE.AD -o sprites/
```

21,552 frames across 38 modules decode; the sprite sheets match frame-for-frame
against captures of the modules running for real.

One wrinkle worth knowing about: the word at offset 44 of the sequence header
is how many colour depths the sequence ships. 37 sequences, all in 3.x modules,
have **two** — a 256-colour frame and a dithered 16-colour one, interleaved,
with a `CTAB` each. Decoding all of them and colouring the lot from the first
`CTAB` gives an animation that alternates between the right art and a green
mess. Take every *n*th chunk; the first of each group is the deep one.

## adclassic.py — the 3.x still artwork

The older modules mostly skip the RLE container and keep plain Windows DIBs in
resource type `0x7005`, with a directory in type 15 naming them. Marbles is one
of these: one 160x16 bitmap holding ten marbles, a 1-bit mask, and the pin at
three sizes.

```sh
python3 tools/adclassic.py 'AD40/CLASSIC/*.AD' --list
python3 tools/adclassic.py AD40/CLASSIC/MARBLES2.AD -o all/art/marbles2
python3 tools/adclassic.py AD40/AD10th/Aqua.ad -o all/art/aqua --ids 900,1000-1118,1900
```

Which resource type holds the bitmaps is not consistent — `0x7005`, a type
literally named `DIB`, or `MICT`/`QICT`/`SICT` split by size — so the tool
sniffs for the `BM` signature rather than trusting the type.

Transparency comes from the mask where the directory names one (`MMARBLE` masks
`MARBLES`), and otherwise from whichever palette index runs round the edge of
the bitmap. That is index 0 in Marbles and index 15 in Flocks, so assuming
either one leaves half the library with its sprites punched out.

`--ids` is there because several modules ship the same artwork five times over.
Aquatic Realm has 16-colour art, 256-colour art and three bands of masks, 193
bitmaps for 19 creatures; only `1000-1118` is worth exporting.

## adweb.py — web assets

```sh
python3 tools/adweb.py AD40/AD10th/MARBLES.AD -o all/art/
```

Writes one horizontal strip per animation plus `index.json`. `all/ad.js` reads
either tool's `index.json`; a per-module behaviour file under `all/modules/`
decides what moves.

## What is actually in there

Of the 99 distinct modules across `AD40/`, `AD10th/` and `CLASSIC/`:

| | |
| --- | --- |
| Animated RLE artwork | 38 modules |
| Still DIB artwork | 16 modules |
| No artwork at all | 45 modules |

That last group is not a gap in the tools. `WARP`, `SPIRAL`, `MANDELBR`,
`GLOBE`, `GRAVITY`, `STARRYNI` and the rest draw themselves with code, so
porting one means writing the drawing, not extracting it.

Having the artwork is not the same as being able to rebuild the module, and the
line between the two is not where the bitmap count suggests. What decides it is
whether a sprite is a whole thing that moves on its own:

- **Sprite-per-object.** Marbles, Flying Toasters, Flocks, Aquatic Realm, Fish
  Pro, Bugs. Each bitmap is a complete marble or bird or fish, the module's
  settings say how many and how fast, and the rest is motion. These are done.
  Two of them carry their facing in the artwork rather than needing it guessed:
  every Fish Pro species is a broadside cycle followed by the fish rotating
  away until it is edge-on, and the Bugs jewel beetle, ant and fly each ship a
  quarter turn of pre-rendered headings that a mirror in x and y completes.
- **Composed characters.** Swan Lake keeps bodies (`600-608`), necks
  (`300-307`) and water reflections (`700-707`) as separate bitmaps that have
  to be layered at the right offsets. Flying Toilets is a toilet plus a
  detached pair of wings. Bugs' spiders are fifteen frames of one jointed leg
  at the end of `4000` and `6000`, with no body anywhere. The offsets are in
  the code, not the resources.
- **Staged scenes.** Confetti Factory has ducks, gears, conveyor belts and two
  wall styles but no picture of the factory. Bad Dog needs a desktop, Rat Race
  a track, Bungee Roulette a bridge and a cord. The layout was drawn in code
  and is simply not recoverable from the resource table.

The second and third groups are still portable, but by watching the original
run and rebuilding the staging by eye — which is what `adrun.sh` is for, and
which is blocked for 16-bit modules by the painting problem below.

## adrun.sh — running the originals

Runs `AFTERDAR.SCR` headless under Xvfb, so we can see how a module is actually
meant to look. Needs `AD_SANDBOX` set to a directory holding `wine32/root` (an
unpacked 32-bit Wine) and `wineprefix`.

```sh
export AD_SANDBOX=/path/to/sandbox
tools/adrun.sh setup                    # stage AD40/ into the wine prefix
tools/adrun.sh list
tools/adrun.sh shot AD10th MARBLES      # one png
tools/adrun.sh clip AD10th MARBLES 20   # 20s mp4
tools/adrun.sh all                      # everything
```

Module choice and each module's own settings live in the registry; see the
comment at the top of the script. Two things to know:

- The engine only enables its 16-bit module loader when `GetVersionExA` reports
  a 9x platform, so the prefix has to claim Windows 98 for NE modules — and the
  PE modules render blank under that setting. The script picks per module.
- 16-bit modules currently load but barely paint, with Wine complaining
  `K32WOWHandle16 handle ... has non-zero HIWORD`. Their artwork still extracts
  perfectly, so this only affects reference capture.
