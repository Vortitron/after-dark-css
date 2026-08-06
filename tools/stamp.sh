#!/usr/bin/env bash
# Stamp a build id into build.json / build.js and cache-bust query strings.
# Run before pushing so GitHub Pages visitors can see the tray rev change.
set -euo pipefail
cd "$(dirname "$0")/.."

REV="$(git rev-parse --short HEAD)"
TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LABEL="$(date -u +'%d %b %H:%M UTC')"
V="${REV}-$(date -u +%y%m%d%H%M%S)"

python3 - "$V" "$REV" "$TIME" "$LABEL" <<'PY'
import json, sys, re
from pathlib import Path
v, rev, time, label = sys.argv[1:5]
build = {"rev": rev, "time": time, "label": label, "v": v}
Path("build.json").write_text(json.dumps(build, indent=2) + "\n")
Path("build.js").write_text(
	"/* Auto-stamped by tools/stamp.sh — run that before you push. */\n"
	"window.AFTER_DARK_BUILD = " + json.dumps(build) + ";\n"
)

# Local asset refs that should carry ?v= for GitHub Pages / mobile caches.
ASSET = re.compile(
	r"""(?P<attr>(?:src|href)=["'])"""
	r"""(?P<url>(?:\.\./)?(?:ad\.js|base\.css|modules/[^"'?]+\.js|img/[^"'?]+))"""
	r"""(?:\?[^"']*)?"""
	r"""(?P<end>["'])"""
)

def bust_assets(text):
	def repl(m):
		return m.group("attr") + m.group("url") + "?v=" + v + m.group("end")
	return ASSET.sub(repl, text)

paths = [Path("index.html")] + sorted(Path("all").glob("*.html"))
for path in paths:
	if not path.exists():
		continue
	text = path.read_text()
	new = bust_assets(text)
	# Also rewrite any remaining ?v=… tokens (query strings on iframes etc).
	new = re.sub(r"(\?|&)v=[^\"'&\s]+", lambda m: m.group(1) + "v=" + v, new)
	if path.name == "index.html":
		block = (
			"<!-- ad-build -->\n"
			"  <script>window.AFTER_DARK_BUILD = " + json.dumps(build) + ";</script>\n"
			"  <!-- /ad-build -->"
		)
		if "<!-- ad-build -->" in new:
			new = re.sub(
				r"<!-- ad-build -->.*?<!-- /ad-build -->",
				block,
				new,
				count=1,
				flags=re.S,
			)
	if new != text:
		path.write_text(new)
		print("updated", path)
print("stamped", build)
PY
