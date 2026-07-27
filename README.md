# After Dark in the Browser

![Flying Toasters in CSS](img/flying-toasters-css.jpg)

Do you longingly reminisce about the days when flying toasters graced your screen? Do words like "Confetti Factory" and "Daredevil Dan" make your heart skip a beat?

**[See them here!](https://vortitron.github.io/after-dark-css/)**

This started as [Bryan Braun's after-dark-css](https://github.com/bryanbraun/after-dark-css) — After Dark screensavers imitated with nothing but CSS animations and transforms, no images and no JavaScript. Those are all still here.

What's new is a second track: instead of redrawing the screensavers by eye, read the **original artwork out of the modules**.

## The decoded originals

After Dark ships each screensaver as a `.AD` file, which is just a Windows DLL — 16-bit NE for the 3.x and Twisted modules, 32-bit PE for the 4.0 and 10th-anniversary ones. The sprites, palettes, sound effects and the original control-panel settings all live in the resource table, and so does the module's own description of itself.

Most of the artwork is RLE-compressed inside a big-endian container Berkeley Systems carried over from the Mac. Rather than guess at the encoding, the opcode table was read out of the engine itself: `RLESequence::DrawFrame` in `ADXPL510.DLL` dispatches on the low nibble of each byte through a jump table at `CODE:0x431014`. Ten opcodes, transcribed in [`tools/adart.py`](tools/adart.py). The rest — the older modules, Marbles among them — keep plain Windows DIBs instead, which [`tools/adclassic.py`](tools/adclassic.py) unpacks.

Between the two, of the 99 modules here:

| | |
| --- | --- |
| Animated RLE artwork | 38 modules, 21,552 frames, 99.9% decoded |
| Still DIB artwork | 16 modules |
| No artwork — drawn in code | 45 modules |

The results are checked against the real thing: [`tools/adrun.sh`](tools/adrun.sh) boots the actual `AFTERDAR.SCR` engine headless under Wine and Xvfb, so a module can be recorded running and compared frame for frame.

Behaviour is reconstructed rather than decompiled, but from what the module says about itself: its settings, its class exports, its sound effect names and, in the 3.x modules, a description string that spells out what the thing is meant to do. Flying Toasters', for instance, is the song lyric.

See [tools/README.md](tools/README.md) for the whole pipeline.

## Layout

```
index.html          Display Properties, where After Dark for Windows lived
all/*.html          one page per screensaver
all/ad.js           loads decoded artwork and runs the animation loop
all/modules/*.js    what each screensaver actually does
all/art/<module>/   artwork + index.json, from tools/adweb.py or adclassic.py
tools/              extraction, decoding, emulation
AD40/               the original modules
```

Two modules called Marbles turn up, and they are different screensavers. The
one people remember — small marbles dropping through a field of pins and
stacking at the bottom — is `MARBLES2.AD` from 1992. After Dark 4.0 shipped a
new `MARBLES.AD` that just drifts big rendered marbles around. Both are here.

The CSS screensavers are self-contained pages and open straight from disk. The decoded ones fetch their artwork, so they need serving over HTTP — `python3 -m http.server` from the repo root is enough.

## Why?

Just for fun.

## License

* The HTML, CSS and JavaScript is licensed with [The MIT License](https://opensource.org/licenses/MIT).
* The [ChicagoFLF font](https://usemodify.com/fonts/chicago/) is licensed with [The SIL Open Font License](https://scripts.sil.org/ofl).

**The artwork is not mine to license.** The sprites under `all/art/`, everything under `AD40/`, and the images throughout are © Berkeley Systems, Inc. The tools here decode a file format; they don't grant any right to what's inside it. Treat this as preservation and reverse engineering, and use at your own risk — [the original project's take on that is here](https://github.com/bryanbraun/after-dark-css/issues/3#issuecomment-127814083).

## Thanks to

[Bryan Braun](https://github.com/bryanbraun/after-dark-css), whose CSS screensavers this is forked from.

[Jonathon Sampson](https://twitter.com/jonathansampson), [Keith Clark](http://codepen.io/keithclark/), [Rob Glazebrook](http://www.cssnewbie.com/pure-css-bouncing-ball), [Ryan Justice](http://ned.highline.edu/~ryan-j/200/final/) and others for posting tutorials & demos on CSS animations.

[N. Landsteiner](http://www.masswerk.at/flyer/), [David Donarumo](http://www.youtube.com/watch?v=M1w1SQ3ezh8), and [Lazy Game Reviews](http://www.youtube.com/watch?v=ANnYbX54oU4) for online preservation of what the original screensavers looked like.

Robin Casady for the Public Domain [ChicagoFLF](http://christtrekker.users.sourceforge.net/fnt/chicago.shtml) font.

The original screensavers and artwork are © 1989–1998 Berkeley Systems Inc.
