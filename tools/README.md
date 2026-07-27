# After Dark pipeline

Four tools that turn the original screensaver modules in `../AD40/` into
something a browser can use. They only need Python 3 + Pillow, except
`adrun.sh`, which needs a 32-bit Wine.

```
AD40/**/*.AD  ──adextract.py──▶  raw resources
              ──adart.py─────▶  decoded sprite sheets (PNG)
              ──adweb.py─────▶  all/art/<module>/  (strips + index.json)
              ──adrun.sh─────▶  the real thing running under Wine (reference)
```

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

## adart.py — artwork

Every module in the library, both formats, stores animation in the same
big-endian container Berkeley Systems carried over from the Mac, compressed
with an RLE whose opcode table is transcribed in the file's docstring — it was
read out of `ADXPL510.DLL`'s jump table at `CODE:0x431014` rather than guessed.

```sh
python3 tools/adart.py 'AD40/AD10th/*.AD' --check      # coverage report
python3 tools/adart.py AD40/AD10th/BUNGEE.AD -o sprites/
```

22,038 frames across 38 modules decode; the sprite sheets match frame-for-frame
against captures of the modules running for real.

## adweb.py — web assets

```sh
python3 tools/adweb.py AD40/AD10th/MARBLES.AD -o all/art/
```

Writes one horizontal strip per animation plus `index.json`. `all/ad.js` loads
that; a per-module behaviour file under `all/modules/` decides what moves.

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
