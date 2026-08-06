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

Behaviour is reconstructed rather than decompiled, but from what the module says about itself: its settings, its class exports, its sound effect names and, in the 3.x modules, a description string that spells out what the thing is meant to do. Flocks names the Reynolds paper it implements; Flying Toasters' is the song lyric.

Having the artwork is not the same as being able to rebuild the module, though. Where each bitmap is a whole thing that moves on its own — a marble, a toaster, a gull, a fish — the module's settings supply the rest and it goes quickly. Where the sprites are parts that the original code composed into a character or a scene, the layout was never in the resource table, and rebuilding it means watching the original run. See [tools/README.md](tools/README.md#what-is-actually-in-there).

See [tools/README.md](tools/README.md) for the whole pipeline.

## Layout

```
index.html          Display Properties, where After Dark for Windows lived
all/*.html          one page per screensaver
all/ad.js           loads decoded artwork and runs the animation loop
all/modules/*.js    what each screensaver actually does
all/art/<module>/   artwork + index.json, from tools/adweb.py or adclassic.py
tools/              extraction, decoding, emulation
AD40/               the original modules (local only — gitignored so GitHub Pages
                    does not try to publish ~80 MB of binaries and time out)
```

Two modules called Marbles turn up, and they are different screensavers. The
one people remember — small marbles dropping through a field of pins and
stacking at the bottom — is `MARBLES2.AD` from 1992. After Dark 4.0 shipped a
new `MARBLES.AD` named **Marbles!** that just drifts big rendered marbles
around. Both are here. There is also a tilt variant of the 1992 one
(`marbles-tilt.html`) that uses the device accelerometer so marbles fall toward
true down when you rotate the phone and the pile sloshes instead of snapping
onto a lattice.

The CSS screensavers are self-contained pages and open straight from disk. The decoded ones fetch their artwork, so they need serving over HTTP — `python3 -m http.server` from the repo root is enough.

Before pushing to GitHub Pages, the build stamp in the taskbar needs a bump so
phones drop their cache. You do not have to run that by hand: once, run

```
tools/install-hooks.sh
```

and every `git commit` will stamp `build.json` / `?v=…` cache-busters for you.
`tools/stamp.sh` is still there if you want to stamp without committing.

## Embedding one

Every screensaver here is a page in its own right, so the way that works anywhere is an iframe:

```html
<iframe src="https://vortitron.github.io/after-dark-css/all/marbles.html"
        width="640" height="480" scrolling="no" style="border:0"
        title="Marbles screen saver"></iframe>
```

The decoded ones are also custom elements, so if you are hosting the files yourself you can drop one straight into a page and set it with the original module's own options:

```html
<script src="all/ad.js"></script>
<script src="all/modules/marbles.js"></script>

<after-dark-marbles art="all/art/marbles2" pins="many" pin-size="medium" speed="medium"
  style="display:block;width:640px;height:480px"></after-dark-marbles>
```

`art` points at the folder `adweb.py`/`adclassic.py` wrote, and the element fills whatever box you give it. The rest are:

| Element | Script | Options |
| --- | --- | --- |
| `<after-dark-toasters>` | `modules/toasters.js` | `objects` = squadron / air wing / swarm |
| `<after-dark-marbles>` | `modules/marbles.js` | `pins` = none / few / many / lots, `pin-size` = x-small / medium / big, `speed` = slow / medium / fast |
| `<after-dark-marbles-tilt>` | `modules/marbles-tilt.js` | same options as marbles; gravity follows DeviceOrientation (tap to enable on iOS). Embed with `allow="accelerometer; gyroscope"` on the iframe |
| `<after-dark-flocks>` | `modules/flocks.js` | `kind` = birds / polliwogs / gnats / paparazzi / atoms / copters / dots, `size` = small / medium / large |
| `<after-dark-aqua>` | `modules/aqua.js` | `creatures` and `seaweed` are counts, `sea-floor` is a flag |
| `<after-dark-marbles-40>` | `modules/marbles-40.js` | `count` = a few / a pouch full / a jar full / a box full, `pattern` |
| `<after-dark-fishpro>` | `modules/fishpro.js` | `fish` = solo / study group / class / school / university, `sea-floor` = none / static / animated, `select-fish` = a comma-separated list of species |
| `<after-dark-bugs>` | `modules/bugs.js` | `density` = nest / colony / infestation / swarm / plague / new york, `type` = scarab / jewel / roaches / ants / ladybugs / flys / all, `clear-screen="no"` to let the page show through |
| `<after-dark-cham>` | `modules/cham.js` | `quantity` = few / some / more / some more / lots, `zest` = laconic / perky / frisky / hyper, `vomiter` = none / upset tummy / nauseous / sick / poisoned / vomitorium |
| `<after-dark-toxic>` | `modules/toxic.js` | `critters` = depopulated / lonely / fruitful / swarming / festering, `lung-capacity` = thimble / cup / quart / gallon / barrel, `fish-only` and `swamp-floor` are flags |
| `<after-dark-phlegm>` | `modules/phlegm.js` | `behavior` = pesky / unruly / ill-mannered / horrid / atrocious / kill it!!!, `mess` = unkempt / besmirched / disquieting / nauseous / disgusting / art form / are you crazy?!, `clear-screen="no"` to let the page show through |
| `<after-dark-guernsey>` | `modules/guernsey.js` | `flavor` = vanilla / chocolate / strawberry / blueberry / grape / banana / lemon-lime / rainbow splash / bubble gum / cinnamon / mint / tutti-frutti |
| `<after-dark-bungee>` | `modules/bungee.js` | `jumper` = daredevil / cow / fish / random, `jumps` = one / few / many / droves / whole bunches / hundreds, `equipment` = safe / reliable / used / so - so / purfikt |

The option names are the module's own, read out of its `TYPE_1000` control-panel strings.

Every option also works as a query string, so a saver page is linkable with its settings set and no copy of the files needed:

```
all/marbles.html?pins=lots&pin-size=big&speed=fast
all/bungee.html?jumper=cow&equipment=purfikt&jumps=droves
```

The front page has a **Settings…** button that puts each module's own control panel back — the same options, in the module's own words — and applies them to the preview. **Embed…** then writes out the snippet with whatever is selected.

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
